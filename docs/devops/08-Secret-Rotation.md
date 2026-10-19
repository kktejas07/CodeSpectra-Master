# 08 — Secret rotation, history purge and repository security settings

**Audience:** the repository owner and whoever holds production access (Dokploy, MongoDB, provider dashboards).
**Status (2026-10-20):** the GitHub repository is **public** and a full-history gitleaks scan found real credentials in old commits. The working tree is clean (CI `secrets` job and the pre-commit hook enforce that), but **anything that was ever pushed must be treated as leaked** — deleting a file or rewriting history does not un-leak it. Rotate first, purge history second.

Never paste a secret value into an issue, PR, commit, doc, screenshot or chat. Refer to it by provider and variable name only.

---

## 1. What leaked (full-history gitleaks, 1,326 commits)

| # | Secret | Where (file @ commit) | Still in tree? | Action |
|---|--------|-----------------------|----------------|--------|
| 1 | **Firebase Admin service-account private key** (3 copies) | `frontend/check_fb.js`, `frontend/check_fb2.js`, `frontend/fb_check.js` @ `c3945d7d` (2026-06-27) | No (files deleted) | **Rotate now** — §3.1 |
| 2 | **MongoDB password** for user `mongo` (same 20-char value everywhere) | `scripts/backup/backup_mongo.sh` + `scripts/backup/pre-op-safeguard.sh` @ `f861b44d`, `fa988ea3`; `frontend/scripts/generate-question-bank-45k.ts` @ `3efd7172`; `AUDIT-REPORT.md` @ `b04e4536` | No (scripts read env now) | **Rotate now** — §3.2 |
| 3 | **`INTERNAL_BACKEND_SECRET`** value | `WORKING.md` @ `68db814b` (and in the tree until wave 5 — now redacted) | No (redacted 2026-10-20) | **Rotate now** — §3.3 |
| 4 | **Google API key** (`AIza…`) | `AUDIT-REPORT.md` @ `b04e4536` | No | **Rotate + restrict** — §3.4 |
| 5 | `curl -H "Authorization: Bearer …"` examples | `docs/public/07-api-overview.md`, `docs/archive/RBAC_IMPLEMENTATION.md`, `frontend/RBAC_IMPLEMENTATION.md` (several commits) | — | Checked: placeholders (`SUPERADMIN_TOKEN`, `cs_api_live_YOUR_TOKEN`, `cs_api_live_xxxx…`). No action. |
| 6 | `generic-api-key` hits | `frontend/app/dashboard/admin/settings/page.tsx` (`xp_*` setting names), `frontend/tests/llm-keys-save.test.ts` (fake Groq key) | — | False positives, allowlisted in `.gitleaks.toml` by exact pattern. |

To see a value yourself (locally, never in CI logs): `git show <commit>:<path> | less`. To find the Firebase key id to revoke: `git show c3945d7d:frontend/check_fb.js | grep private_key_id`.

Re-run the scan any time:

```bash
gitleaks git . --config .gitleaks.toml --redact --report-path /tmp/gl.json   # full history
gitleaks dir . --config .gitleaks.toml --redact                              # working tree
```

---

## 2. Where secrets live (and where they must not)

| Store | What goes there | Notes |
|-------|-----------------|-------|
| **Dokploy → project → service → Environment** | Bootstrap and infrastructure secrets: `MONGODB_URI`, `SESSION_SECRET`, `SECRETS_ENCRYPTION_KEY`, `IDENTITY_MEDIA_KEY`, `INTERNAL_BACKEND_SECRET`, `CRON_SECRET`, `FIREBASE_*`, `TURNSTILE_SECRET_KEY`, webhook secrets | Set them in the Dokploy UI, not with `docker service update --env-add` (Dokploy re-applies its own stored env on every deploy and wipes ad-hoc values — see WORKING.md, REBUILD-500-FIX). Both services (`codespectra-frontend-…`, `codespectra-backend-…`) need the shared ones. |
| **Superadmin → Settings → server secrets** (Mongo `platform_settings.secrets`, encrypted at rest with `SECRETS_ENCRYPTION_KEY`) | Provider API keys (AI, Stripe, Razorpay, PhonePe, Meta/WhatsApp, Vapi, Twilio/Exotel, Checkr, Didit, Postal, R2/S3, Cloudflare, LiveKit, Turnstile) | Every save is written to the admin audit log (field names only, never values). |
| `.env`, `.env.local`, `*.env` files | **Local development only.** Ignored by git (`.gitignore`), only `.env.example` files are tracked. | Never copy a production value into a local file. |
| The repository, docs, WORKING.md, screenshots, PR bodies | **Nothing.** | CI (`secrets` job) and the pre-commit hook fail on any match. |

