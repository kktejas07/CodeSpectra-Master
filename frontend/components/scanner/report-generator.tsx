'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { FileText, Download, Mail, Share2, Calendar, Zap } from 'lucide-react'

interface ReportData {
  quality: number
  bugs: number
  vulnerabilities: number
  codeSmells: number
  testCoverage: number
  complexity: number
  timestamp: Date
  repository?: string
  branch?: string
  author?: string
}

interface ReportGeneratorProps {
  data?: ReportData
  onExport?: (format: 'pdf' | 'json' | 'csv') => void
  onEmail?: (recipients: string[]) => void
  onShare?: (link: string) => void
}

type ReportFormat = 'pdf' | 'json' | 'csv'

export function ReportGenerator({ data, onExport, onEmail, onShare }: ReportGeneratorProps) {
  const [showEmailForm, setShowEmailForm] = useState(false)
  const [emailRecipients, setEmailRecipients] = useState('')
  const [selectedFormat, setSelectedFormat] = useState<ReportFormat>('pdf')
  const [isExporting, setIsExporting] = useState(false)

  const handleExport = async (format: ReportFormat) => {
    setIsExporting(true)
    try {
      onExport?.(format)
      console.log(`[CodeSpectra] Exporting report as ${format}`)
    } finally {
      setIsExporting(false)
    }
  }

  const handleEmailReport = () => {
    if (!emailRecipients.trim()) return
    const recipients = emailRecipients
      .split(',')
      .map((e) => e.trim())
      .filter((e) => e)
    onEmail?.(recipients)
    setEmailRecipients('')
    setShowEmailForm(false)
  }

  const handleShareReport = () => {
    const shareLink = `${window.location.origin}/reports/${Math.random().toString(36).substr(2, 9)}`
    onShare?.(shareLink)
  }

  const defaultData: ReportData = data || {
    quality: 85,
    bugs: 2,
    vulnerabilities: 0,
    codeSmells: 5,
    testCoverage: 82,
    complexity: 38,
    timestamp: new Date(),
    repository: 'example-repo',
    branch: 'main',
    author: 'Team CodeSpectra',
  }

  const getQualityColor = (score: number) => {
    if (score >= 80) return { bg: 'bg-green-500/20', text: 'text-green-600', border: 'border-green-500/30' }
    if (score >= 60) return { bg: 'bg-yellow-500/20', text: 'text-yellow-600', border: 'border-yellow-500/30' }
    return { bg: 'bg-red-500/20', text: 'text-red-600', border: 'border-red-500/30' }
  }

  const qualityColor = getQualityColor(defaultData.quality)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <FileText className="w-5 h-5" />
          Generate Report
        </h3>
        <p className="text-sm text-foreground/60">
          Create and export comprehensive code quality reports in multiple formats
        </p>
      </div>

      {/* Report Preview */}
      <Card className={`border ${qualityColor.border} ${qualityColor.bg} p-6`}>
        <div className="space-y-4">
          {/* Quality Score Display */}
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-foreground/60 mb-1">Overall Quality</p>
              <div className="flex items-baseline gap-2">
                <span className={`text-5xl font-bold ${qualityColor.text}`}>{defaultData.quality}</span>
                <span className="text-lg text-foreground/60">/100</span>
              </div>
            </div>
            <Badge className={`${qualityColor.bg} ${qualityColor.text} border ${qualityColor.border}`}>
              {defaultData.quality >= 80
                ? 'Excellent'
                : defaultData.quality >= 60
                  ? 'Good'
                  : 'Needs Improvement'}
            </Badge>
          </div>

          {/* Report Metadata */}
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
              <p className="text-sm font-medium text-foreground">{defaultData.timestamp.toLocaleString()}</p>
            </div>
          </div>
        </div>
      </Card>

      {/* Metrics Summary */}
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
          <p className="text-xs text-foreground/60 mb-1">Author</p>
          <p className="text-sm font-bold text-foreground truncate">{defaultData.author}</p>
        </Card>
      </div>

      {/* Export Options */}
      <div className="space-y-4">
        <h4 className="font-semibold text-foreground text-sm">Export Format</h4>

        <div className="grid grid-cols-3 gap-3">
          {(['pdf', 'json', 'csv'] as const).map((format) => (
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
                {format === 'pdf' && 'Download as PDF'}
                {format === 'json' && 'JSON format'}
                {format === 'csv' && 'Spreadsheet'}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Button
          onClick={() => handleExport(selectedFormat)}
          disabled={isExporting}
          className="gap-2 w-full"
        >
          <Download className="w-4 h-4" />
          Export as {selectedFormat.toUpperCase()}
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
          onClick={handleShareReport}
          className="gap-2 w-full"
        >
          <Share2 className="w-4 h-4" />
          Share Link
        </Button>
      </div>

      {/* Email Form */}
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
            <Button
              onClick={handleEmailReport}
              disabled={!emailRecipients.trim()}
              className="flex-1"
              size="sm"
            >
              Send Report
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowEmailForm(false)}
              size="sm"
            >
              Cancel
            </Button>
          </div>
        </Card>
      )}

      {/* Scheduled Reports */}
      <Card className="bg-card/30 border border-border p-4 space-y-3">
        <h4 className="font-semibold text-foreground flex items-center gap-2">
          <Calendar className="w-4 h-4" />
          Scheduled Reports
        </h4>
        <p className="text-sm text-foreground/60">
          Set up automatic weekly or monthly reports to be delivered via email
        </p>
        <Button variant="outline" className="w-full" size="sm">
          <Zap className="w-4 h-4 mr-2" />
          Configure Schedules
        </Button>
      </Card>
    </div>
  )
}
