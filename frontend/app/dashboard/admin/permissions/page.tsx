'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/lib/toast-context'
import {
  Shield, Search, Lock, Users, Loader2, CheckCircle2, AlertTriangle,
  Plus, Save, Trash2, RefreshCw, Database, Eye, EyeOff, Key
} from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { type ResourcePermission, type PermissionAction } from '@/lib/permissions-db'

interface RoleData {
  _id?: string; role: string; name: string; description?: string
  permissions: ResourcePermission[]; isSystem?: boolean
}

const ROLE_COLORS: Record<string, string> = {
  superadmin: 'bg-red-500/20 text-red-700',
  tenant_admin: 'bg-blue-500/20 text-blue-700',
  user: 'bg-green-500/20 text-green-700',
}

const ACTION_COLORS: Record<string, string> = {
  read: 'bg-blue-500/20 text-blue-600',
  create: 'bg-green-500/20 text-green-600',
  update: 'bg-amber-500/20 text-amber-600',
  delete: 'bg-red-500/20 text-red-600',
  manage: 'bg-purple-500/20 text-purple-600',
}

export default function PermissionsPage() {
  const gate = usePageGuard('superadmin')
  const addToast = useToast()
  const [roles, setRoles] = useState<RoleData[]>([])
  const [allResources, setAllResources] = useState<ResourcePermission[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedRole, setSelectedRole] = useState<string>('superadmin')
  const [editingPermission, setEditingPermission] = useState<Record<string, PermissionAction[]>>({})
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState('')
  const [showSystem, setShowSystem] = useState(true)
  const [activeTab, setActiveTab] = useState('roles')

  const fetchRoles = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/permissions/roles', { credentials: 'include' })
      const data = await res.json()
      if (res.ok) {
        setRoles(data.roles || [])
        setAllResources(data.allResources || [])
        if (data.roles.length === 0) {
          addToast({ type: 'warning', title: 'No roles found', message: 'Click "Seed Roles" to populate defaults' })
        }
      }
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [addToast])

  useEffect(() => { fetchRoles() }, [fetchRoles])

  const currentRole = useMemo(() => roles.find(r => r.role === selectedRole), [roles, selectedRole])

  const seedRoles = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/permissions/seed', { method: 'POST', credentials: 'include' })
      const data = await res.json()
      if (res.ok) {
        addToast({ type: 'success', title: 'Roles seeded', message: data.results?.join(', ') })
        await fetchRoles()
      } else {
        addToast({ type: 'error', title: 'Seed failed', message: data.error })
      }
    } catch { addToast({ type: 'error', title: 'Error', message: 'Network error' }) }
    finally { setSaving(false) }
  }

  const handlePermissionToggle = (resource: string, action: string) => {
    setEditingPermission(prev => {
      const current = prev[resource] || (currentRole?.permissions.find(p => p.resource === resource)?.actions || [])
      const next = current.includes(action as PermissionAction)
        ? current.filter(a => a !== action)
        : action === 'manage'
          ? ['manage']
          : [...current.filter(a => a !== 'manage'), action]
      return { ...prev, [resource]: next }
    })
  }

  const savePermissions = async () => {
    if (!currentRole) return
    setSaving(true)
    const permissions = currentRole.permissions.map(p => ({
      ...p,
      actions: editingPermission[p.resource] !== undefined ? editingPermission[p.resource] : p.actions
    }))

    try {
      const res = await fetch('/api/admin/permissions/roles', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...currentRole, permissions }),
      })
      if (res.ok) {
        addToast({ type: 'success', title: 'Saved', message: `Permissions for ${currentRole.name} updated` })
        setEditingPermission({})
        await fetchRoles()
      } else {
        const d = await res.json()
        addToast({ type: 'error', title: 'Save failed', message: d.error })
      }
    } catch { addToast({ type: 'error', title: 'Error', message: 'Network error' }) }
    finally { setSaving(false) }
  }

  const filteredResources = useMemo(() => {
    if (!filter) return allResources
    const q = filter.toLowerCase()
    return allResources.filter(r => r.resource.toLowerCase().includes(q) || (r.label || '').toLowerCase().includes(q))
  }, [allResources, filter])

  const changedCount = Object.keys(editingPermission).length

  if (!gate.ready) return <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading…</div>
  if (loading) return <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading permissions…</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10"><Shield className="h-6 w-6 text-primary" /></div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Role & Permission Manager</h1>
            <p className="text-muted-foreground text-sm mt-0.5">DB-driven. Changes take effect immediately. No redeploy needed.</p>
          </div>
        </div>
        <Button onClick={seedRoles} disabled={saving} variant="outline" size="sm" className="gap-2">
          <Database className="h-4 w-4" /> Seed Roles
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="roles">Role Permissions</TabsTrigger>
          <TabsTrigger value="reference">Route Reference</TabsTrigger>
        </TabsList>

        <TabsContent value="roles" className="space-y-4 pt-4">
          {/* Role selector */}
          <div className="flex flex-wrap items-center gap-3">
            <Select value={selectedRole} onValueChange={v => { setSelectedRole(v); setEditingPermission({}) }}>
              <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {roles.map(r => (
                  <SelectItem key={r.role} value={r.role}>
                    <span className="flex items-center gap-2">
                      {r.name} {r.isSystem && <Badge variant="outline" className="text-[9px]">system</Badge>}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {currentRole?.description && <p className="text-xs text-muted-foreground">{currentRole.description}</p>}
            <div className="ml-auto flex items-center gap-2">
              {changedCount > 0 && <Badge variant="secondary">{changedCount} changes</Badge>}
              <Button onClick={savePermissions} disabled={saving || changedCount === 0} size="sm" className="gap-2">
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                Save
              </Button>
            </div>
          </div>

          {/* Resource count */}
          <div className="grid grid-cols-4 gap-3">
            {(['read','create','update','delete'] as PermissionAction[]).map(action => {
              const count = (currentRole?.permissions || []).filter(p => p.actions.includes('manage') || p.actions.includes(action)).length
              return (
                <Card key={action} className="p-3 text-center">
                  <p className="text-xs text-muted-foreground capitalize">{action}</p>
                  <p className="text-xl font-bold text-foreground">{count}</p>
                </Card>
              )
            })}
          </div>

          {/* Permission matrix */}
          <div className="flex gap-2 mb-2">
            <div className="relative flex-1"><Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" /><Input placeholder="Filter resources..." value={filter} onChange={e => setFilter(e.target.value)} className="pl-7 h-8 text-xs" /></div>
          </div>

          <Card className="overflow-hidden border-border/60">
            <div className="max-h-[60vh] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/50 z-10">
                  <tr className="border-b border-border/60">
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground w-[40%]">Resource</th>
                    <th className="px-2 py-2 text-center font-medium text-muted-foreground">Read</th>
                    <th className="px-2 py-2 text-center font-medium text-muted-foreground">Create</th>
                    <th className="px-2 py-2 text-center font-medium text-muted-foreground">Update</th>
                    <th className="px-2 py-2 text-center font-medium text-muted-foreground">Delete</th>
                    <th className="px-2 py-2 text-center font-medium text-muted-foreground">Manage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {filteredResources.map(r => {
                    const perm = currentRole?.permissions.find(p => p.resource === r.resource)
                    const actions = editingPermission[r.resource] !== undefined ? editingPermission[r.resource] : (perm?.actions || [])
                    return (
                      <tr key={r.resource} className="hover:bg-muted/20 transition-colors">
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[9px] shrink-0">{r.resourceType}</Badge>
                            <span className="font-mono text-[11px] text-foreground truncate max-w-[250px]" title={r.resource}>{r.label || r.resource}</span>
                            {!perm && <Badge variant="secondary" className="text-[9px] text-amber-600">new</Badge>}
                          </div>
                        </td>
                        {(['read','create','update','delete','manage'] as PermissionAction[]).map(action => (
                          <td key={action} className="px-2 py-2 text-center">
                            <button
                              onClick={() => handlePermissionToggle(r.resource, action)}
                              className={`inline-flex h-6 w-6 items-center justify-center rounded transition-all ${
                                actions.includes(action) || (action !== 'manage' && actions.includes('manage'))
                                  ? 'bg-primary text-primary-foreground'
                                  : 'bg-muted/40 text-muted-foreground hover:bg-muted'
                              }`}
                            >
                              {actions.includes(action) || (action !== 'manage' && actions.includes('manage')) ? '✓' : '·'}
                            </button>
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="reference" className="pt-4">
          <Card className="p-5 border-border/60">
            <h3 className="font-semibold text-foreground mb-3">How permissions work</h3>
            <div className="grid gap-3 md:grid-cols-3 text-sm">
              <div className="space-y-1.5 p-3 rounded-lg bg-muted/30">
                <p className="font-medium">1. Find resource</p>
                <p className="text-xs text-muted-foreground">Resources auto-discover from <code className="text-[11px] bg-muted px-1 rounded">page-permissions.ts</code> routes + API entities. New pages appear automatically.</p>
              </div>
              <div className="space-y-1.5 p-3 rounded-lg bg-muted/30">
                <p className="font-medium">2. Assign actions</p>
                <p className="text-xs text-muted-foreground">Toggle Read/Create/Update/Delete/Manage per resource per role. Changes saved to MongoDB instantly.</p>
              </div>
              <div className="space-y-1.5 p-3 rounded-lg bg-muted/30">
                <p className="font-medium">3. Enforced everywhere</p>
                <p className="text-xs text-muted-foreground">API routes call <code className="text-[11px] bg-muted px-1 rounded">checkPermission()</code>. Pages use <code className="text-[11px] bg-muted px-1 rounded">usePageGuard()</code>. Sidebar hides unavailable routes.</p>
              </div>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
