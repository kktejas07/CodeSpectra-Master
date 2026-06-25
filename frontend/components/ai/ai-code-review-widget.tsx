'use client'

import { useState } from 'react'
import { AlertTriangle, CheckCircle2, Info, Loader2, ShieldAlert, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface ReviewConcern {
  severity: 'critical' | 'major' | 'minor'
  title: string
  detail: string
  line?: number
}
interface ReviewResult {
  summary?: string
  strengths?: string[]
  concerns?: ReviewConcern[]
  suggestions?: string[]
  overall_rating?: number
  review_id?: string
}

interface Props {
  code: string
  language?: string
  scanId?: string
  buttonLabel?: string
}

/**
 * AI Code Review widget — drop into the scanner results page to get a deep
 * staff-engineer-level review on top of the local static analyzer findings.
 */
export function AiCodeReviewWidget({ code, language = 'javascript', scanId, buttonLabel = 'AI Code Review' }: Props) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ReviewResult | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function run() {
    setBusy(true)
    setErr(null)
    setResult(null)
    try {
      const res = await fetch('/api/ai/code-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, language, scan_id: scanId }),
      })
      const j = (await res.json()) as ReviewResult & { error?: string }
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      setResult(j)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-lg border border-border/60 bg-card/40 p-4 space-y-3" data-testid="ai-code-review-widget">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> AI Code Review
          </div>
          <p className="text-xs text-muted-foreground">
            Claude Sonnet 4.5 — staff-level code review with severity-ranked concerns.
          </p>
        </div>
        <Button onClick={run} disabled={busy || !code} data-testid="ai-review-run">
          {busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
          {result ? 'Re-review' : buttonLabel}
        </Button>
      </div>

      {err && (
        <div className="rounded border border-destructive/40 bg-destructive/10 text-destructive p-2 text-xs">
          {err}
        </div>
      )}

      {result && (
        <div className="space-y-3">
          {typeof result.overall_rating === 'number' && (
            <div className="flex items-center gap-2 text-xs">
              <span className="uppercase tracking-wide text-muted-foreground">Overall</span>
              <div className="flex-1 h-1.5 rounded bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary"
                  style={{ width: `${(result.overall_rating / 10) * 100}%` }}
                />
              </div>
              <span className="font-mono font-semibold" data-testid="ai-review-rating">
                {result.overall_rating}/10
              </span>
            </div>
          )}

          {result.summary && (
            <p className="text-sm text-foreground/90 flex gap-2">
              <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <span>{result.summary}</span>
            </p>
          )}

          {result.strengths && result.strengths.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-wide text-emerald-400 mb-1">
                Strengths
              </div>
              <ul className="space-y-1 text-xs">
                {result.strengths.map((s, i) => (
                  <li key={i} className="flex gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 mt-0.5" />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.concerns && result.concerns.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-wide text-amber-400 mb-1">
                Concerns ({result.concerns.length})
              </div>
              <div className="space-y-1.5">
                {result.concerns.map((c, i) => (
                  <div
                    key={i}
                    className={cn(
                      'rounded border p-2 text-xs',
                      c.severity === 'critical' && 'border-destructive/40 bg-destructive/5',
                      c.severity === 'major' && 'border-amber-400/40 bg-amber-400/5',
                      c.severity === 'minor' && 'border-border/60 bg-muted/30',
                    )}
                    data-testid={`ai-review-concern-${i}`}
                  >
                    <div className="flex items-center gap-1.5">
                      {c.severity === 'critical' ? (
                        <ShieldAlert className="h-3.5 w-3.5 text-destructive" />
                      ) : (
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                      )}
                      <span className="font-semibold">{c.title}</span>
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {c.severity}
                      </span>
                      {c.line ? (
                        <span className="ml-auto text-[10px] text-muted-foreground">
                          line {c.line}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-muted-foreground">{c.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.suggestions && result.suggestions.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-wide text-primary mb-1">
                Suggestions
              </div>
              <ul className="space-y-1 text-xs list-disc pl-4">
                {result.suggestions.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
