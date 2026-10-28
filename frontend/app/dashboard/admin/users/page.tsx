'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-kit'
import { SoftGlow } from '@/components/visuals'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Users, Plus, Loader2, HelpCircle, KeyRound } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { UserManagementTable } from '@/components/admin/user-management-table'
import {
  RoleAssignmentDialog,
  type AdminUserDialogMode,
} from '@/components/admin/role-assignment-dialog'
import { AddUserDialog } from '@/components/admin/add-user-dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useToast } from '@/lib/toast-context'
import { formatRelativeTime } from '@/lib/date-utils'
import type { AdminUserListRow } from '@/lib/admin-users'
// The page now polls /api/admin/users instead of using realtime.
import { normalizeUserRole, type UserRole } from '@/lib/rbac'
import { usePageGuard } from '@/lib/use-page-guard'
import { csrfFetch } from '@/lib/csrf-fetch'
import { SkeletonTable } from '@/components/ui/skeleton-boneyard'
import { EmptyState } from '@/components/ui/empty-state'
import { useAdminT } from '@/lib/i18n/admin'
import { useApiError } from '@/lib/i18n/use-api-error'

type TableUser = {
  id: string
  name: string
  email: string
  role: string
  status: 'active' | 'inactive'
  joinedAt: string
  lastActive: string
  plan: string
  tenantId: string | null
  tenantName: string | null
}

function mapRowToTableUser(row: AdminUserListRow, tick: number, never = 'Never'): TableUser {
  void tick
  return {
    id: row.id,
    name: row.name ?? "",
    email: row.email ?? "",
    role: row.role,
    status: row.status,
    joinedAt: row.joinedAt,
    lastActive: row.lastActiveAt ? formatRelativeTime(row.lastActiveAt) : never,
    plan: (row as any).plan || 'free',
    tenantId: (row as any).tenant_id ?? null,
    tenantName: (row as any).tenant_name ?? null,
  }
}

