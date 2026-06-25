'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Activity, CheckCircle2, Gauge, Info, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase-client'
import { DASHBOARD_ROUTES, getDefaultDashboard, isSuperAdmin, normalizeUserRole } from '@/lib/rbac'

type VitalsSummary = {
  range: string
  route: string
  since: string
  sampleSize: number
  p75: Record<string, number | null>
  countsByMetric: Record<string, number>
}

function formatP75(name: string, value: number | null): string {
  if (value == null) return '—'
  if (name === 'CLS') return value.toFixed(3)
  return `${Math.round(value)} ms`
}

function lcpExperienceLabel(ms: number | null): { label: string; sub: string; tone: string; Icon: typeof CheckCircle2 } {
  if (ms == null) {
    return {
      label: 'No LCP data',
      sub: 'Collect events in this range',
      tone: 'border-border/60 bg-muted/20 text-muted-foreground',
      Icon: Activity,
    }
  }
  if (ms <= 2500) {
    return {
      label: 'Great',
      sub: 'LCP p75 ≤ 2.5s (CrUX-style)',
      tone: 'border-emerald-500/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300',
      Icon: CheckCircle2,
    }
  }
  if (ms <= 4000) {
    return {
      label: 'Needs improvement',
      sub: 'LCP p75 between 2.5s and 4s',
      tone: 'border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-300',
      Icon: Activity,
    }
  }
  return {
    label: 'Poor',
    sub: 'LCP p75 > 4s',
    tone: 'border-red-500/40 bg-red-500/5 text-red-600 dark:text-red-400',
    Icon: TriangleAlert,
  }
}

const METRIC_CARDS: { key: string; title: string }[] = [
  { key: 'LCP', title: 'Largest Contentful Paint' },
  { key: 'INP', title: 'Interaction to Next Paint' },
  { key: 'CLS', title: 'Cumulative Layout Shift' },
  { key: 'FCP', title: 'First Contentful Paint' },
  { key: 'TTFB', title: 'Time to First Byte' },
  { key: 'FID', title: 'First Input Delay (legacy)' },
]

