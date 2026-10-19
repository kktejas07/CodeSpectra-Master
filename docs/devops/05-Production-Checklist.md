# Production checklist — CodeSpectra

> **Auto-Generated**: Internal Engineering documentation.

> **Last Updated:** 2026-10-19
> Companion to [01-Deployment-Guide.md](./01-Deployment-Guide.md). Everything a fresh
> production deploy needs: secrets, scheduled jobs, workers, webhooks, network.

---

## 1. Secrets and environment (frontend container, runtime only)

Never pass secrets as Docker **build args** — build args and `ENV` lines are kept in
image layers/history. Set them in Dokploy's environment (or `docker-compose.yml`
`environment:` / an `env_file`). Only `NEXT_PUBLIC_*` values are build args.

### Required

| Variable | What it does | How to make one |
|---|---|---|
| `MONGODB_URI`, `MONGODB_DB_NAME` | Database | Atlas / your Mongo |
| `NEXT_PUBLIC_APP_URL` | Public origin (links in emails, webhooks, signed URLs) | e.g. `https://codespectra.ai` (build arg + runtime) |
| `SESSION_SECRET` | Signs sessions (32+ chars). Without it one is generated and stored in Mongo. | `openssl rand -hex 32` |
| `SECRETS_ENCRYPTION_KEY` | AES-GCM key for API keys saved in Admin → Settings (`platform_settings.secrets`), authenticator secrets, and (fallback) identity photos. **Keep it out of the database.** **A production server refuses to start without it** (`instrumentation.ts`, SEC-018; emergency override `ALLOW_DERIVED_ENCRYPTION_KEYS=1`). Data sealed earlier with the session-derived key stays readable and is re-sealed with this key. | `openssl rand -hex 32` |
| `INTERNAL_BACKEND_SECRET` | Shared secret for frontend → FastAPI calls; the backend refuses `/internal/*` without it (SEC-001). Same value in `backend/.env`. | `openssl rand -hex 32` |
| `ATS_ENCRYPTION_KEY` | Encrypts tenants' meeting / BGV vendor credentials and BGV documents (32+ chars). Rotating it means tenants reconnect providers. | `openssl rand -hex 32` |
| `CRON_SECRET` | Bearer token for `/api/cron/*` (only needed on serverless, see §2; set it anyway so the endpoints are not open in dev-like setups). | `openssl rand -hex 32` |

### Recommended

| Variable | What it does |
|---|---|
| `IDENTITY_MEDIA_KEY` | Separate key for exam ID photos, selfies and face templates (falls back to `SECRETS_ENCRYPTION_KEY`). Media sealed with an earlier key stays readable. |
| `IDENTITY_MEDIA_KEY_PREVIOUS` / `SECRETS_ENCRYPTION_KEY_PREVIOUS` | Comma-separated old key values, used only to **read** media and proctoring recordings sealed before a rotation. Rotation: set the new key, move the old value here, restart. Each recording chunk stores a key fingerprint (`key_id`) so the right key is tried first; keep old values until those recordings pass retention. |
| `TRUSTED_PROXY_CIDRS` / `TRUST_CF_CONNECTING_IP` | Which peers may set the client IP headers (default none). See `06-Reverse-Proxy.md`. |
| `AI_ENDPOINT_ALLOWLIST` | Extra AI base URLs the backend may send keys to (built-ins + endpoints saved in Admin → Settings are always allowed). |
| `MARKETPLACE_ENCRYPTION_KEY` | Marketplace seller payout details (32+ chars). |
| `MKT_INVOICE_LEGAL_NAME` / `MKT_INVOICE_ADDRESS` / `MKT_INVOICE_GSTIN` | Legal name, address and GSTIN printed on marketplace tax invoices. Without them invoices go out as "CodeSpectra" with no address or GSTIN — set them before selling in INR. |
| `S3_*` / `R2_*` (Admin → Settings → Storage) | Also used for proctoring session recordings (encrypted, ~1-minute chunks). Without object storage recordings go to MongoDB GridFS — fine for small volumes, plan for ~350 MB per recorded test hour. `RECORDING_MAX_BYTES_PER_ATTEMPT` caps one attempt (default 1.5 GB). |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Rate limits and **scheduler locks** across replicas. Required if you run more than one frontend replica. |
| `INTERNAL_BACKEND_URL` / `INTERNAL_BACKEND_SECRET` | FastAPI backend (AI, ClamAV scan). |
| `PISTON_URL` | Code runner, internal only: `http://piston:2000/api/v2`. |
| `DIDIT_API_KEY`, `DIDIT_WEBHOOK_SECRET` | KYC (runtime env only). |
| `PHONEPE_ENABLED=true` + PhonePe keys | PhonePe stays off until this is set. Run one real sandbox payment first (success, failure, closed tab) — the automated tests use a mocked gateway. |
| `ATS_WHATSAPP_UNOFFICIAL=1` | Only if you deliberately want candidate stage updates over the unofficial OpenWA gateway. By default they use the official Meta Cloud API (Admin → Settings → Hiring integrations) or are not sent. |
| `PLATFORM_CRON_IN_PROCESS=0` | Leave the digest / reminder routes to an external scheduler only (see §2). |
| `SKIP_AUTO_INDEXES=1` | Don't create hot-collection indexes on start (`lib/db-indexes.ts`); run `npx tsx scripts/create-indexes.ts` yourself. |

