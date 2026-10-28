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
| `UPLOADS_S3_*` (or Admin server secrets `uploads_s3_*`) | Private bucket for user uploads — exam answer files and video recordings, CAD files, contest decks/videos, BGV documents (`lib/storage`). Without it those stay in MongoDB with ~9 MB caps. See §6. |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Rate limits and **scheduler locks** across replicas. Required if you run more than one frontend replica. |
| `INTERNAL_BACKEND_URL` / `INTERNAL_BACKEND_SECRET` | FastAPI backend (AI, ClamAV scan). |
| `PISTON_URL` | Code runner, internal only: `http://piston:2000/api/v2`. |
| `PISTON_IMAGE` | Pin the code runner by digest (`ghcr.io/engineer-man/piston@sha256:…`, run `scripts/pin-piston-image.sh`). Unset = floating `:latest`; Admin → System shows **Piston image not pinned** until it is set (SEC-023). |
| `PGVECTOR_URL` / `RAG_VECTOR_STORE` | Optional Postgres + pgvector (≥ 0.8, TLS required for remote hosts) for the knowledge-search vector leg once the corpus outgrows the in-process scan (~5k chunks) and there is no Atlas vector index. Reads switch only after the admin backfill completes. See `09-RAG-Vector-Store.md`. |
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
| IDfy (BGV) | `/api/ats/bgv/webhooks/idfy?tenant=<tenant id>&token=<callback token>` | per-tenant random URL token (+ optional IDfy IP allow-list); results re-read over the API |
| AuthBridge (BGV) | `/api/ats/bgv/webhooks/authbridge?tenant=<tenant id>` | per-tenant HMAC (header / algorithm configurable) |
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

## 6. Private uploads bucket (`lib/storage`)

One S3-compatible bucket for user uploads: AWS S3, Cloudflare R2 or MinIO.
Separate from the course-media bucket (`S3_*` / `R2_*`), which has a broad
GET CORS rule for the video player. When it is configured:

- answer **video recordings go straight from the browser to the bucket** (presigned
  PUT signed for the exact size + type, up to `UPLOADS_VIDEO_MAX_MB`, default 500),
  and contest videos / decks / diagrams too (videos 500 MB, other files `UPLOADS_FILE_MAX_MB`, default 100);
- the server then **finalizes**: HEAD (size must match, SSE must be present), range GET of
  the first 64 KB for the magic-byte check, ClamAV scan for files up to
  `UPLOADS_SCAN_MAX_MB` (default 64; larger ones are stored as `unscanned` and still only
  download as attachments), then the object is tagged `state=ready`;
- files the server already receives (≤ 9 MB answer files, CAD files, BGV documents)
  are written to the bucket instead of MongoDB;
- downloads are 302s to a **presigned GET valid for 5 minutes** (attachment,
  `application/octet-stream`), issued only after the route's own access check; BGV
  documents stay AES-GCM encrypted by the app and are still decrypted server-side;
- deleting an exam (or replacing an answer / staged CAD file, or a BGV erase) deletes the objects.

Keys look like `u/<feature>/<t-tenantId|platform>/<yyyymm>/<128-bit random>` — no
names, emails or user ids.

### Configuration

| Key (server secret `uploads_s3_…` / env `UPLOADS_S3_…`) | Notes |
|---|---|
| `bucket` | Required. Its presence turns the feature on. |
| `region` | Default `us-east-1` (`auto` for R2). |
| `endpoint` | Empty for AWS. `https://<account>.r2.cloudflarestorage.com` for R2, `http(s)://minio:9000` for MinIO. |
| `force_path_style` | Default on for custom non-R2 endpoints (MinIO). |
| `access_key_id` / `secret_access_key` | Leave empty on AWS to use the instance / task IAM role (SDK default chain). |
| `sse` | `AES256` (default on AWS), `aws:kms`, or `none` (default on R2/MinIO — R2 always encrypts at rest). |
| `kms_key_id` | KMS key ARN/id; implies `aws:kms`. |
| `pending_tag` | Tag direct uploads `state=pending` until finalized (default on, off for R2 which has no object tagging). |

