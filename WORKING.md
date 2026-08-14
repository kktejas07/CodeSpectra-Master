# WORKING.md — Multi-Session Coordination Ledger

> **Every agent session (opencode, claude, cursor) MUST read this file at the
> start of each task and update it when claiming/releasing work.**
> Protocol rules live in `AGENTS.md` → "Multi-Session Coordination".

## Current Claims

| Session | Task / Area | Files claimed | Status | Last updated |
|---|---|---|---|---|
| opencode (port 49847) | Redis/rate-limiting wiring (v0.22.7) | backend/core/dependencies.py, backend/routers/ai.py, frontend/lib/upstash-rate-limit.ts, frontend/components/dashboard/settings/redis-section.tsx, frontend/app/api/admin/redis/ | DONE — idle since ~21:54; being committed | 2026-08-13 ~22:02 |
| opencode (this session) | Reconciling & committing port-49847 session's v0.22.7 work + proctoring/WhatsApp fixes | (all files in the batch) | IN PROGRESS — committing | 2026-08-13 ~22:02 |

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
| 2026-08-13 | opencode (this session) | Newsletter preview overflow fix — `ab6aadf` + docs `c1830f2`, deployed & verified. |
| 2026-08-14 | opencode | OpenWA v0.18 WhatsApp fix + test connection — `31fb6a7` + docs `a7bf80e`. |
