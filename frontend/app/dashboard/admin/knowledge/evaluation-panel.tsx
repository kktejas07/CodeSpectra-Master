'use client'

/**
 * Knowledge page → "Search quality" (superadmin): run the golden-question
 * evaluation against the live index (POST /api/admin/knowledge/eval), show the
 * latest scores in plain words, the trend across runs, per-type results, the
 * questions that missed, the access check, and index health.
 */
import { useCallback, useEffect, useState } from 'react'
import { Gauge, Loader2, PlayCircle, ShieldCheck, ShieldAlert, Target, ListOrdered, HeartPulse } from 'lucide-react'
import { Panel, Section, StatCard } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useToast } from '@/lib/toast-context'
import { SOURCE_TYPE_LABELS, type KnowledgeSourceType } from '@/lib/rag/types'
import { cn } from '@/lib/utils'

type K = '1' | '3' | '5' | '10'

interface RunSummary {
  id: string
  at: string
  questions_run: number
  duration_ms: number
  success_at_3: number
  success_at_5: number
  mrr: number
  ndcg10: number
  acl_leaks: number
}

interface Run {
  id: string
  at: string
  duration_ms: number
  embedding: { available: string[]; corpus_model: string | null }
  questions_total: number
  questions_run: number
  skipped: { id: string; reason: string }[]
  metrics: {
    positives: number
    success: Record<K, number>
    recall: Record<K, number>
    mrr: number
    ndcg10: number
    by_type: { type: string; questions: number; success_at_5: number; recall_at_5: number; mrr: number }[]
    latency_ms: { p50: number; p95: number }
    acl_leaks: number
  }
  summary: string[]
  failed: { id: string; query: string; expect: string[]; returned: { key: string; type: string; title: string }[] }[]
  acl: { golden_leaks: number; probe_tenants: number; probe_queries: number; probe_leaks: number; leaked_sources: string[] }
}

interface Health {
  sources: number
  by_status: Record<string, number>
  failed: { id: string; type: string; title: string; error: string | null; updated_at: string | null }[]
  stale: { count: number; sample: { id: string; type: string; title: string; indexed_at: string | null }[] }
  stuck_indexing: number
  embedding_models: { model: string | null; chunks: number; avg_tokens: number }[]
  chunks: number
  chunks_without_embeddings: number
  sources_keyword_only: number
}

