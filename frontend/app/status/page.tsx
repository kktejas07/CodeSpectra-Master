'use client'
import { formatTime } from '@/lib/format-datetime'

import { useEffect, useState } from 'react'
import { CheckCircle2, AlertTriangle, XCircle, RefreshCw } from 'lucide-react'
import { PublicPageWrapper } from '@/app/public-layout'
import { PageHero, btnSecondary } from '@/components/landing/page-hero'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { cn } from '@/lib/utils'

type ComponentStatus = {
  name: string
  status: 'operational' | 'degraded' | 'down'
  latency?: number
  message?: string
}

type LogEntry = {
  timestamp: string
  status: 'operational' | 'degraded' | 'down'
  components: ComponentStatus[]
}

type StatusData = {
  status: string
  updated_at: string
  components: ComponentStatus[]
  historical_logs: LogEntry[]
}

export default function StatusPage() {
  const [data, setData] = useState<StatusData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchStatus = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/status')
      if (res.ok) {
        setData(await res.json())
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStatus()
  }, [])

  const refreshButton = (
    <button type="button" onClick={fetchStatus} disabled={loading} className={btnSecondary}>
      <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin motion-reduce:animate-none')} aria-hidden />
      Refresh status
    </button>
  )

  if (loading && !data) {
    return (
      <PublicPageWrapper>
        <PageHero title="CodeSpectra status" lead="Live checks and recent history for every part of the platform." />
        <div className="flex h-64 items-center justify-center">
          <RefreshCw className="h-6 w-6 animate-spin text-cs-ink-soft motion-reduce:animate-none" aria-label="Loading status" />
        </div>
      </PublicPageWrapper>
    )
  }

  if (!data) {
    return (
      <PublicPageWrapper>
        <PageHero title="CodeSpectra status" lead="Live checks and recent history for every part of the platform." actions={refreshButton} />
        <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
          <div role="alert" className="rounded-3xl border border-cs-flag/30 bg-cs-flag/5 p-8 text-center text-cs-flag">
            Status couldn&apos;t be loaded. Try refreshing in a moment.
          </div>
        </div>
      </PublicPageWrapper>
    )
  }

  // Uptime = share of recorded checks (last 90 days, see /api/status) that were fully operational.
  const totalLogs = data.historical_logs.length
  const upLogs = data.historical_logs.filter((l) => l.status === 'operational').length
  const uptimeStr = totalLogs > 0 ? ((upLogs / totalLogs) * 100).toFixed(2) + '%' : '—'
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000
  const dayLogs = data.historical_logs.filter((l) => new Date(l.timestamp).getTime() >= dayAgo)
  const dayUptimeStr = dayLogs.length > 0
    ? ((dayLogs.filter((l) => l.status === 'operational').length / dayLogs.length) * 100).toFixed(2) + '%'
    : '—'

  // Database latency per recorded check, for the chart.
  const chartData = data.historical_logs.map((log) => {
    const db = log.components.find((c) => c.name.includes('Database'))
    return {
      time: formatTime(log.timestamp, undefined, { hour: '2-digit', minute: '2-digit' }),
      latency: db?.latency || 0,
      status: log.status
    }
  })

  // Uptime bars: the most recent checks per component. Slots with no check yet stay grey.
  const BARS_COUNT = 40
  const recentLogs = data.historical_logs.slice(-BARS_COUNT)

  const getStatusColor = (status?: string) => {
    if (status === 'operational') return 'bg-green-500'
    if (status === 'degraded') return 'bg-amber-500'
    if (status === 'none') return 'bg-cs-grid'
    return 'bg-red-500'
  }

  const statusText = (status?: string) =>
    status === 'operational' ? 'Operational' : status === 'degraded' ? 'Degraded' : status === 'none' ? 'No check' : 'Down'

  const dbLatency = data.components.find((c) => c.name.includes('Database'))?.latency

  return (
    <PublicPageWrapper>
      <PageHero
        title="CodeSpectra status"
        lead="Live checks and recent history for every part of the platform."
        actions={refreshButton}
      />

      <div className="mx-auto max-w-[1200px] space-y-8 px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        {/* Global status banner */}
        <div
          role="status"
          className={cn(
            'flex items-center gap-4 rounded-3xl border p-6',
            data.status === 'operational' ? 'border-green-500/25 bg-green-500/10 text-green-800 dark:text-green-300' :
            data.status === 'degraded' ? 'border-amber-500/25 bg-amber-500/10 text-amber-800 dark:text-amber-300' :
            'border-red-500/25 bg-red-500/10 text-red-800 dark:text-red-300'
          )}
        >
          {data.status === 'operational' ? <CheckCircle2 className="h-8 w-8 shrink-0" aria-hidden /> :
           data.status === 'degraded' ? <AlertTriangle className="h-8 w-8 shrink-0" aria-hidden /> :
           <XCircle className="h-8 w-8 shrink-0" aria-hidden />}
          <div>
            <h2 className="text-2xl font-bold tracking-tight">
              {data.status === 'operational' ? 'All systems operational' :
               data.status === 'degraded' ? 'Some services are degraded' : 'Major outage'}
            </h2>
            <p className="mt-1 text-sm opacity-85">
              Last checked at <span className="tabular-nums">{formatTime(data.updated_at, undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
            </p>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Uptime (90 days)', value: uptimeStr },
            { label: 'Uptime (24 hours)', value: dayUptimeStr },
            { label: 'Services checked', value: String(data.components.length) },
            { label: 'Database response', value: dbLatency != null ? `${dbLatency}ms` : '—' },
          ].map((m) => (
            <div key={m.label} className="rounded-3xl border border-cs-grid bg-cs-sheet p-5 shadow-[0_1px_2px_rgba(15,23,41,0.04),0_8px_24px_-12px_rgba(15,23,41,0.10)] dark:shadow-none">
              <p className="text-sm font-medium text-cs-ink-soft">{m.label}</p>
              <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight text-cs-ink">{m.value}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Components */}
          <section className="overflow-hidden rounded-3xl border border-cs-grid bg-cs-sheet lg:col-span-2" aria-labelledby="status-services">
            <div className="border-b border-cs-grid px-6 py-5">
              <h2 id="status-services" className="text-lg font-bold text-cs-ink">Services</h2>
              <p className="text-sm text-cs-ink-soft">Each bar is one check, oldest on the left.</p>
            </div>
            <div className="divide-y divide-cs-grid">
              {data.components.map((c) => {
                const compHistory: string[] = recentLogs.map((log) => {
                  const match = log.components.find((lc) => lc.name === c.name)
                  return match?.status || 'down'
                })
                const checked = compHistory.length
                const upCount = compHistory.filter((h) => h === 'operational').length
                while (compHistory.length < BARS_COUNT) {
                  compHistory.unshift('none')
                }

                return (
                  <div key={c.name} className="space-y-4 px-6 py-5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium text-cs-ink">{c.name}</div>
                      <div className={cn(
                        'text-sm font-semibold',
                        c.status === 'operational' ? 'text-green-700 dark:text-green-400' :
                        c.status === 'degraded' ? 'text-amber-700 dark:text-amber-400' : 'text-red-700 dark:text-red-400'
                      )}>
                        {statusText(c.status)}
                      </div>
                    </div>
                    {c.message ? <p className="-mt-2 text-xs text-cs-ink-soft">{c.message}</p> : null}

                    {/* Uptime bars */}
                    <div className="flex h-10 w-full gap-0.5" role="img" aria-label={`${c.name}: ${upCount} of ${checked} recent checks operational`}>
                      {compHistory.map((hStatus, i) => (
                        <div
                          key={i}
                          className={cn('flex-1 rounded-[2px]', getStatusColor(hStatus))}
                          title={statusText(hStatus)}
                        />
                      ))}
                    </div>

                    <div className="flex justify-between text-xs font-medium text-cs-ink-soft">
                      <span>Earlier</span>
                      <span className="tabular-nums text-cs-ink">
                        {checked > 0 ? `${((upCount / checked) * 100).toFixed(1)}% of last ${checked} checks` : 'No checks yet'}
                      </span>
                      <span>Now</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          <div className="space-y-6">
            {/* Latency chart */}
            <section className="overflow-hidden rounded-3xl border border-cs-grid bg-cs-sheet" aria-labelledby="status-latency">
              <div className="border-b border-cs-grid px-5 py-4">
                <h2 id="status-latency" className="text-lg font-semibold text-cs-ink">Database response time</h2>
              </div>
              <div className="h-64 p-5">
                {chartData.length > 1 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <XAxis dataKey="time" stroke="currentColor" className="text-cs-ink-soft" fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis stroke="currentColor" className="text-cs-ink-soft" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}ms`} />
                      <Tooltip
                        contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '12px', color: 'hsl(var(--popover-foreground))' }}
                        itemStyle={{ color: 'hsl(var(--popover-foreground))' }}
                        labelStyle={{ color: 'hsl(var(--popover-foreground))' }}
                      />
                      <Line
                        type="monotone"
                        dataKey="latency"
                        stroke="#2f5be7"
                        strokeWidth={2.5}
                        dot={false}
                        isAnimationActive={false}
                        activeDot={{ r: 5, fill: '#2f5be7', stroke: '#fff', strokeWidth: 2 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-center text-sm text-cs-ink-soft">
                    Not enough checks yet to draw a chart.
                  </div>
                )}
              </div>
            </section>

            {/* Incidents */}
            <section className="overflow-hidden rounded-3xl border border-cs-grid bg-cs-sheet" aria-labelledby="status-incidents">
              <div className="border-b border-cs-grid px-5 py-4">
                <h2 id="status-incidents" className="text-lg font-semibold text-cs-ink">Incidents</h2>
              </div>
              <div className="p-5">
                <div className="space-y-1 border-l-2 border-cs-grid pl-4">
                  <p className="text-sm font-semibold text-cs-ink">No incidents posted.</p>
                  <p className="text-xs text-cs-ink-soft">If something goes wrong, updates will appear here.</p>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </PublicPageWrapper>
  )
}
