'use client'

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, Shield, Users } from 'lucide-react'
import { getRoleLabel, normalizeUserRole, type UserRole } from '@/lib/rbac'

export type AdminUserDialogMode = 'edit-profile' | 'change-role'

interface RoleAssignmentDialogProps {
  open: boolean
  /** Which flow: profile name only, or role only (mutually distinct actions from the users table). */
  mode: AdminUserDialogMode
  userName?: string
  /** Display name shown in directory (maps to `profiles.full_name`). */
  initialFullName?: string
  currentRole?: string
  onOpenChange: (open: boolean) => void
  onConfirm: (payload: { role?: UserRole; full_name?: string }) => void | Promise<void>
}

const ROLES: Array<{
  id: UserRole
  name: string
  description: string
  icon: typeof Shield
  color: string
  permissions: string[]
}> = [
  {
    id: 'superadmin',
    name: 'Platform admin',
    description: 'Full platform access (CodeSpectra operator)',
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
    id: 'tenant_admin',
    name: 'Organization admin',
    description: 'Manages their organization and team (enterprise tenant)',
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
    description: 'Individual learner / developer access',
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
  mode,
  userName = 'User',
  initialFullName = '',
  currentRole = 'user',
  onOpenChange,
  onConfirm,
}: RoleAssignmentDialogProps) {
  const canon = normalizeUserRole(currentRole)
  const [selectedRole, setSelectedRole] = useState<UserRole>(canon)
  const [fullName, setFullName] = useState(initialFullName)

  useEffect(() => {
    if (open) {
      setSelectedRole(normalizeUserRole(currentRole))
      setFullName(initialFullName.trim() || userName.trim() || '')
    }
  }, [open, currentRole, initialFullName, userName])

  const nameUnchanged = fullName.trim() === (initialFullName || '').trim()
  const roleUnchanged = normalizeUserRole(selectedRole) === normalizeUserRole(currentRole)

  const nothingChanged = mode === 'edit-profile' ? nameUnchanged : roleUnchanged

  const handleConfirm = async () => {
    if (nothingChanged) return
    try {
      if (mode === 'edit-profile') {
        await onConfirm({ full_name: fullName.trim() || userName.trim() })
      } else {
        await onConfirm({ role: selectedRole })
      }
      onOpenChange(false)
    } catch {
      /* parent shows toast and keeps dialog open */
    }
  }

  const title =
    mode === 'edit-profile' ? `Edit profile — ${userName}` : `Change role — ${userName}`

  const description =
    mode === 'edit-profile'
      ? 'Update how this person appears in the directory. To change their access level, use Change role from the row menu.'
      : 'Pick the access level for this account. Display name is unchanged unless you use Edit from the row menu.'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {mode !== 'change-role' ? (
            <div className="space-y-2">
              <Label htmlFor="admin-user-fullname">Display name</Label>
              <Input
                id="admin-user-fullname"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Name shown in the app"
                autoComplete="name"
              />
            </div>
          ) : (
            <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Display name</span>
              <p className="font-medium text-foreground">{initialFullName.trim() || userName.trim() || '—'}</p>
            </div>
          )}
          {mode === 'edit-profile' ? (
            <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Current access level</span>
              <p className="mt-1">
                <Badge variant="secondary" className="font-normal">
                  {getRoleLabel(normalizeUserRole(currentRole))}
                </Badge>
              </p>
            </div>
          ) : (
            ROLES.map((role) => {
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
                        {selectedRole === role.id && <CheckCircle2 className="w-4 h-4 text-primary" />}
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
            })
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void handleConfirm()} disabled={nothingChanged}>
            {mode === 'edit-profile' ? 'Save name' : 'Save role'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
