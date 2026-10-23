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
import { useAdminT } from '@/lib/i18n/admin'

export type AdminUserDialogMode = 'edit-profile' | 'change-role'

interface RoleAssignmentDialogProps {
  open: boolean
  mode: AdminUserDialogMode
  userName?: string
  initialFullName?: string
  currentRole?: string
  currentStatus?: string
  currentPlan?: string
  currentTenantId?: string | null
  tenants?: { id: string; name: string }[]
  onOpenChange: (open: boolean) => void
  onConfirm: (payload: { role?: UserRole; full_name?: string; status?: string; plan?: string; tenantId?: string | null }) => void | Promise<void>
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

export function RoleAssignmentDialog({ open, mode, userName = 'User', initialFullName = '', currentRole = 'user', currentStatus = 'active', currentPlan = 'free', currentTenantId = null, tenants = [], onOpenChange, onConfirm }: RoleAssignmentDialogProps) {
  const canon = normalizeUserRole(currentRole)
  const [selectedRole, setSelectedRole] = useState<UserRole>(canon)
  const [fullName, setFullName] = useState(initialFullName)
  const [status, setStatus] = useState(currentStatus === 'active')
  const [plan, setPlan] = useState(currentPlan || 'free')
  const [tenantId, setTenantId] = useState<string | null>(currentTenantId ?? null)
  const { t } = useAdminT()

  useEffect(() => {
    if (open) {
      setSelectedRole(normalizeUserRole(currentRole))
      setFullName(initialFullName.trim() || userName.trim() || '')
      setStatus(currentStatus === 'active')
      setPlan(currentPlan || 'free')
      setTenantId(currentTenantId ?? null)
    }
  }, [open, currentRole, initialFullName, userName, currentStatus, currentPlan, currentTenantId])

  const hasChanges = mode === 'edit-profile'
    ? (fullName.trim() !== (initialFullName || '').trim() || status !== (currentStatus === 'active') || plan !== (currentPlan || 'free'))
    : normalizeUserRole(selectedRole) !== normalizeUserRole(currentRole) || (selectedRole === 'tenant_admin' && tenantId !== (currentTenantId ?? null))

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
        if (selectedRole === 'tenant_admin') payload.tenantId = tenantId || null
      }
      await onConfirm(payload)
      onOpenChange(false)
    } catch { /* parent shows toast */ }
  }

  const title = t(mode === 'edit-profile' ? 'roleDialog.editProfileTitle' : 'roleDialog.changeRoleTitle', { name: userName })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {mode === 'edit-profile' ? t('roleDialog.editProfileDesc') : t('roleDialog.changeRoleDesc')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {mode === 'edit-profile' ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="admin-user-fullname">{t('roleDialog.displayName')}</Label>
                <Input id="admin-user-fullname" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder={t('roleDialog.displayNamePlaceholder')} autoComplete="name" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t('roleDialog.plan')}</Label>
                  <Select value={plan} onValueChange={setPlan}>
                    <SelectTrigger aria-label={t('roleDialog.plan')}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PLANS.map(p => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t('roleDialog.status')}</Label>
                  <div className="flex items-center gap-3 pt-2">
                    <Switch checked={status} onCheckedChange={setStatus} />
                    <Badge className={status ? 'bg-green-500/15 text-green-700 dark:text-green-400' : 'bg-muted text-muted-foreground'}>
                      {status ? t('roleDialog.active') : t('roleDialog.inactive')}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm">
                <span className="text-muted-foreground">{t('roleDialog.currentLevel')}</span>
                <p className="mt-1"><Badge variant="secondary">{getRoleLabel(normalizeUserRole(currentRole))}</Badge></p>
              </div>
            </>
          ) : (
            <>
              <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm">
                <span className="text-muted-foreground">{t('roleDialog.displayName')}</span>
                <p className="font-medium text-foreground">{initialFullName.trim() || userName.trim() || '—'}</p>
              </div>
              {ROLES.map((role) => {
                const Icon = role.icon
                return (
                  <Card key={role.id} className={`p-4 cursor-pointer border-2 transition-all ${selectedRole === role.id ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}`} role="button" tabIndex={0} aria-pressed={selectedRole === role.id} onClick={() => setSelectedRole(role.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedRole(role.id) } }}>
                    <div className="flex items-start gap-4">
                      <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${role.color}`}><Icon className="w-6 h-6" /></div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2"><h3 className="font-semibold text-foreground">{role.name}</h3>{selectedRole === role.id && <CheckCircle2 className="w-4 h-4 text-primary" />}</div>
                        <p className="text-sm text-muted-foreground mb-3">{role.description}</p>
                        <div className="space-y-1"><p className="text-xs font-semibold text-foreground/70">{t('roleDialog.permissions')}</p><ul className="text-xs text-muted-foreground space-y-1">{role.permissions.slice(0, 3).map((perm, idx) => <li key={idx}>• {perm}</li>)}{role.permissions.length > 3 && <li>• {t('roleDialog.more', { count: role.permissions.length - 3 })}</li>}</ul></div>
                      </div>
                    </div>
                  </Card>
                )
              })}
              {selectedRole === 'tenant_admin' && (
                <div className="space-y-2 pt-1">
                  <Label>{t('roleDialog.organization')}</Label>
                  <Select value={tenantId || '__none__'} onValueChange={(v) => setTenantId(v === '__none__' ? null : v)}>
                    <SelectTrigger aria-label={t('roleDialog.organization')} className="w-full"><SelectValue placeholder={t('roleDialog.selectOrg')} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">{t('roleDialog.noOrg')}</SelectItem>
                      {tenants.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {tenantId == null && <p className="text-xs text-muted-foreground">{t('roleDialog.pickOrgHint')}</p>}
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button onClick={() => void handleConfirm()} disabled={!hasChanges}>
            {mode === 'edit-profile' ? t('roleDialog.saveChanges') : t('roleDialog.saveRole')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
