-- Minimal RBAC Schema without dependencies
-- Creates roles, permissions, and mapping tables

-- Roles table
CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Permissions table
CREATE TABLE IF NOT EXISTS permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  resource TEXT NOT NULL,
  action TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Role-Permission mapping
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (role_id, permission_id)
);

-- Audit logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID,
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  resource_id TEXT,
  changes JSONB,
  ip_address TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indices
CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission ON role_permissions(permission_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

-- Insert default roles
INSERT INTO roles (name, description) 
VALUES 
  ('superadmin', 'Full platform access without restrictions'),
  ('admin', 'Can manage team, users, and assigned features'),
  ('user', 'Regular user with basic access')
ON CONFLICT (name) DO NOTHING;

-- Insert default permissions
INSERT INTO permissions (name, description, resource, action)
VALUES
  ('view_dashboard', 'View dashboard', 'dashboard', 'view'),
  ('view_challenges', 'View challenges', 'challenges', 'view'),
  ('create_challenges', 'Create challenges', 'challenges', 'create'),
  ('edit_challenges', 'Edit challenges', 'challenges', 'edit'),
  ('delete_challenges', 'Delete challenges', 'challenges', 'delete'),
  ('view_interviews', 'View mock interviews', 'interviews', 'view'),
  ('create_interviews', 'Create interviews', 'interviews', 'create'),
  ('view_learning', 'View learning hub', 'learning', 'view'),
  ('create_learning', 'Create learning content', 'learning', 'create'),
  ('manage_users', 'Manage users', 'users', 'manage'),
  ('manage_roles', 'Manage roles and permissions', 'roles', 'manage'),
  ('view_analytics', 'View analytics', 'analytics', 'view'),
  ('access_admin', 'Access admin dashboard', 'admin', 'access'),
  ('manage_team', 'Manage team members', 'team', 'manage')
ON CONFLICT (name) DO NOTHING;

-- Assign ALL permissions to superadmin (full unrestricted access)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p WHERE r.name = 'superadmin'
ON CONFLICT DO NOTHING;

-- Assign basic permissions to user role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p 
WHERE r.name = 'user' AND p.name IN ('view_dashboard', 'view_challenges', 'view_interviews', 'view_learning')
ON CONFLICT DO NOTHING;

-- Assign admin permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p 
WHERE r.name = 'admin' AND p.name IN (
  'view_dashboard', 'view_challenges', 'create_challenges', 'edit_challenges',
  'view_interviews', 'view_learning', 'manage_users', 'view_analytics', 'access_admin', 'manage_team'
)
ON CONFLICT DO NOTHING;
