'use client'

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
import { Card } from '@/components/ui/card'
import { usePageGuard } from '@/lib/use-page-guard'
import { normalizeUserRole } from '@/lib/rbac'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useConfirm } from '@/lib/confirm-context'
import { SkeletonStats, SkeletonTable } from '@/components/ui/skeleton-boneyard'

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

  const fetchUsers = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/users', { credentials: 'include' })
      const data = await res.json()
      if (res.ok) setUsers(data.users || [])
    } catch { /* ignore */ }
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
    if (!await confirmDialog({ title: 'Confirmation', description: 'Delete this user?' })) return
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
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10"><Users className="h-6 w-6 text-primary" /></div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Roles
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help ml-1 inline-block" />
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <p className="text-xs max-w-62.5">Assign roles to users. Manage role permissions to control what each role can access.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </h1>
          </div>
        </div>
        <Button onClick={fetchUsers} variant="outline" size="sm"><Loader2 className="h-4 w-4 mr-1" />Refresh</Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4 text-center border-red-500/20 bg-red-500/5">
          <p className="text-xs text-muted-foreground">Platform Admins</p>
          <p className="text-2xl font-bold text-foreground">{roleCounts.superadmin}</p>
        </Card>
        <Card className="p-4 text-center border-blue-500/20 bg-blue-500/5">
          <p className="text-xs text-muted-foreground">Org Admins</p>
          <p className="text-2xl font-bold text-foreground">{roleCounts.tenant_admin}</p>
        </Card>
        <Card className="p-4 text-center border-green-500/20 bg-green-500/5">
          <p className="text-xs text-muted-foreground">Users</p>
          <p className="text-2xl font-bold text-foreground">{roleCounts.user}</p>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1 min-w-50">
          <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Search users..." value={search} onChange={e => setSearch(e.target.value)} className="pl-7 h-8 text-xs" />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="h-8 w-35 text-xs">
            <SelectValue placeholder="All roles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All roles</SelectItem>
            <SelectItem value="superadmin" className="text-xs">Platform Admin</SelectItem>
            <SelectItem value="tenant_admin" className="text-xs">Org Admin</SelectItem>
            <SelectItem value="user" className="text-xs">User</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">{filteredUsers.length} user{filteredUsers.length !== 1 ? 's' : ''}</p>
      </div>

      {/* Bulk Actions */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <div className="flex-1" />
          <Select value="" onValueChange={(v) => { if (v) bulkRoleChange(v) }}>
            <SelectTrigger className="h-8 w-[160px] text-xs">
              <SelectValue placeholder="Change role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="user">Set as User</SelectItem>
              <SelectItem value="tenant_admin">Set as Org Admin</SelectItem>
              <SelectItem value="superadmin">Set as Platform Admin</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="text-red-600 h-8 text-xs" onClick={() => bulkDelete(Array.from(selected))}>
            <Trash2 className="h-3 w-3 mr-1" />Delete
          </Button>
        </div>
      )}

      {/* User table */}
      <Card className="overflow-hidden border-border/60">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] md:min-w-0 text-sm">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              <th className="w-10 py-3 px-4">
                <button onClick={toggleSelectAll} className="text-muted-foreground hover:text-foreground">
                  {allSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                </button>
              </th>
              <th className="text-left py-3 px-4 font-semibold text-xs">User</th>
              <th className="text-left py-3 px-4 font-semibold text-xs">Email</th>
              <th className="text-left py-3 px-4 font-semibold text-xs">Role</th>
              <th className="text-left py-3 px-4 font-semibold text-xs">Organization</th>
              <th className="text-left py-3 px-4 font-semibold text-xs">Plan</th>
              <th className="text-left py-3 px-4 font-semibold text-xs">Status</th>
              <th className="text-right py-3 px-4 font-semibold text-xs">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.length === 0 ? (
              <tr><td colSpan={8} className="py-8 text-center text-muted-foreground text-xs">No users found</td></tr>
            ) : (
              paginatedUsers.map(u => (
                <tr key={u.id} className="border-b border-border hover:bg-muted/50">
                  <td className="py-2.5 px-4">
                    <button onClick={() => toggleUser(u.id)} className="text-muted-foreground hover:text-foreground">
                      {selected.has(u.id) ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                    </button>
                  </td>
                  <td className="py-2.5 px-4 font-medium text-xs">{u.full_name || u.name || u.email?.split('@')[0] || 'User'}</td>
                  <td className="py-2.5 px-4 text-xs text-muted-foreground">{u.email}</td>
                  <td className="py-2.5 px-4">
                    <select
                      value={normalizeUserRole(u.role)}
                      onChange={e => updateUserRole(u.id, e.target.value)}
                      className="text-xs bg-background border border-border rounded px-2 py-1"
                    >
                      <option value="user">User</option>
                      <option value="tenant_admin">Org Admin</option>
                      <option value="superadmin">Platform Admin</option>
                    </select>
                  </td>
                  <td className="py-2.5 px-4">
                    <select
                      value={u.tenant_id || '__none__'}
                      onChange={e => updateUserTenant(u.id, e.target.value)}
                      className="text-xs bg-background border border-border rounded px-2 py-1 max-w-35"
                      aria-label="Organization"
                    >
                      <option value="__none__">— No org —</option>
                      {tenants.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2.5 px-4"><Badge variant="outline" className="text-[10px]">{u.plan || 'free'}</Badge></td>
                  <td className="py-2.5 px-4"><Badge className={u.status === 'active' ? 'bg-green-500/20 text-green-700 text-[10px]' : 'bg-gray-500/20 text-gray-700 text-[10px]'}>{u.status || 'active'}</Badge></td>
                  <td className="py-2.5 px-4 text-right">
                    <Button variant="ghost" size="sm" className="text-destructive h-7 text-xs" onClick={() => deleteUser(u.id)}><Trash2 className="h-3 w-3" /></Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Page {safePage} of {totalPages}</p>
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
