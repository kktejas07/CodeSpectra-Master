'use client'

import { useState, useEffect } from 'react'
import {
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Shield,
  Code2,
  Activity,
  AlertTriangle,
  Zap,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface Metrics {
  quality_score: number
  bugs_count: number
  vulnerabilities_count: number
  code_smells_count: number
  security_hotspots_count: number
  duplicated_lines_count: number
  cyclomatic_complexity: number
  test_coverage_percent: number
  maintainability_index: number
}

interface Issue {
  id: string
  severity: 'critical' | 'major' | 'minor' | 'info'
  message: string
  line?: number
  rule: string
}

interface AdvancedMetricsDashboardProps {
  metrics: Metrics
  issues: Issue[]
  fileName: string
  language: string
}

export function AdvancedMetricsDashboard({
  metrics,
  issues,
  fileName,
  language,
}: AdvancedMetricsDashboardProps) {
  const [selectedSeverity, setSelectedSeverity] = useState<string | null>(null)

  const filteredIssues = selectedSeverity
    ? issues.filter(i => i.severity === selectedSeverity)
    : issues

  const criticalCount = issues.filter(i => i.severity === 'critical').length
  const majorCount = issues.filter(i => i.severity === 'major').length
  const minorCount = issues.filter(i => i.severity === 'minor').length
  const infoCount = issues.filter(i => i.severity === 'info').length

  const getQualityColor = (score: number) => {
    if (score >= 80) return 'text-green-500'
    if (score >= 60) return 'text-yellow-500'
    if (score >= 40) return 'text-orange-500'
    return 'text-red-500'
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-500/10 border-red-500/30 text-red-700'
      case 'major':
        return 'bg-orange-500/10 border-orange-500/30 text-orange-700'
      case 'minor':
        return 'bg-yellow-500/10 border-yellow-500/30 text-yellow-700'
      case 'info':
        return 'bg-blue-500/10 border-blue-500/30 text-blue-700'
      default:
        return 'bg-gray-500/10 border-gray-500/30 text-gray-700'
    }
  }

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <AlertTriangle className="w-4 h-4" />
      case 'major':
        return <AlertCircle className="w-4 h-4" />
      case 'minor':
        return <Activity className="w-4 h-4" />
      case 'info':
        return <Zap className="w-4 h-4" />
      default:
        return <CheckCircle2 className="w-4 h-4" />
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-foreground">{fileName}</h2>
        <p className="text-sm text-muted-foreground">{language} • Advanced Analysis</p>
      </div>

      {/* Quality Score */}
      <Card className="p-6 bg-card border-border">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Quality Score</p>
            <div className={`text-5xl font-bold ${getQualityColor(metrics.quality_score)}`}>
              {Math.round(metrics.quality_score)}
            </div>
            <p className="text-xs text-muted-foreground">
              {metrics.quality_score >= 80 ? 'Excellent' : metrics.quality_score >= 60 ? 'Good' : 'Needs Improvement'}
            </p>
          </div>

          {/* Mini Metrics */}
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center space-y-1">
              <div className="text-2xl font-bold text-red-500">{metrics.bugs_count}</div>
              <p className="text-xs text-muted-foreground">Bugs</p>
            </div>
            <div className="text-center space-y-1">
              <div className="text-2xl font-bold text-red-600">{metrics.vulnerabilities_count}</div>
              <p className="text-xs text-muted-foreground">Vulnerabilities</p>
            </div>
            <div className="text-center space-y-1">
              <div className="text-2xl font-bold text-yellow-600">{metrics.code_smells_count}</div>
              <p className="text-xs text-muted-foreground">Code Smells</p>
            </div>
            <div className="text-center space-y-1">
              <div className="text-2xl font-bold text-orange-600">{metrics.security_hotspots_count}</div>
              <p className="text-xs text-muted-foreground">Hotspots</p>
            </div>
          </div>
        </div>
      </Card>

      {/* Detailed Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          label="Test Coverage"
          value={`${Math.round(metrics.test_coverage_percent)}%`}
          icon={<CheckCircle2 className="w-5 h-5" />}
          trend={metrics.test_coverage_percent >= 50 ? 'up' : 'down'}
          benchmark={metrics.test_coverage_percent >= 80 ? 'excellent' : metrics.test_coverage_percent >= 50 ? 'good' : 'poor'}
        />

        <MetricCard
          label="Maintainability"
          value={Math.round(metrics.maintainability_index)}
          icon={<Code2 className="w-5 h-5" />}
          trend={metrics.maintainability_index >= 60 ? 'up' : 'down'}
          benchmark={metrics.maintainability_index >= 70 ? 'excellent' : metrics.maintainability_index >= 50 ? 'good' : 'poor'}
        />

        <MetricCard
          label="Complexity"
          value={Math.round(metrics.cyclomatic_complexity)}
          icon={<TrendingUp className="w-5 h-5" />}
          trend={metrics.cyclomatic_complexity <= 10 ? 'down' : 'up'}
          benchmark={metrics.cyclomatic_complexity <= 5 ? 'excellent' : metrics.cyclomatic_complexity <= 15 ? 'good' : 'poor'}
        />

        <MetricCard
          label="Duplicated Lines"
          value={metrics.duplicated_lines_count}
          icon={<Shield className="w-5 h-5" />}
          trend={metrics.duplicated_lines_count <= 10 ? 'down' : 'up'}
          benchmark={metrics.duplicated_lines_count <= 5 ? 'excellent' : metrics.duplicated_lines_count <= 15 ? 'good' : 'poor'}
        />
      </div>

      {/* Issues Tab */}
      <Card className="p-6 bg-card border-border">
        <Tabs defaultValue="all" className="w-full">
          <TabsList className="grid w-full grid-cols-5 bg-secondary/50">
            <TabsTrigger value="all" className="relative">
              All
              <span className="ml-2 text-xs font-semibold bg-primary/20 px-2 py-0.5 rounded-full">
                {issues.length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="critical" className="relative">
              Critical
              <span className="ml-2 text-xs font-semibold bg-red-500/20 px-2 py-0.5 rounded-full text-red-700">
                {criticalCount}
              </span>
            </TabsTrigger>
            <TabsTrigger value="major" className="relative">
              Major
              <span className="ml-2 text-xs font-semibold bg-orange-500/20 px-2 py-0.5 rounded-full text-orange-700">
                {majorCount}
              </span>
            </TabsTrigger>
            <TabsTrigger value="minor" className="relative">
              Minor
              <span className="ml-2 text-xs font-semibold bg-yellow-500/20 px-2 py-0.5 rounded-full text-yellow-700">
                {minorCount}
              </span>
            </TabsTrigger>
            <TabsTrigger value="info" className="relative">
              Info
              <span className="ml-2 text-xs font-semibold bg-blue-500/20 px-2 py-0.5 rounded-full text-blue-700">
                {infoCount}
              </span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="space-y-3 mt-4">
            {issues.length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
                <p className="text-muted-foreground">No issues found!</p>
              </div>
            ) : (
              issues.map(issue => (
                <IssueCard key={issue.id} issue={issue} getSeverityColor={getSeverityColor} getSeverityIcon={getSeverityIcon} />
              ))
            )}
          </TabsContent>

          <TabsContent value="critical" className="space-y-3 mt-4">
            {filteredIssues.filter(i => i.severity === 'critical').map(issue => (
              <IssueCard key={issue.id} issue={issue} getSeverityColor={getSeverityColor} getSeverityIcon={getSeverityIcon} />
            ))}
          </TabsContent>

          <TabsContent value="major" className="space-y-3 mt-4">
            {filteredIssues.filter(i => i.severity === 'major').map(issue => (
              <IssueCard key={issue.id} issue={issue} getSeverityColor={getSeverityColor} getSeverityIcon={getSeverityIcon} />
            ))}
          </TabsContent>

          <TabsContent value="minor" className="space-y-3 mt-4">
            {filteredIssues.filter(i => i.severity === 'minor').map(issue => (
              <IssueCard key={issue.id} issue={issue} getSeverityColor={getSeverityColor} getSeverityIcon={getSeverityIcon} />
            ))}
          </TabsContent>

          <TabsContent value="info" className="space-y-3 mt-4">
            {filteredIssues.filter(i => i.severity === 'info').map(issue => (
              <IssueCard key={issue.id} issue={issue} getSeverityColor={getSeverityColor} getSeverityIcon={getSeverityIcon} />
            ))}
          </TabsContent>
        </Tabs>
      </Card>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <Button className="flex-1">Generate AI Fixes</Button>
        <Button variant="outline" className="flex-1">
          Check Quality Gate
        </Button>
      </div>
    </div>
  )
}

