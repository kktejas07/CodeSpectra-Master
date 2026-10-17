'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  Users, BarChart3, Shield, Activity, Server, Lock, Settings,
  Cpu, HardDrive, MemoryStick, Container, RefreshCw, Trash2,
  Terminal, Zap, Clock, Database, ArrowRight, Gauge, Timer, CircleSlash,
  Layout, MousePointer, CheckCircle2, TriangleAlert, Info
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DASHBOARD_ROUTES } from '@/lib/rbac'
import { AnalyticsDashboard, type AnalyticsDashboardProps } from '@/components/admin/analytics-dashboard'
import { AuditLogsViewer } from '@/components/admin/audit-logs-viewer'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { useTour, autoPlayPageTour, type TourStep } from '@/components/tour/tour-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { SkeletonList, SkeletonStats, SkeletonText } from '@/components/ui/skeleton-boneyard'
import { BentoGrid, StatCard } from '@/components/app/page-kit'
import { AppBanner, BannerChip, bannerBtnPrimary, bannerBtnSecondary, Illustration } from '@/components/visuals'
import { EmptyState } from '@/components/ui/empty-state'

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
  containers: { available: boolean; count: number; list: Array<{ name: string; status: string; cpu: string; memory: string }> }
  piston: { status: string; runtimes: number; queue: number }
  node: { heapUsed: number; heapTotal: number; rss: number }
}

interface RedisStatus {
  configured: boolean
  connected: boolean
  mode: 'redis' | 'upstash-rest' | null
  latencyMs?: number
  memoryUsedMb?: number
  connectedClients?: number
  opsPerSec?: number
  uptimeSec?: number
  keyspace?: number
  rateLimitKeys?: { key: string; count: number; ttlSec: number }[]
  error?: string
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
        // High usage reads as a warning regardless of the metric's own colour.
        className={`h-2 rounded-full transition-all duration-500 motion-reduce:transition-none ${pct >= 90 ? 'bg-red-500' : pct >= 75 ? 'bg-amber-500' : color}`}
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
    </div>
  )
}

/* ─── Rate-limit counter decoding (key → readable label) ─────────────────── */

type RateCategory = 'auth' | 'ai' | 'other'

interface RateKeyInfo {
  label: string
  identity: string
  windowLabel: string
  limit?: number
  category: RateCategory
}

const RATE_KEY_RULES: Array<{
  prefix: string
  label: string
  limit?: number
  windowLabel: string
  category: RateCategory
}> = [
  { prefix: 'login:ip:', label: 'Sign-in · per IP', limit: 10, windowLabel: '60s', category: 'auth' },
  { prefix: 'login:email:', label: 'Sign-in · per email', limit: 5, windowLabel: '60s', category: 'auth' },
  { prefix: 'login:fail:', label: 'Failed sign-in · per IP', limit: 3, windowLabel: '10m', category: 'auth' },
  { prefix: 'signup:ip:', label: 'Sign-up · per IP', limit: 3, windowLabel: '1h', category: 'auth' },
  { prefix: 'forgot-pw:ip:', label: 'Forgot password · per IP', limit: 3, windowLabel: '60s', category: 'auth' },
  { prefix: 'reset-pw:ip:', label: 'Password reset · per IP', limit: 5, windowLabel: '60s', category: 'auth' },
  { prefix: 'change-pw:', label: 'Password change · per user', limit: 3, windowLabel: '60s', category: 'auth' },
  { prefix: '2fa:verify:', label: '2FA code · per user', limit: 5, windowLabel: '60s', category: 'auth' },
  { prefix: 'sso:ip:', label: 'SSO · per IP', limit: 10, windowLabel: '60s', category: 'auth' },
  { prefix: 'support:ticket:', label: 'Support ticket · per IP', limit: 3, windowLabel: '60s', category: 'auth' },
  { prefix: 'ai:', label: 'AI requests · per user/IP', limit: 30, windowLabel: '60s', category: 'ai' },
  { prefix: 'generate-fixes:', label: 'Fix generation · per user/IP', limit: 24, windowLabel: '10m', category: 'ai' },
]

