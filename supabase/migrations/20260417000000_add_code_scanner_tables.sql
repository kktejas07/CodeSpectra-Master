-- CodeSpectra Code Scanner Enhancement Tables
-- Supports GitHub integration, advanced metrics, fixes, and collaboration

-- GitHub Integrations table
CREATE TABLE IF NOT EXISTS public.github_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  github_username TEXT NOT NULL,
  github_token TEXT NOT NULL, -- Should be encrypted at application level
  access_token_expires_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT TRUE,
  last_synced_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
  UNIQUE(user_id, github_username)
);

-- Code scans table - stores all scans performed
CREATE TABLE IF NOT EXISTS public.code_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scan_type TEXT CHECK (scan_type IN ('manual', 'github_repo', 'github_file')) NOT NULL,
  github_repo_url TEXT,
  github_repo_owner TEXT,
  github_repo_name TEXT,
  branch TEXT,
  commit_hash TEXT,
  file_path TEXT,
  code_snippet TEXT, -- For manual scans
  language TEXT NOT NULL,
  scan_status TEXT CHECK (scan_status IN ('pending', 'in_progress', 'completed', 'failed')) DEFAULT 'pending',
  error_message TEXT,
  scan_duration_ms INT, -- How long the scan took
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Advanced metrics for each scan
CREATE TABLE IF NOT EXISTS public.code_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id UUID NOT NULL REFERENCES public.code_scans(id) ON DELETE CASCADE,
  -- Overall score
  overall_quality_score INT CHECK (overall_quality_score >= 0 AND overall_quality_score <= 100),
  -- Detailed metrics
  bugs INT DEFAULT 0,
  vulnerabilities INT DEFAULT 0,
  security_hotspots INT DEFAULT 0,
  code_smells INT DEFAULT 0,
  duplicated_code_percentage DECIMAL(5, 2) DEFAULT 0.0,
  complexity_score INT DEFAULT 0,
  maintainability_index INT,
  test_coverage_percentage DECIMAL(5, 2) DEFAULT 0.0,
  -- Severity breakdown
  critical_issues INT DEFAULT 0,
  major_issues INT DEFAULT 0,
  minor_issues INT DEFAULT 0,
  info_issues INT DEFAULT 0,
  -- Details stored as JSON for extensibility
  metrics_json JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Individual issues detected
CREATE TABLE IF NOT EXISTS public.code_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id UUID NOT NULL REFERENCES public.code_scans(id) ON DELETE CASCADE,
  issue_type TEXT NOT NULL, -- bug, vulnerability, code_smell, etc.
  severity TEXT CHECK (severity IN ('critical', 'major', 'minor', 'info')) NOT NULL,
  rule_key TEXT NOT NULL, -- Rule identifier
  rule_name TEXT NOT NULL, -- Human readable rule name
  rule_description TEXT,
  message TEXT NOT NULL, -- Specific issue description
  line_number INT,
  column_number INT,
  end_line_number INT,
  end_column_number INT,
  effort_to_fix_minutes INT, -- Estimated time to fix
  tags TEXT[] DEFAULT ARRAY[]::TEXT[], -- Tags like 'security', 'performance', etc.
  is_resolved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
  resolved_at TIMESTAMP WITH TIME ZONE
);

-- AI-suggested fixes for issues
CREATE TABLE IF NOT EXISTS public.suggested_fixes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id UUID NOT NULL REFERENCES public.code_issues(id) ON DELETE CASCADE,
  scan_id UUID NOT NULL REFERENCES public.code_scans(id) ON DELETE CASCADE,
  fix_description TEXT NOT NULL,
  original_code TEXT NOT NULL,
  suggested_code TEXT NOT NULL,
  confidence_level INT CHECK (confidence_level >= 0 AND confidence_level <= 100), -- 0-100
  is_applied BOOLEAN DEFAULT FALSE,
  applied_at TIMESTAMP WITH TIME ZONE,
  applied_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Quality gates configuration
