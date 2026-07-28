'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Users, Plus, Loader2, HelpCircle } from 'lucide-react'
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

  const [createdInvite, setCreatedInvite] = useState<{
    url: string
    email: string
    targetUrl: string
    assessments?: Array<{ title: string; target_url: string }>
    allowed_languages?: string[]
  } | null>(null)

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
      const res = await csrfFetch(`/api/admin/users/${deleteId}`, {
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

function getPipelineLabel(url: string) {
  switch (url) {
    case '/assessment':
      return 'General AI Assessment (/assessment)'
    case '/dashboard/identity-verify':
      return 'Identity & Proctoring Check (/dashboard/identity-verify)'
    case '/assessment/demo/cad':
      return 'CAD Technical Assessment (/assessment/demo/cad)'
    case '/dashboard/problems':
      return 'Coding Challenge IDE (/dashboard/problems)'
    case '/dashboard/codeathons':
      return 'Codeathon Challenge Event (/dashboard/codeathons)'
    case '/dashboard/hackathons':
      return 'Hackathon Event (/dashboard/hackathons)'
    default:
      return url
  }
}

  const handleAddUser = async (payload: {
    email: string
    full_name: string
    password: string
    role: UserRole
    target_url?: string
    assigned_assessments?: import('@/lib/db/admin').AssessmentStep[]
    allowed_languages?: string[]
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
        target_url: payload.target_url,
        assigned_assessments: payload.assigned_assessments,
        allowed_languages: payload.allowed_languages,
      }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(json.error || 'Could not create user')
    }
    if (json.invite_url) {
      setCreatedInvite({
        url: json.invite_url,
        email: payload.email,
        targetUrl: json.target_url || payload.target_url || '/assessment',
        assessments: payload.assigned_assessments,
        allowed_languages: payload.allowed_languages,
      })
    }
    addToast({
      type: 'success',
      title: 'Candidate Created & Link Generated',
      message: `Single-use multi-assessment invite link created for ${payload.email.trim()}.`,
      duration: 8_000,
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
          onEdit={handleEdit as any}
          onDelete={handleDeleteRequest as any}
          onRoleChange={handleChangeRole as any}
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

      {/* Candidate Assessment Invite Link Modal */}
      <AlertDialog open={Boolean(createdInvite)} onOpenChange={(o) => !o && setCreatedInvite(null)}>
        <AlertDialogContent className="sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500 text-xs">✓</span>
              Multi-Assessment Link Generated
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3 pt-2 text-xs">
              Candidate provisioned successfully. Share this <strong>secure candidate assessment portal link</strong> with the candidate:
              {createdInvite && (
                <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2 text-xs mt-2">
                  <div>
                    <span className="text-muted-foreground">Candidate Email: </span>
                    <strong className="text-foreground">{createdInvite.email}</strong>
                  </div>
                  {createdInvite.assessments && createdInvite.assessments.length > 0 ? (
                    <div>
                      <span className="text-muted-foreground">Assigned Assessment Pipeline ({createdInvite.assessments.length} Steps):</span>
                      <ul className="mt-1 space-y-1 pl-2 border-l-2 border-primary/40">
                        {createdInvite.assessments.map((step, idx) => (
                          <li key={idx} className="text-foreground font-medium flex items-center justify-between">
                            <span>Step {idx + 1}: {step.title}</span>
                            <span className="text-[10px] font-mono text-muted-foreground">{step.target_url}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <div>
                      <span className="text-muted-foreground">Assigned Assessment Pipeline: </span>
                      <strong className="text-foreground">{getPipelineLabel(createdInvite.targetUrl)}</strong>
                    </div>
                  )}
                  {createdInvite.allowed_languages && createdInvite.allowed_languages.length > 0 && (
                    <div>
                      <span className="text-muted-foreground">Allowed Coding Languages: </span>
                      <span className="font-mono text-emerald-600 dark:text-emerald-400 capitalize font-bold">
                        {createdInvite.allowed_languages.join(', ')}
                      </span>
                    </div>
                  )}
                </div>
              )}
              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 p-2.5 font-mono text-xs text-foreground mt-2">
                <span className="truncate flex-1">{createdInvite?.url}</span>
                <Button
                  size="sm"
                  variant="secondary"
                  className="shrink-0"
                  onClick={async () => {
                    if (createdInvite?.url) {
                      await navigator.clipboard.writeText(createdInvite.url)
                      addToast({ type: 'success', title: 'Link copied to clipboard' })
                    }
                  }}
                >
                  Copy Link
                </Button>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setCreatedInvite(null)}>Done</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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


