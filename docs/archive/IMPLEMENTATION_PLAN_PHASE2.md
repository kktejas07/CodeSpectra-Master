# Phase 2 Implementation Plan - Database, Auth, & Face Recognition

## TASK 1: Database Schema with Versioning & Migrations Support

### Objective
Create a database schema that supports zero-downtime migrations, data versioning, and complete audit trails for future updates.

### Key Requirements
1. Version all core tables for migration tracking
2. Add audit trail tables for data changes
3. Support zero-data-loss deployments
4. Enable rollback capabilities
5. Track user data modifications

### Database Tables to Create/Update

#### Core User Management
```sql
-- users table (new with versioning)
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  full_name VARCHAR(255),
  phone VARCHAR(20),
  profile_picture_url TEXT,
  bio TEXT,
  
  -- Authentication
  password_hash VARCHAR(255), -- for email/password
  email_verified_at TIMESTAMP,
  email_verification_token VARCHAR(255),
  
  -- Face Recognition
  face_enrollment_status VARCHAR(50), -- 'not_started', 'in_progress', 'completed'
  face_enrollment_expires_at TIMESTAMP, -- 7-day countdown
  face_data_encrypted BYTEA, -- encrypted face embeddings
  
  -- OAuth
  google_id VARCHAR(255) UNIQUE,
  github_id VARCHAR(255) UNIQUE,
  
  -- System
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP,
  
  -- Versioning
  version INT DEFAULT 1,
  migration_id UUID, -- links to migration event
  
  CONSTRAINT users_email_check CHECK (email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- Face recognition enrollments
CREATE TABLE face_enrollments (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Enrollment details
  angle_type VARCHAR(50), -- 'front', 'left', 'right'
  face_embedding BYTEA NOT NULL, -- encrypted face data
  confidence_score FLOAT, -- 0-1
  capture_quality_score FLOAT, -- 0-1
  
  -- Image for reference
  reference_image_url TEXT,
  reference_image_encrypted BYTEA,
  
  -- Status
  status VARCHAR(50) DEFAULT 'active', -- 'active', 'failed', 'expired'
  enrollment_attempt INT DEFAULT 1,
  
  -- Audit
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  version INT DEFAULT 1,
  
  INDEX idx_user_id (user_id),
  INDEX idx_angle_type (angle_type)
);

-- Face recognition logins (audit trail)
CREATE TABLE face_login_attempts (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Attempt details
  match_confidence FLOAT,
  matched_with_angle VARCHAR(50),
  capture_quality FLOAT,
  
  -- Result
  status VARCHAR(50), -- 'success', 'failed', 'timeout'
  error_message TEXT,
  
  -- Device & location
  device_fingerprint VARCHAR(255),
  ip_address INET,
  user_agent TEXT,
  
  -- Audit
  created_at TIMESTAMP DEFAULT NOW(),
  version INT DEFAULT 1
);

-- OAuth Tokens
CREATE TABLE oauth_tokens (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  provider VARCHAR(50) NOT NULL, -- 'google', 'github'
  provider_user_id VARCHAR(255) NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  version INT DEFAULT 1,
  
  UNIQUE (provider, provider_user_id),
  INDEX idx_user_id (user_id),
  INDEX idx_provider (provider)
);

-- Sessions
CREATE TABLE sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  token VARCHAR(500) NOT NULL UNIQUE,
  refresh_token VARCHAR(500) NOT NULL UNIQUE,
  
  login_method VARCHAR(50), -- 'email', 'google', 'github', 'face'
  device_fingerprint VARCHAR(255),
  ip_address INET,
  user_agent TEXT,
  
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_activity_at TIMESTAMP,
  
  version INT DEFAULT 1,
  
  INDEX idx_user_id (user_id),
  INDEX idx_token (token),
  INDEX idx_expires_at (expires_at)
);
```