export default function SpeedInsightsPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [range, setRange] = useState('24h')
  const [routeScope, setRouteScope] = useState('all')
  const [summary, setSummary] = useState<VitalsSummary | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryError, setSummaryError] = useState<string | null>(null)

  const loadSummary = useCallback(async () => {
    if (!ready) return
    setSummaryLoading(true)
    setSummaryError(null)
    try {
      const q = new URLSearchParams({ range, route: routeScope })
      const res = await fetch(`/api/analytics/web-vitals/summary?${q}`, { credentials: 'include' })
      const body = (await res.json()) as VitalsSummary & { error?: string }
      if (!res.ok) {
        setSummary(null)
        setSummaryError(body.error || res.statusText)
        return
      }
      setSummary(body)
    } catch (e) {
      setSummary(null)
      setSummaryError(e instanceof Error ? e.message : 'Failed to load summary')
    } finally {
      setSummaryLoading(false)
    }
  }, [ready, range, routeScope])

  useEffect(() => {
    const run = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth/login')
        return
      }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      const meta = (user.user_metadata as { role?: string } | undefined)?.role
      const role = normalizeUserRole(profile?.role ?? meta)
      if (!isSuperAdmin(role)) {
        router.replace(getDefaultDashboard(role))
        return
      }
      setReady(true)
    }
    void run()
  }, [router])

  useEffect(() => {
    void loadSummary()
  }, [loadSummary])

  if (!ready) {
    return <div className="flex min-h-[30vh] items-center justify-center text-muted-foreground">Loading…</div>
  }

  const lcp = summary?.p75?.LCP ?? null
  const exp = lcpExperienceLabel(lcp)

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Gauge className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Speed Insights</h1>
            <p className="mt-1 text-muted-foreground">
              Superadmin view of <strong className="text-foreground">web_vitals_events</strong> (p75 by metric, optional
              route filter). Events are posted from the dashboard shell via{' '}
              <span className="font-mono">POST /api/analytics/web-vitals</span>.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={range} onValueChange={setRange}>
            <SelectTrigger className="w-[180px] border-border/60 bg-card">
              <SelectValue placeholder="Range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">Last 24 hours</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
            </SelectContent>
          </Select>
          <Select value={routeScope} onValueChange={setRouteScope}>
            <SelectTrigger className="w-[220px] border-border/60 bg-card">
              <SelectValue placeholder="Route" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All routes</SelectItem>
              <SelectItem value="/">Landing /</SelectItem>
              <SelectItem value="/dashboard">/dashboard</SelectItem>
              <SelectItem value="/dashboard/scanner">/dashboard/scanner</SelectItem>
              <SelectItem value="/auth/login">/auth/login</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Alert className="border-border/60 bg-muted/30">
        <Info className="h-4 w-4" />
        <AlertTitle>Data sources</AlertTitle>
        <AlertDescription className="text-muted-foreground">
          Aggregates load from <span className="font-mono">GET /api/analytics/web-vitals/summary</span> (superadmin,
          cookie session). {summaryLoading ? 'Refreshing…' : summary ? `${summary.sampleSize} raw rows in window.` : ''}
          {summaryError ? (
            <span className="mt-2 block text-destructive">Error: {summaryError}</span>
          ) : null}
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {METRIC_CARDS.map(({ key, title }) => {
          const p75 = summary?.p75?.[key] ?? null
          const n = summary?.countsByMetric?.[key] ?? 0
          return (
            <Card key={key} className="border-border/60 p-6">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-foreground">{title}</h2>
                <Badge variant="outline" className="font-mono font-normal text-muted-foreground">
                  {key}
                </Badge>
              </div>
              <p className="text-2xl font-semibold tracking-tight text-foreground">{formatP75(key, p75)}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                p75 · {n} sample{n === 1 ? '' : 's'} · {range}
                {routeScope !== 'all' ? ` · route ${routeScope}` : ''}
              </p>
            </Card>
          )
        })}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {(() => {
          const Icon = exp.Icon
          return (
            <Card className={cn('border p-6', exp.tone)}>
              <div className="flex items-center gap-2">
                <Icon className="h-5 w-5 shrink-0" />
                <div>
                  <p className="font-semibold">{exp.label}</p>
                  <p className="text-xs opacity-80">{exp.sub}</p>
                </div>
              </div>
              <p className="mt-4 text-sm text-muted-foreground">
                {lcp != null ? `Current LCP p75: ${Math.round(lcp)} ms` : 'No LCP samples for this filter.'}
              </p>
            </Card>
          )
        })()}
        <Card className="border-border/60 bg-muted/10 p-6">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 shrink-0 text-muted-foreground" />
            <div>
              <p className="font-semibold text-foreground">INP health</p>
              <p className="text-xs text-muted-foreground">p75 ≤ 200 ms is a common target</p>
            </div>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            {summary?.p75?.INP != null
              ? `INP p75: ${Math.round(summary.p75.INP)} ms (${summary.countsByMetric?.INP ?? 0} samples)`
              : 'No INP samples in this window.'}
          </p>
        </Card>
        <Card className="border-border/60 bg-muted/10 p-6">
          <div className="flex items-center gap-2">
            <Gauge className="h-5 w-5 shrink-0 text-muted-foreground" />
            <div>
              <p className="font-semibold text-foreground">CLS stability</p>
              <p className="text-xs text-muted-foreground">Lower is better (&lt; 0.1 good)</p>
            </div>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            {summary?.p75?.CLS != null
              ? `CLS p75: ${summary.p75.CLS.toFixed(3)} (${summary.countsByMetric?.CLS ?? 0} samples)`
              : 'No CLS samples in this window.'}
          </p>
        </Card>
      </div>

      <Card className="border-border/60 p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Countries</h2>
          <Button variant="outline" size="sm" asChild>
            <a href={DASHBOARD_ROUTES.platform.cdn}>Open CDN map</a>
          </Button>
        </div>
        <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
          <div className="flex min-h-[220px] items-center justify-center rounded-lg border border-dashed border-border/60 bg-muted/20 text-sm text-muted-foreground">
            Geo is not stored on vitals events yet — extend the table and reporter when you need regional breakdowns.
          </div>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>World map and regional ranking can consume the same summary API once `country` (or `geo`) exists.</p>
            <p className="text-xs">Filters above re-fetch the summary.</p>
          </div>
        </div>
      </Card>
    </div>
  )
}
