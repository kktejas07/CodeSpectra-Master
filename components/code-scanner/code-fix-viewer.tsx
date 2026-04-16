'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  ChevronDown,
  ChevronUp,
  Check,
  X,
  Copy,
  Zap,
  AlertCircle,
} from 'lucide-react'

interface SuggestedFix {
  id: string
  issue_id: string
  issue_severity: 'critical' | 'major' | 'minor' | 'info'
  issue_description: string
  original_code: string
  suggested_code: string
  fix_explanation: string
  confidence_score: number
  line_number?: number
}

interface CodeFixViewerProps {
  fixes: SuggestedFix[]
  onApplyFix?: (fixId: string) => Promise<void>
  onRejectFix?: (fixId: string) => void
}

export function CodeFixViewer({ fixes, onApplyFix, onRejectFix }: CodeFixViewerProps) {
  const [expandedFix, setExpandedFix] = useState<string | null>(fixes[0]?.id || null)
  const [appliedFixes, setAppliedFixes] = useState<Set<string>>(new Set())
  const [rejectedFixes, setRejectedFixes] = useState<Set<string>>(new Set())
  const [applyingFix, setApplyingFix] = useState<string | null>(null)

  const handleApplyFix = async (fixId: string) => {
    setApplyingFix(fixId)
    try {
      await onApplyFix?.(fixId)
      setAppliedFixes(prev => new Set([...prev, fixId]))
    } catch (error) {
      console.error('[v0] Error applying fix:', error)
    } finally {
      setApplyingFix(null)
    }
  }

  const handleRejectFix = (fixId: string) => {
    onRejectFix?.(fixId)
    setRejectedFixes(prev => new Set([...prev, fixId]))
  }

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code)
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'border-l-4 border-l-red-500 bg-red-500/5'
      case 'major':
        return 'border-l-4 border-l-orange-500 bg-orange-500/5'
      case 'minor':
        return 'border-l-4 border-l-yellow-500 bg-yellow-500/5'
      case 'info':
        return 'border-l-4 border-l-blue-500 bg-blue-500/5'
      default:
        return 'border-l-4 border-l-gray-500 bg-gray-500/5'
    }
  }

  const getSeverityBadgeColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-500/20 text-red-700 border-red-500/30'
      case 'major':
        return 'bg-orange-500/20 text-orange-700 border-orange-500/30'
      case 'minor':
        return 'bg-yellow-500/20 text-yellow-700 border-yellow-500/30'
      case 'info':
        return 'bg-blue-500/20 text-blue-700 border-blue-500/30'
      default:
        return 'bg-gray-500/20 text-gray-700 border-gray-500/30'
    }
  }

  if (fixes.length === 0) {
    return (
      <div className="text-center py-12 bg-card border-2 border-dashed border-border rounded-lg">
        <Check className="w-12 h-12 text-green-500 mx-auto mb-3" />
        <p className="text-foreground font-semibold mb-2">No Issues to Fix</p>
        <p className="text-muted-foreground text-sm">Your code is clean and ready to go!</p>
      </div>
    )
  }

  const activeFixes = fixes.filter(fix => !appliedFixes.has(fix.id) && !rejectedFixes.has(fix.id))
  const completedFixes = fixes.filter(fix => appliedFixes.has(fix.id))
  const dismissedFixes = fixes.filter(fix => rejectedFixes.has(fix.id))

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4 bg-card border-border text-center">
          <div className="text-2xl font-bold text-primary">{activeFixes.length}</div>
          <p className="text-xs text-muted-foreground">Pending Fixes</p>
        </Card>
        <Card className="p-4 bg-card border-border text-center">
          <div className="text-2xl font-bold text-green-500">{completedFixes.length}</div>
          <p className="text-xs text-muted-foreground">Applied</p>
        </Card>
        <Card className="p-4 bg-card border-border text-center">
          <div className="text-2xl font-bold text-muted-foreground">{dismissedFixes.length}</div>
          <p className="text-xs text-muted-foreground">Dismissed</p>
        </Card>
      </div>

      {/* Active Fixes */}
      {activeFixes.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-foreground">Suggested Fixes</h3>
          {activeFixes.map((fix, index) => (
            <FixCard
              key={fix.id}
              fix={fix}
              index={index + 1}
              isExpanded={expandedFix === fix.id}
              onToggle={() => setExpandedFix(expandedFix === fix.id ? null : fix.id)}
              onApply={() => handleApplyFix(fix.id)}
              onReject={() => handleRejectFix(fix.id)}
              onCopyCode={() => handleCopyCode(fix.suggested_code)}
              isApplying={applyingFix === fix.id}
              getSeverityColor={getSeverityColor}
              getSeverityBadgeColor={getSeverityBadgeColor}
            />
          ))}
        </div>
      )}

      {/* Applied Fixes */}
      {completedFixes.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-foreground">Applied Fixes</h3>
          <div className="grid gap-2">
            {completedFixes.map(fix => (
              <div key={fix.id} className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/30 rounded">
                <Check className="w-5 h-5 text-green-500" />
                <span className="flex-1 text-sm text-foreground">{fix.issue_description}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dismissed Fixes */}
      {dismissedFixes.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-foreground">Dismissed Fixes</h3>
          <div className="grid gap-2">
            {dismissedFixes.map(fix => (
              <div key={fix.id} className="flex items-center gap-2 p-3 bg-muted/50 border border-border rounded opacity-60">
                <X className="w-5 h-5 text-muted-foreground" />
                <span className="flex-1 text-sm text-muted-foreground">{fix.issue_description}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

interface FixCardProps {
  fix: SuggestedFix
  index: number
  isExpanded: boolean
  onToggle: () => void
  onApply: () => Promise<void>
  onReject: () => void
  onCopyCode: () => void
  isApplying: boolean
  getSeverityColor: (severity: string) => string
  getSeverityBadgeColor: (severity: string) => string
}

function FixCard({
  fix,
  index,
  isExpanded,
  onToggle,
  onApply,
  onReject,
  onCopyCode,
  isApplying,
  getSeverityColor,
  getSeverityBadgeColor,
}: FixCardProps) {
  return (
    <Card className={`p-4 bg-card border-border transition-all ${getSeverityColor(fix.issue_severity)}`}>
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between hover:opacity-75 transition-opacity"
      >
        <div className="flex-1 text-left space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-2 py-1 rounded bg-primary/20 text-primary">
              Fix {index}
            </span>
            <span className={`text-xs font-semibold px-2 py-1 rounded border ${getSeverityBadgeColor(fix.issue_severity)}`}>
              {fix.issue_severity.toUpperCase()}
            </span>
            <span className="text-xs text-muted-foreground">
              Confidence: {Math.round(fix.confidence_score * 100)}%
            </span>
          </div>
          <p className="text-sm font-medium text-foreground">{fix.issue_description}</p>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-5 h-5 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-5 h-5 text-muted-foreground" />
        )}
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="mt-4 space-y-4 pt-4 border-t border-border/50">
          {/* Explanation */}
          <div className="bg-background/50 p-3 rounded space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">WHY THIS FIX?</p>
            <p className="text-sm text-foreground">{fix.fix_explanation}</p>
          </div>

          {/* Code Comparison */}
          <div className="space-y-3">
            {/* Original */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-red-600">BEFORE</p>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onCopyCode()}
                  className="h-6 px-2 gap-1 text-xs"
                >
                  <Copy className="w-3 h-3" />
                  Copy
                </Button>
              </div>
              <CodeBlock code={fix.original_code} language="typescript" isDiff="before" />
            </div>

            {/* Suggested */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-green-600">AFTER</p>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onCopyCode()}
                  className="h-6 px-2 gap-1 text-xs"
                >
                  <Copy className="w-3 h-3" />
                  Copy
                </Button>
              </div>
              <CodeBlock code={fix.suggested_code} language="typescript" isDiff="after" />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 pt-2">
            <Button
              onClick={onApply}
              disabled={isApplying}
              className="flex-1 gap-2"
            >
              {isApplying ? (
                <>
                  <Zap className="w-4 h-4 animate-pulse" />
                  Applying...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Apply Fix
                </>
              )}
            </Button>
            <Button
              onClick={onReject}
              variant="outline"
              className="flex-1"
            >
              Dismiss
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}

interface CodeBlockProps {
  code: string
  language: string
  isDiff?: 'before' | 'after'
}

function CodeBlock({ code, language, isDiff }: CodeBlockProps) {
  const bgColor = isDiff === 'before' ? 'bg-red-500/10 border-red-500/20' : isDiff === 'after' ? 'bg-green-500/10 border-green-500/20' : 'bg-background border-border'
  
  return (
    <pre className={`p-3 rounded border ${bgColor} overflow-x-auto text-xs font-mono text-foreground`}>
      <code>{code}</code>
    </pre>
  )
}