Payment, AI, email, storage and WhatsApp keys can be entered in **Admin → Settings**
instead of env; they are stored encrypted (needs `SECRETS_ENCRYPTION_KEY`).
`session_secret`, `internal_backend_secret` and the Upstash URL/token stay plain
text in that store because the Python backend and the boot scripts read them directly.

## 2. Scheduled jobs

One shared runner (`lib/scheduler.ts` → `runAtsMinuteSweeps` → `lib/platform-cron.ts`)
does every recurring job, with a Redis lock per job window:

| When | Jobs |
|---|---|
| every minute | scheduled workflows, hiring sweeps (interviews, HR forms, BGV, bot screening), exam auto-close, quiet-hours notification flush |
| daily (00:05 UTC) | trial expiry, payment-failure grace expiry, identity-photo retention purge, ATS SLAs |
| on their schedule | status check (5 min), exam reminders (hourly), daily digest (08:00), weekly digest (Mon 09:00), ebook draft (07:00), signals ingest (6 h), security scan (Sun 03:00) |

- **Docker / VPS / Dokploy (long-running server): nothing to set up.** The in-process
  loop starts on the first API request and runs the runner every minute.
  If an external cron still calls a digest route, the runner skips that run
  (it checks the route's last successful run), so nothing is sent twice.
- **Serverless (Vercel, Netlify…):** add **one** cron: every minute
  `POST /api/cron/tick` with header `Authorization: Bearer $CRON_SECRET`.
- Health: Admin → Cron jobs shows the last run of every job (`cron_runs`).

## 3. Workers

| Process | Notes |
|---|---|
| `course-worker` | Same image, `COURSE_WORKER=1`, no HTTP, **one replica** (claims `generation_jobs`). Needs `MONGODB_URI`, `INTERNAL_BACKEND_URL/SECRET`. |
| Piston | Code runner. **Never publish its port** — it runs arbitrary code without auth. Reach it on the compose network only. |
| LiveKit | The compose service is **dev only** (`--profile dev`, `--dev` keys, bound to 127.0.0.1). Production: LiveKit Cloud or your own server with real keys + TLS + TURN; enter `livekit_url` / key / secret in Admin → Settings → Hiring integrations. |

## 4. Webhooks to register with providers

Base URL = `NEXT_PUBLIC_APP_URL`.

| Provider | URL | Verification |
|---|---|---|
| Postal (delivery / bounce) | `/api/webhooks/postal` | RSA `X-Postal-Signature(-256)` with the public key saved in Admin → Settings → Mail ("Webhook signing key"), **or** a shared secret appended as `?secret=…` |
| Razorpay | `/api/billing/webhook` | `razorpay_webhook_secret` |
| Stripe (billing) | `/api/billing/stripe-webhook` | `stripe_webhook_secret` |
| Stripe (marketplace) | `/api/marketplace/webhooks/stripe` | `STRIPE_MARKETPLACE_WEBHOOK_SECRET` |
| PhonePe (billing S2S callback) | `/api/billing/phonepe-webhook` (set per payment; browser return `/api/billing/phonepe-callback`) | `X-VERIFY` with the salt key |
| PhonePe (marketplace) | `/api/marketplace/webhooks/phonepe` | `X-VERIFY` |
| Didit KYC | `/api/kyc/didit/webhook` | `DIDIT_WEBHOOK_SECRET` (HMAC `X-Signature-V2`) |
| GitHub App | `/api/github/webhook` | `GITHUB_WEBHOOK_SECRET` |
| Checkr (BGV) | `/api/ats/bgv/webhooks/checkr?tenant=<tenant id>` | per-tenant webhook secret |
| WhatsApp (Meta Cloud API) | `/api/ats/screening/webhooks/whatsapp` | `meta_whatsapp_app_secret` (+ verify token) |
| Vapi / Twilio / Exotel | `/api/ats/screening/webhooks/{vapi,twilio,exotel}` | their secrets in Hiring integrations |

## 5. Network and security checklist

- Only the reverse proxy (80/443) is public. Compose binds the frontend to
  `127.0.0.1:3000` and publishes no backend or Piston port — see `06-Reverse-Proxy.md`.
- Mongo backup scripts read `MONGO_BACKUP_URI` from `/etc/codespectra/mongo-backup.env`;
  rotate the password that used to be committed (`06-Reverse-Proxy.md`, SEC-017).
- New email/password sign-ups must verify their email before signing in
  (default on; accounts created before this change are grandfathered).
- `Permissions-Policy` allows camera + microphone for our own origin (voice
  interviews, LiveKit, proctoring). Don't add `microphone=()` at the proxy/CDN.
- Admin → Settings → Product & access: "Require 2FA for admins" is on by default
  (14-day grace). Superadmins and organisation admins are sent to
  `/auth/two-factor-setup` after the grace period.
- Exam ID photos and selfies are deleted 180 days after the exam closes (setting:
  "Keep ID photos and selfies").
- Indexes for hot collections are created on start; run
  `npx tsx scripts/create-indexes.ts` once after the first deploy for the full set.
