'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { useToast } from '@/lib/toast-context'
import { Users, Loader2, Search, Trash2 } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { normalizeUserRole } from '@/lib/rbac'
import Link from 'next/link'

interface UserData {
  id: string; email: string; full_name?: string; name?: string
  role: string; status: string; plan?: string
}

export default function UserRoleAssignments() {
  const gate = usePageGuard('superadmin')
  const addToast = useToast()
  const [users, setUsers] = useState<UserData[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')

  const fetchUsers = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/users', { credentials: 'include' })
      const data = await res.json()
      if (res.ok) setUsers(data.users || [])
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchUsers() }, [])

  const updateUserRole = async (userId: string, newRole: string) => {
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
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

  const deleteUser = async (userId: string) => {
    if (!confirm('Delete this user?')) return
    try {
      const res = await fetch(`/api/admin/users/${userId}`, { method: 'DELETE', credentials: 'include' })
      if (res.ok) { addToast({ type: 'success', title: 'Deleted', message: 'User removed' }); await fetchUsers() }
      else { const d = await res.json(); addToast({ type: 'error', title: 'Failed', message: d.error }) }
    } catch { addToast({ type: 'error', title: 'Error', message: 'Network error' }) }
  }

  const filteredUsers = users.filter(u =>
    !filter || (u.email || '').toLowerCase().includes(filter.toLowerCase()) ||
    ((u.full_name || u.name || '') || '').toLowerCase().includes(filter.toLowerCase())
  )
  const roleCounts = { superadmin: users.filter(u => normalizeUserRole(u.role) === 'superadmin').length, tenant_admin: users.filter(u => normalizeUserRole(u.role) === 'tenant_admin').length, user: users.filter(u => normalizeUserRole(u.role) === 'user').length }

  if (!gate.ready) return <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading…</div>
  if (loading) return <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading users…</div>

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10"><Users className="h-6 w-6 text-primary" /></div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">User Role Assignments</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Assign roles to users.{' '}
              <Link href="/dashboard/admin/permissions" className="text-primary underline underline-offset-2">Manage role permissions</Link>{' '}
              to control what each role can access.
            </p>
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
      <div className="relative max-w-sm">
        <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
        <Input placeholder="Search users..." value={filter} onChange={e => setFilter(e.target.value)} className="pl-7 h-8 text-xs" />
      </div>

      {/* User table */}
      <Card className="overflow-hidden border-border/60">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              <th className="text-left py-3 px-4 font-semibold text-xs">User</th>
              <th className="text-left py-3 px-4 font-semibold text-xs">Email</th>
              <th className="text-left py-3 px-4 font-semibold text-xs">Role</th>
              <th className="text-left py-3 px-4 font-semibold text-xs">Plan</th>
              <th className="text-left py-3 px-4 font-semibold text-xs">Status</th>
              <th className="text-right py-3 px-4 font-semibold text-xs">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.length === 0 ? (
              <tr><td colSpan={6} className="py-8 text-center text-muted-foreground text-xs">No users found</td></tr>
            ) : (
              filteredUsers.map(u => (
                <tr key={u.id} className="border-b border-border hover:bg-muted/50">
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
      </Card>
    </div>
  )
}
