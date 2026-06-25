-- Phase 4: allow authenticated users to insert issues and AI suggested fixes for their own scans.

DROP POLICY IF EXISTS "Users can insert issues for own scans" ON public.code_issues;
CREATE POLICY "Users can insert issues for own scans" ON public.code_issues
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.code_scans s
      WHERE s.id = code_issues.scan_id AND s.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert suggested fixes for own scans" ON public.suggested_fixes;
CREATE POLICY "Users can insert suggested fixes for own scans" ON public.suggested_fixes
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.code_scans s
      WHERE s.id = suggested_fixes.scan_id AND s.user_id = auth.uid()
    )
  );
