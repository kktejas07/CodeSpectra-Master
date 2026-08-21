#!/bin/sh
set -e
# Same image as the Next.js frontend. Set COURSE_WORKER=1 on a 1-replica
# Swarm/Compose service so generation never shares the web process.
if [ "${COURSE_WORKER:-}" = "1" ]; then
  exec npx tsx scripts/course-video-worker.ts
fi
exec "$@"