const pct = (x: number) => `${Math.round(x * 100)}%`
const typeLabel = (t: string) => SOURCE_TYPE_LABELS[t as KnowledgeSourceType] ?? t
const when = (iso: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

/** Oldest → newest line of a 0..1 metric. Decorative; the table below carries the numbers. */
function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null
  const w = 240, h = 48, pad = 4
  const pts = values.map((v, i) => `${pad + (i * (w - 2 * pad)) / (values.length - 1)},${h - pad - v * (h - 2 * pad)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-12 w-full max-w-[240px] text-primary" aria-hidden>
      <line x1={pad} x2={w - pad} y1={h - pad} y2={h - pad} className="stroke-border" strokeWidth={1} />
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

export function EvaluationPanel() {
  const addToast = useToast()
  const [runs, setRuns] = useState<RunSummary[]>([])
  const [latest, setLatest] = useState<Run | null>(null)
  const [health, setHealth] = useState<Health | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/knowledge/eval', { credentials: 'include' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || `Couldn't load the evaluation (${r.status})`)
      setRuns(d.runs || [])
      setLatest(d.latest || null)
      setHealth(d.health || null)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load the evaluation")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const run = async () => {
    setRunning(true)
    try {
      const r = await csrfFetch('/api/admin/knowledge/eval', { method: 'POST' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Evaluation failed')
      addToast({ type: 'success', title: 'Evaluation finished', message: d.run?.summary?.[0] })
      await load()
    } catch (e) {
      addToast({ type: 'error', title: e instanceof Error ? e.message : 'Evaluation failed' })
    } finally {
      setRunning(false)
    }
  }

  const m = latest?.metrics
  const n = m?.positives ?? 0
  const leaks = latest ? latest.acl.golden_leaks + latest.acl.probe_leaks : 0
  const trend = [...runs].reverse()

  return (
    <div className="space-y-8">
      <Section
        title="Search quality"
        description="Runs a fixed set of real admin questions against the live index and checks that each one finds the right source, and that no organisation can see another's data."
        actions={
          <Button onClick={run} disabled={running} className="min-h-11 sm:min-h-9">
            {running ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : <PlayCircle aria-hidden />}
            {running ? 'Running… about a minute' : 'Run evaluation'}
          </Button>
        }
      >
        {error && <p className="text-sm text-red-700 dark:text-red-400" role="alert">{error}</p>}
        {loading && !latest && <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground motion-reduce:animate-none" aria-label="Loading" />}

        {!loading && !latest && !error && (
          <EmptyState
            illustration="analytics"
            title="No evaluation yet"
            description="Run one to see how often the copilot finds the right help page, problem or document. Reindex first so the content is there to find."
            actionLabel={running ? undefined : 'Run evaluation'}
            onAction={running ? undefined : run}
          />
        )}

        {latest && m && (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Right source in top 3" value={n ? `${Math.round(m.success['3'] * n)} of ${n}` : '—'} hint={n ? `${pct(m.success['3'])} of questions` : undefined} icon={<Target />} />
              <StatCard label="Right source first" value={n ? pct(m.success['1']) : '—'} hint={`Top 10: ${pct(m.success['10'])}`} icon={<ListOrdered />} />
              <StatCard label="Ranking score (MRR)" value={m.mrr.toFixed(2)} hint={m.mrr > 0 ? `First right answer at position ${(1 / m.mrr).toFixed(1)} on average` : 'Nothing found'} icon={<Gauge />} />
              <StatCard
                label="Access check"
                value={leaks === 0 ? 'Passed' : `${leaks} leak${leaks === 1 ? '' : 's'}`}
                hint={`${latest.questions_run + latest.acl.probe_queries} searches checked`}
                icon={leaks === 0 ? <ShieldCheck /> : <ShieldAlert />}
                className={leaks ? 'border-red-600/40' : undefined}
              />
            </div>

            <Panel className="space-y-3">
              <p className="text-sm font-medium text-foreground">In plain words</p>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {latest.summary.map((s) => <li key={s}>{s}</li>)}
              </ul>
              <p className="text-xs text-muted-foreground">
                Last run {when(latest.at)} · {latest.questions_run} of {latest.questions_total} questions ran
                {latest.skipped.length ? ` (${latest.skipped.length} skipped: their sources aren't indexed here, or they use test-only data)` : ''}
                {' · '}search time p50 {Math.round(m.latency_ms.p50)} ms, p95 {Math.round(m.latency_ms.p95)} ms
                {' · '}{latest.embedding.available.length ? `semantic search on (${latest.embedding.corpus_model ?? latest.embedding.available[0]})` : 'keyword search only — no embedding key'}
              </p>
            </Panel>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Panel className="space-y-3">
                <p className="text-sm font-medium text-foreground">Trend</p>
                <Sparkline values={trend.map((r) => r.success_at_3)} />
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[880px]">
                    <caption className="sr-only">Evaluation runs, newest first</caption>
                    <thead className="text-left text-xs text-muted-foreground">
                      <tr>
                        <th scope="col" className="py-2 pr-3 font-medium">Run</th>
                        <th scope="col" className="py-2 pr-3 text-right font-medium">Top 3</th>
                        <th scope="col" className="py-2 pr-3 text-right font-medium">Top 5</th>
                        <th scope="col" className="py-2 pr-3 text-right font-medium">MRR</th>
                        <th scope="col" className="py-2 text-right font-medium">Leaks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border tabular-nums">
                      {runs.slice(0, 10).map((r) => (
                        <tr key={r.id}>
                          <td className="whitespace-nowrap py-2 pr-3 text-muted-foreground">{when(r.at)}</td>
                          <td className="py-2 pr-3 text-right">{pct(r.success_at_3)}</td>
                          <td className="py-2 pr-3 text-right">{pct(r.success_at_5)}</td>
                          <td className="py-2 pr-3 text-right">{r.mrr.toFixed(2)}</td>
                          <td className={cn('py-2 text-right', r.acl_leaks ? 'font-semibold text-red-700 dark:text-red-400' : 'text-muted-foreground')}>{r.acl_leaks}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>

              <Panel className="space-y-3">
                <p className="text-sm font-medium text-foreground">By kind of content</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <caption className="sr-only">Results by source type</caption>
                    <thead className="text-left text-xs text-muted-foreground">
                      <tr>
                        <th scope="col" className="py-2 pr-3 font-medium">Type</th>
                        <th scope="col" className="py-2 pr-3 text-right font-medium">Questions</th>
                        <th scope="col" className="py-2 pr-3 text-right font-medium">Found in top 5</th>
                        <th scope="col" className="py-2 text-right font-medium">MRR</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border tabular-nums">
                      {m.by_type.map((t) => (
                        <tr key={t.type}>
                          <td className="py-2 pr-3">{typeLabel(t.type)}</td>
                          <td className="py-2 pr-3 text-right text-muted-foreground">{t.questions}</td>
                          <td className="py-2 pr-3 text-right">{Math.round(t.success_at_5 * t.questions)} of {t.questions}</td>
                          <td className="py-2 text-right">{t.mrr.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted-foreground">
                  Access probes: searched as {latest.acl.probe_tenants} organisation{latest.acl.probe_tenants === 1 ? '' : 's'} for other organisations&apos; and staff-only sources
                  ({latest.acl.probe_queries} searches) — {latest.acl.probe_leaks === 0 ? 'nothing came back that shouldn’t.' : `${latest.acl.probe_leaks} result(s) leaked: ${latest.acl.leaked_sources.join(', ')}`}
                </p>
              </Panel>
            </div>

            <Panel className="space-y-3">
              <p className="text-sm font-medium text-foreground">Questions that missed the top 5 ({latest.failed.length})</p>
              {latest.failed.length === 0 ? (
                <p className="text-sm text-muted-foreground">Every question found its source in the top 5.</p>
              ) : (
                <ul className="space-y-3">
                  {latest.failed.map((f) => (
                    <li key={f.id} className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                      <p className="font-medium text-foreground">“{f.query}”</p>
                      <p className="mt-1 text-xs text-muted-foreground">Expected: <span className="font-mono">{f.expect.join(', ')}</span></p>
                      {f.returned.length ? (
                        <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-sm text-muted-foreground">
                          {f.returned.map((h, i) => <li key={`${h.key}-${i}`}>{h.title} <span className="text-xs">({typeLabel(h.type)})</span></li>)}
                        </ol>
                      ) : (
                        <p className="mt-2 text-sm text-muted-foreground">Nothing came back.</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </>
        )}
      </Section>

      {health && (
        <Section title="Index health" description="Is the index complete and fresh? Problems here lower search quality before ranking even starts.">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Ready" value={(health.by_status.ready ?? 0).toLocaleString()} hint={`of ${health.sources.toLocaleString()} sources`} icon={<HeartPulse />} />
            <StatCard label="Failed" value={(health.by_status.failed ?? 0).toLocaleString()} hint={`${(health.by_status.queued ?? 0) + (health.by_status.indexing ?? 0)} waiting · ${health.stuck_indexing} stuck`} className={health.by_status.failed ? 'border-red-600/40' : undefined} />
            <StatCard label="Stale (over 7 days)" value={health.stale.count.toLocaleString()} hint="Not re-checked by the nightly sweep" className={health.stale.count ? 'border-amber-500/40' : undefined} />
            <StatCard label="Chunks without vectors" value={health.chunks_without_embeddings.toLocaleString()} hint={`of ${health.chunks.toLocaleString()} · keyword search only`} className={health.chunks_without_embeddings ? 'border-amber-500/40' : undefined} />
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel className="space-y-3">
              <p className="text-sm font-medium text-foreground">Embedding models</p>
              {health.embedding_models.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing indexed yet.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {health.embedding_models.map((e) => (
                    <li key={e.model ?? 'none'} className="flex justify-between gap-3">
                      <span className={e.model ? 'font-mono text-foreground' : 'text-muted-foreground'}>{e.model ?? 'No embedding'}</span>
                      <span className="tabular-nums text-muted-foreground">{e.chunks.toLocaleString()} chunks · ~{e.avg_tokens} tokens each</span>
                    </li>
                  ))}
                </ul>
              )}
              {health.embedding_models.filter((e) => e.model).length > 1 && (
                <p className="text-xs text-amber-700 dark:text-amber-400">More than one model is in use. Search only compares vectors of the corpus&apos;s main model, so the rest are keyword-only until reindexed with force.</p>
              )}
            </Panel>
            <Panel className="space-y-3">
              <p className="text-sm font-medium text-foreground">Failed and stale sources</p>
              {health.failed.length === 0 && health.stale.sample.length === 0 ? (
                <p className="text-sm text-muted-foreground">No failed or stale sources.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {health.failed.map((f) => (
                    <li key={f.id}>
                      <span className="font-medium text-foreground">{f.title}</span> <span className="text-xs text-muted-foreground">({typeLabel(f.type)})</span>
                      {f.error && <p className="text-xs text-red-700 dark:text-red-400">{f.error}</p>}
                    </li>
                  ))}
                  {health.stale.sample.map((s) => (
                    <li key={s.id}>
                      <span className="text-foreground">{s.title}</span> <span className="text-xs text-muted-foreground">({typeLabel(s.type)}) · last indexed {when(s.indexed_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </Section>
      )}
    </div>
  )
}
