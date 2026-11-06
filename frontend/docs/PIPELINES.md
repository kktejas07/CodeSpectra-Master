# CodeSpectra Automated Pipelines

All pipelines are scheduled through a single external cron endpoint. On **Vercel**
the `vercel.json` cron fires `/api/cron/tick` every minute; on other platforms
configure your scheduler to `POST /api/cron/tick` every minute with
`Authorization: Bearer $CRON_SECRET`.

`platform-cron.ts` picks up every downstream schedule (daily digest, signals
ingest, ebooks, practice problems, …) from that one tick. Set
`PLATFORM_CRON_IN_PROCESS=0` to disable the in-process fallback loop.

---

## Pipeline map

| Pipeline | Schedule | Cron route | Trigger |
|---|---|---|---|
| Tick (entry point) | every minute | `/api/cron/tick` | Vercel cron / external |
| Daily digest | 08:00 UTC | `/api/cron/daily-digest` | via tick |
| Weekly digest | Mon 09:00 UTC | `/api/cron/weekly-digest` | via tick |
| Signals ingest | every 6 h | `/api/cron/signals-ingest` | via tick |
| Ebook drafts | 07:00 UTC daily | `/api/cron/ebooks-daily` | via tick |
| Practice problems | 06:00 UTC daily | `/api/cron/practice-daily` | via tick |
| Exam reminders | every hour | `/api/cron/exam-reminders` | via tick |
| Security scan | Sun 03:00 UTC | `/api/cron/security-scan` | via tick |
| Problem backfill | Mon 03:17 UTC | GitHub Actions workflow | GH schedule |
| Course generation | on startup + every 12 h | Python backend scheduler | backend service |

---

## Required env vars per pipeline

### All pipelines (baseline)
```
MONGODB_URI            # required — MongoDB connection string
CRON_SECRET            # required — shared secret for cron route auth
NEXT_PUBLIC_APP_URL    # required — public origin (links in emails, digests)
```

### AI-driven pipelines (signals ingest, blog auto-draft, ebooks, practice)
At least one of:
```
GROQ_API_KEY
GOOGLE_GEMINI_API_KEY   # or GEMINI_API_KEY
CEREBRAS_API_KEY
OPENAI_API_KEY
ANTHROPIC_API_KEY
OPENROUTER_API_KEY
BROCODE_API_KEY         # custom proxy — brocode.live
```
The provider fallback chain (`lib/ai/provider-fallback.ts`) tries each in order.

### Redis (rate limiting, job leases, dedup)
```
UPSTASH_REDIS_REST_URL    # required in prod; falls back to in-memory (single instance only)
UPSTASH_REDIS_REST_TOKEN
```

### Daily / weekly digest
No extra vars beyond baseline + AI + Redis.  
Email delivery via `POSTAL_*` vars (see below).

### Signals ingest + blog auto-draft
```
GOOGLE_CSE_API_KEY    # web research in auto-draft deep-research step
GOOGLE_CSE_CX         # custom search engine id
```

### Ebook drafts (PDF generation)
```
R2_ACCOUNT_ID         # Cloudflare R2 for PDF storage
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET
```

### Email notifications (digest subscriber emails)
```
POSTAL_SERVER         # SMTP/Postal server host
POSTAL_API_KEY
POSTAL_FROM_EMAIL     # e.g. no-reply@codespectra.ai
```

### Problem backfill (GitHub Actions)
Set as **repository secrets** in Settings → Secrets → Actions:
```
MONGODB_URI
MONGODB_DB_NAME        # optional, default "codespectra"
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
GROQ_API_KEY
GOOGLE_GEMINI_API_KEY
CEREBRAS_API_KEY
OPENAI_API_KEY
BROCODE_API_KEY
```

### Course generation (Python backend)
```
INTERNAL_BACKEND_URL      # URL of the Python backend service
INTERNAL_BACKEND_SECRET   # shared secret for Next → backend calls
# AI keys forwarded to backend (backend reads its own .env):
OPENAI_API_KEY
ANTHROPIC_API_KEY
GROQ_API_KEY
SCHEDULER_TOPICS          # optional — pipe-separated "tech:level:goal" tuples
```

---

## Vercel setup checklist

1. `frontend/vercel.json` — already committed; sets `* * * * *` cron on `/api/cron/tick`.
2. Set all required env vars in Vercel project settings (or via Vercel CLI).
3. The `CRON_SECRET` Vercel sends automatically matches what `isCronAuthorized` checks.
4. For the Python backend deploy separately; set `INTERNAL_BACKEND_URL` in Vercel to point to it.

## GitHub Actions setup checklist

1. Go to repo → Settings → Secrets → Actions.
2. Add all secrets listed under **Problem backfill** above.
3. The `weekly-problem-backfill.yml` workflow runs every Monday at 03:17 UTC automatically.
   Trigger manually from Actions → "Weekly Problem Backfill" → Run workflow.
