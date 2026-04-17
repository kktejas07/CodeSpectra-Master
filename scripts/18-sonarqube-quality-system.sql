-- Phase 1: Quality Gates, Ratings & Metrics
-- File: scripts/18-sonarqube-quality-system.sql

-- Quality Ratings Table (Letter grades A-E)
CREATE TABLE IF NOT EXISTS quality_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  branch_name TEXT DEFAULT 'main',
  
  -- Rating components (A-E scale)
  security_rating TEXT DEFAULT 'E', -- A=8+, B=7, C=5, D=3, E=<3
  reliability_rating TEXT DEFAULT 'E', -- Based on bugs
  maintainability_rating TEXT DEFAULT 'E', -- Based on code smells
  
  -- Numerical scores
  security_score NUMERIC(5,2),
  reliability_score NUMERIC(5,2),
  maintainability_score NUMERIC(5,2),
  
  -- Overall quality gate
  quality_gate_status TEXT DEFAULT 'NOT_COMPUTED', -- PASSED, FAILED, NOT_COMPUTED
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Quality Gates Rules
CREATE TABLE IF NOT EXISTS quality_gates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_default BOOLEAN DEFAULT FALSE,
  
  -- Conditions (pass/fail criteria)
  security_issues_threshold INT DEFAULT 0,
  reliability_issues_threshold INT DEFAULT 0,
  maintainability_issues_threshold INT DEFAULT 5,
  coverage_threshold NUMERIC(5,2) DEFAULT 80.0,
  duplications_threshold NUMERIC(5,2) DEFAULT 3.0,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- File-level Metrics
CREATE TABLE IF NOT EXISTS file_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  scan_id UUID REFERENCES scans(id) ON DELETE CASCADE,
  
  file_path TEXT NOT NULL,
  file_language TEXT,
  
  -- Code metrics
  lines_of_code INT DEFAULT 0,
  lines_of_comments INT DEFAULT 0,
  lines_of_tests INT DEFAULT 0,
  complexity INT DEFAULT 0,
  cognitive_complexity INT DEFAULT 0,
  
  -- Issues
  bugs INT DEFAULT 0,
  vulnerabilities INT DEFAULT 0,
  code_smells INT DEFAULT 0,
  security_hotspots INT DEFAULT 0,
  
  -- Quality
  coverage NUMERIC(5,2) DEFAULT 0,
  duplication NUMERIC(5,2) DEFAULT 0,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Issues with bulk tracking
CREATE TABLE IF NOT EXISTS code_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  scan_id UUID REFERENCES scans(id) ON DELETE CASCADE,
  
  file_path TEXT NOT NULL,
  line_number INT,
  
  -- Issue details
  type TEXT NOT NULL, -- bug, vulnerability, code_smell, security_hotspot
  severity TEXT NOT NULL, -- blocker, critical, major, minor, info
  rule TEXT NOT NULL,
  message TEXT,
  code_snippet TEXT,
  
  -- Status
  status TEXT DEFAULT 'OPEN', -- OPEN, CONFIRMED, RESOLVED, SAFE
  assigned_to UUID REFERENCES users(id),
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  
  -- Effort
  estimated_effort_minutes INT,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Activity Events for timeline
CREATE TABLE IF NOT EXISTS code_scan_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  
  event_type TEXT NOT NULL, -- scan_completed, issue_created, issue_resolved, gate_passed, gate_failed
  event_data JSONB,
  
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_quality_ratings_project ON quality_ratings(project_id);
CREATE INDEX idx_quality_gates_project ON quality_gates(project_id);
CREATE INDEX idx_file_metrics_project ON file_metrics(project_id);
CREATE INDEX idx_file_metrics_scan ON file_metrics(scan_id);
CREATE INDEX idx_code_issues_project ON code_issues(project_id);
CREATE INDEX idx_code_issues_status ON code_issues(status);
CREATE INDEX idx_code_issues_severity ON code_issues(severity);
CREATE INDEX idx_scan_activities_project ON code_scan_activities(project_id);
CREATE INDEX idx_scan_activities_created ON code_scan_activities(created_at);
