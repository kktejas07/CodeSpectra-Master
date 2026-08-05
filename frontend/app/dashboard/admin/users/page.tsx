'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Users, Plus, Loader2, HelpCircle, KeyRound, Download } from 'lucide-react'
import { exportUsersToXLS } from '@/lib/export-excel'
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

type TableUser = {
  id: string
  name: string
  email: string
  role: string
  status: 'active' | 'inactive'
  joinedAt: string
  lastActive: string
  plan: string
}

function mapRowToTableUser(row: AdminUserListRow, tick: number): TableUser {
  void tick
  return {
    id: row.id,
    name: row.name ?? "",
    email: row.email ?? "",
    role: row.role,
    status: row.status,
    joinedAt: row.joinedAt,
    lastActive: row.lastActiveAt ? formatRelativeTime(row.lastActiveAt) : 'Never',
    plan: (row as any).plan || 'free',
  }
}

export default function UsersManagement() {
  const gate = usePageGuard('superadmin')

  const addToast = useToast()
  const [rows, setRows] = useState<AdminUserListRow[]>([])
  const [loading, setLoading] = useState(true)
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

  const loadUsers = useCallback(async () => {
    const res = await fetch('/api/admin/users', { credentials: 'include' })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(json.error || `Failed to load users (${res.status})`)
    }
    setRows(json.users as AdminUserListRow[])
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        await loadUsers()
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to load users'
        if (!cancelled) {
          addToast({ type: 'error', title: 'Could not load users', message: msg })
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [loadUsers, addToast])

  /** Recompute relative “last active” labels on an interval without refetching everything. */
  useEffect(() => {
    const t = window.setInterval(() => setTick((n) => n + 1), 15_000)
    return () => window.clearInterval(t)
  }, [])

  /** Poll full list periodically (picks up auth `last_sign_in_at` and other users’ heartbeats). */
  useEffect(() => {
    const t = window.setInterval(() => {
      void loadUsers().catch(() => {
        /* errors surfaced on first load */
      })
    }, 30_000)
    return () => window.clearInterval(t)
  }, [loadUsers])

  /**
   * Realtime updates from Supabase were removed in the MongoDB migration.
   * The 30-second polling loop above keeps the directory fresh enough; for
   * sub-second updates re-introduce MongoDB Change Streams behind an SSE
   * endpoint in a future phase.
   */
  // useEffect(() => {
  //   const channel = supabase.channel('admin-users-profiles')...
  // }, [loadUsers])

  const displayUsers = useMemo(
    () => rows.map((r) => mapRowToTableUser(r, tick)),
    [rows, tick]
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
      if (!res.ok) throw new Error(json.error || 'Failed')
      addToast({ type: 'success', title: 'Password reset successfully' })
      setResetPwUserId(null)
      setResetPwValue('')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed'
      addToast({ type: 'error', title: 'Password reset failed', message: msg })
    } finally {
      setResetPwLoading(false)
    }
  }

  const handleSendResetEmail = async (userId: string) => {
    setSendingResetEmail(userId)
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'POST',
        credentials: 'include',
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Failed')
      addToast({ type: 'success', title: 'Password reset email sent' })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed'
      addToast({ type: 'error', title: 'Failed to send reset email', message: msg })
    } finally {
      setSendingResetEmail(null)
    }
  }

  const handleBulkDelete = async (userIds: string[]) => {
    setDeleteId('__bulk__')
    setDeleteName(`${userIds.length} users`)
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
        addToast({ type: 'error', title: 'Partial failure', message: `${ids.length - failed} deleted, ${failed} failed` })
      } else {
        addToast({ type: 'success', title: `${ids.length} user${ids.length !== 1 ? 's' : ''} deleted` })
      }
      setRows(prev => prev.filter(r => !ids.includes(r.id)))
      try { await loadUsers() } catch { /* ignore */ }
    } catch (e) {
      addToast({ type: 'error', title: 'Delete failed', message: e instanceof Error ? e.message : 'Unknown error' })
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
      addToast({ type: 'error', title: 'Partial failure', message: `${userIds.length - failed} updated, ${failed} failed` })
    } else {
      addToast({ type: 'success', title: `${userIds.length} user${userIds.length !== 1 ? 's' : ''} role updated` })
    }
    try { await loadUsers() } catch { /* ignore */ }
  }

  const handleConfirmRole = async (payload: { role?: string; full_name?: string; status?: string; plan?: string }) => {
    if (!selectedUser) return
    const body: Record<string, string> = {}
    if (payload.role !== undefined) body.role = normalizeUserRole(payload.role)
    if (payload.full_name !== undefined) body.full_name = payload.full_name.trim()
    if (payload.status !== undefined) body.status = payload.status
    if (payload.plan !== undefined) body.plan = payload.plan
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
        throw new Error(json.error || 'Update failed')
      }
      const parts: string[] = []
      if (body.full_name !== undefined) parts.push('Name')
      if (body.role !== undefined) parts.push('Role')
      if (body.status !== undefined) parts.push('Status')
      if (body.plan !== undefined) parts.push('Plan')
      addToast({ type: 'success', title: `${parts.join(', ')} updated` })
      try {
        await loadUsers()
      } catch {
        /* list refresh failed; user can reload */
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Update failed'
      addToast({
        type: 'error',
        title: body.full_name !== undefined ? 'Could not update name' : 'Could not update role',
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
      }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(json.error || 'Could not create user')
    }
    addToast({
      type: 'success',
      title: 'User created',
      message: `Account created for ${payload.email.trim()}.`,
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
            <Users className="w-8 h-8 text-primary" />
            Users Management
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help ml-1" />
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p className="text-xs max-w-[250px]">Use Edit for display names and Change role for access level, or remove accounts. New users without a manual password follow Platform settings &rarr; Admin user invitations. Last active combines recent sign-in and in-app activity.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            className="gap-2 shrink-0 border-primary/30 hover:bg-primary/5 font-medium"
            onClick={() => exportUsersToXLS(displayUsers, `user_management_${new Date().toISOString().split('T')[0]}.xlsx`)}
            disabled={loading || displayUsers.length === 0}
          >
            <Download className="w-4 h-4 text-primary" />
            Export XLS
          </Button>
          <Button className="gap-2 shrink-0" onClick={() => setAddOpen(true)} disabled={loading}>
            <Plus className="w-4 h-4" />
            Add User
          </Button>
        </div>
      </div>

      {loading ? (
        <Card className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading users…
        </Card>
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
        onOpenChange={setRoleDialogOpen}
        onConfirm={handleConfirmRole}
      />

      <AddUserDialog open={addOpen} onOpenChange={setAddOpen} onSubmit={handleAddUser as any} />

      <AlertDialog open={Boolean(deleteId)} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes <strong>{deleteName}</strong> and their account data. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault()
                void confirmDelete()
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(resetPwUserId)} onOpenChange={(o) => !o && setResetPwUserId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset password</AlertDialogTitle>
            <AlertDialogDescription>
              Enter a new password for this user (min 8 characters).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            type="password"
            placeholder="New password"
            value={resetPwValue}
            onChange={(e) => setResetPwValue(e.target.value)}
            className="my-2"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={resetPwValue.length < 8 || resetPwLoading}
              onClick={(e) => {
                e.preventDefault()
                void confirmResetPassword()
              }}
            >
              {resetPwLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <KeyRound className="h-4 w-4 mr-1" />}
              Reset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}