function maskIdentity(value: string): string {
  if (!value) return '—'
  if (value === 'unknown') return 'Unknown'
  if (/^u:/i.test(value)) return value
  if (value.includes('@')) return value
  const v4 = value.split('.')
  if (v4.length === 4 && v4.every((n) => /^\d+$/.test(n))) {
    return `${v4[0]}.${v4[1]}.${v4[2]}.***`
  }
  return value.length > 24 ? value.slice(0, 18) + '…' : value
}

function decodeRateKey(key: string): RateKeyInfo {
  let body = key || ''
  if (body.startsWith('codespectra:rl:')) body = body.slice('codespectra:rl:'.length)
  const bucketMatch = body.match(/^(.*):\d{1,15}$/)
  if (bucketMatch) body = bucketMatch[1]

  if (body.startsWith('ai_rate_limit:')) {
    return { label: 'AI router · per IP (backend)', identity: maskIdentity(body.slice('ai_rate_limit:'.length)), windowLabel: '60s', category: 'ai' }
  }
  for (const rule of RATE_KEY_RULES) {
    if (body.startsWith(rule.prefix)) {
      return {
        label: rule.label,
        identity: maskIdentity(body.slice(rule.prefix.length)),
        windowLabel: rule.windowLabel,
        limit: rule.limit,
        category: rule.category,
      }
    }
  }
  return { label: body.replace(/:/g, ' · '), identity: '', windowLabel: '—', category: 'other' }
}

const RATE_CATEGORY_ORDER: Array<{ kind: RateCategory; label: string }> = [
  { kind: 'auth', label: 'Authentication' },
  { kind: 'ai', label: 'AI & scan' },
  { kind: 'other', label: 'Other' },
]

