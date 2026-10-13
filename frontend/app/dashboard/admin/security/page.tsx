'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { DataTable, type BulkAction } from '@/components/ui/data-table'
import { unmaskedAuditLogColumns, type AuditRow } from '@/components/admin/audit-log-columns'
import { usePageGuard } from '@/lib/use-page-guard'
import { csrfFetch } from '@/lib/csrf-fetch'
import {
  Shield, Users, LogIn, Ban, Globe, Monitor, Smartphone, Tablet,
  AlertTriangle, CheckCircle, XCircle, Clock, MapPin, Activity,
  RefreshCw, ChevronDown, ChevronUp, Loader2, Fingerprint, ShieldOff,
  ShieldAlert, ShieldCheck, Plus, Trash2, Blocks, Download, ScrollText, ArrowRight,
} from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { SkeletonStats, SkeletonTable, SkeletonCard } from '@/components/ui/skeleton-boneyard'

interface SecuritySetting {
  _id?: string
  name: string
  status: string
  icon: string
  description?: string
}

interface UserSession {
  id: string
  user_id: string
  email: string
  ip: string
  user_agent: string
  browser: string
  os: string
  device: 'desktop' | 'mobile' | 'tablet'
  country: string | null
  city: string | null
  isp: string | null
  last_seen: string
  created_at: string
  is_active: boolean
}

interface LoginEvent {
  id: string
  ts: string
  actor: string
  actorIp: string
  action: string
  outcome: 'success' | 'denied'
  severity: string
  detail?: string
  user_id: string
}

interface SecurityEvent {
  id: string
  ts: string
  type: string
  severity: 'info' | 'warning' | 'critical'
  user_id?: string
  email?: string
  ip?: string
  visitorId?: string
  detail: string
}

interface DeviceFingerprint {
  visitorId: string
  first_seen: string
  last_seen: string
  seen_count: number
  accounts: { user_id: string; email: string; first_seen: string; last_seen: string }[]
  user_agents: string[]
  is_blocked: boolean
  blocked_at?: string
  blocked_reason?: string
  account_count: number
  risk: boolean
}

interface BlockedIp {
  ip: string
  reason: string
  active?: boolean
  blocked_at: string
  blocked_by?: string
  expires_at?: string | null
}

interface DashboardData {
  settings: SecuritySetting[]
  activeSessions: UserSession[]
  sessionStats: {
    totalToday: number
    uniqueUsersToday: number
    activeNow: number
    successCount: number
    failedCount: number
  }
  loginEvents: LoginEvent[]
  recentAlerts: LoginEvent[]
  geoStats: { _id: string; count: number }[]
  securityEvents?: SecurityEvent[]
  fingerprints?: DeviceFingerprint[]
  blockedIps?: BlockedIp[]
}

function StatCard({ label, value, sub, icon: Icon, color }: { label: string; value: string | number; sub?: string; icon: React.ComponentType<any>; color: string }) {
  return (
    <Card className="p-5 border-border/60 flex items-start gap-4">
      <div className={`rounded-lg p-2.5 ${color}`}>
        <Icon className="h-5 w-5 text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold tabular-nums">{value}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
        {sub && <p className="text-xs text-muted-foreground/70 mt-0.5">{sub}</p>}
      </div>
    </Card>
  )
}

/** Weekly host-scan status banner linking to the full scans report page. */
function ScanBanner() {
  const [summary, setSummary] = useState<{ critical: number; infected: number; ranAt: string } | null>(null)
  useEffect(() => {
    fetch('/api/cron/security-scan', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.latest) return
        const crit = (d.latest.images || []).reduce((n: number, i: any) => n + (i.critical || 0), 0)
        setSummary({
          critical: crit,
          infected: (d.latest.clamav?.infected || []).length,
          ranAt: d.latest.ranAt,
        })
      })
      .catch(() => {})
  }, [])
  const bad = (summary?.critical || 0) > 0 || (summary?.infected || 0) > 0
  return (
    <Link href="/dashboard/admin/security/scans" className="block">
      <Card className="flex flex-wrap items-center gap-3 border-border/60 p-4 transition-colors hover:bg-muted/40">
        <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${bad ? 'bg-red-500/10' : 'bg-emerald-500/10'}`}>
          {bad ? <ShieldAlert className="h-4 w-4 text-red-500" /> : <ShieldCheck className="h-4 w-4 text-emerald-500" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">
            Host security scans
            {summary && (
              <span className="ml-2 font-normal text-muted-foreground tabular-nums">
                {summary.critical} critical · {summary.infected} infected
              </span>
            )}
          </span>
          <span className="block text-xs text-muted-foreground">
            {summary
              ? `Last run ${new Date(summary.ranAt).toLocaleString()} — open the full report`
              : 'Weekly Trivy + ClamAV reports appear here after the first run'}
          </span>
        </span>
        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </Card>
    </Link>
  )
}

function DeviceIcon({ device }: { device: string }) {
  if (device === 'mobile') return <Smartphone className="h-3.5 w-3.5" />
  if (device === 'tablet') return <Tablet className="h-3.5 w-3.5" />
  return <Monitor className="h-3.5 w-3.5" />
}

function SessionRow({ session }: { session: UserSession }) {
  const [expanded, setExpanded] = useState(false)
  const lastSeen = new Date(session.last_seen)
  const isRecent = Date.now() - lastSeen.getTime() < 5 * 60 * 1000

  return (
    <>
      <tr
        className="border-b border-border/40 hover:bg-muted/30 cursor-pointer transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <td className="py-3 px-4">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isRecent ? 'bg-emerald-500' : 'bg-muted-foreground/30'}`} />
            <DeviceIcon device={session.device} />
            <span className="text-sm font-medium">{session.browser}</span>
          </div>
        </td>
        <td className="py-3 px-4 text-sm">{session.os}</td>
        <td className="py-3 px-4 text-sm text-muted-foreground">{session.email || session.user_id.slice(0, 8)}</td>
        <td className="py-3 px-4 text-sm font-mono">{session.ip}</td>
        <td className="py-3 px-4 text-sm text-muted-foreground">
          {session.country ? `${session.city || ''}, ${session.country}` : '—'}
        </td>
        <td className="py-3 px-4 text-right">{expanded ? <ChevronUp className="h-4 w-4 inline" /> : <ChevronDown className="h-4 w-4 inline" />}</td>
      </tr>
      {expanded && (
        <tr className="bg-muted/20">
          <td colSpan={6} className="py-3 px-8">
            <div className="grid grid-cols-3 gap-4 text-xs text-muted-foreground">
              <div><span className="font-medium text-foreground">Session ID</span><p className="font-mono mt-0.5">{session.id}</p></div>
              <div><span className="font-medium text-foreground">User Agent</span><p className="truncate mt-0.5">{session.user_agent}</p></div>
              <div><span className="font-medium text-foreground">ISP</span><p className="mt-0.5">{session.isp || '—'}</p></div>
              <div><span className="font-medium text-foreground">Signed in</span><p className="mt-0.5">{new Date(session.created_at).toLocaleString()}</p></div>
              <div><span className="font-medium text-foreground">Last seen</span><p className="mt-0.5">{lastSeen.toLocaleString()}</p></div>
              <div><span className="font-medium text-foreground">User ID</span><p className="font-mono mt-0.5">{session.user_id}</p></div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

export default function Security() {
  const gate = usePageGuard('superadmin')
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)

  const [auditLogs, setAuditLogs] = useState<AuditRow[]>([])
  const [auditStats, setAuditStats] = useState({ total: 0, critical: 0, warning: 0, denied: 0 })
  const [auditLoading, setAuditLoading] = useState(true)

  const fetchAuditLogs = useCallback(async () => {
    setAuditLoading(true)
    try {
      const params = new URLSearchParams({ limit: '1000' })
      const res = await fetch(`/api/admin/audit-logs?${params.toString()}`)
      const json = await res.json()
      if (json.data) setAuditLogs(json.data)
      if (json.stats) setAuditStats(json.stats)
    } catch { /* ignore */ }
    setAuditLoading(false)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [dashRes, setRes] = await Promise.all([
        fetch('/api/admin/security/dashboard'),
        fetch('/api/admin/security'),
      ])
      const dashJson = await dashRes.json()
      const setJson = await setRes.json()
      if (dashRes.ok) setData(dashJson)
      if (setRes.ok && setJson.data && dashJson.settings) {
        setData(prev => prev ? { ...prev, settings: setJson.data } : null)
      } else if (setRes.ok && setJson.data) {
        setData(prev => prev ? { ...prev, settings: setJson.data } : {
          settings: setJson.data,
          activeSessions: [],
          sessionStats: { totalToday: 0, uniqueUsersToday: 0, activeNow: 0, successCount: 0, failedCount: 0 },
          loginEvents: [],
          recentAlerts: [],
          geoStats: [],
        })
      }
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { load(); fetchAuditLogs() }, [load, fetchAuditLogs])

  const toggleSetting = useCallback(async (name: string, currentStatus: string) => {
    setToggling(name)
    const newStatus = currentStatus === 'enabled' ? 'disabled' : 'enabled'
    try {
      const res = await fetch('/api/admin/security', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, status: newStatus }),
      })
      if (res.ok) {
        setData(prev => prev ? {
          ...prev,
          settings: prev.settings.map(s => s.name === name ? { ...s, status: newStatus } : s),
        } : prev)
      }
    } catch {}
    setToggling(null)
  }, [])

  const [newBlockIp, setNewBlockIp] = useState('')
  const [newBlockReason, setNewBlockReason] = useState('')
  const [mutating, setMutating] = useState<string | null>(null)

  const addBlockedIp = useCallback(async () => {
    const ip = newBlockIp.trim()
    if (!ip) return
    setMutating('add')
    try {
      const res = await csrfFetch('/api/admin/security/blocked-ips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip, reason: newBlockReason || 'Manual block by admin' }),
      })
      if (res.ok) {
        setNewBlockIp('')
        setNewBlockReason('')
        load()
      }
    } catch {}
    setMutating(null)
  }, [newBlockIp, newBlockReason, load])

  const unblockIp = useCallback(async (ip: string) => {
    setMutating(ip)
    try {
      const res = await csrfFetch(`/api/admin/security/blocked-ips?ip=${encodeURIComponent(ip)}`, {
        method: 'DELETE',
      })
      if (res.ok) load()
    } catch {}
    setMutating(null)
  }, [load])

  const toggleFingerprintBlock = useCallback(async (visitorId: string, blocked: boolean, reason?: string) => {
    setMutating(visitorId)
    try {
      const res = await csrfFetch('/api/admin/security/fingerprints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visitorId,
          action: blocked ? 'unblock' : 'block',
          reason: reason || 'Blocked from Security dashboard',
        }),
      })
      if (res.ok) load()
    } catch {}
    setMutating(null)
  }, [load])

  const [whitelistDraft, setWhitelistDraft] = useState('')
  const [concurrentLimitDraft, setConcurrentLimitDraft] = useState('')

  const saveWhitelist = useCallback(async (setting: SecuritySetting | undefined) => {
    if (!setting) return
    setMutating('whitelist')
    const ips = whitelistDraft.split(/[\n,]/).map(x => x.trim()).filter(Boolean)
    try {
      const res = await csrfFetch('/api/admin/security', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: setting.name, status: setting.status, allowed_ips: ips }),
      })
      if (res.ok) load()
    } catch {}
    setMutating(null)
  }, [whitelistDraft, load])

  const saveConcurrentLimit = useCallback(async (setting: SecuritySetting | undefined) => {
    if (!setting) return
    setMutating('concurrent')
    const n = parseInt(concurrentLimitDraft, 10)
    if (Number.isNaN(n) || n < 1) return
    try {
      const res = await csrfFetch('/api/admin/security', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: setting.name, status: setting.status, limit: n }),
      })
      if (res.ok) load()
    } catch {}
    setMutating(null)
  }, [concurrentLimitDraft, load])

  const handleAuditDelete = useCallback(async (ids: string[]) => {
    for (const id of ids) {
      await csrfFetch(`/api/admin/audit-logs/${id}`, { method: 'DELETE', credentials: 'include' })
    }
    setAuditLogs(prev => prev.filter(l => !ids.includes(l.id)))
  }, [])

  const handleAuditExport = useCallback((ids: string[]) => {
    const selected = auditLogs.filter(l => ids.includes(l.id))
    const headers = ['ts', 'actor', 'actorIp', 'action', 'resource', 'resourceType', 'severity', 'outcome', 'detail']
    const csv = [headers.join(','),
      ...selected.map(r => headers.map(h => {
        const v = (r as any)[h] || ''
        return `"${String(v).replace(/"/g, '""')}"`
      }).join(','))
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'audit-logs.csv'; a.click()
    URL.revokeObjectURL(url)
  }, [auditLogs])

  const auditBulkActions: BulkAction[] = [
    { label: 'Delete', variant: 'destructive', icon: <Trash2 className="w-3.5 h-3.5 mr-1" />, onClick: handleAuditDelete },
    { label: 'Export Selected', icon: <Download className="w-3.5 h-3.5 mr-1" />, onClick: handleAuditExport, clearSelection: false },
  ]

  // ── Chart data ─────────────────────────────────────────────────────────
  const loginTimelineData = (() => {
    const now = new Date()
    const hours: { hour: string; success: number; failed: number }[] = []
    for (let i = 23; i >= 0; i--) {
      const h = new Date(now.getTime() - i * 3600_000)
      const label = h.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      const hourStr = h.toISOString().slice(0, 13)
      const events = (data?.loginEvents || []).filter(e => e.ts.slice(0, 13) === hourStr)
      hours.push({
        hour: label,
        success: events.filter(e => e.outcome === 'success').length,
        failed: events.filter(e => e.outcome !== 'success').length,
      })
    }
    return hours
  })()

  const geoData = (data?.geoStats || []).slice(0, 10).map(g => ({ country: g._id || 'Unknown', sessions: g.count }))

  const threatTrendData = (() => {
    const now = new Date()
    const days: { day: string; critical: number; warning: number; info: number }[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400_000)
      const label = d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
      const dayStr = d.toISOString().slice(0, 10)
      const events = (data?.securityEvents || []).filter(e => e.ts.slice(0, 10) === dayStr)
      days.push({
        day: label,
        critical: events.filter(e => e.severity === 'critical').length,
        warning: events.filter(e => e.severity === 'warning').length,
        info: events.filter(e => e.severity === 'info').length,
      })
    }
    return days
  })()

  // ── Polling ────────────────────────────────────────────────────────────
  const SESSION_POLL_MS = 10_000
  const DATA_POLL_MS = 30_000

  const sessionTimerRef = useRef<NodeJS.Timeout | null>(null)
  const dataTimerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    sessionTimerRef.current = setInterval(load, SESSION_POLL_MS)
    dataTimerRef.current = setInterval(() => { load(); fetchAuditLogs() }, DATA_POLL_MS)
    return () => {
      if (sessionTimerRef.current) clearInterval(sessionTimerRef.current)
      if (dataTimerRef.current) clearInterval(dataTimerRef.current)
    }
  }, [load, fetchAuditLogs])

  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        if (sessionTimerRef.current) clearInterval(sessionTimerRef.current)
        if (dataTimerRef.current) clearInterval(dataTimerRef.current)
      } else {
        load()
        fetchAuditLogs()
        sessionTimerRef.current = setInterval(load, SESSION_POLL_MS)
        dataTimerRef.current = setInterval(() => { load(); fetchAuditLogs() }, DATA_POLL_MS)
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [load, fetchAuditLogs])

  if (!gate.ready) return null

  const stats = data?.sessionStats

  const fingerprintStats = {
    total: data?.fingerprints?.length ?? 0,
    risk: data?.fingerprints?.filter(f => f.risk).length ?? 0,
    blocked: data?.fingerprints?.filter(f => f.is_blocked).length ?? 0,
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Security & Audit</h1>
          <p className="text-sm text-muted-foreground mt-1">Real-time monitoring: sessions, devices, audit logs, blocked IPs, and security events</p>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {loading && !data ? (
        <div className="space-y-6">
          <SkeletonStats />
          <SkeletonCard />
          <SkeletonTable />
        </div>
      ) : (
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="overview" className="gap-1.5"><Activity className="h-4 w-4" />Overview</TabsTrigger>
            <TabsTrigger value="audit" className="gap-1.5"><ScrollText className="h-4 w-4" />Audit Logs</TabsTrigger>
            <TabsTrigger value="fingerprints" className="gap-1.5"><Fingerprint className="h-4 w-4" />Device Fingerprints</TabsTrigger>
            <TabsTrigger value="blocked" className="gap-1.5"><Ban className="h-4 w-4" />Blocked IPs</TabsTrigger>
            <TabsTrigger value="events" className="gap-1.5"><ShieldAlert className="h-4 w-4" />Security Events</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
          <ScanBanner />
          {/* ── Charts ──────────────────────────────────────────────── */}
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="border-border/60 p-4">
              <h3 className="font-semibold text-sm mb-3">Login Timeline (24h)</h3>
              {loginTimelineData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={loginTimelineData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="hour" tick={{ fontSize: 10 }} interval={3} />
                    <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                    <Area type="monotone" dataKey="success" stackId="1" stroke="#22c55e" fill="#22c55e" fillOpacity={0.3} name="Success" />
                    <Area type="monotone" dataKey="failed" stackId="1" stroke="#ef4444" fill="#ef4444" fillOpacity={0.3} name="Failed" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[200px] text-muted-foreground text-xs">No data</div>
              )}
            </Card>

            <Card className="border-border/60 p-4">
              <h3 className="font-semibold text-sm mb-3">Sessions by Country (Top 10)</h3>
              {geoData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={geoData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="country" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="sessions" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[200px] text-muted-foreground text-xs">No data</div>
              )}
            </Card>

            <Card className="border-border/60 p-4">
              <h3 className="font-semibold text-sm mb-3">Threat Trend (7d)</h3>
              {threatTrendData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={threatTrendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                    <Line type="monotone" dataKey="critical" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} name="Critical" />
                    <Line type="monotone" dataKey="warning" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} name="Warning" />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[200px] text-muted-foreground text-xs">No data</div>
              )}
            </Card>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Active Now"
              value={stats?.activeNow ?? 0}
              sub={stats ? `${stats.uniqueUsersToday} unique today` : undefined}
              icon={Activity}
              color="bg-emerald-600"
            />
            <StatCard
              label="Logins Today"
              value={stats ? `${stats.successCount}` : '0'}
              sub={stats ? `${stats.totalToday} total sessions` : undefined}
              icon={LogIn}
              color="bg-blue-600"
            />
            <StatCard
              label="Failed Attempts"
              value={stats?.failedCount ?? 0}
              sub="Today"
              icon={Ban}
              color="bg-red-600"
            />
            <StatCard
              label="Active Sessions"
              value={data?.activeSessions?.length ?? 0}
              sub="Last 24h"
              icon={Users}
              color="bg-violet-600"
            />
          </div>

          <Card className="border-border/60">
            <div className="border-b border-border/60 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Monitor className="h-5 w-5 text-primary" />
                <h3 className="font-semibold">Active Sessions</h3>
              </div>
              <Badge variant="outline" className="text-xs">{data?.activeSessions?.length ?? 0} sessions</Badge>
            </div>
            {data?.activeSessions && data.activeSessions.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/40 text-muted-foreground text-xs uppercase tracking-wider">
                      <th className="text-left py-3 px-4 font-medium">Device / Browser</th>
                      <th className="text-left py-3 px-4 font-medium">OS</th>
                      <th className="text-left py-3 px-4 font-medium">User</th>
                      <th className="text-left py-3 px-4 font-medium">IP Address</th>
                      <th className="text-left py-3 px-4 font-medium">Location</th>
                      <th className="py-3 px-4" />
                    </tr>
                  </thead>
                  <tbody>
                    {data.activeSessions.map(s => <SessionRow key={s.id} session={s} />)}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-12 text-center text-muted-foreground">
                <Shield className="h-8 w-8 mb-2 text-muted-foreground/40" />
                <p className="text-sm">No active sessions. Sessions appear after users log in.</p>
              </div>
            )}
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="border-border/60">
              <div className="border-b border-border/60 px-6 py-4 flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                <h3 className="font-semibold">Login Activity</h3>
              </div>
              {data?.loginEvents && data.loginEvents.length > 0 ? (
                <div className="divide-y divide-border/40 max-h-[400px] overflow-y-auto">
                  {data.loginEvents.map(e => (
                    <div key={e.id} className="px-6 py-3 flex items-start gap-3">
                      {e.outcome === 'success' ? (
                        <CheckCircle className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm">
                          <span className="font-medium">{e.actor}</span>
                          <span className="text-muted-foreground"> — {e.outcome === 'success' ? 'signed in' : `failed (${e.detail || 'unknown'})`}</span>
                        </p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{new Date(e.ts).toLocaleString()}</span>
                          <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{e.actorIp}</span>
                        </div>
                      </div>
                      <Badge variant={e.outcome === 'success' ? 'secondary' : 'destructive'} className="text-[10px] shrink-0">
                        {e.outcome}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center text-muted-foreground">
                  <LogIn className="h-8 w-8 mb-2 text-muted-foreground/40" />
                  <p className="text-sm">No login events today</p>
                </div>
              )}
            </Card>

            <Card className="border-border/60">
              <div className="border-b border-border/60 px-6 py-4 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                <h3 className="font-semibold">Security Alerts</h3>
              </div>
              {data?.recentAlerts && data.recentAlerts.length > 0 ? (
                <div className="divide-y divide-border/40 max-h-[400px] overflow-y-auto">
                  {data.recentAlerts.map(a => (
                    <div key={a.id} className="px-6 py-3 flex items-start gap-3">
                      {a.severity === 'critical' ? (
                        <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm">
                          <span className="font-medium">{a.action}</span>
                          {a.detail && <span className="text-muted-foreground"> — {a.detail}</span>}
                        </p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{new Date(a.ts).toLocaleString()}</span>
                          <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{a.actorIp}</span>
                        </div>
                      </div>
                      <Badge variant={a.severity === 'critical' ? 'destructive' : 'secondary'} className="text-[10px] shrink-0">
                        {a.severity}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center text-muted-foreground">
                  <Shield className="h-8 w-8 mb-2 text-muted-foreground/40" />
                  <p className="text-sm">No security alerts in the past 7 days</p>
                </div>
              )}
            </Card>
          </div>

          <Card className="border-border/60">
            <div className="border-b border-border/60 px-6 py-4 flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Security Settings</h3>
            </div>
            {data?.settings && data.settings.length > 0 ? (
              <div className="grid gap-0 divide-y divide-border/40 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
                {data.settings.map(s => (
                  <div key={s.name} className="flex items-center justify-between gap-4 p-5">
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-sm font-medium">{s.name}</p>
                      {s.description && <p className="text-xs text-muted-foreground">{s.description}</p>}
                    </div>
                    <Switch
                      checked={s.status === 'enabled'}
                      disabled={toggling === s.name}
                      onCheckedChange={() => toggleSetting(s.name, s.status)}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center text-muted-foreground">
                <Shield className="h-8 w-8 mb-2 text-muted-foreground/40" />
                <p className="text-sm">No security settings configured. Run the seed script to populate defaults.</p>
              </div>
            )}
          </Card>

          <Card className="border-border/60">
            <div className="border-b border-border/60 px-6 py-4 flex items-center gap-2">
              <Globe className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Policy Configuration</h3>
            </div>
            <div className="divide-y divide-border/40">
              <div className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">IP Whitelist</p>
                    <p className="text-xs text-muted-foreground mt-0.5">When enabled, only these IPs / CIDR ranges may sign in. One per line or comma-separated.</p>
                  </div>
                  {(() => {
                    const s = data?.settings?.find(x => x.name === 'IP Whitelist')
                    if (!s) return null
                    return (
                      <Switch
                        checked={s.status === 'enabled'}
                        disabled={toggling === s.name}
                        onCheckedChange={() => toggleSetting(s.name, s.status)}
                      />
                    )
                  })()}
                </div>
                {(() => {
                  const s = data?.settings?.find(x => x.name === 'IP Whitelist')
                  if (!s) return null
                  const cur = (s as unknown as { allowed_ips?: string[] }).allowed_ips || []
                  return (
                    <div className="mt-4 space-y-2">
                      <textarea
                        className="w-full h-24 rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
                        placeholder={'203.0.113.0/24\n192.168.1.1'}
                        defaultValue={cur.join('\n')}
                        onChange={e => setWhitelistDraft(e.target.value)}
                      />
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">{cur.length} saved entries</p>
                        <Button size="sm" variant="outline" disabled={mutating === 'whitelist'} onClick={() => saveWhitelist(s)}>
                          Save Whitelist
                        </Button>
                      </div>
                    </div>
                  )
                })()}
              </div>

              <div className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Concurrent Session Limit</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Max active sessions per user. Oldest sessions are pruned when exceeded. 0 = unlimited.</p>
                  </div>
                  {(() => {
                    const s = data?.settings?.find(x => x.name === 'Concurrent Session Limit')
                    if (!s) return null
                    return (
                      <Switch
                        checked={s.status === 'enabled'}
                        disabled={toggling === s.name}
                        onCheckedChange={() => toggleSetting(s.name, s.status)}
                      />
                    )
                  })()}
                </div>
                {(() => {
                  const s = data?.settings?.find(x => x.name === 'Concurrent Session Limit')
                  if (!s) return null
                  const cur = (s as unknown as { limit?: number }).limit || 0
                  return (
                    <div className="mt-4 flex items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        placeholder="0"
                        defaultValue={String(cur)}
                        onChange={e => setConcurrentLimitDraft(e.target.value)}
                      />
                      <Button size="sm" variant="outline" disabled={mutating === 'concurrent'} onClick={() => saveConcurrentLimit(s)}>
                        Save Limit
                      </Button>
                    </div>
                  )
                })()}
              </div>
            </div>
          </Card>
          </TabsContent>

          {/* ── Audit Logs ──────────────────────────────────────────────────── */}
          <TabsContent value="audit" className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Card className="border-border/60 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total Events</p>
                <p className="mt-1 text-2xl font-bold">{auditStats.total}</p>
              </Card>
              <Card className="border-border/60 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Critical</p>
                <p className="mt-1 text-2xl font-bold text-red-500">{auditStats.critical}</p>
              </Card>
              <Card className="border-border/60 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Denied / Failed</p>
                <p className="mt-1 text-2xl font-bold text-amber-500">{auditStats.denied}</p>
              </Card>
            </div>
            <DataTable
              columns={unmaskedAuditLogColumns}
              data={auditLogs}
              tableId="security-audit-logs"
              searchPlaceholder="Search actor, action, resource..."
              searchKeys={['actor', 'action', 'resource'] as (keyof AuditRow)[]}
              filters={[
                {
                  label: 'Severity', key: 'severity',
                  options: [
                    { label: 'Info', value: 'info' },
                    { label: 'Warning', value: 'warning' },
                    { label: 'Critical', value: 'critical' },
                  ],
                },
                {
                  label: 'Outcome', key: 'outcome',
                  options: [
                    { label: 'Success', value: 'success' },
                    { label: 'Failure', value: 'failure' },
                    { label: 'Denied', value: 'denied' },
                  ],
                },
              ]}
              bulkActions={auditBulkActions}
              loading={auditLoading}
              emptyMessage="No audit events found."
              pageSize={50}
            />
          </TabsContent>

          {/* ── Device Fingerprints ───────────────────────────────────────── */}
          <TabsContent value="fingerprints" className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Card className="border-border/60 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Tracked Devices</p>
                <p className="mt-1 text-2xl font-bold">{fingerprintStats.total}</p>
              </Card>
              <Card className="border-border/60 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Multi-Account Risk</p>
                <p className="mt-1 text-2xl font-bold text-amber-500">{fingerprintStats.risk}</p>
              </Card>
              <Card className="border-border/60 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Blocked Devices</p>
                <p className="mt-1 text-2xl font-bold text-red-500">{fingerprintStats.blocked}</p>
              </Card>
            </div>

            <Card className="border-border/60">
              <div className="border-b border-border/60 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Fingerprint className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold">Device Fingerprints</h3>
                </div>
                <Badge variant="outline" className="text-xs">FingerprintJS v5</Badge>
              </div>
              {data?.fingerprints && data.fingerprints.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/40 text-muted-foreground text-xs uppercase tracking-wider">
                        <th className="text-left py-3 px-4 font-medium">Fingerprint</th>
                        <th className="text-left py-3 px-4 font-medium">Accounts</th>
                        <th className="text-left py-3 px-4 font-medium">Seen</th>
                        <th className="text-left py-3 px-4 font-medium">Last Seen</th>
                        <th className="text-left py-3 px-4 font-medium">Risk</th>
                        <th className="py-3 px-4" />
                      </tr>
                    </thead>
                    <tbody>
                      {data.fingerprints.map(fp => (
                        <tr key={fp.visitorId} className="border-b border-border/40 hover:bg-muted/30">
                          <td className="py-3 px-4">
                            <p className="font-mono text-xs">{fp.visitorId.slice(0, 18)}…</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {(fp.user_agents?.[0] || '').split(' ').slice(0, 3).join(' ') || 'Unknown device'}
                            </p>
                          </td>
                          <td className="py-3 px-4">
                            <div className="space-y-1">
                              {(fp.accounts || []).slice(0, 3).map((a, i) => (
                                <p key={i} className="text-xs text-muted-foreground font-mono">{a.email || a.user_id.slice(0, 10)}</p>
                              ))}
                              {(fp.account_count || 0) > 3 && (
                                <p className="text-xs text-muted-foreground">+{(fp.account_count || 0) - 3} more</p>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-sm">{fp.seen_count ?? 0}</td>
                          <td className="py-3 px-4 text-sm text-muted-foreground">{new Date(fp.last_seen).toLocaleString()}</td>
                          <td className="py-3 px-4">
                            {fp.is_blocked ? (
                              <Badge variant="destructive" className="text-[10px]">Blocked</Badge>
                            ) : fp.risk ? (
                              <Badge variant="secondary" className="text-[10px] text-amber-600">Multi-account</Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] text-emerald-600">Clean</Badge>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <Button
                              variant={fp.is_blocked ? 'outline' : 'destructive'}
                              size="sm"
                              className="h-7 text-xs gap-1"
                              disabled={mutating === fp.visitorId}
                              onClick={() => toggleFingerprintBlock(fp.visitorId, fp.is_blocked, fp.blocked_reason || undefined)}
                            >
                              {fp.is_blocked ? <><ShieldOff className="h-3 w-3" />Unblock</> : <><ShieldAlert className="h-3 w-3" />Block</>}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-12 text-center text-muted-foreground">
                  <Fingerprint className="h-8 w-8 mb-2 text-muted-foreground/40" />
                  <p className="text-sm">No fingerprints yet. They appear as users sign in from this platform.</p>
                </div>
              )}
            </Card>
          </TabsContent>

          {/* ── Blocked IPs ───────────────────────────────────────────────── */}
          <TabsContent value="blocked" className="space-y-4">
            <Card className="border-border/60">
              <div className="border-b border-border/60 px-6 py-4 flex items-center gap-2">
                <Ban className="h-5 w-5 text-primary" />
                <h3 className="font-semibold">Block an IP Address</h3>
              </div>
              <div className="p-6 flex flex-col gap-3 sm:flex-row">
                <Input
                  placeholder="e.g. 203.0.113.5"
                  value={newBlockIp}
                  onChange={e => setNewBlockIp(e.target.value)}
                  className="sm:max-w-[220px] font-mono"
                />
                <Input
                  placeholder="Reason (optional)"
                  value={newBlockReason}
                  onChange={e => setNewBlockReason(e.target.value)}
                  className="flex-1"
                />
                <Button className="gap-2" onClick={addBlockedIp} disabled={mutating === 'add' || !newBlockIp.trim()}>
                  <Plus className="h-4 w-4" />
                  Block IP
                </Button>
              </div>
            </Card>

            <Card className="border-border/60">
              <div className="border-b border-border/60 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Blocks className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold">Blocked IPs</h3>
                </div>
                <Badge variant="outline" className="text-xs">{data?.blockedIps?.length ?? 0} active</Badge>
              </div>
              {data?.blockedIps && data.blockedIps.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/40 text-muted-foreground text-xs uppercase tracking-wider">
                        <th className="text-left py-3 px-4 font-medium">IP</th>
                        <th className="text-left py-3 px-4 font-medium">Reason</th>
                        <th className="text-left py-3 px-4 font-medium">Blocked By</th>
                        <th className="text-left py-3 px-4 font-medium">Date</th>
                        <th className="py-3 px-4" />
                      </tr>
                    </thead>
                    <tbody>
                      {data.blockedIps.map(ip => (
                        <tr key={ip.ip} className="border-b border-border/40 hover:bg-muted/30">
                          <td className="py-3 px-4 font-mono">{ip.ip}</td>
                          <td className="py-3 px-4 text-muted-foreground">{ip.reason || '—'}</td>
                          <td className="py-3 px-4 text-muted-foreground">{ip.blocked_by || 'system'}</td>
                          <td className="py-3 px-4 text-muted-foreground">{new Date(ip.blocked_at).toLocaleString()}</td>
                          <td className="py-3 px-4 text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs gap-1"
                              disabled={mutating === ip.ip}
                              onClick={() => unblockIp(ip.ip)}
                            >
                              <ShieldOff className="h-3 w-3" />
                              Unblock
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-12 text-center text-muted-foreground">
                  <Shield className="h-8 w-8 mb-2 text-muted-foreground/40" />
                  <p className="text-sm">No blocked IPs. IPs are auto-blocked after brute-force attempts or added manually above.</p>
                </div>
              )}
            </Card>
          </TabsContent>

          {/* ── Security Events ──────────────────────────────────────────── */}
          <TabsContent value="events" className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Card className="border-border/60 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Critical</p>
                <p className="mt-1 text-2xl font-bold text-red-500">
                  {data?.securityEvents?.filter(e => e.severity === 'critical').length ?? 0}
                </p>
              </Card>
              <Card className="border-border/60 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Warning</p>
                <p className="mt-1 text-2xl font-bold text-amber-500">
                  {data?.securityEvents?.filter(e => e.severity === 'warning').length ?? 0}
                </p>
              </Card>
              <Card className="border-border/60 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Last 20 Events</p>
                <p className="mt-1 text-2xl font-bold">{data?.securityEvents?.length ?? 0}</p>
              </Card>
            </div>

            <Card className="border-border/60">
              <div className="border-b border-border/60 px-6 py-4 flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-primary" />
                <h3 className="font-semibold">Security Events</h3>
              </div>
              {data?.securityEvents && data.securityEvents.length > 0 ? (
                <div className="divide-y divide-border/40 max-h-[480px] overflow-y-auto">
                  {data.securityEvents.map(e => (
                    <div key={e.id} className="px-6 py-3 flex items-start gap-3">
                      {e.severity === 'critical' ? (
                        <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                      ) : e.severity === 'warning' ? (
                        <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                      ) : (
                        <CheckCircle className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm">
                          <span className="font-mono text-xs text-primary">{e.type}</span>
                          <span className="text-muted-foreground"> — {e.detail}</span>
                        </p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{new Date(e.ts).toLocaleString()}</span>
                          {e.email && <span className="font-mono">{e.email}</span>}
                          {e.ip && <span className="font-mono">{e.ip}</span>}
                          {e.visitorId && <span className="font-mono">{e.visitorId.slice(0, 12)}…</span>}
                        </div>
                      </div>
                      <Badge variant={e.severity === 'critical' ? 'destructive' : e.severity === 'warning' ? 'secondary' : 'outline'} className="text-[10px] shrink-0">
                        {e.severity}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center text-muted-foreground">
                  <ShieldAlert className="h-8 w-8 mb-2 text-muted-foreground/40" />
                  <p className="text-sm">No security events yet.</p>
                </div>
              )}
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
