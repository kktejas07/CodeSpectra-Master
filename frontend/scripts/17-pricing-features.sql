-- Pricing & Features Configuration
-- Tables for managing pricing tiers, features, and feature toggles per plan

-- Feature catalog
CREATE TABLE IF NOT EXISTS features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  category VARCHAR(100),
  icon VARCHAR(100),
  enabled_by_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Pricing tiers
CREATE TABLE IF NOT EXISTS pricing_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  display_name VARCHAR(255),
  price_monthly INTEGER,
  price_yearly INTEGER,
  currency VARCHAR(10) DEFAULT 'USD',
  billing_cycle VARCHAR(50),
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Feature availability per tier
CREATE TABLE IF NOT EXISTS tier_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_id UUID NOT NULL REFERENCES pricing_tiers(id) ON DELETE CASCADE,
  feature_id UUID NOT NULL REFERENCES features(id) ON DELETE CASCADE,
  is_enabled BOOLEAN DEFAULT true,
  limit_value INTEGER,
  limit_type VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(tier_id, feature_id)
);

-- Role-based feature permissions
CREATE TABLE IF NOT EXISTS role_feature_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  feature_id UUID NOT NULL REFERENCES features(id) ON DELETE CASCADE,
  can_access BOOLEAN DEFAULT true,
  can_manage BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(role_id, feature_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_features_category ON features(category);
CREATE INDEX IF NOT EXISTS idx_pricing_tiers_active ON pricing_tiers(is_active);
CREATE INDEX IF NOT EXISTS idx_tier_features_tier ON tier_features(tier_id);
CREATE INDEX IF NOT EXISTS idx_tier_features_feature ON tier_features(feature_id);
CREATE INDEX IF NOT EXISTS idx_role_feature_permissions_role ON role_feature_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_role_feature_permissions_feature ON role_feature_permissions(feature_id);

-- Enable RLS
ALTER TABLE features ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE tier_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_feature_permissions ENABLE ROW LEVEL SECURITY;

-- Pricing tier RLS policies
CREATE POLICY "pricing_tiers_read_all" ON pricing_tiers FOR SELECT USING (is_active = true);
CREATE POLICY "pricing_tiers_admin_all" ON pricing_tiers FOR ALL USING (auth.role() = 'authenticated' AND EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.role_id IN (SELECT id FROM roles WHERE name = 'Superadmin')));

-- Features RLS policies
CREATE POLICY "features_read_all" ON features FOR SELECT USING (true);
CREATE POLICY "features_admin_all" ON features FOR ALL USING (auth.role() = 'authenticated' AND EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.role_id IN (SELECT id FROM roles WHERE name = 'Superadmin')));

-- Tier features RLS
CREATE POLICY "tier_features_read_all" ON tier_features FOR SELECT USING (true);
CREATE POLICY "tier_features_admin_all" ON tier_features FOR ALL USING (auth.role() = 'authenticated' AND EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.role_id IN (SELECT id FROM roles WHERE name = 'Superadmin')));

-- Role permissions RLS
CREATE POLICY "role_feature_permissions_admin" ON role_feature_permissions FOR ALL USING (auth.role() = 'authenticated' AND EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.role_id IN (SELECT id FROM roles WHERE name = 'Superadmin')));
