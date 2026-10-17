'use client'
import { formatDateTime } from '@/lib/format-datetime'
import { useToast } from '@/lib/toast-context'
import { EmptyState } from '@/components/ui/empty-state'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { FileText, Download, Loader2 } from 'lucide-react'

interface ReportData {
  /** null = not measured (never shown as a made-up default). */
  quality: number | null
  bugs: number
  vulnerabilities: number
  codeSmells: number
  testCoverage: number | null
  complexity: number | null
  timestamp?: string
  generatedAt?: string
  repository?: string
  branch?: string
  author?: string
  totalScans?: number
  appliedFixes?: number
  pendingFixes?: number
}

// Email, share links and scheduled reports were removed: nothing on the
// server sends or hosts reports. Export downloads real data from
// /api/reports/generate.
interface ReportGeneratorProps {
  data?: ReportData
}

type ReportFormat = 'pdf' | 'json' | 'csv'

export function ReportGenerator({ data }: ReportGeneratorProps) {
  const addToast = useToast()
  const [reportData, setReportData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(!data)
  const [selectedFormat, setSelectedFormat] = useState<ReportFormat>('json')
  const [isExporting, setIsExporting] = useState(false)

  useEffect(() => {
    if (data) {
      setReportData(data)
      return
    }
    setLoading(true)
    fetch('/api/reports/generate?format=json', { credentials: 'include' })
      .then((r) => r.json())
      .then((json) => {
        if (json?.data) setReportData(json.data)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [data])

  const handleExport = async (format: ReportFormat) => {
    setIsExporting(true)
    try {
      if (format === 'csv') {
        const res = await fetch('/api/reports/generate?format=csv', { credentials: 'include' })
        if (!res.ok) throw new Error(`CSV export failed (${res.status})`)
        {
          const blob = await res.blob()
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `codespectra-report-${new Date().toISOString().slice(0, 10)}.csv`
          a.click()
          setTimeout(() => URL.revokeObjectURL(url), 1000)
        }
        return
      }

      const res = await fetch('/api/reports/generate?format=json', { credentials: 'include' })
      if (!res.ok) throw new Error(`JSON export failed (${res.status})`)
      const json = await res.json()
      const blob = new Blob([JSON.stringify(json.data || json, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `codespectra-report-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) {
      console.error('[CodeSpectra] Export failed:', e)
      addToast({ type: 'error', title: 'Export failed', message: 'Try again in a moment.' })
    } finally {
      setIsExporting(false)
    }
  }

  if (!loading && !reportData) {
    return (
      <EmptyState illustration="scanner"
        title="No report yet"
        description="Run a scan first. Your report will use the results from your scans."
        actionLabel="Run a scan"
        actionHref="/dashboard/scanner"
      />
    )
  }

  const defaultData: ReportData = reportData ?? {
    quality: null, bugs: 0, vulnerabilities: 0, codeSmells: 0, testCoverage: null, complexity: null,
  }
  const q = defaultData.quality

  const qualityColor =
    q == null
      ? { bg: 'bg-muted/40', text: 'text-muted-foreground', border: 'border-border' }
      : q >= 80
      ? { bg: 'bg-green-500/20', text: 'text-green-600', border: 'border-green-500/30' }
      : q >= 60
      ? { bg: 'bg-yellow-500/20', text: 'text-yellow-600', border: 'border-yellow-500/30' }
      : { bg: 'bg-red-500/20', text: 'text-red-600', border: 'border-red-500/30' }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span className="ml-2 text-sm text-muted-foreground">Loading report data…</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <FileText className="w-5 h-5" />
          Generate report
        </h3>
        <p className="text-sm text-muted-foreground">
          Export comprehensive code quality reports in multiple formats
        </p>
      </div>

      <Card className={`border ${qualityColor.border} ${qualityColor.bg} p-6`}>
        <div className="space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Overall quality</p>
              <div className="flex items-baseline gap-2">
                <span className={`text-5xl font-bold tabular-nums ${qualityColor.text}`}>{q ?? '—'}</span>
                <span className="text-lg text-muted-foreground">/100</span>
              </div>
            </div>
            <Badge className={`${qualityColor.bg} ${qualityColor.text} border ${qualityColor.border}`}>
              {q == null ? 'Not measured' : q >= 80 ? 'Excellent' : q >= 60 ? 'Good' : 'Needs improvement'}
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-3 border-t border-foreground/10">
            <div>
              <p className="text-xs text-muted-foreground">Repository</p>
              <p className="text-sm font-medium text-foreground">{defaultData.repository || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Branch</p>
              <p className="text-sm font-medium text-foreground">{defaultData.branch || '—'}</p>
            </div>
            <div className="col-span-2">
              <p className="text-xs text-muted-foreground">Generated</p>
              <p className="text-sm font-medium text-foreground">
                {formatDateTime(defaultData.generatedAt || defaultData.timestamp || new Date().toISOString())}
              </p>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground mb-1">Bugs</p>
          <p className="text-2xl font-bold text-foreground">{defaultData.bugs}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground mb-1">Vulnerabilities</p>
          <p className="text-2xl font-bold text-foreground">{defaultData.vulnerabilities}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground mb-1">Code smells</p>
          <p className="text-2xl font-bold text-foreground">{defaultData.codeSmells}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground mb-1">Test coverage</p>
          <p className="text-2xl font-bold text-foreground">{defaultData.testCoverage != null ? `${defaultData.testCoverage}%` : '—'}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground mb-1">Complexity</p>
          <p className="text-2xl font-bold text-foreground">{defaultData.complexity ?? '—'}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground mb-1">Fixes applied</p>
          <p className="text-2xl font-bold text-green-500">{defaultData.appliedFixes ?? 0}</p>
        </Card>
      </div>

      <div className="space-y-4">
        <h4 className="font-semibold text-foreground text-sm">Export format</h4>

        <div className="grid grid-cols-3 gap-3">
          {(['json', 'csv'] as const).map((format) => (
            <button
              key={format}
              onClick={() => setSelectedFormat(format)}
              className={`p-3 rounded border-2 transition-all ${
                selectedFormat === format
                  ? 'border-primary bg-primary/10'
                  : 'border-border bg-card/30 hover:bg-card/50'
              }`}
            >
              <div className="text-sm font-medium text-foreground uppercase">{format}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {format === 'json' ? 'JSON format' : 'Spreadsheet'}
              </div>
            </button>
          ))}
        </div>
      </div>

      <Button
        onClick={() => void handleExport(selectedFormat)}
        disabled={isExporting}
        className="gap-2 w-full sm:w-auto"
      >
        {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="w-4 h-4" />}
        {isExporting ? 'Exporting…' : `Export as ${selectedFormat.toUpperCase()}`}
      </Button>
    </div>
  )
}