-- Master Indexes and RLS Policies for CodeSpectra
-- Run after all base schema migrations

-- ═══════════════════════════════════════════════════════════════════
-- JOBS TABLE INDEXES AND RLS
-- ═══════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_job_postings_created_by ON job_postings(created_by);
CREATE INDEX IF NOT EXISTS idx_job_postings_company ON job_postings(company);
CREATE INDEX IF NOT EXISTS idx_job_postings_is_active ON job_postings(is_active);
CREATE INDEX IF NOT EXISTS idx_job_postings_created_at ON job_postings(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_job_applications_user_id ON job_applications(user_id);
CREATE INDEX IF NOT EXISTS idx_job_applications_job_id ON job_applications(job_id);
CREATE INDEX IF NOT EXISTS idx_job_applications_status ON job_applications(status);
CREATE INDEX IF NOT EXISTS idx_job_applications_applied_at ON job_applications(applied_at DESC);

CREATE INDEX IF NOT EXISTS idx_saved_jobs_user_id ON saved_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_jobs_job_id ON saved_jobs(job_id);
CREATE INDEX IF NOT EXISTS idx_saved_jobs_saved_at ON saved_jobs(saved_at DESC);

-- ═══════════════════════════════════════════════════════════════════
-- EXAMS TABLE INDEXES AND RLS
-- ═══════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_exams_created_by ON exams(created_by);
CREATE INDEX IF NOT EXISTS idx_exams_category ON exams(category);
CREATE INDEX IF NOT EXISTS idx_exams_is_active ON exams(is_active);
CREATE INDEX IF NOT EXISTS idx_exams_created_at ON exams(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_exam_questions_exam_id ON exam_questions(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_attempts_user_id ON exam_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_exam_attempts_exam_id ON exam_attempts(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_attempts_status ON exam_attempts(status);
CREATE INDEX IF NOT EXISTS idx_exam_attempts_completed_at ON exam_attempts(completed_at DESC);

CREATE INDEX IF NOT EXISTS idx_exam_certificates_user_id ON exam_certificates(user_id);
CREATE INDEX IF NOT EXISTS idx_exam_certificates_exam_id ON exam_certificates(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_certificates_issued_at ON exam_certificates(issued_at DESC);

-- ═══════════════════════════════════════════════════════════════════
-- CODEATHONS TABLE INDEXES AND RLS
-- ═══════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_codeathons_created_by ON codeathons(created_by);
CREATE INDEX IF NOT EXISTS idx_codeathons_status ON codeathons(status);
CREATE INDEX IF NOT EXISTS idx_codeathons_start_date ON codeathons(start_date DESC);
CREATE INDEX IF NOT EXISTS idx_codeathons_end_date ON codeathons(end_date DESC);

CREATE INDEX IF NOT EXISTS idx_codeathon_challenges_codeathon_id ON codeathon_challenges(codeathon_id);
CREATE INDEX IF NOT EXISTS idx_codeathon_registrations_user_id ON codeathon_registrations(user_id);
CREATE INDEX IF NOT EXISTS idx_codeathon_registrations_codeathon_id ON codeathon_registrations(codeathon_id);
CREATE INDEX IF NOT EXISTS idx_codeathon_registrations_status ON codeathon_registrations(status);

CREATE INDEX IF NOT EXISTS idx_codeathon_submissions_user_id ON codeathon_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_codeathon_submissions_challenge_id ON codeathon_submissions(challenge_id);
CREATE INDEX IF NOT EXISTS idx_codeathon_submissions_status ON codeathon_submissions(status);
CREATE INDEX IF NOT EXISTS idx_codeathon_submissions_submitted_at ON codeathon_submissions(submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_codeathon_leaderboard_codeathon_id ON codeathon_leaderboard(codeathon_id);
CREATE INDEX IF NOT EXISTS idx_codeathon_leaderboard_rank ON codeathon_leaderboard(rank);

-- ═══════════════════════════════════════════════════════════════════
-- RESUMES TABLE INDEXES AND RLS
-- ═══════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_resumes_user_id ON resumes(user_id);
CREATE INDEX IF NOT EXISTS idx_resumes_is_primary ON resumes(is_primary);
CREATE INDEX IF NOT EXISTS idx_resumes_created_at ON resumes(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_resume_analyses_resume_id ON resume_analyses(resume_id);
CREATE INDEX IF NOT EXISTS idx_resume_analyses_created_at ON resume_analyses(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_resume_job_matches_resume_id ON resume_job_matches(resume_id);
CREATE INDEX IF NOT EXISTS idx_resume_job_matches_job_id ON resume_job_matches(job_id);
CREATE INDEX IF NOT EXISTS idx_resume_job_matches_match_score ON resume_job_matches(match_score DESC);

-- ═══════════════════════════════════════════════════════════════════
-- BILLING TABLE INDEXES AND RLS
-- ═══════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_subscription_plans_slug ON subscription_plans(slug);
CREATE INDEX IF NOT EXISTS idx_subscription_plans_is_active ON subscription_plans(is_active);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_plan_id ON subscriptions(plan_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer_id ON subscriptions(stripe_customer_id);

CREATE INDEX IF NOT EXISTS idx_payment_methods_user_id ON payment_methods(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_methods_is_default ON payment_methods(is_default);

CREATE INDEX IF NOT EXISTS idx_billing_invoices_user_id ON billing_invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_subscription_id ON billing_invoices(subscription_id);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_status ON billing_invoices(status);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_created_at ON billing_invoices(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_usage_records_user_id ON usage_records(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_records_subscription_id ON usage_records(subscription_id);
CREATE INDEX IF NOT EXISTS idx_usage_records_recorded_at ON usage_records(recorded_at DESC);

-- ═══════════════════════════════════════════════════════════════════
-- NOTIFICATIONS TABLE INDEXES AND RLS
-- ═══════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_preferences_user_id ON notification_preferences(user_id);

CREATE INDEX IF NOT EXISTS idx_integration_configs_user_id ON integration_configs(user_id);
CREATE INDEX IF NOT EXISTS idx_integration_configs_provider ON integration_configs(provider);

CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_priority ON support_tickets(priority);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created_at ON support_tickets(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_messages_ticket_id ON support_messages(ticket_id);
CREATE INDEX IF NOT EXISTS idx_support_messages_created_at ON support_messages(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- ═══════════════════════════════════════════════════════════════════
-- GENERIC INDEXES FOR COMMON LOOKUPS
-- ═══════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);
CREATE INDEX IF NOT EXISTS idx_challenges_category ON challenges(category);
CREATE INDEX IF NOT EXISTS idx_challenges_difficulty ON challenges(difficulty);
CREATE INDEX IF NOT EXISTS idx_challenge_progress_user_id ON challenge_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_challenge_progress_status ON challenge_progress(status);
CREATE INDEX IF NOT EXISTS idx_submissions_user_id ON submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_submissions_challenge_id ON submissions(challenge_id);
CREATE INDEX IF NOT EXISTS idx_submissions_created_at ON submissions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leaderboard_rank ON leaderboard(rank);

-- ═══════════════════════════════════════════════════════════════════
-- COMPOSITE INDEXES FOR COMMON QUERIES
-- ═══════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_job_applications_composite ON job_applications(job_id, status, applied_at DESC);
CREATE INDEX IF NOT EXISTS idx_exam_attempts_composite ON exam_attempts(user_id, exam_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscriptions_composite ON subscriptions(user_id, status, current_period_end);
CREATE INDEX IF NOT EXISTS idx_codeathon_registrations_composite ON codeathon_registrations(codeathon_id, status);

-- ═══════════════════════════════════════════════════════════════════
-- FULL TEXT SEARCH INDEXES (Optional - for advanced search)
-- ═══════════════════════════════════════════════════════════════════

-- These are optional if you want full-text search capabilities
-- Uncomment if needed

-- CREATE INDEX IF NOT EXISTS idx_job_postings_fts ON job_postings USING gin(to_tsvector('english', title || ' ' || description));
-- CREATE INDEX IF NOT EXISTS idx_challenges_fts ON challenges USING gin(to_tsvector('english', title || ' ' || description));

-- ═══════════════════════════════════════════════════════════════════
-- END OF MIGRATION
-- ═══════════════════════════════════════════════════════════════════
