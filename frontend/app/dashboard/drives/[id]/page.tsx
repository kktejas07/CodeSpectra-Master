'use client'

/**
 * Candidate side of a live drive: lobby (system check + consent + countdown
 * to the shared start), then the test with a server-owned clock, auto-save
 * every N seconds, heartbeats, invigilator messages, pause / lock / end
 * states, and resume after a reconnect (answers come back from the server).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { AlertTriangle, ArrowLeft, Camera, CheckCircle2, Clock, Loader2, Megaphone, PauseCircle, Wifi, XCircle } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { csrfFetch } from '@/lib/csrf-fetch'
import { PageHeader, Panel } from '@/components/app/page-kit'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { SkeletonText } from '@/components/ui/skeleton-boneyard'
import { QuestionAnswerInput, type AnswerQuestion } from '@/components/assessment/QuestionAnswerInput'
import { IntegrityConsent, useIntegrityConfig } from '@/components/integrity/IntegrityConsent'
import { IntegrityMonitor } from '@/components/integrity/IntegrityMonitor'
import { usePoll } from '@/lib/live-drives/use-poll'
import { useT } from '@/lib/i18n/client'
import { useApiError } from '@/lib/i18n/use-api-error'
import { cn } from '@/lib/utils'

interface SessionView {
  drive: {
    id: string; title: string; organiser: string; exam_name: string; company_name: string
    schedule: { start_at: string; duration_min: number; lobby_open_min: number; late_join_min: number }
    status: string; join: 'draft' | 'too_early' | 'lobby' | 'open' | 'closed' | 'ended'
    rules: { autosave_sec: number; heartbeat_sec: number; reconnect_window_min: number; min_mbps: number; require_camera: boolean }
  }
  server_now: string
  me: {
    state: 'not_started' | 'in_progress' | 'paused' | 'submitted' | 'terminated'
    system_check: { passed: boolean; failures: string[] } | null
    started_at: string | null; submitted_at: string | null; auto_submitted: boolean
    deadline: string | null; remaining_ms: number | null; paused: boolean; locked: boolean; answered: number; save_seq: number
    terminated_reason: string | null; result: { percent: number; passed: boolean } | null
    answers?: Record<string, string>
  }
  inbox: { id: string; kind: 'warning' | 'notice'; text: string; at: string }[]
  broadcasts: { id: string; text: string; at: string }[]
}
type Question = AnswerQuestion & { marks: number }
interface Section { id: string; name: string; questions: Question[] }
type Answers = Record<string, string | string[]>

const backupKey = (id: string) => `codespectra_live_drive_${id}`
const readBackup = (id: string): Answers => { try { return JSON.parse(localStorage.getItem(backupKey(id)) || '{}') as Answers } catch { return {} } }
const writeBackup = (id: string, a: Answers) => { try { localStorage.setItem(backupKey(id), JSON.stringify(a)) } catch { /* storage blocked */ } }
const asText = (v: string | string[] | undefined) => (Array.isArray(v) ? v.join(', ') : String(v ?? ''))

function fmtClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const pad = (n: number) => String(n).padStart(2, '0')
  return h ? `${h}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}` : `${pad(Math.floor(s / 60))}:${pad(s % 60)}`
}

