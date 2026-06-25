-- Phase 4: quality gates CRUD under RLS; allow marking suggested fixes applied for own scans.

ALTER TABLE public.quality_gates ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.quality_gates ADD COLUMN IF NOT EXISTS custom_rules JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.quality_gates ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE public.quality_gates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert own quality gates" ON public.quality_gates;
CREATE POLICY "Users can insert own quality gates" ON public.quality_gates
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own quality gates" ON public.quality_gates;
CREATE POLICY "Users can update own quality gates" ON public.quality_gates
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own quality gates" ON public.quality_gates;
CREATE POLICY "Users can delete own quality gates" ON public.quality_gates
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

ALTER TABLE public.suggested_fixes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can update suggested fixes for own scans" ON public.suggested_fixes;
CREATE POLICY "Users can update suggested fixes for own scans" ON public.suggested_fixes
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.code_scans s
      WHERE s.id = suggested_fixes.scan_id AND s.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.code_scans s
      WHERE s.id = suggested_fixes.scan_id AND s.user_id = auth.uid()
    )
  );
