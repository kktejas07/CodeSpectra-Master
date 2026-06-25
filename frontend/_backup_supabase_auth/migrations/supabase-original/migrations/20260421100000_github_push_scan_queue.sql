-- Phase 3: queue rows for inbound GitHub `push` webhooks (worker / future auto-scan can consume).

CREATE TABLE IF NOT EXISTS public.github_webhook_scan_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id TEXT UNIQUE,
  repository_full_name TEXT NOT NULL,
  ref TEXT,
  head_commit_sha TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'done', 'skipped', 'error')),
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_github_webhook_scan_queue_status_created
  ON public.github_webhook_scan_queue (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_github_webhook_scan_queue_repo
  ON public.github_webhook_scan_queue (repository_full_name);

ALTER TABLE public.github_webhook_scan_queue ENABLE ROW LEVEL SECURITY;