export default function UsersManagement() {
  const gate = usePageGuard('superadmin')
  const { t, rich } = useAdminT()
  const apiError = useApiError()

  const addToast = useToast()
  const [rows, setRows] = useState<AdminUserListRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [tick, setTick] = useState(0)
  const [roleDialogOpen, setRoleDialogOpen] = useState(false)
  const [roleDialogMode, setRoleDialogMode] = useState<AdminUserDialogMode>('change-role')
  const [addOpen, setAddOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<TableUser | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleteName, setDeleteName] = useState('')
  const [resetPwUserId, setResetPwUserId] = useState<string | null>(null)
  const [resetPwValue, setResetPwValue] = useState('')
  const [resetPwLoading, setResetPwLoading] = useState(false)
  const [sendingResetEmail, setSendingResetEmail] = useState<string | null>(null)
  const [tenants, setTenants] = useState<{ id: string; name: string }[]>([])

  const loadUsers = useCallback(async () => {
    const res = await fetch('/api/admin/users', { credentials: 'include' })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(apiError(json, `Failed to load users (${res.status})`))
    }
    setRows(json.users as AdminUserListRow[])
  }, [apiError])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/admin/tenants', { credentials: 'include' })
        if (res.ok) {
          const json = await res.json().catch(() => ({}))
          const list = json.tenants || json.data || []
          if (!cancelled) setTenants(list.map((t: any) => ({ id: t.id, name: t.name })))
        }
      } catch { /* org picker is optional */ }
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setLoadError(false)
      try {
        await loadUsers()
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to load users'
        if (!cancelled) {
          setLoadError(true)
          addToast({ type: 'error', title: t('users.loadFailedToast'), message: msg })
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [loadUsers, addToast, reloadKey, t])

  /** Recompute relative “last active” labels on an interval without refetching everything. */
  useEffect(() => {
    const t = window.setInterval(() => setTick((n) => n + 1), 15_000)
    return () => window.clearInterval(t)
  }, [])

  /**
   * Refresh when the admin comes back to the tab (at most every 2 minutes).
   * CORE-019: the old 30-second poll re-downloaded the whole user list forever.
   */
  useEffect(() => {
    let last = Date.now()
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || Date.now() - last < 120_000) return
      last = Date.now()
      void loadUsers().then(() => setLoadError(false)).catch(() => { /* errors surfaced on first load */ })
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [loadUsers])

  /**
   * Realtime updates from Supabase were removed in the MongoDB migration.
   * The on-focus refresh above keeps the directory fresh enough; for
   * sub-second updates re-introduce MongoDB Change Streams behind an SSE
   * endpoint in a future phase.
   */
  // useEffect(() => {
  //   const channel = supabase.channel('admin-users-profiles')...
  // }, [loadUsers])

  const displayUsers = useMemo(
    () => rows.map((r) => mapRowToTableUser(r, tick, t('users.never'))),
    [rows, tick, t]
  )

  const handleEdit = (user: TableUser) => {
    setSelectedUser(user)
    setRoleDialogMode('edit-profile')
    setRoleDialogOpen(true)
  }

  const handleChangeRole = (user: TableUser) => {
    setSelectedUser(user)
    setRoleDialogMode('change-role')
    setRoleDialogOpen(true)
  }

  const handleDeleteRequest = (userId: string) => {
    const u = displayUsers.find((x) => x.id === userId)
    setDeleteName(u?.name || u?.email || userId)
    setDeleteId(userId)
  }

  const handleResetPassword = (userId: string) => {
    setResetPwUserId(userId)
    setResetPwValue('')
  }

  const confirmResetPassword = async () => {
    if (!resetPwUserId || !resetPwValue) return
    setResetPwLoading(true)
    try {
      const res = await csrfFetch(`/api/admin/users/${resetPwUserId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password: resetPwValue }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(apiError(json))
      addToast({ type: 'success', title: t('users.pwResetOk') })
      setResetPwUserId(null)
      setResetPwValue('')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed'
      addToast({ type: 'error', title: t('users.pwResetFailed'), message: msg })
    } finally {
      setResetPwLoading(false)
    }
  }

  const handleSendResetEmail = async (userId: string) => {
    setSendingResetEmail(userId)
    try {
      const res = await csrfFetch(`/api/admin/users/${userId}`, {
        method: 'POST',
        credentials: 'include',
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(apiError(json))
      addToast({ type: 'success', title: t('users.resetEmailSent') })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed'
      addToast({ type: 'error', title: t('users.resetEmailFailed'), message: msg })
    } finally {
      setSendingResetEmail(null)
    }
  }

  const handleBulkDelete = async (userIds: string[]) => {
    setDeleteId('__bulk__')
    setDeleteName(t('users.bulkCount', { count: userIds.length }))
    // Store bulk IDs for confirm
    ;(window as any).__bulkDeleteIds = userIds
  }

  const confirmDelete = async () => {
    const ids: string[] = deleteId === '__bulk__' ? ((window as any).__bulkDeleteIds || []) : (deleteId ? [deleteId] : [])
    if (ids.length === 0) return
    try {
      let failed = 0
      for (const id of ids) {
        const res = await csrfFetch(`/api/admin/users/${id}`, { method: 'DELETE', credentials: 'include' })
        if (!res.ok) failed++
      }
      if (failed > 0) {
        addToast({ type: 'error', title: t('users.partialFailure'), message: t('users.deletedFailed', { ok: ids.length - failed, failed }) })
      } else {
        addToast({ type: 'success', title: t('users.deleted', { count: ids.length }) })
      }
      setRows(prev => prev.filter(r => !ids.includes(r.id)))
      try { await loadUsers() } catch { /* ignore */ }
    } catch (e) {
      addToast({ type: 'error', title: t('users.deleteFailed'), message: e instanceof Error ? e.message : 'Unknown error' })
    } finally {
      setDeleteId(null)
      delete (window as any).__bulkDeleteIds
    }
    // Keep old single-delete path working
    if (ids.length === 1) {
      setDeleteId(null)
    }
  }

  const handleBulkRoleChange = async (userIds: string[], role: string) => {
    let failed = 0
    for (const id of userIds) {
      try {
        const res = await csrfFetch(`/api/admin/users/${id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify({ role }),
        })
        if (!res.ok) failed++
      } catch { failed++ }
    }
    if (failed > 0) {
      addToast({ type: 'error', title: t('users.partialFailure'), message: t('users.updatedFailed', { ok: userIds.length - failed, failed }) })
    } else {
      addToast({ type: 'success', title: t('users.roleUpdated', { count: userIds.length }) })
    }
    try { await loadUsers() } catch { /* ignore */ }
  }

  const handleConfirmRole = async (payload: { role?: string; full_name?: string; status?: string; plan?: string; tenantId?: string | null }) => {
    if (!selectedUser) return
    const body: Record<string, string | null> = {}
    if (payload.role !== undefined) body.role = normalizeUserRole(payload.role)
    if (payload.full_name !== undefined) body.full_name = payload.full_name.trim()
    if (payload.status !== undefined) body.status = payload.status
    if (payload.plan !== undefined) body.plan = payload.plan
    if (payload.tenantId !== undefined) body.tenantId = payload.tenantId
    if (Object.keys(body).length === 0) return
    try {
      const res = await csrfFetch(`/api/admin/users/${selectedUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(apiError(json, 'Update failed'))
      }
      const parts: string[] = []
      if (body.full_name !== undefined) parts.push(t('users.field.name'))
      if (body.role !== undefined) parts.push(t('users.field.role'))
      if (body.status !== undefined) parts.push(t('users.field.status'))
      if (body.plan !== undefined) parts.push(t('users.field.plan'))
      if (body.tenantId !== undefined) parts.push(t('users.field.organization'))
      addToast({ type: 'success', title: t('users.fieldsUpdated', { fields: parts.join(', ') }) })
      try {
        await loadUsers()
      } catch {
        /* list refresh failed; user can reload */
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Update failed'
      addToast({
        type: 'error',
        title: body.full_name !== undefined ? t('users.updateNameFailed') : t('users.updateRoleFailed'),
        message: msg,
      })
      throw e
    }
  }

  const handleAddUser = async (payload: {
    email: string
    full_name: string
    password: string
    role: UserRole
    tenantId?: string | null
  }) => {
    const res = await csrfFetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        email: payload.email,
        full_name: payload.full_name,
        password: payload.password || undefined,
        role: payload.role,
        tenantId: payload.tenantId || null,
      }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(apiError(json, t('users.createFailed')))
    }
    addToast({
      type: 'success',
      title: t('users.created'),
      message: t('users.createdFor', { email: payload.email.trim() }),
    })
    try {
      await loadUsers()
    } catch {
      /* ignore */
    }
  }

  if (!gate.ready) return null

  return (
    <div className="space-y-6">
      <div className="relative isolate">
        <SoftGlow className="-inset-y-6 [mask-image:radial-gradient(ellipse_at_75%_45%,#000_30%,transparent_72%)]" />
        <PageHeader
          illustration="team"
          icon={<Users />}
          title={
            <span className="inline-flex items-center gap-1.5">
              {t('users.title')}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" aria-label={t('users.aboutAria')} />
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <p className="text-xs max-w-62.5">{t('users.help')}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </span>
          }
          description={t('users.description')}
          actions={
            <Button className="gap-2 shrink-0" onClick={() => setAddOpen(true)} disabled={loading}>
              <Plus className="w-4 h-4" />
              {t('users.add')}
            </Button>
          }
          className="mb-0"
        />
      </div>

      {loading ? (
        <SkeletonTable />
      ) : loadError && rows.length === 0 ? (
        <EmptyState
          illustration="error"
          title={t('users.loadFailed')}
          description={t('common.checkConnection')}
          actionLabel={t('common.tryAgain')}
          onAction={() => setReloadKey((k) => k + 1)}
        />
      ) : (
        <UserManagementTable
          users={displayUsers}
          onEdit={handleEdit as any}
          onDelete={handleDeleteRequest as any}
          onRoleChange={handleChangeRole as any}
          onResetPassword={handleResetPassword}
          onSendResetEmail={handleSendResetEmail}
          onBulkDelete={handleBulkDelete}
          onBulkRoleChange={handleBulkRoleChange}
        />
      )}

      <RoleAssignmentDialog
        open={roleDialogOpen}
        mode={roleDialogMode}
        userName={selectedUser?.name}
        initialFullName={selectedUser?.name}
        currentRole={selectedUser?.role}
        currentStatus={selectedUser?.status}
        currentPlan={selectedUser?.plan}
        currentTenantId={selectedUser?.tenantId ?? null}
        tenants={tenants}
        onOpenChange={setRoleDialogOpen}
        onConfirm={handleConfirmRole}
      />

      <AddUserDialog open={addOpen} onOpenChange={setAddOpen} onSubmit={handleAddUser as any} />

      <AlertDialog open={Boolean(deleteId)} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('users.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {rich('users.deleteBody', { name: <strong>{deleteName}</strong> })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault()
                void confirmDelete()
              }}
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(resetPwUserId)} onOpenChange={(o) => !o && setResetPwUserId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('users.resetTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('users.resetBody')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input aria-label={t('users.newPassword')}
            type="password"
            placeholder={t('users.newPassword')}
            value={resetPwValue}
            onChange={(e) => setResetPwValue(e.target.value)}
            className="my-2"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={resetPwValue.length < 8 || resetPwLoading}
              onClick={(e) => {
                e.preventDefault()
                void confirmResetPassword()
              }}
            >
              {resetPwLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <KeyRound className="h-4 w-4 mr-1" />}
              {t('users.reset')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}


