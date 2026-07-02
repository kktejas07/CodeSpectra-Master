'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Users, Plus, Loader2 } from 'lucide-react'
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
    name: row.name,
    email: row.email,
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

  if (!gate.ready) return <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">Loading…</div>

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

  const confirmDelete = async () => {
    if (!deleteId) return
    try {
      const res = await fetch(`/api/admin/users/${deleteId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(json.error || 'Delete failed')
      }
      addToast({ type: 'success', title: 'User deleted' })
      // Optimistic: remove from local state immediately
      setRows(prev => prev.filter(r => r.id !== deleteId))
      try { await loadUsers() } catch { /* ignore */ }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Delete failed'
      addToast({ type: 'error', title: 'Delete failed', message: msg })
    } finally {
      setDeleteId(null)
    }
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
      const res = await fetch(`/api/admin/users/${selectedUser.id}`, {
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
    const res = await fetch('/api/admin/users', {
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
    if (json.welcomeEmailSent) {
      addToast({
        type: 'success',
        title: 'User created',
        message:
          json.delivery === 'supabase_invite'
            ? `Supabase sent an invite to ${payload.email.trim()}. Ensure Auth email / SMTP is configured in the Supabase dashboard.`
            : `A secure sign-in link was sent to ${payload.email.trim()} (${String(json.delivery).replace(/_/g, ' ')}).`,
        duration: 10_000,
      })
    } else {
      addToast({
        type: 'success',
        title: 'User created',
        message:
          json.delivery === 'admin_password'
            ? 'Password was set from this form; share credentials through your own secure channel if needed.'
            : 'User is ready.',
      })
    }
    try {
      await loadUsers()
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
            <Users className="w-8 h-8 text-primary" />
            Users Management
          </h1>
          <p className="text-muted-foreground mt-2">
            Use Edit for display names and Change role for access level, or remove accounts. New users without a manual
            password follow <strong>Platform settings → Admin user invitations</strong> (invite or secure link). Last
            active combines recent sign-in and in-app activity.
          </p>
        </div>
        <Button className="gap-2 shrink-0" onClick={() => setAddOpen(true)} disabled={loading}>
          <Plus className="w-4 h-4" />
          Add User
        </Button>
      </div>

      {loading ? (
        <Card className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading users…
        </Card>
      ) : (
        <UserManagementTable
          users={displayUsers}
          onEdit={handleEdit}
          onDelete={handleDeleteRequest}
          onRoleChange={handleChangeRole}
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

      <AddUserDialog open={addOpen} onOpenChange={setAddOpen} onSubmit={handleAddUser} />

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
    </div>
  )
}
