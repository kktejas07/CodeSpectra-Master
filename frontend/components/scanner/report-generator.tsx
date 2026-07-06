'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { FileText, Download, Mail, Share2, Calendar, Zap, Loader2 } from 'lucide-react'

interface ReportData {
  quality: number
  bugs: number
  vulnerabilities: number
  codeSmells: number
  testCoverage: number
  complexity: number
  timestamp: string
  repository?: string
  branch?: string
  author?: string
  totalScans?: number
  appliedFixes?: number
  pendingFixes?: number
}

interface ReportGeneratorProps {
  data?: ReportData
  onExport?: (format: 'pdf' | 'json' | 'csv') => void
  onEmail?: (recipients: string[]) => void
  onShare?: (link: string) => void
}

type ReportFormat = 'pdf' | 'json' | 'csv'

export function ReportGenerator({ data, onExport, onEmail, onShare }: ReportGeneratorProps) {
  const [reportData, setReportData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(!data)
  const [showEmailForm, setShowEmailForm] = useState(false)
  const [emailRecipients, setEmailRecipients] = useState('')
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
        if (json.data) setReportData(json.data)
        else if (!json.error) setReportData(json)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [data])

  const handleExport = async (format: ReportFormat) => {
    setIsExporting(true)
    try {
      if (format === 'json' && onExport) {
        onExport(format)
        return
      }

      if (format === 'csv') {
        const res = await fetch('/api/reports/generate?format=csv', { credentials: 'include' })
        if (res.ok) {
          const blob = await res.blob()
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `codespectra-report-${new Date().toISOString().slice(0, 10)}.csv`
          a.click()
          URL.revokeObjectURL(url)
        }
        return
      }

      const res = await fetch('/api/reports/generate?format=json', { credentials: 'include' })
      const json = await res.json()
      const blob = new Blob([JSON.stringify(json.data || json, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `codespectra-report-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error('[CodeSpectra] Export failed:', e)
    } finally {
      setIsExporting(false)
    }
  }

  const handleEmailReport = () => {
    if (!emailRecipients.trim()) return
    const recipients = emailRecipients.split(',').map((e) => e.trim()).filter(Boolean)
    onEmail?.(recipients)
    setEmailRecipients('')
    setShowEmailForm(false)
  }

  const handleShareReport = () => {
    const shareLink = `${window.location.origin}/reports/${Math.random().toString(36).substr(2, 9)}`
    onShare?.(shareLink)
    navigator.clipboard.writeText(shareLink)
  }

  const defaultData: ReportData = reportData || {
    quality: 75,
    bugs: 0,
    vulnerabilities: 0,
    codeSmells: 0,
    testCoverage: 75,
    complexity: 30,
    timestamp: new Date().toISOString(),
    repository: '—',
    branch: '—',
    author: 'Unknown',
  }

  const qualityColor =
    defaultData.quality >= 80
      ? { bg: 'bg-green-500/20', text: 'text-green-600', border: 'border-green-500/30' }
      : defaultData.quality >= 60
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
          Generate Report
        </h3>
        <p className="text-sm text-foreground/60">
          Export comprehensive code quality reports in multiple formats
        </p>
      </div>

      <Card className={`border ${qualityColor.border} ${qualityColor.bg} p-6`}>
        <div className="space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-foreground/60 mb-1">Overall Quality</p>
              <div className="flex items-baseline gap-2">
                <span className={`text-5xl font-bold ${qualityColor.text}`}>{defaultData.quality}</span>
                <span className="text-lg text-foreground/60">/100</span>
              </div>
            </div>
            <Badge className={`${qualityColor.bg} ${qualityColor.text} border ${qualityColor.border}`}>
              {defaultData.quality >= 80 ? 'Excellent' : defaultData.quality >= 60 ? 'Good' : 'Needs Improvement'}
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-3 border-t border-foreground/10">
            <div>
              <p className="text-xs text-foreground/60">Repository</p>
              <p className="text-sm font-medium text-foreground">{defaultData.repository}</p>
            </div>
            <div>
              <p className="text-xs text-foreground/60">Branch</p>
              <p className="text-sm font-medium text-foreground">{defaultData.branch}</p>
            </div>
            <div className="col-span-2">
              <p className="text-xs text-foreground/60">Generated</p>
              <p className="text-sm font-medium text-foreground">
                {new Date(defaultData.timestamp).toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card className="bg-card/30 border border-border p-4">
          <p className="text-xs text-foreground/60 mb-1">Bugs</p>
          <p className="text-2xl font-bold text-foreground">{defaultData.bugs}</p>
        </Card>
        <Card className="bg-card/30 border border-border p-4">
          <p className="text-xs text-foreground/60 mb-1">Vulnerabilities</p>
          <p className="text-2xl font-bold text-foreground">{defaultData.vulnerabilities}</p>
        </Card>
        <Card className="bg-card/30 border border-border p-4">
          <p className="text-xs text-foreground/60 mb-1">Code Smells</p>
          <p className="text-2xl font-bold text-foreground">{defaultData.codeSmells}</p>
        </Card>
        <Card className="bg-card/30 border border-border p-4">
          <p className="text-xs text-foreground/60 mb-1">Test Coverage</p>
          <p className="text-2xl font-bold text-foreground">{defaultData.testCoverage}%</p>
        </Card>
        <Card className="bg-card/30 border border-border p-4">
          <p className="text-xs text-foreground/60 mb-1">Complexity</p>
          <p className="text-2xl font-bold text-foreground">{defaultData.complexity}</p>
        </Card>
        <Card className="bg-card/30 border border-border p-4">
          <p className="text-xs text-foreground/60 mb-1">Fixes Applied</p>
          <p className="text-2xl font-bold text-green-500">{defaultData.appliedFixes ?? 0}</p>
        </Card>
      </div>

      <div className="space-y-4">
        <h4 className="font-semibold text-foreground text-sm">Export Format</h4>

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
              <div className="text-xs text-foreground/60 mt-1">
                {format === 'json' ? 'JSON format' : 'Spreadsheet'}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Button
          onClick={() => void handleExport(selectedFormat)}
          disabled={isExporting}
          className="gap-2 w-full"
        >
          {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {isExporting ? 'Exporting…' : `Export as ${selectedFormat.toUpperCase()}`}
        </Button>

        <Button
          variant="outline"
          onClick={() => setShowEmailForm(!showEmailForm)}
          className="gap-2 w-full"
        >
          <Mail className="w-4 h-4" />
          Email Report
        </Button>

        <Button
          variant="outline"
          onClick={() => void handleShareReport()}
          className="gap-2 w-full"
        >
          <Share2 className="w-4 h-4" />
          Share Link
        </Button>
      </div>

      {showEmailForm && (
        <Card className="bg-card/30 border border-border p-4 space-y-3">
          <label className="text-sm font-medium text-foreground block">Email Recipients</label>
          <input
            type="text"
            value={emailRecipients}
            onChange={(e) => setEmailRecipients(e.target.value)}
            placeholder="Enter email addresses separated by commas"
            className="w-full px-3 py-2 bg-background border border-border rounded text-sm text-foreground placeholder-foreground/40"
          />
          <div className="flex gap-2">
            <Button onClick={() => void handleEmailReport()} disabled={!emailRecipients.trim()} className="flex-1" size="sm">
              Send Report
            </Button>
            <Button variant="outline" onClick={() => setShowEmailForm(false)} size="sm">
              Cancel
            </Button>
          </div>
        </Card>
      )}

      <Card className="bg-card/30 border border-border p-4 space-y-3">
        <h4 className="font-semibold text-foreground flex items-center gap-2">
          <Calendar className="w-4 h-4" />
          Scheduled Reports
        </h4>
        <p className="text-sm text-foreground/60">
          Set up automatic weekly or monthly reports to be delivered via email
        </p>
        <Button
          variant="outline"
          className="w-full"
          size="sm"
          onClick={() => window.alert('Scheduled reports coming soon!')}
        >
          <Zap className="w-4 h-4 mr-2" />
          Configure Schedules
        </Button>
      </Card>
    </div>
  )
}