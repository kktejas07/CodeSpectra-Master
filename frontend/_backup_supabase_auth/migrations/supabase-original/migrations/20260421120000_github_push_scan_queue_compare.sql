-- Phase 3: compare range + owner for webhook queue worker.

ALTER TABLE public.github_webhook_scan_queue
  ADD COLUMN IF NOT EXISTS before_commit_sha TEXT,
  ADD COLUMN IF NOT EXISTS owner_login TEXT;
