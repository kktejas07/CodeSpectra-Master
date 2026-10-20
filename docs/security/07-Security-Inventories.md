# 07 — Security inventories (route auth, uploads, webhooks, admin audit)

Snapshot taken 2026-10-20 (wave 5). Re-run the checks below after adding routes; the numbers here are what they printed.

## 1. API route authentication

`frontend/app/api/**/route.ts`: **634 route files**. **556** call a session/role/caller gate directly (`getAPIUser`, `requireAuth`, `requireAdmin`, `requireSuperAdmin`, `requireAts…`, `adminGate`, `sellerGate`, `requireAgentCaller`, …). The other **78** are intentionally public and each has its own guard:

| Kind | Count | Guard | Routes |
|------|------:|-------|--------|
| Provider webhooks | 14 | Signature on the raw body (HMAC / Stripe `constructEvent` / X-VERIFY checksum / shared token, constant-time compare) | `billing/stripe-webhook`, `billing/webhook` (Razorpay), `billing/phonepe-webhook`, `marketplace/webhooks/stripe`, `marketplace/webhooks/phonepe`, `github/webhook`, `kyc/didit/webhook`, `webhooks/postal`, `ats/bgv/webhooks/checkr`, `ats/screening/webhooks/{twilio,exotel,vapi,whatsapp}`, `workflows/hooks/[id]` |
| Payment browser returns | 2 | Nothing in the request is trusted; order settled from the provider status API | `billing/phonepe-callback`, `marketplace/webhooks/phonepe/return` |
| Sign-in / account recovery | 9 | Rate limits + lockout; Turnstile on login, signup, forgot-password; reset uses a single-use token | `auth/{login,signup,forgot-password,reset-password,logout,mobile-token,sso,sso/callback,face-verify}` |
| Signed capability links | 16 | Single-use or signed purpose tokens (hashed at rest), OAuth `state` bound to the user | `assessment/invite/[token]`, `ats/bgv/portal`, `ats/bgv/portal/upload`, `ats/hr-form`, `ats/interviews/{join,self-schedule}`, `ats/integrations/meetings/{google,microsoft}/callback`, `automation/unsubscribe`, `certifications/verify/[token]`, `hackathons/verify/[token]`, `newsletter/{confirm,unsubscribe}`, `subscriptions/{confirm,preferences,unsubscribe}`, `user/email-change/undo` |
| Gate inside a shared helper | 2 | `getAPIUser` in `lib/billing-checkout.ts` | `billing/checkout`, `billing/create-order` |
| Public forms / counters | 4 | Rate limit (+ Turnstile on contact) | `contact`, `newsletter/subscribe` (+ Turnstile since wave 5), `learn/[slug]/track`, `exams/[id]/public-view` |
| Public read-only data | 31 | Read-only, browser-safe fields, cached/rate-limited where costly | `ats/public/jobs`, `ats/public/jobs/[id]`, `calendar/ics`, `companies`, `companies/[slug]`, `config/public`, `events-feed`, `events-feed/[id]/ics`, `firebase-config` (public web config), `health`, `integrations/{github,slack,sonarqube}` (redirect / 501), `kyc/purposes`, `learn`, `learn/[slug]`, `learning/courses`, `learning/courses/[id]`, `marketplace/products`, `marketplace/products/[slug]/slots`, `newsletter/[id]`, `platform/settings`, `platform/tz`, `pricing/plans`, `problems/[slug]/stats`, `public/events`, `public/facts`, `runtimes`, `status`, `tracks` |

Changes since the wave-4 inventory (616 routes): +18 routes, all gated except two new public ones — `public/facts` (read-only, rate-limited) and `user/email-change/undo` (single-use hashed token, rate-limited). `subscriptions/subscribe` gained Turnstile for anonymous callers.

Every API route also passes `proxy.ts`: CSRF double-submit (non-webhook), 240 req/min edge limit, impersonation write-block, security headers.

Re-run: `python3 <scratchpad>/routes.py out.json` (the regex inventory used in waves 4–5), or grep for route files without a gate call.

## 2. File uploads

