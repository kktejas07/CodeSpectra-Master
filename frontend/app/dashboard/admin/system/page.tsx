'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  Users, BarChart3, Shield, Activity, Server, Lock, Settings,
  Cpu, HardDrive, MemoryStick, Container, RefreshCw, Trash2,
  Terminal, Zap, Clock
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DASHBOARD_ROUTES } from '@/lib/rbac'
import { AnalyticsDashboard, type AnalyticsDashboardProps } from '@/components/admin/analytics-dashboard'
import { AuditLogsViewer } from '@/components/admin/audit-logs-viewer'
import { useRoleGate } from '@/lib/use-role-gate'
import { useToast } from '@/lib/toast-context'

const emptyCharts: AnalyticsDashboardProps = {
  userGrowth: [],
  usersByRole: [],
  activityTrend: [],
}

interface ServerStats {
  cpu: { model: string; cores: number; loadAvg1: number; loadAvg5: number; loadAvg15: number; usagePct: number }
  memory: { total: number; used: number; free: number; usagePct: number }
  disk: { total: number; used: number; free: number; usagePct: number }
  uptime: number
  containers: { count: number; list: Array<{ name: string; status: string; cpu: string; memory: string }> }
  piston: { status: string; runtimes: number; queue: number }
  node: { heapUsed: number; heapTotal: number; rss: number }
}

function fmtBytes(b: number): string {
  if (b >= 1e9) return (b / 1e9).toFixed(1) + ' GB'
  if (b >= 1e6) return (b / 1e6).toFixed(1) + ' MB'
  if (b >= 1e3) return (b / 1e3).toFixed(1) + ' KB'
  return b + ' B'
}

function fmtUptime(s: number): string {
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  return `${d}d ${h}h ${m}m`
}

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-2 w-full rounded-full bg-muted/50">
      <div
        className={`h-2 rounded-full transition-all duration-500 ${color}`}
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
    </div>
  )
}

