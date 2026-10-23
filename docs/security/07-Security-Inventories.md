# 07 — Security inventories (route auth, uploads, webhooks, admin audit)

Snapshot taken 2026-10-20 (wave 5). Re-run the checks below after adding routes; the numbers here are what they printed.

## 1. API route authentication

`frontend/app/api/**/route.ts`: **634 route files**. **556** call a session/role/caller gate directly (`getAPIUser`, `requireAuth`, `requireAdmin`, `requireSuperAdmin`, `requireAts…`, `adminGate`, `sellerGate`, `requireAgentCaller`, …). The other **78** are intentionally public and each has its own guard:

| Kind | Count | Guard | Routes |
|------|------:|-------|--------|
| Provider webhooks | 16 | Signature on the raw body (HMAC / Stripe `constructEvent` / X-VERIFY checksum / shared token, constant-time compare) | `billing/stripe-webhook`, `billing/webhook` (Razorpay), `billing/phonepe-webhook`, `marketplace/webhooks/stripe`, `marketplace/webhooks/phonepe`, `github/webhook`, `kyc/didit/webhook`, `webhooks/postal`, `ats/bgv/webhooks/{checkr,idfy,authbridge}`, `ats/screening/webhooks/{twilio,exotel,vapi,whatsapp}`, `workflows/hooks/[id]` |
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
| `POST /api/exams/[id]/answer-files` | candidate in a running attempt | Author's allowlist, **extension + magic bytes** (`lib/upload-sniff`) | 9 MB (author cap) | ClamAV scan; infected rejected, scanner offline → `unscanned` |
| `POST /api/exams/[id]/answer-files/direct` (wave 7) | candidate in a running attempt | Presigned PUT signed for exact size + type; finalize: HEAD size, SSE present, **magic bytes on a 64 KB range GET** | video 500 MB (`UPLOADS_VIDEO_MAX_MB`) | ClamAV ≤ `UPLOADS_SCAN_MAX_MB`, else `unscanned`; upload id bound to user + exam + question + attempt, claimed once |
| `POST /api/contests/[id]/submissions` (multipart) / `…/uploads` (wave 7, direct) | entry member while open | Slot extension + magic bytes (`checkFileHead`) | 9 MB inline; 500 MB video / 100 MB other direct | ClamAV, fail closed (scanner offline → retry); upload id bound to user + entry + slot |
| `POST /api/proctor/session-recording` | candidate in an attempt | MIME allowlist `video/webm|mp4` (`normalizeMime`), stored encrypted, served only to reviewers | 8 MB/chunk, per-attempt cap | upload window |
| `POST /api/ats/jobs/[id]/resumes`, `POST /api/ats/public/jobs/[id]/apply` | recruiter / applicant | PDF/DOCX/TXT/MD by **extension + magic bytes** (`lib/rag/sources/uploads`) | 5 MB each, 80 MB batch | ClamAV scan, Turnstile for guests |
| `POST /api/ats/bgv/portal/upload` | candidate (token) | PDF/JPG/PNG **extension + magic bytes** (`lib/ats/bgv/storage`) | 10 MB | per-case cap |
| `POST /api/marketplace/seller/files` | seller | Extension + **magic bytes** (`lib/marketplace/seller-files`) | 15 MB (DB) / 100 MB (S3) | ClamAV scan, per-seller cap |
| `POST /api/admin/knowledge/upload` | admin | PDF/DOCX/TXT/MD extension + magic bytes | 10 MB | text length cap |

Objects in R2/S3 are private; reads go through signed URLs (1 h) — `lib/s3-storage.ts`.

User uploads (answer files/videos, CAD, contest files, new BGV documents) use the
separate **private uploads bucket** (`lib/storage`, wave 7): Block Public Access,
no ACLs, SSE-S3/KMS on every write, TLS-only bucket policy, least-privilege IAM on
the `u/` prefix, keys without PII. Downloads are presigned GETs of **≤ 5 minutes**
(attachment, generic type) handed out only after the route's access check;
objects are deleted with their records. Without the bucket these stay in MongoDB.
Policies and CORS: `docs/devops/05-Production-Checklist.md` §6.

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
| `ats/bgv/webhooks/idfy` | per-tenant random token in the URL (constant-time) + optional IP allow-list; body only triggers an authenticated re-read | per request id + status |
| `ats/bgv/webhooks/authbridge` | HMAC on the raw body, header / algorithm / encoding per tenant | per event id (or body hash) |
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

## 5. Content Security Policy and third-party scripts (wave 7)

Built in `frontend/lib/csp/policy.ts`, sent by `frontend/proxy.ts` on every HTML response (not on `/api/*` or static files). Guards: `tests/csp-policy.test.ts`, `tests/csp-dynamic-routes.test.ts`, `scripts/ci-smoke.mjs`.

**Decision.** Next.js 16 can only nonce its scripts while rendering a request, so a nonce on every page would force the whole app dynamic and undo ISR. Experimental SRI only covers external chunks: prerendered pages still carry inline RSC payload scripts. So the policy has two strict variants:

| Pages | Rendering | `script-src` |
| --- | --- | --- |
| Public marketing / content (`isPublicMarketingPath`: landing, pricing, legal, `/learn`, `/news`, `/events`, `/companies`, `/contests`, `/docs` …) | static or ISR, no cookies or session on the server | `'self' 'unsafe-inline' 'wasm-unsafe-eval'` + the host allow-list. **No `'unsafe-eval'`.** Inline is required by the prerendered RSC payload. |
| Everything else (dashboard, auth, assessments, token links) | per request (`dynamic = 'force-dynamic'` in the segment layout) | `'self' 'nonce-<per request>' 'strict-dynamic'` + SHA-256 of the two pre-hydration scripts (`lib/csp/inline-scripts.ts`) + `'wasm-unsafe-eval'`. **No `'unsafe-inline'`, no `'unsafe-eval'`.** |

