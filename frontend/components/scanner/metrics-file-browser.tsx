'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { FileCode, AlertCircle, TrendingUp, BarChart3 } from 'lucide-react'
import { useT } from '@/lib/i18n/client'

interface FileMetric {
  path: string
  language: string
  loc: number
  complexity: number
  bugs: number
  vulnerabilities: number
  codeSmells: number
  coverage: number
  duplication: number
}

interface MetricsFileBrowserProps {
  files?: FileMetric[]
  onSelectFile?: (file: FileMetric) => void
}

export function MetricsFileBrowser({ files = [], onSelectFile }: MetricsFileBrowserProps) {
  const { t } = useT()
  const [sortBy, setSortBy] = useState<'loc' | 'complexity' | 'bugs' | 'coverage'>('loc')
  const [filterLanguage, setFilterLanguage] = useState('all')

  const languages = ['all', ...new Set(files.map((f) => f.language))]
  const filtered = filterLanguage === 'all' ? files : files.filter((f) => f.language === filterLanguage)
  const sorted = [...filtered].sort((a, b) => {
    switch (sortBy) {
      case 'loc':
        return b.loc - a.loc
      case 'complexity':
        return b.complexity - a.complexity
      case 'bugs':
        return b.bugs - a.bugs
      case 'coverage':
        return a.coverage - b.coverage
      default:
        return 0
    }
  })

  const getSeverityColor = (value: number, metric: string) => {
    if (metric === 'coverage') return value >= 80 ? 'text-green-500' : value >= 60 ? 'text-yellow-500' : 'text-red-500'
    return value === 0 ? 'text-green-500' : value <= 3 ? 'text-yellow-500' : 'text-red-500'
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="sr-only">{t('tools.codeMetrics')}</h2>
        <p className="text-sm text-muted-foreground">{t('tools.fileLevelAnalysisOfCodeQualityaa5')}</p>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-4 items-center">
          <div>
            <label className="text-sm font-medium block mb-2">{t('common.language')}</label>
            <select
              value={filterLanguage}
              onChange={(e) => setFilterLanguage(e.target.value)}
              className="px-3 py-2 rounded-lg bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {languages.map((lang) => (
                <option key={lang} value={lang}>
                  {lang === 'all' ? t('tools.allLanguages') : lang}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium block mb-2">{t('tools.sortBy')}</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-3 py-2 rounded-lg bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="loc">{t('tools.linesOfCode')}</option>
              <option value="complexity">{t('tools.complexity')}</option>
              <option value="bugs">{t('tools.bugs')}</option>
              <option value="coverage">{t('tools.coverage')}</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Files Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-semibold text-foreground">{t('tools.file')}</th>
                <th className="text-right px-4 py-3 text-sm font-semibold text-foreground">{t('tools.loc')}</th>
                <th className="text-right px-4 py-3 text-sm font-semibold text-foreground">{t('tools.complexity')}</th>
                <th className="text-right px-4 py-3 text-sm font-semibold text-foreground">{t('tools.bugs')}</th>
                <th className="text-right px-4 py-3 text-sm font-semibold text-foreground">{t('tools.vulnerabilities')}</th>
                <th className="text-right px-4 py-3 text-sm font-semibold text-foreground">{t('tools.codeSmells')}</th>
                <th className="text-right px-4 py-3 text-sm font-semibold text-foreground">{t('tools.coverage')}</th>
                <th className="text-right px-4 py-3 text-sm font-semibold text-foreground">{t('tools.duplication')}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">{t('tools.noFilesToDisplay')}</td>
                </tr>
              ) : (
                sorted.map((file, idx) => (
                  <tr role="button" tabIndex={0} onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.currentTarget.click() } }}
                    key={idx}
                    onClick={() => onSelectFile?.(file)}
                    className="border-t border-border hover:bg-muted/50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 flex items-center gap-2">
                      <FileCode className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="font-medium text-foreground text-sm">{(file.path || '').split('/').pop()}</p>
                        <p className="text-xs text-muted-foreground">{file.path || t('tools.unknown')}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-medium">{file.loc}</td>
                    <td className={`px-4 py-3 text-right text-sm font-medium ${getSeverityColor(file.complexity, 'complexity')}`}>
                      {file.complexity}
                    </td>
                    <td className={`px-4 py-3 text-right text-sm font-medium ${getSeverityColor(file.bugs, 'bugs')}`}>
                      {file.bugs}
                    </td>
                    <td className={`px-4 py-3 text-right text-sm font-medium ${getSeverityColor(file.vulnerabilities, 'bugs')}`}>
                      {file.vulnerabilities}
                    </td>
                    <td className={`px-4 py-3 text-right text-sm font-medium ${getSeverityColor(file.codeSmells, 'bugs')}`}>
                      {file.codeSmells}
                    </td>
                    <td className={`px-4 py-3 text-right text-sm font-medium ${getSeverityColor(file.coverage, 'coverage')}`}>
                      {file.coverage}%
                    </td>
                    <td className={`px-4 py-3 text-right text-sm font-medium ${getSeverityColor(file.duplication, 'bugs')}`}>
                      {file.duplication}%
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Summary Stats */}
      <div className="grid md:grid-cols-4 gap-4">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground mb-2">{t('tools.totalFiles')}</p>
          <p className="text-3xl font-bold">{filtered.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground mb-2">{t('tools.totalIssues')}</p>
          <p className="text-3xl font-bold">
            {filtered.reduce((sum, f) => sum + f.bugs + f.vulnerabilities + f.codeSmells, 0)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground mb-2">{t('tools.avgCoverage')}</p>
          <p className="text-3xl font-bold">
            {filtered.length > 0 ? (filtered.reduce((sum, f) => sum + f.coverage, 0) / filtered.length).toFixed(1) : 0}%
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground mb-2">{t('tools.totalLoc')}</p>
          <p className="text-3xl font-bold">{filtered.reduce((sum, f) => sum + f.loc, 0)}</p>
        </Card>
      </div>
    </div>
  )
}
