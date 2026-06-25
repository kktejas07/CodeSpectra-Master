-- Platform-wide settings (read/write only via service role API in this repo).
CREATE TABLE IF NOT EXISTS public.platform_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

INSERT INTO public.platform_settings (key, value) VALUES
  (
    'general',
    '{
      "platform_name": "CodeSpectra",
      "support_email": "support@codespectra.com",
      "timezone": "UTC",
      "allow_registration": true,
      "email_notifications": true,
      "maintenance_mode": false
    }'::jsonb
  )
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "No direct platform_settings access" ON public.platform_settings;
CREATE POLICY "No direct platform_settings access" ON public.platform_settings
  FOR ALL USING (false);

-- Public leaderboard reads (client + realtime). Writes remain application-specific.
ALTER TABLE public.leaderboard ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read leaderboard" ON public.leaderboard;
CREATE POLICY "Anyone can read leaderboard" ON public.leaderboard
  FOR SELECT USING (true);
