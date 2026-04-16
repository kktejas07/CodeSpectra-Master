-- Face Recognition and OAuth Tokens Tables

-- Face Recognition Data Storage
CREATE TABLE face_recognition_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  face_embedding TEXT NOT NULL,
  face_metadata JSONB,
  enrollment_date TIMESTAMP DEFAULT NOW(),
  last_verified TIMESTAMP,
  is_verified BOOLEAN DEFAULT false
);

-- OAuth Tokens Storage
CREATE TABLE oauth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,
  access_token TEXT ENCRYPTED,
  refresh_token TEXT ENCRYPTED,
  token_expires_at TIMESTAMP,
  connected_at TIMESTAMP DEFAULT NOW(),
  last_used TIMESTAMP,
  UNIQUE(user_id, provider)
);

-- Achievements/Badges Table
CREATE TABLE achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  icon_url TEXT,
  category VARCHAR(50),
  points INT DEFAULT 0,
  criteria JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- User Achievements (many-to-many)
CREATE TABLE user_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  achievement_id UUID NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
  earned_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, achievement_id)
);

-- Level/XP Tracking
CREATE TABLE user_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  level INT DEFAULT 1,
  total_xp INT DEFAULT 0,
  current_xp INT DEFAULT 0,
  xp_for_next_level INT DEFAULT 1000,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Competency Map
CREATE TABLE user_competencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  skill_name VARCHAR(100) NOT NULL,
  proficiency_percentage INT DEFAULT 0,
  hours_practiced INT DEFAULT 0,
  last_updated TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, skill_name)
);

-- Create indexes
CREATE INDEX idx_face_recognition_user_id ON face_recognition_data(user_id);
CREATE INDEX idx_oauth_tokens_user_id ON oauth_tokens(user_id);
CREATE INDEX idx_oauth_tokens_provider ON oauth_tokens(provider);
CREATE INDEX idx_user_achievements_user_id ON user_achievements(user_id);
CREATE INDEX idx_user_levels_user_id ON user_levels(user_id);
CREATE INDEX idx_user_competencies_user_id ON user_competencies(user_id);

-- Enable RLS
ALTER TABLE face_recognition_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_competencies ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own face data" ON face_recognition_data
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can view their own oauth tokens" ON oauth_tokens
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can view achievements" ON achievements
  FOR SELECT USING (true);

CREATE POLICY "Users can view their own achievements" ON user_achievements
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can view their own level" ON user_levels
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can view their own competencies" ON user_competencies
  FOR SELECT USING (user_id = auth.uid());

GRANT ALL ON face_recognition_data TO authenticated;
GRANT ALL ON oauth_tokens TO authenticated;
GRANT ALL ON achievements TO authenticated;
GRANT ALL ON user_achievements TO authenticated;
GRANT ALL ON user_levels TO authenticated;
GRANT ALL ON user_competencies TO authenticated;
