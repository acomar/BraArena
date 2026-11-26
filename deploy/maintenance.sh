#!/bin/sh
set -eu
cd /opt/braarena
exec 9>.deploy.lock
flock -n 9 || exit 0
TLS_CERT=$(sed -n 's/^TLS_CERT=//p' .env)
BRAARENA_IP=$(sed -n 's/^BRAARENA_IP=//p' .env)
BRAARENA_PORT=$(sed -n 's/^BRAARENA_PORT=//p' .env)
export RELEASE_SHA="$(cat .release-sha)"
expected=$(openssl x509 -in "$TLS_CERT" -noout -fingerprint -sha256)
actual=$(openssl s_client -connect "$BRAARENA_IP:${BRAARENA_PORT:-8443}" </dev/null 2>/dev/null | openssl x509 -noout -fingerprint -sha256)
if [ "$expected" != "$actual" ]; then
  docker compose -f compose.production.yml up -d --no-deps --force-recreate --wait web
fi
if [ -s openai.key ]; then
  # Install a project-specific key atomically. Never print it.
  python3 - <<'PY'
import os,pathlib
base=pathlib.Path('.env')
secret=pathlib.Path('openai.key').read_text().strip()
if not secret.startswith('sk-') or not all(c.isalnum() or c in '-_.' for c in secret):
    raise SystemExit('Invalid OpenAI project key format')
values=base.read_text().splitlines()
updated=[v for v in values if not v.startswith('OPENAI_API_KEY=')]+['OPENAI_API_KEY='+secret]
tmp=pathlib.Path('.env.next')
with os.fdopen(os.open(tmp,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600),'w') as f:
    f.write('\n'.join(updated)+'\n')
tmp.replace(base)
PY
  unset OPENAI_API_KEY
  docker compose -f compose.production.yml up -d --wait api web
  rm -f openai.key
fi