CREATE TABLE IF NOT EXISTS public.quality_gates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gate_name TEXT NOT NULL,
  is_default BOOLEAN DEFAULT FALSE,
  -- Thresholds for gates
  min_quality_score INT DEFAULT 50,
  max_bugs INT DEFAULT 10,
  max_vulnerabilities INT DEFAULT 0,
  max_security_hotspots INT DEFAULT 5,
  max_code_smells INT DEFAULT 100,
  max_duplicated_code_percentage DECIMAL(5, 2) DEFAULT 10.0,
  min_test_coverage_percentage DECIMAL(5, 2) DEFAULT 50.0,
  -- Standards compliance
  standards TEXT[] DEFAULT ARRAY[]::TEXT[], -- OWASP, CWE, NIST, etc.
  enforce_on_push BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Code review comments
CREATE TABLE IF NOT EXISTS public.scan_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id UUID NOT NULL REFERENCES public.code_scans(id) ON DELETE CASCADE,
  issue_id UUID REFERENCES public.code_issues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  comment_text TEXT NOT NULL,
  comment_type TEXT CHECK (comment_type IN ('discussion', 'suggestion', 'approval', 'rejection')) DEFAULT 'discussion',
  is_resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Scan history for tracking improvements
CREATE TABLE IF NOT EXISTS public.scan_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id UUID NOT NULL REFERENCES public.code_scans(id) ON DELETE CASCADE,
  github_repo_url TEXT,
  quality_score INT,
  bugs INT,
  vulnerabilities INT,
  code_smells INT,
  duplicated_code_percentage DECIMAL(5, 2),
  test_coverage_percentage DECIMAL(5, 2),
  scan_date TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_code_scans_user_id ON public.code_scans(user_id);
CREATE INDEX IF NOT EXISTS idx_code_scans_repo_url ON public.code_scans(github_repo_url);
CREATE INDEX IF NOT EXISTS idx_code_scans_status ON public.code_scans(scan_status);
CREATE INDEX IF NOT EXISTS idx_code_metrics_scan_id ON public.code_metrics(scan_id);
CREATE INDEX IF NOT EXISTS idx_code_issues_scan_id ON public.code_issues(scan_id);
CREATE INDEX IF NOT EXISTS idx_code_issues_severity ON public.code_issues(severity);
CREATE INDEX IF NOT EXISTS idx_suggested_fixes_issue_id ON public.suggested_fixes(issue_id);
CREATE INDEX IF NOT EXISTS idx_quality_gates_user_id ON public.quality_gates(user_id);
CREATE INDEX IF NOT EXISTS idx_scan_comments_scan_id ON public.scan_comments(scan_id);
CREATE INDEX IF NOT EXISTS idx_github_integrations_user_id ON public.github_integrations(user_id);

-- Row Level Security Policies
ALTER TABLE public.github_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.code_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.code_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.code_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suggested_fixes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quality_gates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scan_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scan_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies for users to access their own data
CREATE POLICY "Users can view own GitHub integrations" ON public.github_integrations
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view own code scans" ON public.code_scans
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view own metrics" ON public.code_metrics
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.code_scans WHERE code_scans.id = scan_id AND code_scans.user_id = auth.uid()
  ));

CREATE POLICY "Users can view own issues" ON public.code_issues
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.code_scans WHERE code_scans.id = scan_id AND code_scans.user_id = auth.uid()
  ));

CREATE POLICY "Users can view own suggested fixes" ON public.suggested_fixes
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.code_scans WHERE code_scans.id = scan_id AND code_scans.user_id = auth.uid()
  ));

CREATE POLICY "Users can view own quality gates" ON public.quality_gates
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view scan comments" ON public.scan_comments
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.code_scans WHERE code_scans.id = scan_id AND code_scans.user_id = auth.uid()
  ));

CREATE POLICY "Users can view own scan history" ON public.scan_history
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.code_scans WHERE code_scans.id = scan_id AND code_scans.user_id = auth.uid()
  ));
