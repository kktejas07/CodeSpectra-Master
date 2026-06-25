-- Additional tables for complete feature set

-- Integrations table
CREATE TABLE integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  auth_token TEXT,
  config JSONB,
  is_active BOOLEAN DEFAULT true,
  connected_at TIMESTAMP DEFAULT NOW(),
  last_used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Subscription plans
CREATE TABLE subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  price_monthly DECIMAL(10, 2),
  price_yearly DECIMAL(10, 2),
  features JSONB,
  max_users INT,
  max_exams INT,
  max_jobs INT,
  max_storage_gb INT,
  stripe_price_id VARCHAR(255),
  is_active BOOLEAN DEFAULT true,
  display_order INT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Subscriptions
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES subscription_plans(id),
  stripe_subscription_id VARCHAR(255),
  status VARCHAR(50) DEFAULT 'active',
  current_period_start TIMESTAMP,
  current_period_end TIMESTAMP,
  canceled_at TIMESTAMP,
  trial_ends_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Invoices
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES subscriptions(id),
  stripe_invoice_id VARCHAR(255),
  amount DECIMAL(10, 2),
  currency VARCHAR(3) DEFAULT 'USD',
  status VARCHAR(50) DEFAULT 'draft',
  due_date DATE,
  paid_at TIMESTAMP,
  pdf_url TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Support tickets
CREATE TABLE support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id),
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(50),
  priority VARCHAR(20) DEFAULT 'medium',
  status VARCHAR(50) DEFAULT 'open',
  assigned_to UUID REFERENCES profiles(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  closed_at TIMESTAMP
);

-- Support ticket messages
CREATE TABLE ticket_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id),
  message TEXT NOT NULL,
  attachments TEXT[],
  created_at TIMESTAMP DEFAULT NOW()
);

-- Notifications
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255),
  message TEXT,
  related_resource_type VARCHAR(100),
  related_resource_id VARCHAR(255),
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Email notification preferences
CREATE TABLE notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  email_marketing BOOLEAN DEFAULT true,
  email_updates BOOLEAN DEFAULT true,
  email_tickets BOOLEAN DEFAULT true,
  email_events BOOLEAN DEFAULT true,
  in_app_notifications BOOLEAN DEFAULT true,
  digest_frequency VARCHAR(50) DEFAULT 'daily',
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Resumes
CREATE TABLE resumes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id),
  file_url TEXT NOT NULL,
  file_name VARCHAR(255),
  file_size INT,
  content_text TEXT,
  extracted_data JSONB,
  is_primary BOOLEAN DEFAULT false,
  uploaded_at TIMESTAMP DEFAULT NOW()
);

-- Jobs
CREATE TABLE job_postings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES profiles(id),
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  requirements TEXT,
  skills TEXT[],
  salary_min DECIMAL(10, 2),
  salary_max DECIMAL(10, 2),
  salary_currency VARCHAR(3),
  location VARCHAR(255),
  job_type VARCHAR(50),
  experience_level VARCHAR(50),
  status VARCHAR(50) DEFAULT 'open',
  published_at TIMESTAMP,
  closed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Job applications
CREATE TABLE job_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES job_postings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  resume_id UUID REFERENCES resumes(id),
  cover_letter TEXT,
  status VARCHAR(50) DEFAULT 'pending',
  rating INT,
  notes TEXT,
  applied_at TIMESTAMP DEFAULT NOW(),
  reviewed_at TIMESTAMP
);

-- Exams/Assessments
CREATE TABLE exams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES profiles(id),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  duration_minutes INT,
  passing_score INT,
  max_attempts INT,
  status VARCHAR(50) DEFAULT 'draft',
  published_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Exam questions
CREATE TABLE exam_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  question_type VARCHAR(50),
  options JSONB,
  correct_answer VARCHAR(255),
  explanation TEXT,
  points INT DEFAULT 1,
  order_index INT
);

-- Exam submissions
CREATE TABLE exam_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  attempt_number INT,
  answers JSONB,
  score INT,
  passed BOOLEAN,
  started_at TIMESTAMP DEFAULT NOW(),
  submitted_at TIMESTAMP,
  duration_seconds INT
);

-- Codeathons/Events
CREATE TABLE codeathons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES profiles(id),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  event_type VARCHAR(50),
  start_date TIMESTAMP NOT NULL,
  end_date TIMESTAMP NOT NULL,
  max_participants INT,
  entry_fee DECIMAL(10, 2),
  registration_deadline TIMESTAMP,
  status VARCHAR(50) DEFAULT 'upcoming',
  prize_pool DECIMAL(12, 2),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Codeathon participants
CREATE TABLE codeathon_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codeathon_id UUID NOT NULL REFERENCES codeathons(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  team_id UUID,
  registration_date TIMESTAMP DEFAULT NOW(),
  submission_url TEXT,
  score INT,
  rank INT,
  UNIQUE(codeathon_id, user_id)
);

-- Create indexes
CREATE INDEX idx_integrations_organization_id ON integrations(organization_id);
CREATE INDEX idx_subscriptions_organization_id ON subscriptions(organization_id);
CREATE INDEX idx_invoices_organization_id ON invoices(organization_id);
CREATE INDEX idx_support_tickets_organization_id ON support_tickets(organization_id);
CREATE INDEX idx_support_tickets_user_id ON support_tickets(user_id);
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_is_read ON notifications(is_read);
CREATE INDEX idx_resumes_user_id ON resumes(user_id);
CREATE INDEX idx_job_postings_organization_id ON job_postings(organization_id);
CREATE INDEX idx_job_applications_job_id ON job_applications(job_id);
CREATE INDEX idx_job_applications_user_id ON job_applications(user_id);
CREATE INDEX idx_exams_organization_id ON exams(organization_id);
CREATE INDEX idx_exam_submissions_user_id ON exam_submissions(user_id);
CREATE INDEX idx_codeathons_organization_id ON codeathons(organization_id);
CREATE INDEX idx_codeathon_participants_user_id ON codeathon_participants(user_id);

-- Enable RLS
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE resumes ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_postings ENABLE ROW LEVEL SECURITY;
ALTER TABLE exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE codeathons ENABLE ROW LEVEL SECURITY;

GRANT ALL ON integrations TO authenticated;
GRANT ALL ON subscription_plans TO authenticated;
GRANT ALL ON subscriptions TO authenticated;
GRANT ALL ON invoices TO authenticated;
GRANT ALL ON support_tickets TO authenticated;
GRANT ALL ON ticket_messages TO authenticated;
GRANT ALL ON notifications TO authenticated;
GRANT ALL ON notification_preferences TO authenticated;
GRANT ALL ON resumes TO authenticated;
GRANT ALL ON job_postings TO authenticated;
GRANT ALL ON job_applications TO authenticated;
GRANT ALL ON exams TO authenticated;
GRANT ALL ON exam_questions TO authenticated;
GRANT ALL ON exam_submissions TO authenticated;
GRANT ALL ON codeathons TO authenticated;
GRANT ALL ON codeathon_participants TO authenticated;
