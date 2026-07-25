# AI Project Brain

Every AI working on this project should read `active-tasks.md` and `changelog.md` at the start of a session.

## File Guide

| File | When to Read |
|---|---|
| `project-memory.md` | First time on project, or when lost |
| `active-tasks.md` | Start of every session |
| `changelog.md` | Start of every session (latest entries) |
| `decisions.md` | Before touching auth, payments, or API integration code |
| `coding-style.md` | Before writing new components or API routes |
| `lessons.md` | When fixing bugs or debugging |

## How to Update

After every working session, append a new entry to `changelog.md` and update `active-tasks.md`:
- What was completed
- What was broken and how it was fixed
- What still needs doing
- Files changed

If you made a decision that future AIs should know about, add it to `decisions.md`.

If you hit a bug and fixed it, add it to `lessons.md`.

## Rules

1. **Always read `active-tasks.md` first** — it tells you what the human wants right now
2. **Update brain before ending** — if you don't record it, it didn't happen
3. **Be concise** — brain files are reference, not documentation. 10 lines > 100 lines.
4. **One entry per session** in `changelog.md`. Append at top.
5. **Decisions need reasoning** — "why" matters more than "what"

## Anti-patterns

- DON'T dump entire conversation logs into brain files
- DON'T write essays — use bullet points
- DON'T update brain mid-session unless something significant changed
- DON'T trust stale memories — if `active-tasks.md` says something is done but you find it's not, flag it