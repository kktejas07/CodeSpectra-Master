-- Codeathons (Hackathons/Coding Competitions) Schema

-- Codeathons table
CREATE TABLE IF NOT EXISTS codeathons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  short_description VARCHAR(500),
  start_date TIMESTAMP WITH TIME ZONE NOT NULL,
  end_date TIMESTAMP WITH TIME ZONE NOT NULL,
  registration_deadline TIMESTAMP WITH TIME ZONE,
  max_participants INTEGER,
  current_participants INTEGER DEFAULT 0,
  team_size_min INTEGER DEFAULT 1,
  team_size_max INTEGER DEFAULT 4,
  difficulty_level VARCHAR(50) DEFAULT 'intermediate',
  prize_pool VARCHAR(255),
  prizes JSONB DEFAULT '[]',
  rules TEXT,
  judging_criteria JSONB DEFAULT '[]',
  technologies TEXT[] DEFAULT '{}',
  status VARCHAR(50) DEFAULT 'upcoming',
  is_active BOOLEAN DEFAULT true,
  banner_url TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Codeathon challenges/problems
CREATE TABLE IF NOT EXISTS codeathon_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codeathon_id UUID NOT NULL REFERENCES codeathons(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  difficulty VARCHAR(50) DEFAULT 'medium',
  points INTEGER DEFAULT 100,
  test_cases JSONB DEFAULT '[]',
  starter_code JSONB DEFAULT '{}',
  solution TEXT,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Codeathon registrations
CREATE TABLE IF NOT EXISTS codeathon_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codeathon_id UUID NOT NULL REFERENCES codeathons(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  team_name VARCHAR(255),
  team_members JSONB DEFAULT '[]',
  registered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status VARCHAR(50) DEFAULT 'registered',
  UNIQUE(codeathon_id, user_id)
);

-- Codeathon submissions
CREATE TABLE IF NOT EXISTS codeathon_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codeathon_id UUID NOT NULL REFERENCES codeathons(id) ON DELETE CASCADE,
  challenge_id UUID REFERENCES codeathon_challenges(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  registration_id UUID REFERENCES codeathon_registrations(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  language VARCHAR(50) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  score INTEGER,
  execution_time_ms INTEGER,
  memory_used_kb INTEGER,
  test_results JSONB DEFAULT '[]',
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Leaderboard view
CREATE TABLE IF NOT EXISTS codeathon_leaderboard (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codeathon_id UUID NOT NULL REFERENCES codeathons(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  total_score INTEGER DEFAULT 0,
  problems_solved INTEGER DEFAULT 0,
  last_submission_at TIMESTAMP WITH TIME ZONE,
  rank INTEGER,
  UNIQUE(codeathon_id, user_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_codeathons_status ON codeathons(status);
CREATE INDEX IF NOT EXISTS idx_codeathons_start_date ON codeathons(start_date);
CREATE INDEX IF NOT EXISTS idx_codeathon_registrations_codeathon ON codeathon_registrations(codeathon_id);
CREATE INDEX IF NOT EXISTS idx_codeathon_registrations_user ON codeathon_registrations(user_id);
CREATE INDEX IF NOT EXISTS idx_codeathon_submissions_codeathon ON codeathon_submissions(codeathon_id);
CREATE INDEX IF NOT EXISTS idx_codeathon_submissions_user ON codeathon_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_codeathon_leaderboard_score ON codeathon_leaderboard(codeathon_id, total_score DESC);

-- RLS Policies
ALTER TABLE codeathons ENABLE ROW LEVEL SECURITY;
ALTER TABLE codeathon_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE codeathon_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE codeathon_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE codeathon_leaderboard ENABLE ROW LEVEL SECURITY;

-- Codeathons: Anyone can view active
CREATE POLICY "Anyone can view active codeathons"
  ON codeathons FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins can manage codeathons"
  ON codeathons FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

-- Challenges: Visible to registered users during event
CREATE POLICY "Registered users can view challenges"
  ON codeathon_challenges FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM codeathon_registrations cr
      JOIN codeathons c ON c.id = cr.codeathon_id
      WHERE cr.user_id = auth.uid()
      AND cr.codeathon_id = codeathon_challenges.codeathon_id
      AND c.status = 'active'
    )
    OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

-- Registrations: Users manage their own
CREATE POLICY "Users manage their registrations"
  ON codeathon_registrations FOR ALL
  USING (user_id = auth.uid());

-- Submissions: Users manage their own
CREATE POLICY "Users manage their submissions"
  ON codeathon_submissions FOR ALL
  USING (user_id = auth.uid());

-- Leaderboard: Public view
CREATE POLICY "Anyone can view leaderboard"
  ON codeathon_leaderboard FOR SELECT
  USING (true);

-- Function to update participant count
CREATE OR REPLACE FUNCTION update_codeathon_participant_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE codeathons SET current_participants = current_participants + 1 WHERE id = NEW.codeathon_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE codeathons SET current_participants = current_participants - 1 WHERE id = OLD.codeathon_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_codeathon_participants
AFTER INSERT OR DELETE ON codeathon_registrations
FOR EACH ROW EXECUTE FUNCTION update_codeathon_participant_count();
