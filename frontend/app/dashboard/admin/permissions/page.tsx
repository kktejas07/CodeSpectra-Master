'use client'

import { useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Shield, Search, Lock, Users, Building2, Globe, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { buildPermissionMatrix, ROUTE_LABELS, ADMIN_ONLY_ROUTES, TENANT_ADMIN_ROUTES, ALL_USER_ROUTES } from '@/lib/page-permissions'
import { SUPERADMIN_PAGES, TENANT_ADMIN_PAGES, USER_PAGES } from '@/lib/rbac'

const ROLE_COLORS: Record<string, string> = {
  superadmin: 'bg-red-500/20 text-red-700 dark:text-red-400',
  tenant_admin: 'bg-blue-500/20 text-blue-700 dark:text-blue-400',
  user: 'bg-green-500/20 text-green-700 dark:text-green-400',
}

const ROLE_LABELS: Record<string, string> = {
  superadmin: 'Platform Admin',
  tenant_admin: 'Org Admin',
  user: 'All Users',
}

export default function PermissionsPage() {
  const gate = usePageGuard('superadmin')
  const [filter, setFilter] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')

  const matrix = useMemo(() => buildPermissionMatrix(), [])

  const filtered = useMemo(() => {
    let items = matrix
    if (roleFilter !== 'all') {
      items = items.filter((p) => p.requiredRole === roleFilter)
    }
    if (filter) {
      const q = filter.toLowerCase()
      items = items.filter(
        (p) => p.route.toLowerCase().includes(q) || p.label.toLowerCase().includes(q)
      )
    }
    return items
  }, [matrix, filter, roleFilter])

  const missingFromRbac = useMemo(() => {
    const missing: string[] = []
    for (const p of matrix) {
      if (p.requiredRole === 'superadmin' && !SUPERADMIN_PAGES.includes(p.route)) {
        missing.push(`${p.route} (missing from SUPERADMIN_PAGES)`)
      }
      if (p.requiredRole === 'tenant_admin' && !TENANT_ADMIN_PAGES.includes(p.route)) {
        missing.push(`${p.route} (missing from TENANT_ADMIN_PAGES)`)
      }
      if (p.requiredRole === 'user' && !USER_PAGES.includes(p.route)) {
        missing.push(`${p.route} (missing from USER_PAGES)`)
      }
    }
    return missing
  }, [matrix])

  const superadminCount = matrix.filter((p) => p.requiredRole === 'superadmin').length
  const tenantCount = matrix.filter((p) => p.requiredRole === 'tenant_admin').length
  const userCount = matrix.filter((p) => p.requiredRole === 'user').length

  if (!gate.ready) return <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading…</div>

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Shield className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-foreground">Permissions Reference</h1>
          <p className="text-muted-foreground mt-1">
            Single source of truth for all page access levels. Edit in <code className="text-xs bg-muted px-1 rounded">lib/page-permissions.ts</code> and <code className="text-xs bg-muted px-1 rounded">lib/rbac.ts</code>.
          </p>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4 border-red-500/20 bg-red-500/5">
          <div className="flex items-center gap-3"><Lock className="h-5 w-5 text-red-500" /><div><p className="text-xs text-muted-foreground">Superadmin Only</p><p className="text-2xl font-bold text-foreground">{superadminCount}</p></div></div>
        </Card>
        <Card className="p-4 border-blue-500/20 bg-blue-500/5">
          <div className="flex items-center gap-3"><Building2 className="h-5 w-5 text-blue-500" /><div><p className="text-xs text-muted-foreground">Org Admin & Above</p><p className="text-2xl font-bold text-foreground">{tenantCount}</p></div></div>
        </Card>
        <Card className="p-4 border-green-500/20 bg-green-500/5">
          <div className="flex items-center gap-3"><Users className="h-5 w-5 text-green-500" /><div><p className="text-xs text-muted-foreground">All Users</p><p className="text-2xl font-bold text-foreground">{userCount}</p></div></div>
        </Card>
      </div>

      {/* RBAC gaps or success */}
      {missingFromRbac.length > 0 ? (
        <Card className="p-4 border-amber-500/30 bg-amber-500/5">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">RBAC Gaps ({missingFromRbac.length})</p>
          </div>
          <div className="space-y-1">
            {missingFromRbac.map((m) => <p key={m} className="text-xs text-muted-foreground font-mono">{m}</p>)}
          </div>
        </Card>
      ) : (
        <Card className="p-4 border-green-500/30 bg-green-500/5">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <p className="text-sm font-semibold text-green-600 dark:text-green-400">All RBAC entries synced — no gaps detected.</p>
          </div>
        </Card>
      )}

      {/* Where to manage permissions */}
      <Card className="p-5 border-border/60">
        <h3 className="font-semibold text-foreground mb-3">How to manage permissions</h3>
        <div className="grid gap-4 md:grid-cols-2 text-sm">
          <div className="space-y-2">
            <p className="font-medium text-foreground">1. Add to registry</p>
            <p className="text-muted-foreground text-xs">
              Edit <code className="text-xs bg-muted px-1 rounded">lib/page-permissions.ts</code> — add the route to{' '}
              <code>ADMIN_ONLY_ROUTES</code>, <code>TENANT_ADMIN_ROUTES</code>, or <code>ALL_USER_ROUTES</code>.
            </p>
          </div>
          <div className="space-y-2">
            <p className="font-medium text-foreground">2. Sync RBAC</p>
            <p className="text-muted-foreground text-xs">
              Edit <code className="text-xs bg-muted px-1 rounded">lib/rbac.ts</code> — add the route to{' '}
              <code>SUPERADMIN_PAGES</code>, <code>TENANT_ADMIN_PAGES</code>, or <code>USER_PAGES</code>.
            </p>
          </div>
          <div className="space-y-2">
            <p className="font-medium text-foreground">3. Add page guard</p>
            <p className="text-muted-foreground text-xs">
              In your page component: <code className="text-xs bg-muted px-1 rounded">const gate = usePageGuard('superadmin')</code>
            </p>
          </div>
          <div className="space-y-2">
            <p className="font-medium text-foreground">4. Verify here</p>
            <p className="text-muted-foreground text-xs">
              Refresh this page — it auto-detects gaps between the registry and RBAC lists.
            </p>
          </div>
        </div>
      </Card>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="Filter pages..." value={filter} onChange={(e) => setFilter(e.target.value)} className="pl-9" /></div>
        <Select value={roleFilter} onValueChange={setRoleFilter}><SelectTrigger className="w-[180px]"><SelectValue placeholder="All roles" /></SelectTrigger><SelectContent><SelectItem value="all">All roles</SelectItem><SelectItem value="superadmin">Platform Admin</SelectItem><SelectItem value="tenant_admin">Org Admin</SelectItem><SelectItem value="user">All Users</SelectItem></SelectContent></Select>
      </div>

      {/* Table */}
      <Card className="overflow-hidden border-border/60">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border/60 bg-muted/30"><th className="px-4 py-3 text-left font-medium text-muted-foreground">Route</th><th className="px-4 py-3 text-left font-medium text-muted-foreground">Page</th><th className="px-4 py-3 text-left font-medium text-muted-foreground">Category</th><th className="px-4 py-3 text-left font-medium text-muted-foreground">Required Role</th><th className="px-4 py-3 text-left font-medium text-muted-foreground">RBAC Status</th></tr></thead>
            <tbody className="divide-y divide-border/40">
              {filtered.map((p) => (
                <tr key={p.route} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{p.route}</td>
                  <td className="px-4 py-2.5 text-foreground text-xs">{p.label}</td>
                  <td className="px-4 py-2.5"><Badge variant="outline" className="text-[10px] capitalize">{p.category}</Badge></td>
                  <td className="px-4 py-2.5"><Badge className={`text-[10px] ${ROLE_COLORS[p.requiredRole] || ''}`}>{ROLE_LABELS[p.requiredRole]}</Badge></td>
                  <td className="px-4 py-2.5">
                    <div className="flex gap-1.5">
                      <span title="Superadmin" className={`inline-block h-2.5 w-2.5 rounded-full ${SUPERADMIN_PAGES.includes(p.route) ? (p.requiredRole === 'superadmin' ? 'bg-red-500' : 'bg-amber-500') : 'bg-muted-foreground/20'}`} />
                      <span title="Org Admin" className={`inline-block h-2.5 w-2.5 rounded-full ${TENANT_ADMIN_PAGES.includes(p.route) ? (p.requiredRole === 'tenant_admin' ? 'bg-blue-500' : 'bg-amber-500') : 'bg-muted-foreground/20'}`} />
                      <span title="User" className={`inline-block h-2.5 w-2.5 rounded-full ${USER_PAGES.includes(p.route) ? (p.requiredRole === 'user' ? 'bg-green-500' : 'bg-amber-500') : 'bg-muted-foreground/20'}`} />
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No pages match your filters.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Legend */}
      <Card className="p-4 border-border/60">
        <p className="text-sm font-medium text-foreground mb-3">Dot Legend</p>
        <div className="grid grid-cols-3 gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-red-500" /><span>Red = Platform Admin</span></div>
          <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-blue-500" /><span>Blue = Org Admin</span></div>
          <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-green-500" /><span>Green = All Users</span></div>
          <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-amber-500" /><span>Amber = Mismatch (wrong role in RBAC)</span></div>
          <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-muted-foreground/20" /><span>Gray = Not in RBAC list</span></div>
        </div>
      </Card>
    </div>
  )
}
