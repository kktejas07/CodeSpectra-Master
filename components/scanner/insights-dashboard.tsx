'use client'

import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TrendingUp, TrendingDown, AlertCircle, CheckCircle2, Target, Users } from 'lucide-react'

interface StatisticsData {
  totalScans: number
  avgQuality: number
  fixedIssues: number
  totalBugsDetected: number
  vulnerabilitiesFound: number
  topIssueType: string
  scanAccuracy: number
  timeToFix: string
}

interface InsightsDashboardProps {
  stats?: StatisticsData
}

export function InsightsDashboard({ stats }: InsightsDashboardProps) {
  const defaultStats: StatisticsData = stats || {
    totalScans: 156,
    avgQuality: 82,
    fixedIssues: 243,
    totalBugsDetected: 387,
    vulnerabilitiesFound: 28,
    topIssueType: 'Code Smell',
    scanAccuracy: 94,
    timeToFix: '2.3 days',
  }

  const improvements = [
    { metric: 'Quality Score', from: 68, to: 82, improvement: 14, trend: 'up' as const },
    { metric: 'Test Coverage', from: 60, to: 81, improvement: 21, trend: 'up' as const },
    { metric: 'Bugs Found', from: 45, to: 12, improvement: 73, trend: 'down' as const },
    { metric: 'Vulnerabilities', from: 8, to: 1, improvement: 87, trend: 'down' as const },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <Target className="w-5 h-5" />
          Code Quality Insights
        </h3>
        <p className="text-sm text-foreground/60">
          Overall statistics and insights from your code analysis
        </p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-card/30 border border-border p-4">
          <p className="text-xs text-foreground/60 mb-2">Total Scans</p>
          <p className="text-3xl font-bold text-primary">{defaultStats.totalScans}</p>
          <p className="text-xs text-foreground/50 mt-2">this month</p>
        </Card>

        <Card className="bg-card/30 border border-border p-4">
          <p className="text-xs text-foreground/60 mb-2">Average Quality</p>
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-bold text-foreground">{defaultStats.avgQuality}</p>
            <span className="text-xs text-foreground/50">/100</span>
          </div>
          <p className="text-xs text-green-500 mt-2">↑ 8% improvement</p>
        </Card>

        <Card className="bg-card/30 border border-border p-4">
          <p className="text-xs text-foreground/60 mb-2">Issues Fixed</p>
          <p className="text-3xl font-bold text-green-500">{defaultStats.fixedIssues}</p>
          <p className="text-xs text-green-500 mt-2">✓ 63% resolved</p>
        </Card>

        <Card className="bg-card/30 border border-border p-4">
          <p className="text-xs text-foreground/60 mb-2">Avg Time to Fix</p>
          <p className="text-3xl font-bold text-foreground">{defaultStats.timeToFix}</p>
          <p className="text-xs text-foreground/50 mt-2">per issue</p>
        </Card>
      </div>

      {/* Risk Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="bg-red-500/10 border border-red-500/30 p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-5 h-5 text-red-500" />
            <h4 className="font-semibold text-red-600">Critical Issues</h4>
          </div>
          <p className="text-2xl font-bold text-red-600">{defaultStats.totalBugsDetected}</p>
          <p className="text-xs text-red-500/70 mt-2">Bugs detected in scans</p>
        </Card>

        <Card className="bg-orange-500/10 border border-orange-500/30 p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-5 h-5 text-orange-500" />
            <h4 className="font-semibold text-orange-600">Vulnerabilities</h4>
          </div>
          <p className="text-2xl font-bold text-orange-600">{defaultStats.vulnerabilitiesFound}</p>
          <p className="text-xs text-orange-500/70 mt-2">Security hotspots found</p>
        </Card>

        <Card className="bg-blue-500/10 border border-blue-500/30 p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="w-5 h-5 text-blue-500" />
            <h4 className="font-semibold text-blue-600">Scan Accuracy</h4>
          </div>
          <p className="text-2xl font-bold text-blue-600">{defaultStats.scanAccuracy}%</p>
          <p className="text-xs text-blue-500/70 mt-2">Detection accuracy rate</p>
        </Card>
      </div>

      {/* Top Issue Type */}
      <Card className="bg-card/30 border border-border p-4">
        <h4 className="font-semibold text-foreground mb-3">Most Common Issue</h4>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-lg font-bold text-primary">{defaultStats.topIssueType}</p>
            <p className="text-sm text-foreground/60">occurring most frequently in your codebase</p>
          </div>
          <Badge className="bg-primary/20 text-primary border-primary/30">
            37% of all issues
          </Badge>
        </div>
      </Card>

      {/* Improvement Metrics */}
      <div className="space-y-3">
        <h4 className="font-semibold text-foreground">Improvements Over Time</h4>

        {improvements.map((item, idx) => (
          <Card key={idx} className="bg-card/30 border border-border p-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="font-medium text-foreground">{item.metric}</p>
                <div className="flex items-center gap-4 text-sm text-foreground/60">
                  <span>{item.from}</span>
                  <div className="w-24 h-1 bg-border rounded-full">
                    <div
                      className="h-full bg-primary rounded-full"
                      style={{ width: `${Math.min(100, (item.to / (item.from + item.to)) * 100)}%` }}
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

      {/* Team Activity */}
      <Card className="bg-card/30 border border-border p-4 space-y-3">
        <h4 className="font-semibold text-foreground flex items-center gap-2">
          <Users className="w-5 h-5" />
          Top Contributors
        </h4>

        <div className="space-y-2">
          {[
            { name: 'Alice Johnson', scans: 42, improvement: 15 },
            { name: 'Bob Smith', scans: 38, improvement: 12 },
            { name: 'Carol Davis', scans: 35, improvement: 18 },
            { name: 'David Wilson', scans: 28, improvement: 8 },
          ].map((contributor, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between p-2 bg-background rounded border border-border/50"
            >
              <span className="text-sm text-foreground">{contributor.name}</span>
              <div className="flex gap-4 text-xs">
                <span className="text-foreground/60">{contributor.scans} scans</span>
                <span className="text-green-500">+{contributor.improvement}%</span>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
