#!/bin/sh
# One image, two roles. The frontend answers /api/health on $PORT; the course
# worker (COURSE_WORKER=1, Dockerfile CMD replaced by the entrypoint) runs no
# HTTP server at all. Pinging :80 in the worker therefore failed every probe,
# and Swarm killed each worker task 60s after start ("dockerexec: unhealthy
# container", exit 143) — which took the whole fleet down on 2026-11-09.
if [ "${COURSE_WORKER:-}" = "1" ]; then
  # Liveness of the process, not of the work: a wedged render is caught by the
  # heartbeat/orphan sweep in lib/courses/process-job, which is the layer that
  # knows what "making progress" means. grep over /proc works in busybox and
  # needs no tools the runtime image might drop.
  grep -aq 'course-video-worker' /proc/*/cmdline 2>/dev/null
  exit $?
fi

wget -q -O- "http://127.0.0.1:${PORT:-80}/api/health" >/dev/null 2>&1
