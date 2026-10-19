'use client'

/**
 * Test run + run history for one workflow: run against a sample payload
 * (test runs preview every step without sending anything), browse runs,
 * see each step's log, re-run from the failed step, cancel a waiting run.
 */
import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Clock, FlaskConical, Loader2, Play, RotateCcw, XCircle, Ban } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { csrfFetch } from '@/lib/csrf-fetch'
import { eventTypeDef } from '@/lib/automation/event-types'
import { selectClass } from './fields'

export interface RunStepLog {
  key?: string
  node_id: string
  label: string
  type?: string
  ok: boolean
  output?: unknown
  error?: string
  duration_ms: number
  attempt?: number
  at?: string
  dry_run?: boolean
}

export interface RunDoc {
  id: string
  status: 'success' | 'failed' | 'partial' | 'running' | 'waiting' | 'cancelled'
  trigger_kind?: string
  dry_run?: boolean
  started_at: string
  finished_at?: string
  resume_at?: string | null
  error?: string | null
  failed_step_key?: string | null
  stopped?: boolean
  duration_ms: number
  steps: RunStepLog[]
}

const STATUS_LABEL: Record<RunDoc['status'], string> = { success: 'Succeeded', failed: 'Failed', partial: 'Partly failed', running: 'Running', waiting: 'Waiting', cancelled: 'Cancelled' }

export function RunStatusBadge({ status }: { status: RunDoc['status'] }) {
  const variant = status === 'success' ? 'default' : status === 'failed' ? 'destructive' : 'secondary'
  return <Badge variant={variant}>{STATUS_LABEL[status] || status}</Badge>
}

function preview(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = typeof v === 'string' ? v : JSON.stringify(v, null, 2)
  return s.length > 800 ? s.slice(0, 800) + '…' : s
}

export function RunDetail({ run, onRetry, onCancel, busy }: { run: RunDoc; onRetry?: () => void; onCancel?: () => void; busy?: boolean }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <RunStatusBadge status={run.status} />
        {run.dry_run && <Badge variant="outline">Test run</Badge>}
        {run.stopped && <Badge variant="outline">Stopped by a filter</Badge>}
        <span className="text-xs text-muted-foreground tabular-nums">{new Date(run.started_at).toLocaleString()}</span>
        {run.status === 'waiting' && run.resume_at && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Clock className="h-3.5 w-3.5" aria-hidden /> continues {new Date(run.resume_at).toLocaleString()}</span>
        )}
        <div className="ml-auto flex gap-2">
          {onRetry && (run.status === 'failed' || run.status === 'partial') && !run.dry_run && (
            <Button size="sm" variant="outline" onClick={onRetry} disabled={busy}><RotateCcw className="h-3.5 w-3.5" aria-hidden /> Re-run from failed step</Button>
          )}
          {onCancel && (run.status === 'waiting' || run.status === 'running') && (
            <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}><Ban className="h-3.5 w-3.5" aria-hidden /> Cancel</Button>
          )}
        </div>
      </div>
      {run.error && <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">{run.error}</p>}
      <ol className="space-y-2">
        {(run.steps || []).map((s, i) => (
          <li key={`${s.key || s.node_id}-${i}`} className="rounded-xl border border-border/70 bg-muted/20 p-2.5 text-xs">
            <div className="flex items-center gap-2">
              {s.ok ? <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" aria-label="OK" /> : <XCircle className="h-4 w-4 text-destructive" aria-label="Failed" />}
              <span className="font-medium text-foreground">{s.label}</span>
              {(s.attempt || 1) > 1 && <Badge variant="outline">try {s.attempt}</Badge>}
              <span className="ml-auto tabular-nums text-muted-foreground">{s.duration_ms} ms</span>
            </div>
            {s.error && <p className="mt-1 text-destructive">{s.error}</p>}
            {s.output !== undefined && s.output !== null && (
              <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] text-muted-foreground">{preview(s.output)}</pre>
            )}
          </li>
        ))}
        {!run.steps?.length && <li className="text-xs text-muted-foreground">No steps ran.</li>}
      </ol>
    </div>
  )
}

