#!/bin/sh
set -e
# Dokploy rebuilds re-apply only Dokploy-stored env and drop ad-hoc --env-add
# secrets. Pull SESSION_SECRET + INTERNAL_BACKEND_SECRET from Mongo so login
# still works after every roll. stdout is POSIX exports; values never logged.
if [ -f scripts/hydrate-runtime-secrets.mjs ]; then
  _hydrated="$(node scripts/hydrate-runtime-secrets.mjs)" || _hydrated=""
  # Only eval POSIX export lines (ignore driver noise on stdout).
  _exports="$(printf '%s\n' "$_hydrated" | grep '^export ' || true)"
  if [ -n "$_exports" ]; then
    eval "$_exports"
  fi
fi
# Same image as the Next.js frontend. Set COURSE_WORKER=1 on a 1-replica
# Swarm/Compose service so generation never shares the web process.
if [ "${COURSE_WORKER:-}" = "1" ]; then
  # tsx does not set NODE_ENV; without it backend.ts called localhost:8001 (fetch failed).
  export NODE_ENV="${NODE_ENV:-production}"
  export INTERNAL_BACKEND_URL="${INTERNAL_BACKEND_URL:-http://codespectra-backend-cd7lq6:8000}"
  # ponytail: NO tsx flags needed — backend.ts lazy-imports langfuse (the
  # only static `import 'server-only'` in the worker graph), so the marker
  # package is never resolved at startup. Verified: --conditions=react-server
  # does NOT fix tsx CJS require resolution; lazy import does.
  exec npx tsx scripts/course-video-worker.ts
fi
exec "$@"
