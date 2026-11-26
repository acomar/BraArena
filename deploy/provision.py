"""Initialize a dedicated installation on the existing VPS, from this checkout."""
import os
from pathlib import Path
import secrets
import shutil

dst=Path('/opt/braarena')
dst.mkdir(mode=0o700,exist_ok=True)
src=Path(__file__).resolve().parent
for file in ('listen-tls.conf','compose.production.yml','deploy-remote.sh','backup.sh','maintenance.sh','pull-release.py'):
    shutil.copy2(src/file,dst/file)
env=dst/'.env'
if not env.exists():
    ip='191.252.92.181'
    cert_dir=Path('/opt/eventstorm-studio/ip-access/certificates/live')/ip
    if not all((cert_dir/k).is_file() for k in ('fullchain.pem','privkey.pem')):
        raise SystemExit('Configure certificate paths for this VPS')
    values={'POSTGRES_PASSWORD':secrets.token_hex(32),'ADMIN_TOKEN':secrets.token_urlsafe(36),'OPENAI_API_KEY':'',
            'BRAARENA_IP':ip,'BRAARENA_PORT':'8443','TLS_CERT':str(cert_dir/'fullchain.pem'),
            'TLS_KEY':str(cert_dir/'privkey.pem'),'USD_BRL':'5.8825','USD_BRL_DATE':'2026-11-25','RECORDING_DAYS':'30'}
    with os.fdopen(os.open(env,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600),'w') as f:
        for key,value in values.items():
            f.write(key+'='+value+'\n')
    with os.fdopen(os.open(dst/'admin-token',os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600),'w') as f:
        f.write(values['ADMIN_TOKEN']+'\n')
    (dst/'.public-url').write_text('https://'+ip+':8443\n')
