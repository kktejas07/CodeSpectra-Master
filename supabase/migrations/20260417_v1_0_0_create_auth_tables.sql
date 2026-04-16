-- Migration: v1.0.0 - Create Auth & Versioning Tables
-- Description: Create authentication tables with versioning and audit trail support
-- Version: 1.0.0
-- Created: 2026-04-17

-- ============================================================================
-- ENABLE EXTENSIONS
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- CORE USERS TABLE WITH VERSIONING
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Basic Info
  email VARCHAR(255) UNIQUE NOT NULL,
  full_name VARCHAR(255),
  phone VARCHAR(20),
  profile_picture_url TEXT,
  bio TEXT,
  
  -- Authentication - Email/Password
  password_hash VARCHAR(255),
  email_verified_at TIMESTAMP WITH TIME ZONE,
  email_verification_token VARCHAR(255),
  email_verification_expires_at TIMESTAMP WITH TIME ZONE,
  
  -- Face Recognition Enrollment
  face_enrollment_status VARCHAR(50) DEFAULT 'not_started', -- 'not_started', 'in_progress', 'completed', 'skipped'
  face_enrollment_started_at TIMESTAMP WITH TIME ZONE,
  face_enrollment_expires_at TIMESTAMP WITH TIME ZONE, -- 7-day countdown from signup
  face_enrollment_completed_at TIMESTAMP WITH TIME ZONE,
  
  -- OAuth Integration
  google_id VARCHAR(255) UNIQUE,
  google_email VARCHAR(255),
  github_id VARCHAR(255) UNIQUE,
  github_username VARCHAR(255),
  
  -- System Fields
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE,
  
  -- Versioning & Audit
  version INT DEFAULT 1,
  migration_id UUID,
  
  -- Constraints
  CONSTRAINT users_email_format CHECK (email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
  CONSTRAINT users_at_least_one_auth CHECK (
    password_hash IS NOT NULL OR 
    google_id IS NOT NULL OR 
    github_id IS NOT NULL
  )
);

-- Indexes for users table
CREATE INDEX idx_users_email ON users(email) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_google_id ON users(google_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_github_id ON users(github_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_email_verification_token ON users(email_verification_token);
CREATE INDEX idx_users_face_enrollment_status ON users(face_enrollment_status);
CREATE INDEX idx_users_created_at ON users(created_at DESC);

-- ============================================================================
-- FACE RECOGNITION ENROLLMENTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS face_enrollments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Enrollment Details
  angle_type VARCHAR(50) NOT NULL, -- 'front', 'left', 'right'
  face_embedding BYTEA NOT NULL, -- Encrypted face descriptor vector
  face_embedding_algorithm VARCHAR(50) DEFAULT 'facenet512', -- Algorithm used
  
  -- Quality Metrics
  confidence_score FLOAT CHECK (confidence_score >= 0 AND confidence_score <= 1),
  capture_quality_score FLOAT CHECK (capture_quality_score >= 0 AND capture_quality_score <= 1),
  face_detection_confidence FLOAT CHECK (face_detection_confidence >= 0 AND face_detection_confidence <= 1),
  lighting_score FLOAT CHECK (lighting_score >= 0 AND lighting_score <= 1),
  position_score FLOAT CHECK (position_score >= 0 AND position_score <= 1),
  face_size_score FLOAT CHECK (face_size_score >= 0 AND face_size_score <= 1),
  
  -- Reference Image (encrypted)
  reference_image_url TEXT, -- Signed URL for encrypted reference
  reference_image_hash VARCHAR(255), -- SHA-256 hash for integrity check
  
  -- Status
  status VARCHAR(50) DEFAULT 'active', -- 'active', 'inactive', 'failed', 'expired'
  enrollment_attempt_number INT DEFAULT 1,
  last_verification_at TIMESTAMP WITH TIME ZONE,
  
  -- Audit Trail
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  version INT DEFAULT 1,
  
  -- Constraints
  CONSTRAINT face_enrollments_unique_angle_per_user UNIQUE(user_id, angle_type),
  CONSTRAINT face_enrollments_valid_angle CHECK (angle_type IN ('front', 'left', 'right'))
);

-- Indexes for face_enrollments
CREATE INDEX idx_face_enrollments_user_id ON face_enrollments(user_id);
CREATE INDEX idx_face_enrollments_angle_type ON face_enrollments(angle_type);
CREATE INDEX idx_face_enrollments_status ON face_enrollments(status) WHERE status = 'active';
CREATE INDEX idx_face_enrollments_user_status ON face_enrollments(user_id, status);

-- ============================================================================
-- FACE LOGIN ATTEMPTS TABLE (Audit Trail)
-- ============================================================================
CREATE TABLE IF NOT EXISTS face_login_attempts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  
  -- Attempt Details
  match_confidence FLOAT CHECK (match_confidence >= 0 AND match_confidence <= 1),
  matched_with_angle VARCHAR(50),
  capture_quality FLOAT CHECK (capture_quality >= 0 AND capture_quality <= 1),
  capture_timestamp TIMESTAMP WITH TIME ZONE,
  
  -- Result
  status VARCHAR(50) NOT NULL, -- 'success', 'failed', 'timeout', 'poor_quality'
  error_message TEXT,
  
  -- Device & Security
  device_fingerprint VARCHAR(255),
  ip_address INET,
  user_agent TEXT,
  country_code VARCHAR(2),
  
  -- Audit
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  version INT DEFAULT 1
);

