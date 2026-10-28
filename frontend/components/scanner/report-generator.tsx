'use client'
import { useLocaleDates } from '@/lib/i18n/use-dates'
import { useToast } from '@/lib/toast-context'
import { EmptyState } from '@/components/ui/empty-state'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { FileText, Download, Loader2 } from 'lucide-react'
import { useT } from '@/lib/i18n/client'

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
  const { formatDateTime } = useLocaleDates()
  const { t } = useT()
  const addToast = useToast()
  const [reportData, setReportData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(!data)
  const [selectedFormat, setSelectedFormat] = useState<ReportFormat>('json')
  const [isExporting, setIsExporting] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (data) {
      setReportData(data)
      return
    }
    setLoading(true)
    setLoadError(false)
    fetch('/api/reports/generate?format=json', { credentials: 'include' })
      .then(async (r) => {
        const json = await r.json().catch(() => null)
        if (!r.ok) throw new Error(t('tools.loadFailed'))
        if (json?.data) setReportData(json.data)
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false))
  }, [data, reloadKey])

  const handleExport = async (format: ReportFormat) => {
    setIsExporting(true)
    try {
      if (format === 'csv') {
        const res = await fetch('/api/reports/generate?format=csv', { credentials: 'include' })
        if (!res.ok) throw new Error(t('tools.csvExportFailedStatus', { status: res.status }))
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
      if (!res.ok) throw new Error(t('tools.jsonExportFailedStatus', { status: res.status }))
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
      addToast({ type: 'error', title: t('tools.exportFailed'), message: t('tools.tryAgainInAMoment') })
    } finally {
      setIsExporting(false)
    }
  }

  if (!loading && loadError) {
    return (
      <EmptyState
        compact
        illustration="error"
        title={t('tools.couldntLoadYourReport')}
        description={t('tools.checkYourConnectionAndTryAgain')}
        actionLabel={t('common.tryAgain')}
        onAction={() => setReloadKey((k) => k + 1)}
      />
    )
  }

  if (!loading && !reportData) {
    return (
      <EmptyState illustration="scanner"
        title={t('tools.noReportYet')}
        description={t('tools.runAScanFirstYourReport426')}
        actionLabel={t('tools.runAScan')}
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
        <span className="ml-2 text-sm text-muted-foreground">{t('tools.loadingReportData')}</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <FileText className="w-5 h-5" />{t('tools.generateReport')}</h3>
        <p className="text-sm text-muted-foreground">{t('tools.exportComprehensiveCodeQualityReportsIn035')}</p>
      </div>

      <Card className={`border ${qualityColor.border} ${qualityColor.bg} p-6`}>
        <div className="space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-1">{t('tools.overallQuality')}</p>
              <div className="flex items-baseline gap-2">
                <span className={`text-5xl font-bold tabular-nums ${qualityColor.text}`}>{q ?? '—'}</span>
                <span className="text-lg text-muted-foreground">/100</span>
              </div>
            </div>
            <Badge className={`${qualityColor.bg} ${qualityColor.text} border ${qualityColor.border}`}>
              {q == null ? t('tools.notMeasured') : q >= 80 ? t('tools.excellent') : q >= 60 ? t('tools.good') : t('tools.needsImprovement')}
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-3 border-t border-foreground/10">
            <div>
              <p className="text-xs text-muted-foreground">{t('tools.repository')}</p>
              <p className="text-sm font-medium text-foreground">{defaultData.repository || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t('tools.branch')}</p>
              <p className="text-sm font-medium text-foreground">{defaultData.branch || '—'}</p>
            </div>
            <div className="col-span-2">
              <p className="text-xs text-muted-foreground">{t('tools.generated')}</p>
              <p className="text-sm font-medium text-foreground">
                {formatDateTime(defaultData.generatedAt || defaultData.timestamp || new Date().toISOString())}
              </p>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground mb-1">{t('tools.bugs')}</p>
          <p className="text-2xl font-bold text-foreground">{defaultData.bugs}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground mb-1">{t('tools.vulnerabilities')}</p>
          <p className="text-2xl font-bold text-foreground">{defaultData.vulnerabilities}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground mb-1">{t('tools.codeSmells3')}</p>
          <p className="text-2xl font-bold text-foreground">{defaultData.codeSmells}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground mb-1">{t('tools.testCoverage3')}</p>
          <p className="text-2xl font-bold text-foreground">{defaultData.testCoverage != null ? `${defaultData.testCoverage}%` : '—'}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground mb-1">{t('tools.complexity')}</p>
          <p className="text-2xl font-bold text-foreground">{defaultData.complexity ?? '—'}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground mb-1">{t('tools.fixesApplied')}</p>
          <p className="text-2xl font-bold text-green-500">{defaultData.appliedFixes ?? 0}</p>
        </Card>
      </div>

      <div className="space-y-4">
        <h4 className="font-semibold text-foreground text-sm">{t('tools.exportFormat')}</h4>

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
                {format === 'json' ? t('tools.jsonFormat') : t('tools.spreadsheet')}
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
        {isExporting ? t('tools.exporting') : t('tools.exportAsValue', { value: selectedFormat.toUpperCase() })}
      </Button>
    </div>
  )
}