export default function DriveCandidatePage() {
  const gate = usePageGuard('user')
  const { t } = useT()
  const apiError = useApiError()
  const params = useParams<{ id: string }>()
  const id = String(params?.id || '')
  const [view, setView] = useState<SessionView | null>(null)
  const [error, setError] = useState('')
  const [missing, setMissing] = useState(false)
  const [skew, setSkew] = useState(0)
  const [messages, setMessages] = useState<{ id: string; text: string; kind: string; at: string }[]>([])
  const since = useRef(0)

  const absorb = useCallback((v: SessionView) => {
    setSkew(Date.parse(v.server_now) - Date.now())
    const fresh = [...v.inbox.map((m) => ({ ...m })), ...v.broadcasts.map((b) => ({ ...b, kind: 'broadcast' }))]
    if (fresh.length) {
      setMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id))
        return [...fresh.filter((m) => !seen.has(m.id)), ...prev].slice(0, 20)
      })
      since.current = Math.max(since.current, ...fresh.map((m) => Date.parse(m.at)))
    }
    setView(v)
  }, [])

  const load = useCallback(async (withAnswers = false) => {
    const r = await fetch(`/api/live-drives/${id}/session?since=${since.current}${withAnswers ? '&answers=1' : ''}`, { credentials: 'include', cache: 'no-store' })
    const j = await r.json().catch(() => null)
    if (r.status === 404) { setMissing(true); setError(apiError(j)); return null }
    if (!r.ok) { setError(apiError(j)); return null }
    setError('')
    absorb(j)
    return j as SessionView
  }, [id, apiError, absorb])

  useEffect(() => { if (gate.ready && id) void load(true) }, [gate.ready, id, load])

  const op = useCallback(async (body: Record<string, unknown>) => {
    const r = await csrfFetch(`/api/live-drives/${id}/session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ since: since.current, ...body }) })
    const j = await r.json().catch(() => null)
    if (!r.ok) throw new Error(apiError(j))
    absorb(j)
    return j as SessionView
  }, [id, apiError, absorb])

  if (!gate.ready) return null
  if (missing) return <EmptyState title={t('career.ldNotOnDrive')} description={error} actionLabel={t('career.ldMyDrives')} actionHref="/dashboard/drives" />
  if (!view) return error ? <p role="alert" className="text-sm text-destructive">{error} <button type="button" className="font-semibold underline" onClick={() => void load(true)}>{t('common.retry')}</button></p> : <SkeletonText />

  const { me, drive } = view
  return (
    <div className="space-y-5">
      <Link href="/dashboard/drives" className="inline-flex items-center gap-1.5 rounded text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <ArrowLeft className="h-4 w-4" aria-hidden />{t('career.ldMyDrives')}
      </Link>
      <Messages items={messages} />
      {me.state === 'not_started' ? <Lobby view={view} skew={skew} op={op} reload={() => load(true)} /> : null}
      {(me.state === 'in_progress' || me.state === 'paused') && !me.locked ? <TestRunner view={view} skew={skew} op={op} reload={load} /> : null}
      {(me.state === 'in_progress' || me.state === 'paused') && me.locked ? (
        <LockedPanel onRetry={() => void load(true)} minutes={drive.rules.reconnect_window_min} />
      ) : null}
      {me.state === 'submitted' || me.state === 'terminated' ? <Finished view={view} /> : null}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </div>
  )
}

function Messages({ items }: { items: { id: string; text: string; kind: string; at: string }[] }) {
  const { t, fmt } = useT()
  if (!items.length) return null
  const top = items.slice(0, 3)
  return (
    <div className="space-y-2" aria-live="assertive">
      {top.map((m) => (
        <div key={m.id} role={m.kind === 'warning' ? 'alert' : 'status'} className={cn('flex gap-3 rounded-2xl border p-3 text-sm', m.kind === 'warning' ? 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400' : 'border-primary/30 bg-primary/10 text-foreground')}>
          {m.kind === 'warning' ? <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden /> : <Megaphone className="h-5 w-5 shrink-0 text-primary" aria-hidden />}
          <p><span className="font-semibold">{m.kind === 'warning' ? t('career.ldWarningFrom') : m.kind === 'notice' ? t('career.ldNoticeFrom') : t('career.ldAnnouncement')}</span> {m.text} <span className="text-xs text-muted-foreground">· {fmt.relative(m.at)}</span></p>
        </div>
      ))}
    </div>
  )
}

function Lobby({ view, skew, op, reload }: { view: SessionView; skew: number; op: (b: Record<string, unknown>) => Promise<SessionView>; reload: () => Promise<unknown> }) {
  const { t, td, fmt } = useT()
  const { drive, me } = view
  const { config } = useIntegrityConfig('drive', drive.id)
  const [consent, setConsent] = useState(false)
  const [checking, setChecking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [now, setNow] = useState(() => Date.now() + skew)
  const [report, setReport] = useState<{ camera: boolean; mic: boolean; mbps: number | null; browser_ok: boolean } | null>(null)

  useEffect(() => { const iv = setInterval(() => setNow(Date.now() + skew), 1000); return () => clearInterval(iv) }, [skew])
  // Refresh the join window while waiting (cheap GET, slow when hidden).
  usePoll(async () => { await reload(); return true }, 20_000, true)

  const start = Date.parse(drive.schedule.start_at)
  const toStart = start - now
  const open = toStart <= 0 && now <= start + drive.schedule.late_join_min * 60_000
  const needsConsent = !!config?.enabled
  const camera = drive.rules.require_camera || !!(config?.enabled && config.signals.some((s) => s === 'face_count' || s === 'looking_away'))

  const runCheck = async () => {
    setChecking(true)
    setErr('')
    let cam = false
    let mic = false
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: camera, audio: true })
      cam = stream.getVideoTracks().length > 0
      mic = stream.getAudioTracks().length > 0
      stream.getTracks().forEach((tr) => tr.stop())
    } catch {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true })
        mic = s.getAudioTracks().length > 0
        s.getTracks().forEach((tr) => tr.stop())
      } catch { /* no mic */ }
    }
    // Network: measured download of a small no-store request, else the browser's estimate.
    let mbps: number | null = null
    try {
      const t0 = performance.now()
      const r = await fetch(`/api/live-drives/${drive.id}/session?since=${Date.now()}`, { cache: 'no-store', credentials: 'include' })
      const bytes = (await r.arrayBuffer()).byteLength
      const sec = (performance.now() - t0) / 1000
      const estimate = (navigator as Navigator & { connection?: { downlink?: number } }).connection?.downlink
      mbps = typeof estimate === 'number' ? estimate : sec > 0 ? Math.round(((bytes * 8) / sec / 1e6) * 10) / 10 : null
    } catch { mbps = null }
    const browser_ok = typeof fetch === 'function' && typeof Promise !== 'undefined' && 'visibilityState' in document && typeof window.localStorage !== 'undefined'
    const rep = { camera: cam, mic, mbps, browser_ok }
    setReport(rep)
    try { await op({ op: 'check', ...rep }) } catch (e) { setErr(e instanceof Error ? e.message : t('career.ldCheckFailed')) }
    setChecking(false)
  }

  const begin = async () => {
    setBusy(true)
    setErr('')
    try { await op({ op: 'start' }) } catch (e) { setErr(e instanceof Error ? e.message : t('career.ldStartFailed')) } finally { setBusy(false) }
  }

  const ok = me.system_check?.passed
  const row = (label: string, good: boolean | null, icon: React.ReactNode) => (
    <li className="flex items-center gap-3 text-sm">
      <span aria-hidden className="text-muted-foreground">{icon}</span>
      <span className="flex-1 text-foreground">{label}</span>
      {good === null ? <span className="text-muted-foreground">—</span> : good ? <CheckCircle2 className="h-5 w-5 text-green-700 dark:text-green-400" aria-label={t('career.ldOk')} /> : <XCircle className="h-5 w-5 text-red-700 dark:text-red-400" aria-label={t('career.ldNotOk')} />}
    </li>
  )

  return (
    <div className="space-y-5">
      <PageHeader title={drive.title} description={`${drive.organiser} · ${drive.exam_name} · ${t('career.ldMinutes', { count: drive.schedule.duration_min })}`} icon={<Clock />} />
      <Panel className="space-y-2 p-5 text-center">
        <p className="text-sm text-muted-foreground">{t('career.ldStartsAt', { when: fmt.dateTime(drive.schedule.start_at) })}</p>
        {drive.join === 'closed' || drive.join === 'ended' ? (
          <p className="text-lg font-semibold text-foreground">{t('career.ldEntryClosed')}</p>
        ) : toStart > 0 ? (
          <p className="font-mono text-4xl font-semibold tabular-nums text-foreground" role="timer" aria-label={t('career.ldStartsIn', { time: fmtClock(toStart) })}>{fmtClock(toStart)}</p>
        ) : (
          <p className="text-lg font-semibold text-green-700 dark:text-green-400">{t('career.ldStartedJoinNow', { minutes: drive.schedule.late_join_min })}</p>
        )}
        {drive.join === 'too_early' ? <p className="text-sm text-muted-foreground">{t('career.ldLobbyOpensAt', { minutes: drive.schedule.lobby_open_min })}</p> : null}
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel className="space-y-4 p-5">
          <h2 className="text-base font-semibold text-foreground">{t('career.ldSystemCheck')}</h2>
          <ul className="space-y-3">
            {row(camera ? t('career.ldCameraNeeded') : t('career.ldCameraOptional'), report ? report.camera || !camera : null, <Camera className="h-5 w-5" />)}
            {row(t('career.ldMicrophone'), report ? report.mic : null, <Megaphone className="h-5 w-5" />)}
            {row(t('career.ldNetwork', { min: drive.rules.min_mbps }), report ? report.mbps === null || report.mbps >= drive.rules.min_mbps : null, <Wifi className="h-5 w-5" />)}
            {row(t('career.ldBrowser'), report ? report.browser_ok : null, <CheckCircle2 className="h-5 w-5" />)}
          </ul>
          {report?.mbps != null ? <p className="text-xs tabular-nums text-muted-foreground">{t('career.ldMeasured', { mbps: report.mbps })}</p> : null}
          {me.system_check && !me.system_check.passed ? <p role="alert" className="text-sm text-destructive">{t('career.ldCheckProblems', { list: me.system_check.failures.map((f) => td(`career.ldCheck:${f}`, f)).join(', ') })}</p> : null}
          <Button variant={ok ? 'outline' : 'default'} className="min-h-11" disabled={checking} onClick={() => void runCheck()}>
            {checking ? <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
            {ok ? t('career.ldCheckAgain') : t('career.ldRunCheck')}
          </Button>
        </Panel>
        <Panel className="space-y-4 p-5">
          <h2 className="text-base font-semibold text-foreground">{t('career.ldBeforeYouStart')}</h2>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
            <li>{t('career.ldRuleClock', { minutes: drive.schedule.duration_min })}</li>
            <li>{t('career.ldRuleAutosave', { seconds: drive.rules.autosave_sec })}</li>
            <li>{t('career.ldRuleReconnect', { minutes: drive.rules.reconnect_window_min })}</li>
          </ul>
          {config && needsConsent ? <IntegrityConsent config={config} checked={consent} onChange={setConsent} id="ld-consent" /> : null}
          {err ? <p role="alert" className="text-sm text-destructive">{err}</p> : null}
          <Button className="min-h-11 w-full" disabled={busy || !ok || !open || (needsConsent && !consent)} onClick={() => void begin()}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
            {t('career.ldStartTest')}
          </Button>
          {!ok ? <p className="text-xs text-muted-foreground">{t('career.ldCheckFirst')}</p> : !open && toStart > 0 ? <p className="text-xs text-muted-foreground">{t('career.ldWaitForStart')}</p> : null}
        </Panel>
      </div>
    </div>
  )
}

function TestRunner({ view, skew, op, reload }: { view: SessionView; skew: number; op: (b: Record<string, unknown>) => Promise<SessionView>; reload: (withAnswers?: boolean) => Promise<SessionView | null> }) {
  const { t, fmt } = useT()
  const apiError = useApiError()
  const { drive, me } = view
  const { config } = useIntegrityConfig('drive', drive.id)
  const [sections, setSections] = useState<Section[] | null>(null)
  const [paperErr, setPaperErr] = useState('')
  const [sec, setSec] = useState(0)
  const [idx, setIdx] = useState(0)
  const [answers, setAnswers] = useState<Answers>(() => ({ ...(me.answers ?? {}), ...readBackup(drive.id) }))
  const [now, setNow] = useState(() => Date.now() + skew)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'offline'>('idle')
  const [confirm, setConfirm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const dirty = useRef<Set<string>>(new Set())
  const seq = useRef(me.save_seq || 0)
  const autoSubmitted = useRef(false)

  // Server answers win over an older local backup only where the backup is empty.
  useEffect(() => {
    if (me.answers) setAnswers((prev) => ({ ...me.answers, ...Object.fromEntries(Object.entries(prev).filter(([, v]) => asText(v).trim())) }))
  }, [me.answers])

  useEffect(() => {
    fetch(`/api/live-drives/${drive.id}/paper`, { credentials: 'include', cache: 'no-store' })
      .then(async (r) => { const j = await r.json().catch(() => null); if (!r.ok) throw new Error(apiError(j)); setSections(j.sections) })
      .catch((e) => setPaperErr(e instanceof Error ? e.message : t('career.ldPaperFailed')))
  }, [drive.id, apiError, t])

  useEffect(() => { const iv = setInterval(() => setNow(Date.now() + skew), 1000); return () => clearInterval(iv) }, [skew])

  const save = useCallback(async () => {
    const ids = [...dirty.current]
    if (!ids.length) {
      await op({ op: 'heartbeat' })
      return true
    }
    seq.current += 1
    const patch = Object.fromEntries(ids.map((k) => [k, asText(answers[k])]))
    setSaveState('saving')
    try {
      await op({ op: 'save', seq: seq.current, answers: patch })
      ids.forEach((k) => dirty.current.delete(k))
      setSaveState('saved')
      return true
    } catch {
      setSaveState('offline')
      return false
    }
  }, [answers, op])

  const every = Math.max(5, Math.min(drive.rules.autosave_sec, drive.rules.heartbeat_sec)) * 1000
  usePoll(save, every, !submitting)

  const deadline = me.deadline ? Date.parse(me.deadline) : null
  const left = deadline !== null ? (me.paused ? me.remaining_ms ?? 0 : deadline - now) : null

  const submit = useCallback(async () => {
    setSubmitting(true)
    seq.current += 1
    try {
      await op({ op: 'submit', seq: seq.current, answers: Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, asText(v)])) })
      try { localStorage.removeItem(backupKey(drive.id)) } catch { /* ignore */ }
    } catch {
      setSaveState('offline')
      setSubmitting(false)
      await reload()
    }
  }, [answers, op, drive.id, reload])

  useEffect(() => {
    if (left !== null && left <= 0 && !me.paused && !autoSubmitted.current) { autoSubmitted.current = true; void submit() }
  }, [left, me.paused, submit])

  const setAnswer = (qid: string, v: string | string[]) => {
    dirty.current.add(qid)
    setAnswers((prev) => { const next = { ...prev, [qid]: v }; writeBackup(drive.id, next); return next })
  }

  const all = useMemo(() => sections?.flatMap((s) => s.questions) ?? [], [sections])
  const answered = all.filter((q) => asText(answers[q.id]).trim()).length
  if (paperErr) return <p role="alert" className="text-sm text-destructive">{paperErr}</p>
  if (!sections) return <SkeletonText />
  const section = sections[sec]
  const q = section?.questions[idx]
  const low = left !== null && left < 5 * 60_000

  return (
    <div className="space-y-5">
      {config?.enabled ? <IntegrityMonitor kind="drive" targetId={drive.id} config={config} active={me.state === 'in_progress'} /> : null}
      <div className="sticky top-0 z-10 -mx-4 border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-xs text-muted-foreground">{drive.title}</p>
            <p className="text-sm tabular-nums text-muted-foreground">{t('career.ldAnsweredOf', { n: fmt.number(answered), m: fmt.number(all.length) })} · <span aria-live="polite">{saveState === 'saving' ? t('common.saving') : saveState === 'saved' ? t('career.ldSaved') : saveState === 'offline' ? t('career.ldOffline') : ''}</span></p>
          </div>
          <div className="flex items-center gap-3">
            <span role="timer" aria-label={t('career.ldTimeLeft', { time: left !== null ? fmtClock(left) : '—' })} className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-sm tabular-nums', low ? 'bg-red-500/10 text-red-700 dark:text-red-400' : 'bg-muted text-foreground')}>
              <Clock className="h-4 w-4" aria-hidden />{left !== null ? fmtClock(left) : '—'}
            </span>
            <Button className="min-h-11" disabled={submitting || me.paused} onClick={() => setConfirm(true)}>{t('career.ldSubmitTest')}</Button>
          </div>
        </div>
      </div>

      {me.paused ? (
        <Panel className="flex items-start gap-3 p-5" role="status">
          <PauseCircle className="h-6 w-6 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden />
          <div><p className="font-semibold text-foreground">{t('career.ldPausedTitle')}</p><p className="text-sm text-muted-foreground">{t('career.ldPausedBody')}</p></div>
        </Panel>
      ) : null}

      {sections.length > 1 ? (
        <div role="tablist" aria-label={t('career.ldSections')} className="flex flex-wrap gap-2">
          {sections.map((s, i) => (
            <button key={s.id} type="button" role="tab" aria-selected={i === sec} onClick={() => { setSec(i); setIdx(0) }} className={cn('min-h-11 rounded-full px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', i === sec ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>{s.name}</button>
          ))}
        </div>
      ) : null}

      <nav aria-label={t('career.ldQuestions')} className="flex flex-wrap gap-2">
        {section.questions.map((x, i) => {
          const done = !!asText(answers[x.id]).trim()
          return (
            <button key={x.id} type="button" onClick={() => setIdx(i)} aria-current={i === idx ? 'step' : undefined} aria-label={done ? t('career.ldQuestionAnswered', { n: i + 1 }) : t('career.ldQuestionN', { n: i + 1 })}
              className={cn('h-10 min-w-10 rounded-lg border px-2 text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', i === idx ? 'border-primary bg-primary text-primary-foreground' : done ? 'border-primary/40 bg-primary/10 text-foreground' : 'border-border bg-card text-muted-foreground')}>
              {i + 1}
            </button>
          )
        })}
      </nav>

      {q ? (
        <Panel className="space-y-4 p-5">
          <p className="text-xs tabular-nums text-muted-foreground">{t('career.ldQuestionNofM', { n: idx + 1, m: section.questions.length })} · {t('career.ldMarks', { count: q.marks })}</p>
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">{q.prompt}</p>
          <fieldset disabled={me.paused} data-integrity-q={q.id}>
            <QuestionAnswerInput question={q} value={answers[q.id]} onChange={(v) => setAnswer(q.id, v)} />
          </fieldset>
          <div className="flex justify-between gap-2 pt-2">
            <Button variant="outline" className="min-h-11" disabled={idx === 0} onClick={() => setIdx((i) => i - 1)}>{t('common.previous')}</Button>
            <Button variant="outline" className="min-h-11" disabled={idx >= section.questions.length - 1} onClick={() => setIdx((i) => i + 1)}>{t('common.next')}</Button>
          </div>
        </Panel>
      ) : null}

      <ConfirmDialog
        open={confirm}
        title={t('career.ldSubmitTitle')}
        message={t('career.ldSubmitBody', { n: fmt.number(answered), m: fmt.number(all.length) })}
        confirmLabel={t('common.submit')}
        variant="default"
        onConfirm={() => { setConfirm(false); void submit() }}
        onCancel={() => setConfirm(false)}
      />
    </div>
  )
}

function LockedPanel({ onRetry, minutes }: { onRetry: () => void; minutes: number }) {
  const { t } = useT()
  return (
    <Panel className="space-y-3 p-5" role="alert">
      <h2 className="text-lg font-semibold text-foreground">{t('career.ldLockedTitle')}</h2>
      <p className="text-sm text-muted-foreground">{t('career.ldLockedBody', { minutes })}</p>
      <Button className="min-h-11" onClick={onRetry}>{t('career.ldCheckAgain')}</Button>
    </Panel>
  )
}

function Finished({ view }: { view: SessionView }) {
  const { t, fmt } = useT()
  const { me, drive } = view
  return (
    <Panel className="space-y-3 p-6 text-center">
      {me.state === 'terminated' ? <XCircle className="mx-auto h-10 w-10 text-red-700 dark:text-red-400" aria-hidden /> : <CheckCircle2 className="mx-auto h-10 w-10 text-green-700 dark:text-green-400" aria-hidden />}
      <h1 className="text-xl font-semibold text-foreground">{me.state === 'terminated' ? t('career.ldEndedByInvigilator') : t('career.ldSubmittedTitle')}</h1>
      <p className="text-sm text-muted-foreground">{drive.title}{me.submitted_at ? ` · ${fmt.dateTime(me.submitted_at)}` : ''}</p>
      {me.terminated_reason ? <p className="text-sm text-foreground">{t('career.ldReason', { reason: me.terminated_reason })}</p> : null}
      {me.auto_submitted && me.state === 'submitted' ? <p className="text-sm text-muted-foreground">{t('career.ldAutoSubmitted')}</p> : null}
      {me.result
        ? <p className="text-lg font-semibold text-foreground">{t('career.ldResultLine', { percent: me.result.percent, verdict: me.result.passed ? t('career.ldCleared') : t('career.ldNotCleared') })}</p>
        : <p className="text-sm text-muted-foreground">{t('career.ldResultsLater')}</p>}
    </Panel>
  )
}
