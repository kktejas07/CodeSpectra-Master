'use client'
import { formatTime } from '@/lib/format-datetime'

import { useEffect, useState, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Loader2, Shield, AlertTriangle, RefreshCw, AlertCircle, Eye } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend } from 'recharts'
import { PageHeader, StatCard } from '@/components/app/page-kit'

interface ProctorEvent {
  event_type: string
  count: number
  exams: { exam_id: string; exam_title: string; count: number }[]
}

interface ProctoringData {
  events: ProctorEvent[]
  total_flags: number
  events_by_type: Record<string, number>
}

const EVENT_COLORS: Record<string, string> = {
  tab_blur: '#f59e0b',
  alt_tab_detected: '#ef4444',
  clipboard_copy: '#8b5cf6',
  clipboard_paste: '#8b5cf6',
  copy_paste_attempt: '#ef4444',
  screen_share_started: '#3b82f6',
  screen_share_ended: '#3b82f6',
  screen_capture_detected: '#ef4444',
  prohibited_app_detected: '#ef4444',
  remote_desktop_detected: '#ef4444',
  usb_device_plugged: '#f97316',
  usb_device_unplugged: '#f97316',
  navigate_away_attempt: '#ef4444',
  fullscreen_exit: '#f59e0b',
  answer_pattern_score: '#10b981',
  timer_warning_30min: '#f59e0b',
  secondary_voice_detected: '#ec4899',
  volume_anomaly_detected: '#ec4899',
  hardware_port_anomaly: '#f97316',
  rapid_window_resize: '#06b6d4',
  keyboard_shortcut_detected: '#8b5cf6',
  right_click_detected: '#f59e0b',
  print_attempt: '#ef4444',
  developer_tools: '#ef4444',
}

const POLL_INTERVAL = 10000 // 10 seconds

export function ProctoringPanel() {
  const [data, setData] = useState<ProctoringData | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/analytics/proctoring', { credentials: 'include' })
      const json = await res.json()
      if (json) {
        setData(json)
        setLastUpdated(new Date())
      }
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(() => void fetchData(), POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [autoRefresh, fetchData])

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const eventsByType = data?.events_by_type || {}
  const maxCount = Math.max(...Object.values(eventsByType), 1)
  const sortedTypes = Object.entries(eventsByType).sort((a, b) => b[1] - a[1])

  const examMap = new Map<string, { title: string; total: number }>()
  for (const evt of data?.events || []) {
    for (const ex of evt.exams || []) {
      const existing = examMap.get(ex.exam_id) || { title: ex.exam_title, total: 0 }
      existing.total += ex.count
      examMap.set(ex.exam_id, existing)
    }
  }
  const examFlags = Array.from(examMap.entries())
    .map(([id, v]) => ({ id, title: v.title, total: v.total }))
    .sort((a, b) => b.total - a.total)
  const maxExamFlags = Math.max(...examFlags.map(e => e.total), 1)

  const highRiskEvents = new Set([
    'alt_tab_detected', 'screen_share_started', 'screen_capture_detected',
    'prohibited_app_detected', 'remote_desktop_detected', 'copy_paste_attempt',
    'navigate_away_attempt', 'secondary_voice_detected', 'hardware_port_anomaly'
  ])

  let highRiskCount = 0
  let lowRiskCount = 0

  const pieData = sortedTypes.map(([type, count]) => {
    if (highRiskEvents.has(type)) highRiskCount += count
    else lowRiskCount += count

    return { name: type, value: count, color: EVENT_COLORS[type] || '#6b7280' }
  })

  const riskPieData = [
    { name: 'High risk', value: highRiskCount, color: '#ef4444' },
    { name: 'Low/medium risk', value: lowRiskCount, color: '#f59e0b' }
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        className="mb-0"
        title="Proctoring analytics"
        description="Proctoring flags and how they are spread across your assessments."
        icon={<Shield />}
        actions={<>
          {lastUpdated && (
            <span className="text-xs text-muted-foreground">
              Updated: {formatTime(lastUpdated)}
            </span>
          )}
          <button
            type="button"
            onClick={() => void fetchData()}
            className="flex items-center gap-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-border"
            />
            Auto-refresh
          </label>
        </>}
      />

      {/* KPI Row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total flags" value={data?.total_flags ?? 0} icon={<AlertTriangle />} />
        <StatCard label="High-risk events" value={highRiskCount} icon={<AlertCircle />} />
        <StatCard label="Low-risk events" value={lowRiskCount} icon={<Eye />} />
        <StatCard label="Event types" value={sortedTypes.length} icon={<Shield />} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="rounded-3xl border-border/70 p-6 flex flex-col">
          <h2 className="text-lg font-semibold text-foreground mb-4">Risk distribution</h2>
          <div className="flex-1 min-h-[250px]">
            {riskPieData.some(d => d.value > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={riskPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {riskPieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                    itemStyle={{ color: 'hsl(var(--foreground))' }}
                  />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground text-sm">No data</div>
            )}
          </div>
        </Card>

        <Card className="rounded-3xl border-border/70 p-6 flex flex-col">
          <h2 className="text-lg font-semibold text-foreground mb-4">Most-flagged assessments</h2>
          {examFlags.length === 0 ? (
            <div className="flex h-full items-center justify-center text-muted-foreground text-sm">No proctoring flags yet.</div>
          ) : (
            <div className="space-y-4 overflow-y-auto max-h-[250px] pr-2">
              {examFlags.slice(0, 5).map(exam => (
                <div key={exam.id} className="flex items-center gap-3">
                  <span className="w-48 text-sm text-muted-foreground truncate" title={exam.title}>
                    {exam.title}
                  </span>
                  <div className="flex-1 h-6 rounded-full bg-muted/50 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-red-500/60 transition-all motion-reduce:transition-none"
                      style={{ width: `${(exam.total / maxExamFlags) * 100}%` }}
                    />
                  </div>
                  <span className="text-sm font-semibold tabular-nums w-12 text-right">{exam.total}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card className="rounded-3xl border-border/70 overflow-hidden">
        <div className="px-6 py-4 border-b border-border/60">
          <h2 className="text-lg font-semibold text-foreground">Flags by event type</h2>
        </div>
        {sortedTypes.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">No proctoring events yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 text-muted-foreground">
                  <th className="px-6 py-3 text-left font-medium">Event type</th>
                  <th className="px-6 py-3 text-left font-medium w-40">Distribution</th>
                  <th className="px-6 py-3 text-right font-medium">Count</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {sortedTypes.map(([type, count]) => (
                  <tr key={type} className="hover:bg-muted/30">
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-3 w-3 rounded-full shrink-0"
                          style={{ backgroundColor: EVENT_COLORS[type] || '#6b7280' }}
                        />
                        <span className="font-medium text-foreground">{type}</span>
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      <div className="h-4 rounded-full bg-muted/50 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all motion-reduce:transition-none"
                          style={{
                            width: `${(count / maxCount) * 100}%`,
                            backgroundColor: EVENT_COLORS[type] || '#6b7280',
                          }}
                        />
                      </div>
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums font-semibold">{count.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
