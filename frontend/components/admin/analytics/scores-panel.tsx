'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Loader2, BarChart3, TrendingUp, Hash } from 'lucide-react'

interface ScoresData {
  distribution: { bucket: string; count: number }[]
  total_submissions: number
  average_score: number
}

const BUCKET_COLORS: Record<string, string> = {
  '0-20': '#ef4444',
  '20-40': '#f97316',
  '40-60': '#f59e0b',
  '60-80': '#3b82f6',
  '80-100': '#10b981',
}

export function ScoresPanel() {
  const [data, setData] = useState<ScoresData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/analytics/scores', { credentials: 'include' })
      .then(r => r.json())
      .then(json => { if (json) setData(json) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const dist = data?.distribution || []
  const maxCount = Math.max(...dist.map(d => d.count), 1)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <BarChart3 className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-foreground">Score Analytics</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Score distribution and submission statistics</p>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="border-border/60 p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
              <Hash className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{(data?.total_submissions ?? 0).toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Total Submissions</p>
            </div>
          </div>
        </Card>
        <Card className="border-border/60 p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
              <TrendingUp className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{(data?.average_score ?? 0).toFixed(1)}%</p>
              <p className="text-xs text-muted-foreground">Average Score</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Score Distribution - Horizontal Bar Chart */}
      <Card className="border-border/60 p-6">
        <h2 className="text-lg font-semibold text-foreground mb-6">Score Distribution</h2>
        {dist.length === 0 ? (
          <p className="text-sm text-muted-foreground">No score data available.</p>
        ) : (
          <div className="space-y-4">
            {dist.map(d => {
              const pct = maxCount > 0 ? (d.count / maxCount) * 100 : 0
              const color = BUCKET_COLORS[d.bucket] || '#6b7280'
              return (
                <div key={d.bucket} className="flex items-center gap-4">
                  <span className="w-16 text-sm font-medium text-foreground tabular-nums">{d.bucket}%</span>
                  <div className="flex-1 h-10 rounded-lg bg-muted/50 overflow-hidden relative">
                    <div
                      className="h-full rounded-lg transition-all flex items-center justify-end pr-3"
                      style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: color }}
                    >
                      {d.count > 0 && (
                        <span className="text-xs font-bold text-white drop-shadow-sm tabular-nums">
                          {d.count.toLocaleString()}
                        </span>
                      )}
                    </div>
                    {d.count > 0 && pct < 15 && (
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold tabular-nums text-muted-foreground">
                        {d.count.toLocaleString()}
                      </span>
                    )}
                  </div>
                  <span className="w-12 text-right text-xs text-muted-foreground tabular-nums">
                    {data?.total_submissions ? `${((d.count / data.total_submissions) * 100).toFixed(1)}%` : '0%'}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* Bucket Breakdown Table */}
      <Card className="border-border/60 overflow-hidden">
        <div className="px-6 py-4 border-b border-border/60">
          <h2 className="text-lg font-semibold text-foreground">Bucket Breakdown</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 text-muted-foreground">
                <th className="px-6 py-3 text-left font-medium">Score Range</th>
                <th className="px-6 py-3 text-left font-medium">Label</th>
                <th className="px-6 py-3 text-right font-medium">Submissions</th>
                <th className="px-6 py-3 text-right font-medium">Percentage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {dist.map(d => (
                <tr key={d.bucket} className="hover:bg-muted/30">
                  <td className="px-6 py-3 font-medium text-foreground">{d.bucket}%</td>
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-3 w-3 rounded-full shrink-0"
                        style={{ backgroundColor: BUCKET_COLORS[d.bucket] || '#6b7280' }}
                      />
                      <span className="text-muted-foreground">
                        {d.bucket === '0-20' && 'Needs Improvement'}
                        {d.bucket === '20-40' && 'Below Average'}
                        {d.bucket === '40-60' && 'Average'}
                        {d.bucket === '60-80' && 'Good'}
                        {d.bucket === '80-100' && 'Excellent'}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-3 text-right tabular-nums font-semibold">{d.count.toLocaleString()}</td>
                  <td className="px-6 py-3 text-right tabular-nums">
                    {data?.total_submissions ? `${((d.count / data.total_submissions) * 100).toFixed(1)}%` : '0%'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
