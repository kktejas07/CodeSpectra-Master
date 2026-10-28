'use client'

/**
 * Question drafts queue (Admin → SME review → Question drafts). Lists the
 * bank's drafts written by the question bot, grouped and filterable by
 * domain, with the quality score and the gate's reasons. Approve makes a
 * question usable in tests; reject hides it (kept so it is never rewritten).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useToast } from '@/lib/toast-context'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonList } from '@/components/ui/skeleton-boneyard'

interface Draft {
  id: string
  title: string
  question: string
  type: string
  options?: string[]
  answer?: string
  explanation?: string
  difficulty: string
  domain?: string
  test_cases?: { input: string; output: string }[]
  language?: string
  reference_solution?: { language: string; code: string }
  quality_score?: number
  quality_reasons?: string[]
}

interface DraftPage { items: Draft[]; total: number; page: number; pageSize: number; byDomain: Record<string, number>; labels: Record<string, string> }

const selectCls = 'h-9 rounded-lg border border-input bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
const scoreCls = (n: number) => (n >= 85 ? 'border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400' : n >= 70 ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400')

export function QuestionDraftsReview() {
  const addToast = useToast()
  const [domain, setDomain] = useState('')
  const [type, setType] = useState('')
  const [difficulty, setDifficulty] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<DraftPage | null>(null)
  const [error, setError] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setError(false)
    try {
      const qs = new URLSearchParams({ page: String(page) })
      if (domain) qs.set('domain', domain)
      if (type) qs.set('type', type)
      if (difficulty) qs.set('difficulty', difficulty)
      const r = await fetch(`/api/admin/question-bot/drafts?${qs}`, { credentials: 'include' })
      if (!r.ok) throw new Error()
      setData(await r.json())
      setSelected(new Set())
    } catch {
      setError(true)
    }
  }, [domain, type, difficulty, page])
  useEffect(() => { void load() }, [load])

  const act = async (action: 'approve' | 'reject', ids: string[]) => {
    if (!ids.length) return
    setBusy(true)
    try {
      const r = await csrfFetch('/api/admin/question-bot/drafts', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ids }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error((d as { error?: string }).error || 'Request failed')
      const n = (d as { updated?: number }).updated ?? 0
      addToast({ type: 'success', title: `${action === 'approve' ? 'Approved' : 'Rejected'} ${n} question${n === 1 ? '' : 's'}` })
      await load()
    } catch (e) {
      addToast({ type: 'error', title: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  const label = (id?: string) => (id ? data?.labels?.[id] || id : 'No domain')
  // "All domains": group the page by domain.
  const groups = useMemo(() => {
    const m = new Map<string, Draft[]>()
    for (const d of data?.items ?? []) {
      const k = d.domain || 'none'
      m.set(k, [...(m.get(k) ?? []), d])
    }
    return [...m.entries()]
  }, [data])
  const domainChips = Object.entries(data?.byDomain ?? {}).sort((a, b) => b[1] - a[1])
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1
  const toggle = (id: string, on: boolean) => setSelected((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by domain">
        {[['', data ? Object.values(data.byDomain).reduce((a, b) => a + b, 0) : 0] as const, ...domainChips].map(([id, n]) => (
          <button
            key={id || 'all'}
            type="button"
            onClick={() => { setDomain(id); setPage(1) }}
            aria-pressed={domain === id}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${domain === id ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground hover:border-primary/40'}`}
          >
            {id ? label(id) : 'All domains'}<span className="tabular-nums opacity-80">{n}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="draft-type">Type</label>
        <select id="draft-type" className={selectCls} value={type} onChange={(e) => { setType(e.target.value); setPage(1) }}>
          <option value="">All types</option><option value="mcq">Multiple choice</option><option value="coding">Coding</option>
        </select>
        <label className="sr-only" htmlFor="draft-level">Difficulty</label>
        <select id="draft-level" className={selectCls} value={difficulty} onChange={(e) => { setDifficulty(e.target.value); setPage(1) }}>
          <option value="">All levels</option><option>Easy</option><option>Medium</option><option>Hard</option>
        </select>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={busy || !selected.size} onClick={() => void act('reject', [...selected])}><X className="h-4 w-4" aria-hidden />Reject {selected.size || ''}</Button>
          <Button size="sm" disabled={busy || !selected.size} onClick={() => void act('approve', [...selected])}>{busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}Approve {selected.size || ''}</Button>
        </div>
      </div>

      {error ? (
        <EmptyState illustration="error" title="Couldn't load the drafts" description="Check your connection and try again." actionLabel="Try again" onAction={() => void load()} />
      ) : !data ? (
        <SkeletonList />
      ) : data.items.length === 0 ? (
        <EmptyState illustration="assessment" title="No drafts waiting" description="Drafts from the question bot appear here. Run it from Admin → Question bot." actionLabel="Open the question bot" actionHref="/dashboard/admin/question-bot" />
      ) : (
        <>
          {groups.map(([dom, items]) => (
            <section key={dom} className="space-y-3" aria-label={label(dom === 'none' ? undefined : dom)}>
              {!domain ? <h3 className="text-sm font-semibold text-foreground">{label(dom === 'none' ? undefined : dom)} <span className="font-normal text-muted-foreground tabular-nums">· {items.length}</span></h3> : null}
              <ul className="space-y-3">
                {items.map((q) => (
                  <li key={q.id} className="rounded-2xl border border-border/70 bg-card p-4">
                    <div className="flex items-start gap-3">
                      <Checkbox checked={selected.has(q.id)} onCheckedChange={(v) => toggle(q.id, v === true)} aria-label={`Select ${q.title}`} className="mt-1" />
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <Badge variant="outline">{q.type === 'mcq' ? 'MCQ' : q.type}</Badge>
                          <Badge variant="outline">{q.difficulty}</Badge>
                          {typeof q.quality_score === 'number' ? <Badge variant="outline" className={scoreCls(q.quality_score)}>Quality <span className="tabular-nums">{q.quality_score}</span></Badge> : null}
                        </div>
                        <p className="font-medium text-foreground">{q.title}</p>
                        <p className="whitespace-pre-wrap break-words text-sm text-foreground">{q.question}</p>
                        {q.options?.length ? (
                          <ol className="space-y-1 text-sm">
                            {q.options.map((o, i) => {
                              const right = (o || '').trim().toLowerCase() === (q.answer || '').trim().toLowerCase()
                              return (
                                <li key={i} className={`rounded-lg border px-3 py-1.5 ${right ? 'border-green-500/40 bg-green-500/10 text-green-800 dark:text-green-300' : 'border-border text-foreground'}`}>
                                  <span className="tabular-nums text-muted-foreground">{String.fromCharCode(65 + i)}.</span> {o}{right ? <span className="sr-only"> (correct)</span> : null}
                                </li>
                              )
                            })}
                          </ol>
                        ) : null}
                        {q.explanation ? <p className="text-sm text-muted-foreground"><span className="font-medium text-foreground">Why: </span>{q.explanation}</p> : null}
                        {q.test_cases?.length ? (
                          <details className="text-sm">
                            <summary className="cursor-pointer text-primary">Test cases ({q.test_cases.length}) and reference solution</summary>
                            <ul className="mt-2 space-y-1">
                              {q.test_cases.map((t, i) => <li key={i} className="font-mono text-xs text-muted-foreground">in: {t.input || '∅'} → out: {t.output}</li>)}
                            </ul>
                            {q.reference_solution?.code ? <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-muted p-3 text-xs text-foreground">{q.reference_solution.code}</pre> : null}
                          </details>
                        ) : null}
                        {q.quality_reasons?.length ? <p className="text-xs text-muted-foreground">Checks: {q.quality_reasons.join(' · ')}</p> : null}
                      </div>
                      <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => void act('reject', [q.id])} aria-label={`Reject ${q.title}`}><X className="h-4 w-4" aria-hidden /><span className="hidden sm:inline">Reject</span></Button>
                        <Button size="sm" disabled={busy} onClick={() => void act('approve', [q.id])} aria-label={`Approve ${q.title}`}><Check className="h-4 w-4" aria-hidden /><span className="hidden sm:inline">Approve</span></Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {pages > 1 ? (
            <nav className="flex items-center justify-between gap-2" aria-label="Pages">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-4 w-4" aria-hidden />Previous</Button>
              <span className="text-sm tabular-nums text-muted-foreground">Page {page} of {pages}</span>
              <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next<ChevronRight className="h-4 w-4" aria-hidden /></Button>
            </nav>
          ) : null}
        </>
      )}
    </div>
  )
}
