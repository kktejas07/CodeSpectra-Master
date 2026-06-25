-- Phase 3: GitHub App installation id + queue kind (sweep vs push).
-- Phase 7: RLS on scan_comments for collaboration API.

ALTER TABLE public.github_integrations
  ADD COLUMN IF NOT EXISTS github_app_installation_id BIGINT,
  ADD COLUMN IF NOT EXISTS integration_kind TEXT NOT NULL DEFAULT 'oauth'
    CHECK (integration_kind IN ('oauth', 'github_app'));

CREATE INDEX IF NOT EXISTS idx_github_integrations_app_installation
  ON public.github_integrations (github_app_installation_id)
  WHERE github_app_installation_id IS NOT NULL;

ALTER TABLE public.github_webhook_scan_queue
  ADD COLUMN IF NOT EXISTS queue_kind TEXT NOT NULL DEFAULT 'push'
    CHECK (queue_kind IN ('push', 'sweep'));

ALTER TABLE public.scan_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS scan_comments_select_participants ON public.scan_comments;
CREATE POLICY scan_comments_select_participants
  ON public.scan_comments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.code_scans s
      WHERE s.id = scan_comments.scan_id AND s.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS scan_comments_insert_own_scan ON public.scan_comments;
CREATE POLICY scan_comments_insert_own_scan
  ON public.scan_comments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.code_scans s
      WHERE s.id = scan_comments.scan_id AND s.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS scan_comments_update_own ON public.scan_comments;
CREATE POLICY scan_comments_update_own
  ON public.scan_comments
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