export default function SystemAdminDashboard() {
  const gate = useRoleGate({ require: 'superadmin' })
  const addToast = useToast()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ totalUsers: 0, activeUsers: 0, superadmins: 0, admins: 0 })
  const [charts, setCharts] = useState<AnalyticsDashboardProps>(emptyCharts)
  const [summary, setSummary] =
    useState<NonNullable<AnalyticsDashboardProps['summary']> | undefined>()
  const [server, setServer] = useState<ServerStats | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [clearing, setClearing] = useState<string | null>(null)

  const fetchMetrics = useCallback(async () => {
    const res = await fetch('/api/admin/metrics', { credentials: 'include' })
    const json = await res.json().catch(() => ({}))
    if (res.ok) {
      setStats({
        totalUsers: json.totalUsers ?? 0,
        activeUsers: json.activeNow ?? 0,
        superadmins: json.superadmins ?? 0,
        admins: json.tenantAdmins ?? 0,
      })
      setCharts({
        userGrowth: json.userGrowth ?? [],
        usersByRole: json.usersByRole ?? [],
        activityTrend: json.activityTrend ?? [],
      })
      setSummary({
        totalUsers: json.totalUsers ?? 0,
        activeNow: json.activeNow ?? 0,
        challengesCount: json.challengesCount ?? 0,
        submissionsCount: json.submissionsCount ?? 0,
      })
    }
  }, [])

  const fetchServerStats = useCallback(async () => {
    setRefreshing(true)
    try {
      const res = await fetch('/api/admin/system/stats', { credentials: 'include' })
      const json = await res.json()
      if (res.ok) setServer(json)
    } catch { /* ignore */ }
    finally { setRefreshing(false) }
  }, [])

  const clearCache = useCallback(async (type: string) => {
    setClearing(type)
    try {
      const res = await fetch('/api/admin/system/cache', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      })
      const json = await res.json().catch(() => ({}))
      if (res.ok) {
        addToast({ type: 'success', title: `Cache cleared`, message: json.message || `${type} cache cleared` })
        fetchServerStats()
      } else {
        addToast({ type: 'error', title: 'Failed', message: json.error || 'Could not clear cache' })
      }
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Network error' })
    } finally { setClearing(null) }
  }, [addToast, fetchServerStats])

  useEffect(() => {
    if (!gate.ready) return
    let cancelled = false
    ; (async () => {
      await Promise.all([fetchMetrics(), fetchServerStats()])
      if (!cancelled) setLoading(false)
    })()
    const interval = setInterval(fetchServerStats, 30000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [gate.ready, fetchMetrics, fetchServerStats])

  const p = DASHBOARD_ROUTES.platform

  if (!gate.ready || loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        Loading…
      </div>
    )
  }

  return (
    <div className="space-y-8" data-testid="admin-system-page">
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Server className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Operations overview</h1>
            <p className="text-muted-foreground">
              Live server health, platform metrics, and audit access.
            </p>
          </div>
        </div>
      </div>

      {/* Server Health */}
      {server && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <Cpu className="h-5 w-5 text-primary" /> Server health
              <Badge variant="outline" className="ml-2 text-[10px]">
                auto-refresh 30s
              </Badge>
            </h2>
            <Button variant="outline" size="sm" onClick={fetchServerStats} disabled={refreshing}>
              <RefreshCw className={`mr-1 h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {/* CPU */}
            <Card className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">CPU</p>
                <Cpu className="h-5 w-5 text-blue-400" />
              </div>
              <p className="text-2xl font-bold text-foreground">{server.cpu.usagePct}%</p>
              <ProgressBar pct={server.cpu.usagePct} color="bg-blue-500" />
              <p className="text-[11px] text-muted-foreground">
                {server.cpu.cores} cores · load {server.cpu.loadAvg1.toFixed(1)}
              </p>
            </Card>

            {/* RAM */}
            <Card className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">RAM</p>
                <MemoryStick className="h-5 w-5 text-green-400" />
              </div>
              <p className="text-2xl font-bold text-foreground">{server.memory.usagePct}%</p>
              <ProgressBar pct={server.memory.usagePct} color="bg-green-500" />
              <p className="text-[11px] text-muted-foreground">
                {fmtBytes(server.memory.used)} / {fmtBytes(server.memory.total)}
              </p>
            </Card>

            {/* Disk */}
            <Card className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Disk</p>
                <HardDrive className="h-5 w-5 text-yellow-400" />
              </div>
              <p className="text-2xl font-bold text-foreground">{server.disk.usagePct}%</p>
              <ProgressBar pct={server.disk.usagePct} color="bg-yellow-500" />
              <p className="text-[11px] text-muted-foreground">
                {fmtBytes(server.disk.free)} free of {fmtBytes(server.disk.total)}
              </p>
            </Card>

            {/* Containers */}
            <Card className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Containers</p>
                <Container className="h-5 w-5 text-purple-400" />
              </div>
              <p className="text-2xl font-bold text-foreground">{server.containers.count}</p>
              <p className="text-[11px] text-muted-foreground">
                Piston: <Badge variant={server.piston.status === 'connected' ? 'default' : 'destructive'} className="text-[10px] px-1 py-0">
                  {server.piston.status}
                </Badge>
                {' '}· {server.piston.runtimes} langs
              </p>
              <p className="text-[11px] text-muted-foreground">
                <Clock className="inline h-3 w-3 mr-1" /> Up {fmtUptime(server.uptime)}
              </p>
            </Card>
          </div>

          {/* Container list + Cache management row */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Container list */}
            <Card className="p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Terminal className="h-4 w-4 text-muted-foreground" /> Running containers
                </h3>
                <span className="text-[11px] text-muted-foreground">{server.containers.count} total</span>
              </div>
              <div className="max-h-[300px] overflow-y-auto space-y-2">
                {server.containers.list.slice(0, 12).map((c) => (
                  <div key={c.name} className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2 text-xs">
                    <span className="font-mono truncate max-w-[200px]" title={c.name}>{c.name}</span>
                    <div className="flex items-center gap-3 text-muted-foreground">
                      <span>{c.cpu}</span>
                      <span>{c.memory}</span>
                      <Badge variant="outline" className="text-[9px] px-1">
                        {c.status.includes('Up') ? 'Up' : c.status.slice(0, 10)}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Cache management */}
            <Card className="p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Zap className="h-4 w-4 text-muted-foreground" /> Maintenance
                </h3>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2">
                  <div>
                    <p className="text-xs font-medium text-foreground">Next.js build cache</p>
                    <p className="text-[10px] text-muted-foreground">Clear ISR cache & .next artifacts</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={clearing === 'next'}
                    onClick={() => clearCache('next')}
                  >
                    {clearing === 'next' ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                  </Button>
                </div>
                <div className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2">
                  <div>
                    <p className="text-xs font-medium text-foreground">Server secrets cache</p>
                    <p className="text-[10px] text-muted-foreground">Invalidate in-memory secrets</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={clearing === 'secrets'}
                    onClick={() => clearCache('secrets')}
                  >
                    {clearing === 'secrets' ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                  </Button>
                </div>
                <div className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2">
                  <div>
                    <p className="text-xs font-medium text-foreground">Piston restart</p>
                    <p className="text-[10px] text-muted-foreground">Restart Piston container (re-index packages)</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={clearing === 'piston'}
                    onClick={() => clearCache('piston')}
                  >
                    {clearing === 'piston' ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                  </Button>
                </div>
                <div className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2">
                  <div>
                    <p className="text-xs font-medium text-foreground">System cleanup</p>
                    <p className="text-[10px] text-muted-foreground">Docker prune + report memory usage</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={clearing === 'system'}
                    onClick={() => clearCache('system')}
                  >
                    {clearing === 'system' ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                  </Button>
                </div>
                <div className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2">
                  <div>
                    <p className="text-xs font-medium text-foreground">Docker system prune</p>
                    <p className="text-[10px] text-muted-foreground">Remove unused images, containers, volumes</p>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={clearing === 'docker'}
                    onClick={() => clearCache('docker')}
                  >
                    {clearing === 'docker' ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Kpi label="Total users" value={stats.totalUsers} icon={Users} />
        <Kpi label="Active (15m)" value={stats.activeUsers} icon={Activity} />
        <Kpi label="Platform admins" value={stats.superadmins} icon={Shield} />
        <Kpi label="Org admins" value={stats.admins} icon={BarChart3} />
      </div>

      <div className="rounded-lg border border-border/40 bg-card p-8 space-y-6">
        <h2 className="flex items-center gap-3 text-xl font-bold text-foreground">
          <Lock className="h-5 w-5 text-primary" /> Quick links
        </h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <QL href={p.users} icon={Users} label="Users & roles" />
          <QL href={p.analytics} icon={BarChart3} label="Insights" />
          <QL href={p.settings} icon={Settings} label="Platform settings" />
          <QL href={p.auditLogs} icon={Activity} label="Audit logs" />
        </div>
      </div>

      <AnalyticsDashboard {...charts} summary={summary} />
      <AuditLogsViewer />
    </div>
  )
}

function Kpi({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: number
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <Card className="p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="mb-2 text-sm text-muted-foreground">{label}</p>
          <p className="text-3xl font-bold text-foreground">{value}</p>
        </div>
        <Icon className="h-8 w-8 text-primary/40" />
      </div>
    </Card>
  )
}

function QL({
  href,
  icon: Icon,
  label,
}: {
  href: string
  icon: React.ComponentType<{ className?: string }>
  label: string
}) {
  return (
    <Button className="h-12 justify-start" asChild variant="secondary">
      <Link href={href}>
        <Icon className="mr-3 h-5 w-5" /> {label}
      </Link>
    </Button>
  )
}
