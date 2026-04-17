'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { CheckCircle2, Shield, Users } from 'lucide-react'

interface RoleAssignmentDialogProps {
  open: boolean
  userId?: string
  userName?: string
  currentRole?: string
  onOpenChange: (open: boolean) => void
  onConfirm: (role: string) => void
}

const ROLES = [
  {
    id: 'superadmin',
    name: 'Superadmin',
    description: 'Full system access without restrictions',
    icon: Shield,
    color: 'bg-red-500/20 text-red-700 dark:text-red-400',
    permissions: [
      'Manage all users and roles',
      'Access system settings',
      'View system analytics',
      'Manage integrations',
      'Create and delete organizations',
      'Full audit log access',
    ],
  },
  {
    id: 'admin',
    name: 'Admin',
    description: 'Can manage team members and organization settings',
    icon: Users,
    color: 'bg-blue-500/20 text-blue-700 dark:text-blue-400',
    permissions: [
      'Manage team members',
      'View team analytics',
      'Configure team settings',
      'Assign roles to team members',
      'View team audit logs',
    ],
  },
  {
    id: 'user',
    name: 'User',
    description: 'Basic platform access',
    icon: Users,
    color: 'bg-gray-500/20 text-gray-700 dark:text-gray-400',
    permissions: [
      'Access dashboard',
      'Run code challenges',
      'Take mock interviews',
      'View learning resources',
      'Access personal profile',
    ],
  },
]

export function RoleAssignmentDialog({
  open,
  userId,
  userName = 'User',
  currentRole = 'user',
  onOpenChange,
  onConfirm,
}: RoleAssignmentDialogProps) {
  const [selectedRole, setSelectedRole] = useState(currentRole)

  const handleConfirm = () => {
    if (selectedRole !== currentRole) {
      onConfirm(selectedRole)
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Assign Role to {userName}</DialogTitle>
          <DialogDescription>
            Select a role to assign to this user. Each role has different permissions and access levels.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {ROLES.map((role) => {
            const Icon = role.icon
            return (
              <Card
                key={role.id}
                className={`p-4 cursor-pointer border-2 transition-all ${
                  selectedRole === role.id
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                }`}
                onClick={() => setSelectedRole(role.id)}
              >
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${role.color}`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-foreground">{role.name}</h3>
                      {selectedRole === role.id && (
                        <CheckCircle2 className="w-4 h-4 text-primary" />
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">{role.description}</p>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-foreground/70">Permissions:</p>
                      <ul className="text-xs text-muted-foreground space-y-1">
                        {role.permissions.slice(0, 3).map((perm, idx) => (
                          <li key={idx}>• {perm}</li>
                        ))}
                        {role.permissions.length > 3 && (
                          <li>• +{role.permissions.length - 3} more permissions</li>
                        )}
                      </ul>
                    </div>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={selectedRole === currentRole}
          >
            Assign Role
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