Env-only limits: `UPLOADS_VIDEO_MAX_MB`, `UPLOADS_FILE_MAX_MB`, `UPLOADS_SCAN_MAX_MB`.

### Bucket setup (AWS)

1. **Block all public access** on the bucket (and account): `aws s3api put-public-access-block --bucket $B --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true`.
   Object ownership: *Bucket owner enforced* (ACLs disabled). The app never sends ACLs.
2. **Default encryption**: SSE-S3 or SSE-KMS (with a bucket key) — the app also sends the header on every write.
3. **Bucket policy** — TLS only, encrypted writes only:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyInsecureTransport",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": ["arn:aws:s3:::codespectra-uploads", "arn:aws:s3:::codespectra-uploads/*"],
      "Condition": { "Bool": { "aws:SecureTransport": "false" } }
    },
    {
      "Sid": "DenyUnencryptedWrites",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::codespectra-uploads/*",
      "Condition": { "Null": { "s3:x-amz-server-side-encryption": "true" } }
    }
  ]
}
```

(With `sse=aws:kms`, change the second statement to
`"StringNotEquals": { "s3:x-amz-server-side-encryption": "aws:kms" }`.)

4. **IAM policy** for the app's role / user — only the `u/` prefix, no bucket admin:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "UploadObjects",
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject", "s3:PutObjectTagging"],
      "Resource": "arn:aws:s3:::codespectra-uploads/u/*"
    },
    {
      "Sid": "HeadMissingObjectsAs404",
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::codespectra-uploads",
      "Condition": { "StringLike": { "s3:prefix": ["u/*"] } }
    },
    {
      "Sid": "KmsOnlyWhenSseKms",
      "Effect": "Allow",
      "Action": ["kms:GenerateDataKey", "kms:Decrypt"],
      "Resource": "arn:aws:kms:REGION:ACCOUNT:key/KEY_ID"
    }
  ]
}
```

5. **CORS** — needed only for the browser's presigned PUT (downloads are top-level
   navigations, not CORS). List your real origins:

```json
[
  {
    "AllowedOrigins": ["https://codespectra.ai", "https://www.codespectra.ai"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["content-type", "x-amz-server-side-encryption", "x-amz-server-side-encryption-aws-kms-key-id", "x-amz-tagging"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

R2: same rule in the dashboard (R2 → bucket → Settings → CORS). MinIO: `mc cors set`.

6. **Lifecycle** — expire abandoned direct uploads:

```json
{
  "Rules": [
    { "ID": "expire-unfinished-uploads", "Status": "Enabled", "Filter": { "Tag": { "Key": "state", "Value": "pending" } }, "Expiration": { "Days": 1 } },
    { "ID": "abort-multipart", "Status": "Enabled", "Filter": { "Prefix": "u/" }, "AbortIncompleteMultipartUpload": { "DaysAfterInitiation": 1 } }
  ]
}
```

On R2 (no tagging) rely on the sweep: `POST /api/admin/storage {"action":"sweep"}`
(deletes uploads never finished within ~1 h or never attached within a day).

7. **CSP**: the page's `connect-src` must allow the bucket origin for the PUT
   (`https://<bucket>.s3.<region>.amazonaws.com`, `https://<account>.r2.cloudflarestorage.com`
   or the MinIO URL), and `media-src` must allow it for reviewers playing answer
   recordings in place (`?mode=play` returns a presigned URL for the `<video>`).
   Other downloads are top-level redirects and need no CSP change.

### Moving existing files out of MongoDB

Superadmin, after the bucket is configured:

1. `GET /api/admin/storage` — status and how many inline files / bytes are left.
2. `POST /api/admin/storage {"action":"migrate"}` — dry run (default): counts only.
3. `POST /api/admin/storage {"action":"migrate","dry_run":false,"batch":100}` — repeat
   until every `remaining` is 0. Each row gets a deterministic key, the object is written
   and size-verified before the row switches to `storage: "s3"` and its bytes are unset,
   so an interrupted run is safe to repeat. Covers `exam_submission_files`,
   `contest_files` and `ats_bgv_files` (BGV case documents are re-pointed atomically).
   Take a Mongo backup first; rows that keep failing are logged and counted in `failed`.