interface MetricCardProps {
  label: string
  value: string | number
  icon: React.ReactNode
  trend?: 'up' | 'down'
  benchmark?: 'excellent' | 'good' | 'poor'
}

function MetricCard({ label, value, icon, trend, benchmark }: MetricCardProps) {
  const getBenchmarkColor = (b?: string) => {
    switch (b) {
      case 'excellent':
        return 'text-green-600 bg-green-500/10'
      case 'good':
        return 'text-yellow-600 bg-yellow-500/10'
      case 'poor':
        return 'text-red-600 bg-red-500/10'
      default:
        return 'text-muted-foreground'
    }
  }

  return (
    <Card className="p-4 bg-card border-border space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <div className="text-primary">{icon}</div>
      </div>
      <div className="space-y-2">
        <div className="text-2xl font-bold text-foreground">{value}</div>
        {benchmark && (
          <div className={`text-xs font-semibold capitalize px-2 py-1 rounded w-fit ${getBenchmarkColor(benchmark)}`}>
            {benchmark}
          </div>
        )}
      </div>
    </Card>
  )
}

interface IssueCardProps {
  issue: Issue
  getSeverityColor: (severity: string) => string
  getSeverityIcon: (severity: string) => React.ReactNode
}

function IssueCard({ issue, getSeverityColor, getSeverityIcon }: IssueCardProps) {
  return (
    <div className={`p-3 rounded border-2 ${getSeverityColor(issue.severity)}`}>
      <div className="flex gap-3">
        <div className="mt-0.5">{getSeverityIcon(issue.severity)}</div>
        <div className="flex-1 space-y-1">
          <div className="flex items-start justify-between">
            <p className="font-medium text-sm">{issue.rule}</p>
            {issue.line && (
              <span className="text-xs px-2 py-1 bg-black/10 rounded">
                Line {issue.line}
              </span>
            )}
          </div>
          <p className="text-sm">{issue.message}</p>
        </div>
      </div>
    </div>
  )
}
