'use client'

import { useEffect, useState } from 'react'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CheckCircle2, Shield, Users } from 'lucide-react'
import { getRoleLabel, normalizeUserRole, type UserRole } from '@/lib/rbac'

export type AdminUserDialogMode = 'edit-profile' | 'change-role'

interface RoleAssignmentDialogProps {
  open: boolean
  mode: AdminUserDialogMode
  userName?: string
  initialFullName?: string
  currentRole?: string
  currentStatus?: string
  currentPlan?: string
  onOpenChange: (open: boolean) => void
  onConfirm: (payload: { role?: UserRole; full_name?: string; status?: string; plan?: string }) => void | Promise<void>
}

const ROLES: Array<{ id: UserRole; name: string; description: string; icon: typeof Shield; color: string; permissions: string[] }> = [
  { id: 'superadmin', name: 'Platform admin', description: 'Full platform access (CodeSpectra operator)', icon: Shield, color: 'bg-red-500/20 text-red-700 dark:text-red-400', permissions: ['Manage all users and roles', 'Access system settings', 'View system analytics', 'Manage integrations', 'Create and delete organizations', 'Full audit log access'] },
  { id: 'tenant_admin', name: 'Organization admin', description: 'Manages their organization and team (enterprise tenant)', icon: Users, color: 'bg-blue-500/20 text-blue-700 dark:text-blue-400', permissions: ['Manage team members', 'View team analytics', 'Configure team settings', 'Assign roles to team members', 'View team audit logs'] },
  { id: 'user', name: 'User', description: 'Individual learner / developer access', icon: Users, color: 'bg-gray-500/20 text-gray-700 dark:text-gray-400', permissions: ['Access dashboard', 'Run code challenges', 'Take mock interviews', 'View learning resources', 'Access personal profile'] },
]

const PLANS = [
  { id: 'free', label: 'Free' },
  { id: 'pro', label: 'Pro' },
  { id: 'enterprise', label: 'Enterprise' },
]

export function RoleAssignmentDialog({ open, mode, userName = 'User', initialFullName = '', currentRole = 'user', currentStatus = 'active', currentPlan = 'free', onOpenChange, onConfirm }: RoleAssignmentDialogProps) {
  const canon = normalizeUserRole(currentRole)
  const [selectedRole, setSelectedRole] = useState<UserRole>(canon)
  const [fullName, setFullName] = useState(initialFullName)
  const [status, setStatus] = useState(currentStatus === 'active')
  const [plan, setPlan] = useState(currentPlan || 'free')

  useEffect(() => {
    if (open) {
      setSelectedRole(normalizeUserRole(currentRole))
      setFullName(initialFullName.trim() || userName.trim() || '')
      setStatus(currentStatus === 'active')
      setPlan(currentPlan || 'free')
    }
  }, [open, currentRole, initialFullName, userName, currentStatus, currentPlan])

  const hasChanges = mode === 'edit-profile'
    ? (fullName.trim() !== (initialFullName || '').trim() || status !== (currentStatus === 'active') || plan !== (currentPlan || 'free'))
    : normalizeUserRole(selectedRole) !== normalizeUserRole(currentRole)

  const handleConfirm = async () => {
    if (!hasChanges) return
    try {
      const payload: any = {}
      if (mode === 'edit-profile') {
        if (fullName.trim() !== (initialFullName || '').trim()) payload.full_name = fullName.trim() || userName.trim()
        if (status !== (currentStatus === 'active')) payload.status = status ? 'active' : 'inactive'
        if (plan !== (currentPlan || 'free')) payload.plan = plan
      } else {
        payload.role = selectedRole
      }
      await onConfirm(payload)
      onOpenChange(false)
    } catch { /* parent shows toast */ }
  }

  const title = mode === 'edit-profile' ? `Edit profile — ${userName}` : `Change role — ${userName}`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {mode === 'edit-profile' ? 'Update profile details. Use Change role from the row menu to modify access level.' : 'Pick the access level for this account.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {mode === 'edit-profile' ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="admin-user-fullname">Display name</Label>
                <Input id="admin-user-fullname" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Name shown in the app" autoComplete="name" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Subscription Plan</Label>
                  <Select value={plan} onValueChange={setPlan}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PLANS.map(p => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Account Status</Label>
                  <div className="flex items-center gap-3 pt-2">
                    <Switch checked={status} onCheckedChange={setStatus} />
                    <Badge className={status ? 'bg-green-500/20 text-green-700' : 'bg-gray-500/20 text-gray-700'}>
                      {status ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm">
                <span className="text-muted-foreground">Current access level</span>
                <p className="mt-1"><Badge variant="secondary">{getRoleLabel(normalizeUserRole(currentRole))}</Badge></p>
              </div>
            </>
          ) : (
            <>
              <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm">
                <span className="text-muted-foreground">Display name</span>
                <p className="font-medium text-foreground">{initialFullName.trim() || userName.trim() || '—'}</p>
              </div>
              {ROLES.map((role) => {
                const Icon = role.icon
                return (
                  <Card key={role.id} className={`p-4 cursor-pointer border-2 transition-all ${selectedRole === role.id ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}`} onClick={() => setSelectedRole(role.id)}>
                    <div className="flex items-start gap-4">
                      <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${role.color}`}><Icon className="w-6 h-6" /></div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2"><h3 className="font-semibold text-foreground">{role.name}</h3>{selectedRole === role.id && <CheckCircle2 className="w-4 h-4 text-primary" />}</div>
                        <p className="text-sm text-muted-foreground mb-3">{role.description}</p>
                        <div className="space-y-1"><p className="text-xs font-semibold text-foreground/70">Permissions:</p><ul className="text-xs text-muted-foreground space-y-1">{role.permissions.slice(0, 3).map((perm, idx) => <li key={idx}>• {perm}</li>)}{role.permissions.length > 3 && <li>• +{role.permissions.length - 3} more</li>}</ul></div>
                      </div>
                    </div>
                  </Card>
                )
              })}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => void handleConfirm()} disabled={!hasChanges}>
            {mode === 'edit-profile' ? 'Save changes' : 'Save role'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
