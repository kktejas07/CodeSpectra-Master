'use client'

import { Loader2, CheckCircle2, AlertCircle, Lightbulb } from 'lucide-react'

interface AnalysisPanelProps {
  analysis: Record<string, unknown> | null
  loading: boolean
  hasSubmitted: boolean
}

export function AnalysisPanel({ analysis, loading, hasSubmitted }: AnalysisPanelProps) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
        <Loader2 className="h-4 w-4 animate-spin" />
        AI analyzing your submission…
      </div>
    )
  }

  if (!hasSubmitted) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
        <Lightbulb className="h-6 w-6 opacity-40" />
        <p>Submit your code to get AI-powered analysis</p>
        <p className="text-xs">Includes time complexity review, edge cases, and improvement suggestions</p>
      </div>
    )
  }

  if (!analysis) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        Analysis will appear here after submission.
      </div>
    )
  }

  const complexity = analysis.complexity as string | undefined
  const suggestions = analysis.suggestions as string[] | undefined
  const strengths = analysis.strengths as string[] | undefined
  const issues = analysis.issues as string[] | undefined
  const score = analysis.score as number | undefined

  return (
    <div className="space-y-4 text-sm">
      {score !== undefined && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/60">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <span className="text-lg font-bold text-primary">{score}</span>
          </div>
          <div>
            <p className="font-medium text-foreground">Overall Score</p>
            <p className="text-xs text-muted-foreground">Based on efficiency, readability, and correctness</p>
          </div>
        </div>
      )}

      {complexity && (
        <div className="p-3 rounded-lg bg-muted/20 border border-border/40">
          <p className="text-xs font-medium text-muted-foreground mb-1">Time Complexity</p>
          <p className="font-mono text-sm text-foreground">{complexity}</p>
        </div>
      )}

      {strengths && strengths.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Strengths</p>
          {strengths.map((s, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0 text-emerald-500" />
              <span>{s}</span>
            </div>
          ))}
        </div>
      )}

      {issues && issues.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-amber-600 dark:text-amber-400">Areas to Improve</p>
          {issues.map((s, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-500" />
              <span>{s}</span>
            </div>
          ))}
        </div>
      )}

      {suggestions && suggestions.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-primary">Suggestions</p>
          {suggestions.map((s, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
              <Lightbulb className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
              <span>{s}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
