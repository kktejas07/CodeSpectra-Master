'use client'

/**
 * Side-by-side comparison of 2–4 candidates on one test (staff only; data from
 * GET /api/admin/exams/[id]/compare). Read-only, plus a shortlist action.
 */
import { useEffect, useState } from 'react'
import { Camera, CheckCircle2, Circle, Clock, Loader2, ShieldAlert, Star, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { useToast } from '@/lib/toast-context'
import { OutcomeBadge, saveOutcomes } from '@/components/assessment/HiringOutcome'

interface CompareQuestion { id: string; title: string; type: string; points: number; scored: boolean; coding: boolean; section_id: string | null }
interface CompareCandidate {
  user_id: string
  name: string
  email: string
  released: boolean
  score: number
  max_score: number
  percent: number | null
  has_pending_review: boolean
  attempt_no: number
  submitted_at: string | null
  total_time_ms: number | null
  auto_submitted: boolean
  section_scores: Array<{ id: string; title: string; score: number; max: number; percent: number | null }>
  questions: Record<string, { correct: boolean; awarded: number | null; points: number; pending: boolean; answered: boolean }>
  code: Record<string, { language: string; code: string }>
  integrity: { flags: number; by_type: Record<string, number>; events: number }
  identity: { method: string | null; needs_manual_review: boolean; face_similarity: number | null; face_likely_match: boolean | null }
  outcome: string | null
}
interface CompareData {
  exam: { id: string; title: string; sections: Array<{ id: string; title: string }>; questions: CompareQuestion[] }
  candidates: CompareCandidate[]
  missing: string[]
}

function fmtDuration(ms: number | null): string {
  if (ms === null) return '--'
  const m = Math.round(ms / 60000)
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`
}

const humanize = (t: string) => t.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())

export function CompareCandidates({
  examId, userIds, open, onOpenChange, onChanged,
}: { examId: string; userIds: string[]; open: boolean; onOpenChange: (o: boolean) => void; onChanged?: () => void }) {
  const addToast = useToast()
  const [data, setData] = useState<CompareData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [shortlisting, setShortlisting] = useState<string | null>(null)
  const key = userIds.join(',')

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/exams/${encodeURIComponent(examId)}/compare?users=${encodeURIComponent(key)}`, { credentials: 'include' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Could not load the comparison.')
      setData(j as CompareData)
    } catch (e) {
      setData(null)
      setError(e instanceof Error ? e.message : 'Could not load the comparison.')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { if (open) void load() }, [open, key])

  const shortlist = async (ids: string[], label: string) => {
    setShortlisting(label)
    try {
      const r = await saveOutcomes({ exam_id: examId, user_ids: ids, status: 'shortlisted' })
      addToast({ type: 'success', title: `Shortlisted ${r.updated.length} candidate${r.updated.length === 1 ? '' : 's'}` })
      await load()
      onChanged?.()
    } catch (e) {
      addToast({ type: 'error', title: 'Couldn’t shortlist', message: e instanceof Error ? e.message : undefined })
    } finally {
      setShortlisting(null)
    }
  }

  const cands = data?.candidates ?? []
  const best = cands.reduce<number | null>((m, c) => (c.percent !== null && (m === null || c.percent > m) ? c.percent : m), null)
  const gridCols = { gridTemplateColumns: `minmax(10rem, 1.2fr) repeat(${Math.max(1, cands.length)}, minmax(9rem, 1fr))` }
  const row = (label: React.ReactNode, cell: (c: CompareCandidate) => React.ReactNode, key?: string) => (
    <div key={key} className="grid items-start gap-3 border-b border-border/60 py-2 text-sm" style={gridCols}>
      <div className="text-muted-foreground">{label}</div>
      {cands.map((c) => <div key={c.user_id} className="min-w-0">{cell(c)}</div>)}
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>Compare candidates</DialogTitle>
          <DialogDescription>
            {data ? data.exam.title : 'Side by side on this test.'} Staff view — scores show here before they are released to candidates.
          </DialogDescription>
        </DialogHeader>

        {loading && !data ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading comparison…</div>
        ) : error ? (
          <EmptyState compact illustration="analytics" title="Comparison unavailable" description={error} />
        ) : data && cands.length >= 2 ? (
          <div className="overflow-x-auto">
            <div className="min-w-[40rem]">
              {data.missing.length > 0 && (
                <p className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-300">
                  <span className="tabular-nums">{data.missing.length}</span> selected candidate{data.missing.length === 1 ? ' has' : 's have'} not submitted and are left out.
                </p>
              )}
              {/* Header */}
              <div className="grid gap-3 border-b border-border pb-3" style={gridCols}>
                <div />
                {cands.map((c) => (
                  <div key={c.user_id} className="min-w-0 space-y-1">
                    <p className="truncate font-semibold" title={c.name}>{c.name}</p>
                    <p className="truncate text-xs text-muted-foreground" title={c.email}>{c.email}</p>
                    <div className="flex flex-wrap items-center gap-1">
                      <OutcomeBadge status={c.outcome} />
                      {!c.released && <Badge variant="outline" className="text-[11px]">Not released</Badge>}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-1 h-8 gap-1.5"
                      // Never downgrade a later outcome (interviewed, hired, …) to shortlisted.
                      disabled={!!shortlisting || !!c.outcome}
                      title={c.outcome && c.outcome !== 'shortlisted' ? 'This candidate already has an outcome' : undefined}
                      onClick={() => shortlist([c.user_id], c.user_id)}
                    >
                      {shortlisting === c.user_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Star className="h-3.5 w-3.5" />}
                      {c.outcome ? 'Has an outcome' : 'Shortlist'}
                    </Button>
                  </div>
                ))}
              </div>

              <h4 className="mt-4 text-sm font-semibold">Scores</h4>
              {row('Overall', (c) => (
                <span className={`font-mono font-semibold tabular-nums ${c.percent !== null && c.percent === best ? 'text-primary' : ''}`}>
                  {c.percent !== null ? `${c.percent}%` : '--'} <span className="font-sans text-xs font-normal text-muted-foreground">({c.score}/{c.max_score})</span>
                  {c.has_pending_review && <span className="block font-sans text-[11px] font-normal text-amber-700 dark:text-amber-400">Grading not finished</span>}
                </span>
              ), 'overall')}
              {data.exam.sections.map((s) => row(s.title, (c) => {
                const sc = c.section_scores.find((x) => x.id === s.id)
                return <span className="font-mono tabular-nums">{sc && sc.percent !== null ? `${sc.percent}%` : '--'} {sc ? <span className="font-sans text-xs text-muted-foreground">({sc.score}/{sc.max})</span> : null}</span>
              }, `sec-${s.id}`))}
              {row('Time taken', (c) => (
                <span className="tabular-nums"><Clock className="mr-1 inline h-3.5 w-3.5 text-muted-foreground" aria-hidden />{fmtDuration(c.total_time_ms)}{c.auto_submitted ? <span className="block text-[11px] text-muted-foreground">Submitted when time ran out</span> : null}</span>
              ), 'time')}
              {row('Attempt', (c) => <span className="tabular-nums">{c.attempt_no}</span>, 'attempt')}

              <h4 className="mt-4 text-sm font-semibold">Integrity and identity</h4>
              {row('Integrity flags', (c) => (
                c.integrity.flags === 0
                  ? <span className="flex items-center gap-1 text-xs text-green-700 dark:text-green-400"><CheckCircle2 className="h-3.5 w-3.5" /> Clean</span>
                  : <div className="text-xs">
                      <span className="flex items-center gap-1 font-semibold text-red-700 dark:text-red-400"><ShieldAlert className="h-3.5 w-3.5" /> <span className="tabular-nums">{c.integrity.flags}</span> flags</span>
                      <ul className="mt-1 space-y-0.5 text-muted-foreground">
                        {Object.entries(c.integrity.by_type).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t, n]) => <li key={t}>{humanize(t)}: <span className="tabular-nums">{n}</span></li>)}
                      </ul>
                    </div>
              ), 'flags')}
              {row('Proctoring events', (c) => <span className="text-xs tabular-nums">{c.integrity.events} logged</span>, 'events')}
              {row('Identity review', (c) => (
                <div className="text-xs">
                  {c.identity.needs_manual_review
                    ? <span className="flex items-center gap-1 text-amber-700 dark:text-amber-400"><Camera className="h-3.5 w-3.5" /> No camera — check by hand</span>
                    : <span className="text-muted-foreground">{c.identity.method === 'camera' ? 'Camera check' : c.identity.method ? humanize(c.identity.method) : 'None recorded'}</span>}
                  {c.identity.face_similarity !== null && (
                    <span className={`block ${c.identity.face_likely_match ? 'text-muted-foreground' : 'text-amber-700 dark:text-amber-400'}`}>
                      Face match <span className="tabular-nums">{Math.round(c.identity.face_similarity * 100)}%</span>{c.identity.face_likely_match ? '' : ' — review'}
                    </span>
                  )}
                </div>
              ), 'identity')}

              <h4 className="mt-4 text-sm font-semibold">Questions</h4>
              {data.exam.questions.map((q) => row(
                <span className="block truncate" title={q.title}>{q.title}<span className="block text-[11px]">{q.scored ? `${q.points} pts` : 'Not scored'}</span></span>,
                (c) => {
                  const d = c.questions[q.id]
                  if (!d || !d.answered) return <span className="flex items-center gap-1 text-xs text-muted-foreground"><Circle className="h-3.5 w-3.5" /> Not answered</span>
                  if (!q.scored) return <span className="text-xs text-muted-foreground">Answered</span>
                  if (d.pending) return <span className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400"><Clock className="h-3.5 w-3.5" /> Needs grading</span>
                  const pts = d.awarded ?? (d.correct ? d.points : 0)
                  return d.correct || pts > 0
                    ? <span className="flex items-center gap-1 text-xs text-green-700 dark:text-green-400"><CheckCircle2 className="h-3.5 w-3.5" /> <span className="tabular-nums">{pts}/{d.points}</span></span>
                    : <span className="flex items-center gap-1 text-xs text-red-700 dark:text-red-400"><XCircle className="h-3.5 w-3.5" /> <span className="tabular-nums">0/{d.points}</span></span>
                },
                `q-${q.id}`,
              ))}

              {data.exam.questions.some((q) => q.coding) && (
                <>
                  <h4 className="mt-4 text-sm font-semibold">Code answers</h4>
                  {data.exam.questions.filter((q) => q.coding).map((q) => (
                    <div key={q.id} className="border-b border-border/60 py-3">
                      <p className="mb-2 text-sm font-medium">{q.title}</p>
                      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cands.length}, minmax(12rem, 1fr))` }}>
                        {cands.map((c) => {
                          const a = c.code[q.id]
                          return (
                            <div key={c.user_id} className="min-w-0">
                              <p className="mb-1 truncate text-xs text-muted-foreground">{c.name}{a?.language ? ` · ${a.language}` : ''}</p>
                              {a?.code
                                ? <pre className="max-h-72 overflow-auto rounded-lg border border-border/40 bg-zinc-950 p-3 font-mono text-xs leading-relaxed text-zinc-100"><code>{a.code}</code></pre>
                                : <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">No code submitted</p>}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </>
              )}

              <div className="mt-4 flex justify-end">
                <Button className="gap-2" disabled={!!shortlisting || cands.every((c) => !!c.outcome)} onClick={() => shortlist(cands.filter((c) => !c.outcome).map((c) => c.user_id), 'all')}>
                  {shortlisting === 'all' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Star className="h-4 w-4" />} Shortlist the rest <span className="tabular-nums">({cands.filter((c) => !c.outcome).length})</span>
                </Button>
              </div>
            </div>
          </div>
        ) : data ? (
          <EmptyState compact illustration="analytics" title="Not enough submissions" description="Pick at least two candidates who have submitted this test." />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
