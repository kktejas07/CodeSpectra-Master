'use client'

/**
 * Company test practice runner: pick Easy / Moderate / Tough, then take the
 * pattern's sections one after another, each on its own clock (the server
 * owns the time and closes a section whose time ran out). After the last
 * section: score per section against the cut-off, then a question-by-question
 * review. A run in progress is resumable from ?attempt=<id>.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, CheckCircle2, Clock, ListChecks, Loader2, Target, Timer, XCircle } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { csrfFetch } from '@/lib/csrf-fetch'
import { PageHeader, Panel, StatCard } from '@/components/app/page-kit'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { SkeletonList, SkeletonText } from '@/components/ui/skeleton-boneyard'
import { QuestionAnswerInput, type AnswerQuestion } from '@/components/assessment/QuestionAnswerInput'
import { LEVEL_LABEL, PRACTICE_LEVELS, isPracticeLevel, type PracticeLevel } from '@/lib/company-tests/types'
import { cn } from '@/lib/utils'
import { useT, type ClientI18n } from '@/lib/i18n/client'

interface PatternInfo {
  id: string
  examName: string
  companyName: string
  companySlug: string
  verified: boolean
  negativeMarking: number
  cutoffPercent: number
  totals: { questions: number; minutes: number }
  sections: { name: string; questionCount: number; timeMinutes: number }[]
  levels: { level: PracticeLevel; ready: boolean; complete: boolean }[]
}

type Question = AnswerQuestion & { title?: string; difficulty?: string; marks: number }

interface SectionResult {
  id: string; name: string; score: number; max: number; percent: number; cutoffPercent: number
  passed: boolean; correct: number; wrong: number; unanswered: number; late: boolean
}

interface AttemptView {
  id: string
  patternId: string
  examName: string
  companyName: string
  companySlug: string
  level: PracticeLevel
  incomplete: boolean
  negativeMarking: number
  status: 'in_progress' | 'completed'
  current: number
  serverNow: string
  sections: { id: string; name: string; timeMinutes: number; cutoffPercent: number; questionCount: number; state: 'done' | 'current' | 'upcoming'; late: boolean }[]
  section?: { id: string; name: string; deadline: string | null; questions: Question[] } | null
  result?: { sections: SectionResult[]; score: number; max: number; percent: number; cutoffPercent: number; passed: boolean }
  review?: { id: string; name: string; late: boolean; questions: (Question & { answer?: string; explanation?: string; yourAnswer: string; status: string; awarded: number })[] }[]
}

interface RecentRun { id: string; level: PracticeLevel; status: string; createdAt: string; result?: { percent?: number; passed?: boolean } }

type Answers = Record<string, string | string[]>

const draftKey = (attemptId: string, sectionId: string) => `codespectra_company_test_${attemptId}_${sectionId}`
function readDraft(k: string): Answers {
  try { const v = JSON.parse(window.localStorage.getItem(k) || '{}'); return v && typeof v === 'object' ? v : {} } catch { return {} }
}
function writeDraft(k: string, v: Answers) {
  try { window.localStorage.setItem(k, JSON.stringify(v)) } catch { /* storage unavailable */ }
}
function clearDraft(k: string) {
  try { window.localStorage.removeItem(k) } catch { /* storage unavailable */ }
}

function fmtClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(s / 60)
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

const STATUS_LABEL: Record<string, string> = { correct: 'Correct', partial: 'Partly right', wrong: 'Wrong', unanswered: 'Not answered', not_scored: 'Not auto-scored' }

/** Practice level label in the interface language (stored values stay easy / moderate / tough). */
const levelText = (td: ClientI18n['td'], l: PracticeLevel) => td(`dashboard.practiceLevel:${l}`, LEVEL_LABEL[l] ?? l)

