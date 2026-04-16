-- Phase 3: GitHub Integration & Advanced Metrics
-- Created: 2026-04-17
-- Version: 1.1.0

-- GitHub OAuth Tokens Table
CREATE TABLE IF NOT EXISTS github_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  github_username VARCHAR(255) NOT NULL,
  access_token TEXT NOT NULL ENCRYPTED WITH (encryption_key = 'github_tokens_key'),
  refresh_token TEXT ENCRYPTED WITH (encryption_key = 'github_tokens_key'),
  token_expires_at TIMESTAMP,
  scope TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_used_at TIMESTAMP,
  
  INDEX idx_user_id (user_id),
  INDEX idx_github_username (github_username)
);

-- GitHub Repositories Linked to User
CREATE TABLE IF NOT EXISTS github_repositories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  github_repo_id INTEGER NOT NULL,
  repository_name VARCHAR(255) NOT NULL,
  repository_url TEXT NOT NULL,
  repository_description TEXT,
  is_private BOOLEAN DEFAULT FALSE,
  language VARCHAR(50),
  stars_count INTEGER DEFAULT 0,
  last_scanned_at TIMESTAMP,
  auto_scan_enabled BOOLEAN DEFAULT FALSE,
  branch_to_scan VARCHAR(255) DEFAULT 'main',
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  version INT DEFAULT 1,
  
  INDEX idx_user_id (user_id),
  INDEX idx_github_repo_id (github_repo_id),
  UNIQUE(user_id, github_repo_id)
);

-- Code Analysis Results (Enhanced)
CREATE TABLE IF NOT EXISTS code_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  github_repo_id UUID REFERENCES github_repositories(id) ON DELETE SET NULL,
  
  -- File information
  file_path TEXT NOT NULL,
  file_language VARCHAR(50) NOT NULL,
  file_size_bytes INTEGER,
  
  -- Analysis Results
  quality_score FLOAT CHECK (quality_score >= 0 AND quality_score <= 100),
  
  -- Advanced Metrics
  bugs_count INTEGER DEFAULT 0,
  vulnerabilities_count INTEGER DEFAULT 0,
  code_smells_count INTEGER DEFAULT 0,
  security_hotspots_count INTEGER DEFAULT 0,
  duplicated_lines_count INTEGER DEFAULT 0,
  cyclomatic_complexity FLOAT DEFAULT 0,
  test_coverage_percent FLOAT DEFAULT 0,
  maintainability_index FLOAT DEFAULT 0,
  
  -- Detailed Analysis
  analysis_results JSONB,
  issues JSONB, -- Array of issues with severity
  suggestions JSONB,
  metrics JSONB, -- All advanced metrics in JSON
  
  -- Analysis metadata
  analyzed_at TIMESTAMP DEFAULT NOW(),
  analysis_duration_ms INTEGER,
  github_commit_hash VARCHAR(40),
  github_branch VARCHAR(255),
  
  -- System
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  version INT DEFAULT 1,
  
  INDEX idx_user_id (user_id),
  INDEX idx_repo_id (github_repo_id),
  INDEX idx_analyzed_at (analyzed_at),
  INDEX idx_quality_score (quality_score)
);

-- Suggested Fixes (AI-generated)
CREATE TABLE IF NOT EXISTS suggested_fixes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id UUID NOT NULL REFERENCES code_analyses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Issue details
  issue_id VARCHAR(255) NOT NULL,
  issue_severity VARCHAR(50), -- 'critical', 'major', 'minor', 'info'
  issue_description TEXT NOT NULL,
  issue_line_number INTEGER,
  issue_column_number INTEGER,
  
  -- Fix details
  original_code TEXT NOT NULL,
  suggested_code TEXT NOT NULL,
  fix_explanation TEXT,
  confidence_score FLOAT CHECK (confidence_score >= 0 AND confidence_score <= 1),
  
  -- Application status
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'applied', 'rejected', 'manual'
  applied_at TIMESTAMP,
  applied_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  
  -- Audit
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  version INT DEFAULT 1,
  
  INDEX idx_analysis_id (analysis_id),
  INDEX idx_user_id (user_id),
  INDEX idx_status (status)
);

-- Quality Gates Configuration
CREATE TABLE IF NOT EXISTS quality_gates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID, -- For team feature
  
  gate_name VARCHAR(255) NOT NULL,
  description TEXT,
  is_default BOOLEAN DEFAULT FALSE,
  
  -- Threshold settings
  min_quality_score FLOAT DEFAULT 70,
  max_bugs_count INTEGER DEFAULT 0,
  max_vulnerabilities_count INTEGER DEFAULT 0,
  max_code_smells_count INTEGER,
  min_test_coverage_percent FLOAT DEFAULT 50,
  
  -- Additional rules as JSON
  custom_rules JSONB,
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  version INT DEFAULT 1,
  
  INDEX idx_user_id (user_id),
  INDEX idx_is_default (is_default)
);

-- Scan History
CREATE TABLE IF NOT EXISTS scan_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  github_repo_id UUID REFERENCES github_repositories(id) ON DELETE SET NULL,
  
  scan_type VARCHAR(50), -- 'manual', 'auto', 'commit'
  files_scanned_count INTEGER,
  total_issues_found INTEGER,
  scan_duration_ms INTEGER,
  status VARCHAR(50) DEFAULT 'completed', -- 'in_progress', 'completed', 'failed'
  error_message TEXT,
  
  -- Results snapshot
  average_quality_score FLOAT,
  total_bugs INTEGER DEFAULT 0,
  total_vulnerabilities INTEGER DEFAULT 0,
  total_code_smells INTEGER DEFAULT 0,
  
  triggered_by VARCHAR(255), -- 'manual', 'webhook', 'scheduled'
  github_commit_hash VARCHAR(40),
  github_branch VARCHAR(255),
  
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  version INT DEFAULT 1,
  
  INDEX idx_user_id (user_id),
  INDEX idx_repo_id (github_repo_id),
  INDEX idx_created_at (created_at)
);

-- Add new columns to existing users table for GitHub integration
ALTER TABLE users ADD COLUMN IF NOT EXISTS github_connected BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS github_connection_expires_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS auto_scan_enabled BOOLEAN DEFAULT FALSE;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_analyses_quality ON code_analyses(quality_score DESC);
CREATE INDEX IF NOT EXISTS idx_analyses_created ON code_analyses(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_repositories_user ON github_repositories(user_id);

-- Record this migration
INSERT INTO migrations_log (
  version,
  description,
  status,
  started_at,
  completed_at
) VALUES (
  '1.1.0',
  'GitHub Integration & Advanced Metrics',
  'completed',
  NOW(),
  NOW()
) ON CONFLICT DO NOTHING;
