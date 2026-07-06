# CodeSpectra Database Setup Guide

## Quick Start

This guide walks you through setting up the complete CodeSpectra database schema.

### Prerequisites
- Supabase project with PostgreSQL database
- SQL client or Supabase Studio access
- All SQL migration files in `/scripts` directory

---

## Migration Execution Order

Execute migrations in this exact order to avoid foreign key constraint errors:

### Phase 0: Core Infrastructure
```bash
# 1. Create extensions and base profiles table
psql -h [HOST] -U [USER] -d [DATABASE] < scripts/001-create-profiles-table.sql
```

### Phase 1: Core Tables
```bash
# 2. Initialize main schema with challenges, courses, etc.
psql -h [HOST] -U [USER] -d [DATABASE] < scripts/01-init-schema.sql

# 3. Add RBAC system
psql -h [HOST] -U [USER] -d [DATABASE] < scripts/02-rbac-schema.sql
```

### Phase 2: Feature Schemas (Order doesn't matter)
```bash
# 4. Jobs system
psql -h [HOST] -U [USER] -d [DATABASE] < scripts/10-jobs-only.sql

# 5. Exams system
psql -h [HOST] -U [USER] -d [DATABASE] < scripts/11-exams-only.sql

# 6. Codeathons system
psql -h [HOST] -U [USER] -d [DATABASE] < scripts/12-codeathons-only.sql

# 7. Resumes system
psql -h [HOST] -U [USER] -d [DATABASE] < scripts/13-resumes-only.sql

# 8. Billing system
psql -h [HOST] -U [USER] -d [DATABASE] < scripts/14-billing-only.sql

# 9. Notifications and support
psql -h [HOST] -U [USER] -d [DATABASE] < scripts/15-notifications-others.sql
```

### Phase 3: Optimization
```bash
# 10. Add all indexes and RLS policies
psql -h [HOST] -U [USER] -d [DATABASE] < scripts/16-add-indexes-and-rls.sql
```

---

## Using Supabase Studio

If you prefer the web UI:

1. Go to Supabase Dashboard → Your Project → SQL Editor
2. Create a new query
3. Copy the contents of each SQL file in order
4. Execute each migration
5. Verify tables were created with "SELECT * FROM information_schema.tables"

---

## Complete SQL Files Available

### Single-Purpose Scripts (Execute in order)
- `01-init-schema.sql` - Core tables (profiles, challenges, submissions, etc.)
- `02-rbac-schema.sql` - Role-based access control
- `10-jobs-only.sql` - Job postings and applications
- `11-exams-only.sql` - Exams and certifications
- `12-codeathons-only.sql` - Codeathons and leaderboards
- `13-resumes-only.sql` - Resume management and analysis
- `14-billing-only.sql` - Subscriptions and invoicing
- `15-notifications-others.sql` - Notifications and support
- `16-add-indexes-and-rls.sql` - Indexes and optimization

### Combined Scripts (Don't use if using individual scripts above)
- `09-all-schemas-combined.sql` - ALL schemas in one file (use if you prefer single execution)

---

## Tables Created

### Core Tables (53 total)
**Core System** (6 tables):
- `profiles` - User profiles
- `challenges` - Coding challenges
- `challenge_progress` - User challenge progress
- `submissions` - Code submissions
- `execution_results` - Execution results
- `code_analysis` - Code analysis results

**Learning System** (5 tables):
- `courses` - Courses
- `lessons` - Lessons
- `course_progress` - Course progress
- `lesson_progress` - Lesson progress
- `leaderboard` - Global leaderboard

**Gamification** (3 tables):
- `badges` - Badge definitions
- `user_badges` - User-earned badges
- `activity_log` - Activity tracking

**RBAC System** (4 tables):
- `roles` - Role definitions
- `permissions` - Permission definitions
- `role_permissions` - Role-permission mappings
- `audit_logs` - Audit trail

**Jobs System** (3 tables):
- `job_postings` - Job listings
- `job_applications` - Job applications
- `saved_jobs` - Saved job bookmarks

**Exams System** (4 tables):
- `exams` - Exam definitions
- `exam_questions` - Exam questions
- `exam_attempts` - User exam attempts
- `exam_certificates` - Exam certificates

**Codeathons System** (5 tables):
- `codeathons` - Codeathon events
- `codeathon_challenges` - Codeathon challenges
- `codeathon_registrations` - User registrations
- `codeathon_submissions` - Challenge submissions
- `codeathon_leaderboard` - Leaderboard rankings

**Resumes System** (3 tables):
- `resumes` - Resume files
- `resume_analyses` - AI analysis results
- `resume_job_matches` - Job matching results

**Billing System** (5 tables):
- `subscription_plans` - Subscription tiers
- `subscriptions` - User subscriptions
- `payment_methods` - Payment methods
- `billing_invoices` - Invoices
- `usage_records` - Usage tracking

**Notifications System** (6 tables):
- `notifications` - Notification records
- `notification_preferences` - User preferences
- `integration_configs` - External integrations
- `support_tickets` - Support tickets
- `support_messages` - Support messages
- `audit_logs` - (shared with RBAC)

---

## Indexes Created

