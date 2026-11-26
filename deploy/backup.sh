#!/bin/sh
set -eu
cd /opt/braarena
export RELEASE_SHA="$(cat .release-sha)"
umask 077
mkdir -p backups
tmp=$(mktemp backups/.backup.XXXXXX)
trap 'rm -f "$tmp"' EXIT
docker compose -f compose.production.yml exec -T db pg_dump -U interview -d interview -Fc > "$tmp"
docker compose -f compose.production.yml exec -T db pg_restore -l < "$tmp" >/dev/null
mv "$tmp" "backups/braarena-$(date -u +%Y%m%dT%H%M%SZ).dump"
find backups -name 'braarena-*.dump' -type f -mtime +7 -delete
