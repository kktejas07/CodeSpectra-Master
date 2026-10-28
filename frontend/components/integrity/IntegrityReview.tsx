'use client'

/**
 * Reviewer screen for one test or contest (lib/integrity):
 *  - Attempts: trust score per attempt, filterable; open one for its timeline
 *    with snapshots, typing summaries, and mark it reviewed / cleared / flagged.
 *  - Similar code: clusters of similar answers per question with a
 *    side-by-side view; run the check now; mark clusters.
 *  - AI-written signals: what was seen per answer — signals, never verdicts.
 *  - Settings: the author's opt-in checks (+ platform AI caps for superadmins).
 * Nothing here changes a score or fails anyone.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ArrowLeft, Camera, CheckCircle2, Flag, Loader2, Play, RefreshCw, ShieldCheck, Sparkles, Users } from 'lucide-react'
import { PageHeader, Panel, StatCard } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useToast } from '@/lib/toast-context'
import { useDateFormat } from '@/lib/use-platform-timezone'
import { cn } from '@/lib/utils'
import { sideBySideDiff } from '@/lib/integrity/code-similarity'
import { EVENT_LABELS, SIGNALS, SIGNAL_INFO, type IntegritySettings, type ReviewStatus, type SignalId, type TargetKind } from '@/lib/integrity/types'
import type { TimelineEntry, TrustBand } from '@/lib/integrity/trust-score'
import type { AiSignal } from '@/lib/integrity/ai-signals'
import type { SimilarPair } from '@/lib/integrity/code-similarity'
import { useT } from '@/lib/i18n/client'
import type { Translator } from '@/lib/i18n/catalog'

interface Review { status: ReviewStatus; note: string; by: string | null; at: string | null }
interface AttemptRow {
  id: string; user_id: string; name: string; email: string; attempt_no: number; consented: boolean
  first_at: string; last_at: string; snapshot_count: number; review: Review
  trust: { score: number; band: TrustBand; incidents: number; by_type: Record<string, { count: number; incidents: number; penalty: number; capped: boolean }> }
}
interface Global { classifier_daily_cap: number; monthly_cost_cap_usd: number; cost_per_call_usd: number }
interface Overview {
  target: { kind: TargetKind; id: string; title: string }
  settings: IntegritySettings
  global: Global | null
  attempts: AttemptRow[]
  report: { status: string; finished_at: string | null; error: string | null; clusters: number; ai_rows: number } | null
}
interface Detail {
  attempt: AttemptRow
  trust: { score: number; band: TrustBand; timeline: TimelineEntry[] }
  snapshots: Array<{ id: string; reason: string; at: number }>
  typing: Array<{ q: string; summary: { keys: number; chars: number; deletes: number; mean_ms: number; sd_ms: number; pauses: number; fast_bursts: number; active_ms: number } }>
}
interface Cluster { id: string; members: Array<{ submission_id: string; user_id: string; name: string }>; max_score: number; pairs: SimilarPair[]; review: Review }
interface Report {
  status: string; finished_at: string | null; error: string | null; notes: string[]
  questions: Array<{ question_id: string; title: string; language: string; submissions: number; clusters: Cluster[] }>
  ai: Array<{ user_id: string; name: string; question_id: string; submission_id: string; signals: AiSignal[]; combined: number; level: string; classifier: number | null }>
}

const BAND = (t: Translator): Record<TrustBand, { label: string; cls: string }> => ({
  clear: { label: t('exam.clear'), cls: 'bg-green-500/10 text-green-700 dark:text-green-300 border-green-500/30' },
  review: { label: t('exam.worthALook'), cls: 'bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/30' },
  flag: { label: t('exam.manySignals'), cls: 'bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30' },
})
const REVIEW_LABEL = (t: Translator): Record<ReviewStatus, string> => ({ unreviewed: t('exam.notReviewed'), reviewed: t('exam.reviewed'), cleared: t('exam.cleared'), flagged: t('exam.flagged') })
const SEVERITY_CLS: Record<TimelineEntry['severity'], string> = {
  info: 'bg-muted text-muted-foreground',
  low: 'bg-primary/10 text-primary',
  medium: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
  high: 'bg-red-500/15 text-red-700 dark:text-red-300',
}
const pct = (x: number) => `${Math.round(x * 100)}%`
const selectCls = 'h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await (init?.method && init.method !== 'GET' ? csrfFetch(url, init) : fetch(url, { credentials: 'include', cache: 'no-store', ...init }))
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error((j as { error?: string }).error || 'Something went wrong')
  return j as T
}
const jsonInit = (method: string, body: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

function BandPill({ band, score }: { band: TrustBand; score: number }) {
  const { t } = useT()
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium', BAND(t)[band].cls)}>
      <span className="font-mono tabular-nums">{score}</span> {BAND(t)[band].label}
    </span>
  )
}

function ReviewButtons({ value, busy, onSet }: { value: ReviewStatus; busy: boolean; onSet: (s: ReviewStatus) => void }) {
  const { t } = useT()
  const opts: Array<{ s: ReviewStatus; icon: React.ReactNode }> = [
    { s: 'reviewed', icon: <CheckCircle2 className="h-4 w-4" aria-hidden /> },
    { s: 'cleared', icon: <ShieldCheck className="h-4 w-4" aria-hidden /> },
    { s: 'flagged', icon: <Flag className="h-4 w-4" aria-hidden /> },
  ]
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={t('exam.reviewMark')}>
      {opts.map((o) => (
        <Button key={o.s} type="button" size="sm" variant={value === o.s ? 'default' : 'outline'} aria-pressed={value === o.s} disabled={busy} onClick={() => onSet(o.s)} className="min-h-11 gap-1.5 sm:min-h-9">
          {o.icon} {REVIEW_LABEL(t)[o.s]}
        </Button>
      ))}
    </div>
  )
}

export function IntegrityReview({ kind, id, backHref, backLabel }: { kind: TargetKind; id: string; backHref: string; backLabel: string }) {
  const { t } = useT()
  const addToast = useToast()
  const { dateTime, time } = useDateFormat()
  const base = `/api/admin/integrity/${kind}/${encodeURIComponent(id)}`
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState('attempts')

  const load = useCallback(async () => {
    try { setData(await api<Overview>(base)); setError(null) } catch (e) { setError((e as Error).message) }
  }, [base])
  useEffect(() => { void load() }, [load])

  if (error && !data) return <EmptyState illustration="error" title={t('exam.couldNotLoadIntegrityData')} description={error} actionLabel={t('common.tryAgain')} onAction={() => void load()} />
  if (!data) return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground motion-reduce:animate-none" aria-label={t('exam.loading')} /></div>

  const flagged = data.attempts.filter((a) => a.trust.band === 'flag').length
  const open = data.attempts.filter((a) => a.trust.band !== 'clear' && a.review.status === 'unreviewed').length
  return (
    <div className="space-y-6">
      <Link href={backHref} className="inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" aria-hidden /> {backLabel}</Link>
      <PageHeader
        title={t('exam.integrityReview')}
        description={<>{t('exam.titleSignalsForAPersonTobf5', { title: data.target.title })}</>}
        icon={<ShieldCheck className="h-5 w-5" />}
        actions={<Button variant="outline" size="sm" onClick={() => void load()} className="gap-2"><RefreshCw className="h-4 w-4" aria-hidden />{' '}{t('exam.refresh')}</Button>}
      />
      {!data.settings.enabled && (
        <Panel className="flex items-start gap-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
          <p className="text-muted-foreground">{t('exam.candidateChecksAreOffForThis70a', { value: kind === 'exam' ? t('exam.test') : t('exam.contest') })}</p>
        </Panel>
      )}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={t('exam.attemptsMonitored')} value={data.attempts.length} icon={<Users />} />
        <StatCard label={t('exam.manySignals')} value={flagged} icon={<Flag />} />
        <StatCard label={t('exam.waitingForReview')} value={open} icon={<AlertTriangle />} />
        <StatCard label={t('exam.similarCodeClusters')} value={data.report?.clusters ?? '—'} icon={<Sparkles />} />
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex h-auto flex-wrap">
          <TabsTrigger value="attempts">{t('exam.attempts')}</TabsTrigger>
          <TabsTrigger value="similar">{t('exam.similarCode')}</TabsTrigger>
          <TabsTrigger value="ai">{t('exam.aiWrittenSignals')}</TabsTrigger>
          <TabsTrigger value="settings">{t('exam.settings')}</TabsTrigger>
        </TabsList>
        <TabsContent value="attempts" className="mt-4"><AttemptsTab base={base} attempts={data.attempts} onChanged={load} dateTime={dateTime} time={time} /></TabsContent>
        <TabsContent value="similar" className="mt-4"><SimilarTab base={base} active={tab === 'similar'} onRan={load} dateTime={dateTime} /></TabsContent>
        <TabsContent value="ai" className="mt-4"><AiTab base={base} active={tab === 'ai'} /></TabsContent>
        <TabsContent value="settings" className="mt-4"><SettingsTab base={base} kind={kind} settings={data.settings} global={data.global} onSaved={(s, g) => setData((d) => (d ? { ...d, settings: s ?? d.settings, global: g ?? d.global } : d))} toast={addToast} /></TabsContent>
      </Tabs>
    </div>
  )
}

type Fmt = (v: string | number | Date | null | undefined, o?: Intl.DateTimeFormatOptions) => string

function AttemptsTab({ base, attempts, onChanged, dateTime, time }: { base: string; attempts: AttemptRow[]; onChanged: () => Promise<void>; dateTime: Fmt; time: Fmt }) {
  const { td, t: tr } = useT()
  const addToast = useToast()
  const [band, setBand] = useState<'all' | TrustBand>('all')
  const [review, setReview] = useState<'all' | ReviewStatus>('all')
  const [signal, setSignal] = useState<'all' | string>('all')
  const [selected, setSelected] = useState<string | null>(null)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [tlFilter, setTlFilter] = useState<'issues' | 'all'>('issues')

  const rows = useMemo(() => attempts.filter((a) =>
    (band === 'all' || a.trust.band === band) && (review === 'all' || a.review.status === review) && (signal === 'all' || (a.trust.by_type[signal]?.count ?? 0) > 0),
  ), [attempts, band, review, signal])
  const types = useMemo(() => [...new Set(attempts.flatMap((a) => Object.keys(a.trust.by_type)))].filter((t) => !['consent_given', 'session_start', 'session_end'].includes(t)), [attempts])

  const open = async (aid: string) => {
    setSelected(aid); setLoading(true); setDetail(null)
    try {
      const d = await api<Detail>(`${base}/attempts/${aid}`)
      setDetail(d); setNote(d.attempt.review.note || '')
    } catch (e) { addToast({ type: 'error', title: (e as Error).message }) } finally { setLoading(false) }
  }
  const mark = async (status: ReviewStatus) => {
    if (!selected) return
    setBusy(true)
    try {
      const r = await api<{ review: Review }>(`${base}/attempts/${selected}`, jsonInit('PATCH', { status, note }))
      setDetail((d) => (d ? { ...d, attempt: { ...d.attempt, review: r.review } } : d))
      addToast({ type: 'success', title: tr('exam.markedValue', { value: REVIEW_LABEL(tr)[status].toLowerCase() }) })
      await onChanged()
    } catch (e) { addToast({ type: 'error', title: (e as Error).message }) } finally { setBusy(false) }
  }

  if (!attempts.length) return <EmptyState illustration="proctoring" title={tr('exam.noMonitoredAttemptsYet')} description={tr('exam.attemptsAppearHereOnceCandidatesStart494')} />
  const timeline = detail ? detail.trust.timeline.filter((e) => tlFilter === 'all' || e.severity !== 'info') : []
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <Panel className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap gap-3">
          <div className="space-y-1"><Label htmlFor="f-band">{tr('exam.trust')}</Label>
            <select id="f-band" className={selectCls} value={band} onChange={(e) => setBand(e.target.value as typeof band)}>
              <option value="all">{tr('exam.all')}</option><option value="flag">{tr('exam.manySignals')}</option><option value="review">{tr('exam.worthALook')}</option><option value="clear">{tr('exam.clear')}</option>
            </select></div>
          <div className="space-y-1"><Label htmlFor="f-review">{tr('exam.review2')}</Label>
            <select id="f-review" className={selectCls} value={review} onChange={(e) => setReview(e.target.value as typeof review)}>
              <option value="all">{tr('exam.all')}</option>{(Object.keys(REVIEW_LABEL(tr)) as ReviewStatus[]).map((s) => <option key={s} value={s}>{REVIEW_LABEL(tr)[s]}</option>)}
            </select></div>
          <div className="space-y-1"><Label htmlFor="f-signal">{tr('exam.signal')}</Label>
            <select id="f-signal" className={selectCls} value={signal} onChange={(e) => setSignal(e.target.value)}>
              <option value="all">{tr('exam.any')}</option>{types.map((t) => <option key={t} value={t}>{td(`exam.eventLabels:${t as keyof typeof EVENT_LABELS}`, EVENT_LABELS[t as keyof typeof EVENT_LABELS]) ?? t}</option>)}
            </select></div>
        </div>
        {rows.length === 0 ? <p className="text-sm text-muted-foreground">{tr('exam.noAttemptsMatchTheseFilters')}</p> : (
          <ul className="divide-y divide-border">
            {rows.map((a) => (
              <li key={a.id}>
                <button type="button" onClick={() => void open(a.id)} aria-current={selected === a.id} className={cn('flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-2 py-3 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', selected === a.id && 'bg-primary/5')}>
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-foreground">{a.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{a.attempt_no > 1 ? tr('exam.attemptAttemptNo', { attempt_no: a.attempt_no }) : ''}{tr('exam.countIncidentsValue', { count: a.trust.incidents, value: REVIEW_LABEL(tr)[a.review.status] })}</span>
                  </span>
                  <BandPill band={a.trust.band} score={a.trust.score} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel className="space-y-4 p-4 sm:p-6" aria-live="polite">
        {!selected && <p className="text-sm text-muted-foreground">{tr('exam.pickAnAttemptToSeeIts46a')}</p>}
        {loading && <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground motion-reduce:animate-none" aria-label={tr('exam.loading')} /></div>}
        {detail && (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-foreground">{detail.attempt.name}</h3>
                <p className="text-xs text-muted-foreground">{detail.attempt.email} · {dateTime(detail.attempt.first_at)} – {time(detail.attempt.last_at)}{detail.attempt.consented ? '' : tr('exam.noConsentOnFile')}</p>
              </div>
              <BandPill band={detail.trust.band} score={detail.trust.score} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="review-note">{tr('exam.reviewerNote')}</Label>
              <Textarea id="review-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={2000} placeholder={tr('exam.whatYouCheckedAndWhyOptional')} />
              <ReviewButtons value={detail.attempt.review.status} busy={busy} onSet={(s) => void mark(s)} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <h4 className="font-semibold text-foreground">{tr('exam.timeline')}</h4>
              <select aria-label={tr('exam.timelineFilter')} className={selectCls} value={tlFilter} onChange={(e) => setTlFilter(e.target.value as typeof tlFilter)}>
                <option value="issues">{tr('exam.signalsOnly')}</option><option value="all">{tr('exam.everything')}</option>
              </select>
            </div>
            {timeline.length === 0 ? <p className="text-sm text-muted-foreground">{tr('exam.nothingUnusualWasSeen')}</p> : (
              <ol className="space-y-2">
                {timeline.map((e, i) => (
                  <li key={`${e.at}-${i}`} className="flex gap-3 rounded-xl border border-border p-3">
                    <span className="w-16 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">{time(e.at, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-foreground">{e.label}</span>
                        <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', SEVERITY_CLS[e.severity])}>{e.penalty > 0 ? `−${e.penalty}` : tr('exam.noted')}</span>
                        {e.q && <span className="text-xs text-muted-foreground">{tr('exam.questionQ', { q: e.q })}</span>}
                      </div>
                      <EventDetail e={e} />
                      {e.snapshot_id && (
                        // eslint-disable-next-line @next/next/no-img-element -- private, auth-gated image route
                        <img src={`/api/admin/integrity/snapshots/${e.snapshot_id}`} alt={tr('exam.cameraStillValue', { value: e.label.toLowerCase() })} loading="lazy" className="mt-1 w-40 rounded-lg border border-border bg-muted" />
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
            {detail.snapshots.length > 0 && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Camera className="h-3.5 w-3.5" aria-hidden />{' '}{tr('exam.countCameraStillsOnFileDeleted3c7', { count: detail.snapshots.length })}</p>
            )}
            {detail.typing.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-semibold text-foreground">{tr('exam.typingRhythm')}</h4>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {detail.typing.map((t) => (
                    <li key={t.q} className="rounded-xl border border-border p-3 text-xs text-muted-foreground">
                      <p className="mb-1 font-medium text-foreground">{tr('exam.questionQ2', { q: t.q })}</p>
                      <p><span className="tabular-nums">{t.summary.chars}</span>{' '}{tr('exam.typed')}{' '}<span className="tabular-nums">{t.summary.deletes}</span>{' '}{tr('exam.deletes')}{' '}<span className="tabular-nums">{t.summary.pauses}</span>{' '}{tr('exam.longPauses')}</p>
                      <p>{tr('exam.gap')}{' '}<span className="tabular-nums">{t.summary.mean_ms}</span> ms ± <span className="tabular-nums">{t.summary.sd_ms}</span> · <span className="tabular-nums">{t.summary.fast_bursts}</span>{' '}{tr('exam.fastBursts')}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </Panel>
    </div>
  )
}

function EventDetail({ e }: { e: TimelineEntry }) {
  const d = e.data as Record<string, number | string | boolean>
  const parts: string[] = []
  if (typeof d.duration_ms === 'number') parts.push(`${Math.round(d.duration_ms / 1000)} s away`)
  if (typeof d.length === 'number') parts.push(`${d.length} characters`)
  if (typeof d.count === 'number') parts.push(`${d.count} faces`)
  if (typeof d.seconds === 'number') parts.push(`about ${d.seconds} s`)
  if (d.clock_skew) parts.push('device clock was off; server time used')
  if (typeof d.reason === 'string') parts.push(d.reason === 'denied' ? 'camera permission denied' : 'no camera')
  return parts.length ? <p className="text-xs text-muted-foreground">{parts.join(' · ')}</p> : null
}

function SimilarTab({ base, active, onRan, dateTime }: { base: string; active: boolean; onRan: () => Promise<void>; dateTime: Fmt }) {
  const { t } = useT()
  const addToast = useToast()
  const [report, setReport] = useState<Report | null | undefined>(undefined)
  const [running, setRunning] = useState(false)
  const [pair, setPair] = useState<{ q: string; a: string; b: string; names: [string, string]; score: number } | null>(null)
  const [code, setCode] = useState<Array<{ code: string }> | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try { setReport((await api<{ report: Report | null }>(`${base}/report`)).report) } catch (e) { addToast({ type: 'error', title: (e as Error).message }); setReport(null) }
  }, [base, addToast])
  useEffect(() => { if (active && report === undefined) void load() }, [active, report, load])

  const run = async () => {
    setRunning(true)
    try { setReport((await api<{ report: Report }>(`${base}/report`, { method: 'POST' })).report); await onRan(); addToast({ type: 'success', title: t('exam.checkFinished') }) }
    catch (e) { addToast({ type: 'error', title: (e as Error).message }) } finally { setRunning(false) }
  }
  const showPair = async (q: string, p: SimilarPair, members: Cluster['members']) => {
    const name = (sid: string) => members.find((m) => m.submission_id === sid)?.name || 'Candidate'
    setPair({ q, a: p.a, b: p.b, names: [name(p.a), name(p.b)], score: p.score }); setCode(null)
    try { setCode((await api<{ code: Array<{ code: string }> }>(`${base}/report/code?q=${encodeURIComponent(q)}&a=${encodeURIComponent(p.a)}&b=${encodeURIComponent(p.b)}`)).code) }
    catch (e) { addToast({ type: 'error', title: (e as Error).message }) }
  }
  const markCluster = async (cid: string, status: ReviewStatus) => {
    setBusy(cid)
    try {
      const r = await api<{ review: Review }>(`${base}/report`, jsonInit('PATCH', { cluster_id: cid, status }))
      setReport((rep) => rep ? { ...rep, questions: rep.questions.map((q) => ({ ...q, clusters: q.clusters.map((c) => (c.id === cid ? { ...c, review: r.review } : c)) })) } : rep)
    } catch (e) { addToast({ type: 'error', title: (e as Error).message }) } finally { setBusy(null) }
  }
  const diff = useMemo(() => (code && code.length === 2 ? sideBySideDiff(code[0].code, code[1].code) : null), [code])

  if (report === undefined) return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground motion-reduce:animate-none" aria-label={t('exam.loading')} /></div>
  const clusters = report?.questions.reduce((n, q) => n + q.clusters.length, 0) ?? 0
  return (
    <div className="space-y-4">
      <Panel className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="text-sm text-muted-foreground">
          {report?.status === 'running' ? t('exam.theCheckIsRunning') : report?.finished_at ? <>{t('exam.lastCheckedDateRunsAutomaticallyAfter385', { date: dateTime(report.finished_at) })}</> : t('exam.notCheckedYetItRunsAutomatically390')}
          {report?.error && <p className="mt-1 text-red-700 dark:text-red-300">{report.error}</p>}
          {report?.notes?.map((n) => <p key={n} className="mt-1">{n}</p>)}
        </div>
        <Button onClick={() => void run()} disabled={running} className="min-h-11 gap-2">{running ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}{' '}{t('exam.runCheckNow')}</Button>
      </Panel>
      {report && clusters === 0 && <EmptyState illustration="search" title={t('exam.noSimilarAnswersFound')} description={t('exam.noCodeAnswersWereSimilarEnough10e')} compact />}
      {report?.questions.filter((q) => q.clusters.length).map((q) => (
        <Panel key={q.question_id} className="space-y-3 p-4 sm:p-6">
          <h3 className="font-semibold text-foreground">{q.title} <span className="text-sm font-normal text-muted-foreground">{t('exam.submissionsAnswers', { submissions: q.submissions })}</span></h3>
          {q.clusters.map((c) => (
            <div key={c.id} className="space-y-2 rounded-2xl border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-foreground"><span className="font-medium">{t('exam.countAnswers', { count: c.members.length })}</span>{' '}{t('exam.upTo')}{' '}<span className="font-mono tabular-nums">{pct(c.max_score)}</span>{' '}{t('exam.similar')}</p>
                <ReviewButtons value={c.review.status} busy={busy === c.id} onSet={(s) => void markCluster(c.id, s)} />
              </div>
              <p className="text-xs text-muted-foreground">{c.members.map((m) => m.name).join(', ')}</p>
              <ul className="flex flex-wrap gap-2">
                {c.pairs.map((p) => (
                  <li key={`${p.a}-${p.b}`}>
                    <Button type="button" variant="outline" size="sm" className="min-h-11 sm:min-h-9" onClick={() => void showPair(q.question_id, p, c.members)}>{t('exam.compareValueAndValue2', { value: c.members.find((m) => m.submission_id === p.a)?.name.split(' ')[0], value2: c.members.find((m) => m.submission_id === p.b)?.name.split(' ')[0] })}{' '}<span className="font-mono tabular-nums">{pct(p.score)}</span>
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Panel>
      ))}
      {pair && (
        <Panel className="space-y-3 p-4 sm:p-6" aria-live="polite">
          <h3 className="font-semibold text-foreground">{t('exam.valueAndValue2', { value: pair.names[0], value2: pair.names[1] })}{' '}<span className="font-mono tabular-nums">{pct(pair.score)}</span>{' '}{t('exam.similar')}</h3>
          <p className="text-xs text-muted-foreground">{t('exam.matchingLinesAreHighlightedSpacingIgnorefbf')}</p>
          {!diff ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground motion-reduce:animate-none" aria-label={t('exam.loading')} /> : (
            <div className="max-h-[560px] overflow-auto rounded-xl border border-border bg-muted/20">
              <table className="w-full table-fixed border-collapse font-mono text-xs">
                <caption className="sr-only">{t('exam.sideBySideComparison')}</caption>
                <thead><tr className="bg-muted/60 text-left"><th scope="col" className="w-1/2 px-2 py-1 font-sans font-medium">{pair.names[0]}</th><th scope="col" className="w-1/2 px-2 py-1 font-sans font-medium">{pair.names[1]}</th></tr></thead>
                <tbody>
                  {diff.map((r, i) => (
                    <tr key={i} className={cn(r.same && 'bg-amber-500/10')}>
                      <td className="whitespace-pre-wrap break-all border-r border-border px-2 py-0.5 align-top text-foreground">{r.left ? <><span className="mr-2 select-none text-muted-foreground">{r.left.no}</span>{r.left.text}</> : null}</td>
                      <td className="whitespace-pre-wrap break-all px-2 py-0.5 align-top text-foreground">{r.right ? <><span className="mr-2 select-none text-muted-foreground">{r.right.no}</span>{r.right.text}</> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}
    </div>
  )
}

function AiTab({ base, active }: { base: string; active: boolean }) {
  const { t } = useT()
  const [report, setReport] = useState<Report | null | undefined>(undefined)
  const [level, setLevel] = useState<'all' | 'high' | 'medium' | 'low'>('all')
  useEffect(() => {
    if (!active || report !== undefined) return
    api<{ report: Report | null }>(`${base}/report`).then((r) => setReport(r.report)).catch(() => setReport(null))
  }, [active, report, base])
  if (report === undefined) return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground motion-reduce:animate-none" aria-label={t('exam.loading')} /></div>
  const rows = (report?.ai ?? []).filter((r) => level === 'all' || r.level === level)
  const title = (qid: string) => report?.questions.find((q) => q.question_id === qid)?.title || `Question ${qid}`
  return (
    <div className="space-y-4">
      <Panel className="space-y-1 p-4 text-sm text-muted-foreground sm:p-6">
        <p><span className="font-medium text-foreground">{t('exam.theseAreSignalsNotVerdicts')}</span>{' '}{t('exam.fastPastedOrEvenlyTypedAnswers0cf')}</p>
        <p>{t('exam.builtFromPasteEventsTypingRhythm391')}</p>
      </Panel>
      <div className="space-y-1"><Label htmlFor="ai-level">{t('exam.show')}</Label>
        <select id="ai-level" className={selectCls} value={level} onChange={(e) => setLevel(e.target.value as typeof level)}>
          <option value="all">{t('exam.allWithSignals')}</option><option value="high">{t('exam.manySignals')}</option><option value="medium">{t('exam.someSignals')}</option><option value="low">{t('exam.aWeakSignal')}</option>
        </select></div>
      {!rows.length ? <EmptyState illustration="ai" title={t('exam.noSignalsToShow')} description={report ? t('exam.noAnswerShowedSignalsAtThisb2d') : t('exam.runTheCheckOnTheSimilar89e')} compact /> : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={`${r.submission_id}-${r.question_id}`}>
              <Panel className="space-y-2 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-foreground">{r.name} <span className="text-sm font-normal text-muted-foreground">· {title(r.question_id)}</span></p>
                  <span className={cn('rounded-full border px-2.5 py-0.5 text-xs font-medium', r.level === 'high' ? BAND(t).flag.cls : r.level === 'medium' ? BAND(t).review.cls : 'border-border bg-muted text-muted-foreground')}>
                    {r.level === 'high' ? t('exam.manySignals') : r.level === 'medium' ? t('exam.someSignals') : t('exam.aWeakSignal')}
                  </span>
                </div>
                <ul className="space-y-1 text-sm">
                  {r.signals.map((s) => <li key={s.id} className="text-muted-foreground"><span className="font-medium text-foreground">{s.label}:</span> {s.detail}</li>)}
                </ul>
              </Panel>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Row({ id, label, hint, checked, onChange, disabled }: { id: string; label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div><Label htmlFor={id} className="text-foreground">{label}</Label>{hint && <p className="text-xs text-muted-foreground">{hint}</p>}</div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  )
}

function SettingsTab({ base, kind, settings, global, onSaved, toast }: {
  base: string; kind: TargetKind; settings: IntegritySettings; global: Global | null
  onSaved: (s: IntegritySettings | null, g: Global | null) => void; toast: ReturnType<typeof useToast>
}) {
  const { t } = useT()
  const [s, setS] = useState<IntegritySettings>(settings)
  const [g, setG] = useState<Global | null>(global)
  const [saving, setSaving] = useState(false)
  useEffect(() => setS(settings), [settings])
  const sig = (id: SignalId, v: boolean) => setS((x) => ({ ...x, signals: { ...x.signals, [id]: v } }))
  const save = async () => {
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        settings: {
          enabled: s.enabled, signals: s.signals, face_interval_sec: s.face_interval_sec, snapshots_on_violation: s.snapshots_on_violation,
          snapshot_retention_days: s.snapshot_retention_days, event_retention_days: s.event_retention_days, continuous_video: s.continuous_video,
          similarity: s.similarity, ai_signals: s.ai_signals,
        },
      }
      if (g) body.global = { classifier_daily_cap: g.classifier_daily_cap, monthly_cost_cap_usd: g.monthly_cost_cap_usd, cost_per_call_usd: g.cost_per_call_usd }
      const r = await api<{ settings?: IntegritySettings; global?: Global }>(base, jsonInit('PUT', body))
      onSaved(r.settings ?? null, r.global ?? null)
      toast({ type: 'success', title: t('exam.settingsSaved') })
    } catch (e) { toast({ type: 'error', title: (e as Error).message }) } finally { setSaving(false) }
  }
  const num = (v: string, min: number, max: number) => Math.max(min, Math.min(max, Number(v) || min))
  const what = kind === 'exam' ? 'test' : 'contest'
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel className="space-y-2 p-4 sm:p-6">
        <h3 className="font-semibold text-foreground">{t('exam.candidateChecks')}</h3>
        <p className="text-sm text-muted-foreground">{t('exam.candidatesSeeExactlyTheseChecksOn26b', { what })}</p>
        <Row id="s-enabled" label={t('exam.turnOnChecksForThisWhat', { what })} checked={s.enabled} onChange={(v) => setS((x) => ({ ...x, enabled: v }))} />
        <div className={cn('divide-y divide-border', !s.enabled && 'opacity-60')}>
          {SIGNALS.map((id) => <Row key={id} id={`s-${id}`} label={SIGNAL_INFO[id].label} hint={SIGNAL_INFO[id].candidate} checked={s.signals[id]} onChange={(v) => sig(id, v)} disabled={!s.enabled} />)}
        </div>
        <p className="text-xs text-muted-foreground">{t('exam.phoneOrBookDetectionIsNot246')}</p>
        <div className="grid gap-3 pt-2 sm:grid-cols-2">
          <div className="space-y-1"><Label htmlFor="s-interval">{t('exam.cameraCheckEverySeconds')}</Label>
            <input id="s-interval" type="number" min={5} max={120} className={cn(selectCls, 'w-full')} value={s.face_interval_sec} onChange={(e) => setS((x) => ({ ...x, face_interval_sec: num(e.target.value, 5, 120) }))} /></div>
          <div className="space-y-1"><Label htmlFor="s-ev-days">{t('exam.keepTheTimelineDays')}</Label>
            <input id="s-ev-days" type="number" min={7} max={730} className={cn(selectCls, 'w-full')} value={s.event_retention_days} onChange={(e) => setS((x) => ({ ...x, event_retention_days: num(e.target.value, 7, 730) }))} /></div>
        </div>
        <Row id="s-snap" label={t('exam.saveACameraStillOnViolations')} hint={t('exam.oneSmallPhotoWhenNoFace3b9')} checked={s.snapshots_on_violation} onChange={(v) => setS((x) => ({ ...x, snapshots_on_violation: v }))} disabled={!s.enabled} />
        {s.snapshots_on_violation && (
          <div className="space-y-1"><Label htmlFor="s-snap-days">{t('exam.deleteStillsAfterDays')}</Label>
            <input id="s-snap-days" type="number" min={1} max={365} className={cn(selectCls, 'w-full')} value={s.snapshot_retention_days} onChange={(e) => setS((x) => ({ ...x, snapshot_retention_days: num(e.target.value, 1, 365) }))} /></div>
        )}
        <Row id="s-video" label={t('exam.continuousWebcamAndScreenRecording')} hint={t('exam.offByDefaultWhenOnCandidatesddb')} checked={s.continuous_video} onChange={(v) => setS((x) => ({ ...x, continuous_video: v }))} disabled={!s.enabled || kind !== 'exam'} />
      </Panel>
      <Panel className="space-y-2 p-4 sm:p-6">
        <h3 className="font-semibold text-foreground">{t('exam.similarCodeAndAiWrittenSignals')}</h3>
        <p className="text-sm text-muted-foreground">{t('exam.runsOnCodeAnswersAfterThed06', { what })}</p>
        <Row id="s-sim" label={t('exam.findSimilarCodeAnswers')} checked={s.similarity.enabled} onChange={(v) => setS((x) => ({ ...x, similarity: { ...x.similarity, enabled: v } }))} />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><Label htmlFor="s-th">{t('exam.groupAtSimilarity')}</Label>
            <input id="s-th" type="number" min={30} max={100} className={cn(selectCls, 'w-full')} value={Math.round(s.similarity.threshold * 100)} onChange={(e) => setS((x) => ({ ...x, similarity: { ...x.similarity, threshold: num(e.target.value, 30, 100) / 100 } }))} /></div>
          <div className="space-y-1"><Label htmlFor="s-min">{t('exam.ignoreAnswersUnderTokens')}</Label>
            <input id="s-min" type="number" min={5} max={500} className={cn(selectCls, 'w-full')} value={s.similarity.min_tokens} onChange={(e) => setS((x) => ({ ...x, similarity: { ...x.similarity, min_tokens: num(e.target.value, 5, 500) } }))} /></div>
        </div>
        <Row id="s-ai" label={t('exam.showAiWrittenSignals')} hint={t('exam.pasteShareTypingRhythmAndTime6ec')} checked={s.ai_signals.enabled} onChange={(v) => setS((x) => ({ ...x, ai_signals: { ...x.ai_signals, enabled: v } }))} />
        <Row id="s-clf" label={t('exam.alsoAskAModelCapped')} hint={t('exam.onlyForTheMostSuspiciousAnswersee0')} checked={s.ai_signals.classifier} onChange={(v) => setS((x) => ({ ...x, ai_signals: { ...x.ai_signals, classifier: v } }))} disabled={!s.ai_signals.enabled} />
        {s.ai_signals.classifier && (
          <div className="space-y-1"><Label htmlFor="s-clf-max">{t('exam.modelChecksForThisWhatAt598', { what })}</Label>
            <input id="s-clf-max" type="number" min={0} max={200} className={cn(selectCls, 'w-full')} value={s.ai_signals.classifier_max_calls} onChange={(e) => setS((x) => ({ ...x, ai_signals: { ...x.ai_signals, classifier_max_calls: num(e.target.value, 0, 200) } }))} /></div>
        )}
        {g && (
          <div className="space-y-3 rounded-2xl border border-border p-3">
            <h4 className="text-sm font-semibold text-foreground">{t('exam.platformAiCapsAllTestsAndd5d')}</h4>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1"><Label htmlFor="g-day">{t('exam.modelChecksPerDay')}</Label>
                <input id="g-day" type="number" min={0} max={5000} className={cn(selectCls, 'w-full')} value={g.classifier_daily_cap} onChange={(e) => setG({ ...g, classifier_daily_cap: num(e.target.value, 0, 5000) })} /></div>
              <div className="space-y-1"><Label htmlFor="g-month">{t('exam.monthlySpendCapUsd')}</Label>
                <input id="g-month" type="number" min={0} max={1000} step="0.5" className={cn(selectCls, 'w-full')} value={g.monthly_cost_cap_usd} onChange={(e) => setG({ ...g, monthly_cost_cap_usd: Math.max(0, Math.min(1000, Number(e.target.value) || 0)) })} /></div>
              <div className="space-y-1"><Label htmlFor="g-cost">{t('exam.estimatedCostPerCheckUsd')}</Label>
                <input id="g-cost" type="number" min={0} max={1} step="0.001" className={cn(selectCls, 'w-full')} value={g.cost_per_call_usd} onChange={(e) => setG({ ...g, cost_per_call_usd: Math.max(0, Math.min(1, Number(e.target.value) || 0)) })} /></div>
            </div>
          </div>
        )}
        <div className="pt-2"><Button onClick={() => void save()} disabled={saving} className="min-h-11 gap-2">{saving && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />}{' '}{t('exam.saveSettings')}</Button></div>
      </Panel>
    </div>
  )
}
