#!/bin/sh
set -e
# Same image as the Next.js frontend. Set COURSE_WORKER=1 on a 1-replica
# Swarm/Compose service so generation never shares the web process.
if [ "${COURSE_WORKER:-}" = "1" ]; then
  # tsx does not set NODE_ENV; without it backend.ts called localhost:8001 (fetch failed).
  export NODE_ENV="${NODE_ENV:-production}"
  export INTERNAL_BACKEND_URL="${INTERNAL_BACKEND_URL:-http://codespectra-backend-cd7lq6:8000}"
  exec npx tsx scripts/course-video-worker.ts
fi
exec "$@"
