'use client'

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Shield, Lock, Users, Database } from 'lucide-react'

export default function RolesPermissions() {
  const roles = [
    {
      name: 'Superadmin',
      description: 'Full system access',
      permissions: ['Manage Users', 'Manage Admins', 'System Settings', 'View Audit Logs', 'Manage Permissions']
    },
    {
      name: 'Admin',
      description: 'Team admin access',
      permissions: ['Manage Team Members', 'Team Settings', 'View Analytics', 'Manage Features']
    },
    {
      name: 'User',
      description: 'Regular user access',
      permissions: ['View Dashboard', 'Access Arena', 'Participate in Challenges']
    }
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Roles & Permissions</h1>
        <p className="text-muted-foreground mt-1">Manage system roles and permissions</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {roles.map((role) => (
          <Card key={role.name} className="p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-lg">{role.name}</h3>
                <p className="text-sm text-muted-foreground">{role.description}</p>
              </div>
              <Shield className="w-5 h-5 text-primary" />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Permissions:</p>
              <ul className="space-y-1">
                {role.permissions.map((perm) => (
                  <li key={perm} className="text-sm text-muted-foreground flex items-center gap-2">
                    <Lock className="w-3 h-3" />
                    {perm}
                  </li>
                ))}
              </ul>
            </div>

            <Button variant="outline" className="w-full">Edit Role</Button>
          </Card>
        ))}
      </div>
    </div>
  )
}
