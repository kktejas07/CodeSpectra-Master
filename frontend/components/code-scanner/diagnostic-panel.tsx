'use client'

import { useState } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  Info,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export interface Diagnostic {
  id: string
  line: number
  column: number
  message: string
  severity: 'error' | 'warning' | 'info'
  code?: string
  rule?: string
  fix?: string
}

interface DiagnosticPanelProps {
  diagnostics: Diagnostic[]
  onSelectDiagnostic?: (diagnostic: Diagnostic) => void
  height?: number
}

export function DiagnosticPanel({
  diagnostics,
  onSelectDiagnostic,
  height = 300,
}: DiagnosticPanelProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [filterSeverity, setFilterSeverity] = useState<string | null>(null)

  const filteredDiagnostics = filterSeverity
    ? diagnostics.filter(d => d.severity === filterSeverity)
    : diagnostics

  const errorCount = diagnostics.filter(d => d.severity === 'error').length
  const warningCount = diagnostics.filter(d => d.severity === 'warning').length
  const infoCount = diagnostics.filter(d => d.severity === 'info').length

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-500" />
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />
      case 'info':
        return <Info className="w-5 h-5 text-blue-500" />
      default:
        return <CheckCircle2 className="w-5 h-5 text-green-500" />
    }
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'error':
        return 'bg-red-500/10 border-red-500/20 hover:bg-red-500/15'
      case 'warning':
        return 'bg-yellow-500/10 border-yellow-500/20 hover:bg-yellow-500/15'
      case 'info':
        return 'bg-blue-500/10 border-blue-500/20 hover:bg-blue-500/15'
      default:
        return 'bg-green-500/10 border-green-500/20 hover:bg-green-500/15'
    }
  }

  return (
    <div className="space-y-3">
      {/* Header with Summary */}
      <div className="flex items-center justify-between px-3 py-2 bg-card border border-border rounded-lg">
        <div className="text-sm font-semibold text-foreground">Issues Found</div>
        <div className="flex items-center gap-4">
          {errorCount > 0 && (
            <div className="flex items-center gap-1 text-xs">
              <AlertCircle className="w-4 h-4 text-red-500" />
              <span className="font-semibold">{errorCount}</span>
            </div>
          )}
          {warningCount > 0 && (
            <div className="flex items-center gap-1 text-xs">
              <AlertTriangle className="w-4 h-4 text-yellow-500" />
              <span className="font-semibold">{warningCount}</span>
            </div>
          )}
          {infoCount > 0 && (
            <div className="flex items-center gap-1 text-xs">
              <Info className="w-4 h-4 text-blue-500" />
              <span className="font-semibold">{infoCount}</span>
            </div>
          )}
          {diagnostics.length === 0 && (
            <div className="flex items-center gap-1 text-xs text-green-600">
              <CheckCircle2 className="w-4 h-4" />
              <span className="font-semibold">No issues</span>
            </div>
          )}
        </div>
      </div>

      {/* Filter Buttons */}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant={filterSeverity === null ? 'default' : 'outline'}
          onClick={() => setFilterSeverity(null)}
          className="text-xs"
        >
          All ({diagnostics.length})
        </Button>
        {errorCount > 0 && (
          <Button
            size="sm"
            variant={filterSeverity === 'error' ? 'default' : 'outline'}
            onClick={() => setFilterSeverity('error')}
            className="text-xs gap-1"
          >
            <AlertCircle className="w-3 h-3" />
            Errors ({errorCount})
          </Button>
        )}
        {warningCount > 0 && (
          <Button
            size="sm"
            variant={filterSeverity === 'warning' ? 'default' : 'outline'}
            onClick={() => setFilterSeverity('warning')}
            className="text-xs gap-1"
          >
            <AlertTriangle className="w-3 h-3" />
            Warnings ({warningCount})
          </Button>
        )}
        {infoCount > 0 && (
          <Button
            size="sm"
            variant={filterSeverity === 'info' ? 'default' : 'outline'}
            onClick={() => setFilterSeverity('info')}
            className="text-xs gap-1"
          >
            <Info className="w-3 h-3" />
            Info ({infoCount})
          </Button>
        )}
      </div>

      {/* Diagnostics List */}
      <div
        className="space-y-2 overflow-y-auto border border-border rounded-lg p-3 bg-card"
        style={{ maxHeight: `${height}px` }}
      >
        {filteredDiagnostics.length === 0 ? (
          <div className="text-center py-6">
            <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No issues in this category</p>
          </div>
        ) : (
          filteredDiagnostics.map(diagnostic => (
            <DiagnosticItem
              key={diagnostic.id}
              diagnostic={diagnostic}
              isExpanded={expandedId === diagnostic.id}
              onToggle={() =>
                setExpandedId(expandedId === diagnostic.id ? null : diagnostic.id)
              }
              onSelect={() => onSelectDiagnostic?.(diagnostic)}
              getSeverityIcon={getSeverityIcon}
              getSeverityColor={getSeverityColor}
            />
          ))
        )}
      </div>

      {/* Summary Stats */}
      {diagnostics.length > 0 && (
        <div className="text-xs text-muted-foreground px-3 py-2 bg-secondary/30 rounded">
          <p>
            {diagnostics.length} issue{diagnostics.length !== 1 ? 's' : ''} found across{' '}
            {new Set(diagnostics.map(d => d.line)).size} line
            {new Set(diagnostics.map(d => d.line)).size !== 1 ? 's' : ''}
          </p>
        </div>
      )}
    </div>
  )
}

interface DiagnosticItemProps {
  diagnostic: Diagnostic
  isExpanded: boolean
  onToggle: () => void
  onSelect: () => void
  getSeverityIcon: (severity: string) => React.ReactNode
  getSeverityColor: (severity: string) => string
}

function DiagnosticItem({
  diagnostic,
  isExpanded,
  onToggle,
  onSelect,
  getSeverityIcon,
  getSeverityColor,
}: DiagnosticItemProps) {
  return (
    <Card
      className={`p-3 cursor-pointer border transition-all ${getSeverityColor(
        diagnostic.severity
      )}`}
      onClick={() => {
        onSelect()
        onToggle()
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          <div className="mt-0.5 flex-shrink-0">{getSeverityIcon(diagnostic.severity)}</div>
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-foreground line-clamp-2">
                {diagnostic.message}
              </p>
              <span className="text-xs px-2 py-1 bg-black/10 rounded flex-shrink-0">
                L{diagnostic.line}:C{diagnostic.column}
              </span>
            </div>
            {diagnostic.code && (
              <p className="text-xs text-muted-foreground">{diagnostic.code}</p>
            )}
          </div>
        </div>
        <div className="flex-shrink-0">
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </div>

      {isExpanded && diagnostic.fix && (
        <div className="mt-3 pt-3 border-t border-current/20 space-y-2">
          <p className="text-xs font-semibold text-foreground">Suggested Fix:</p>
          <pre className="text-xs bg-black/20 p-2 rounded overflow-x-auto text-foreground">
            {diagnostic.fix}
          </pre>
        </div>
      )}
    </Card>
  )
}
