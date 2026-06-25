-- Resumes Tables Migration
CREATE TABLE IF NOT EXISTS resumes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  file_size INTEGER,
  file_path VARCHAR(512),
  is_primary BOOLEAN DEFAULT false,
  upload_status VARCHAR(50) DEFAULT 'processing',
  analysis_status VARCHAR(50) DEFAULT 'pending',
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_resumes_user_id ON resumes(user_id);
CREATE INDEX IF NOT EXISTS idx_resumes_is_primary ON resumes(is_primary);

CREATE TABLE IF NOT EXISTS resume_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resume_id UUID NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
  extracted_data JSONB,
  skills TEXT[],
  experience_summary TEXT,
  education_summary TEXT,
  suggestions JSONB,
  ai_score DECIMAL(3,1),
  analyzed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_resume_analyses_resume_id ON resume_analyses(resume_id);

CREATE TABLE IF NOT EXISTS resume_job_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resume_id UUID NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES job_postings(id) ON DELETE CASCADE,
  match_percentage DECIMAL(3,1),
  matched_skills TEXT[],
  missing_skills TEXT[],
  matched_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_resume_job_matches_resume_id ON resume_job_matches(resume_id);
CREATE INDEX IF NOT EXISTS idx_resume_job_matches_job_id ON resume_job_matches(job_id);
