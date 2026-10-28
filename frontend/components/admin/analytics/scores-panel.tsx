'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Loader2, BarChart3, TrendingUp, Hash } from 'lucide-react'
import { PageHeader, StatCard } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'

interface ScoresData {
  distribution: { bucket: string; count: number }[]
  total_submissions: number
  average_score: number
}

const BUCKET_COLORS: Record<string, string> = {
  '0-20': '#ef4444',
  '20-40': '#f97316',
  '40-60': '#f59e0b',
  '60-80': '#2f5be7',
  '80-100': '#16a34a',
}

export function ScoresPanel() {
  const [data, setData] = useState<ScoresData | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    setLoading(true)
    setLoadError(false)
    fetch('/api/admin/analytics/scores', { credentials: 'include' })
      .then(async (r) => {
        const json = await r.json().catch(() => null)
        if (!r.ok || !json || json.error) throw new Error('load failed')
        setData(json)
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false))
  }, [reloadKey])

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (loadError) {
    return (
      <EmptyState
        compact
        illustration="error"
        title="Couldn't load score analytics"
        description="Check your connection and try again."
        actionLabel="Try again"
        onAction={() => setReloadKey((k) => k + 1)}
      />
    )
  }

  const dist = data?.distribution || []
  const maxCount = Math.max(...dist.map(d => d.count), 1)

  return (
    <div className="space-y-6">
      <PageHeader
        illustration="analytics"
        className="mb-0"
        title="Score analytics"
        description="How scores are spread across submitted assessments."
        icon={<BarChart3 />}
      />

      {/* KPI Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label="Total submissions" value={(data?.total_submissions ?? 0).toLocaleString()} icon={<Hash />} />
        <StatCard label="Average score" value={`${(data?.average_score ?? 0).toFixed(1)}%`} icon={<TrendingUp />} />
      </div>

      {/* Score Distribution - Horizontal Bar Chart */}
      <Card className="rounded-3xl border-border/70 p-6">
        <h2 className="text-lg font-semibold text-foreground mb-6">Score distribution</h2>
        {dist.length === 0 ? (
          <EmptyState illustration="analytics" title="No scores yet" description="The distribution appears once candidates submit." className="border-0 bg-transparent py-4 md:py-6 [&_h3]:text-base" />
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
                      className="h-full rounded-lg transition-all motion-reduce:transition-none flex items-center justify-end pr-3"
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
      <Card className="rounded-3xl border-border/70 overflow-hidden">
        <div className="px-6 py-4 border-b border-border/60">
          <h2 className="text-lg font-semibold text-foreground">Breakdown by score range</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 text-muted-foreground">
                <th className="px-6 py-3 text-left font-medium">Score range</th>
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
                        {d.bucket === '0-20' && 'Needs improvement'}
                        {d.bucket === '20-40' && 'Below average'}
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
