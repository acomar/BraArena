#!/bin/sh
set -eu
cd /opt/braarena
exec 9>.deploy.lock
flock 9
sha="${1:?Missing release SHA}"
actor="${2:-}"
case "$sha" in *[!a-f0-9]*|'') exit 2;; esac
[ "${#sha}" -eq 40 ] || exit 2
umask 077
previous=$(cat .release-sha 2>/dev/null || true)
export RELEASE_SHA="$sha"
if [ -n "$actor" ]; then
  DOCKER_CONFIG=$(mktemp -d)
  export DOCKER_CONFIG
  trap 'rm -rf "$DOCKER_CONFIG"' EXIT
  docker login ghcr.io -u "$actor" --password-stdin
  docker compose -f compose.production.yml pull api web
fi
if [ -n "$previous" ]; then ./backup.sh; fi
if docker compose -f compose.production.yml up -d --no-build --wait --wait-timeout 100 &&
   curl -fsS --max-time 10 "$(cat .public-url)/health" >/dev/null; then
  echo "$sha" > .release-sha.next
  mv .release-sha.next .release-sha
  if [ -n "$previous" ] && [ "$previous" != "$sha" ]; then echo "$previous" > .previous-sha; fi
else
  if [ -n "$previous" ]; then
    RELEASE_SHA="$previous" docker compose -f compose.production.yml up -d --no-build --wait
  fi
  exit 1
fi
