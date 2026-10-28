'use client'

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { UserRole } from '@/lib/rbac'
import { Eye, EyeOff } from 'lucide-react'
import { useAdminT } from '@/lib/i18n/admin'

export interface AddUserDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (payload: {
    email: string
    full_name: string
    password: string
    role: UserRole
    tenantId?: string | null
    target_url?: string
    assigned_assessments?: import('@/lib/db/admin').AssessmentStep[]
    allowed_languages?: string[]
  }) => Promise<void>
}

export function AddUserDialog({ open, onOpenChange, onSubmit }: AddUserDialogProps) {
  const { t } = useAdminT()
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [role, setRole] = useState<UserRole>('user')
  const [tenantId, setTenantId] = useState<string>('')
  const [tenants, setTenants] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    fetch('/api/admin/tenants', { credentials: 'include' })
      .then(r => r.json())
      .then(d => setTenants(d.data || []))
      .catch(() => setTenants([]))
  }, [open])

  const reset = () => {
    setEmail('')
    setFullName('')
    setPassword('')
    setShowPassword(false)
    setRole('user')
    setTenantId('')
    setLoading(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await onSubmit({
        email: email.trim(),
        full_name: fullName.trim() || email.trim().split('@')[0] || 'User',
        password: password.trim(),
        role,
        tenantId: tenantId || null,
        target_url: '/dashboard',
        allowed_languages: role === 'user' ? ['python','javascript','typescript','cpp','java','go','rust'] : undefined,
      })
      reset()
      onOpenChange(false)
    } catch {
      /* parent shows toast; keep dialog open */
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v) }}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t('addUser.title')}</DialogTitle>
            <DialogDescription>
              {t('addUser.description')}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="add-user-email">{t('addUser.email')}</Label>
                <Input
                  id="add-user-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="user@company.com"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="add-user-name">{t('addUser.fullName')}</Label>
                <Input
                  id="add-user-name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Jane Doe"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="add-user-password">{t('addUser.password')}</Label>
              <div className="relative">
                <Input
                  id="add-user-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('addUser.passwordPlaceholder')}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? t('addUser.hidePassword') : t('addUser.showPassword')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="add-user-role">{t('common.role')}</Label>
              <select
                id="add-user-role"
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="user">{t('addUser.roleUser')}</option>
                <option value="judge">{t('addUser.roleJudge')}</option>
                <option value="tenant_admin">{t('addUser.roleOrgAdmin')}</option>
                <option value="superadmin">{t('addUser.rolePlatformAdmin')}</option>
              </select>
            </div>
            {tenants.length > 0 && (
              <div className="grid gap-2">
                <Label htmlFor="add-user-tenant">{t('addUser.org')}</Label>
                <select
                  id="add-user-tenant"
                  value={tenantId}
                  onChange={(e) => setTenantId(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">{t('addUser.noOrg')}</option>
                  {tenants.map(tn => (
                    <option key={tn.id} value={tn.id}>{tn.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={() => { reset(); onOpenChange(false) }}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={loading || !email.trim()}>
              {loading ? t('addUser.creating') : t('addUser.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
