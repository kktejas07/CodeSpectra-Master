-- Codeathons Tables Migration
CREATE TABLE IF NOT EXISTS codeathons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  start_date TIMESTAMP WITH TIME ZONE NOT NULL,
  end_date TIMESTAMP WITH TIME ZONE NOT NULL,
  registration_deadline TIMESTAMP WITH TIME ZONE NOT NULL,
  location VARCHAR(255),
  is_remote BOOLEAN DEFAULT true,
  prize_pool INTEGER,
  max_participants INTEGER,
  difficulty_level VARCHAR(50) DEFAULT 'intermediate',
  theme VARCHAR(255),
  rules TEXT,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_codeathons_is_active ON codeathons(is_active);
CREATE INDEX IF NOT EXISTS idx_codeathons_created_by ON codeathons(created_by);

CREATE TABLE IF NOT EXISTS codeathon_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codeathon_id UUID NOT NULL REFERENCES codeathons(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  difficulty VARCHAR(50),
  points INTEGER DEFAULT 100,
  time_limit_minutes INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_codeathon_challenges_codeathon_id ON codeathon_challenges(codeathon_id);

CREATE TABLE IF NOT EXISTS codeathon_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codeathon_id UUID NOT NULL REFERENCES codeathons(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  team_name VARCHAR(255),
  team_members UUID[],
  registration_status VARCHAR(50) DEFAULT 'registered',
  registered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(codeathon_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_codeathon_registrations_codeathon_id ON codeathon_registrations(codeathon_id);
CREATE INDEX IF NOT EXISTS idx_codeathon_registrations_user_id ON codeathon_registrations(user_id);

CREATE TABLE IF NOT EXISTS codeathon_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codeathon_id UUID NOT NULL REFERENCES codeathons(id) ON DELETE CASCADE,
  challenge_id UUID REFERENCES codeathon_challenges(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  language VARCHAR(50),
  submission_status VARCHAR(50) DEFAULT 'pending',
  test_results JSONB,
  score INTEGER,
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_codeathon_submissions_codeathon_id ON codeathon_submissions(codeathon_id);
CREATE INDEX IF NOT EXISTS idx_codeathon_submissions_user_id ON codeathon_submissions(user_id);

CREATE TABLE IF NOT EXISTS codeathon_leaderboard (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codeathon_id UUID NOT NULL REFERENCES codeathons(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rank INTEGER,
  score INTEGER DEFAULT 0,
  challenges_solved INTEGER DEFAULT 0,
  submission_count INTEGER DEFAULT 0,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_codeathon_leaderboard_codeathon_id ON codeathon_leaderboard(codeathon_id);
