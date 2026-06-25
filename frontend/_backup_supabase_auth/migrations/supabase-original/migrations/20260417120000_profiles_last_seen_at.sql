-- Track last in-app activity for admin "Last active" (heartbeat from dashboard client).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.last_seen_at IS 'Updated periodically while the user has an active dashboard session; complements auth last_sign_in_at.';

CREATE INDEX IF NOT EXISTS idx_profiles_last_seen_at ON public.profiles(last_seen_at DESC);
