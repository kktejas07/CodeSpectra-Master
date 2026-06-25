-- Inbound GitHub webhook audit log (written by service role from /api/github/webhook).

CREATE TABLE IF NOT EXISTS public.github_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id TEXT,
  event_type TEXT NOT NULL,
  action TEXT,
  repository_full_name TEXT,
  payload JSONB,
  received_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_github_webhook_events_received ON public.github_webhook_events (received_at DESC);
CREATE INDEX IF NOT EXISTS idx_github_webhook_events_repo ON public.github_webhook_events (repository_full_name);

-- No policies: only the Supabase **service role** (server webhook route) can write; clients cannot access this table.
ALTER TABLE public.github_webhook_events ENABLE ROW LEVEL SECURITY;
