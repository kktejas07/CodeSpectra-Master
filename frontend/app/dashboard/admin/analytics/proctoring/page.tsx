'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Loader2, Shield, AlertTriangle, RefreshCw } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'

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

export default function ProctoringAnalyticsPage() {
  const gate = usePageGuard('superadmin')
  const [data, setData] = useState<ProctoringData | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)

  const fetchData = useCallback(async () => {
    if (!gate.ready) return
    try {
      const res = await fetch('/api/admin/analytics/proctoring', { credentials: 'include' })
      const json = await res.json()
      if (json) {
        setData(json)
        setLastUpdated(new Date())
      }
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [gate.ready])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  // Auto-refresh polling
  useEffect(() => {
    if (!autoRefresh || !gate.ready) return
    const interval = setInterval(() => void fetchData(), POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [autoRefresh, gate.ready, fetchData])

  if (!gate.ready) return null

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

  // Aggregate exam-level data from events
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Proctoring Analytics</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Proctoring flags and event distribution across assessments</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs text-muted-foreground">
              Updated: {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={() => void fetchData()}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
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
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="border-border/60 p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-500/10">
              <AlertTriangle className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{data?.total_flags ?? 0}</p>
              <p className="text-xs text-muted-foreground">Total Flags</p>
            </div>
          </div>
        </Card>
        <Card className="border-border/60 p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10">
              <Shield className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{sortedTypes.length}</p>
              <p className="text-xs text-muted-foreground">Unique Event Types</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Flags per Exam - Bar Chart */}
      <Card className="border-border/60 p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">Flags per Exam</h2>
        {examFlags.length === 0 ? (
          <p className="text-sm text-muted-foreground">No proctoring data available.</p>
        ) : (
          <div className="space-y-3">
            {examFlags.map(exam => (
              <div key={exam.id} className="flex items-center gap-3">
                <span className="w-48 text-sm text-muted-foreground truncate" title={exam.title}>
                  {exam.title}
                </span>
                <div className="flex-1 h-6 rounded-full bg-muted/50 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-red-500/60 transition-all"
                    style={{ width: `${(exam.total / maxExamFlags) * 100}%` }}
                  />
                </div>
                <span className="text-sm font-semibold tabular-nums w-12 text-right">{exam.total}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Flags by Event Type - Summary Table */}
      <Card className="border-border/60 overflow-hidden">
        <div className="px-6 py-4 border-b border-border/60">
          <h2 className="text-lg font-semibold text-foreground">Flags by Event Type</h2>
        </div>
        {sortedTypes.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">No event data.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 text-muted-foreground">
                  <th className="px-6 py-3 text-left font-medium">Event Type</th>
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
                          className="h-full rounded-full transition-all"
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