export default function SystemAdminDashboard() {
  const gate = usePageGuard('/dashboard/admin/system')
  const addToast = useToast()
  const { startTour, setTourSeen } = useTour()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ totalUsers: 0, activeUsers: 0, superadmins: 0, admins: 0 })
  const [charts, setCharts] = useState<AnalyticsDashboardProps>(emptyCharts)
  const [summary, setSummary] =
    useState<NonNullable<AnalyticsDashboardProps['summary']> | undefined>()
  const [server, setServer] = useState<ServerStats | null>(null)
  const [redis, setRedis] = useState<RedisStatus | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [clearing, setClearing] = useState<string | null>(null)

  // Web Vitals state
  const [webVitalsRange, setWebVitalsRange] = useState('24h')
  const [webVitals, setWebVitals] = useState<{
    p75: Record<string, number | null>
    countsByMetric: Record<string, number>
    sampleSize: number
  } | null>(null)

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

  const fetchRedisStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/redis/status', { credentials: 'include' })
      const json = await res.json()
      if (res.ok) setRedis(json)
    } catch { /* ignore */ }
  }, [])

  const fetchWebVitals = useCallback(async () => {
    try {
      const q = new URLSearchParams({ range: webVitalsRange, route: 'all' })
      const res = await fetch(`/api/analytics/web-vitals/summary?${q}`, { credentials: 'include' })
      const json = await res.json()
      if (res.ok) setWebVitals(json)
    } catch { /* ignore */ }
  }, [webVitalsRange])

  const copyCmd = (cmd: string) => {
    navigator.clipboard.writeText(cmd).then(() => {
      addToast({ type: 'success', title: 'Copied', message: 'SSH command copied to clipboard' })
    })
  }

  const clearCache = useCallback(async (type: string) => {
    setClearing(type)
    try {
      const res = await csrfFetch('/api/admin/system/cache', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      })
      const json = await res.json().catch(() => ({}))
      if (res.ok) {
        const msg = json.message || `${type} cache cleared`
        addToast({ type: 'success', title: `Cache cleared`, message: msg })
        if (json.dockerCommand) {
          copyCmd(json.dockerCommand)
        }
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
      await Promise.all([fetchMetrics(), fetchServerStats(), fetchRedisStatus(), fetchWebVitals()])
      if (!cancelled) setLoading(false)
    })()
    const interval = setInterval(() => {
      fetchServerStats()
      fetchRedisStatus()
      fetchWebVitals()
    }, 30000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [gate.ready, fetchMetrics, fetchServerStats, fetchRedisStatus])

  const p = DASHBOARD_ROUTES.platform

  // Initialize tour on first visit — placed before the early return below
  // (hooks must not be called conditionally).
  useEffect(() => {
    if (gate.ready) {
      const adminSystemTour: TourStep[] = [
        {
          target: '[data-tour="admin-system-header"]',
          title: 'Platform operations overview',
          description: 'Admin hub for live server health, platform metrics, and audit access.',
          position: 'bottom',
        },
        {
          target: '[data-tour="admin-system-server-health"]',
          title: 'Monitor server health',
          description: 'Monitor CPU, RAM, disk, and containers; refresh or clear caches in Maintenance.',
          position: 'bottom',
        },
        {
          target: '[data-tour="admin-system-redis"]',
          title: 'Check Redis limits',
          description: 'Check Redis mode, latency, and live rate-limit counters before debugging throttles.',
          position: 'bottom',
        },
        {
          target: '[data-tour="admin-system-quick-links"]',
          title: 'Jump to admin sections',
          description: 'Open Users and roles, Insights, Platform settings, or Audit logs quickly.',
          position: 'bottom',
        },
        {
          target: '[data-tour="admin-system-web-vitals"]',
          title: 'Review Web Vitals',
          description: 'Review LCP, INP, and CLS p75 scores by range; refresh for latest samples.',
          position: 'bottom',
        },
        {
          target: '[data-tour="admin-system-analytics"]',
          title: 'Spot trends next',
          description: 'Tip: spot user growth and activity trends here, then check audit logs below.',
          position: 'bottom',
        },
      ];
      autoPlayPageTour('admin-system', adminSystemTour)
    }
  }, [gate.ready, startTour]);

  if (!gate.ready || loading) {
    return (
      <div className="space-y-8">
        <SkeletonText lines={2} />
        <SkeletonStats />
        <SkeletonList count={2} />
      </div>
    )
  }

  return (
    <div className="space-y-8" data-testid="admin-system-page">
      <div data-tour="admin-system-header">
        <AppBanner
          eyebrow="Platform admin"
          title="Operations overview"
          description="Live server health, platform metrics and audit access in one place."
          actions={
            <>
              <Link href={p.users} className={bannerBtnPrimary}>
                <Users className="h-4 w-4" /> Users & roles
              </Link>
              <Link href={p.analytics} className={bannerBtnSecondary}>
                <BarChart3 className="h-4 w-4" /> Insights
              </Link>
              <Link href={p.settings} className={bannerBtnSecondary}>
                <Settings className="h-4 w-4" /> Settings
              </Link>
            </>
          }
          art={
            <div className="flex flex-col items-end gap-3 pr-2">
              <Illustration name="settings" inverse className="w-40" />
              <BannerChip icon={<Server />} label="Server health" sub="Refreshes every 30s" className="mr-10" />
            </div>
          }
        />
      </div>

      <BentoGrid>
        <Kpi label="Total users" value={stats.totalUsers} icon={Users} />
        <Kpi label="Active (15m)" value={stats.activeUsers} icon={Activity} />
        <Kpi label="Platform admins" value={stats.superadmins} icon={Shield} />
        <Kpi label="Org admins" value={stats.admins} icon={BarChart3} />
      </BentoGrid>

      {/* Server Health */}
      {server && (
        <div className="space-y-4" data-tour="admin-system-server-health">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <Cpu className="h-5 w-5 text-primary" /> Server health
              <Badge variant="outline" className="ml-2 text-[11px] font-normal">
                Refreshes every 30s
              </Badge>
            </h2>
            <Button variant="outline" size="sm" onClick={fetchServerStats} disabled={refreshing}>
              <RefreshCw className={`mr-1 h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {/* CPU */}
            <Card className="rounded-3xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">CPU</p>
                <Cpu className="h-5 w-5 text-primary" />
              </div>
              <p className="text-2xl font-bold tabular-nums text-foreground">{server.cpu.usagePct}%</p>
              <ProgressBar pct={server.cpu.usagePct} color="bg-primary" />
              <p className="text-[11px] text-muted-foreground">
                {server.cpu.cores} cores · load {server.cpu.loadAvg1.toFixed(1)}
              </p>
            </Card>

            {/* RAM */}
            <Card className="rounded-3xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">RAM</p>
                <MemoryStick className="h-5 w-5 text-primary" />
              </div>
              <p className="text-2xl font-bold tabular-nums text-foreground">{server.memory.usagePct}%</p>
              <ProgressBar pct={server.memory.usagePct} color="bg-primary" />
              <p className="text-[11px] text-muted-foreground">
                {fmtBytes(server.memory.used)} / {fmtBytes(server.memory.total)}
              </p>
            </Card>

            {/* Disk */}
            <Card className="rounded-3xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Disk</p>
                <HardDrive className="h-5 w-5 text-primary" />
              </div>
              <p className="text-2xl font-bold tabular-nums text-foreground">{server.disk.usagePct}%</p>
              <ProgressBar pct={server.disk.usagePct} color="bg-primary" />
              <p className="text-[11px] text-muted-foreground">
                {fmtBytes(server.disk.free)} free of {fmtBytes(server.disk.total)}
              </p>
            </Card>

            {/* Containers */}
            <Card className="rounded-3xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Containers</p>
                <Container className="h-5 w-5 text-primary" />
              </div>
              <p className="text-2xl font-bold tabular-nums text-foreground">
                {server.containers.available ? server.containers.count : '—'}
              </p>
              {server.containers.available ? (
                <p className="text-[11px] text-muted-foreground">running on this host</p>
              ) : (
                <p className="text-[11px] text-muted-foreground">Docker daemon not reachable</p>
              )}
              <p className="text-[11px] text-muted-foreground">
                Code runner: <Badge variant={server.piston.status === 'connected' ? 'success' : 'destructive'} className="text-[10px] px-1 py-0">
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
            <Card className="rounded-3xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Terminal className="h-4 w-4 text-muted-foreground" /> Running containers
                </h3>
                {server.containers.available ? (
                  <span className="text-[11px] text-muted-foreground">{server.containers.count} total</span>
                ) : null}
              </div>
              {!server.containers.available ? (
                <div className="space-y-2 rounded-md border border-dashed p-4 text-center">
                  <CircleSlash className="h-6 w-6 text-muted-foreground/60" />
                  <p className="text-xs font-medium text-foreground">Docker stats unavailable</p>
                  <p className="text-[11px] text-muted-foreground">
                    The frontend container can't reach the Docker daemon. To enable live container
                    metrics + one-click cleanup, mount the Docker socket on the{' '}
                    <code className="rounded bg-muted px-1">codespectra-frontend</code> service:{' '}
                    <span className="text-foreground">Volumes → add <code className="rounded bg-muted px-1">/var/run/docker.sock</code> → <code className="rounded bg-muted px-1">/var/run/docker.sock</code></span>{' '}
                    and redeploy. The command below shows what the dashboard will then run.
                  </p>
                  <button
                    onClick={() => copyCmd('docker ps --format "table {{.Names}}\t{{.Status}}\t{{.CPUPerc}}\t{{.MemUsage}}"')}
                    className="mt-1 inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                  >
                    <Zap className="h-3 w-3" /> Copy equivalent SSH command
                  </button>
                </div>
              ) : server.containers.list.length === 0 ? (
                <p className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
                  No containers currently running.
                </p>
              ) : (
                <div className="max-h-75 overflow-y-auto space-y-2">
                  {server.containers.list.slice(0, 12).map((c) => (
                    <div key={c.name} className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2 text-xs">
                      <span className="font-mono truncate max-w-50" title={c.name}>{c.name}</span>
                      <div className="flex items-center gap-3 text-muted-foreground">
                        <span>{c.cpu}</span>
                        <span>{c.memory}</span>
                        <Badge variant="outline" className="text-[9px] px-1">
                          {(c.status || '').includes('Up') ? 'Up' : (c.status || '').slice(0, 10)}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Cache management */}
            <Card className="rounded-3xl p-5">
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
                    aria-label="Clear Next.js build cache"
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
                    aria-label="Clear server secrets cache"
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
                    aria-label="Restart Piston"
                  >
                    {clearing === 'piston' ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                  </Button>
                </div>
                <div className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2">
                  <div>
                    <p className="text-xs font-medium text-foreground">System cleanup</p>
                    <p className="text-[10px] text-muted-foreground">Clears build cache, secrets cache & rate-limit counters</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={clearing === 'system'}
                    onClick={() => clearCache('system')}
                    aria-label="Run system cleanup"
                  >
                    {clearing === 'system' ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                  </Button>
                </div>
                <div className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2">
                  <div>
                    <p className="text-xs font-medium text-foreground">Docker system prune</p>
                    <p className="text-[10px] text-muted-foreground">Reclaims unused images & build cache (needs Docker socket)</p>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={clearing === 'docker'}
                    onClick={() => clearCache('docker')}
                    aria-label="Run Docker system prune"
                  >
                    {clearing === 'docker' ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                  </Button>
                </div>
              </div>
            </Card>

            {/* Redis health + live rate-limit counters */}
            <Card className="rounded-3xl p-5 lg:col-span-2" data-tour="admin-system-redis">
              <div className="flex items-center justify-between mb-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Database className="h-4 w-4 text-muted-foreground" /> Redis & rate limiting
                </h3>
                <div className="flex items-center gap-2">
                  {redis?.configured && (
                    <Badge
                      variant={redis.connected ? 'default' : 'destructive'}
                      className="text-[10px] px-1 py-0"
                    >
                      {redis.connected ? 'Connected' : 'Disconnected'}
                    </Badge>
                  )}
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={fetchRedisStatus} aria-label="Refresh Redis status">
                    <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                  </Button>
                </div>
              </div>

              {!redis ? (
                <p className="text-xs text-muted-foreground">Loading Redis status…</p>
              ) : !redis.configured ? (
                <div className="rounded-md border border-dashed p-4 text-center">
                  <p className="text-xs text-muted-foreground">Redis not configured.</p>
                  <Link href="/dashboard/admin/settings?section=redis" className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline">
                    Configure in settings <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              ) : redis.error ? (
                <p className="text-xs text-destructive">Connection failed: {redis.error}</p>
              ) : (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                  <div className="rounded-md bg-muted/30 px-3 py-2">
                    <p className="text-[10px] text-muted-foreground">Mode</p>
                    <p className="text-sm font-medium text-foreground capitalize">{redis.mode === 'upstash-rest' ? 'Upstash REST' : 'Self-hosted'}</p>
                  </div>
                  <div className="rounded-md bg-muted/30 px-3 py-2">
                    <p className="text-[10px] text-muted-foreground">Latency</p>
                    <p className="text-sm font-medium text-foreground">{redis.latencyMs != null ? `${redis.latencyMs}ms` : '—'}</p>
                  </div>
                  {redis.memoryUsedMb != null && (
                    <div className="rounded-md bg-muted/30 px-3 py-2">
                      <p className="text-[10px] text-muted-foreground">Memory</p>
                      <p className="text-sm font-medium text-foreground">{redis.memoryUsedMb} MB</p>
                    </div>
                  )}
                  {redis.connectedClients != null && (
                    <div className="rounded-md bg-muted/30 px-3 py-2">
                      <p className="text-[10px] text-muted-foreground">Clients</p>
                      <p className="text-sm font-medium text-foreground">{redis.connectedClients}</p>
                    </div>
                  )}
                  {redis.opsPerSec != null && (
                    <div className="rounded-md bg-muted/30 px-3 py-2">
                      <p className="text-[10px] text-muted-foreground">Ops / sec</p>
                      <p className="text-sm font-medium text-foreground">{redis.opsPerSec.toLocaleString()}</p>
                    </div>
                  )}
                </div>
              )}

              {redis?.connected && redis.keyspace != null && (
                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                      <Gauge className="h-3.5 w-3.5 text-muted-foreground" />
                      Live rate-limit counters
                      <span className="font-normal text-muted-foreground">({redis.keyspace} active)</span>
                    </p>
                  </div>

                  {(redis.rateLimitKeys?.length ?? 0) > 0 ? (
                    <div className="max-h-75 space-y-3 overflow-y-auto rounded-md border border-border/60 p-3">
                      {RATE_CATEGORY_ORDER.map((cat) => {
                        const items = (redis.rateLimitKeys ?? []).filter((k) => decodeRateKey(k.key).category === cat.kind)
                        if (!items.length) return null
                        return (
                          <div key={cat.kind}>
                            <div className="mb-1.5 flex items-center gap-2">
                              <p className="text-xs font-semibold text-muted-foreground">{cat.label}</p>
                              <Badge variant="outline" className="px-1 text-[9px]">{items.length}</Badge>
                            </div>
                            <div className="space-y-1.5">
                              {items.map((k) => {
                                const info = decodeRateKey(k.key)
                                const pct = info.limit != null ? Math.round((k.count / info.limit) * 100) : undefined
                                const pctColor = pct == null ? 'bg-muted'
                                  : pct >= 100 ? 'bg-red-500'
                                  : pct >= 75 ? 'bg-amber-500'
                                  : 'bg-primary'
                                const nearLimit = pct != null && pct >= 75
                                return (
                                  <div key={k.key} className="flex items-center gap-3 rounded-md bg-muted/30 px-3 py-2 text-xs">
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="truncate font-medium text-foreground">{info.label}</span>
                                        <span className="whitespace-nowrap text-[10px] text-muted-foreground">{info.windowLabel} window</span>
                                      </div>
                                      <div className="mt-1 flex items-center justify-between gap-2">
                                        <span className="truncate font-mono text-[10px] text-muted-foreground" title={k.key}>
                                          {info.identity || 'global'}
                                        </span>
                                        <span className="whitespace-nowrap">
                                          {info.limit != null ? (
                                            <Badge variant={nearLimit ? 'destructive' : 'outline'} className="px-1 text-[9px]">
                                              {k.count}/{info.limit}
                                            </Badge>
                                          ) : (
                                            <span className="text-[10px] text-muted-foreground">{k.count} hits</span>
                                          )}
                                        </span>
                                      </div>
                                      {info.limit != null && <ProgressBar pct={pct ?? 0} color={pctColor} />}
                                    </div>
                                    <span className="whitespace-nowrap text-[10px] text-muted-foreground" title="TTL remaining">
                                      <Timer className="mr-1 inline h-3 w-3" />{k.ttlSec}s
                                    </span>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
                      No active counters — nothing is currently rate-limited. Counters expire automatically.
                    </p>
                  )}
                  <p className="text-[10px] text-muted-foreground">
                    Counters are ephemeral fixed windows and expire on their own. Reset them all anytime from Maintenance → System cleanup.
                  </p>
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      <div className="rounded-3xl border border-border/70 bg-card p-6 space-y-5 shadow-[0_1px_2px_rgba(15,23,41,0.04),0_8px_24px_-14px_rgba(15,23,41,0.10)] dark:shadow-none" data-tour="admin-system-quick-links">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <Lock className="h-5 w-5 text-primary" /> Quick links
        </h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <QL href={p.users} icon={Users} label="Users & roles" />
          <QL href={p.analytics} icon={BarChart3} label="Insights" />
          <QL href={p.settings} icon={Settings} label="Platform settings" />
          <QL href={p.security} icon={Activity} label="Audit logs" />
        </div>
      </div>

      {/* Performance / Web Vitals */}
      <div className="space-y-4" data-tour="admin-system-web-vitals">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <Gauge className="h-5 w-5 text-primary" /> Performance
            <Badge variant="outline" className="ml-2 text-[10px]">
              Core Web Vitals
            </Badge>
          </h2>
          <div className="flex items-center gap-2">
            <select
              value={webVitalsRange}
              onChange={(e) => setWebVitalsRange(e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            >
              <option value="24h">Last 24 hours</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
            </select>
            <Button variant="outline" size="sm" onClick={fetchWebVitals}>
              <RefreshCw className="mr-1 h-3 w-3" /> Refresh
            </Button>
          </div>
        </div>

        {webVitals && webVitals.sampleSize > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[
              { key: 'LCP', title: 'Largest Contentful Paint', icon: Layout, desc: 'Loading — time until main content visible' },
              { key: 'FCP', title: 'First Contentful Paint', icon: Timer, desc: 'Time until first content renders' },
              { key: 'INP', title: 'Interaction to Next Paint', icon: MousePointer, desc: 'Responsiveness — delay after interaction' },
              { key: 'CLS', title: 'Cumulative Layout Shift', icon: Layout, desc: 'Visual stability — layout shifts' },
              { key: 'TTFB', title: 'Time to First Byte', icon: Timer, desc: 'Server response time' },
              { key: 'FID', title: 'First Input Delay', icon: MousePointer, desc: 'First interaction delay (legacy)' },
            ].map(({ key, title, icon: Icon, desc }) => {
              const p75 = webVitals.p75?.[key] ?? null
              const n = webVitals.countsByMetric?.[key] ?? 0
              const isGood = key === 'CLS' ? (p75 != null ? p75 <= 0.1 : false) : (p75 != null ? p75 <= 2500 : false)
              const isPoor = key === 'CLS' ? (p75 != null ? p75 > 0.25 : false) : (p75 != null ? p75 > 4000 : false)
              const ratingLabel = p75 == null ? 'No data' : isGood ? 'Good' : isPoor ? 'Poor' : 'Needs work'
              const ratingColor = p75 == null ? 'text-muted-foreground' : isGood ? 'text-green-600 dark:text-green-400' : isPoor ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'
              return (
                <Card key={key} className="rounded-2xl border-border/70 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <h3 className="text-sm font-semibold">{title}</h3>
                    </div>
                    <Badge variant="outline" className="font-mono text-[10px]">{key}</Badge>
                  </div>
                  <p className="text-xl font-bold tabular-nums">
                    {p75 == null ? '—' : key === 'CLS' ? p75.toFixed(3) : `${Math.round(p75)} ms`}
                  </p>
                  <div className="flex items-center justify-between mt-1">
                    <span className={`text-xs font-medium ${ratingColor}`}>{ratingLabel}</span>
                    <span className="text-xs text-muted-foreground">{n} samples</span>
                  </div>
                </Card>
              )
            })}
          </div>
        ) : (
          webVitals ? (
            <EmptyState
              illustration="analytics"
              title="No page-speed data yet"
              description="Core Web Vitals appear here once visitors load pages."
            />
          ) : (
            <SkeletonStats />
          )
        )}
      </div>

      <div data-tour="admin-system-analytics"><AnalyticsDashboard {...charts} summary={summary} /></div>
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
  return <StatCard label={label} value={value} icon={<Icon />} />
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
    <Button className="h-12 justify-start rounded-xl" asChild variant="secondary">
      <Link href={href}>
        <Icon className="mr-3 h-5 w-5" /> {label}
      </Link>
    </Button>
  )
}