| Endpoint | Who | Type check (content) | Size cap | Other |
|----------|-----|----------------------|----------|-------|
| `POST /api/upload` (branding images) | superadmin | **Magic bytes** must equal the declared type + extension must match (wave 5, `lib/upload-sniff`); SVG sanitised with DOMPurify | 5 MB | ClamAV scan, fail closed |
| `POST /api/assessment/id-ocr` | signed-in candidate | **JPEG/PNG/WebP magic bytes** (wave 5) | 6 MB (wave 5) | 10/min per user (wave 5) |
| `POST /api/exams/[id]/identity` | candidate | JPEG/PNG/WebP magic bytes | data-URL cap | ClamAV scan |
| `POST /api/exams/[id]/submit`, `…/cad-submission` (snapshots) | candidate | `data:image/(png|jpeg|webp)` only | 2 MB | — |
| `POST /api/exams/[id]/cad-submission/files` | candidate | Extension allowlist; **STEP header check** `ISO-10303-21` (wave 5); native CAD formats are vendor-specific (extension + scan) | 9 MB | ClamAV scan |
| `POST /api/proctor/session-recording` | candidate in an attempt | MIME allowlist `video/webm|mp4` (`normalizeMime`), stored encrypted, served only to reviewers | 8 MB/chunk, per-attempt cap | upload window |
| `POST /api/ats/jobs/[id]/resumes`, `POST /api/ats/public/jobs/[id]/apply` | recruiter / applicant | PDF/DOCX/TXT/MD by **extension + magic bytes** (`lib/rag/sources/uploads`) | 5 MB each, 80 MB batch | ClamAV scan, Turnstile for guests |
| `POST /api/ats/bgv/portal/upload` | candidate (token) | PDF/JPG/PNG **extension + magic bytes** (`lib/ats/bgv/storage`) | 10 MB | per-case cap |
| `POST /api/marketplace/seller/files` | seller | Extension + **magic bytes** (`lib/marketplace/seller-files`) | 15 MB (DB) / 100 MB (S3) | ClamAV scan, per-seller cap |
| `POST /api/admin/knowledge/upload` | admin | PDF/DOCX/TXT/MD extension + magic bytes | 10 MB | text length cap |

Objects in R2/S3 are private; reads go through signed URLs (1 h) — `lib/s3-storage.ts`.

## 3. Webhooks

| Route | Verification (raw body) | Idempotency |
|-------|-------------------------|-------------|
| `billing/stripe-webhook` | `stripe.webhooks.constructEvent` with `STRIPE_WEBHOOK_SECRET` | event id recorded; settle is status-conditional |
| `marketplace/webhooks/stripe` | `constructEvent` | `lib/marketplace/settle` returns `already` for paid orders; ledger idempotency keys |
| `billing/webhook` (Razorpay) | `verifyWebhookSignature` HMAC-SHA256 | payment id de-duplicated |
| `billing/phonepe-webhook`, `marketplace/webhooks/phonepe` | X-VERIFY sha256 checksum (`timingSafeEqual`), then status API | settle is status-conditional |
| `github/webhook` | `X-Hub-Signature-256` HMAC, `timingSafeEqual` | delivery id |
| `kyc/didit/webhook` | HMAC, `timingSafeEqual` | session/status de-dup |
| `webhooks/postal` | Postal RSA signature or query secret (`lib/postal-webhook-verify`) | bounce marking is naturally idempotent |
| `ats/bgv/webhooks/checkr` | `X-Checkr-Signature` HMAC (per tenant) | per event id |
| `ats/screening/webhooks/twilio` | `X-Twilio-Signature` (URL + params) | call status upsert |
| `ats/screening/webhooks/whatsapp` | `X-Hub-Signature-256` (Meta app secret); GET verify token | message id |
| `ats/screening/webhooks/vapi` | `x-vapi-secret` / Bearer, constant-time | call id |
| `ats/screening/webhooks/exotel` | shared token, constant-time | call status upsert |
| `workflows/hooks/[id]` | per-workflow HMAC secret | idempotency key |
| FastAPI `/api/webhooks/dispatch` (outbound relay) | `require_auth` + HMAC + allowlist (`ATS_WEBHOOK_SECRET`, `ATS_WEBHOOK_ALLOWLIST`) | — |

## 4. Admin audit log

`admin_audit_logs` (via `lib/admin-audit.auditAdmin` / `writeAuditLog`) and `marketplace_audit` cover:

- **Settings & secrets**: server secrets (field names only, never values), LLM config, security policies, IP/fingerprint blocks, feature flags, cron/scheduler actions, cache/system actions, CDN purge, plans/packs, pricing tiers and tier features, copilot budgets, marketplace settings.
- **Roles & access**: role permission edits and reseed, team create/update/delete, user role/status/tenant changes, tenant edits, impersonation start/stop.
- **Money**: subscription refunds (`billing/admin/orders/[id]/refund`), marketplace refunds, payouts (approve/paid/failed/reconcile), seller commission.
- **Moderation**: product and seller decisions, KYC reveals, feedback replies/deletes, certificate issue/revoke.
- **Deletions / candidate outcomes**: course create/update/delete, exam invite revoke/delete, manual grading, result release, pipeline stage moves, bulk score release.

Not logged (by design — no state change worth auditing or high-volume AI generation): AI generation/test endpoints (`courses/generate-*`, `blog/ai-*`, `llm-test`, `llm-health`, `r2/test`, `redis/test`, `whatsapp/test-connection`), searches (`rag/search`, `knowledge/search`), reminder sends, plagiarism runs.