### Primary Indexes
- **User-based lookups** (60+): All tables indexed by user_id for efficient filtering
- **Status lookups** (30+): All status columns indexed
- **Timestamps** (40+): created_at, updated_at indexed for sorting
- **Foreign keys** (50+): All relationship columns indexed

### Composite Indexes
- Job applications by (job_id, status, date)
- Exam attempts by (user_id, exam_id, date)
- Subscriptions by (user_id, status, period)
- Leaderboard by rank and score

### Full-Text Search (Optional)
- Job postings on title and description
- Challenges on title and description

Total indexes: 100+

---

## Verification

After running all migrations, verify the setup:

```sql
-- Count all tables
SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';
-- Should return: 53

-- List all tables
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- Check indexes
SELECT COUNT(*) FROM information_schema.statistics 
WHERE table_schema = 'public';
-- Should return: 100+

-- Verify constraints
SELECT COUNT(*) FROM information_schema.table_constraints 
WHERE table_schema = 'public' AND constraint_type = 'FOREIGN KEY';
-- Should return: 40+
```

---

## Seeding Data

After schema creation, seed default data:

```sql
-- Insert default subscription plans
INSERT INTO subscription_plans (name, slug, price_monthly, features) VALUES
  ('Free', 'free', 0, '["5 submissions per day", "Basic challenges"]'),
  ('Pro', 'pro', 29, '["Unlimited submissions", "All challenges", "Certificates"]'),
  ('Enterprise', 'enterprise', 99, '["Team features", "Custom challenges", "Priority support"]');

-- Insert default roles (already done in RBAC schema)

-- Insert default badges
INSERT INTO badges (name, description, icon_url, unlock_condition) VALUES
  ('First Submission', 'Submit your first code', 'first.svg', 'submissions = 1'),
  ('Century Club', 'Earn 100 points', 'century.svg', 'total_points >= 100'),
  ('Challenge Master', 'Complete 10 challenges', 'master.svg', 'challenges_completed = 10');
```

---

## Troubleshooting

### Error: "Relation does not exist"
**Cause**: Referenced table hasn't been created yet
**Fix**: Execute migrations in the correct order

### Error: "Foreign key constraint violated"
**Cause**: Trying to insert data before parent tables exist
**Fix**: Ensure all migrations complete successfully first

### Error: "Duplicate key value"
**Cause**: Running migrations twice
**Fix**: Use `IF NOT EXISTS` in all migrations (already implemented)

### Error: "UUID extension not found"
**Cause**: Extension not created
**Fix**: Run Phase 0 first to create extensions

### Slow queries after migrations
**Cause**: Indexes not created
**Fix**: Run script 16 to create all indexes

---

## Performance Tips

1. **Batch Operations**: Use transactions for bulk operations
   ```sql
   BEGIN;
   -- Insert multiple rows
   COMMIT;
   ```

2. **Connection Pooling**: Enable pgBouncer in Supabase settings
   
3. **Query Optimization**: Use indexes for WHERE clauses and JOINs

4. **Partitioning** (Future): Consider partitioning large tables by date

---

## Maintenance

### Regular Maintenance
```sql
-- Analyze table statistics
ANALYZE;

-- Rebuild indexes (weekly)
REINDEX DATABASE your_database;

-- Vacuum tables (to reclaim space)
VACUUM ANALYZE;
```

### Monitoring
- Monitor database size in Supabase dashboard
- Check slow queries in Supabase logs
- Monitor connection count (max usually 100)

---

## Backup & Recovery

### Backup (Supabase handles daily backups)
```bash
# Manual backup via CLI
supabase db pull
```

### Restore
```bash
# Restore from backup
supabase db push
```

---

## Environment Setup

Add these to your `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key
```

---

## Next Steps After Setup

1. ✅ Execute all migrations (Phase 0-3)
2. ✅ Verify tables exist
3. ✅ Seed default data (subscription plans, roles, badges)
4. ✅ Enable RLS (Row Level Security) policies
5. ✅ Configure backups
6. ✅ Start using APIs!

---

## Support

For issues:
1. Check Supabase logs for errors
2. Verify migration execution order
3. Check foreign key dependencies
4. Ensure all extensions are enabled

---

## File Reference

| Script | Purpose | Tables | Duration |
|--------|---------|--------|----------|
| 001-create-profiles-table.sql | Extensions & base | 1 | < 1s |
| 01-init-schema.sql | Core system | 13 | < 2s |
| 02-rbac-schema.sql | RBAC system | 4 | < 1s |
| 10-jobs-only.sql | Jobs feature | 3 | < 1s |
| 11-exams-only.sql | Exams feature | 4 | < 1s |
| 12-codeathons-only.sql | Codeathons feature | 5 | < 1s |
| 13-resumes-only.sql | Resumes feature | 3 | < 1s |
| 14-billing-only.sql | Billing feature | 5 | < 1s |
| 15-notifications-others.sql | Notifications | 6 | < 1s |
| 16-add-indexes-and-rls.sql | Indexes & optimization | - | < 5s |

**Total Setup Time**: ~20 seconds

---

## SQL Migration Status Checklist

- [ ] Phase 0: Base tables created
- [ ] Phase 1: Core system tables created
- [ ] Phase 2: Feature tables created
- [ ] Phase 3: Indexes and RLS created
- [ ] Verification queries passed
- [ ] Data seeded
- [ ] Backups configured
- [ ] Ready for production