`style-src` keeps `'unsafe-inline'` in both: React `style` props, framer-motion, next/font and Radix positioning write inline style attributes, and Next has no nonce for style attributes. Also in both: `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`, `upgrade-insecure-requests`, `img-src 'self' data: blob: https:` (no plain http), and `report-uri /api/csp-report` + `report-to csp` (`Reporting-Endpoints`).

**Rollout.** `CSP_ENFORCE` unset or `0` (default): the previous permissive policy stays enforced, and the strict policy goes out as `Content-Security-Policy-Report-Only`. `CSP_ENFORCE=1`: the strict policy is enforced and the legacy one is dropped. Flip it once the report log is clean for a week. Roll back by unsetting it, no rebuild needed (the proxy reads it per request).

**Enforce readiness (SEC-024, audit 5, needs the owner to flip).** Our own code was checked against the strict policy:
- Inline `<script>`: only the three pre-hydration scripts (hashed, `lib/csp/inline-scripts.ts`) and JSON-LD data blocks (`type="application/ld+json"`, not executed, not subject to `script-src`). No `next/script` inline code.
- No `eval` / `new Function` / string `setTimeout` in app code; no `javascript:` URLs.
- Inline event-handler attributes: the two printable documents (`/api/billing/invoices/<id>/download`, `/api/marketplace/orders/<id>/invoice`) used `onclick="window.print()"`. They now carry `data-print` and one hashed script, under their own tight policy (`lib/csp/print-page.ts`: `default-src 'none'`, script by hash only). API routes are outside the proxy's page CSP, so this is their only policy.
- Scripts our code inserts (Razorpay, Turnstile, Monaco, analytics) are trusted through `'strict-dynamic'`; WASM (face-api, zk prover) through `'wasm-unsafe-eval'`.

Remaining risk is third-party code we can't grep (CDN-injected beacons, browser extensions — extensions show up in reports and are harmless). To enforce: watch `[csp]` log lines for a week with `CSP_ENFORCE` unset; if only extension / beacon noise appears, set `CSP_ENFORCE=1` in production and keep watching for a day. Rollback: unset it (no rebuild).

**Reports.** `POST /api/csp-report` accepts both report formats. It is CSRF-exempt (browsers send reports without cookies), rate-limited to 30 per minute per IP, and caps bodies at 64 KB. It always returns 204 and logs one `[csp] …` line per violation. Logged fields: directive, blocked origin, and document and source URL as origin + path. Query strings, fragments, script samples, the user agent and the IP are dropped, and opaque path segments (tokens, ids) become `:id`.

**Third-party script inventory** (only these origins are allowed):

| Origin | Why | Loaded by |
| --- | --- | --- |
| `cdn.jsdelivr.net`, `cdnjs.cloudflare.com` | Monaco editor loader and workers, face-api model and pdf.js fallbacks | `components/code-scanner/code-editor.tsx`, face/pdf loaders |
| `apis.google.com`, `www.gstatic.com` (+ frames `*.firebaseapp.com`) | Firebase Auth (Google sign-in) | Firebase SDK |
| `challenges.cloudflare.com` | Turnstile captcha (script, frame, connect) | `components/auth/turnstile-widget.tsx` |
| `static.cloudflareinsights.com` (+ connect `cloudflareinsights.com`) | Cloudflare Web Analytics beacon (CDN-injected) | Cloudflare |
| `checkout.razorpay.com` (+ frames `api.razorpay.com`) | Razorpay checkout | `lib/razorpay-checkout.ts` |
| GA4 / GTM / PostHog Cloud / Clarity / Meta Pixel / LinkedIn Insight | Optional, consent-gated, admin-configured | `components/analytics/third-party-tags.tsx` (hosts in `lib/analytics/integrations.ts` `TAG_*_HOSTS`) |
| Same origin | FingerprintJS (`/vendor/fingerprintjs.min.js`), face-api models (`/models`) | `lib/fingerprint.ts`, proctoring |

Connect-only origins cover Firebase, browser-side AI and GitHub calls, payments, YouTube thumbnails, presigned bucket URLs (R2, S3, GCS, Hetzner) and LiveKit Cloud (`wss://*.livekit.cloud`). Frames: YouTube, Razorpay, Firebase and Turnstile.

**Private-upload bucket.** When upload storage is configured (`uploads_s3_*` server secrets or `UPLOADS_S3_*` env, `lib/storage/config.ts`), the proxy adds that bucket's origin to `connect-src` (presigned PUT), `img-src` and `media-src` (presigned GET), in both the enforced and the report-only policy. The origin is derived as the AWS SDK builds presigned URLs (`lib/csp/storage-origin.ts`). The config is re-read at most every 60 s, and nothing is added when no bucket is set.

**Caching and user data.** Pages that read the database (landing, `/events`, `/contests`, `/pricing`, and learn, news and event detail pages) are not prerendered, because the production build has no database. They render per request from the tag-purged data cache (`lib/cache/public-data.ts`). A DB error throws, so it is never cached as "no events". Detail pages cache only found items, so unknown slugs 404 without creating cache entries. Only DB-free pages (about, faq, legal, docs, companies) are prerendered. The cache is per instance; there is a single instance today, and the shared Redis `cacheHandler` option is described in `lib/cache/revalidate.ts`. The root layout no longer forces dynamic rendering. Cached pages read no cookies, headers or session on the server: user state on public pages comes from client components. `tests/csp-dynamic-routes.test.ts` fails if a marketing page imports `next/headers` or awaits an auth helper, and if any non-marketing page could be prerendered.
