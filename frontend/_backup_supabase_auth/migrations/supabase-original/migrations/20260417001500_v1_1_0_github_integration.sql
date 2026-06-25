-- Phase 3: GitHub Integration & Advanced Metrics
-- Created: 2026-04-17
-- Version: 1.1.0
-- PostgreSQL-only. Tokens are plain TEXT (encrypt in the app).
-- Does not recreate quality_gates / scan_history / suggested_fixes — those live in 20260417000000_add_code_scanner_tables.sql.

-- GitHub OAuth Tokens (per public.users from v1 auth migration)
CREATE TABLE IF NOT EXISTS github_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  github_username VARCHAR(255) NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_expires_at TIMESTAMP,
  scope TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_used_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_github_tokens_user_id ON github_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_github_tokens_github_username ON github_tokens(github_username);

-- GitHub repositories linked to public.users
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
  UNIQUE(user_id, github_repo_id)
);

CREATE INDEX IF NOT EXISTS idx_github_repositories_user_id ON github_repositories(user_id);
CREATE INDEX IF NOT EXISTS idx_github_repositories_github_repo_id ON github_repositories(github_repo_id);

-- Per-file/repo analysis summaries (used by app/api/analysis-history)
CREATE TABLE IF NOT EXISTS code_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  github_repo_id UUID REFERENCES github_repositories(id) ON DELETE SET NULL,
  file_path TEXT NOT NULL,
  file_language VARCHAR(50) NOT NULL,
  file_size_bytes INTEGER,
  quality_score FLOAT CHECK (quality_score >= 0 AND quality_score <= 100),
  bugs_count INTEGER DEFAULT 0,
  vulnerabilities_count INTEGER DEFAULT 0,
  code_smells_count INTEGER DEFAULT 0,
  security_hotspots_count INTEGER DEFAULT 0,
  duplicated_lines_count INTEGER DEFAULT 0,
  cyclomatic_complexity FLOAT DEFAULT 0,
  test_coverage_percent FLOAT DEFAULT 0,
  maintainability_index FLOAT DEFAULT 0,
  analysis_results JSONB,
  issues JSONB,
  suggestions JSONB,
  metrics JSONB,
  analyzed_at TIMESTAMP DEFAULT NOW(),
  analysis_duration_ms INTEGER,
  github_commit_hash VARCHAR(40),
  github_branch VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  version INT DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_code_analyses_user_id ON code_analyses(user_id);
CREATE INDEX IF NOT EXISTS idx_code_analyses_github_repo_id ON code_analyses(github_repo_id);
CREATE INDEX IF NOT EXISTS idx_code_analyses_analyzed_at ON code_analyses(analyzed_at);
CREATE INDEX IF NOT EXISTS idx_code_analyses_quality_score ON code_analyses(quality_score);

-- Optional columns on public.users for GitHub UX
ALTER TABLE users ADD COLUMN IF NOT EXISTS github_connected BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS github_connection_expires_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS auto_scan_enabled BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_analyses_quality ON code_analyses(quality_score DESC);
CREATE INDEX IF NOT EXISTS idx_analyses_created ON code_analyses(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_repositories_user ON github_repositories(user_id);

INSERT INTO migrations_log (
  migration_name,
  migration_version,
  description,
  status,
  executed_at
) VALUES (
  '20260417001500_v1_1_0_github_integration',
  '1.1.0',
  'GitHub Integration & Advanced Metrics',
  'completed',
  NOW()
) ON CONFLICT (migration_name) DO NOTHING;
