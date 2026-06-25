-- Face Recognition, OAuth tokens, levels, competencies
-- Note: achievements + user_achievements already exist in 20260416000000_create_initial_schema.sql

-- Face Recognition Data Storage
CREATE TABLE IF NOT EXISTS public.face_recognition_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  face_embedding TEXT NOT NULL,
  face_metadata JSONB,
  enrollment_date TIMESTAMP DEFAULT NOW(),
  last_verified TIMESTAMP,
  is_verified BOOLEAN DEFAULT false
);

-- OAuth Tokens Storage (sensitive — encrypt at application layer or use Vault; Postgres has no TEXT ENCRYPTED)
CREATE TABLE IF NOT EXISTS public.oauth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMP,
  connected_at TIMESTAMP DEFAULT NOW(),
  last_used TIMESTAMP,
  UNIQUE(user_id, provider)
);

-- Level/XP Tracking
CREATE TABLE IF NOT EXISTS public.user_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  level INT DEFAULT 1,
  total_xp INT DEFAULT 0,
  current_xp INT DEFAULT 0,
  xp_for_next_level INT DEFAULT 1000,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Competency Map
CREATE TABLE IF NOT EXISTS public.user_competencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  skill_name VARCHAR(100) NOT NULL,
  proficiency_percentage INT DEFAULT 0,
  hours_practiced INT DEFAULT 0,
  last_updated TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, skill_name)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_face_recognition_user_id ON public.face_recognition_data(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_user_id ON public.oauth_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_provider ON public.oauth_tokens(provider);
CREATE INDEX IF NOT EXISTS idx_user_achievements_user_id ON public.user_achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_user_levels_user_id ON public.user_levels(user_id);
CREATE INDEX IF NOT EXISTS idx_user_competencies_user_id ON public.user_competencies(user_id);

-- RLS: new tables
ALTER TABLE public.face_recognition_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oauth_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_competencies ENABLE ROW LEVEL SECURITY;

-- achievements had no RLS in initial schema; enable read for authenticated
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;

-- Policies (only where not already defined in initial migration)
CREATE POLICY "Users can view their own face data" ON public.face_recognition_data
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can view their own oauth tokens" ON public.oauth_tokens
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can view achievements" ON public.achievements
  FOR SELECT USING (true);

CREATE POLICY "Users can view their own level" ON public.user_levels
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can view their own competencies" ON public.user_competencies
  FOR SELECT USING (user_id = auth.uid());

GRANT ALL ON public.face_recognition_data TO authenticated;
GRANT ALL ON public.oauth_tokens TO authenticated;
GRANT ALL ON public.achievements TO authenticated;
GRANT ALL ON public.user_achievements TO authenticated;
GRANT ALL ON public.user_levels TO authenticated;
GRANT ALL ON public.user_competencies TO authenticated;
