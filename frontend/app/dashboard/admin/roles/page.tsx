'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { useToast } from '@/lib/toast-context'
import {
  Shield, Users, Plus, Trash2, Save, Loader2, CheckCircle2, Search, Edit2
} from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { getRoleLabel, normalizeUserRole, type UserRole } from '@/lib/rbac'
import { type ResourcePermission, type PermissionAction } from '@/lib/permissions-db'

const ALL_ACTIONS: PermissionAction[] = ['read', 'create', 'update', 'delete', 'manage']

interface RoleData {
  _id?: string; role: string; name: string; description?: string
  permissions: ResourcePermission[]; isSystem?: boolean
}

interface UserData {
  id: string; email: string; full_name?: string; role: string; status: string; plan?: string
}

export default function RolesPermissionsPage() {
  const gate = usePageGuard('superadmin')
  const addToast = useToast()
  const [roles, setRoles] = useState<RoleData[]>([])
  const [users, setUsers] = useState<UserData[]>([])
  const [allResources, setAllResources] = useState<ResourcePermission[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedRole, setSelectedRole] = useState<string>('superadmin')
  const [editingPerms, setEditingPerms] = useState<Record<string, PermissionAction[]>>({})
  const [saving, setSaving] = useState(false)
  const [creatingRole, setCreatingRole] = useState(false)
  const [newRole, setNewRole] = useState({ role: '', name: '', description: '' })
  const [userFilter, setUserFilter] = useState('')
  const [activeTab, setActiveTab] = useState('roles')

  const fetchData = async () => {
    setLoading(true)
    try {
      const [rolesRes, usersRes] = await Promise.all([
        fetch('/api/admin/permissions/roles', { credentials: 'include' }),
        fetch('/api/admin/users', { credentials: 'include' }),
      ])
      const rolesData = await rolesRes.json()
      const usersData = await usersRes.json()
      if (rolesRes.ok) {
        setRoles(rolesData.roles || [])
        setAllResources(rolesData.allResources || [])
      }
      if (usersRes.ok) setUsers(usersData.users || [])
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchData() }, [])

  const currentRole = roles.find(r => r.role === selectedRole)

  const handlePermToggle = (resource: string, action: string) => {
    setEditingPerms(prev => {
      const stored = currentRole?.permissions.find(p => p.resource === resource)?.actions || []
      const current = prev[resource] !== undefined ? prev[resource] : stored
      const next = current.includes(action as PermissionAction)
        ? current.filter(a => a !== action)
        : action === 'manage' ? ['manage'] : [...current.filter(a => a !== 'manage'), action]
      return { ...prev, [resource]: next }
    })
  }

  const savePermissions = async () => {
    if (!currentRole) return
    setSaving(true)
    const permissions = currentRole.permissions.map(p => ({
      ...p, actions: editingPerms[p.resource] !== undefined ? editingPerms[p.resource] : p.actions
    }))
    try {
      const res = await fetch('/api/admin/permissions/roles', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...currentRole, permissions }),
      })
      if (res.ok) {
        addToast({ type: 'success', title: 'Saved', message: `Permissions for ${currentRole.name} updated` })
        setEditingPerms({})
        await fetchData()
      } else {
        const d = await res.json(); addToast({ type: 'error', title: 'Failed', message: d.error })
      }
    } catch { addToast({ type: 'error', title: 'Error', message: 'Network error' }) }
    finally { setSaving(false) }
  }

  const deleteRole = async (role: string) => {
    if (!confirm(`Delete role "${role}"?`)) return
    try {
      const res = await fetch(`/api/roles/${role}`, { method: 'DELETE', credentials: 'include' })
      if (res.ok) {
        addToast({ type: 'success', title: 'Deleted', message: `Role ${role} removed` })
        setSelectedRole('superadmin')
        await fetchData()
      }
    } catch { addToast({ type: 'error', title: 'Error', message: 'Failed to delete' }) }
  }

  const createNewRole = async () => {
    if (!newRole.role || !newRole.name) return
    setSaving(true)
    try {
      const res = await fetch('/api/admin/permissions/roles', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newRole),
      })
      if (res.ok) {
        addToast({ type: 'success', title: 'Created', message: `Role ${newRole.name} created` })
        setCreatingRole(false)
        setNewRole({ role: '', name: '', description: '' })
        setSelectedRole(newRole.role)
        await fetchData()
      } else {
        const d = await res.json(); addToast({ type: 'error', title: 'Failed', message: d.error })
      }
    } catch { addToast({ type: 'error', title: 'Error', message: 'Network error' }) }
    finally { setSaving(false) }
  }

  const updateUserRole = async (userId: string, newRole: string) => {
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      })
      if (res.ok) { addToast({ type: 'success', title: 'Updated', message: 'User role changed' }); await fetchData() }
      else { const d = await res.json(); addToast({ type: 'error', title: 'Failed', message: d.error }) }
    } catch { addToast({ type: 'error', title: 'Error', message: 'Network error' }) }
  }

  const deleteUser = async (userId: string) => {
    if (!confirm('Delete this user?')) return
    try {
      const res = await fetch(`/api/admin/users/${userId}`, { method: 'DELETE', credentials: 'include' })
      if (res.ok) { addToast({ type: 'success', title: 'Deleted', message: 'User removed' }); await fetchData() }
    } catch { addToast({ type: 'error', title: 'Error', message: 'Failed to delete' }) }
  }

  const filteredUsers = users.filter(u =>
    !userFilter || (u.email || '').toLowerCase().includes(userFilter.toLowerCase()) ||
    ((u.full_name || '') || '').toLowerCase().includes(userFilter.toLowerCase())
  )

  const changedCount = Object.keys(editingPerms).length
  const filteredResources = allResources.filter(r =>
    r.resourceType === 'page' || r.resource === 'entity:users'
  ).slice(0, 50)

  if (!gate.ready) return <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading…</div>
  if (loading) return <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading data…</div>

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10"><Shield className="h-6 w-6 text-primary" /></div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Roles & Permissions</h1>
            <p className="text-muted-foreground text-sm mt-0.5">Manage roles, permissions, and user assignments. Changes take effect immediately.</p>
          </div>
        </div>
        <Button onClick={fetchData} variant="outline" size="sm"><Loader2 className="h-4 w-4 mr-1" />Refresh</Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="roles">Role Permissions</TabsTrigger>
          <TabsTrigger value="users">User Assignment</TabsTrigger>
        </TabsList>

        <TabsContent value="roles" className="space-y-4 pt-4">
          {/* Role selector */}
          <div className="flex items-center gap-3 flex-wrap">
            {roles.map(r => (
              <Button
                key={r.role}
                variant={selectedRole === r.role ? 'default' : 'outline'}
                size="sm"
                onClick={() => { setSelectedRole(r.role); setEditingPerms({}) }}
              >
                {r.name}
                {r.isSystem && <Badge variant="secondary" className="ml-1 text-[9px]">sys</Badge>}
              </Button>
            ))}
            <Button variant="outline" size="sm" onClick={() => setCreatingRole(true)}><Plus className="h-4 w-4 mr-1" />New Role</Button>
            {!currentRole?.isSystem && (
              <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteRole(selectedRole)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>

          {creatingRole && (
            <Card className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Role ID (lowercase, no spaces)</Label><Input value={newRole.role} onChange={e => setNewRole({...newRole, role: e.target.value})} placeholder="team_lead" /></div>
                <div><Label>Display Name</Label><Input value={newRole.name} onChange={e => setNewRole({...newRole, name: e.target.value})} placeholder="Team Lead" /></div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={createNewRole} disabled={saving}>Create</Button>
                <Button size="sm" variant="outline" onClick={() => setCreatingRole(false)}>Cancel</Button>
              </div>
            </Card>
          )}

          {currentRole && (
            <>
              <div className="flex items-center gap-2">
                {changedCount > 0 && <Badge variant="secondary">{changedCount} changes</Badge>}
                <Button onClick={savePermissions} disabled={saving || changedCount === 0} size="sm"><Save className="h-3 w-3 mr-1" />Save</Button>
              </div>

              <Card className="overflow-hidden border-border/60">
                <div className="max-h-[55vh] overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-muted/50 z-10">
                      <tr className="border-b border-border/60">
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Resource</th>
                        {ALL_ACTIONS.map(a => <th key={a} className="px-1 py-2 text-center font-medium text-muted-foreground w-[10%] capitalize">{a}</th>)}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/20">
                      {filteredResources.map(r => {
                        const perm = currentRole.permissions.find(p => p.resource === r.resource)
                        const actions = editingPerms[r.resource] !== undefined ? editingPerms[r.resource] : (perm?.actions || [])
                        return (
                          <tr key={r.resource} className={`hover:bg-muted/20 ${!perm ? 'bg-amber-500/5' : ''}`}>
                            <td className="px-3 py-1.5">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-[9px]">{r.resourceType}</Badge>
                                <span className="font-mono text-[11px] truncate max-w-[280px]">{r.label || r.resource}</span>
                                {!perm && <Badge className="text-[9px] bg-amber-500/20 text-amber-600">new</Badge>}
                              </div>
                            </td>
                            {ALL_ACTIONS.map(action => (
                              <td key={action} className="px-1 py-1.5 text-center">
                                <button
                                  onClick={() => handlePermToggle(r.resource, action)}
                                  className={`inline-flex h-6 w-6 items-center justify-center rounded text-[10px] font-medium transition-all ${
                                    actions.includes(action) || (action !== 'manage' && actions.includes('manage'))
                                      ? 'bg-primary text-primary-foreground'
                                      : 'text-muted-foreground/30 hover:bg-muted'
                                  }`}
                                >{actions.includes(action) || (action !== 'manage' && actions.includes('manage')) ? '✓' : '·'}</button>
                              </td>
                            ))}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="users" className="space-y-4 pt-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Filter users..." value={userFilter} onChange={e => setUserFilter(e.target.value)} className="pl-7 h-8 text-xs" />
          </div>

          <Card className="overflow-hidden border-border/60">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="text-left py-2 px-3 font-semibold text-xs">User</th>
                  <th className="text-left py-2 px-3 font-semibold text-xs">Email</th>
                  <th className="text-left py-2 px-3 font-semibold text-xs">Role</th>
                  <th className="text-left py-2 px-3 font-semibold text-xs">Plan</th>
                  <th className="text-left py-2 px-3 font-semibold text-xs">Status</th>
                  <th className="text-right py-2 px-3 font-semibold text-xs">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map(u => (
                  <tr key={u.id} className="border-b border-border hover:bg-muted/50">
                    <td className="py-2 px-3 font-medium text-xs">{u.full_name || u.email?.split('@')[0] || 'User'}</td>
                    <td className="py-2 px-3 text-xs text-muted-foreground">{u.email}</td>
                    <td className="py-2 px-3">
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
                    <td className="py-2 px-3"><Badge variant="outline" className="text-[10px]">{u.plan || 'free'}</Badge></td>
                    <td className="py-2 px-3"><Badge className={u.status === 'active' ? 'bg-green-500/20 text-green-700 text-[10px]' : 'bg-gray-500/20 text-gray-700 text-[10px]'}>{u.status || 'active'}</Badge></td>
                    <td className="py-2 px-3 text-right">
                      <Button variant="ghost" size="sm" className="text-destructive h-7 text-xs" onClick={() => deleteUser(u.id)}><Trash2 className="h-3 w-3" /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
