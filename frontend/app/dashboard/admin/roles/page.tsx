'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Users,
  Lock,
  Shield,
  Plus,
  Edit2,
  Trash2,
  Check,
} from 'lucide-react'
import { getRoleLabel, normalizeUserRole } from '@/lib/rbac'
import { usePageGuard } from '@/lib/use-page-guard'

interface Role {
  id: string
  name: string
  description: string
  permissions: string[]
  userCount: number
}

interface User {
  id: string
  email: string
  name: string
  role: string
  status: 'active' | 'inactive'
}

const MOCK_ROLES: Role[] = [
  {
    id: '1',
    name: 'Superadmin',
    description: 'Full unrestricted access to entire platform',
    permissions: [
      'dashboard:full',
      'users:manage',
      'roles:manage',
      'system:settings',
      'admin:access',
    ],
    userCount: 1,
  },
  {
    id: '2',
    name: 'Admin',
    description: 'Can manage team and assigned features',
    permissions: [
      'dashboard:view',
      'team:manage',
      'users:manage_team',
      'analytics:view',
      'admin:access_team',
    ],
    userCount: 3,
  },
  {
    id: '3',
    name: 'User',
    description: 'Regular user with basic access',
    permissions: [
      'dashboard:view',
      'challenges:view',
      'learning:view',
      'profile:edit',
    ],
    userCount: 45,
  },
]

const MOCK_USERS: User[] = [
  {
    id: '1',
    email: 'admin@example.com',
    name: 'System Admin',
    role: 'superadmin',
    status: 'active',
  },
  {
    id: '2',
    email: 'john@example.com',
    name: 'John Manager',
    role: 'tenant_admin',
    status: 'active',
  },
  {
    id: '3',
    email: 'jane@example.com',
    name: 'Jane User',
    role: 'user',
    status: 'active',
  },
]

const ALL_PERMISSIONS = [
  { resource: 'dashboard', actions: ['view', 'manage', 'full'] },
  { resource: 'users', actions: ['view', 'manage', 'manage_team', 'delete'] },
  { resource: 'roles', actions: ['view', 'manage'] },
  { resource: 'permissions', actions: ['manage'] },
  { resource: 'challenges', actions: ['view', 'create', 'edit', 'delete'] },
  { resource: 'learning', actions: ['view', 'create', 'edit', 'delete'] },
  { resource: 'team', actions: ['view', 'manage'] },
  { resource: 'analytics', actions: ['view'] },
  { resource: 'system', actions: ['settings'] },
  { resource: 'admin', actions: ['access', 'access_team'] },
]