Precedence that matters when rotating:

- **`SESSION_SECRET`** — the copy stored in Mongo (`platform_settings.secrets.session_secret`) **wins over the env var** (`lib/session.ts` → `pickRuntimeSecret`). Changing only the Dokploy env changes nothing.
- **`INTERNAL_BACKEND_SECRET`** — env first, Mongo (`internal_backend_secret`) as fallback, on both the Next.js app (`lib/ai/backend.ts`) and FastAPI (`backend/core/auth.py`). Both sides must end up with the same value.
- Provider keys — the superadmin setting wins over env for most providers (`lib/server-secrets-cache.ts`); clear stale env copies after rotating.

### Separate development and production keys

- Every provider below has (or can have) a separate test/sandbox project. Production keys exist **only** in Dokploy / server-secrets on the production server. Developers get their own test keys.
- Stripe: test-mode keys (`sk_test_…`) locally, live (`sk_live_…` / restricted `rk_live_…`) only in production. Razorpay: `rzp_test_` vs `rzp_live_`. PhonePe: UAT vs PROD merchant credentials. Firebase: a separate `codespectra-dev` project. AI providers: a separate project/workspace (OpenAI project, Anthropic workspace, Google Cloud project) per environment so a leaked dev key can't spend the production budget.
- Generate CodeSpectra's own secrets per environment: `openssl rand -base64 48 | tr -d '\n'` (32+ chars). Never reuse a value across environments.

---

## 3. Rotation runbooks

General order for every secret: **create new → deploy new → verify → revoke old → check provider logs for use of the old one.** Keep each rotation in the admin audit log / an ops ticket (who, when, which secret — never the value).

### 3.1 Firebase Admin service account (leaked — rotate now)

1. Google Cloud console → project `<firebase-project>` → **IAM & Admin → Service Accounts** → `firebase-adminsdk-…@<project>.iam.gserviceaccount.com` → **Keys**.
2. Find the key whose id matches the leaked `private_key_id` (see §1). **Delete it.** Delete any other keys you don't recognise.
3. **Add key → Create new key → JSON.** Download once; don't save it in the repo or Downloads long-term.
4. Dokploy → frontend service → Environment: set `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` (paste the `private_key` with `\n` escapes; `lib/firebase-admin.ts` unescapes them). Redeploy. Securely delete the JSON file.
5. Verify: sign in with Google on production; check the logs for `[Firebase Admin]` errors.
6. Audit: Cloud console → **Logging → Logs Explorer**, filter `protoPayload.authenticationInfo.principalEmail="firebase-adminsdk-…"` since 2026-06-27 for calls from unknown IPs (user exports, custom-token minting, Firestore/Storage reads). Firebase console → Authentication → Users: look for unexpected accounts or provider links.
7. Least privilege: the Admin SDK key only needs Firebase Authentication admin. Remove broader roles (Editor/Owner) from the service account; prefer **Firebase Authentication Admin** (`roles/firebaseauth.admin`). Consider an org policy that disables service-account key creation once Workload Identity is an option for the host.

### 3.2 MongoDB (leaked — rotate now)

1. Connect as an admin from the server (not over the internet): `docker exec -it <mongo-container> mongosh -u <admin> --authenticationDatabase admin`.
2. `use admin` → `db.changeUserPassword("mongo", passwordPrompt())` (type a new 32+ char random value; `openssl rand -base64 32`).
3. Update `MONGODB_URI` (and `MONGO_URL` if still set) in Dokploy for **frontend and backend**, and `MONGO_BACKUP_USER` / `MONGO_BACKUP_PASSWORD` for the backup cron (`scripts/backup/*.sh` read env only). Redeploy both services.
4. Verify: `/api/health` shows MongoDB ok; backend `/internal/*` calls work; next backup run succeeds.
5. Least privilege: create separate users instead of one root-ish `mongo` user — `codespectra_app` with `readWrite` on the app DB only, `codespectra_backup` with `backup` role, admin used by humans only. Make sure port 27017/27018 is **not** published to the internet (`docker-compose.yml` / Dokploy ports, host firewall).
6. Audit: if auditing/profiling is enabled, review connections from unknown IPs since the first leak (2026-08-06 for `3efd7172`, earlier for the backup scripts). Rotate `SECRETS_ENCRYPTION_KEY`-protected data only if you find evidence of access (the at-rest key is not in the DB).

