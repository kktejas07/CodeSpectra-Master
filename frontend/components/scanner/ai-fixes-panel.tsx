'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  applySuggestedFix,
  applySuggestedFixBatch,
  generateAIFixes,
  unapplySuggestedFix,
} from '@/lib/github-service'

const SCAN_ROW_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export interface AIFixesAnalysisShape {
  id: string
  issues: Array<{
    type: 'bug' | 'vulnerability' | 'code_smell' | 'security_hotspot' | 'duplicate'
    severity: 'critical' | 'major' | 'minor' | 'info'
    rule: string
    message: string
    line?: number
    effortMinutes?: number
  }>
  language?: string
}

interface AIFixesPanelProps {
  sourceCode: string
  analysis: AIFixesAnalysisShape | null
  languageFallback: string
}

export function AIFixesPanel({ sourceCode, analysis, languageFallback }: AIFixesPanelProps) {
  const [aiFixBusy, setAiFixBusy] = useState(false)
  const [batchBusy, setBatchBusy] = useState(false)
  const [aiFixError, setAiFixError] = useState<string | null>(null)
  const [aiGeneratedFixes, setAiGeneratedFixes] = useState<Array<Record<string, unknown>> | null>(null)
  const [aiFixDegraded, setAiFixDegraded] = useState(false)
  const [appliedDbFixIds, setAppliedDbFixIds] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    setAiGeneratedFixes(null)
    setAiFixError(null)
    setAiFixDegraded(false)
    setAppliedDbFixIds(new Set())
  }, [analysis?.id])

  const handleGenerateAIFixes = useCallback(async () => {
    if (!analysis || analysis.issues.length === 0 || !sourceCode.trim()) return
    setAiFixBusy(true)
    setAiFixError(null)
    try {
      const res = await generateAIFixes({
        code: sourceCode,
        language: analysis.language ?? languageFallback,
        issues: analysis.issues,
        ...(SCAN_ROW_UUID.test(analysis.id) ? { scan_id: analysis.id } : {}),
      })
      if (!res.success) {
        const msg =
          typeof res.error === 'string'
            ? res.error
            : typeof res.retry_after === 'number'
              ? `Rate limited — retry in ${res.retry_after}s`
              : 'Could not generate fixes'
        setAiFixError(msg)
        setAiGeneratedFixes(null)
        return
      }
      const fixes = res.fixes
      setAiGeneratedFixes(Array.isArray(fixes) ? (fixes as Array<Record<string, unknown>>) : null)
      setAiFixDegraded(Boolean(res.degraded))
    } catch (e) {
      setAiFixError(e instanceof Error ? e.message : 'Could not generate fixes')
      setAiGeneratedFixes(null)
    } finally {
      setAiFixBusy(false)
    }
  }, [analysis, sourceCode, languageFallback])

  const handleApplyDbFix = useCallback(async (fixId: string) => {
    setAiFixError(null)
    try {
      const res = await applySuggestedFix(fixId)
      if (!res?.success) {
        setAiFixError(typeof res?.error === 'string' ? res.error : 'Could not apply fix')
        return
      }
      setAppliedDbFixIds((prev) => new Set(prev).add(fixId))
    } catch (e) {
      setAiFixError(e instanceof Error ? e.message : 'Could not apply fix')
    }
  }, [])

  const handleRestoreOnGitHub = useCallback(async (fixId: string) => {
    if (!window.confirm('Overwrite this file on GitHub with the original code from this fix?')) return
    setAiFixError(null)
    try {
      const res = await fetch('/api/github/restore-file', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fix_id: fixId }),
      })
      const json = (await res.json()) as { success?: boolean; error?: string; commit_sha?: string }
      if (!res.ok || !json.success) {
        setAiFixError(typeof json.error === 'string' ? json.error : 'Restore failed')
        return
      }
    } catch (e) {
      setAiFixError(e instanceof Error ? e.message : 'Restore failed')
    }
  }, [])

  const handleUnapplyDbFix = useCallback(async (fixId: string) => {
    setAiFixError(null)
    try {
      const res = await unapplySuggestedFix(fixId)
      if (!res?.success) {
        setAiFixError(typeof res?.error === 'string' ? res.error : 'Could not undo apply')
        return
      }
      setAppliedDbFixIds((prev) => {
        const next = new Set(prev)
        next.delete(fixId)
        return next
      })
    } catch (e) {
      setAiFixError(e instanceof Error ? e.message : 'Could not undo apply')
    }
  }, [])

  const handleApplyAll = useCallback(async () => {
    if (!aiGeneratedFixes?.length) return
    const ids = aiGeneratedFixes
      .map((f) => (typeof f.db_fix_id === 'string' ? f.db_fix_id : ''))
      .filter(Boolean)
    if (ids.length === 0) return
    setBatchBusy(true)
    setAiFixError(null)
    try {
      const res = await applySuggestedFixBatch(ids)
      if (!res.success) {
        setAiFixError(typeof res.error === 'string' ? res.error : 'Batch apply failed')
        return
      }
      const applied = Array.isArray(res.applied_ids) ? (res.applied_ids as string[]) : ids
      setAppliedDbFixIds((prev) => {
        const next = new Set(prev)
        applied.forEach((id) => next.add(id))
        return next
      })
    } catch (e) {
      setAiFixError(e instanceof Error ? e.message : 'Batch apply failed')
    } finally {
      setBatchBusy(false)
    }
  }, [aiGeneratedFixes])

  if (!analysis || analysis.issues.length === 0) return null

  const pendingDbIds =
    aiGeneratedFixes?.map((f) => (typeof f.db_fix_id === 'string' ? f.db_fix_id : '')).filter(Boolean) ?? []
  const hasUnapplied = pendingDbIds.some((id) => !appliedDbFixIds.has(id))

  return (
    <div className="mt-4 flex flex-col gap-2">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="w-fit"
        disabled={aiFixBusy || !sourceCode.trim()}
        onClick={() => void handleGenerateAIFixes()}
      >
        {aiFixBusy ? (
          <>
            <Loader className="mr-2 h-4 w-4 animate-spin" />
            Generating…
          </>
        ) : (
          <>
            <Sparkles className="mr-2 h-4 w-4" />
            Generate AI fixes
          </>
        )}
      </Button>
      {SCAN_ROW_UUID.test(analysis.id) ? (
        <p className="text-xs text-foreground/50">
          Fixes are saved to this scan so you can mark them applied from the dashboard.
        </p>
      ) : (
        <p className="text-xs text-foreground/50">
          Sign in and run a saved scan to persist fixes; otherwise suggestions stay in the browser only.
        </p>
      )}
      {aiFixError && <p className="text-xs text-destructive">{aiFixError}</p>}
      {aiFixDegraded && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          AI was unavailable — sample suggestions. Set <code className="rounded bg-muted px-1">OPENAI_API_KEY</code>{' '}
          for live fixes.
        </p>
      )}
      {aiGeneratedFixes && aiGeneratedFixes.length > 0 && (
        <Card className="mt-2 border border-border bg-card/40 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-foreground">AI-generated patches</h4>
            {pendingDbIds.length > 1 && hasUnapplied ? (
              <Button type="button" size="sm" variant="outline" disabled={batchBusy} onClick={() => void handleApplyAll()}>
                {batchBusy ? (
                  <>
                    <Loader className="mr-2 h-3 w-3 animate-spin" />
                    Applying…
                  </>
                ) : (
                  'Mark all applied'
                )}
              </Button>
            ) : null}
          </div>
          <ul className="space-y-4">
            {aiGeneratedFixes.map((fix, idx) => {
              const dbFixId = typeof fix.db_fix_id === 'string' ? fix.db_fix_id : ''
              const applied = dbFixId && appliedDbFixIds.has(dbFixId)
              return (
                <li key={idx} className="space-y-2 rounded-md border border-border/80 bg-background/40 p-3 text-sm">
                  <p className="text-foreground/80">{String(fix.fix_explanation ?? '')}</p>
                  <div className="grid gap-2 md:grid-cols-2">
                    <pre className="max-h-40 overflow-auto rounded bg-muted/50 p-2 font-mono text-xs">
                      {String(fix.original_code ?? '')}
                    </pre>
                    <pre className="max-h-40 overflow-auto rounded bg-primary/10 p-2 font-mono text-xs">
                      {String(fix.suggested_code ?? '')}
                    </pre>
                  </div>
                  {dbFixId && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={applied}
                        onClick={() => void handleApplyDbFix(dbFixId)}
                      >
                        {applied ? 'Marked applied' : 'Mark applied in DB'}
                      </Button>
                      {applied ? (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => void handleUnapplyDbFix(dbFixId)}
                          >
                            Undo apply
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => void handleRestoreOnGitHub(dbFixId)}
                          >
                            Restore on GitHub
                          </Button>
                        </>
                      ) : null}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </Card>
      )}
    </div>
  )
}
