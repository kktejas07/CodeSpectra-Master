-- Phase 3: allow signed-in users to record manual scans (API uses cookie session + RLS).

ALTER TABLE public.code_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.code_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert own code scans" ON public.code_scans;
CREATE POLICY "Users can insert own code scans" ON public.code_scans
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own code scans" ON public.code_scans;
CREATE POLICY "Users can update own code scans" ON public.code_scans
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert metrics for own scans" ON public.code_metrics;
CREATE POLICY "Users can insert metrics for own scans" ON public.code_metrics
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.code_scans s
      WHERE s.id = scan_id AND s.user_id = auth.uid()
    )
  );
