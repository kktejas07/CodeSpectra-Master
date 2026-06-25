-- Resumes and AI Analysis Schema

-- Resumes table
CREATE TABLE IF NOT EXISTS resumes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  file_url TEXT NOT NULL,
  file_size INTEGER,
  file_type VARCHAR(50),
  is_primary BOOLEAN DEFAULT false,
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Resume analysis results
CREATE TABLE IF NOT EXISTS resume_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resume_id UUID NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
  status VARCHAR(50) DEFAULT 'pending',
  
  -- Extracted data
  extracted_name VARCHAR(255),
  extracted_email VARCHAR(255),
  extracted_phone VARCHAR(50),
  extracted_location VARCHAR(255),
  extracted_summary TEXT,
  
  -- Skills analysis
  skills JSONB DEFAULT '[]',
  skill_categories JSONB DEFAULT '{}',
  
  -- Experience analysis
  total_experience_years DECIMAL(4,1),
  experiences JSONB DEFAULT '[]',
  
  -- Education analysis
  education JSONB DEFAULT '[]',
  highest_degree VARCHAR(100),
  
  -- Certifications
  certifications JSONB DEFAULT '[]',
  
  -- AI scoring
  overall_score INTEGER,
  ats_score INTEGER,
  formatting_score INTEGER,
  content_score INTEGER,
  
  -- Recommendations
  recommendations JSONB DEFAULT '[]',
  keyword_suggestions JSONB DEFAULT '[]',
  
  -- Raw extracted text
  raw_text TEXT,
  
  analyzed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  error_message TEXT
);

-- Resume-Job matching
CREATE TABLE IF NOT EXISTS resume_job_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resume_id UUID NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES job_postings(id) ON DELETE CASCADE,
  match_score INTEGER,
  matching_skills JSONB DEFAULT '[]',
  missing_skills JSONB DEFAULT '[]',
  recommendations JSONB DEFAULT '[]',
  matched_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(resume_id, job_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_resumes_user_id ON resumes(user_id);
CREATE INDEX IF NOT EXISTS idx_resumes_primary ON resumes(user_id, is_primary) WHERE is_primary = true;
CREATE INDEX IF NOT EXISTS idx_resume_analyses_resume_id ON resume_analyses(resume_id);
CREATE INDEX IF NOT EXISTS idx_resume_analyses_status ON resume_analyses(status);
CREATE INDEX IF NOT EXISTS idx_resume_job_matches_resume ON resume_job_matches(resume_id);
CREATE INDEX IF NOT EXISTS idx_resume_job_matches_job ON resume_job_matches(job_id);

-- RLS Policies
ALTER TABLE resumes ENABLE ROW LEVEL SECURITY;
ALTER TABLE resume_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE resume_job_matches ENABLE ROW LEVEL SECURITY;

-- Resumes: Users manage their own
CREATE POLICY "Users manage their resumes"
  ON resumes FOR ALL
  USING (user_id = auth.uid());

-- Analysis: Users view their own
CREATE POLICY "Users view their resume analyses"
  ON resume_analyses FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM resumes
      WHERE resumes.id = resume_analyses.resume_id
      AND resumes.user_id = auth.uid()
    )
  );

-- Matches: Users view their own
CREATE POLICY "Users view their job matches"
  ON resume_job_matches FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM resumes
      WHERE resumes.id = resume_job_matches.resume_id
      AND resumes.user_id = auth.uid()
    )
  );

-- Admin access
CREATE POLICY "Admins can view all resumes"
  ON resumes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

-- Function to ensure only one primary resume per user
CREATE OR REPLACE FUNCTION ensure_single_primary_resume()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_primary = true THEN
    UPDATE resumes SET is_primary = false 
    WHERE user_id = NEW.user_id AND id != NEW.id AND is_primary = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_ensure_single_primary_resume
BEFORE INSERT OR UPDATE ON resumes
FOR EACH ROW EXECUTE FUNCTION ensure_single_primary_resume();