#### Audit & Versioning Tables
```sql
-- Data version history (all table changes)
CREATE TABLE data_versions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  
  table_name VARCHAR(255) NOT NULL,
  record_id UUID NOT NULL,
  action VARCHAR(50) NOT NULL, -- 'INSERT', 'UPDATE', 'DELETE'
  
  old_values JSONB,
  new_values JSONB,
  changed_fields TEXT[], -- array of field names that changed
  
  migration_id UUID,
  release_version VARCHAR(50),
  
  created_at TIMESTAMP DEFAULT NOW(),
  created_by VARCHAR(255), -- user email or system
  
  INDEX idx_record_id (record_id),
  INDEX idx_table_name (table_name),
  INDEX idx_migration_id (migration_id),
  INDEX idx_created_at (created_at)
);

-- Migration tracking (for zero-downtime deployments)
CREATE TABLE migrations_log (
  id UUID PRIMARY KEY,
  migration_name VARCHAR(255) UNIQUE NOT NULL,
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'running', 'completed', 'failed', 'rolled_back'
  
  version VARCHAR(50) NOT NULL,
  executed_at TIMESTAMP,
  rolled_back_at TIMESTAMP,
  
  up_sql TEXT,
  down_sql TEXT,
  
  affected_tables TEXT[],
  affected_records_count INT,
  
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  INDEX idx_status (status),
  INDEX idx_version (version)
);

-- Release versions (tie migrations together)
CREATE TABLE release_versions (
  id UUID PRIMARY KEY,
  version VARCHAR(50) UNIQUE NOT NULL, -- '1.0.0', '1.1.0'
  
  title VARCHAR(255),
  description TEXT,
  
  status VARCHAR(50) DEFAULT 'draft', -- 'draft', 'scheduled', 'deployed', 'rolled_back'
  
  deployed_at TIMESTAMP,
  rolled_back_at TIMESTAMP,
  
  migrations UUID[],
  database_backups TEXT[],
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  INDEX idx_version (version),
  INDEX idx_status (status)
);
```

#### Existing Tables - Add Versioning
```sql
-- Update all existing tables with versioning columns:
ALTER TABLE scan_submissions ADD COLUMN version INT DEFAULT 1;
ALTER TABLE scan_submissions ADD COLUMN migration_id UUID;

-- Add audit trigger to scan_submissions
CREATE TRIGGER audit_scan_submissions AFTER INSERT OR UPDATE OR DELETE ON scan_submissions
FOR EACH ROW EXECUTE FUNCTION log_data_version();
```

### Migration Safety Features
1. **Backup before each migration**: Automatic snapshots stored
2. **Rollback capability**: Keep DOWN migrations for each UP
3. **Zero-downtime**: Migrations run in background
4. **Data versioning**: Every change tracked with before/after
5. **Release management**: Group migrations into versioned releases

---

## TASK 2: Audit Database Tables, APIs, CRUD Operations

### Database Audit Checklist

#### Tables to Create/Verify
```
PRIORITY 1 (CRITICAL - Core Auth):
  [ ] users - Email/password/OAuth users
  [ ] face_enrollments - 3 face angles per user
  [ ] face_login_attempts - Login audit trail
  [ ] oauth_tokens - Google/GitHub tokens
  [ ] sessions - User sessions
  [ ] data_versions - Version history
  [ ] migrations_log - Migration tracking
  [ ] release_versions - Release management

PRIORITY 2 (HIGH - Existing):
  [ ] code_analyses - Code scanning results
  [ ] code_issues - Issues found
  [ ] scan_submissions - User submissions
  [ ] leaderboard - Challenge rankings
  [ ] user_badges - Achievements

PRIORITY 3 (MEDIUM - Features):
  [ ] challenges - Coding problems
  [ ] test_cases - Challenge test cases
  [ ] submissions - Challenge submissions
  [ ] teams - Team management
  [ ] github_integrations - GitHub configs
```

#### API Endpoints to Create

