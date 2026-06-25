-- Phase 6: Real User Monitoring (Web Vitals) stored in Supabase — no third-party analytics required.

CREATE TABLE IF NOT EXISTS public.web_vitals_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  route text,
  metric_name text NOT NULL,
  metric_value double precision NOT NULL,
  metric_rating text,
  metric_id text,
  navigation_type text,
  client_ts timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS web_vitals_events_user_created_at_idx
  ON public.web_vitals_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS web_vitals_events_created_at_idx
  ON public.web_vitals_events (created_at DESC);

ALTER TABLE public.web_vitals_events ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON public.web_vitals_events TO authenticated;

DROP POLICY IF EXISTS web_vitals_events_insert_own ON public.web_vitals_events;
CREATE POLICY web_vitals_events_insert_own
  ON public.web_vitals_events
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS web_vitals_events_select_own_or_superadmin ON public.web_vitals_events;
CREATE POLICY web_vitals_events_select_own_or_superadmin
  ON public.web_vitals_events
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.codespectra_is_superadmin());
