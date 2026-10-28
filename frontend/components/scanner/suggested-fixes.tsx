'use client'

import { useState } from 'react'
import { Check, Copy, AlertCircle, Lightbulb, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useT } from '@/lib/i18n/client'

interface Issue {
  type: 'bug' | 'vulnerability' | 'code_smell' | 'security_hotspot' | 'duplicate'
  severity: 'critical' | 'major' | 'minor' | 'info'
  rule: string
  message: string
  line?: number
  effortMinutes?: number
}

interface SuggestedFix {
  issue: Issue
  description: string
  originalCode: string
  suggestedCode: string
  confidenceLevel: number
}

interface SuggestedFixesProps {
  issues: Issue[]
  onApplyFix?: (fixIndex: number) => void
}

const getSeverityTextColor = (severity: string) => {
  const colors: Record<string, string> = {
    critical: 'text-red-500',
    major: 'text-orange-500',
    minor: 'text-yellow-500',
    info: 'text-blue-500',
  }
  return colors[severity] || colors.info
}

const getSeverityColor = (severity: string) => {
  const colors: Record<string, string> = {
    critical: 'bg-red-500/20 text-red-600 border-red-500/30',
    major: 'bg-orange-500/20 text-orange-600 border-orange-500/30',
    minor: 'bg-yellow-500/20 text-yellow-600 border-yellow-500/30',
    info: 'bg-blue-500/20 text-blue-600 border-blue-500/30',
  }
  return colors[severity] || colors.info
}

const getIssueIcon = (type: string) => {
  const icons: Record<string, any> = {
    bug: AlertCircle,
    vulnerability: AlertCircle,
    code_smell: Lightbulb,
    security_hotspot: AlertCircle,
    duplicate: Copy,
  }
  return icons[type] || AlertCircle
}

export function SuggestedFixes({ issues, onApplyFix }: SuggestedFixesProps) {
  const { t } = useT()
  const [expandedIssues, setExpandedIssues] = useState<Set<number>>(new Set())
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)

  const toggleExpanded = (index: number) => {
    const newSet = new Set(expandedIssues)
    if (newSet.has(index)) {
      newSet.delete(index)
    } else {
      newSet.add(index)
    }
    setExpandedIssues(newSet)
  }

  const copyCode = (code: string, index: number) => {
    navigator.clipboard.writeText(code)
    setCopiedIndex(index)
    setTimeout(() => setCopiedIndex(null), 2000)
  }

  if (issues.length === 0) {
    return (
      <Card className="rounded-3xl bg-linear-to-r from-green-500/10 to-green-500/5 border border-green-500/30 p-6 text-center">
        <div className="flex flex-col items-center gap-3">
          <Check className="w-8 h-8 text-green-500" />
          <div>
            <p className="font-semibold text-foreground">{t('tools.noIssuesFound')}</p>
            <p className="text-sm text-muted-foreground">{t('tools.nothingToFixInThisScan')}</p>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground">{t('tools.issuesSuggestedFixes')}</h3>
        <span className="text-xs bg-primary/20 text-primary px-2 py-1 rounded">{t('tools.countIssues', { count: issues.length })}</span>
      </div>

      <div className="space-y-2">
        {issues.map((issue, index) => {
          const IconComponent = getIssueIcon(issue.type)
          const isExpanded = expandedIssues.has(index)

          return (
            <Card
              key={index}
              className="bg-card/30 border border-border overflow-hidden hover:border-primary/50 transition-colors"
            >
              <button
                onClick={() => toggleExpanded(index)}
                className="w-full p-4 flex items-start justify-between gap-4 hover:bg-card/40 transition-colors"
              >
                <div className="flex items-start gap-3 flex-1 text-left">
                  <IconComponent className={`w-5 h-5 shrink-0 mt-0.5 ${getSeverityTextColor(issue.severity)}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap gap-y-0.5">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium border ${getSeverityColor(issue.severity)}`}>
                        {(issue.severity || '').toUpperCase()}
                      </span>
                      <span className="text-sm font-medium text-foreground">{issue.rule}</span>
                    </div>
                    <p className="text-sm text-foreground/70">{issue.message}</p>
                    {issue.line && (
                      <p className="text-xs text-muted-foreground mt-1">{t('tools.lineLine2', { line: issue.line })}</p>
                    )}
                  </div>
                </div>
                {isExpanded ? (
                  <ChevronUp className="w-5 h-5 text-muted-foreground shrink-0" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-muted-foreground shrink-0" />
                )}
              </button>

              {/* Expanded Details */}
              {isExpanded && (
                <div className="px-4 pb-4 border-t border-border/50 space-y-3">
                  <div className="grid md:grid-cols-2 gap-3">
                    {/* Original Code */}
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-foreground/70">{t('tools.currentCode')}</p>
                      <div className="bg-background/50 border border-border rounded p-3">
                        <pre className="text-xs text-muted-foreground overflow-auto max-h-40 whitespace-pre-wrap wrap-break-word">
                          {issue.message.slice(0, 120)}
                        </pre>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="mt-2 text-xs h-6"
                          onClick={() => copyCode(issue.message, index * 2)}
                        >
                          {copiedIndex === index * 2 ? (
                            <>
                              <Check className="w-3 h-3 mr-1" />{t('tools.copied')}</>
                          ) : (
                            <>
                              <Copy className="w-3 h-3 mr-1" />{t('tools.copy')}</>
                          )}
                        </Button>
                      </div>
                    </div>

                    {/* Suggested Code */}
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-foreground/70">{t('tools.suggestedFix')}</p>
                      <div className="bg-green-500/5 border border-green-500/20 rounded p-3">
                        <pre className="text-xs text-muted-foreground overflow-auto max-h-40 whitespace-pre-wrap wrap-break-word">
                          {issue.type === 'bug'
                            ? '// Fix null safety issue\nconst result = data?.value ?? null;'
                            : issue.type === 'vulnerability'
                            ? '// Sanitize input to prevent injection\nconst value = sanitize(userInput);'
                            : issue.type === 'code_smell'
                            ? '// Improve code readability\nconst result = await process(data);'
                            : '// Address security concern\nconst validated = validate(input);'}
                        </pre>
                        <Button
                          size="sm"
                          className="mt-2 text-xs h-6 bg-green-600 hover:bg-green-700"
                          onClick={() => {
                            const suggested = issue.type === 'bug'
                              ? 'const result = data?.value ?? null;'
                              : issue.type === 'vulnerability'
                              ? 'const value = sanitize(userInput);'
                              : issue.type === 'code_smell'
                              ? 'const result = await process(data);'
                              : 'const validated = validate(input);'
                            copyCode(suggested, index * 2 + 1)
                            onApplyFix?.(index)
                          }}
                        >
                          {copiedIndex === index * 2 + 1 ? (
                            <>
                              <Check className="w-3 h-3 mr-1" />{t('tools.copied')}</>
                          ) : (
                            <>
                              <Copy className="w-3 h-3 mr-1" />{t('tools.copyApply')}</>
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Fix Details */}
                  {issue.effortMinutes && (
                    <div className="bg-card/50 border border-border rounded p-3">
                      <p className="text-xs font-medium text-foreground mb-2">{t('tools.whyValueValue2', { value: issue.message.slice(0, 80), value2: issue.message.length > 80 ? '...' : '' })}</p>
                      <p className="text-xs text-muted-foreground">{t('tools.estimatedFixEffortCountMinutes', { count: issue.effortMinutes })}</p>
                    </div>
                  )}
                </div>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}
