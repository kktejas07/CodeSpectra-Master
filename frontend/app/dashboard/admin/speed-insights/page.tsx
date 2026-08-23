'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Activity, CheckCircle2, Gauge, HelpCircle, Info, TriangleAlert, Timer, MousePointer, Layout, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePageGuard } from '@/lib/use-page-guard'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

type VitalsSummary = {
  range: string; route: string; since: string
  sampleSize: number; p75: Record<string, number | null>
  countsByMetric: Record<string, number>
}

function fmtP75(name: string, value: number | null): string {
  if (value == null) return '—'
  if (name === 'CLS') return value.toFixed(3)
  return `${Math.round(value)} ms`
}

function rating(ms: number | null): { label: string; color: string } {
  if (ms == null) return { label: 'No data', color: 'text-muted-foreground' }
  if (ms <= 2500) return { label: 'Good', color: 'text-green-500' }
  if (ms <= 4000) return { label: 'Needs work', color: 'text-amber-500' }
  return { label: 'Poor', color: 'text-red-500' }
}

const METRICS = [
  { key: 'LCP', title: 'Largest Contentful Paint', icon: Layout, desc: 'Loading performance — time until main content is visible' },
  { key: 'FCP', title: 'First Contentful Paint', icon: Timer, desc: 'Time until first content renders on screen' },
  { key: 'INP', title: 'Interaction to Next Paint', icon: MousePointer, desc: 'Responsiveness — delay after user interaction' },
  { key: 'CLS', title: 'Cumulative Layout Shift', icon: Layout, desc: 'Visual stability — how much the page layout shifts' },
  { key: 'TTFB', title: 'Time to First Byte', icon: Timer, desc: 'Server response time' },
  { key: 'FID', title: 'First Input Delay', icon: MousePointer, desc: 'Time to respond to first user interaction (legacy)' },
]

export default function SpeedInsightsPage() {
  const gate = usePageGuard('/dashboard/admin/speed-insights')
  const [range, setRange] = useState('24h')
  const [routeScope, setRouteScope] = useState('all')
  const [summary, setSummary] = useState<VitalsSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const load = useCallback(async () => {
    if (!gate.ready) return
    setLoading(true)
    try {
      const q = new URLSearchParams({ range, route: routeScope })
      const res = await fetch(`/api/analytics/web-vitals/summary?${q}`, { credentials: 'include' })
      const body = await res.json()
      if (res.ok) setSummary(body)
    } catch { /* ignore */ }
    finally { setLoading(false); setLastUpdated(new Date()) }
  }, [gate.ready, range, routeScope])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    const interval = setInterval(() => { void load() }, 30_000)
    return () => clearInterval(interval)
  }, [load])

  if (!gate.ready) return null

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10"><Gauge className="h-6 w-6 text-primary" /></div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Speed Insights</h1>
            <div className="flex items-center gap-1.5 mt-1">
              <p className="text-muted-foreground">Core Web Vitals from real user sessions</p>
              <TooltipProvider><Tooltip><TooltipTrigger asChild><HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" /></TooltipTrigger><TooltipContent side="right"><p className="text-xs max-w-62.5">Real User Monitoring (RUM) — p75 percentiles from web_vitals_events. Events posted from the dashboard shell via POST /api/analytics/web-vitals.</p></TooltipContent></Tooltip></TooltipProvider>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={range} onValueChange={setRange}>
            <SelectTrigger className="w-[150px] h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="24h">Last 24 hours</SelectItem><SelectItem value="7d">Last 7 days</SelectItem><SelectItem value="30d">Last 30 days</SelectItem></SelectContent>
          </Select>
          <Select value={routeScope} onValueChange={setRouteScope}>
            <SelectTrigger className="w-[180px] h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All routes</SelectItem><SelectItem value="/">Landing /</SelectItem><SelectItem value="/dashboard">/dashboard</SelectItem><SelectItem value="/dashboard/scanner">/dashboard/scanner</SelectItem></SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => load()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Refresh'}
          </Button>
        </div>
      </div>

      {/* Data source info */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Info className="h-3.5 w-3.5 shrink-0" />
        <span>Real user events from <code className="bg-muted px-1 rounded">web_vitals_events</code> collection</span>
        {summary && <Badge variant="secondary" className="text-[10px]">{summary.sampleSize} samples</Badge>}
        {lastUpdated && <span className="text-[10px] text-muted-foreground ml-auto">Updated {lastUpdated.toLocaleTimeString()}</span>}
      </div>

      {/* Metric cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {METRICS.map(({ key, title, icon: Icon, desc }) => {
          const p75 = summary?.p75?.[key] ?? null
          const n = summary?.countsByMetric?.[key] ?? 0
          const r = rating(key === 'CLS' ? (p75 != null ? p75 * 1000 : null) : p75)
          return (
            <Card key={key} className="border-border/60 p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-sm font-semibold">{title}</h2>
                </div>
                <Badge variant="outline" className="font-mono text-[10px]">{key}</Badge>
              </div>
              <p className="text-2xl font-bold tabular-nums">{fmtP75(key, p75)}</p>
              <div className="flex items-center justify-between mt-2">
                <span className={`text-xs font-medium ${r.color}`}>{r.label}</span>
                <span className="text-xs text-muted-foreground">{n} samples</span>
              </div>
              <TooltipProvider><Tooltip><TooltipTrigger asChild><HelpCircle className="h-3 w-3 text-muted-foreground cursor-help mt-2" /></TooltipTrigger><TooltipContent side="bottom"><p className="text-xs max-w-[200px]">{desc}</p></TooltipContent></Tooltip></TooltipProvider>
            </Card>
          )
        })}

        {summary && summary.sampleSize === 0 && (
          <Card className="border-dashed border-muted-foreground/30 p-8 text-center col-span-full space-y-4">
            <Gauge className="h-10 w-10 text-muted-foreground mx-auto" />
            <div className="space-y-2">
              <p className="text-base font-semibold">No web vitals data collected yet</p>
              <p className="text-sm text-muted-foreground max-w-lg mx-auto leading-relaxed">
                Core Web Vitals are performance metrics that measure real-world user experience on your site.
                Data is collected automatically from real user visits — it may take some time for metrics to appear
                as visitors browse your dashboard.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 max-w-2xl mx-auto text-left">
              {METRICS.slice(0, 5).map(({ key, title, desc }) => (
                <div key={key} className="rounded-lg border border-border/60 p-3 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className="font-mono text-[10px]">{key}</Badge>
                    <span className="text-xs font-medium">{title}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug">{desc}</p>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      {/* Summary bar */}
      <Card className="border-border/60 p-4 flex items-center justify-between">
        <div className="flex items-center gap-4 text-sm">
          <span className="text-muted-foreground">Window:</span>
          <Badge variant="outline">{range}</Badge>
          <Badge variant="outline">{routeScope === 'all' ? 'All routes' : routeScope}</Badge>
          {summary && <span className="text-muted-foreground text-xs">{summary.sampleSize} total events</span>}
        </div>
        <div className="flex items-center gap-2">
          <Badge className={summary?.p75?.LCP && summary.p75.LCP <= 2500 ? 'bg-green-500/20 text-green-700' : 'bg-amber-500/20 text-amber-700'}>
            {summary?.p75?.LCP && summary.p75.LCP <= 2500 ? 'LCP ✓' : 'LCP needs attention'}
          </Badge>
        </div>
      </Card>
    </div>
  )
}


