"""Install only the tested branch head from the canonical public repository."""
import fcntl
import hashlib
import json
import os
import re
import subprocess
import tempfile
import urllib.request
from pathlib import Path

BASE = 'https://api.github.com/repos/acomar/BraArena'
BRANCH = 'feat/ai-interview-poc'

def api(path):
    with urllib.request.urlopen(urllib.request.Request(BASE+path,headers={'User-Agent':'BraArena-release'}),timeout=20) as r:
        return json.load(r)

def main():
    os.chdir('/opt/braarena')
    with open('.pull.lock','w') as lock:
        try:
            fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:
            return
        sha=api('/git/ref/heads/'+BRANCH)['object']['sha']
        if not re.fullmatch('[a-f0-9]{40}',sha):
            raise ValueError('invalid ref')
        if Path('.release-sha').read_text().strip()==sha or Path('.hold-release').exists():
            return
        runs=api('/actions/runs?branch=feat%2Fai-interview-poc&head_sha='+sha+'&per_page=5')['workflow_runs']
        matched = [r for r in runs if r['path']=='.github/workflows/braarena-deploy.yml' and
                   r['head_sha']==sha and r['event'] in ('push','workflow_dispatch') and
                   r['head_repository']['id']==1421282200 and r['status'] in ('completed','in_progress')]
        def published(run):
            jobs=api('/actions/runs/'+str(int(run['id']))+'/jobs')['jobs']
            return all(any(j['name']==name and j['conclusion']=='success' for j in jobs) for name in ('verify','publish'))
        if not any(published(r) for r in matched):
            return
        release=api('/releases/tags/poc-'+sha)
        asset=next(a for a in release['assets'] if a['name']=='braarena-images.tar.gz')
        expected=asset['digest']
        if not re.fullmatch(r'sha256:[a-f0-9]{64}',expected or ''):
            raise ValueError('Missing GitHub asset digest')
        url='https://github.com/acomar/BraArena/releases/download/poc-'+sha+'/braarena-images.tar.gz'
        if asset['browser_download_url']!=url or asset['size']>350_000_000:
            raise ValueError('Invalid release asset')
        with tempfile.TemporaryFile() as f, urllib.request.urlopen(url,timeout=90) as stream:
            h=hashlib.sha256()
            while True:
                chunk=stream.read(1<<20)
                if not chunk:
                    break
                h.update(chunk)
                f.write(chunk)
                if f.tell()>asset['size']:
                    raise ValueError('Asset size mismatch')
            if f.tell()!=asset['size'] or 'sha256:'+h.hexdigest()!=expected:
                raise ValueError('Asset integrity mismatch')
            f.seek(0)
            subprocess.run(['docker','load'],stdin=f,check=True)
        for component in ('api','web'):
            image='braarena-'+component
            subprocess.run(['docker','tag',image+':development','ghcr.io/acomar/'+image+':'+sha],check=True)
        subprocess.run(['sh','deploy-remote.sh',sha],check=True)

if __name__=='__main__':
    main()
