# Changelog

> Per-session journal. Append new entries at the top.

---

## 2026-07-25 — Session 2: Last Login Badge + .ai Brain Setup

**Work done**:
- Created `.ai/` project brain (replaced `.kilo/`)
- Implemented "last used" badge on login page:
  - `auth-context.tsx`: exports `getLastLogin()` + `setLastLogin()` using `localStorage` key `cs_last_login`
  - `login/page.tsx`: shows badge above email field — "Last login: Google · 2h ago"
  - Badge includes method icon (Google/GitHub SVG or email emoji) + relative timestamp
- `.kilo/` deleted — its ponytail rules merged into `.ai/coding-style.md`
- Dev-fixes and main now in sync (PR #81 merged)

**Files changed**: `auth-context.tsx`, `app/auth/login/page.tsx`, `.ai/` (new)

**Next**: Push to `dev-fixes`, build Interview Agent desktop app

---

## 2026-07-25 — Session 1: Secrets Reveal Fix

**Work done**:
- Added `/api/admin/server-secrets/reveal` endpoint — returns unmasked secret value for a given key
- Added `/api/admin/llm-config/reveal` endpoint — returns unmasked LLM API key
- Fixed `settings/page.tsx`:
  - Replaced `toggleVisible` with `handleRevealToggle` that fetches real value from `/reveal`
  - Removed buggy masked-value pre-population (lines that set `mailSecretsDraft.resend_api_key = secretsMeta.resend_api_key_masked`)
  - All secret inputs now show `''` when hidden, real value when revealed
  - 30-second auto-hide timer per field
  - Proper cleanup of timers on unmount
- Fixed `cloudflare-section.tsx`: reveal fetches real token
- Fixed `llm-section.tsx`: reveal fetches real API key
- Mobile settings page: no secret reveals — no changes needed

**TypeScript**: Clean (only pre-existing e2e-tests error)

**Next action**: Push to `dev-fixes`, merge PR #80