**Authentication APIs**
```
POST /api/auth/email/signup - Email registration
POST /api/auth/email/login - Email login
POST /api/auth/email/forgot-password - Password reset
POST /api/auth/email/verify - Email verification

GET  /api/auth/google/callback - Google OAuth callback
GET  /api/auth/github/callback - GitHub OAuth callback

POST /api/auth/face/enroll/start - Begin face enrollment
POST /api/auth/face/enroll/capture - Submit face photo
POST /api/auth/face/enroll/complete - Finish enrollment
POST /api/auth/face/login - Login with face recognition

POST /api/auth/logout - Logout
POST /api/auth/refresh - Refresh token
GET  /api/auth/me - Current user info
```

**User APIs**
```
GET  /api/users/me - Get profile
PUT  /api/users/me - Update profile
GET  /api/users/:id - Get user public info
DELETE /api/users/me - Delete account

GET  /api/users/me/face-enrollment - Get enrollment status
POST /api/users/me/face-enrollment/skip - Skip face enrollment (7-day reminder)
GET  /api/users/me/face-reminder - Get 7-day countdown
```

**Session APIs**
```
GET  /api/sessions - List active sessions
DELETE /api/sessions/:id - Revoke session
POST /api/sessions/revoke-all - Logout all devices
```

### CRUD Operations Template
Each API should follow:
```typescript
// GET - Read
async function getResource(id: string) {
  const { data, error } = await supabase
    .from('table_name')
    .select('*')
    .eq('id', id)
    .single();
  
  return { data, error };
}

// POST - Create
async function createResource(input: CreateInput) {
  const { data, error } = await supabase
    .from('table_name')
    .insert([input])
    .select()
    .single();
  
  // Log to data_versions
  if (!error) {
    await logDataVersion('table_name', data.id, 'INSERT', null, data);
  }
  
  return { data, error };
}

// PUT - Update
async function updateResource(id: string, updates: UpdateInput) {
  // Get old values first
  const { data: oldData } = await supabase
    .from('table_name')
    .select('*')
    .eq('id', id)
    .single();
  
  // Update
  const { data, error } = await supabase
    .from('table_name')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  
  // Log to data_versions
  if (!error) {
    await logDataVersion('table_name', id, 'UPDATE', oldData, data);
  }
  
  return { data, error };
}

// DELETE - Remove
async function deleteResource(id: string) {
  // Get full record before delete
  const { data: oldData } = await supabase
    .from('table_name')
    .select('*')
    .eq('id', id)
    .single();
  
  // Delete
  const { error } = await supabase
    .from('table_name')
    .delete()
    .eq('id', id);
  
  // Log to data_versions
  if (!error) {
    await logDataVersion('table_name', id, 'DELETE', oldData, null);
  }
  
  return { error };
}
```

---

## TASK 3: Enhanced Face Recognition with Auto-Capture & AI Scanning

### Current Issue
- Manual button clicks to capture
- Rotating square overlay (not visually compelling)
- No scanning animation
- Poor UX flow

### Solution: 3-Stage Enrollment

#### Stage 1: Camera Permission & Guidance
```
[ Animated intro ]
"Position your face in the center"
✓ Use auto-focus
✓ Good lighting check
✓ Face detection (real-time)
```

#### Stage 2: Auto-Capture with AI Scanning Effect
```
- Detect face automatically
- Show AI scanning animation (circular scan lines)
- Capture when quality is high
- Show confidence % (0-100%)
- Progress indicator

"Front face - Capturing... 87% confidence"
[AI scanning effect - circular blue lines]
```

#### Stage 3: Multi-Angle Collection
```
Collect 3 angles:
1. Front (↗) - Captured ✓
2. Left 45° (← ) - Capturing... 92%
3. Right 45° (→ ) - Waiting...
```

### Implementation Details

**Auto-Capture Logic**
```typescript
1. Detect face using TensorFlow.js face-api
2. Calculate face quality metrics:
   - Face size: 60-90% of frame
   - Face centered: within 10% of center
   - Lighting: adequate brightness (histogram)
   - Face visibility: no occlusion
3. On high quality (>90%) + 1 second stable:
   - Capture automatically
   - Play success animation
   - Move to next angle
```

