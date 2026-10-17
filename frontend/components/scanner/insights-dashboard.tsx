'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TrendingUp, TrendingDown, AlertCircle, CheckCircle2, Target, Users } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'

interface StatisticsData {
  totalScans: number
  avgQuality: number
  fixedIssues: number
  totalBugsDetected: number
  vulnerabilitiesFound: number
  criticalIssues: number
  topIssueType: string
  scanAccuracy: number
  timeToFix: string
  totalAllTime: number
  resolvedRate: number
  improvements: Array<{
    metric: string
    from: number
    to: number
    improvement: number
    trend: 'up' | 'down'
  }>
  issueBreakdown: Array<{ type: string; count: number }>
}

interface InsightsDashboardProps {
  stats?: StatisticsData
}

export function InsightsDashboard({ stats }: InsightsDashboardProps) {
  const [data, setData] = useState<StatisticsData | null>(null)
  const [loading, setLoading] = useState(!stats)
  const [loadError, setLoadError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (stats) {
      setData(stats)
      return
    }
    setLoading(true)
    setLoadError(false)
    fetch('/api/user/insights', { credentials: 'include' })
      .then(async (r) => {
        const json = await r.json().catch(() => null)
        if (!r.ok || !json || json.error) throw new Error('load failed')
        setData(json)
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false))
  }, [stats, reloadKey])

  const defaultStats: StatisticsData = {
    totalScans: 0,
    avgQuality: 0,
    fixedIssues: 0,
    totalBugsDetected: 0,
    vulnerabilitiesFound: 0,
    criticalIssues: 0,
    topIssueType: 'None',
    scanAccuracy: 0,
    timeToFix: '—',
    totalAllTime: 0,
    resolvedRate: 0,
    improvements: [],
    issueBreakdown: [],
  }

  const displayData = data || defaultStats

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="h-6 w-6" />
        <span className="ml-2 text-sm text-muted-foreground">Loading insights…</span>
      </div>
    )
  }

  if (loadError) {
    return (
      <EmptyState
        compact
        illustration="error"
        title="Couldn't load insights"
        description="Check your connection and try again."
        actionLabel="Try again"
        onAction={() => setReloadKey((k) => k + 1)}
      />
    )
  }

  // Only real trend data from the server — no placeholder improvements.
  const improvements = displayData.improvements

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <Target className="w-5 h-5" />
          Code Quality Insights
        </h3>
        <p className="text-sm text-muted-foreground">
          Overall statistics and insights from your code analysis
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground mb-2">Scans (30d)</p>
          <p className="text-3xl font-bold text-primary">{displayData.totalScans}</p>
          <p className="text-xs text-muted-foreground mt-2">{displayData.totalAllTime} all time</p>
        </Card>

        <Card className="p-4">
          <p className="text-xs text-muted-foreground mb-2">Average quality</p>
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-bold text-foreground">{displayData.avgQuality}</p>
            <span className="text-xs text-muted-foreground">/100</span>
          </div>
          <p className="text-xs text-green-500 mt-2">
            {displayData.resolvedRate}% resolved
          </p>
        </Card>

        <Card className="p-4">
          <p className="text-xs text-muted-foreground mb-2">Issues fixed</p>
          <p className="text-3xl font-bold text-green-500">{displayData.fixedIssues}</p>
          <p className="text-xs text-muted-foreground mt-2">applied fixes</p>
        </Card>

        <Card className="p-4">
          <p className="text-xs text-muted-foreground mb-2">Avg Time to Fix</p>
          <p className="text-3xl font-bold text-foreground">{displayData.timeToFix}</p>
          <p className="text-xs text-muted-foreground mt-2">per issue</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="bg-red-500/10 border-red-500/30 p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-5 h-5 text-red-500" />
            <h4 className="font-semibold text-red-600">Critical issues</h4>
          </div>
          <p className="text-2xl font-bold text-red-600">{displayData.criticalIssues}</p>
          <p className="text-xs text-red-500/70 mt-2">bugs requiring immediate attention</p>
        </Card>

        <Card className="bg-orange-500/10 border border-orange-500/30 p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-5 h-5 text-orange-500" />
            <h4 className="font-semibold text-orange-600">Vulnerabilities</h4>
          </div>
          <p className="text-2xl font-bold text-orange-600">{displayData.vulnerabilitiesFound}</p>
          <p className="text-xs text-orange-500/70 mt-2">security hotspots found</p>
        </Card>

        <Card className="bg-blue-500/10 border-blue-500/30 p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="w-5 h-5 text-blue-500" />
            <h4 className="font-semibold text-primary">Scan accuracy</h4>
          </div>
          <p className="text-2xl font-bold text-blue-600">{displayData.scanAccuracy}%</p>
          <p className="text-xs text-blue-500/70 mt-2">detection accuracy rate</p>
        </Card>
      </div>

      {displayData.topIssueType !== 'None' && (
        <Card className="p-4">
          <h4 className="font-semibold text-foreground mb-3">Most common issue</h4>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg font-bold text-primary">{displayData.topIssueType}</p>
              <p className="text-sm text-muted-foreground">most frequent in your codebase</p>
            </div>
            {displayData.issueBreakdown[0] && (
              <Badge variant="default">
                {displayData.issueBreakdown[0].count} occurrences
              </Badge>
            )}
          </div>
        </Card>
      )}

      {improvements.length > 0 && (
        <div className="space-y-3">
          <h4 className="font-semibold text-foreground">Improvements over time</h4>

          {improvements.map((item, idx) => (
            <Card key={idx} className="bg-card/30 border border-border p-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="font-medium text-foreground">{item.metric}</p>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span>{item.from}</span>
                    <div className="w-24 h-1 bg-border rounded-full">
                      <div
                        className="h-full bg-primary rounded-full"
                        style={{
                          width: `${Math.min(100, (item.to / (item.from + item.to || 1)) * 100)}%`,
                        }}
                      />
                    </div>
                    <span>{item.to}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {item.trend === 'up' ? (
                    <TrendingUp className="w-5 h-5 text-green-500" />
                  ) : (
                    <TrendingDown className="w-5 h-5 text-green-500" />
                  )}
                  <span className="text-lg font-bold text-green-500">{item.improvement}%</span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {data && (
        <Card className="p-4 space-y-3">
          <h4 className="font-semibold text-foreground flex items-center gap-2">
            <Users className="w-5 h-5" />
            Issue Breakdown
          </h4>
          {data.issueBreakdown.length > 0 ? (
            <div className="space-y-2">
              {data.issueBreakdown.map((item) => (
                <div key={item.type} className="flex items-center justify-between p-2 bg-background rounded border border-border/50">
                  <span className="text-sm text-foreground capitalize">
                    {(item.type || '').replace(/_/g, ' ')}
                  </span>
                  <Badge variant="outline">{item.count}</Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No issue data available yet</p>
          )}
        </Card>
      )}
    </div>
  )
}