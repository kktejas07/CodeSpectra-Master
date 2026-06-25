-- Billing and Subscriptions Schema

-- Subscription plans
CREATE TABLE IF NOT EXISTS subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,
  price_monthly DECIMAL(10,2) NOT NULL,
  price_yearly DECIMAL(10,2),
  currency VARCHAR(10) DEFAULT 'USD',
  features JSONB DEFAULT '[]',
  limits JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  is_featured BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  stripe_price_id_monthly VARCHAR(255),
  stripe_price_id_yearly VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES subscription_plans(id),
  status VARCHAR(50) DEFAULT 'active',
  billing_cycle VARCHAR(20) DEFAULT 'monthly',
  current_period_start TIMESTAMP WITH TIME ZONE,
  current_period_end TIMESTAMP WITH TIME ZONE,
  cancel_at_period_end BOOLEAN DEFAULT false,
  canceled_at TIMESTAMP WITH TIME ZONE,
  stripe_subscription_id VARCHAR(255),
  stripe_customer_id VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Billing invoices
CREATE TABLE IF NOT EXISTS billing_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  invoice_number VARCHAR(100) UNIQUE NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'USD',
  status VARCHAR(50) DEFAULT 'pending',
  description TEXT,
  billing_period_start TIMESTAMP WITH TIME ZONE,
  billing_period_end TIMESTAMP WITH TIME ZONE,
  due_date TIMESTAMP WITH TIME ZONE,
  paid_at TIMESTAMP WITH TIME ZONE,
  stripe_invoice_id VARCHAR(255),
  stripe_payment_intent_id VARCHAR(255),
  pdf_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Payment methods
CREATE TABLE IF NOT EXISTS payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  last_four VARCHAR(4),
  brand VARCHAR(50),
  exp_month INTEGER,
  exp_year INTEGER,
  is_default BOOLEAN DEFAULT false,
  stripe_payment_method_id VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Usage tracking (for metered billing)
CREATE TABLE IF NOT EXISTS usage_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  feature VARCHAR(100) NOT NULL,
  quantity INTEGER DEFAULT 1,
  recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default plans
INSERT INTO subscription_plans (name, slug, description, price_monthly, price_yearly, features, limits, is_featured, sort_order) VALUES
('Free', 'free', 'Get started with basic features', 0, 0, 
  '["5 code scans per month", "Basic analysis", "Community support"]'::jsonb,
  '{"scans_per_month": 5, "team_members": 1}'::jsonb,
  false, 1),
('Pro', 'pro', 'For individual developers', 19.99, 199.99,
  '["Unlimited code scans", "Advanced AI analysis", "Resume analysis", "Priority support", "GitHub integration"]'::jsonb,
  '{"scans_per_month": -1, "team_members": 1, "resume_analyses": 10}'::jsonb,
  true, 2),
('Team', 'team', 'For development teams', 49.99, 499.99,
  '["Everything in Pro", "Team collaboration", "Admin dashboard", "API access", "Custom integrations", "Dedicated support"]'::jsonb,
  '{"scans_per_month": -1, "team_members": 10, "resume_analyses": 50}'::jsonb,
  false, 3),
('Enterprise', 'enterprise', 'For large organizations', 199.99, 1999.99,
  '["Everything in Team", "Unlimited team members", "SSO/SAML", "Custom deployment", "SLA guarantee", "24/7 support"]'::jsonb,
  '{"scans_per_month": -1, "team_members": -1, "resume_analyses": -1}'::jsonb,
  false, 4)
ON CONFLICT (slug) DO NOTHING;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_user ON billing_invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_status ON billing_invoices(status);
CREATE INDEX IF NOT EXISTS idx_payment_methods_user ON payment_methods(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_records_user ON usage_records(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_records_date ON usage_records(recorded_at);

-- RLS Policies
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_records ENABLE ROW LEVEL SECURITY;

-- Plans: Public read
CREATE POLICY "Anyone can view active plans"
  ON subscription_plans FOR SELECT
  USING (is_active = true);

-- Subscriptions: Users view their own
CREATE POLICY "Users view their subscriptions"
  ON subscriptions FOR ALL
  USING (user_id = auth.uid());

-- Invoices: Users view their own
CREATE POLICY "Users view their invoices"
  ON billing_invoices FOR SELECT
  USING (user_id = auth.uid());

-- Payment methods: Users manage their own
CREATE POLICY "Users manage their payment methods"
  ON payment_methods FOR ALL
  USING (user_id = auth.uid());

-- Usage: Users view their own
CREATE POLICY "Users view their usage"
  ON usage_records FOR SELECT
  USING (user_id = auth.uid());

-- Admin access
CREATE POLICY "Admins can view all subscriptions"
  ON subscriptions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );
