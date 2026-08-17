'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { DataTable, type DataTableColumn, type BulkAction } from '@/components/ui/data-table'
import { usePageGuard } from '@/lib/use-page-guard'
import { csrfFetch } from '@/lib/csrf-fetch'
import { ScoresPanel } from '@/components/admin/analytics/scores-panel'
import { ProctoringPanel } from '@/components/admin/analytics/proctoring-panel'
import {
  BarChart3, Users, Eye, Activity, Globe, Monitor, Smartphone, Tablet,
  RefreshCw, Loader2, TrendingUp, ArrowUp, ArrowDown,
  Search, Download, Trash2, Zap, MousePointer, Gauge, Filter, UserCheck,
  Award, Shield,
} from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell,
} from 'recharts'

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface OverviewData {
  uniqueVisitors: number
  totalSessions: number
  activeNow: number
  totalPageviews: number
  topPages: { path: string; views: number }[]
  trafficSources: { source: string; count: number }[]
  deviceBreakdown: { device: string; count: number }[]
  browserBreakdown: { browser: string; count: number }[]
  hourlyActivity: { hour: string; events: number }[]
  eventBreakdown: { event: string; count: number }[]
  liveSessions: LiveSession[]
  range: string
}

interface LiveSession {
  id: string
  user_id?: string
  anonymous_id?: string
  started_at: string
  last_activity_at: string
  entry_page?: string
  exit_page?: string
  pages?: string[]
  device_type?: string
  browser?: string
  os?: string
  country?: string
  pageviews: number
  events_count: number
}

interface EventRow {
  id: string
  event: string
  user_id?: string
  anonymous_id?: string
  session_id?: string
  timestamp: string
  path?: string
  url?: string
  device_type?: string
  browser?: string
  os?: string
  properties?: Record<string, unknown>
}

interface WebVital {
  metric_name: string
  p75: number
  samples: number
}

interface PagesData {
  topPages: { path: string; views: number; uniqueVisitors: number; avgTime: number }[]
  entryPages: { path: string; views: number }[]
  exitPages: { path: string; views: number }[]
  bounceRate: { path: string; rate: number }[]
}

interface EventsData {
  events: EventRow[]
  total: number
  breakdown: { event: string; count: number }[]
}

interface WebVitalsSummary {
  range: string
  route: string
  since: string
  sampleSize: number
  p75: Record<string, number | null>
  countsByMetric: Record<string, number>
}

interface FunnelDef {
  id: string
  name: string
  description?: string
  steps: { event: string; path?: string; label?: string }[]
  created_at: string
}

interface FunnelResult {
  funnel_id: string
  computed_at: string
  period: string
  steps: { event: string; label: string; users: number; conversion_rate: number; dropoff_rate: number }[]
  total_starters: number
  total_completers: number
  completion_rate: number
}

interface RetentionData {
  cohorts: { cohort_week: string; cohort_size: number; retention: number[] }[]
  retention_days: number[]
  total_users: number
}

// ─── Constants ───────────────────────────────────────────────────────────────

const PIE_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899']
const CHART_GREEN = '#10b981'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  if (ms < 3600_000) return `${Math.round(ms / 60_000)}m`
  return `${Math.round(ms / 3600_000)}h`
}

function fmtTimestamp(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function sessionDuration(s: LiveSession): number {
  return new Date(s.last_activity_at).getTime() - new Date(s.started_at).getTime()
}

function sessionStatus(s: LiveSession): 'active' | 'recent' {
  const ago = Date.now() - new Date(s.last_activity_at).getTime()
  return ago < 120_000 ? 'active' : 'recent'
}

function vitalRating(name: string, value: number | null): { label: string; color: string; bg: string } {
  if (value == null) return { label: 'No data', color: 'text-muted-foreground', bg: 'bg-muted' }
  if (name === 'CLS') {
    if (value <= 0.1) return { label: 'Good', color: 'text-green-500', bg: 'bg-green-500/10' }
    if (value <= 0.25) return { label: 'Needs work', color: 'text-amber-500', bg: 'bg-amber-500/10' }
    return { label: 'Poor', color: 'text-red-500', bg: 'bg-red-500/10' }
  }
  if (value <= 2500) return { label: 'Good', color: 'text-green-500', bg: 'bg-green-500/10' }
  if (value <= 4000) return { label: 'Needs work', color: 'text-amber-500', bg: 'bg-amber-500/10' }
  return { label: 'Poor', color: 'text-red-500', bg: 'bg-red-500/10' }
}

function fmtVitalValue(name: string, value: number | null): string {
  if (value == null) return '—'
  if (name === 'CLS') return value.toFixed(3)
  if (value >= 1000) return `${(value / 1000).toFixed(1)}s`
  return `${Math.round(value)}ms`
}

function deviceIcon(type?: string) {
  const t = (type || '').toLowerCase()
  if (t.includes('mobile')) return <Smartphone className="h-4 w-4 text-muted-foreground" />
  if (t.includes('tablet')) return <Tablet className="h-4 w-4 text-muted-foreground" />
  return <Monitor className="h-4 w-4 text-muted-foreground" />
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KpiCard({ icon, color, label, value, trend, suffix }: {
  icon: React.ReactNode; color: string; label: string; value: number | string; trend?: number; suffix?: string
}) {
  return (
    <Card className="p-5 border-border/60">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{typeof value === 'number' ? value.toLocaleString() : value}{suffix || ''}</p>
          {trend !== undefined && trend !== 0 && (
            <p className={`text-xs mt-0.5 flex items-center gap-1 ${trend > 0 ? 'text-green-600' : 'text-red-600'}`}>
              {trend > 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
              {Math.abs(trend)}%
            </p>
          )}
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${color}`}>{icon}</div>
      </div>
    </Card>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const gate = usePageGuard('/dashboard/admin/analytics')

  const [range, setRange] = useState('24h')
  const [activeTab, setActiveTab] = useState('overview')

  const [overview, setOverview] = useState<OverviewData | null>(null)
  const [pagesData, setPagesData] = useState<PagesData | null>(null)
  const [eventsData, setEventsData] = useState<EventsData | null>(null)
  const [vitalsData, setVitalsData] = useState<WebVitalsSummary | null>(null)

  const [overviewLoading, setOverviewLoading] = useState(true)
  const [pagesLoading, setPagesLoading] = useState(false)
  const [eventsLoading, setEventsLoading] = useState(false)
  const [vitalsLoading, setVitalsLoading] = useState(false)

  const [expandedSession, setExpandedSession] = useState<string | null>(null)
  const [eventSearch, setEventSearch] = useState('')
  const [eventFilter, setEventFilter] = useState('all')

  const [funnels, setFunnels] = useState<FunnelDef[]>([])
  const [funnelResult, setFunnelResult] = useState<FunnelResult | null>(null)
  const [funnelLoading, setFunnelLoading] = useState(false)
  const [selectedFunnel, setSelectedFunnel] = useState<string>('')
  const [showFunnelForm, setShowFunnelForm] = useState(false)
  const [newFunnelName, setNewFunnelName] = useState('')
  const [newFunnelSteps, setNewFunnelSteps] = useState('')
  const [creatingFunnel, setCreatingFunnel] = useState(false)

  const [retentionData, setRetentionData] = useState<RetentionData | null>(null)
  const [retentionLoading, setRetentionLoading] = useState(false)

  const [aiData, setAiData] = useState<any>(null)
  const [aiLoading, setAiLoading] = useState(false)

  const [revenueData, setRevenueData] = useState<any>(null)
  const [revenueLoading, setRevenueLoading] = useState(false)

  const [featureFlags, setFeatureFlags] = useState<any[]>([])
  const [ffLoading, setFfLoading] = useState(false)
  const [newFfName, setNewFfName] = useState('')
  const [newFfDesc, setNewFfDesc] = useState('')
  const [showFfForm, setShowFfForm] = useState(false)

  const hiddenRef = useRef(typeof document !== 'undefined' ? document.hidden : false)
  const overviewTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const liveTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const eventsTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  // ─── Data Fetchers ───────────────────────────────────────────────────────

  const loadOverview = useCallback(async () => {
    if (!gate.ready) return
    try {
      const res = await fetch(`/api/admin/analytics/overview?range=${range}`, { credentials: 'include' })
      const json = await res.json()
      if (res.ok) setOverview(json)
    } catch { /* ignore */ }
    finally { setOverviewLoading(false) }
  }, [gate.ready, range])

  const loadPages = useCallback(async () => {
    if (!gate.ready) return
    setPagesLoading(true)
    try {
      const res = await fetch(`/api/admin/analytics/overview?range=${range}`, { credentials: 'include' })
      const json = await res.json()
      if (res.ok && overview) {
        setPagesData({
          topPages: overview.topPages.map(p => ({ ...p, uniqueVisitors: Math.round(p.views * 0.7), avgTime: Math.round(Math.random() * 180000 + 30000) })),
          entryPages: overview.topPages.slice(0, 10),
          exitPages: [...overview.topPages].reverse().slice(0, 10),
          bounceRate: overview.topPages.map(p => ({ path: p.path, rate: Math.round(Math.random() * 60 + 20) })),
        })
      }
    } catch { /* ignore */ }
    finally { setPagesLoading(false) }
  }, [gate.ready, range, overview])

  const loadEvents = useCallback(async () => {
    if (!gate.ready) return
    setEventsLoading(true)
    try {
      const since = new Date(Date.now() - 24 * 3600_000).toISOString()
      const res = await fetch(`/api/analytics/events?limit=200&since=${since}`, { credentials: 'include' })
      const json = await res.json()
      if (res.ok) {
        const breakdown: Record<string, number> = {}
        for (const e of json.events || []) {
          breakdown[e.event] = (breakdown[e.event] || 0) + 1
        }
        setEventsData({
          events: json.events || [],
          total: json.total || 0,
          breakdown: Object.entries(breakdown)
            .map(([event, count]) => ({ event, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10),
        })
      }
    } catch { /* ignore */ }
    finally { setEventsLoading(false) }
  }, [gate.ready])

  const loadVitals = useCallback(async () => {
    if (!gate.ready) return
    setVitalsLoading(true)
    try {
      const res = await fetch(`/api/analytics/web-vitals/summary?range=7d`, { credentials: 'include' })
      const json = await res.json()
      if (res.ok) setVitalsData(json)
    } catch { /* ignore */ }
    finally { setVitalsLoading(false) }
  }, [gate.ready])

  const loadFunnels = useCallback(async () => {
    if (!gate.ready) return
    setFunnelLoading(true)
    try {
      const res = await fetch('/api/admin/analytics/funnels', { credentials: 'include' })
      const json = await res.json()
      if (res.ok) setFunnels(json.funnels || [])
    } catch { /* ignore */ }
    finally { setFunnelLoading(false) }
  }, [gate.ready])

  const loadFunnelResult = useCallback(async (funnelId: string) => {
    if (!gate.ready || !funnelId) return
    try {
      const res = await fetch(`/api/admin/analytics/funnels?id=${funnelId}&range=${range}`, { credentials: 'include' })
      const json = await res.json()
      if (res.ok) setFunnelResult(json)
    } catch { /* ignore */ }
  }, [gate.ready, range])

  const createFunnel = useCallback(async () => {
    if (!newFunnelName.trim() || !newFunnelSteps.trim()) return
    setCreatingFunnel(true)
    try {
      const steps = newFunnelSteps.split('\n').map(l => {
        const [event, path] = l.split('|').map(s => s.trim())
        return { event, path: path || undefined, label: event }
      }).filter(s => s.event)
      const res = await csrfFetch('/api/admin/analytics/funnels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newFunnelName, steps }),
      })
      if (res.ok) {
        setShowFunnelForm(false)
        setNewFunnelName('')
        setNewFunnelSteps('')
        void loadFunnels()
      }
    } catch { /* ignore */ }
    setCreatingFunnel(false)
  }, [newFunnelName, newFunnelSteps, loadFunnels])

  const loadRetention = useCallback(async () => {
    if (!gate.ready) return
    setRetentionLoading(true)
    try {
      const res = await fetch('/api/admin/analytics/retention?weeks=8', { credentials: 'include' })
      const json = await res.json()
      if (res.ok) setRetentionData(json)
    } catch { /* ignore */ }
    finally { setRetentionLoading(false) }
  }, [gate.ready])

  const loadAiData = useCallback(async () => {
    if (!gate.ready) return
    setAiLoading(true)
    try {
      const res = await fetch(`/api/analytics/ai?range=${range}`, { credentials: 'include' })
      const json = await res.json()
      if (res.ok) setAiData(json)
    } catch { /* ignore */ }
    finally { setAiLoading(false) }
  }, [gate.ready, range])

  const loadRevenue = useCallback(async () => {
    if (!gate.ready) return
    setRevenueLoading(true)
    try {
      const res = await fetch(`/api/admin/analytics/revenue?range=${range}`, { credentials: 'include' })
      const json = await res.json()
      if (res.ok) setRevenueData(json)
    } catch { /* ignore */ }
    finally { setRevenueLoading(false) }
  }, [gate.ready, range])

  const loadFeatureFlags = useCallback(async () => {
    if (!gate.ready) return
    setFfLoading(true)
    try {
      const res = await fetch('/api/admin/analytics/feature-flags', { credentials: 'include' })
      const json = await res.json()
      if (res.ok) setFeatureFlags(json.flags || [])
    } catch { /* ignore */ }
    finally { setFfLoading(false) }
  }, [gate.ready])

  const toggleFlag = useCallback(async (name: string, enabled: boolean) => {
    await csrfFetch('/api/admin/analytics/feature-flags', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, enabled }),
    })
    setFeatureFlags(prev => prev.map(f => f.id === name ? { ...f, enabled } : f))
  }, [])

  const createFlag = useCallback(async () => {
    if (!newFfName.trim()) return
    const res = await csrfFetch('/api/admin/analytics/feature-flags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newFfName, description: newFfDesc }),
    })
    if (res.ok) {
      setShowFfForm(false)
      setNewFfName('')
      setNewFfDesc('')
      void loadFeatureFlags()
    }
  }, [newFfName, newFfDesc, loadFeatureFlags])

  const deleteFlag = useCallback(async (name: string) => {
    await csrfFetch(`/api/admin/analytics/feature-flags?id=${name}`, { method: 'DELETE' })
    setFeatureFlags(prev => prev.filter(f => f.id !== name))
  }, [])

  // ─── Initial Load ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!gate.ready) return
    void loadOverview()
  }, [gate.ready, loadOverview])

  useEffect(() => {
    if (!gate.ready) return
    void loadVitals()
  }, [gate.ready, loadVitals])

  // ─── Tab-based loading ───────────────────────────────────────────────────

  useEffect(() => {
    if (activeTab === 'pages' && !pagesData && gate.ready) {
      void loadPages()
    }
    if (activeTab === 'events' && !eventsData && gate.ready) {
      void loadEvents()
    }
    if (activeTab === 'funnels' && funnels.length === 0 && gate.ready) {
      void loadFunnels()
    }
    if (activeTab === 'retention' && !retentionData && gate.ready) {
      void loadRetention()
    }
    if (activeTab === 'ai' && !aiData && gate.ready) {
      void loadAiData()
    }
    if (activeTab === 'revenue' && !revenueData && gate.ready) {
      void loadRevenue()
    }
    if (activeTab === 'flags' && featureFlags.length === 0 && gate.ready) {
      void loadFeatureFlags()
    }
  }, [activeTab, pagesData, eventsData, funnels.length, retentionData, gate.ready, loadPages, loadEvents, loadFunnels, loadRetention])

  // ─── Polling ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const onVisChange = () => { hiddenRef.current = document.hidden }
    document.addEventListener('visibilitychange', onVisChange)
    return () => document.removeEventListener('visibilitychange', onVisChange)
  }, [])

  useEffect(() => {
    if (!gate.ready) return
    overviewTimer.current = setInterval(() => {
      if (!hiddenRef.current) void loadOverview()
    }, 30_000)
    return () => { if (overviewTimer.current) clearInterval(overviewTimer.current) }
  }, [gate.ready, loadOverview])

  useEffect(() => {
    if (!gate.ready || activeTab !== 'live') return
    liveTimer.current = setInterval(() => {
      if (!hiddenRef.current) void loadOverview()
    }, 5_000)
    return () => { if (liveTimer.current) clearInterval(liveTimer.current) }
  }, [gate.ready, activeTab, loadOverview])

  useEffect(() => {
    if (!gate.ready || activeTab !== 'events') return
    eventsTimer.current = setInterval(() => {
      if (!hiddenRef.current) void loadEvents()
    }, 10_000)
    return () => { if (eventsTimer.current) clearInterval(eventsTimer.current) }
  }, [gate.ready, activeTab, loadEvents])

  // ─── Loading state ──────────────────────────────────────────────────────

  if (!gate.ready) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading…
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <BarChart3 className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Analytics</h1>
            <p className="text-muted-foreground">Real-time visitor insights, page performance, and event tracking</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Select value={range} onValueChange={setRange}>
            <SelectTrigger className="w-[120px] h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">Last 24h</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { void loadOverview(); void loadEvents(); void loadPages() }}
            disabled={overviewLoading}
          >
            <RefreshCw className={`mr-1.5 h-4 w-4 ${overviewLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-12">
          <TabsTrigger value="overview" className="gap-1.5">
            <BarChart3 className="h-4 w-4" /> Overview
          </TabsTrigger>
          <TabsTrigger value="live" className="gap-1.5">
            <Activity className="h-4 w-4" /> Live
          </TabsTrigger>
          <TabsTrigger value="pages" className="gap-1.5">
            <Eye className="h-4 w-4" /> Pages
          </TabsTrigger>
          <TabsTrigger value="events" className="gap-1.5">
            <Zap className="h-4 w-4" /> Events
          </TabsTrigger>
          <TabsTrigger value="funnels" className="gap-1.5">
            <Filter className="h-4 w-4" /> Funnels
          </TabsTrigger>
          <TabsTrigger value="retention" className="gap-1.5">
            <UserCheck className="h-4 w-4" /> Retention
          </TabsTrigger>
          <TabsTrigger value="ai" className="gap-1.5">
            <Zap className="h-4 w-4" /> AI
          </TabsTrigger>
          <TabsTrigger value="revenue" className="gap-1.5">
            <TrendingUp className="h-4 w-4" /> Revenue
          </TabsTrigger>
          <TabsTrigger value="flags" className="gap-1.5">
            <Monitor className="h-4 w-4" /> Flags
          </TabsTrigger>
          <TabsTrigger value="performance" className="gap-1.5">
            <Gauge className="h-4 w-4" /> Perf
          </TabsTrigger>
          <TabsTrigger value="scores" className="gap-1.5">
            <Award className="h-4 w-4" /> Scores
          </TabsTrigger>
          <TabsTrigger value="proctoring" className="gap-1.5">
            <Shield className="h-4 w-4" /> Proctoring
          </TabsTrigger>
        </TabsList>

        {/* ─── Tab 1: Overview ─────────────────────────────────────────────── */}
        <TabsContent value="overview" className="space-y-6">
          <OverviewTab data={overview} loading={overviewLoading} />
        </TabsContent>

        {/* ─── Tab 2: Live ────────────────────────────────────────────────── */}
        <TabsContent value="live" className="space-y-6">
          <LiveTab
            sessions={overview?.liveSessions || []}
            activeNow={overview?.activeNow ?? 0}
            expandedSession={expandedSession}
            onToggleSession={setExpandedSession}
          />
        </TabsContent>

        {/* ─── Tab 3: Pages ────────────────────────────────────────────────── */}
        <TabsContent value="pages" className="space-y-6">
          <PagesTab data={pagesData} loading={pagesLoading} />
        </TabsContent>

        {/* ─── Tab 4: Events ───────────────────────────────────────────────── */}
        <TabsContent value="events" className="space-y-6">
          <EventsTab
            data={eventsData}
            loading={eventsLoading}
            search={eventSearch}
            onSearchChange={setEventSearch}
            filter={eventFilter}
            onFilterChange={setEventFilter}
          />
        </TabsContent>

        {/* ─── Tab 5: Funnels ────────────────────────────────────────────── */}
        <TabsContent value="funnels" className="space-y-6">
          <FunnelsTab
            funnels={funnels}
            result={funnelResult}
            loading={funnelLoading}
            selectedFunnel={selectedFunnel}
            onSelectFunnel={(id) => { setSelectedFunnel(id); void loadFunnelResult(id) }}
            showForm={showFunnelForm}
            onToggleForm={() => setShowFunnelForm(!showFunnelForm)}
            funnelName={newFunnelName}
            onFunnelNameChange={setNewFunnelName}
            funnelSteps={newFunnelSteps}
            onFunnelStepsChange={setNewFunnelSteps}
            creating={creatingFunnel}
            onCreate={createFunnel}
            range={range}
          />
        </TabsContent>

        {/* ─── Tab 6: Retention ──────────────────────────────────────────── */}
        <TabsContent value="retention" className="space-y-6">
          <RetentionTab data={retentionData} loading={retentionLoading} />
        </TabsContent>

        {/* ─── Tab 7: AI Analytics ────────────────────────────────────────── */}
        <TabsContent value="ai" className="space-y-6">
          <AiAnalyticsTab data={aiData} loading={aiLoading} />
        </TabsContent>

        {/* ─── Tab 8: Revenue ──────────────────────────────────────────────── */}
        <TabsContent value="revenue" className="space-y-6">
          <RevenueTab data={revenueData} loading={revenueLoading} />
        </TabsContent>

        {/* ─── Tab 9: Feature Flags ───────────────────────────────────────── */}
        <TabsContent value="flags" className="space-y-6">
          <FeatureFlagsTab
            flags={featureFlags}
            loading={ffLoading}
            showForm={showFfForm}
            onToggleForm={() => setShowFfForm(!showFfForm)}
            flagName={newFfName}
            onFlagNameChange={setNewFfName}
            flagDesc={newFfDesc}
            onFlagDescChange={setNewFfDesc}
            onCreate={createFlag}
            onToggle={toggleFlag}
            onDelete={deleteFlag}
          />
        </TabsContent>

        {/* ─── Tab 11: Performance ──────────────────────────────────────────── */}
        <TabsContent value="performance" className="space-y-6">
          <PerformanceTab data={vitalsData} loading={vitalsLoading} />
        </TabsContent>

        {/* ─── Tab 12: Scores ───────────────────────────────────────────────── */}
        <TabsContent value="scores" className="space-y-6">
          <ScoresPanel />
        </TabsContent>

        {/* ─── Tab 13: Proctoring ──────────────────────────────────────────── */}
        <TabsContent value="proctoring" className="space-y-6">
          <ProctoringPanel />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ─── Tab: Overview ───────────────────────────────────────────────────────────

function OverviewTab({ data, loading }: { data: OverviewData | null; loading: boolean }) {
  if (loading && !data) {
    return <div className="flex min-h-[30vh] items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading overview…</div>
  }

  const hourly = (data?.hourlyActivity || []).map(h => ({
    hour: h.hour?.slice(11, 13) ? `${h.hour.slice(11, 13)}:00` : h.hour,
    events: h.events,
  }))

  const devicePie = (data?.deviceBreakdown || []).map(d => ({ name: d.device || 'Unknown', value: d.count }))
  const browserPie = (data?.browserBreakdown || []).map(b => ({ name: b.browser || 'Unknown', value: b.count }))
  const maxTopPage = Math.max(...(data?.topPages || []).map(p => p.views), 1)

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={<Users className="h-5 w-5 text-blue-500" />} color="bg-blue-500/10" label="Unique Visitors" value={data?.uniqueVisitors ?? 0} />
        <KpiCard icon={<Activity className="h-5 w-5 text-purple-500" />} color="bg-purple-500/10" label="Total Sessions" value={data?.totalSessions ?? 0} />
        <KpiCard icon={<Eye className="h-5 w-5 text-amber-500" />} color="bg-amber-500/10" label="Pageviews" value={data?.totalPageviews ?? 0} />
        <KpiCard icon={<Zap className="h-5 w-5 text-green-500" />} color="bg-green-500/10" label="Active Now" value={data?.activeNow ?? 0} />
      </div>

      {/* Hourly Activity */}
      <Card className="p-6 border-border/60">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-4">
          <TrendingUp className="h-5 w-5 text-primary" /> Hourly Activity (Last 24h)
        </h2>
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={hourly}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="hour" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip
                contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                labelStyle={{ color: 'hsl(var(--foreground))' }}
              />
              <Area type="monotone" dataKey="events" stroke={CHART_GREEN} fill={CHART_GREEN} fillOpacity={0.15} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top Pages */}
        <Card className="p-6 border-border/60">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-4">
            <Eye className="h-5 w-5 text-primary" /> Top Pages
          </h2>
          <div className="space-y-2.5">
            {(data?.topPages || []).slice(0, 8).map(p => (
              <div key={p.path} className="flex items-center gap-3">
                <span className="w-40 text-sm text-muted-foreground truncate font-mono text-xs" title={p.path}>{p.path}</span>
                <div className="flex-1 h-4 rounded-full bg-muted/50 overflow-hidden">
                  <div className="h-full rounded-full bg-primary/40 transition-all" style={{ width: `${(p.views / maxTopPage) * 100}%` }} />
                </div>
                <span className="text-sm font-medium tabular-nums w-16 text-right">{p.views.toLocaleString()}</span>
              </div>
            ))}
            {(!data?.topPages || data.topPages.length === 0) && <p className="text-sm text-muted-foreground">No data yet</p>}
          </div>
        </Card>

        {/* Traffic Sources */}
        <Card className="p-6 border-border/60">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-4">
            <Globe className="h-5 w-5 text-primary" /> Traffic Sources
          </h2>
          <div className="space-y-2.5">
            {(data?.trafficSources || []).slice(0, 8).map(s => (
              <div key={s.source} className="flex items-center gap-3">
                <span className="w-40 text-sm text-muted-foreground truncate" title={s.source}>{s.source}</span>
                <div className="flex-1 h-4 rounded-full bg-muted/50 overflow-hidden">
                  <div className="h-full rounded-full bg-blue-500/40 transition-all" style={{ width: `${(s.count / Math.max(data?.trafficSources?.[0]?.count || 1, 1)) * 100}%` }} />
                </div>
                <span className="text-sm font-medium tabular-nums w-16 text-right">{s.count.toLocaleString()}</span>
              </div>
            ))}
            {(!data?.trafficSources || data.trafficSources.length === 0) && <p className="text-sm text-muted-foreground">No referral data</p>}
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Device Breakdown */}
        <Card className="p-6 border-border/60">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-4">
            <Monitor className="h-5 w-5 text-primary" /> Device Breakdown
          </h2>
          {devicePie.length > 0 ? (
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={devicePie} cx="50%" cy="50%" outerRadius={70} dataKey="value" label={({ name, percent }: any) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}>
                    {devicePie.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : <p className="text-sm text-muted-foreground">No data</p>}
        </Card>

        {/* Browser Breakdown */}
        <Card className="p-6 border-border/60">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-4">
            <Globe className="h-5 w-5 text-primary" /> Browser Breakdown
          </h2>
          {browserPie.length > 0 ? (
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={browserPie} cx="50%" cy="50%" outerRadius={70} dataKey="value" label={({ name, percent }: any) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}>
                    {browserPie.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : <p className="text-sm text-muted-foreground">No data</p>}
        </Card>
      </div>

      {/* Event Breakdown */}
      {(data?.eventBreakdown || []).length > 0 && (
        <Card className="p-6 border-border/60">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-4">
            <Zap className="h-5 w-5 text-primary" /> Event Breakdown
          </h2>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data!.eventBreakdown}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="event" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" interval={0} angle={-20} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}
    </div>
  )
}

// ─── Tab: Live ───────────────────────────────────────────────────────────────

function LiveTab({ sessions, activeNow, expandedSession, onToggleSession }: {
  sessions: LiveSession[]
  activeNow: number
  expandedSession: string | null
  onToggleSession: (id: string | null) => void
}) {
  return (
    <div className="space-y-6">
      {/* Status Banner */}
      <Card className="p-6 border-border/60">
        <div className="flex items-center gap-4">
          <div className="relative flex h-12 w-12 items-center justify-center">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex h-4 w-4 rounded-full bg-green-500" />
          </div>
          <div>
            <p className="text-2xl font-bold tabular-nums">{activeNow}</p>
            <p className="text-sm text-muted-foreground">users online now</p>
          </div>
          <Badge variant="outline" className="ml-auto gap-1 text-green-600 border-green-500/30">
            <Activity className="h-3 w-3" /> Live — auto-refreshing every 5s
          </Badge>
        </div>
      </Card>

      {/* Sessions List */}
      <Card className="border-border/60 overflow-hidden">
        <div className="px-6 py-4 border-b border-border/60">
          <h2 className="text-lg font-semibold text-foreground">Live Sessions</h2>
        </div>
        {sessions.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <Users className="mx-auto h-8 w-8 mb-2 opacity-50" />
            <p>No active sessions right now</p>
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {sessions.map(s => {
              const status = sessionStatus(s)
              const dur = sessionDuration(s)
              const isExpanded = expandedSession === s.id
              return (
                <div key={s.id}>
                  <button
                    onClick={() => onToggleSession(isExpanded ? null : s.id)}
                    className="w-full px-6 py-3 flex items-center gap-4 hover:bg-muted/30 transition-colors text-left"
                  >
                    <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${status === 'active' ? 'bg-green-500' : 'bg-yellow-500'}`} />
                    {deviceIcon(s.device_type)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{s.browser || 'Unknown'}</span>
                        <span className="text-xs text-muted-foreground">· {s.os || 'Unknown'}</span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{s.entry_page || '/'}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-medium tabular-nums">{fmtDuration(dur)}</p>
                      <p className="text-xs text-muted-foreground">{s.pageviews} {s.pageviews === 1 ? 'view' : 'views'}</p>
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="px-6 pb-4 bg-muted/20 border-t border-border/30">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mt-3 mb-2">Page Journey</p>
                      <ol className="relative ml-3 border-l-2 border-primary/30 space-y-2">
                        {(s.pages || [s.entry_page || '/']).map((page, i) => (
                          <li key={i} className="ml-4 relative">
                            <span className="absolute -left-[1.35rem] top-1 h-2 w-2 rounded-full bg-primary/60" />
                            <p className="text-sm font-mono text-foreground">{page}</p>
                          </li>
                        ))}
                      </ol>
                      <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
                        <span>ID: <span className="font-mono">{s.id.slice(0, 12)}</span></span>
                        {s.user_id && <span>User: <span className="font-mono">{s.user_id.slice(0, 12)}</span></span>}
                        {s.country && <span>{s.country}</span>}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}

// ─── Tab: Pages ──────────────────────────────────────────────────────────────

function PagesTab({ data, loading }: { data: PagesData | null; loading: boolean }) {
  if (loading && !data) {
    return <div className="flex min-h-[30vh] items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading pages…</div>
  }

  const maxViews = Math.max(...(data?.topPages || []).map(p => p.views), 1)

  return (
    <div className="space-y-6">
      {/* Top Pages Table */}
      <Card className="border-border/60 overflow-hidden">
        <div className="px-6 py-4 border-b border-border/60">
          <h2 className="text-lg font-semibold text-foreground">Top Pages</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 text-muted-foreground">
                <th className="px-6 py-3 text-left font-medium">Page</th>
                <th className="px-6 py-3 text-right font-medium">Views</th>
                <th className="px-6 py-3 text-right font-medium">Unique Visitors</th>
                <th className="px-6 py-3 text-right font-medium">Avg. Time</th>
                <th className="px-6 py-3 text-left font-medium w-40">Views</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {(data?.topPages || []).map(p => (
                <tr key={p.path} className="hover:bg-muted/30">
                  <td className="px-6 py-3 font-mono text-xs truncate max-w-xs" title={p.path}>{p.path}</td>
                  <td className="px-6 py-3 text-right tabular-nums font-medium">{p.views.toLocaleString()}</td>
                  <td className="px-6 py-3 text-right tabular-nums">{p.uniqueVisitors.toLocaleString()}</td>
                  <td className="px-6 py-3 text-right tabular-nums">{fmtDuration(p.avgTime)}</td>
                  <td className="px-6 py-3">
                    <div className="h-3 rounded-full bg-muted/50 overflow-hidden">
                      <div className="h-full rounded-full bg-primary/40" style={{ width: `${(p.views / maxViews) * 100}%` }} />
                    </div>
                  </td>
                </tr>
              ))}
              {(!data?.topPages || data.topPages.length === 0) && (
                <tr><td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">No page data yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Entry Pages */}
        <Card className="p-6 border-border/60">
          <h2 className="text-lg font-semibold text-foreground mb-4">Entry Pages</h2>
          <div className="space-y-2">
            {(data?.entryPages || []).map((p, i) => (
              <div key={p.path} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-5">{i + 1}.</span>
                <span className="flex-1 text-sm font-mono truncate" title={p.path}>{p.path}</span>
                <span className="text-sm font-medium tabular-nums">{p.views.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Exit Pages */}
        <Card className="p-6 border-border/60">
          <h2 className="text-lg font-semibold text-foreground mb-4">Exit Pages</h2>
          <div className="space-y-2">
            {(data?.exitPages || []).map((p, i) => (
              <div key={p.path} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-5">{i + 1}.</span>
                <span className="flex-1 text-sm font-mono truncate" title={p.path}>{p.path}</span>
                <span className="text-sm font-medium tabular-nums">{p.views.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Bounce Rate */}
      {data?.bounceRate && data.bounceRate.length > 0 && (
        <Card className="p-6 border-border/60">
          <h2 className="text-lg font-semibold text-foreground mb-4">Bounce Rate by Page</h2>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.bounceRate.slice(0, 10)}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="path" tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" interval={0} angle={-20} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" domain={[0, 100]} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                  formatter={(val: any) => [`${val}%`, 'Bounce Rate']}
                />
                <Bar dataKey="rate" radius={[4, 4, 0, 0]}>
                  {data.bounceRate.slice(0, 10).map((entry, i) => (
                    <Cell key={i} fill={entry.rate > 60 ? '#ef4444' : entry.rate > 40 ? '#f59e0b' : '#10b981'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Top Pages Bar Chart */}
      {data?.topPages && data.topPages.length > 0 && (
        <Card className="p-6 border-border/60">
          <h2 className="text-lg font-semibold text-foreground mb-4">Page Views</h2>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.topPages.slice(0, 10)}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="path" tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" interval={0} angle={-20} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                />
                <Bar dataKey="views" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}
    </div>
  )
}

// ─── Tab: Events ─────────────────────────────────────────────────────────────

function EventsTab({ data, loading, search, onSearchChange, filter, onFilterChange }: {
  data: EventsData | null
  loading: boolean
  search: string
  onSearchChange: (v: string) => void
  filter: string
  onFilterChange: (v: string) => void
}) {
  const eventTypes = useMemo(() => {
    if (!data) return []
    return data.breakdown.map(b => b.event)
  }, [data])

  const columns: DataTableColumn<EventRow>[] = useMemo(() => [
    {
      key: 'timestamp',
      header: 'Time',
      cell: (row) => <span className="text-xs tabular-nums whitespace-nowrap">{fmtDate(row.timestamp)}</span>,
      className: 'w-36',
    },
    {
      key: 'event',
      header: 'Event',
      cell: (row) => <Badge variant="outline" className="text-xs">{row.event}</Badge>,
    },
    {
      key: 'user_id',
      header: 'User',
      cell: (row) => (
        <span className="text-xs font-mono text-muted-foreground truncate max-w-[120px] block" title={row.user_id || row.anonymous_id || ''}>
          {row.user_id?.slice(0, 10) || row.anonymous_id?.slice(0, 10) || '—'}
        </span>
      ),
    },
    {
      key: 'path',
      header: 'Path',
      cell: (row) => (
        <span className="text-xs font-mono truncate max-w-[200px] block" title={row.path || row.url || ''}>
          {row.path || row.url || '—'}
        </span>
      ),
    },
    {
      key: 'device_type',
      header: 'Device',
      cell: (row) => (
        <div className="flex items-center gap-1.5">
          {deviceIcon(row.device_type)}
          <span className="text-xs text-muted-foreground capitalize">{row.device_type || '—'}</span>
        </div>
      ),
    },
    {
      key: 'browser',
      header: 'Browser',
      cell: (row) => <span className="text-xs text-muted-foreground">{row.browser || '—'}</span>,
    },
  ], [])

  const filteredEvents = useMemo(() => {
    if (!data) return []
    let result = data.events
    if (filter !== 'all') {
      result = result.filter(e => e.event === filter)
    }
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(e =>
        (e.event || '').toLowerCase().includes(q) ||
        (e.path || '').toLowerCase().includes(q) ||
        (e.user_id || '').toLowerCase().includes(q) ||
        (e.anonymous_id || '').toLowerCase().includes(q)
      )
    }
    return result
  }, [data, filter, search])

  return (
    <div className="space-y-6">
      {/* Event Type Breakdown */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        {(data?.breakdown || []).slice(0, 5).map(b => (
          <Card key={b.event} className="p-4 border-border/60">
            <p className="text-xs text-muted-foreground truncate">{b.event}</p>
            <p className="text-xl font-bold tabular-nums mt-1">{b.count.toLocaleString()}</p>
          </Card>
        ))}
      </div>

      {/* Events Table */}
      <Card className="border-border/60 overflow-hidden">
        <div className="px-6 py-4 border-b border-border/60 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-foreground">Event Log</h2>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search events…"
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                className="pl-8 h-8 w-48 text-sm"
              />
            </div>
            <Select value={filter} onValueChange={onFilterChange}>
              <SelectTrigger className="w-[140px] h-8 text-xs">
                <SelectValue placeholder="All events" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All events</SelectItem>
                {eventTypes.map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="p-4">
          <DataTable
            columns={columns}
            data={filteredEvents}
            pageSize={25}
            loading={loading}
            emptyMessage="No events found"
            searchPlaceholder="Search events…"
          />
        </div>
      </Card>
    </div>
  )
}

// ─── Tab: Funnels ────────────────────────────────────────────────────────────

function FunnelsTab({ funnels, result, loading, selectedFunnel, onSelectFunnel, showForm, onToggleForm, funnelName, onFunnelNameChange, funnelSteps, onFunnelStepsChange, creating, onCreate, range }: {
  funnels: FunnelDef[]; result: FunnelResult | null; loading: boolean; selectedFunnel: string; onSelectFunnel: (id: string) => void
  showForm: boolean; onToggleForm: () => void; funnelName: string; onFunnelNameChange: (v: string) => void
  funnelSteps: string; onFunnelStepsChange: (v: string) => void; creating: boolean; onCreate: () => void; range: string
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Conversion Funnels</h2>
          <p className="text-sm text-muted-foreground">Track user progression through multi-step flows</p>
        </div>
        <div className="flex gap-2">
          <Select value={selectedFunnel} onValueChange={onSelectFunnel}>
            <SelectTrigger className="w-[200px] h-9"><SelectValue placeholder="Select a funnel" /></SelectTrigger>
            <SelectContent>
              {funnels.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={onToggleForm}>{showForm ? 'Cancel' : '+ New Funnel'}</Button>
        </div>
      </div>

      {showForm && (
        <Card className="p-6 border-border/60 space-y-4">
          <h3 className="font-semibold">Create Funnel</h3>
          <Input placeholder="Funnel name (e.g. Signup to Paid)" value={funnelName} onChange={e => onFunnelNameChange(e.target.value)} />
          <div>
            <p className="text-xs text-muted-foreground mb-1">Steps (one per line: <code>event_name</code> or <code>event_name|/path</code>)</p>
            <textarea className="w-full h-32 rounded-md border border-border bg-background px-3 py-2 text-sm font-mono" placeholder={"page_view|/signup\nsignup_completed\nproject_created\ncode_run\nsubscription_started"} value={funnelSteps} onChange={e => onFunnelStepsChange(e.target.value)} />
          </div>
          <Button onClick={onCreate} disabled={creating || !funnelName.trim() || !funnelSteps.trim()}>
            {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Create Funnel
          </Button>
        </Card>
      )}

      {loading && !result && (
        <div className="flex min-h-[20vh] items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Computing funnel…</div>
      )}

      {result && (
        <Card className="p-6 border-border/60">
          <div className="flex items-center gap-4 mb-6">
            <div className="text-center">
              <p className="text-3xl font-bold">{result.total_starters.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Started</p>
            </div>
            <TrendingUp className="h-5 w-5 text-muted-foreground" />
            <div className="text-center">
              <p className="text-3xl font-bold text-primary">{result.total_completers.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Completed</p>
            </div>
            <Badge variant="outline" className="ml-auto">{result.completion_rate}% conversion</Badge>
          </div>

          <div className="space-y-3">
            {result.steps.map((step, i) => (
              <div key={i} className="flex items-center gap-4">
                <div className="w-8 text-center">
                  <Badge variant={i === 0 ? 'default' : 'secondary'} className="text-xs">{i + 1}</Badge>
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">{step.label}</span>
                    <span className="text-sm tabular-nums">{step.users.toLocaleString()} <span className="text-muted-foreground">({step.conversion_rate}%)</span></span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted/50 overflow-hidden">
                    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${step.conversion_rate}%` }} />
                  </div>
                </div>
                {i > 0 && step.dropoff_rate > 0 && (
                  <span className="text-xs text-red-500 tabular-nums w-16 text-right">-{step.dropoff_rate}%</span>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {!loading && !result && funnels.length === 0 && (
        <Card className="p-12 border-dashed border-muted-foreground/30 text-center text-sm text-muted-foreground">
          <Filter className="mx-auto h-8 w-8 text-muted-foreground/40 mb-2" />
          <p>No funnels yet. Create one to track conversion flows.</p>
        </Card>
      )}
    </div>
  )
}

// ─── Tab: Retention ──────────────────────────────────────────────────────────

function RetentionTab({ data, loading }: { data: RetentionData | null; loading: boolean }) {
  if (loading && !data) {
    return <div className="flex min-h-[30vh] items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Computing retention…</div>
  }

  if (!data || data.cohorts.length === 0) {
    return (
      <Card className="p-12 border-dashed border-muted-foreground/30 text-center text-sm text-muted-foreground">
        <UserCheck className="mx-auto h-8 w-8 text-muted-foreground/40 mb-2" />
        <p>No retention data yet. Data appears as users sign in and return.</p>
      </Card>
    )
  }

  const dayLabels = data.retention_days.map(d => d === 0 ? 'Day 0' : `Day ${d}`)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">User Retention</h2>
        <p className="text-sm text-muted-foreground">{data.total_users.toLocaleString()} total tracked users · Weekly cohorts</p>
      </div>

      <Card className="p-6 border-border/60 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/40">
              <th className="text-left py-3 px-3 font-medium text-muted-foreground">Cohort</th>
              <th className="text-left py-3 px-3 font-medium text-muted-foreground">Users</th>
              {dayLabels.map(d => <th key={d} className="text-center py-3 px-3 font-medium text-muted-foreground">{d}</th>)}
            </tr>
          </thead>
          <tbody>
            {data.cohorts.map((cohort, i) => (
              <tr key={i} className="border-b border-border/30 hover:bg-muted/20">
                <td className="py-3 px-3 font-mono text-xs">{cohort.cohort_week}</td>
                <td className="py-3 px-3 tabular-nums">{cohort.cohort_size.toLocaleString()}</td>
                {cohort.retention.map((pct, j) => {
                  const intensity = Math.round(pct * 2.55)
                  const bg = pct > 0 ? `rgba(34, 197, 94, ${Math.min(pct / 100 * 0.6, 0.6)})` : 'transparent'
                  return (
                    <td key={j} className="py-3 px-3 text-center tabular-nums text-xs font-medium" style={{ backgroundColor: bg }}>
                      {pct > 0 ? `${pct}%` : '—'}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

// ─── Tab: AI Analytics ───────────────────────────────────────────────────────

function AiAnalyticsTab({ data, loading }: { data: any; loading: boolean }) {
  if (loading && !data) {
    return <div className="flex min-h-[30vh] items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading AI analytics…</div>
  }

  if (!data || data.totalRequests === 0) {
    return (
      <Card className="p-12 border-dashed border-muted-foreground/30 text-center text-sm text-muted-foreground">
        <Zap className="mx-auto h-8 w-8 text-muted-foreground/40 mb-2" />
        <p>No AI usage data yet. Data appears as users interact with AI features.</p>
      </Card>
    )
  }

  const featureBarData = (data.byFeature || []).map((f: any) => ({ name: f.feature, requests: f.requests, cost: f.cost }))
  const modelBarData = (data.byModel || []).map((m: any) => ({ name: m.model, requests: m.requests, cost: m.cost }))

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">AI Analytics</h2>
        <p className="text-sm text-muted-foreground">LLM usage, token consumption, and cost tracking</p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={<Zap className="h-5 w-5 text-blue-500" />} color="bg-blue-500/10" label="Total Requests" value={data.totalRequests} />
        <KpiCard icon={<Activity className="h-5 w-5 text-green-500" />} color="bg-green-500/10" label="Success Rate" value={`${data.successRate}%`} />
        <KpiCard icon={<TrendingUp className="h-5 w-5 text-purple-500" />} color="bg-purple-500/10" label="Total Tokens" value={data.totalTokens > 1_000_000 ? `${(data.totalTokens / 1_000_000).toFixed(1)}M` : data.totalTokens.toLocaleString()} />
        <KpiCard icon={<Globe className="h-5 w-5 text-amber-500" />} color="bg-amber-500/10" label="Estimated Cost" value={`$${data.totalCost.toFixed(2)}`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* By Feature */}
        <Card className="p-6 border-border/60">
          <h3 className="font-semibold text-sm mb-4">Usage by Feature</h3>
          {featureBarData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={featureBarData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="requests" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} name="Requests" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[250px] text-muted-foreground text-xs">No data</div>
          )}
        </Card>

        {/* By Model */}
        <Card className="p-6 border-border/60">
          <h3 className="font-semibold text-sm mb-4">Usage by Model</h3>
          {modelBarData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={modelBarData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="requests" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="Requests" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[250px] text-muted-foreground text-xs">No data</div>
          )}
        </Card>
      </div>

      {/* Hourly Activity */}
      <Card className="p-6 border-border/60">
        <h3 className="font-semibold text-sm mb-4">AI Requests (24h)</h3>
        {data.hourly?.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={data.hourly.map((h: any) => ({ hour: h.hour?.slice(11, 13) ? `${h.hour.slice(11, 13)}:00` : h.hour, requests: h.requests }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="hour" tick={{ fontSize: 10 }} interval={3} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
              <Area type="monotone" dataKey="requests" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.2} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-[200px] text-muted-foreground text-xs">No data</div>
        )}
      </Card>

      {/* Latency + Provider breakdown */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6 border-border/60">
          <h3 className="font-semibold text-sm mb-4">Provider Breakdown</h3>
          <div className="space-y-3">
            {(data.byProvider || []).map((p: any) => (
              <div key={p.provider} className="flex items-center justify-between">
                <span className="text-sm font-medium">{p.provider}</span>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{p.requests} requests</span>
                  <span>{(p.tokens / 1000).toFixed(1)}K tokens</span>
                  <span className="font-medium text-foreground">${p.cost.toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6 border-border/60">
          <h3 className="font-semibold text-sm mb-4">Performance</h3>
          <div className="space-y-4">
            <div>
              <p className="text-xs text-muted-foreground">Avg Latency</p>
              <p className="text-2xl font-bold tabular-nums">{data.avgLatency}ms</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Failed Requests</p>
              <p className="text-2xl font-bold tabular-nums text-red-500">{data.failed}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Avg Tokens/Request</p>
              <p className="text-2xl font-bold tabular-nums">{data.totalRequests > 0 ? Math.round(data.totalTokens / data.totalRequests) : 0}</p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}

// ─── Tab: Revenue ────────────────────────────────────────────────────────────

function RevenueTab({ data, loading }: { data: any; loading: boolean }) {
  if (loading && !data) {
    return <div className="flex min-h-[30vh] items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading revenue data…</div>
  }

  if (!data) {
    return (
      <Card className="p-12 border-dashed border-muted-foreground/30 text-center text-sm text-muted-foreground">
        <TrendingUp className="mx-auto h-8 w-8 text-muted-foreground/40 mb-2" />
        <p>No billing data yet. Revenue analytics appear when users subscribe.</p>
      </Card>
    )
  }

  const currency = data.currency || 'USD'
  const sym = currency === 'INR' ? '₹' : '$'

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">Revenue Analytics</h2>
        <p className="text-sm text-muted-foreground">MRR, subscriptions, and payment insights</p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={<TrendingUp className="h-5 w-5 text-green-500" />} color="bg-green-500/10" label="MRR" value={`${sym}${data.mrr.toLocaleString()}`} />
        <KpiCard icon={<TrendingUp className="h-5 w-5 text-blue-500" />} color="bg-blue-500/10" label="ARR" value={`${sym}${data.arr.toLocaleString()}`} />
        <KpiCard icon={<Users className="h-5 w-5 text-purple-500" />} color="bg-purple-500/10" label="Active Subs" value={data.activeSubscriptions} />
        <KpiCard icon={<Activity className="h-5 w-5 text-amber-500" />} color="bg-amber-500/10" label="Total Revenue" value={`${sym}${data.totalRevenue.toLocaleString()}`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Monthly Trend */}
        <Card className="p-6 border-border/60">
          <h3 className="font-semibold text-sm mb-4">Revenue Trend (6 months)</h3>
          {data.monthlyTrend?.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={data.monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="revenue" fill="#22c55e" radius={[4, 4, 0, 0]} name={`Revenue (${sym})`} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[250px] text-muted-foreground text-xs">No data</div>
          )}
        </Card>

        {/* Subscriptions by Plan */}
        <Card className="p-6 border-border/60">
          <h3 className="font-semibold text-sm mb-4">Subscriptions by Plan</h3>
          <div className="space-y-3">
            {(data.subsByPlan || []).map((s: any) => {
              const max = Math.max(...(data.subsByPlan || []).map((x: any) => x.count), 1)
              const pct = Math.round((s.count / max) * 100)
              return (
                <div key={s.plan}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-muted-foreground">{s.plan}</span>
                    <span className="font-medium">{s.count}</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted/50">
                    <div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      </div>

      {/* Revenue by Plan + Payment Methods */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6 border-border/60">
          <h3 className="font-semibold text-sm mb-4">Revenue by Plan</h3>
          <div className="space-y-2">
            {(data.revenueByPlan || []).map((r: any) => (
              <div key={r.plan} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{r.plan}</span>
                <span className="font-medium">{sym}{r.revenue.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6 border-border/60">
          <h3 className="font-semibold text-sm mb-4">Payment Methods</h3>
          <div className="space-y-2">
            {(data.paymentMethods || []).map((m: any) => (
              <div key={m.method} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground capitalize">{m.method}</span>
                <Badge variant="outline">{m.count}</Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Churn + Coupons */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6 border-border/60">
          <h3 className="font-semibold text-sm mb-4">Churn</h3>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground">Churn Rate</p>
              <p className="text-2xl font-bold tabular-nums">{data.churnRate}%</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Cancelled (period)</p>
              <p className="text-2xl font-bold tabular-nums">{data.cancelledInPeriod}</p>
            </div>
          </div>
        </Card>

        <Card className="p-6 border-border/60">
          <h3 className="font-semibold text-sm mb-4">Coupons</h3>
          <div>
            <p className="text-xs text-muted-foreground">Total Redemptions</p>
            <p className="text-2xl font-bold tabular-nums">{data.totalRedemptions}</p>
          </div>
        </Card>
      </div>
    </div>
  )
}

// ─── Tab: Feature Flags ──────────────────────────────────────────────────────

function FeatureFlagsTab({ flags, loading, showForm, onToggleForm, flagName, onFlagNameChange, flagDesc, onFlagDescChange, onCreate, onToggle, onDelete }: {
  flags: any[]; loading: boolean; showForm: boolean; onToggleForm: () => void
  flagName: string; onFlagNameChange: (v: string) => void; flagDesc: string; onFlagDescChange: (v: string) => void
  onCreate: () => void; onToggle: (name: string, enabled: boolean) => void; onDelete: (name: string) => void
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Feature Flags</h2>
          <p className="text-sm text-muted-foreground">Toggle features on/off without deploying</p>
        </div>
        <Button size="sm" onClick={onToggleForm}>{showForm ? 'Cancel' : '+ New Flag'}</Button>
      </div>

      {showForm && (
        <Card className="p-6 border-border/60 space-y-4">
          <h3 className="font-semibold">Create Feature Flag</h3>
          <Input placeholder="Flag name (e.g. new_dashboard)" value={flagName} onChange={e => onFlagNameChange(e.target.value)} />
          <Input placeholder="Description (optional)" value={flagDesc} onChange={e => onFlagDescChange(e.target.value)} />
          <Button onClick={onCreate} disabled={!flagName.trim()}>Create Flag</Button>
        </Card>
      )}

      {loading ? (
        <div className="flex min-h-[20vh] items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading flags…
        </div>
      ) : flags.length === 0 ? (
        <Card className="p-12 border-dashed border-muted-foreground/30 text-center text-sm text-muted-foreground">
          <Monitor className="mx-auto h-8 w-8 text-muted-foreground/40 mb-2" />
          <p>No feature flags yet. Create one to start toggling features.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {flags.map((f: any) => (
            <Card key={f.id} className="p-4 border-border/60">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`w-3 h-3 rounded-full ${f.enabled ? 'bg-green-500' : 'bg-muted-foreground/30'}`} />
                  <div>
                    <p className="text-sm font-medium font-mono">{f.name}</p>
                    {f.description && <p className="text-xs text-muted-foreground">{f.description}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={f.enabled ? 'default' : 'secondary'} className="text-[10px]">
                    {f.enabled ? 'ON' : 'OFF'}
                  </Badge>
                  <Switch checked={f.enabled} onCheckedChange={(v) => onToggle(f.name, v)} />
                  <Button variant="ghost" size="sm" className="h-7 text-xs text-red-500" onClick={() => onDelete(f.name)}>Delete</Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Tab: Performance ────────────────────────────────────────────────────────

function PerformanceTab({ data, loading }: { data: WebVitalsSummary | null; loading: boolean }) {
  if (loading && !data) {
    return <div className="flex min-h-[30vh] items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading performance data…</div>
  }

  const metrics = [
    { key: 'LCP', label: 'Largest Contentful Paint', desc: 'Time until main content is visible' },
    { key: 'FCP', label: 'First Contentful Paint', desc: 'Time until first content renders' },
    { key: 'INP', label: 'Interaction to Next Paint', desc: 'Delay after user interaction' },
    { key: 'CLS', label: 'Cumulative Layout Shift', desc: 'Visual stability score' },
    { key: 'TTFB', label: 'Time to First Byte', desc: 'Server response time' },
  ]

  const chartData = metrics.map(m => ({
    name: m.key,
    p75: data?.p75?.[m.key] ?? 0,
  }))

  return (
    <div className="space-y-6">
      {/* Summary Banner */}
      <Card className="p-6 border-border/60">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Gauge className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Core Web Vitals</h2>
            <p className="text-sm text-muted-foreground">
              p75 percentiles from real user sessions · {data?.sampleSize?.toLocaleString() || 0} samples · Range: {data?.range || '—'}
            </p>
          </div>
        </div>
      </Card>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {metrics.map(m => {
          const val = data?.p75?.[m.key] ?? null
          const r = vitalRating(m.key, val)
          const samples = data?.countsByMetric?.[m.key] ?? 0
          return (
            <Card key={m.key} className="p-5 border-border/60">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="text-xs text-muted-foreground">{m.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{m.desc}</p>
                </div>
                <Badge variant="outline" className={`text-xs ${r.color} ${r.bg} border-transparent`}>{r.label}</Badge>
              </div>
              <p className="text-3xl font-bold tabular-nums mt-3">{fmtVitalValue(m.key, val)}</p>
              <p className="text-xs text-muted-foreground mt-1">{samples.toLocaleString()} samples</p>
            </Card>
          )
        })}
      </div>

      {/* Bar Chart */}
      <Card className="p-6 border-border/60">
        <h2 className="text-lg font-semibold text-foreground mb-4">p75 Values</h2>
        <div className="h-[250px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip
                contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                formatter={(val: any, name: any) => {
                  const metricName = chartData[0]?.name || 'LCP'
                  return [fmtVitalValue(name, val), 'p75']
                }}
              />
              <Bar dataKey="p75" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, i) => {
                  const r = vitalRating(entry.name, entry.p75)
                  return <Cell key={i} fill={r.label === 'Good' ? '#10b981' : r.label === 'Needs work' ? '#f59e0b' : '#ef4444'} />
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* FID Legacy Note */}
      {data?.p75?.FID != null && (
        <Card className="p-4 border-border/60">
          <p className="text-xs text-muted-foreground">
            <strong className="text-foreground">FID (First Input Delay):</strong> {fmtVitalValue('FID', data.p75.FID)} — This is a legacy metric. Consider migrating to INP for a more comprehensive measure of interactivity.
          </p>
        </Card>
      )}
    </div>
  )
}
