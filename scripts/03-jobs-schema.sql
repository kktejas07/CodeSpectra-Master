-- Jobs and Applications Schema
-- Run this migration to add job posting functionality

-- Job postings table
CREATE TABLE IF NOT EXISTS job_postings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  company VARCHAR(255) NOT NULL,
  location VARCHAR(255) NOT NULL,
  job_type VARCHAR(50) NOT NULL DEFAULT 'full-time',
  experience_level VARCHAR(50) NOT NULL DEFAULT 'mid-level',
  salary_min INTEGER,
  salary_max INTEGER,
  salary_currency VARCHAR(10) DEFAULT 'USD',
  description TEXT NOT NULL,
  requirements TEXT,
  benefits TEXT,
  skills TEXT[] DEFAULT '{}',
  is_remote BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  applicant_count INTEGER DEFAULT 0,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE
);

-- Job applications table
CREATE TABLE IF NOT EXISTS job_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES job_postings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  resume_id UUID REFERENCES resumes(id) ON DELETE SET NULL,
  cover_letter TEXT,
  status VARCHAR(50) DEFAULT 'pending',
  notes TEXT,
  applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  reviewed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  UNIQUE(job_id, user_id)
);

-- Saved jobs (bookmarks)
CREATE TABLE IF NOT EXISTS saved_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES job_postings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  saved_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(job_id, user_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_job_postings_active ON job_postings(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_job_postings_created_at ON job_postings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_postings_location ON job_postings(location);
CREATE INDEX IF NOT EXISTS idx_job_postings_job_type ON job_postings(job_type);
CREATE INDEX IF NOT EXISTS idx_job_applications_job_id ON job_applications(job_id);
CREATE INDEX IF NOT EXISTS idx_job_applications_user_id ON job_applications(user_id);
CREATE INDEX IF NOT EXISTS idx_job_applications_status ON job_applications(status);

-- RLS Policies
ALTER TABLE job_postings ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_jobs ENABLE ROW LEVEL SECURITY;

-- Job postings: Anyone can view active jobs, admins can manage
CREATE POLICY "Anyone can view active job postings"
  ON job_postings FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins can manage job postings"
  ON job_postings FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

-- Job applications: Users can view/manage their own, admins can view all
CREATE POLICY "Users can view their own applications"
  ON job_applications FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can create applications"
  ON job_applications FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can view all applications"
  ON job_applications FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

-- Saved jobs: Users manage their own
CREATE POLICY "Users manage their saved jobs"
  ON saved_jobs FOR ALL
  USING (user_id = auth.uid());

-- Function to update applicant count
CREATE OR REPLACE FUNCTION update_applicant_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE job_postings SET applicant_count = applicant_count + 1 WHERE id = NEW.job_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE job_postings SET applicant_count = applicant_count - 1 WHERE id = OLD.job_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_applicant_count
AFTER INSERT OR DELETE ON job_applications
FOR EACH ROW EXECUTE FUNCTION update_applicant_count();