**AI Scanning Animation**
```typescript
Replace rotating square with:
- Circular scan lines (blue/purple)
- Concentric circles expanding from center
- Opacity pulse (fade in/out)
- Speed increases as confidence increases
- Color changes: blue (capturing) → green (success) → red (failure)
```

**Quality Score Algorithm**
```
Quality = (Face Detection * 0.3) + (Lighting * 0.3) + (Position * 0.2) + (Size * 0.2)

Face Detection: 0-1 (confidence from TensorFlow)
Lighting: 0-1 (based on histogram)
Position: 0-1 (distance from center / max distance)
Size: 0-1 (face area / ideal area range)
```

---

## TASK 4: Complete Authentication System

### Login Methods Priority
```
1. Email & Password (primary, always available)
2. Google OAuth (recommended, easiest)
3. GitHub OAuth (for developers)
4. Face Recognition (optional, enrolled during signup)
```

### User Flow

#### Signup Flow
```
1. Enter basic info (email, password, name)
   ↓
2. Verify email
   ↓
3. Dashboard introduction
   ↓
4. "Enroll Face Recognition?" prompt
   - Yes → Go to face enrollment
   - Later → Set 7-day reminder
   - Skip → Dismiss (remind in dashboard)
   ↓
5. Dashboard with optional reminder
```

#### Login Flow
```
1. Enter email
   ↓
2. Show available login methods:
   - Password (if has account)
   - Google OAuth
   - GitHub OAuth
   - Face Recognition (if enrolled)
   ↓
3. Select and authenticate
   ↓
4. Redirect to dashboard
```

### Session Management
```
- Token-based (JWT)
- Refresh tokens (7 days)
- Session tracking (device fingerprint, IP, user agent)
- Revoke capability
- Multiple device support
```

---

## TASK 5: Face Enrollment Flow in Signup + 7-Day Reminder

### Signup Flow Enhancement

**Step 1-3: Basic Registration** (existing)
```
[ Email → Verify → Password → Name ]
```

**Step 4: Face Enrollment Prompt** (new)
```
Modal after dashboard entry:

"Secure Your Account with Face Recognition"

[Face illustration]

"Enroll now to unlock:"
✓ Instant, passwordless login
✓ Maximum security (biometric)
✓ Takes less than 1 minute

[ Enroll Now ] [ Maybe Later ] [ Skip ]
```

### Enrollment UI
```
Three stages:
1. Front face (↗)
2. Left angle (←)
3. Right angle (→)

Each stage:
- AI scanning animation
- "Quality: X%"
- "Stability: X seconds"
- Auto-capture when ready
- Retake option if quality low
- Skip angle option (require 2 of 3)
```

### Dashboard Reminder (7 Days)
```
If user skipped face enrollment:

Card in dashboard:
┌─────────────────────────────┐
│ 🔐 Secure Your Account      │
│                              │
│ Complete face enrollment to  │
│ unlock fast, secure login.   │
│                              │
│ Time remaining: 6 days, 4 hrs │
│                              │
│ [Complete Enrollment]        │
│ [Dismiss for now]            │
└─────────────────────────────┘

After 7 days:
- Reminder converts to notification
- Can be dismissed permanently
- But highlighted in settings
```

---

## TASK 6: Seed Data Management & Production Safety

### Development (with seed data)
```sql
-- seeddata.sql (local only)

-- Test users
INSERT INTO users (email, password_hash, full_name) VALUES
  ('test@example.com', hash('password123'), 'Test User'),
  ('dev@example.com', hash('password123'), 'Dev User');

-- Test face enrollments
INSERT INTO face_enrollments (user_id, angle_type, face_embedding) VALUES
  (uuid_of_test_user, 'front', encoded_face_data);

-- Test submissions
INSERT INTO code_analyses (user_id, code, quality_score) VALUES
  (uuid_of_test_user, 'console.log("test");', 92);
```

### Production (no seed data)
```
Before deployment:
1. Backup production database
2. Run only migration SQL (no seed data)
3. Verify data integrity
4. Run sanitization script (removes test data)

Sanitization script removes:
- Test users (emails matching test patterns)
- Test enrollments
- Test submissions
- Test sessions
```