-- Indexes for face_login_attempts
CREATE INDEX idx_face_login_attempts_user_id ON face_login_attempts(user_id);
CREATE INDEX idx_face_login_attempts_status ON face_login_attempts(status);
CREATE INDEX idx_face_login_attempts_created_at ON face_login_attempts(created_at DESC);
CREATE INDEX idx_face_login_attempts_user_created ON face_login_attempts(user_id, created_at DESC);

-- ============================================================================
-- OAUTH TOKENS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS oauth_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Provider Details
  provider VARCHAR(50) NOT NULL CHECK (provider IN ('google', 'github')),
  provider_user_id VARCHAR(255) NOT NULL,
  provider_email VARCHAR(255),
  provider_avatar_url TEXT,
  
  -- Tokens
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_type VARCHAR(50) DEFAULT 'Bearer',
  
  -- Expiration
  expires_in INT, -- Seconds
  expires_at TIMESTAMP WITH TIME ZONE,
  
  -- Audit
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_used_at TIMESTAMP WITH TIME ZONE,
  version INT DEFAULT 1,
  
  -- Constraints
  CONSTRAINT oauth_tokens_unique_provider UNIQUE(provider, provider_user_id)
);

-- Indexes for oauth_tokens
CREATE INDEX idx_oauth_tokens_user_id ON oauth_tokens(user_id);
CREATE INDEX idx_oauth_tokens_provider ON oauth_tokens(provider);
CREATE INDEX idx_oauth_tokens_provider_user_id ON oauth_tokens(provider, provider_user_id);
CREATE INDEX idx_oauth_tokens_expires_at ON oauth_tokens(expires_at);

-- ============================================================================
-- SESSIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Tokens
  access_token VARCHAR(500) NOT NULL UNIQUE,
  refresh_token VARCHAR(500) NOT NULL UNIQUE,
  
  -- Session Details
  login_method VARCHAR(50) NOT NULL CHECK (login_method IN ('email', 'google', 'github', 'face')),
  device_fingerprint VARCHAR(255),
  device_name VARCHAR(255),
  
  -- Network Info
  ip_address INET,
  user_agent TEXT,
  country_code VARCHAR(2),
  
  -- Activity
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  revoked_at TIMESTAMP WITH TIME ZONE,
  revoke_reason VARCHAR(255),
  
  -- Versioning
  version INT DEFAULT 1
);

-- Indexes for sessions
CREATE INDEX idx_sessions_user_id ON sessions(user_id) WHERE is_active = TRUE;
CREATE INDEX idx_sessions_access_token ON sessions(access_token) WHERE is_active = TRUE;
CREATE INDEX idx_sessions_refresh_token ON sessions(refresh_token) WHERE is_active = TRUE;
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at) WHERE is_active = TRUE;
CREATE INDEX idx_sessions_created_at ON sessions(created_at DESC);

-- ============================================================================
-- DATA VERSIONING TABLE (Audit Trail for all changes)
-- ============================================================================
CREATE TABLE IF NOT EXISTS data_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Reference
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  table_name VARCHAR(255) NOT NULL,
  record_id UUID NOT NULL,
  
  -- Change Details
  action VARCHAR(50) NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  old_values JSONB,
  new_values JSONB,
  changed_fields TEXT[],
  
  -- Tracking
  migration_id UUID,
  release_version VARCHAR(50),
  
  -- Audit
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by VARCHAR(255),
  
  -- Versioning
  version INT DEFAULT 1
);

-- Indexes for data_versions
CREATE INDEX idx_data_versions_record_id ON data_versions(record_id);
CREATE INDEX idx_data_versions_table_name ON data_versions(table_name);
CREATE INDEX idx_data_versions_user_id ON data_versions(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_data_versions_migration_id ON data_versions(migration_id);
CREATE INDEX idx_data_versions_created_at ON data_versions(created_at DESC);
CREATE INDEX idx_data_versions_action ON data_versions(action);

-- ============================================================================
-- MIGRATIONS LOG TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS migrations_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Migration Details
  migration_name VARCHAR(255) UNIQUE NOT NULL,
  version VARCHAR(50) NOT NULL,
  description TEXT,
  
  -- Status
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'rolled_back')),
  
  -- Execution
  executed_at TIMESTAMP WITH TIME ZONE,
  rolled_back_at TIMESTAMP WITH TIME ZONE,
  
  -- SQL
  up_sql TEXT,
  down_sql TEXT,
  
  -- Impact
  affected_tables TEXT[],
  affected_records_count INT,
  execution_time_ms INT,
  
  -- Error Handling
  error_message TEXT,
  error_stacktrace TEXT,
  
  -- Audit
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Versioning
  version INT DEFAULT 1
);

