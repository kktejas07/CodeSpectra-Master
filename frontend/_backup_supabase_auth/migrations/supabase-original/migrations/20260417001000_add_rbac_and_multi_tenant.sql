-- Multi-tenant and RBAC System
-- Superadmin, Tenant Admin, and User roles with granular permissions

-- Create role enum
CREATE TYPE user_role_type AS ENUM ('superadmin', 'tenant_admin', 'user');
CREATE TYPE permission_level AS ENUM ('read', 'write', 'admin', 'full');

-- Create organizations/tenants table
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  description TEXT,
  logo_url TEXT,
  website TEXT,
  industry VARCHAR(100),
  employee_count INT,
  subscription_tier VARCHAR(50) DEFAULT 'free',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);

-- Create user roles in organization table
CREATE TABLE user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role user_role_type NOT NULL DEFAULT 'user',
  joined_at TIMESTAMP DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true,
  UNIQUE(user_id, organization_id)
);

-- Create permissions table
CREATE TABLE permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  category VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create role permissions mapping
CREATE TABLE role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role user_role_type NOT NULL,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  UNIQUE(role, permission_id, organization_id)
);

-- Create invitations table for tenant admin to invite users
CREATE TABLE organization_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  invited_by UUID NOT NULL REFERENCES profiles(id),
  role user_role_type DEFAULT 'user',
  token VARCHAR(255) UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  accepted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create audit log table
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id),
  organization_id UUID REFERENCES organizations(id),
  action VARCHAR(255) NOT NULL,
  resource_type VARCHAR(100),
  resource_id VARCHAR(255),
  old_values JSONB,
  new_values JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Add organization_id to profiles
ALTER TABLE profiles ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL;
ALTER TABLE profiles ADD COLUMN role user_role_type DEFAULT 'user';

-- Create indexes for performance
CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX idx_user_roles_organization_id ON user_roles(organization_id);
CREATE INDEX idx_role_permissions_role ON role_permissions(role);
CREATE INDEX idx_audit_logs_organization_id ON audit_logs(organization_id);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX idx_organizations_slug ON organizations(slug);

-- Insert default permissions
INSERT INTO permissions (name, description, category) VALUES
('view_dashboard', 'View dashboard', 'dashboard'),
('manage_team', 'Manage team members', 'team'),
('manage_organization', 'Manage organization settings', 'organization'),
('create_exam', 'Create exams', 'events'),
('manage_exams', 'Manage exams', 'events'),
('create_codeathon', 'Create codeathons', 'events'),
('manage_codeathons', 'Manage codeathons', 'events'),
('post_jobs', 'Post job openings', 'jobs'),
('manage_jobs', 'Manage job postings', 'jobs'),
('review_resumes', 'Review submitted resumes', 'resumes'),
('view_analytics', 'View organization analytics', 'analytics'),
('manage_integrations', 'Manage integrations', 'integrations'),
('manage_billing', 'Manage billing and subscriptions', 'billing');

-- Set up RLS (Row Level Security) policies
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Organizations: Users can see their own organizations
CREATE POLICY "Users can view their organizations" ON organizations
  FOR SELECT USING (
    id IN (
      SELECT organization_id FROM user_roles WHERE user_id = auth.uid()
    )
    OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'superadmin'
  );

-- Users can only update their own organization (as admin)
CREATE POLICY "Organization admins can update their organization" ON organizations
  FOR UPDATE USING (
    id IN (
      SELECT organization_id FROM user_roles 
      WHERE user_id = auth.uid() AND role = 'tenant_admin'
    )
  );

-- User roles: Users can only see their own roles
CREATE POLICY "Users can view their own roles" ON user_roles
  FOR SELECT USING (
    user_id = auth.uid() 
    OR organization_id IN (
      SELECT organization_id FROM user_roles WHERE user_id = auth.uid() AND role = 'tenant_admin'
    )
  );

-- Audit logs: Users can only see logs from their organization
CREATE POLICY "Users can view audit logs from their organization" ON audit_logs
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM user_roles WHERE user_id = auth.uid()
    )
    OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'superadmin'
  );

GRANT ALL ON organizations TO authenticated;
GRANT ALL ON user_roles TO authenticated;
GRANT ALL ON permissions TO authenticated;
GRANT ALL ON role_permissions TO authenticated;
GRANT ALL ON organization_invitations TO authenticated;
GRANT ALL ON audit_logs TO authenticated;
