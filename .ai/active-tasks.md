# Active Tasks

> What we're working on right now. Updated after every session.

---

## ✅ Completed (This Session)

### Secrets Reveal Fix (2026-07-25)
**Status**: Done, merged via PR #80
**What was wrong**: Inputs pre-populated with masked values; eye toggle only changed input type, value stayed as dots.
**Files**: `route.ts` (reveal endpoint), `settings/page.tsx`, `cloudflare-section.tsx`, `llm-section.tsx`

### Last Login Badge on Login Page (2026-07-25)
**Status**: Done
**What it does**: Shows "Last login: Google · 2h ago" above the email field on login page.
**How it works**:
- `auth-context.tsx`: `setLastLogin('email'|'google'|'github')` called on each successful OAuth/email sign-in, stored in `localStorage` key `cs_last_login`
- `login/page.tsx`: reads `getLastLogin()` on mount, displays badge with icon + relative time
- Auto-hides if no previous login recorded

---

## 📋 Next Steps

- [ ] Build Interview Agent desktop app