### Database Backup Strategy
```
Automated backups:
- Before each migration
- Daily backups (kept 30 days)
- Weekly archives (kept 1 year)
- All stored encrypted

Manual snapshots:
- Tag snapshots with release version
- Store rollback SQL for each version
- Document rollback procedure
```

---

## TASK 7: Versioning & Release Management Infrastructure

### Version Format
```
MAJOR.MINOR.PATCH
1.0.0 - Initial release
1.1.0 - New features (face auth)
1.1.1 - Bug fixes
2.0.0 - Breaking changes
```

### Release Checklist
```
Before Release:
[ ] Update version in package.json
[ ] Run database migrations locally
[ ] Test all CRUD operations
[ ] Verify no hardcoded test data
[ ] Run seed data → check → sanitize
[ ] Test authentication methods
[ ] Test face enrollment + 7-day reminder
[ ] Performance testing
[ ] Security audit

During Release:
[ ] Create release branch
[ ] Tag commit with version
[ ] Generate changelog
[ ] Run migrations in staging
[ ] Verify data integrity
[ ] Smoke test all APIs

After Release:
[ ] Monitor error logs
[ ] Track database performance
[ ] Verify user sessions
[ ] Document any issues
[ ] Plan next release

Rollback Plan (if needed):
[ ] Run down migration
[ ] Restore from backup
[ ] Verify data integrity
[ ] Update version tag
[ ] Notify users
```

### Database Migration Files

**Naming Convention**
```
supabase/migrations/
  20260417_v1.0.0_create_auth_tables.sql
  20260417_v1.0.1_add_face_recognition.sql
  20260418_v1.1.0_add_versioning.sql
```

**Each Migration**
```sql
-- Up (execute on deploy)
-- @version 1.0.0
-- @description Create authentication tables

CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  -- ...
);

-- Down (for rollback)
DROP TABLE users;
```

---

## Implementation Timeline

| Task | Duration | Status |
|------|----------|--------|
| Task 1: Database Schema | 3-4 hours | READY |
| Task 2: Audit APIs/CRUD | 4-5 hours | READY |
| Task 3: Face Recognition Enhancement | 3-4 hours | READY |
| Task 4: Authentication System | 5-6 hours | READY |
| Task 5: Signup + 7-Day Reminder | 3-4 hours | READY |
| Task 6: Seed Data Management | 2-3 hours | READY |
| Task 7: Release Management | 2-3 hours | READY |
| **TOTAL** | **22-29 hours** | **READY** |

---

## Key Files to Create/Update

### New Files
```
supabase/migrations/
  20260417_v1.0.0_auth_tables.sql
  20260417_v1.0.1_versioning.sql
  
lib/
  db-versioning.ts (version tracking)
  face-recognition.ts (enhanced face logic)
  auth-service.ts (auth methods)
  
app/api/auth/
  email/signup.ts
  email/login.ts
  google/callback.ts
  github/callback.ts
  face/enroll/start.ts
  face/enroll/capture.ts
  face/enroll/complete.ts
  face/login.ts
  
app/auth/
  face-enrollment/ (new)
  
components/auth/
  face-recognition-enhanced.tsx
  face-enrollment-modal.tsx
  face-reminder-card.tsx
  face-scanning-effect.tsx
```

### Files to Update
```
app/auth/signup/page.tsx - Add face enrollment prompt
app/auth/login/page.tsx - Add face login option
app/dashboard/page.tsx - Add 7-day reminder card
components/auth/face-recognition.tsx - Enhanced UX
```

---

## Success Metrics

✓ Zero data loss on deployment
✓ All CRUD operations have versioning
✓ Face recognition auto-captures correctly
✓ 7-day reminder shows for skipped enrollments
✓ 4 login methods working (email, Google, GitHub, face)
✓ No hardcoded test data in production
✓ Rollback capability verified
✓ Session management secure

---

**Status**: Ready for implementation
**Next Step**: Task 1 - Create database migrations
