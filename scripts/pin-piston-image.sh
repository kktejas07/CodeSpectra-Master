#!/usr/bin/env bash
# SEC-023: resolve the current digest of the Piston image and pin it in .env.
# Usage: scripts/pin-piston-image.sh [image-ref] [env-file]
#   image-ref defaults to ghcr.io/engineer-man/piston:latest
#   env-file  defaults to ./.env (the file docker compose reads)
# Review upstream changes before re-pinning — the point is that a new image is
# only ever used on purpose.
set -euo pipefail
REF="${1:-ghcr.io/engineer-man/piston:latest}"
ENV_FILE="${2:-.env}"
REPO="${REF%%[:@]*}"

DIGEST="$(docker buildx imagetools inspect "$REF" --format '{{json .Manifest}}' 2>/dev/null \
  | sed -n 's/.*"digest":"\(sha256:[0-9a-f]\{64\}\)".*/\1/p' | head -n1 || true)"
if [ -z "$DIGEST" ]; then
  docker pull -q "$REF" >/dev/null
  DIGEST="$(docker image inspect --format '{{index .RepoDigests 0}}' "$REF" | sed -n 's/.*@\(sha256:[0-9a-f]\{64\}\)$/\1/p')"
fi
if ! printf '%s' "$DIGEST" | grep -Eq '^sha256:[0-9a-f]{64}$'; then
  echo "Could not resolve a digest for $REF" >&2
  exit 1
fi

PINNED="${REPO}@${DIGEST}"
touch "$ENV_FILE"
if grep -q '^PISTON_IMAGE=' "$ENV_FILE"; then
  sed -i.bak "s#^PISTON_IMAGE=.*#PISTON_IMAGE=${PINNED}#" "$ENV_FILE" && rm -f "${ENV_FILE}.bak"
else
  printf '\nPISTON_IMAGE=%s\n' "$PINNED" >> "$ENV_FILE"
fi
echo "PISTON_IMAGE=${PINNED} written to ${ENV_FILE}"
