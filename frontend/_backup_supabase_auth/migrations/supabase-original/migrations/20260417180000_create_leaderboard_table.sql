-- Leaderboard materialized-style table (referenced by /api/leaderboard and /api/admin/metrics).
-- Migration 20260417140000 only altered RLS; this ensures the table exists on fresh databases.

CREATE TABLE IF NOT EXISTS public.leaderboard (
  user_id UUID PRIMARY KEY REFERENCES public.profiles (id) ON DELETE CASCADE,
  total_points INTEGER NOT NULL DEFAULT 0,
  challenges_solved INTEGER NOT NULL DEFAULT 0,
  rank INTEGER,
  streak INTEGER NOT NULL DEFAULT 0,
  last_submission TIMESTAMPTZ NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_leaderboard_total_points ON public.leaderboard (total_points DESC);

ALTER TABLE public.leaderboard ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read leaderboard" ON public.leaderboard;
CREATE POLICY "Anyone can read leaderboard" ON public.leaderboard
  FOR SELECT USING (true);
