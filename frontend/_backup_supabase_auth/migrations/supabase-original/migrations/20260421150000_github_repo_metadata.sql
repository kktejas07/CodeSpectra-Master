-- Phase 3: cached GitHub repo list per user (metadata sync on repo browser fetch).

CREATE TABLE IF NOT EXISTS public.github_repo_metadata (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  github_repo_id bigint NOT NULL,
  full_name text NOT NULL,
  name text NOT NULL,
  description text,
  html_url text,
  default_branch text,
  private boolean NOT NULL DEFAULT false,
  language text,
  stargazers_count integer NOT NULL DEFAULT 0,
  github_updated_at timestamptz,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, github_repo_id)
);

CREATE INDEX IF NOT EXISTS github_repo_metadata_user_synced_idx
  ON public.github_repo_metadata (user_id, last_synced_at DESC);

CREATE INDEX IF NOT EXISTS github_repo_metadata_full_name_idx
  ON public.github_repo_metadata (user_id, full_name);

ALTER TABLE public.github_repo_metadata ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.github_repo_metadata TO authenticated;

DROP POLICY IF EXISTS github_repo_metadata_insert_own ON public.github_repo_metadata;
CREATE POLICY github_repo_metadata_insert_own
  ON public.github_repo_metadata
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS github_repo_metadata_update_own ON public.github_repo_metadata;
CREATE POLICY github_repo_metadata_update_own
  ON public.github_repo_metadata
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS github_repo_metadata_delete_own ON public.github_repo_metadata;
CREATE POLICY github_repo_metadata_delete_own
  ON public.github_repo_metadata
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS github_repo_metadata_select_own_or_superadmin ON public.github_repo_metadata;
CREATE POLICY github_repo_metadata_select_own_or_superadmin
  ON public.github_repo_metadata
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.codespectra_is_superadmin());