export default function CompanyTestRunnerPage() {
  const gate = usePageGuard('user')
  const { t, td, fmt } = useT()
  const router = useRouter()
  const params = useParams<{ patternId: string }>()
  const sp = useSearchParams()
  const patternId = String(params?.patternId || '')
  const attemptParam = sp?.get('attempt') || ''
  const levelParam = sp?.get('level')
  const [level, setLevel] = useState<PracticeLevel>(isPracticeLevel(levelParam) ? levelParam : 'moderate')

  const [pattern, setPattern] = useState<PatternInfo | null | undefined>(undefined)
  const [recent, setRecent] = useState<RecentRun[]>([])
  const [attempt, setAttempt] = useState<AttemptView | null>(null)
  const [loadError, setLoadError] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Pattern summary + your recent runs.
  useEffect(() => {
    if (!gate.ready || !patternId) return
    let live = true
    fetch(`/api/company-tests?pattern=${encodeURIComponent(patternId)}`)
      .then((r) => r.json())
      .then((d) => { if (live) setPattern(Array.isArray(d.items) && d.items[0] ? d.items[0] : null) })
      .catch(() => { if (live) setLoadError(t('dashboard.ctLoadFailed')) })
    fetch(`/api/company-tests/attempts?patternId=${encodeURIComponent(patternId)}`)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => { if (live) setRecent(Array.isArray(d.items) ? d.items : []) })
      .catch(() => undefined)
    return () => { live = false }
  }, [gate.ready, patternId])

  // Resume a run from the URL.
  useEffect(() => {
    if (!gate.ready || !attemptParam || attempt?.id === attemptParam) return
    let live = true
    fetch(`/api/company-tests/attempts/${encodeURIComponent(attemptParam)}`)
      .then(async (r) => ({ ok: r.ok, d: await r.json().catch(() => ({})) }))
      .then(({ ok, d }) => {
        if (!live) return
        if (ok && d.attempt) setAttempt(d.attempt)
        else setLoadError(d.error || t('dashboard.ctOpenRunFailed'))
      })
      .catch(() => { if (live) setLoadError(t('dashboard.ctOpenRunFailedRefresh')) })
    return () => { live = false }
  }, [gate.ready, attemptParam, attempt?.id])

  const start = async () => {
    setBusy(true)
    setError('')
    try {
      const res = await csrfFetch('/api/company-tests/attempts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patternId, level }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || !d.attempt) { setError(d.error || t('dashboard.ctStartFailed')); return }
      setAttempt(d.attempt)
      router.replace(`/dashboard/company-tests/${patternId}?attempt=${d.attempt.id}`)
    } catch {
      setError(t('dashboard.ctStartFailedConnection'))
    } finally {
      setBusy(false)
    }
  }

  if (!gate.ready) return <div className="space-y-6"><SkeletonText lines={2} /><SkeletonList count={3} /></div>

  if (loadError) {
    return (
      <Panel className="p-4">
        <EmptyState title={t('errors.somethingWentWrong')} description={loadError} actionLabel={t('dashboard.backToCompanies')} actionHref="/companies" />
      </Panel>
    )
  }

  if (attempt?.status === 'in_progress' && attempt.section) {
    return <SectionRunner key={`${attempt.id}:${attempt.section.id}`} attempt={attempt} onUpdate={setAttempt} />
  }
  if (attempt?.status === 'completed') return <Results attempt={attempt} onRetry={() => { setAttempt(null); router.replace(`/dashboard/company-tests/${patternId}?level=${attempt.level}`) }} />
  if (attemptParam && !attempt) return <div className="space-y-6"><SkeletonText lines={2} /><SkeletonList count={3} /></div>

  if (pattern === undefined) return <div className="space-y-6"><SkeletonText lines={2} /><SkeletonList count={3} /></div>
  if (pattern === null) {
    return (
      <Panel className="p-4">
        <EmptyState variant="search" title={t('dashboard.ctNotAvailable')} description={t('dashboard.ctNotAvailableDesc')} actionLabel={t('dashboard.browseCompanies')} actionHref="/companies" />
      </Panel>
    )
  }

  const levelInfo = pattern.levels.find((l) => l.level === level)
  return (
    <div className="space-y-6">
      <Link href={`/companies/${pattern.companySlug}`} className="inline-flex items-center gap-1.5 rounded text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <ArrowLeft className="h-4 w-4" aria-hidden /> {pattern.companyName}
      </Link>
      <PageHeader
        title={t('dashboard.ctPractisePattern', { exam: pattern.examName })}
        description={t('dashboard.ctPractiseDesc')}
        icon={<Target />}
      />

      {!pattern.verified ? (
        <p className="rounded-xl bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
          {t('dashboard.ctUnverifiedNote')}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={t('assessment.questions')} value={fmt.number(pattern.totals.questions)} icon={<ListChecks />} />
        <StatCard label={t('dashboard.totalTime')} value={t('assessment.minutesShort', { count: pattern.totals.minutes })} icon={<Clock />} />
        <StatCard label={t('dashboard.cutoffLabel')} value={`${pattern.cutoffPercent}%`} icon={<Target />} />
      </div>

      <Panel className="space-y-4 p-5">
        <h2 className="text-base font-semibold text-foreground">{t('assessment.sections')}</h2>
        <ol className="space-y-2">
          {pattern.sections.map((s, i) => (
            <li key={i} className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2 text-sm">
              <span className="min-w-0 truncate text-foreground"><span className="tabular-nums text-muted-foreground">{i + 1}.</span> {s.name}</span>
              <span className="inline-flex shrink-0 items-center gap-1 tabular-nums text-muted-foreground"><Timer className="h-3.5 w-3.5" aria-hidden />{t('assessment.questionsCount', { count: s.questionCount })} · {t('assessment.minutesShort', { count: s.timeMinutes })}</span>
            </li>
          ))}
        </ol>
        <p className="text-sm text-muted-foreground">
          {pattern.negativeMarking > 0 ? t('dashboard.ctNegativeMarking', { mark: pattern.negativeMarking }) : t('dashboard.ctNoNegative')}
          {' '}{t('dashboard.ctCantGoBack')}
        </p>
      </Panel>

      <Panel className="space-y-4 p-5">
        <h2 id="level-heading" className="text-base font-semibold text-foreground">{t('dashboard.chooseLevel')}</h2>
        <div role="radiogroup" aria-labelledby="level-heading" className="flex flex-wrap gap-2">
          {PRACTICE_LEVELS.map((l) => {
            const info = pattern.levels.find((x) => x.level === l)
            const on = l === level
            return (
              <button
                key={l}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={!info?.ready}
                onClick={() => setLevel(l)}
                className={cn(
                  'min-h-11 rounded-full border px-5 text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
                  on ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground hover:border-primary/50',
                )}
              >
                {levelText(td, l)}{info?.ready ? '' : ` · ${t('dashboard.comingSoon')}`}
              </button>
            )
          })}
        </div>
        {levelInfo?.ready && !levelInfo.complete ? (
          <p className="text-sm text-muted-foreground">{t('dashboard.ctLevelIncomplete')}</p>
        ) : null}
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <Button className="min-h-11" disabled={busy || !levelInfo?.ready} onClick={() => void start()}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
          {t('dashboard.ctStartLevel', { level: levelText(td, level) })}
        </Button>
      </Panel>

      {recent.length ? (
        <Panel className="space-y-3 p-5">
          <h2 className="text-base font-semibold text-foreground">{t('dashboard.recentRuns')}</h2>
          <ul className="divide-y divide-border">
            {recent.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span className="text-foreground">{levelText(td, r.level)} · <span className="text-muted-foreground">{fmt.dateTime(r.createdAt)}</span></span>
                <span className="flex items-center gap-2">
                  {r.status === 'completed' ? (
                    <Badge variant="outline" className={r.result?.passed ? 'border-green-500/40 text-green-700 dark:text-green-400' : ''}>
                      <span className="tabular-nums">{r.result?.percent ?? 0}%</span>{r.result?.passed ? ` · ${t('dashboard.cleared')}` : ''}
                    </Badge>
                  ) : <Badge variant="secondary">{t('assessment.secInProgress')}</Badge>}
                  <Link href={`/dashboard/company-tests/${patternId}?attempt=${r.id}`} className="rounded font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {r.status === 'completed' ? t('dashboard.review') : t('dashboard.resume')}
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  )
}

function SectionRunner({ attempt, onUpdate }: { attempt: AttemptView; onUpdate: (a: AttemptView) => void }) {
  const section = attempt.section!
  const { t, td, fmt } = useT()
  const key = draftKey(attempt.id, section.id)
  const [answers, setAnswers] = useState<Answers>(() => (typeof window === 'undefined' ? {} : readDraft(key)))
  const [index, setIndex] = useState(0)
  const [confirm, setConfirm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  // Server time offset, so a wrong device clock can't stretch the section.
  const skew = useMemo(() => new Date(attempt.serverNow).getTime() - Date.now(), [attempt.serverNow])
  const deadline = section.deadline ? new Date(section.deadline).getTime() : null
  const [now, setNow] = useState(() => Date.now() + skew)
  const sent = useRef(false)

  const submit = useCallback(async (auto: boolean) => {
    if (sent.current) return
    sent.current = true
    setSubmitting(true)
    setError('')
    try {
      const res = await csrfFetch(`/api/company-tests/attempts/${attempt.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sectionId: section.id, answers }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok && d.attempt) {
        clearDraft(key)
        onUpdate(d.attempt)
        return
      }
      // Already closed on the server (timer ran out): load the current state.
      if (res.status === 409) {
        const g = await fetch(`/api/company-tests/attempts/${attempt.id}`).then((r) => r.json()).catch(() => ({}))
        if (g.attempt) { clearDraft(key); onUpdate(g.attempt); return }
      }
      sent.current = false
      setError(d.error || (auto ? t('dashboard.ctAutoSubmitFailed') : t('dashboard.ctSubmitFailed')))
    } catch {
      sent.current = false
      setError(t('errors.serverUnreachable'))
    } finally {
      setSubmitting(false)
    }
  }, [answers, attempt.id, key, onUpdate, section.id, t])

  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now() + skew), 1000)
    return () => clearInterval(iv)
  }, [skew])

  const left = deadline ? deadline - now : null
  useEffect(() => {
    if (left !== null && left <= 0) void submit(true)
  }, [left, submit])

  const setAnswer = (qid: string, v: string | string[]) => {
    setAnswers((prev) => {
      const next = { ...prev, [qid]: v }
      writeDraft(key, next)
      return next
    })
  }

  const q = section.questions[index]
  const answered = section.questions.filter((x) => {
    const v = answers[x.id]
    return Array.isArray(v) ? v.length > 0 : !!String(v ?? '').trim()
  }).length
  const lowTime = left !== null && left < 60_000

  return (
    <div className="space-y-5">
      <div className="sticky top-0 z-10 -mx-4 border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-xs text-muted-foreground">{attempt.examName} · {levelText(td, attempt.level)} · {t('dashboard.sectionNofMLower', { n: attempt.current + 1, m: attempt.sections.length })}</p>
            <h1 className="truncate text-lg font-semibold text-foreground">{section.name}</h1>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-sm tabular-nums', lowTime ? 'bg-red-500/10 text-red-700 dark:text-red-400' : 'bg-muted text-foreground')}
              aria-label={left !== null ? t('dashboard.timeLeftInSection', { time: fmtClock(left) }) : t('assessment.noTimeLimit')}
              role="timer"
            >
              <Clock className="h-4 w-4" aria-hidden />{left !== null ? fmtClock(left) : '—'}
            </span>
            <Button className="min-h-11" disabled={submitting} onClick={() => setConfirm(true)}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
              {t('dashboard.submitSection')}
            </Button>
          </div>
        </div>
        {error ? <p role="alert" className="mt-2 text-sm text-destructive">{error} <button type="button" className="font-semibold underline" onClick={() => void submit(false)}>{t('common.retry')}</button></p> : null}
      </div>

      {attempt.incomplete && attempt.current === 0 ? (
        <p className="text-sm text-muted-foreground">{t('dashboard.ctVersionIncomplete')}</p>
      ) : null}

      <nav aria-label={t('dashboard.questionsInSection')} className="flex flex-wrap gap-2">
        {section.questions.map((x, i) => {
          const v = answers[x.id]
          const done = Array.isArray(v) ? v.length > 0 : !!String(v ?? '').trim()
          return (
            <button
              key={x.id}
              type="button"
              onClick={() => setIndex(i)}
              aria-current={i === index ? 'step' : undefined}
              aria-label={done ? t('dashboard.questionNAnswered', { n: i + 1 }) : t('assessment.questionN', { n: i + 1 })}
              className={cn(
                'h-10 min-w-10 rounded-lg border px-2 text-sm tabular-nums transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                i === index ? 'border-primary bg-primary text-primary-foreground' : done ? 'border-primary/40 bg-primary/10 text-foreground' : 'border-border bg-card text-muted-foreground',
              )}
            >
              {i + 1}
            </button>
          )
        })}
      </nav>

      {q ? (
        <Panel className="space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="tabular-nums">{t('assessment.questionNofM', { n: index + 1, m: section.questions.length })}</span>
            <span aria-hidden>·</span>
            <span className="tabular-nums">{t('dashboard.marksCount', { count: q.marks })}</span>
          </div>
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">{q.prompt}</p>
          <QuestionAnswerInput question={q} value={answers[q.id]} onChange={(v) => setAnswer(q.id, v)} />
          <div className="flex justify-between gap-2 pt-2">
            <Button variant="outline" className="min-h-11" disabled={index === 0} onClick={() => setIndex((i) => Math.max(0, i - 1))}>{t('common.previous')}</Button>
            {index < section.questions.length - 1
              ? <Button variant="outline" className="min-h-11" onClick={() => setIndex((i) => i + 1)}>{t('common.next')}</Button>
              : <Button className="min-h-11" disabled={submitting} onClick={() => setConfirm(true)}>{t('dashboard.submitSection')}</Button>}
          </div>
        </Panel>
      ) : null}

      <ConfirmDialog
        open={confirm}
        title={t('dashboard.submitSectionTitle')}
        message={t('dashboard.submitSectionBody', { n: fmt.number(answered), m: fmt.number(section.questions.length) })}
        confirmLabel={t('common.submit')}
        variant="default"
        onConfirm={() => { setConfirm(false); void submit(false) }}
        onCancel={() => setConfirm(false)}
      />
    </div>
  )
}

function Results({ attempt, onRetry }: { attempt: AttemptView; onRetry: () => void }) {
  const r = attempt.result
  const { t, td } = useT()
  const statusText = (st: string) => td(`dashboard.qstatus:${st}`, STATUS_LABEL[st] ?? st)
  const [open, setOpen] = useState<string | null>(attempt.review?.[0]?.id ?? null)
  if (!r) return null
  return (
    <div className="space-y-6">
      <PageHeader
        title={`${attempt.examName} · ${levelText(td, attempt.level)}`}
        description={r.passed ? t('dashboard.ctPassedAll') : t('dashboard.ctCompareSections')}
        icon={r.passed ? <CheckCircle2 /> : <Target />}
        actions={<Button variant="outline" className="min-h-11" onClick={onRetry}>{t('common.tryAgain')}</Button>}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={t('dashboard.overallScore')} value={`${r.percent}%`} icon={<Target />} />
        <StatCard label={t('dashboard.cutoffLabel')} value={`${r.cutoffPercent}%`} icon={<ListChecks />} />
        <StatCard label={t('dashboard.marks')} value={`${r.score} / ${r.max}`} icon={<CheckCircle2 />} />
      </div>
      {attempt.negativeMarking > 0 ? <p className="text-sm text-muted-foreground">{t('dashboard.negativeApplied', { mark: attempt.negativeMarking })}</p> : null}

      <Panel className="overflow-x-auto p-0">
        <table className="w-full min-w-[560px] text-sm">
          <caption className="sr-only">{t('dashboard.scorePerSectionCaption')}</caption>
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="border-b border-border">
              <th scope="col" className="px-4 py-3 font-medium">{t('assessment.section')}</th>
              <th scope="col" className="px-4 py-3 font-medium">{t('dashboard.score')}</th>
              <th scope="col" className="px-4 py-3 font-medium">{t('dashboard.cutoffLabel')}</th>
              <th scope="col" className="px-4 py-3 font-medium">{t('dashboard.rightWrongBlank')}</th>
              <th scope="col" className="px-4 py-3 font-medium">{t('dashboard.result')}</th>
            </tr>
          </thead>
          <tbody>
            {r.sections.map((s) => (
              <tr key={s.id} className="border-b border-border last:border-0">
                <th scope="row" className="px-4 py-3 text-left font-medium text-foreground">{s.name}{s.late ? <span className="block text-xs font-normal text-amber-700 dark:text-amber-400">{t('dashboard.timeRanOutBeforeSubmit')}</span> : null}</th>
                <td className="px-4 py-3 tabular-nums text-foreground">{s.percent}% <span className="text-muted-foreground">({s.score}/{s.max})</span></td>
                <td className="px-4 py-3 tabular-nums text-muted-foreground">{s.cutoffPercent}%</td>
                <td className="px-4 py-3 tabular-nums text-muted-foreground">{s.correct} / {s.wrong} / {s.unanswered}</td>
                <td className="px-4 py-3">
                  {s.passed
                    ? <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-400"><CheckCircle2 className="h-4 w-4" aria-hidden />{t('dashboard.clearedCap')}</span>
                    : <span className="inline-flex items-center gap-1 text-red-700 dark:text-red-400"><XCircle className="h-4 w-4" aria-hidden />{t('dashboard.belowCutoff')}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <section aria-labelledby="review-heading" className="space-y-3">
        <h2 id="review-heading" className="text-lg font-semibold text-foreground">{t('dashboard.reviewCap')}</h2>
        {(attempt.review ?? []).map((s) => (
          <Panel key={s.id} className="p-0">
            <button
              type="button"
              aria-expanded={open === s.id}
              onClick={() => setOpen(open === s.id ? null : s.id)}
              className="flex min-h-11 w-full items-center justify-between gap-3 rounded-3xl px-5 py-3 text-left font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {s.name}<span className="text-xs text-muted-foreground tabular-nums">{t('assessment.questionsCount', { count: s.questions.length })}</span>
            </button>
            {open === s.id ? (
              <ol className="space-y-4 border-t border-border px-5 py-4">
                {s.questions.map((q, i) => (
                  <li key={q.id} className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="tabular-nums text-muted-foreground">Q{i + 1}</span>
                      <Badge variant="outline" className={q.status === 'correct' ? 'border-green-500/40 text-green-700 dark:text-green-400' : q.status === 'wrong' ? 'border-red-500/40 text-red-700 dark:text-red-400' : ''}>
                        {statusText(q.status)}
                      </Badge>
                      <span className="tabular-nums text-muted-foreground">{q.awarded > 0 ? '+' : ''}{q.awarded}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-foreground">{q.prompt}</p>
                    <p className="text-sm"><span className="text-muted-foreground">{t('dashboard.yourAnswer')} </span><span className="whitespace-pre-wrap font-medium text-foreground">{q.yourAnswer || '—'}</span></p>
                    {q.answer ? <p className="text-sm"><span className="text-muted-foreground">{t('dashboard.correctAnswer')} </span><span className="whitespace-pre-wrap font-medium text-foreground">{q.answer}</span></p> : null}
                    {q.explanation ? <p className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">{q.explanation}</p> : null}
                  </li>
                ))}
              </ol>
            ) : null}
          </Panel>
        ))}
      </section>
      <Link href={`/companies/${attempt.companySlug}`} className="inline-flex items-center gap-1.5 rounded text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <ArrowLeft className="h-4 w-4" aria-hidden /> {t('dashboard.backTo', { name: attempt.companyName })}
      </Link>
    </div>
  )
}