### 3.3 `INTERNAL_BACKEND_SECRET` (leaked — rotate now)

1. Generate: `openssl rand -base64 48 | tr -d '\n'`.
2. Dokploy: set `INTERNAL_BACKEND_SECRET` on **both** services to the new value.
3. Superadmin → Settings → server secrets: set **Internal backend secret** to the same value (or clear it so env is used) — the Mongo copy is a fallback on both sides and must not keep the old value.
4. Redeploy both services. Verify an AI feature (course chat, code review) works — mismatches show up as 401 from `/internal/*`.
5. The backend port must not be public (`docker-compose.yml` binds it to the internal network; keep it that way).

### 3.4 Google API key (leaked) and API-key restrictions

1. Google Cloud console → **APIs & Services → Credentials** → the key → **Regenerate key** (or create a new key and delete the old one after deploying).
2. If it is the Firebase **web** key (`NEXT_PUBLIC_FIREBASE_API_KEY`): it is public by design, so its protection is restrictions — **Application restrictions → HTTP referrers**: `https://codespectra.ai/*` (+ staging origins). **API restrictions → Restrict key**: Identity Toolkit API, Token Service API, Firebase Installations API, Firebase Cloud Messaging API (only what the app uses). Rebuild the frontend image (it's inlined at build time).
3. If it is a Gemini/AI Studio key: delete it in AI Studio / Credentials, create a new one in the **production** project, restrict it to the Generative Language API, set it in server-secrets.
4. Set a budget + alert on the project (Billing → Budgets & alerts) and per-API quotas (APIs & Services → the API → Quotas).

### 3.5 Session secret and encryption keys (rotate on suspicion, not routinely)

| Secret | How | Effect |
|--------|-----|--------|
| `SESSION_SECRET` | Superadmin → server secrets → session secret (and Dokploy env) → redeploy | Every user is signed out. |
| `SECRETS_ENCRYPTION_KEY` | Move the current value to `SECRETS_ENCRYPTION_KEY_PREVIOUS`, set a new `SECRETS_ENCRYPTION_KEY`, redeploy. Stored secrets are re-sealed on read. Remove `_PREVIOUS` only after every record has been re-sealed. | No downtime if `_PREVIOUS` is set. |
| `IDENTITY_MEDIA_KEY` | Same pattern with `IDENTITY_MEDIA_KEY_PREVIOUS`. | Old proctoring recordings stay readable while `_PREVIOUS` is set. |
| `CRON_SECRET`, `ATS_WEBHOOK_SECRET`, `ATS_ENCRYPTION_KEY` | New value in Dokploy (+ the external cron caller) → redeploy. `ATS_ENCRYPTION_KEY` follows the `_PREVIOUS` pattern if the code supports it — check `lib/ats` before changing. | — |

### 3.6 AI providers — rotate, scope, cap spend

Rotate a key: create the new key → paste into Superadmin → Settings → LLM keys (or server secrets) → test with the **Test** button → delete the old key in the provider console.

| Provider | Least privilege | Spending limit |
|----------|-----------------|----------------|
| OpenAI | One **project** per environment; project-scoped keys with **Restricted** permissions (only the model endpoints used). | Organization → Limits: monthly budget + email threshold; per-project budgets. |
| Anthropic | One **workspace** per environment; keys created inside it. | Console → Limits: workspace spend limit and rate limits. |
| Google Gemini (AI Studio / Vertex) | Key restricted to Generative Language API in a dedicated project. | Billing budgets & alerts; API quotas. |
| OpenRouter | One key per environment. | Per-key **credit limit** on the key settings. |
| Groq, NVIDIA, DeepSeek, Mistral, Together/Fireworks, etc. | One key per environment; delete unused ones (the settings page lists every provider key). | Use the provider's spend cap or prepaid credits only (no auto-recharge) for providers without hard caps. |

The app also caps spend itself (per-user AI rate limits, copilot budgets in Superadmin → Copilot). Provider-side caps are the backstop if a key leaks.

### 3.7 Payments

- **Stripe** — Dashboard → Developers → **API keys → Roll key** (choose an expiry for the old key so both work during the deploy). Prefer a **restricted key** (`rk_live_…`) with only Checkout Sessions, Payment Intents, Customers, Refunds, Connect (marketplace payouts) write access. Webhooks → endpoint → **Roll signing secret** → update `STRIPE_WEBHOOK_SECRET` (subscriptions) and the marketplace webhook secret. Test mode keys only outside production.
- **Razorpay** — Dashboard → Account & Settings → **API Keys → Regenerate**; Webhooks → edit → new secret → `RAZORPAY_WEBHOOK_SECRET`.
- **PhonePe** — merchant dashboard / PhonePe support: request a new **salt key + index** for PROD; update server-secrets; UAT credentials stay in non-production only.
- Payout and refund actions in the app are admin-gated and audit-logged (`marketplace_audit`, `admin_audit_logs`).

### 3.8 Messaging, voice and verification providers

- **Meta / WhatsApp Cloud API** — Business Manager → System users → generate a new **system-user token** with only `whatsapp_business_messaging` (+ `whatsapp_business_management` if templates are managed from the app) on the one WABA; revoke the old token. App dashboard → Settings → Basic → **Reset app secret** (used for `X-Hub-Signature-256` webhook checks). Change the webhook verify token in both places.
- **Vapi** — Dashboard → API keys: create new private key, delete old; rotate the server-URL secret used by `/api/ats/screening/webhooks/vapi` (`x-vapi-secret`).
- **Twilio** — Console → Account → API keys & tokens: create a **secondary auth token**, deploy it, then **promote** it (the old primary stops working). Prefer an API key/secret pair scoped to the sub-account.
- **Exotel** — API settings: regenerate the API token; update the shared webhook token.
- **Checkr** — Account settings → Developer settings: create a new API key, update it per tenant in the ATS BGV settings, delete the old key (Checkr signs webhooks with the API key, so the webhook check follows automatically).
- **Didit (KYC)** — dashboard: new API key + webhook secret → `DIDIT_API_KEY`, `DIDIT_WEBHOOK_SECRET`.
- **Postal** — Postal UI → server → Credentials: new API credential; delete the old one.
- **Cloudflare** — use **API tokens** (not the Global API key) scoped to the one zone with only `Zone.Cache Purge` (CDN purge) and, separately, R2 tokens scoped to the one bucket with Object Read & Write. Turnstile: widget → rotate secret key.
- **R2 / S3** — bucket stays **private** (no public bucket/`r2.dev` access, no `public-read` ACLs); the app only serves objects through short-lived signed URLs (`lib/s3-storage.ts`, 1 h). Access keys scoped to that bucket.
- **Upstash Redis, LiveKit, GitHub OAuth app** — regenerate in their consoles; GitHub OAuth app → Generate a new client secret → delete the old one.

---

## 4. Purging the history (after rotation)

Rotation is what protects you; the purge only reduces noise and stops scanners re-flagging the repo. Do it once, coordinated, with all collaborators.

1. **Freeze**: announce a window; merge or park open PRs (their branches will need rebasing onto the rewritten history).
2. Fresh mirror clone (never on a working copy):

   ```bash
   git clone --mirror git@github.com:<owner>/CodeSpectra-Master.git cs-purge.git
   cd cs-purge.git
   pip install git-filter-repo    # or: brew install git-filter-repo
   ```

3. Remove the leaked files from every commit:

   ```bash
   git filter-repo --invert-paths \
     --path frontend/check_fb.js --path frontend/check_fb2.js --path frontend/fb_check.js \
     --path AUDIT-REPORT.md
   ```

4. Replace leaked values that sit inside files you keep (`WORKING.md`, `scripts/backup/*.sh`, `frontend/scripts/generate-question-bank-45k.ts`). Write the **old** values into a local file outside the repo — one per line, `literal:<old value>==>REDACTED` — then:

   ```bash
   git filter-repo --replace-text ../leaked-values.txt
   shred -u ../leaked-values.txt
   ```

5. Verify: `gitleaks git . --config <path-to>/.gitleaks.toml --redact` → no findings (except allowlisted fixtures).
6. Push (this is the one time a force-push is expected; only the owner does it, and only after steps 1–5):

   ```bash
   git push --force --mirror
   ```

   If branch protection blocks it, temporarily allow force-pushes on `main` for the owner, push, then re-enable.
7. **GitHub caches**: old commits stay reachable by SHA (PR refs, forks). Open a GitHub Support request ("remove cached views / sensitive data") listing the commit SHAs from §1 and ask them to run garbage collection. Forks made before the purge keep the old history — another reason rotation comes first.
8. **Collaborators**: everyone must **delete their clone and re-clone** (`git clone git@github.com:<owner>/CodeSpectra-Master.git`). Do not `git pull` into an old clone — merging old history back re-introduces the secrets. Rebase any in-flight branch onto the new `main` with `git rebase --onto origin/main <old-base> <branch>` from a fresh clone, or re-apply the diff as a patch. CI caches and Dokploy build caches can be left alone (they don't push).

---

## 5. GitHub repository security settings (owner, one-time)

Settings → **Code security** (or "Advanced Security") for this public repository — all free for public repos:

1. **Secret scanning → Enable.**
2. **Push protection → Enable** (blocks pushes that contain a recognised provider secret; contributors see a bypass prompt that is logged).
3. Optional: **Secret scanning → Custom patterns** — add the MongoDB-URI and `INTERNAL_BACKEND_SECRET` patterns from `.gitleaks.toml`.
4. **Dependency graph → Enable**, **Dependabot alerts → Enable**, **Dependabot security updates → Enable** (opens fix PRs). Optionally add `.github/dependabot.yml` for version updates of `npm` (`/frontend`), `pip` (`/backend`) and `github-actions` (`/`).
5. **Code scanning → CodeQL → Set up → Default** (languages: JavaScript/TypeScript, Python, Actions). Choose "on push and pull request to main" + weekly schedule.
6. **Private vulnerability reporting → Enable** (Security tab) so researchers report privately; add a `SECURITY.md` with the contact address.
7. Branch protection / ruleset for `main`: require PR review, require the CI checks (`Secret scan (gitleaks)`, unit tests, build), block force-pushes (except the one-time purge in §4), require signed commits if the team can.
8. Settings → Actions → General: **Workflow permissions = Read repository contents** (the CI already sets per-job `permissions`), and "Require approval for all outside collaborators" for fork PRs.

---

## 6. Prevent the next leak

- **Pre-commit hook** (every developer, once per clone):
  - `pipx install pre-commit && pre-commit install` (uses `.pre-commit-config.yaml`, gitleaks v8.24.3), **or**
  - install gitleaks (`brew install gitleaks`, or a release binary) and `git config core.hooksPath scripts/git-hooks`.
  - False positive? Add a narrow entry to `.gitleaks.toml` `[allowlist]` (exact regex or fixture path) in a reviewed PR — never `--no-verify`.
- **CI**: the `secrets` job runs gitleaks with `.gitleaks.toml` on every push/PR (full fetch depth). Keep the config to the single `[allowlist]` table so gitleaks 8.24 (pinned by the action) and newer local versions agree.
- **Custom rules** in `.gitleaks.toml`: MongoDB / Postgres / Redis / AMQP URIs with inline passwords, Firebase service-account `private_key` and `private_key_id`, escaped PEM private keys, and literal values for CodeSpectra server secrets (`INTERNAL_BACKEND_SECRET`, `SESSION_SECRET`, encryption keys, cron/webhook secrets).
- **Logs**: server logs are redacted automatically — `lib/log-redact.ts` wraps `console.*` in the Next.js server (installed from `instrumentation.ts`; `LOG_REDACTION=0` disables) and `lib/logger.ts`; the FastAPI backend installs `core/log_redact.py` at start-up. Still: never log request bodies, headers or tokens on purpose.
- **Screenshots and demos**: blur keys, tokens, cookies, emails and invite links before sharing; don't screenshot the settings pages with "reveal" toggled on. Reviewed 2026-10-20: the committed screenshots (`frontend/e2e/screenshots_*.png`, `frontend/extensions/**/screenshot*`) show public pages only.
- **Docs**: use obvious placeholders (`<password>`, `${MONGO_PASSWORD}`, `sk_test_…`) — the rules ignore template syntax.
- **Frontend bundle**: only `NEXT_PUBLIC_*` values reach the browser. Today these are the app/site URL, Turnstile site key, Firebase web config + VAPID key, GitHub OAuth client id and the Supabase URL — all public by design. Never prefix a secret with `NEXT_PUBLIC_`.