-- Indexes for migrations_log
CREATE INDEX idx_migrations_log_status ON migrations_log(status);
CREATE INDEX idx_migrations_log_version ON migrations_log(version DESC);
CREATE INDEX idx_migrations_log_created_at ON migrations_log(created_at DESC);

-- ============================================================================
-- RELEASE VERSIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS release_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Version Info
  version VARCHAR(50) UNIQUE NOT NULL,
  title VARCHAR(255),
  description TEXT,
  changelog TEXT,
  
  -- Status
  status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'deployed', 'rolled_back')),
  
  -- Deployment
  deployed_at TIMESTAMP WITH TIME ZONE,
  rolled_back_at TIMESTAMP WITH TIME ZONE,
  rollback_reason TEXT,
  
  -- Related Migrations
  migration_ids UUID[],
  
  -- Backups
  database_backup_urls TEXT[],
  backup_location VARCHAR(255),
  
  -- Audit
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  deployed_by VARCHAR(255),
  rolled_back_by VARCHAR(255),
  
  -- Versioning
  version INT DEFAULT 1
);

-- Indexes for release_versions
CREATE INDEX idx_release_versions_version ON release_versions(version DESC);
CREATE INDEX idx_release_versions_status ON release_versions(status);
CREATE INDEX idx_release_versions_deployed_at ON release_versions(deployed_at DESC);

-- ============================================================================
-- TRIGGER FUNCTION FOR VERSIONING
-- ============================================================================
CREATE OR REPLACE FUNCTION log_data_version()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO data_versions (
    table_name,
    record_id,
    action,
    old_values,
    new_values,
    changed_fields,
    created_by
  ) VALUES (
    TG_TABLE_NAME,
    CASE 
      WHEN TG_OP = 'DELETE' THEN OLD.id
      ELSE NEW.id
    END,
    TG_OP,
    CASE WHEN TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN row_to_json(OLD) ELSE NULL END,
    CASE WHEN TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN row_to_json(NEW) ELSE NULL END,
    CASE 
      WHEN TG_OP = 'UPDATE' THEN (
        SELECT ARRAY_AGG(key) FROM jsonb_each(row_to_json(NEW)::jsonb - row_to_json(OLD)::jsonb)
      )
      ELSE NULL
    END,
    CURRENT_USER
  );
  
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGERS FOR DATA VERSIONING
-- ============================================================================
DROP TRIGGER IF EXISTS audit_users ON users;
CREATE TRIGGER audit_users AFTER INSERT OR UPDATE OR DELETE ON users
FOR EACH ROW EXECUTE FUNCTION log_data_version();

DROP TRIGGER IF EXISTS audit_face_enrollments ON face_enrollments;
CREATE TRIGGER audit_face_enrollments AFTER INSERT OR UPDATE OR DELETE ON face_enrollments
FOR EACH ROW EXECUTE FUNCTION log_data_version();

DROP TRIGGER IF EXISTS audit_oauth_tokens ON oauth_tokens;
CREATE TRIGGER audit_oauth_tokens AFTER INSERT OR UPDATE OR DELETE ON oauth_tokens
FOR EACH ROW EXECUTE FUNCTION log_data_version();

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================
-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE face_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE face_login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_versions ENABLE ROW LEVEL SECURITY;

-- Users can only view their own data
CREATE POLICY users_self_access ON users
  FOR ALL USING (auth.uid() = id);

-- Face enrollments - users can only access their own
CREATE POLICY face_enrollments_self_access ON face_enrollments
  FOR ALL USING (auth.uid() = user_id);

-- Sessions - users can only access their own
CREATE POLICY sessions_self_access ON sessions
  FOR ALL USING (auth.uid() = user_id);

-- ============================================================================
-- INITIALIZATION
-- ============================================================================
-- Log this migration
INSERT INTO migrations_log (
  migration_name,
  version,
  description,
  status,
  up_sql,
  affected_tables,
  executed_at
) VALUES (
  '20260417_v1.0.0_create_auth_tables',
  '1.0.0',
  'Create authentication tables with versioning and audit trail support',
  'completed',
  'See supabase/migrations/20260417_v1.0.0_create_auth_tables.sql',
  ARRAY['users', 'face_enrollments', 'face_login_attempts', 'oauth_tokens', 'sessions', 'data_versions', 'migrations_log', 'release_versions'],
  NOW()
) ON CONFLICT DO NOTHING;