export default function RolesPermissions() {
  const gate = usePageGuard('superadmin')
  if (!gate.ready) return <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">Loading…</div>

  const [roles, setRoles] = useState<Role[]>(MOCK_ROLES)
  const [users, setUsers] = useState<User[]>(MOCK_USERS)
  const [selectedRole, setSelectedRole] = useState<Role | null>(MOCK_ROLES[0])
  const [activeTab, setActiveTab] = useState('roles')

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-6 h-6 text-primary" />
          <h1 className="text-3xl font-bold text-foreground">
            Roles & Permissions
          </h1>
        </div>
        <p className="text-foreground/60">
          Manage roles and assign permissions to users. Superadmin has unrestricted access to all platform features.
        </p>
      </div>

      <Tabs defaultValue="roles" value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="roles" className="gap-2">
            <Lock className="w-4 h-4" />
            Roles
          </TabsTrigger>
          <TabsTrigger value="users" className="gap-2">
            <Users className="w-4 h-4" />
            User Assignments
          </TabsTrigger>
        </TabsList>

        {/* Roles Tab */}
        <TabsContent value="roles" className="space-y-6 mt-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold text-foreground">
              System Roles
            </h2>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              New Role
            </Button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Roles List */}
            <div className="space-y-3">
              {roles.map((role) => (
                <Card
                  key={role.id}
                  className={`p-4 cursor-pointer transition ${
                    selectedRole?.id === role.id
                      ? 'border-primary bg-primary/5'
                      : 'hover:border-primary/50'
                  }`}
                  onClick={() => setSelectedRole(role)}
                >
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <h3 className="font-semibold text-foreground">
                        {role.name}
                      </h3>
                      <p className="text-xs text-foreground/60">
                        {role.userCount} users
                      </p>
                    </div>
                    {role.name === 'Superadmin' && (
                      <Badge className="bg-red-100 text-red-800">
                        Unrestricted
                      </Badge>
                    )}
                  </div>
                </Card>
              ))}
            </div>

            {/* Role Details */}
            {selectedRole && (
              <div className="lg:col-span-2 space-y-4">
                <Card className="p-6 space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-foreground">
                        {selectedRole.name}
                      </h3>
                      <p className="text-sm text-foreground/60 mt-1">
                        {selectedRole.description}
                      </p>
                    </div>
                    {selectedRole.name !== 'Superadmin' && (
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm">
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button variant="outline" size="sm">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <h4 className="font-semibold text-foreground">
                      Permissions
                    </h4>
                    <div className="space-y-2">
                      {selectedRole.permissions.map((perm) => (
                        <div
                          key={perm}
                          className="flex items-center gap-3 p-2 bg-foreground/5 rounded"
                        >
                          <Check className="w-4 h-4 text-green-600" />
                          <span className="text-sm text-foreground font-mono">
                            {perm}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {selectedRole.name === 'Superadmin' && (
                    <div className="p-3 bg-yellow-100 text-yellow-800 rounded text-sm">
                      Superadmin has unrestricted access to all platform features and settings without any restrictions.
                    </div>
                  )}

                  <Button className="w-full">Save Changes</Button>
                </Card>

                {/* All Available Permissions Reference */}
                <Card className="p-6 space-y-4">
                  <h4 className="font-semibold text-foreground">
                    Available Permissions Reference
                  </h4>
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {ALL_PERMISSIONS.map(({ resource, actions }) => (
                      <div key={resource} className="border-b pb-3 last:border-b-0">
                        <p className="text-sm font-mono text-primary font-semibold">
                          {resource}
                        </p>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {actions.map((action) => (
                            <Badge
                              key={action}
                              variant="outline"
                              className="text-xs"
                            >
                              :{action}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Users Tab */}
        <TabsContent value="users" className="space-y-6 mt-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold text-foreground">
              User Role Assignments
            </h2>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Add User
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-4 font-semibold text-foreground">
                    Email
                  </th>
                  <th className="text-left py-3 px-4 font-semibold text-foreground">
                    Name
                  </th>
                  <th className="text-left py-3 px-4 font-semibold text-foreground">
                    Role
                  </th>
                  <th className="text-left py-3 px-4 font-semibold text-foreground">
                    Status
                  </th>
                  <th className="text-left py-3 px-4 font-semibold text-foreground">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-border/50">
                    <td className="py-3 px-4 text-foreground font-mono text-xs">
                      {user.email}
                    </td>
                    <td className="py-3 px-4 text-foreground">{user.name}</td>
                    <td className="py-3 px-4">
                      <Badge
                        className={
                          normalizeUserRole(user.role) === 'superadmin'
                            ? 'bg-red-100 text-red-800'
                            : normalizeUserRole(user.role) === 'tenant_admin'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-gray-100 text-gray-800'
                        }
                      >
                        {getRoleLabel(normalizeUserRole(user.role))}
                      </Badge>
                    </td>
                    <td className="py-3 px-4">
                      <Badge
                        variant={
                          user.status === 'active' ? 'default' : 'outline'
                        }
                        className={
                          user.status === 'active'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                        }
                      >
                        {user.status}
                      </Badge>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm">
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button variant="outline" size="sm">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
