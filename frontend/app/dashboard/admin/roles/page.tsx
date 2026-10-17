'use client'
import { EmptyState } from '@/components/ui/empty-state'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { useToast } from '@/lib/toast-context'
import { Users, Loader2, Search, Trash2, HelpCircle, ChevronLeft, ChevronRight, CheckSquare, Square } from 'lucide-react'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { usePageGuard } from '@/lib/use-page-guard'
import { normalizeUserRole } from '@/lib/rbac'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useConfirm } from '@/lib/confirm-context'
import { SkeletonStats, SkeletonTable } from '@/components/ui/skeleton-boneyard'
import { PageHeader, Panel, StatCard } from '@/components/app/page-kit'
import { RefreshCw, ShieldCheck, Building2, User } from 'lucide-react'

interface UserData {
  id: string; email: string; full_name?: string; name?: string
  role: string; status: string; plan?: string
  tenant_id?: string | null; tenant_name?: string | null
}

interface Tenant {
  id: string; name: string; slug?: string
}

export default function RolesPage() {
  const confirmDialog = useConfirm()
  const gate = usePageGuard('superadmin')
  const addToast = useToast()
  const [users, setUsers] = useState<UserData[]>([])
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkRoleOpen, setBulkRoleOpen] = useState(false)
  const pageSize = 20

  const [loadError, setLoadError] = useState(false)

  const fetchUsers = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/users', { credentials: 'include' })
      const data = await res.json()
      if (!res.ok) throw new Error(`Failed to load users (${res.status})`)
      setUsers(data.users || [])
      setLoadError(false)
    } catch { setLoadError(true) }
    finally { setLoading(false) }
  }

  const fetchTenants = async () => {
    try {
      const res = await fetch('/api/admin/tenants', { credentials: 'include' })
      const data = await res.json()
      if (res.ok) setTenants(data.data || [])
    } catch { /* ignore */ }
  }

  useEffect(() => { void fetchUsers(); void fetchTenants() }, [])

  useEffect(() => { setPage(1) }, [search, roleFilter])

  const updateUserRole = async (userId: string, newRole: string) => {
    try {
      const res = await csrfFetch(`/api/admin/users/${userId}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      })
      if (res.ok) {
        addToast({ type: 'success', title: 'Updated', message: 'User role changed' })
        await fetchUsers()
      } else {
        const d = await res.json()
        addToast({ type: 'error', title: 'Failed', message: d.error })
      }
    } catch { addToast({ type: 'error', title: 'Error', message: 'Network error' }) }
  }

  const updateUserTenant = async (userId: string, tenantId: string) => {
    try {
      const res = await csrfFetch(`/api/admin/users/${userId}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: tenantId === '__none__' ? null : tenantId }),
      })
      if (res.ok) {
        addToast({ type: 'success', title: 'Updated', message: 'Organization changed' })
        await fetchUsers()
      } else {
        const d = await res.json()
        addToast({ type: 'error', title: 'Failed', message: d.error })
      }
    } catch { addToast({ type: 'error', title: 'Error', message: 'Network error' }) }
  }

  const deleteUser = async (userId: string) => {
    if (!await confirmDialog({ title: 'Delete this user?', description: 'This removes their account and cannot be undone.' })) return
    try {
      const res = await csrfFetch(`/api/admin/users/${userId}`, { method: 'DELETE', credentials: 'include' })
      if (res.ok) { addToast({ type: 'success', title: 'Deleted', message: 'User removed' }); await fetchUsers() }
      else { const d = await res.json(); addToast({ type: 'error', title: 'Failed', message: d.error }) }
    } catch { addToast({ type: 'error', title: 'Error', message: 'Network error' }) }
  }

  const bulkDelete = async (ids: string[]) => {
    if (!await confirmDialog({ title: 'Delete users?', description: `Delete ${ids.length} user${ids.length !== 1 ? 's' : ''}?` })) return
    let failed = 0
    for (const id of ids) {
      try {
        await csrfFetch(`/api/admin/users/${id}`, { method: 'DELETE', credentials: 'include' })
      } catch { failed++ }
    }
    addToast({ type: 'success', title: 'Deleted', message: `${ids.length - failed} deleted` })
    setSelected(new Set())
    await fetchUsers()
  }

  const bulkRoleChange = async (newRole: string) => {
    let failed = 0
    for (const id of selected) {
      try {
        const res = await csrfFetch(`/api/admin/users/${id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify({ role: newRole }),
        })
        if (!res.ok) failed++
      } catch { failed++ }
    }
    addToast({ type: 'success', title: 'Updated', message: `${selected.size - failed} role${selected.size - failed !== 1 ? 's' : ''} changed` })
    setSelected(new Set())
    setBulkRoleOpen(false)
    await fetchUsers()
  }

  const filteredUsers = useMemo(() => {
    let list = users
    if (roleFilter !== 'all') list = list.filter(u => normalizeUserRole(u.role) === roleFilter)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(u =>
        (u.email || '').toLowerCase().includes(q) ||
        ((u.full_name || u.name || '') || '').toLowerCase().includes(q)
      )
    }
    return list
  }, [users, search, roleFilter])

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const paginatedUsers = filteredUsers.slice((safePage - 1) * pageSize, safePage * pageSize)
  const allSelected = paginatedUsers.length > 0 && paginatedUsers.every(u => selected.has(u.id))
  const roleCounts = {
    superadmin: users.filter(u => normalizeUserRole(u.role) === 'superadmin').length,
    tenant_admin: users.filter(u => normalizeUserRole(u.role) === 'tenant_admin').length,
    user: users.filter(u => normalizeUserRole(u.role) === 'user').length,
  }

  const toggleSelectAll = () => {
    const next = new Set(selected)
    if (allSelected) paginatedUsers.forEach(u => next.delete(u.id))
    else paginatedUsers.forEach(u => next.add(u.id))
    setSelected(next)
  }

  const toggleUser = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  if (!gate.ready) return null
  if (loading) return (
    <div className="space-y-6">
      <SkeletonStats />
      <SkeletonTable rows={8} />
    </div>
  )

  return (
    <div className="space-y-6">
      <PageHeader
        illustration="team"
        title={
          <>
            Roles
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="ml-1.5 inline-block h-4 w-4 cursor-help align-middle text-muted-foreground" aria-label="About roles" />
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p className="text-xs max-w-62.5">Assign roles to users. Manage role permissions to control what each role can access.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </>
        }
        description="Choose each person's role and organization."
        icon={<Users />}
        actions={<Button onClick={fetchUsers} variant="outline" size="sm"><RefreshCw className="h-4 w-4 mr-1" />Refresh</Button>}
      />

      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Platform admins" value={roleCounts.superadmin} icon={<ShieldCheck />} />
        <StatCard label="Org admins" value={roleCounts.tenant_admin} icon={<Building2 />} />
        <StatCard label="Users" value={roleCounts.user} icon={<User />} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-50">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input placeholder="Search users..." aria-label="Search users" value={search} onChange={e => setSearch(e.target.value)} className="h-9 pl-9 text-sm" />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="h-9 w-40 text-sm" aria-label="Filter by role">
            <SelectValue placeholder="All roles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All roles</SelectItem>
            <SelectItem value="superadmin" className="text-xs">Platform admin</SelectItem>
            <SelectItem value="tenant_admin" className="text-xs">Org admin</SelectItem>
            <SelectItem value="user" className="text-xs">User</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs tabular-nums text-muted-foreground">{filteredUsers.length} user{filteredUsers.length !== 1 ? 's' : ''}</p>
      </div>

      {/* Bulk Actions */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-2">
          <span className="text-sm font-medium tabular-nums text-foreground">{selected.size} selected</span>
          <div className="flex-1" />
          <Select value="" onValueChange={(v) => { if (v) bulkRoleChange(v) }}>
            <SelectTrigger className="h-8 w-[160px] text-xs">
              <SelectValue placeholder="Change role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="user">Set as user</SelectItem>
              <SelectItem value="tenant_admin">Set as org admin</SelectItem>
              <SelectItem value="superadmin">Set as platform admin</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="h-8 text-xs text-destructive hover:text-destructive" onClick={() => bulkDelete(Array.from(selected))}>
            <Trash2 className="h-3 w-3 mr-1" />Delete
          </Button>
        </div>
      )}

      {/* User table */}
      <Panel className="overflow-hidden p-0">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] md:min-w-0 text-sm">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              <th className="w-10 py-3 px-4">
                <button onClick={toggleSelectAll} className="rounded text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary" aria-label={allSelected ? 'Deselect all on this page' : 'Select all on this page'}>
                  {allSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                </button>
              </th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground">User</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground">Email</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground">Role</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground">Organization</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground">Plan</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground">Status</th>
              <th className="text-right py-3 px-4 text-xs font-semibold text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loadError && users.length === 0 ? (
              <tr><td colSpan={8}><EmptyState compact illustration="error" title="Couldn't load users" description="Check your connection and try again." actionLabel="Try again" onAction={() => void fetchUsers()} /></td></tr>
            ) : filteredUsers.length === 0 ? (
              <tr><td colSpan={8} className="py-8 text-center text-muted-foreground text-xs">No users match. Try a different search or role.</td></tr>
            ) : (
              paginatedUsers.map(u => (
                <tr key={u.id} className="border-b border-border/60 last:border-0 hover:bg-muted/40">
                  <td className="py-2.5 px-4">
                    <button onClick={() => toggleUser(u.id)} className="rounded text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary" aria-label={selected.has(u.id) ? 'Deselect user' : 'Select user'}>
                      {selected.has(u.id) ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                    </button>
                  </td>
                  <td className="py-2.5 px-4 text-xs font-medium text-foreground">{u.full_name || u.name || u.email?.split('@')[0] || 'User'}</td>
                  <td className="py-2.5 px-4 text-xs text-muted-foreground">{u.email}</td>
                  <td className="py-2.5 px-4">
                    <select
                      value={normalizeUserRole(u.role)}
                      onChange={e => updateUserRole(u.id, e.target.value)}
                      className="rounded-lg border border-input bg-background px-2 py-1 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label="Role"
                    >
                      <option value="user">User</option>
                      <option value="tenant_admin">Org admin</option>
                      <option value="superadmin">Platform admin</option>
                    </select>
                  </td>
                  <td className="py-2.5 px-4">
                    <select
                      value={u.tenant_id || '__none__'}
                      onChange={e => updateUserTenant(u.id, e.target.value)}
                      className="rounded-lg border border-input bg-background px-2 py-1 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label="Organization"
                    >
                      <option value="__none__">— No org —</option>
                      {tenants.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2.5 px-4"><Badge variant="outline" className="text-[11px] capitalize">{u.plan || 'free'}</Badge></td>
                  <td className="py-2.5 px-4"><Badge variant="outline" className={u.status === 'active' ? 'border-green-500/30 bg-green-500/10 text-[11px] capitalize text-green-700 dark:text-green-400' : 'bg-muted text-[11px] capitalize text-muted-foreground'}>{u.status || 'active'}</Badge></td>
                  <td className="py-2.5 px-4 text-right">
                    <Button variant="ghost" size="sm" className="text-destructive h-7 text-xs" onClick={() => deleteUser(u.id)} aria-label="Delete user" title="Delete user"><Trash2 className="h-3 w-3" /></Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
      </Panel>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs tabular-nums text-muted-foreground">Page {safePage} of {totalPages}</p>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" className="h-8 text-xs" disabled={safePage <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
              <ChevronLeft className="h-3 w-3 mr-1" />Prev
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs" disabled={safePage >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>
              Next<ChevronRight className="h-3 w-3 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
