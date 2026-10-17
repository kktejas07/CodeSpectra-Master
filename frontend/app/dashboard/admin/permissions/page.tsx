'use client'

import { useEffect, useState, useMemo, useCallback, Fragment } from 'react'
import { Card } from '@/components/ui/card'
import { PageHeader, Panel, StatCard } from '@/components/app/page-kit'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/lib/toast-context'
import {
  Shield, Search, Loader2, CheckCircle2, Database, RefreshCw,
  Save, Plus, Trash2, Users, Lock, Key, Unlock, ChevronRight, ChevronDown
} from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { csrfFetch } from '@/lib/csrf-fetch'
import { type ResourcePermission, type PermissionAction } from '@/lib/permissions-db'
import { buildPermissionMatrix, ROUTE_LABELS } from '@/lib/page-permissions'
import { getAllFeatureLocks } from '@/lib/feature-locks'
import { SkeletonCard, SkeletonStats, SkeletonTable } from '@/components/ui/skeleton-boneyard'

interface RoleData {
  _id?: string; role: string; name: string; description?: string
  permissions: ResourcePermission[]; isSystem?: boolean
}

const ROLE_COLORS: Record<string, string> = {
  superadmin: 'border-transparent bg-red-500/15 text-red-700 dark:text-red-300', tenant_admin: 'border-transparent bg-primary/10 text-primary', user: 'border-transparent bg-muted text-muted-foreground',
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
  const [lockedPages, setLockedPages] = useState<string[]>([])
  const [lockedFeatures, setLockedFeatures] = useState<string[]>([])
  const [locksLoading, setLocksLoading] = useState(false)
  const [lockFilter, setLockFilter] = useState('')
  const [expandedRoutes, setExpandedRoutes] = useState<Set<string>>(new Set())
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'platform' | 'organization' | 'user'>('all')

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

  const fetchLockedPages = useCallback(async () => {
    setLocksLoading(true)
    try {
      const res = await fetch('/api/platform/locked-pages')
      if (res.ok) {
        const data = await res.json()
        setLockedPages(Array.isArray(data?.locked_pages) ? data.locked_pages : [])
        setLockedFeatures(Array.isArray(data?.locked_features) ? data.locked_features : [])
      }
    } catch { /* ignore */ }
    finally { setLocksLoading(false) }
  }, [])

  useEffect(() => { fetchLockedPages() }, [fetchLockedPages])

  const togglePageLock = useCallback(async (route: string) => {
    const isLocked = lockedPages.some(r => r === route)
    const next = isLocked
      ? lockedPages.filter(r => r !== route)
      : [...lockedPages, route]
    setLockedPages(next)
    try {
      const res = await csrfFetch('/api/admin/platform-settings', {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locked_pages: next }),
      })
      if (res.ok) {
        addToast({ type: 'success', title: isLocked ? 'Unlocked' : 'Locked', message: `${ROUTE_LABELS[route] || route} is now ${isLocked ? 'unlocked' : 'locked'}` })
      } else {
        addToast({ type: 'error', title: 'Failed', message: 'Could not update page lock' })
        setLockedPages(lockedPages)
      }
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Network error' })
      setLockedPages(lockedPages)
    }
  }, [lockedPages, addToast])

  const toggleFeatureLock = useCallback(async (featureId: string) => {
    const isLocked = lockedFeatures.includes(featureId)
    const next = isLocked
      ? lockedFeatures.filter(f => f !== featureId)
      : [...lockedFeatures, featureId]
    setLockedFeatures(next)
    try {
      const res = await csrfFetch('/api/admin/platform-settings', {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locked_features: next }),
      })
      if (!res.ok) {
        setLockedFeatures(lockedFeatures)
      }
    } catch {
      setLockedFeatures(lockedFeatures)
    }
  }, [lockedFeatures])

  const allFeatures = useMemo(() => getAllFeatureLocks(), [])

  const pageLockRoutes = useMemo(() => buildPermissionMatrix(), [])

  const treeData = useMemo(() => {
    const featuresByRoute: Record<string, typeof allFeatures> = {}
    for (const f of allFeatures) {
      (featuresByRoute[f.parentRoute] ??= []).push(f)
    }
    return pageLockRoutes.map(p => ({ ...p, subFeatures: featuresByRoute[p.route] || [] }))
  }, [pageLockRoutes, allFeatures])

  const routeCategoryMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of pageLockRoutes) {
      map.set(p.route, p.category)
    }
    return map
  }, [pageLockRoutes])

  const currentRole = useMemo(() => roles.find(r => r.role === selectedRole), [roles, selectedRole])

  const togglePerm = (resource: string, action: string) => {
    setEditing((prev: Record<string, any>) => {
      const stored = currentRole?.permissions.find(p => p.resource === resource)?.actions || []
      const current = prev[resource] !== undefined ? prev[resource] : stored
      const next = current.includes(action as PermissionAction)
        ? current.filter((a: string) => a !== action)
        : action === 'manage' ? ['manage'] : [...current.filter((a: string) => a !== 'manage'), action]
      return { ...prev, [resource]: next }
    })
  }

  const save = async (reseed?: boolean) => {
    if (!currentRole && !reseed) return
    setSaving(true)
    try {
      const permissions = reseed ? undefined : allResources.map(r => {
        const stored = currentRole!.permissions.find(p => p.resource === r.resource)
        const edited = editing[r.resource] !== undefined ? editing[r.resource] : null
        return {
          resource: r.resource,
          resourceType: r.resourceType,
          label: r.label,
          actions: edited !== null ? edited : (stored?.actions || r.actions || []),
          edited: edited !== null,
        }
      })
      const body = reseed
        ? { reseed: true }
        : { ...currentRole, permissions }

      const res = await csrfFetch('/api/admin/permissions/roles', {
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
    let result = allResources
    if (categoryFilter !== 'all') {
      result = result.filter(r => routeCategoryMap.get(r.resource) === categoryFilter)
    }
    if (filter) {
      const q = filter.toLowerCase()
      result = result.filter(r => (r.resource || '').toLowerCase().includes(q) || (r.label || '').toLowerCase().includes(q))
    }
    return result
  }, [allResources, filter, categoryFilter, routeCategoryMap])

  // Stats
  const pageCount = allResources.filter(r => r.resourceType === 'page').length
  const entityCount = allResources.filter(r => r.resourceType === 'entity').length
  const newCount = allResources.filter(r => !currentRole?.permissions.find(p => p.resource === r.resource)).length
  const changedCount = Object.keys(editing).length

  if (!gate.ready) return null
  if (loading) return (
    <div className="space-y-6">
      <SkeletonCard />
      <SkeletonStats />
      <SkeletonTable rows={8} />
    </div>
  )

  return (
    <div className="space-y-6">
      <PageHeader
        illustration="team"
        icon={<Shield />}
        title="Roles and permissions"
        description={<>{autoSeeded ? `${roles.length} roles · ${allResources.length} resources` : 'Loading...'} · Changes take effect immediately.</>}
        actions={
          <>
            <Button onClick={fetchRoles} variant="outline" size="sm"><RefreshCw className="h-4 w-4 mr-1" />Refresh</Button>
            <Button onClick={() => save(true)} disabled={saving} variant="outline" size="sm"><Database className="h-4 w-4 mr-1" />Reseed all</Button>
          </>
        }
        className="mb-0"
      />

      {/* Status */}
      {autoSeeded ? (
        <Card className="rounded-2xl p-3 border-green-500/20 bg-green-500/5 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          <span className="text-sm text-green-700 dark:text-green-300">Roles loaded: {roles.length} roles, {pageCount} pages and {entityCount} data types, discovered automatically.</span>
        </Card>
      ) : (
        <Card className="rounded-2xl p-3 border-amber-500/20 bg-amber-500/5 flex items-center gap-2">
          <Loader2 className="h-4 w-4 text-amber-500 animate-spin" />
          <span className="text-sm text-amber-700 dark:text-amber-300">Setting up roles. They are created automatically on first load.</span>
        </Card>
      )}

      {/* Tabs */}
      <Tabs defaultValue="permissions" className="space-y-6">
        <TabsList>
          <TabsTrigger value="permissions" className="gap-1.5"><Key className="h-3.5 w-3.5" />Permissions</TabsTrigger>
          <TabsTrigger value="locks" className="gap-1.5"><Lock className="h-3.5 w-3.5" />Page locks</TabsTrigger>
        </TabsList>

        <TabsContent value="permissions" className="space-y-6">
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {(['read','create','update','delete'] as PermissionAction[]).map(action => {
          const perms = currentRole?.permissions || []
          const count = perms.filter(p => p.actions.includes('manage') || p.actions.includes(action)).length
          return <StatCard key={action} label={<span className="capitalize">{action}</span>} value={count} hint="resources allowed" />
        })}
      </div>

      {/* Search + category filter */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm"><Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" /><Input placeholder="Filter resources..." value={filter} onChange={e => setFilter(e.target.value)} className="pl-7 h-8 text-xs" /></div>
        <div className="flex items-center gap-1.5">
          {([['all', 'All'], ['platform', 'Platform'], ['organization', 'Organization'], ['user', 'User']] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setCategoryFilter(key)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                categoryFilter === key
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Permission grid */}
      <Panel className="overflow-hidden p-0">
        <div className="max-h-[60vh] overflow-y-auto overflow-x-auto">
          <table className="w-full min-w-[560px] md:min-w-0 text-xs">
            <thead className="sticky top-0 bg-muted z-10">
              <tr className="border-b border-border/60">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground w-[40%]">Resource</th>
                <th className="px-1 py-2 text-center font-medium text-muted-foreground w-[12%]">Read</th>
                <th className="px-1 py-2 text-center font-medium text-muted-foreground w-[12%]">Create</th>
                <th className="px-1 py-2 text-center font-medium text-muted-foreground w-[12%]">Update</th>
                <th className="px-1 py-2 text-center font-medium text-muted-foreground w-[12%]">Delete</th>
                <th className="px-1 py-2 text-center font-medium text-muted-foreground w-[12%]">Manage</th>
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
                        <span className="font-mono text-[11px] text-foreground truncate max-w-70" title={r.resource}>{r.label || r.resource.split('/').pop() || r.resource}</span>
                        {isNew && <Badge className="text-[9px] bg-amber-500/20 text-amber-700 dark:text-amber-400">new</Badge>}
                      </div>
                    </td>
                    {(['read','create','update','delete','manage'] as PermissionAction[]).map(action => (
                      <td key={action} className="px-1 py-1.5 text-center">
                        <button
                          onClick={() => togglePerm(r.resource, action)}
                          aria-label={`${action} ${r.label || r.resource}`}
                          className={`inline-flex h-9 w-9 sm:h-6 sm:w-6 items-center justify-center rounded border text-[10px] font-medium transition-all ${
                            actions.includes(action) || (action !== 'manage' && actions.includes('manage'))
                              ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                              : 'border-border text-muted-foreground/40 hover:border-primary/40 hover:text-muted-foreground'
                          }`}
                        >{actions.includes(action) || (action !== 'manage' && actions.includes('manage')) ? '✓' : ''}</button>
                      </td>
                    ))}
                  </tr>
                )
              })}
              {filteredResources.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground text-xs">No resources match this filter. Try a different word or category.</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Legend */}
      <Panel className="p-5 text-xs text-muted-foreground space-y-2">
        <p><strong className="text-foreground">How it works:</strong> Resources auto-discover from <code className="bg-muted px-1 rounded">page-permissions.ts</code> + API entities. Toggle actions per role. Changes → MongoDB → enforced by <code className="bg-muted px-1 rounded">route-auth.ts</code> and <code className="bg-muted px-1 rounded">usePageGuard()</code>.</p>
        <p><strong className="text-foreground">Adding a new page:</strong> Create page.tsx → add route to <code className="bg-muted px-1 rounded">page-permissions.ts</code> → deploy → open this page → new resource appears with "new" badge → assign permissions → done. No RBAC editing needed.</p>
        <p className="flex items-center gap-2"><span className="inline-flex h-3 w-3 rounded-full bg-primary" /><code className="bg-muted px-1 rounded">manage</code> grants all CRUD actions. Toggle per role to override.</p>
      </Panel>
        </TabsContent>

        <TabsContent value="locks" className="space-y-6">
          <Card className="rounded-2xl p-4 border-amber-500/20 bg-amber-500/5 flex items-center gap-2">
            <Lock className="h-4 w-4 text-amber-600" />
            <span className="text-sm text-amber-700 dark:text-amber-300">
              Lock a page to show a &quot;Coming Soon&quot; screen to all non-superadmin users.
              Pages with sub-features (like scanner modes, tabs) can be expanded to lock individual features.
            </span>
          </Card>

          {locksLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />Loading page locks...
            </div>
          ) : (
            <>
              <div className="relative max-w-sm"><Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" /><Input placeholder="Filter pages..." value={lockFilter} onChange={e => setLockFilter(e.target.value)} className="pl-7 h-8 text-xs" /></div>
            <Panel className="overflow-hidden p-0">
              <div className="max-h-[60vh] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted z-10">
                    <tr className="border-b border-border/60">
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground w-[45%]">Page or feature</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground w-[20%]">Route or ID</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground w-[15%]">Required role</th>
                      <th className="px-3 py-2 text-center font-medium text-muted-foreground w-[20%]">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/20">
                    {treeData.filter(p => {
                      if (!lockFilter) return true
                      const q = lockFilter.toLowerCase()
                      const matchRoute = (p.label || '').toLowerCase().includes(q) || p.route.toLowerCase().includes(q)
                      const matchFeature = p.subFeatures.some(f => f.label.toLowerCase().includes(q) || f.id.toLowerCase().includes(q))
                      return matchRoute || matchFeature
                    }).map(p => {
                      const isRouteLocked = lockedPages.some(r => r === p.route)
                      const hasSubs = p.subFeatures.length > 0
                      const expanded = expandedRoutes.has(p.route)
                      return (
                        <Fragment key={p.route}>
                          <tr className={`hover:bg-muted/20 transition-colors ${isRouteLocked ? 'bg-orange-500/5' : ''}`}>
                            <td className="px-3 py-2">
                              {hasSubs ? (
                                <button
                                  onClick={() => {
                                    const next = new Set(expandedRoutes)
                                    if (expanded) next.delete(p.route)
                                    else next.add(p.route)
                                    setExpandedRoutes(next)
                                  }}
                                  className="inline-flex items-center gap-1.5 text-foreground"
                                >
                                  {expanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
                                  <span className="font-medium text-[11px]">{p.label}</span>
                                </button>
                              ) : (
                                <span className="font-medium text-foreground text-[11px] ml-5">{p.label}</span>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <code className="text-[10px] text-muted-foreground bg-muted px-1 rounded">{p.route}</code>
                            </td>
                            <td className="px-3 py-2">
                              <Badge variant="outline" className={`text-[9px] ${ROLE_COLORS[p.requiredRole] || ''}`}>
                                {p.requiredRole}
                              </Badge>
                            </td>
                            <td className="px-3 py-2 text-center">
                              <button
                                onClick={() => togglePageLock(p.route)}
                                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[10px] font-medium transition-all ${
                                  isRouteLocked
                                    ? 'bg-orange-100 text-orange-700 hover:bg-orange-200 dark:bg-orange-900/30 dark:text-orange-400'
                                    : 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400'
                                }`}
                              >
                                {isRouteLocked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                                {isRouteLocked ? 'Locked' : 'Unlocked'}
                              </button>
                            </td>
                          </tr>
                          {expanded && hasSubs && p.subFeatures.map(f => {
                            const isFeatureLocked = lockedFeatures.includes(f.id)
                            return (
                              <tr key={f.id} className={`${isFeatureLocked ? 'bg-orange-500/5' : ''}`}>
                                <td className="px-3 py-2 pl-8">
                                  <div className="flex items-center gap-2">
                                    <span className="text-muted-foreground/40 text-[10px]">└─</span>
                                    <span className="text-[11px] text-foreground/80">{f.label}</span>
                                  </div>
                                </td>
                                <td className="px-3 py-2">
                                  <code className="text-[10px] text-muted-foreground/60 bg-muted px-1 rounded">{f.id}</code>
                                </td>
                                <td className="px-3 py-2">
                                  <span className="text-[9px] text-muted-foreground/50">—</span>
                                </td>
                                <td className="px-3 py-2 text-center">
                                  <button
                                    onClick={() => toggleFeatureLock(f.id)}
                                    className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[10px] font-medium transition-all ${
                                      isFeatureLocked
                                        ? 'bg-orange-100 text-orange-700 hover:bg-orange-200 dark:bg-orange-900/30 dark:text-orange-400'
                                        : 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400'
                                    }`}
                                  >
                                    {isFeatureLocked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                                    {isFeatureLocked ? 'Locked' : 'Unlocked'}
                                  </button>
                                </td>
                              </tr>
                            )
                          })}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>
            </>
          )}
        </TabsContent>


      </Tabs>
    </div>
  )
}


