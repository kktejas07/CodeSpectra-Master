# WORKING.md — Multi-Session Coordination Ledger

> **Every agent session (opencode, claude, cursor) MUST read this file at the
> start of each task and update it when claiming/releasing work.**
> Protocol rules live in `AGENTS.md` → "Multi-Session Coordination".

## Current Claims

| Session | Task / Area | Files claimed | Status | Last updated |
|---|---|---|---|---|
| opencode (port 49847) | Redis/rate-limiting wiring (v0.22.7) | backend/core/dependencies.py, backend/routers/ai.py, frontend/lib/upstash-rate-limit.ts, frontend/components/dashboard/settings/redis-section.tsx, frontend/app/api/admin/redis/ | DONE — committed `4a12d61` | 2026-08-13 ~22:05 |
| opencode (this session) | Deploying v0.22.7 batch to prod (frontend + backend) | server repos (rsync — server git tokens expired) | DONE — frontend + backend rebuilt, services converged, verified | 2026-08-13 ~22:25 |
| opencode (this session) | v0.22.10 → Newsletter image compression (canvas, auto on paste) + HTML size badge + F6 release-scores WhatsApp dedup via notify() | frontend/components/ui/rich-text-editor.tsx, frontend/app/dashboard/admin/newsletter/page.tsx, frontend/app/api/newsletter/admin/send-test/route.ts, frontend/lib/notifications.ts, frontend/app/api/admin/exams/[id]/release-scores/route.ts | DONE — committed | 2026-08-14 ~00:10 |
| opencode (this session) | v0.22.8/v0.22.9 → Redis hardening: backend rate-limit fix + Redis-backed route limiters + scheduler lock (caches/edge SKIPPED — see AGENTS.md) | backend/core/dependencies.py, backend/services/ai.py, backend/routers/ai.py, frontend/lib/upstash-rate-limit.ts, frontend/lib/scheduler.ts, frontend/app/api/** (20 route callers), docs/devops/02-Docker-Architecture.md | DONE — committed `235d727` (v0.22.9), `yarn build` clean | 2026-08-13 ~23:40 |

## Rules (see AGENTS.md for full text)

1. **Claim before you touch**: add a row here with session ID, task, and file list BEFORE editing.
2. **Check before you start**: read this file + `git status` + `git log --oneline -5`.
3. **Commit small and often** — uncommitted edits are invisible to other sessions and cause collisions.
4. **Never `git checkout`/`git stash`/revert files owned by another session's claim** without confirming they're done.
5. **Update the ledger** when you finish or abandon a claim.
6. **One writer per file at a time** — if a file is claimed by another session, use `/freeze` or wait.

## Session Identification

- This repo has multiple live sessions (opencode, claude-code, cursor). Identify yourself by port (opencode `--port N`) or process PID in the Session column.

## Done / History

| Date | Session | What was done |
|---|---|---|
| 2026-08-14 | opencode | F2+F3 review-finding fixes committed & pushed (`87777d6`): `routers/ai.py` rate limiting delegates to shared `check_rate_limit`; exam submit route reuses exported `isIpInCidr` (also fixes latent exact-match blocklist bug). `yarn tsc` clean, backend import verified. NOT yet deployed. |
| 2026-08-14 | opencode (this session) | Committed v0.22.9 (`235d727`): Redis-backed route rate limiting across 20 API routes + distributed scheduler lock (`SET NX EX`, TTL 300s) + Redis ops-hardening docs. `yarn build` clean. |
| 2026-08-13 | opencode (this session) | Deployed v0.22.7 to prod: frontend + backend images rebuilt & rolled (`:latest`), verified newsletter/system 200, redis/status 401 unauth, backend `ensure_redis_client` live. Note: server GitHub tokens expired — deploy used rsync of changed files. |
| 2026-08-13 | opencode (this session) | Committed & pushed port-49847 session's Redis/rate-limit work as `4a12d61` (v0.22.7). |
| 2026-08-13 | opencode (this session) | Newsletter preview overflow fix — `ab6aadf` + docs `c1830f2`, deployed & verified. |
| 2026-08-14 | opencode | OpenWA v0.18 WhatsApp fix + test connection — `31fb6a7` + docs `a7bf80e`. |
