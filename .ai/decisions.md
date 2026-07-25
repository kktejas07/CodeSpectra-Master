# Decisions

> Why we chose X over Y. Read before making related changes.

---

## Cloudflare Analytics: GraphQL over REST (2026-07-25)

**Decision**: Use Cloudflare GraphQL API (`/client/v4/graphql`) instead of Zone Analytics REST API.

**Why**: Cloudflare sunset the Zone Analytics REST API (returns error `1015: "Zone Analytics API is sunset and replaced by GraphQL API"`).

**Query**: 3-day window, single timestamp reference for both `since`/`until` to avoid 1ms overage into 4th day. No `orderBy` (rejected by Cloudflare).

**File**: `frontend/app/api/admin/cloudflare-analytics/route.ts`

---

## Secrets Storage: MongoDB over Env Vars (2026-07-21)

**Decision**: Store all API keys/secrets in MongoDB `platform_settings` collection, not environment variables.

**Why**: Allows admin UI to manage secrets without redeployment. Secrets changeable at runtime.

**Caveat**: Ensure `MONGODB_URI` env var is properly secured on server.

---

## Secrets Masking Pattern (2026-07-21)

**Decision**: GET returns masked values, PATCH ignores masked input, reveal endpoint for real values.

**Why**:
- UI never displays real secrets on page load (security)
- PATCH handler uses `isMaskedSecret()` guard to prevent dot-masks from overwriting real values
- Reveal endpoint requires superadmin auth and returns raw value

**Pattern for new secret fields**:
1. Add to `SECRET_FIELDS` array in `route.ts`
2. Input uses `type={visible ? 'text' : 'password'}` with `value={visible ? revealedValue : ''}`
3. Eye button calls `handleRevealToggle('key_name')` which fetches from `/reveal?key=key_name`
4. Auto-hide after 30s via `setTimeout`

---

## LLM Config Storage (2026-07-21)

**Decision**: LLM config (provider, model, endpoint, api_key) stored in `platform_settings` with `key: 'llm'` — separate from server secrets.

**Why**: LLM config changes frequently (model upgrades, endpoint changes), needs its own API route `/api/admin/llm-config` with test/refresh capabilities that secrets route doesn't have.

---

## RBAC Auto-Generation (2026-07-20)

**Decision**: `rbac.ts` pages arrays are auto-generated from `page-permissions.ts`. Do NOT edit `rbac.ts` manually.

**Why**: Single source of truth in `page-permissions.ts`. Running `yarn build` validates TypeScript consistency.

---

## Email Templates in Settings (2026-07-24)

**Decision**: All 13 transactional email templates shown in settings page email templates section.

**Why**: Previously only 9 were shown — `loginNotification`, `phonePePaymentSuccess`, `phonePePaymentFailed`, and `hackathonResultsReleased` were missing from the template list.

**File**: `frontend/lib/email-templates.ts`

---

## Mobile Proctor Fullscreen Skip (2026-07-24)

**Decision**: Skip `requestFullscreen()` on mobile browsers. Hide proctor badge on mobile.

**Why**: Mobile browsers block fullscreen API requests initiated by scripts. User must manually tap to go fullscreen.

**Detection**: `Mobi|Android|iPhone|iPad|iPod` UA match OR `pointer:coarse` media query.

**Files**: `frontend/components/ai/proctor-monitor.tsx`