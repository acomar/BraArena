#!/bin/sh
set -eu
cd /opt/braarena
sha="${1:?Missing release SHA}"
actor="${2:?Missing GitHub actor}"
case "$sha" in *[!a-f0-9]*) exit 2;; esac
[ "${#sha}" -eq 40 ] || exit 2
case "$actor" in *[!a-zA-Z0-9_-]*) exit 2;; esac
test -f .env || { echo "Missing /opt/braarena/.env"; exit 1; }
umask 077
docker_config="$(mktemp -d)"
export DOCKER_CONFIG="$docker_config"
trap 'rm -rf "$docker_config"' EXIT
printf '%s\n' '{"auths":{"ghcr.io":{}}}' > "$DOCKER_CONFIG/config.json"
docker login ghcr.io -u "$actor" --password-stdin
export RELEASE_SHA="$sha"
docker compose -f compose.production.yml pull api web
docker compose -f compose.production.yml up -d --no-build --remove-orphans
docker compose -f compose.production.yml ps
printf '%s\n' "$sha" > .release-sha
