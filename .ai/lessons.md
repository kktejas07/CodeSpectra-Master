# Lessons Learned

> Bugs we fixed so we don't fix them again.

---

## Secret inputs pre-populated with masked values (2026-07-25)

**Bug**: Settings page inputs for API keys showed masked values like `cfut_••••••••` as the actual input value. Eye toggle only changed `type="password"` → `type="text"` but the value was already dots — so reveal showed dots.

**Root cause**: On load, `mailSecretsDraft` and `secretsDraft` were pre-populated with `_masked` values:
```ts
if (secretsMeta.resend_api_key_masked) next.resend_api_key = String(secretsMeta.resend_api_key_masked)
```

**Fix**: Remove masked pre-population. Use `revealedValues` state for revealed values only. Input shows `''` when not revealed, and `revealedValues[key]` when revealed.

---

## Cloudflare Zone Analytics REST API sunset (2026-07-25)

**Bug**: Cloudflare Analytics page returned error `1015: "Zone Analytics API is sunset and replaced by GraphQL API"`.

**Root cause**: Cloudflare deprecated their Zone Analytics REST API.

**Fix**: Switched to GraphQL API at `/client/v4/graphql`. Key lessons:
- Don't assume REST APIs are permanent — check for deprecation notices
- GraphQL query must NOT include `orderBy` (rejected by Cloudflare)
- Use single timestamp reference for both `since` and `until` to avoid 1ms overage

---

## MongoDB `platform_settings` missing document (2026-07-25)

**Bug**: `cloudflare_zone_id` and `cloudflare_api_token` were not being saved. No error was shown but values didn't persist.

**Root cause**: The `platform_settings` collection document with `key: "secrets"` was missing entirely — `insertOne` was being used but failed silently or was never called with correct data.

**Fix**: Ran `insertOne` directly to create the document with `cloudflare_zone_id` and `cloudflare_api_token`.

---

## `readServerSecrets()` return value ignored (2026-07-24)

**Bug**: `warmServerSecretsCache()` was called but its return value was ignored. The module-level `SEVER_SECRETS` cache variable was updated but `readServerSecrets()` returned the old cached value because it was reading from module state before the warm function updated it.

**Root cause**: `warmServerSecretsCache()` updates the module var AND returns the data, but the caller was ignoring the return value.

**Fix**: `readServerSecrets()` now returns the result of `warmServerSecretsCache()` directly, ensuring consistency.

---

## Mobile fullscreen blocked (2026-07-24)

**Bug**: Proctor monitor tried `requestFullscreen()` on mobile and failed silently (or threw error).

**Fix**: Detect mobile via UA (`Mobi|Android|iPhone|iPad|iPod`) or `pointer:coarse` media query. Skip fullscreen on mobile. Hide proctor badge on mobile too.

---

## `.zcode` in repo (2026-07-24)

**Bug**: `.zcode` folder (AI session plans, not project code) was committed to repo.

**Fix**: Deleted `.zcode`, added to `.gitignore`.

---

## Email templates count wrong (2026-07-24)

**Bug**: Settings page only showed 9 email templates instead of 13.

**Fix**: Added missing `loginNotification`, `phonePePaymentSuccess`, `phonePePaymentFailed`, `hackathonResultsReleased` to the templates array.

---

## RBAC arrays manually edited (2026-07-20)

**Bug**: Team was manually editing `rbac.ts` to add page permissions.

**Fix**: Added documentation that `page-permissions.ts` is the single source of truth. `rbac.ts` is auto-generated. Adding routes = edit `page-permissions.ts` only.