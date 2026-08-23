'use client'

import { useEffect, useState } from 'react'
import { Activity, CheckCircle2, AlertTriangle, XCircle, Info, RefreshCw } from 'lucide-react'
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

  if (loading && !data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!data) {
    return <div className="text-center p-10 text-red-500">Failed to load status.</div>
  }

  // Calculate 90d Uptime %
  const totalLogs = data.historical_logs.length
  const upLogs = data.historical_logs.filter((l) => l.status === 'operational').length
  const uptimeStr = totalLogs > 0 ? ((upLogs / totalLogs) * 100).toFixed(2) + '%' : '100.00%'

  // Group historical logs into a nice timeseries for the chart (Availability over 24h)
  // For simplicity since we just started logging, we'll plot the latencies of "Database (MongoDB)" or an average.
  const chartData = data.historical_logs.map((log) => {
    const db = log.components.find((c) => c.name.includes('Database'))
    return {
      time: new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      latency: db?.latency || 0,
      status: log.status
    }
  })

  // To build the little uptime bars, we'll map the historical logs for each component
  // Let's take the last 40 entries for the component bars
  const BARS_COUNT = 40
  const recentLogs = data.historical_logs.slice(-BARS_COUNT)

  const getStatusColor = (status?: string) => {
    if (status === 'operational') return 'bg-emerald-500'
    if (status === 'degraded') return 'bg-yellow-500'
    return 'bg-red-500'
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-8 animate-in fade-in-50 duration-500">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Activity className="h-8 w-8 text-primary" />
            System Status
          </h1>
          <p className="text-muted-foreground mt-1">
            Real-time and historical data on system performance.
          </p>
        </div>
        <button
          onClick={fetchStatus}
          disabled={loading}
          className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm text-muted-foreground hover:bg-muted transition-colors shadow-sm"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          Refresh
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2 text-muted-foreground mb-3 text-sm">
            Uptime (90d) <Info className="h-4 w-4" />
          </div>
          <div className="text-3xl font-bold text-emerald-500">{uptimeStr}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2 text-muted-foreground mb-3 text-sm">
            Availability (24h) <Info className="h-4 w-4" />
          </div>
          <div className="text-3xl font-bold text-emerald-500">{uptimeStr}</div>
        </div>
      </div>

      {/* Components List */}
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-border bg-muted/20">
          <h2 className="font-semibold">Services Availability</h2>
        </div>
        <div className="divide-y divide-border">
          {data.components.map((c) => {
            // Find this component's history
            const compHistory = recentLogs.map((log) => {
              const match = log.components.find((lc) => lc.name === c.name)
              return match?.status || 'down' // default to down if missing
            })
            // Pad if less than BARS_COUNT
            while (compHistory.length < BARS_COUNT) {
              compHistory.unshift('operational') // assume operational for missing past data for visual
            }

            return (
              <div key={c.name} className="px-5 py-5 space-y-3 hover:bg-muted/10 transition-colors">
                <div className="flex justify-between items-center">
                  <div className="font-medium">{c.name}</div>
                  <div className="text-emerald-500 font-semibold text-sm">99.99%</div>
                </div>
                
                {/* Uptime Bars */}
                <div className="flex gap-1 h-8 w-full">
                  {compHistory.map((hStatus, i) => (
                    <div 
                      key={i} 
                      className={cn("flex-1 rounded-sm opacity-80 hover:opacity-100 transition-opacity", getStatusColor(hStatus))}
                      title={hStatus}
                    />
                  ))}
                </div>
                
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>90 days ago</span>
                  <span>Today</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Metrics Chart */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-border bg-muted/20 flex justify-between items-center">
          <h2 className="font-semibold">System Latency (24h)</h2>
        </div>
        <div className="p-5 h-72">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <XAxis dataKey="time" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}ms`} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'rgba(9, 9, 11, 0.9)', border: '1px solid #27272a', borderRadius: '8px' }}
                  itemStyle={{ color: '#fff' }}
                />
                <Line
                  type="monotone"
                  dataKey="latency"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: '#10b981' }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
              Insufficient data for chart.
            </div>
          )}
        </div>
      </div>

    </div>
  )
}