export function RunPanel({ workflowId, isActive, trigger, eventType, samplePayload, onSamplePayload }: {
  workflowId: string
  isActive: boolean
  trigger: string
  eventType?: string | null
  samplePayload: Record<string, unknown> | null | undefined
  onSamplePayload: (p: Record<string, unknown>) => void
}) {
  const [text, setText] = useState(() => JSON.stringify(samplePayload || eventTypeDef(eventType || '')?.sample || {}, null, 2))
  const [parseErr, setParseErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [last, setLast] = useState<RunDoc | null>(null)
  const [runs, setRuns] = useState<RunDoc[]>([])
  const [filter, setFilter] = useState('')
  const [selected, setSelected] = useState<RunDoc | null>(null)

  useEffect(() => {
    setText(JSON.stringify(samplePayload || eventTypeDef(eventType || '')?.sample || {}, null, 2))
  }, [workflowId, eventType]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadRuns = useCallback(async () => {
    const q = new URLSearchParams({ limit: '30', ...(filter ? { status: filter } : {}) })
    const res = await fetch(`/api/workflows/${workflowId}/runs?${q}`, { cache: 'no-store' })
    const json = await res.json().catch(() => ({}))
    if (res.ok) setRuns(json.items || [])
  }, [workflowId, filter])

  useEffect(() => {
    void loadRuns()
  }, [loadRuns])

  const payload = (): Record<string, unknown> | null => {
    try {
      const p = JSON.parse(text || '{}')
      if (!p || typeof p !== 'object' || Array.isArray(p)) throw new Error()
      setParseErr(null)
      return p
    } catch {
      setParseErr('The sample payload must be a JSON object.')
      return null
    }
  }

  async function start(dry: boolean) {
    const p = payload()
    if (!p) return
    setBusy(true)
    setError(null)
    try {
      const res = await csrfFetch(`/api/workflows/${workflowId}/run`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dry_run: dry, payload: p }) })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Run failed')
      setLast(json as RunDoc)
      await loadRuns()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function act(run: RunDoc, action: 'retry' | 'cancel') {
    setBusy(true)
    setError(null)
    try {
      const res = await csrfFetch(`/api/workflows/${workflowId}/runs/${run.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed')
      if (action === 'retry') setSelected(json as RunDoc)
      await loadRuns()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function useRecentEvent() {
    if (!eventType) return
    const res = await fetch(`/api/workflows/events?type=${encodeURIComponent(eventType)}`, { cache: 'no-store' })
    const json = await res.json().catch(() => ({}))
    const p = json.items?.[0]?.payload
    if (p) setText(JSON.stringify(p, null, 2))
    else setError('No recent events of this type yet — using the example.')
  }

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">Sample trigger data</h3>
          <div className="flex flex-wrap gap-2">
            {trigger === 'event' && eventType && <Button size="sm" variant="ghost" onClick={useRecentEvent}>Use the latest real event</Button>}
            <Button size="sm" variant="ghost" onClick={() => { const p = payload(); if (p) onSamplePayload(p) }}>Save as sample</Button>
          </div>
        </div>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} className="font-mono text-xs" aria-label="Sample trigger payload (JSON)" />
        {parseErr && <p className="text-xs text-destructive" role="alert">{parseErr}</p>}
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => start(true)} disabled={busy} variant="outline">
            {busy ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <FlaskConical className="h-4 w-4" aria-hidden />} Test run (sends nothing)
          </Button>
          <Button onClick={() => start(false)} disabled={busy || !isActive} title={isActive ? undefined : 'Switch the workflow on to run it for real'}>
            <Play className="h-4 w-4" aria-hidden /> Run now
          </Button>
        </div>
        {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
      </section>

      {last && (
        <section className="space-y-2 border-t border-border pt-4">
          <h3 className="text-sm font-semibold text-foreground">This run</h3>
          <RunDetail run={last} onRetry={() => act(last, 'retry')} onCancel={() => act(last, 'cancel')} busy={busy} />
        </section>
      )}

      <section className="space-y-2 border-t border-border pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">Run history</h3>
          <select aria-label="Filter runs" className={`${selectClass} w-auto`} value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">All runs</option>
            <option value="failed">Failed</option>
            <option value="waiting">Waiting</option>
            <option value="success">Succeeded</option>
            <option value="partial">Partly failed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        {!runs.length && <p className="text-xs text-muted-foreground">No runs yet. Start a test run above.</p>}
        <ul className="divide-y divide-border/60 rounded-2xl border border-border/70">
          {runs.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => setSelected(selected?.id === r.id ? null : r)} aria-expanded={selected?.id === r.id} className="flex w-full flex-wrap items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary">
                <RunStatusBadge status={r.status} />
                {r.dry_run && <Badge variant="outline">Test</Badge>}
                <span className="text-muted-foreground">{r.trigger_kind || 'manual'}</span>
                <span className="ml-auto tabular-nums text-muted-foreground">{new Date(r.started_at).toLocaleString()}</span>
              </button>
              {selected?.id === r.id && (
                <div className="border-t border-border/60 p-3">
                  <RunDetail run={selected} onRetry={() => act(selected, 'retry')} onCancel={() => act(selected, 'cancel')} busy={busy} />
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
