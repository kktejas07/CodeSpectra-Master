'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/lib/toast-context'
import {
  Shield, Search, Loader2, CheckCircle2, Database, RefreshCw,
  Save, Plus, Trash2, Users, Lock, Key
} from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { type ResourcePermission, type PermissionAction } from '@/lib/permissions-db'

interface RoleData {
  _id?: string; role: string; name: string; description?: string
  permissions: ResourcePermission[]; isSystem?: boolean
}

const ROLE_COLORS: Record<string, string> = {
  superadmin: 'bg-red-500/20 text-red-700', tenant_admin: 'bg-blue-500/20 text-blue-700', user: 'bg-green-500/20 text-green-700',
}

export default function PermissionsPage() {
  const gate = usePageGuard('superadmin')
  const addToast = useToast()
  const [roles, setRoles] = useState<RoleData[]>([])
  const [allResources, setAllResources] = useState<ResourcePermission[]>([])
  const [loading, setLoading] = useState(true)
  const [autoSeeded, setAutoSeeded] = useState(false)
  const [selectedRole, setSelectedRole] = useState('superadmin')
  const [editing, setEditing] = useState<Record<string, PermissionAction[]>>({})
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState('')

  const fetchRoles = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/permissions/roles', { credentials: 'include' })
      const data = await res.json()
      if (res.ok) {
        const wasAutoSeeded = data._autoSeeded
        setRoles(data.roles || [])
        setAllResources(data.allResources || [])
        if (wasAutoSeeded || (data.roles?.length > 0 && data.allResources?.length > 0)) {
          setAutoSeeded(true)
          addToast({ type: 'success', title: 'Ready', message: `${data.roles.length} roles loaded with ${data.allResources.length} resources` })
        }
      } else {
        addToast({ type: 'error', title: 'Failed', message: data.error })
      }
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [addToast])

  useEffect(() => { fetchRoles() }, [fetchRoles])

  const currentRole = useMemo(() => roles.find(r => r.role === selectedRole), [roles, selectedRole])

  const togglePerm = (resource: string, action: string) => {
    setEditing(prev => {
      const stored = currentRole?.permissions.find(p => p.resource === resource)?.actions || []
      const current = prev[resource] !== undefined ? prev[resource] : stored
      const next = current.includes(action as PermissionAction)
        ? current.filter(a => a !== action)
        : action === 'manage' ? ['manage'] : [...current.filter(a => a !== 'manage'), action]
      return { ...prev, [resource]: next }
    })
  }

  const save = async (reseed?: boolean) => {
    if (!currentRole && !reseed) return
    setSaving(true)
    try {
      const permissions = reseed ? undefined : (currentRole!.permissions.map(p => ({
        ...p, actions: editing[p.resource] !== undefined ? editing[p.resource] : p.actions
      })))
      const body = reseed
        ? { role: selectedRole, name: currentRole?.name || selectedRole, permissions: [] }
        : { ...currentRole, permissions }

      const res = await fetch('/api/admin/permissions/roles', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        addToast({ type: 'success', title: 'Saved', message: reseed ? 'Reseeded with discovered resources' : `Permissions for ${currentRole?.name} updated` })
        setEditing({})
        await fetchRoles()
      } else {
        const d = await res.json()
        addToast({ type: 'error', title: 'Failed', message: d.error })
      }
    } catch { addToast({ type: 'error', title: 'Error', message: 'Network error' }) }
    finally { setSaving(false) }
  }

  const filteredResources = useMemo(() => {
    if (!filter) return allResources
    const q = filter.toLowerCase()
    return allResources.filter(r => (r.resource || '').toLowerCase().includes(q) || (r.label || '').toLowerCase().includes(q))
  }, [allResources, filter])

  // Stats
  const pageCount = allResources.filter(r => r.resourceType === 'page').length
  const entityCount = allResources.filter(r => r.resourceType === 'entity').length
  const newCount = allResources.filter(r => !currentRole?.permissions.find(p => p.resource === r.resource)).length
  const changedCount = Object.keys(editing).length

  if (!gate.ready) return <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading…</div>
  if (loading) return <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading permissions…</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10"><Shield className="h-6 w-6 text-primary" /></div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Role & Permission Manager</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              {autoSeeded ? `${roles.length} roles · ${allResources.length} resources` : 'Loading...'} · DB-driven · Changes take effect immediately.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={fetchRoles} variant="outline" size="sm"><RefreshCw className="h-4 w-4 mr-1" />Refresh</Button>
          <Button onClick={() => save(true)} disabled={saving} variant="outline" size="sm"><Database className="h-4 w-4 mr-1" />Reseed</Button>
        </div>
      </div>

      {/* Status */}
      {autoSeeded ? (
        <Card className="p-3 border-green-500/20 bg-green-500/5 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          <span className="text-sm text-green-600">Auto-seeded: {roles.length} roles, {pageCount} pages, {entityCount} entities. All dynamic — no hardcoded lists.</span>
        </Card>
      ) : (
        <Card className="p-3 border-amber-500/20 bg-amber-500/5 flex items-center gap-2">
          <Loader2 className="h-4 w-4 text-amber-500 animate-spin" />
          <span className="text-sm text-amber-600">Initializing... roles auto-seed on first load.</span>
        </Card>
      )}

      {/* Role selector */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={selectedRole} onValueChange={v => { setSelectedRole(v); setEditing({}) }}>
          <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {roles.map(r => (
              <SelectItem key={r.role} value={r.role}>
                <span className="flex items-center gap-2">{r.name} {r.isSystem && <Badge variant="outline" className="text-[9px]">system</Badge>}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {currentRole?.description && <p className="text-xs text-muted-foreground">{currentRole.description}</p>}
        <div className="ml-auto flex items-center gap-2">
          {newCount > 0 && <Badge variant="secondary" className="text-[10px]">{newCount} new resources</Badge>}
          {changedCount > 0 && <Badge variant="default" className="text-[10px]">{changedCount} changes pending</Badge>}
          <Button onClick={() => save()} disabled={saving || changedCount === 0} size="sm" className="gap-2">
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Save
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {(['read','create','update','delete'] as PermissionAction[]).map(action => {
          const perms = currentRole?.permissions || []
          const count = perms.filter(p => p.actions.includes('manage') || p.actions.includes(action)).length
          return <Card key={action} className="p-3 text-center"><p className="text-xs text-muted-foreground capitalize">{action}</p><p className="text-xl font-bold text-foreground">{count}</p></Card>
        })}
      </div>

      {/* Search */}
      <div className="relative max-w-sm"><Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" /><Input placeholder="Filter resources..." value={filter} onChange={e => setFilter(e.target.value)} className="pl-7 h-8 text-xs" /></div>

      {/* Permission grid */}
      <Card className="overflow-hidden border-border/60">
        <div className="max-h-[60vh] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted/60 z-10">
              <tr className="border-b border-border/60">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground w-[40%]">Resource</th>
                <th className="px-1 py-2 text-center font-medium text-muted-foreground w-[12%]">Read</th>
                <th className="px-1 py-2 text-center font-medium text-muted-foreground w-[12%]">Create</th>
                <th className="px-1 py-2 text-center font-medium text-muted-foreground w-[12%]">Update</th>
                <th className="px-1 py-2 text-center font-medium text-muted-foreground w-[12%]">Delete</th>
                <th className="px-1 py-2 text-center font-medium text-muted-foreground w-[12%]">All</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {filteredResources.map(r => {
                const perm = currentRole?.permissions.find(p => p.resource === r.resource)
                const actions = editing[r.resource] !== undefined ? editing[r.resource] : (perm?.actions || [])
                const isNew = !perm
                const hasAny = actions.length > 0
                return (
                  <tr key={r.resource} className={`hover:bg-muted/20 transition-colors ${isNew ? 'bg-amber-500/5' : ''}`}>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[9px] shrink-0">{r.resourceType}</Badge>
                        <span className="font-mono text-[11px] text-foreground truncate max-w-[280px]" title={r.resource}>{r.label || r.resource.split('/').pop() || r.resource}</span>
                        {isNew && <Badge className="text-[9px] bg-amber-500/20 text-amber-600">new</Badge>}
                      </div>
                    </td>
                    {(['read','create','update','delete','manage'] as PermissionAction[]).map(action => (
                      <td key={action} className="px-1 py-1.5 text-center">
                        <button
                          onClick={() => togglePerm(r.resource, action)}
                          className={`inline-flex h-6 w-6 items-center justify-center rounded text-[10px] font-medium transition-all ${
                            actions.includes(action) || (action !== 'manage' && actions.includes('manage'))
                              ? 'bg-primary text-primary-foreground shadow-sm'
                              : 'text-muted-foreground/30 hover:bg-muted hover:text-muted-foreground'
                          }`}
                        >{actions.includes(action) || (action !== 'manage' && actions.includes('manage')) ? '✓' : '·'}</button>
                      </td>
                    ))}
                  </tr>
                )
              })}
              {filteredResources.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground text-xs">No resources match filter.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Legend */}
      <Card className="p-4 border-border/60 text-xs text-muted-foreground space-y-2">
        <p><strong className="text-foreground">How it works:</strong> Resources auto-discover from <code className="bg-muted px-1 rounded">page-permissions.ts</code> + API entities. Toggle actions per role. Changes → MongoDB → enforced by <code className="bg-muted px-1 rounded">route-auth.ts</code> and <code className="bg-muted px-1 rounded">usePageGuard()</code>.</p>
        <p><strong className="text-foreground">Adding a new page:</strong> Create page.tsx → add route to <code className="bg-muted px-1 rounded">page-permissions.ts</code> → deploy → open this page → new resource appears with "new" badge → assign permissions → done. No RBAC editing needed.</p>
        <p className="flex items-center gap-2"><span className="inline-flex h-3 w-3 rounded-full bg-primary" /><code className="bg-muted px-1 rounded">manage</code> grants all CRUD actions. Toggle per role to override.</p>
      </Card>
    </div>
  )
}
