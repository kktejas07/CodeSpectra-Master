'use client'

/**
 * One application in full: profile, parsed résumé, match breakdown, stage
 * panels (assessment, bot screen calls, interviews), timeline and actions.
 * Used by the board drawer and /dashboard/hiring/candidates/[id].
 */
import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowRightLeft, Ban, CalendarPlus, CheckCircle2, ExternalLink, FileText, Hourglass, Loader2, Mail, MapPin,
  MessageSquare, Pause, Phone, Play, RefreshCcw, XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/lib/toast-context'
import { useLocaleDates } from '@/lib/i18n/use-dates'
import { cn } from '@/lib/utils'
import type { AtsApplication, AtsCandidate, AtsInterview, PipelineStage, ScreeningCall } from '@/lib/ats/contract'
import { atsSend, errorMessage, useAts } from './lib/api'
import type { ApplicationDetail } from './lib/types'
import { buildTimeline } from './lib/timeline'
import { ActionDialog, approveMove, clientDecision, setApplicationStatus, type ActionRequest } from './actions'
import { APP_STATUS_LABELS, CHANNEL_LABELS, MATCH_WEIGHT_LABELS, PROVIDER_LABELS, SOURCE_LABELS, daysSince, durationLabel, initials, timeAgo } from './lib/labels'
import { MatchScore, Segmented } from './ui'
import { CompensationCard, HrRoundPanel } from './hr-round'
import { BgvPanel } from '@/components/hiring/bgv'
import { canSeeCompensation } from '@/lib/ats/compensation'
import { useT } from '@/lib/i18n/client'

type Tab = 'overview' | 'stages' | 'timeline' | 'resume'

const enc = encodeURIComponent

/** Placeholder when the API hides the candidate from this viewer. */
function hiddenCandidate(app: AtsApplication): AtsCandidate {
  return { id: app.candidate_id, tenant_id: app.tenant_id, name: 'Candidate', email: null, phone: null, tags: [], source: app.source, created_at: app.created_at, updated_at: app.updated_at }
}

export function ApplicationDetailView({ detail, onChanged }: { detail: ApplicationDetail; onChanged: () => void }) {
  const { formatDateTime } = useLocaleDates()
  const { t: tr } = useT()
  const addToast = useToast()
  const { application: app, job } = detail
  const c = detail.candidate ?? hiddenCandidate(app)
  const [tab, setTab] = useState<Tab>('overview')
  const [action, setAction] = useState<ActionRequest | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const stage = job.pipeline.find((s) => s.id === app.stage_id)
  const pendingTo = app.pending_move ? job.pipeline.find((s) => s.id === app.pending_move!.to) : null
  // Calls / interviews come with the application when core includes them; otherwise ask their own APIs.
  const callsQ = useAts<ScreeningCall[]>(detail.calls === undefined ? `/api/ats/screening?application_id=${enc(app.id)}` : null, 'calls')
  const ivQ = useAts<AtsInterview[]>(detail.interviews === undefined ? `/api/ats/interviews?application_id=${enc(app.id)}` : null, 'interviews')
  const full: ApplicationDetail = { ...detail, calls: detail.calls ?? callsQ.data ?? [], interviews: detail.interviews ?? (ivQ.data ?? []).map((i) => ({ ...i, scorecards: i.scorecards ?? [] })) }
  const comments = useAts<CommentDoc[]>(`/api/ats/applications/${enc(app.id)}/comments`, 'comments')
  const timeline = useMemo(
    () => buildTimeline(app, job.pipeline, (comments.data ?? []).map((c) => ({ by: c.author_id, by_name: `${c.author_name}${c.visibility === 'client' ? ' (shared with client)' : ''}`, text: c.body, at: c.created_at }))),
    [app, job.pipeline, comments.data],
  )
  const closed = app.status === 'rejected' || app.status === 'hired' || app.status === 'withdrawn'

  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key)
    try { await fn(); addToast({ type: 'success', title: ok }); onChanged() } catch (e) { addToast({ type: 'error', title: tr('hiring.thatDidntWork'), message: errorMessage(e) }) } finally { setBusy(null) }
  }

  const isInterview = stage?.type === 'virtual_interview' || stage?.type === 'f2f_interview'
  const isBot = stage?.type === 'bot_screen'
  const isScreen = stage?.type === 'screening' || stage?.type === 'applied'
  const isClientReview = stage?.type === 'client_review'
  const role = detail.me?.role
  // Staff with salary access; the API strips compensation for everyone else anyway.
  const seesComp = role ? canSeeCompensation(role) : 'compensation' in app

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <span aria-hidden className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-base font-semibold text-primary">{initials(c.name)}</span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-xl font-bold tracking-tight text-foreground">{c.name || tr('hiring.unnamedCandidate')}</h2>
          <p className="truncate text-sm text-muted-foreground">{c.parsed?.titles?.[0] ?? ''}{c.parsed?.companies?.[0] ? tr('hiring.atValue', { value: c.parsed.companies[0] }) : ''}</p>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {c.email && <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 hover:text-foreground"><Mail className="h-3 w-3" aria-hidden />{c.email}</a>}
            {c.phone && <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 hover:text-foreground"><Phone className="h-3 w-3" aria-hidden />{c.phone}</a>}
            {c.parsed?.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" aria-hidden />{c.parsed.location}</span>}
          </div>
        </div>
        <MatchScore score={app.match?.score} className="text-sm" />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link href={`/dashboard/hiring/jobs/${job.id}`} className="font-medium text-primary hover:underline">{job.title}</Link>
        <span className="text-muted-foreground">·</span>
        <Badge variant="secondary">{stage?.name ?? app.stage_id}</Badge>
        {app.status !== 'active' && <Badge variant={app.status === 'hired' ? 'success' : app.status === 'rejected' ? 'danger' : 'outline'}>{APP_STATUS_LABELS[app.status]}</Badge>}
        <span className="text-xs text-muted-foreground">{tr('hiring.valueInStageVia', { value: durationLabel(daysSince(app.stage_entered_at)) })}{' '}{SOURCE_LABELS[app.source] ?? app.source}</span>
        {c.consent && (
          <span className="text-xs text-muted-foreground">
            · {c.consent.whatsapp || c.consent.calls ? tr('hiring.okToContactByValue', { value: [c.consent.whatsapp && 'WhatsApp', c.consent.calls && 'phone'].filter(Boolean).join(' and ') }) : tr('hiring.noWhatsappOrCalls')}
          </span>
        )}
      </div>

      {app.pending_move && (
        <div className="flex flex-col gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-3 sm:flex-row sm:items-center">
          <Hourglass className="h-5 w-5 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-medium text-foreground">{tr('hiring.suggestedMoveTo')}{' '}{pendingTo?.name ?? app.pending_move.to}</p>
            <p className="text-muted-foreground">{app.pending_move.reason} · {timeAgo(app.pending_move.suggested_at)}</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" disabled={!!busy} onClick={() => run('approve', () => approveMove(app.id, true), 'Move approved')}>
              {busy === 'approve' ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : <CheckCircle2 aria-hidden />}{' '}{tr('hiring.approve')}</Button>
            <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run('decline', () => approveMove(app.id, false), 'Move declined')}>
              <XCircle aria-hidden />{' '}{tr('hiring.decline')}</Button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => setAction({ kind: 'move', ids: [app.id], label: c.name })}><ArrowRightLeft aria-hidden />{' '}{tr('hiring.move')}</Button>
        {isInterview && !closed && (
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run('schedule', () => atsSend('/api/ats/interviews', 'POST', { application_id: app.id, stage_id: app.stage_id }), 'Interview created — pick a time on the interview')}>
            <CalendarPlus aria-hidden />{' '}{tr('hiring.scheduleInterview')}</Button>
        )}
        {isBot && !closed && (
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run('screen', () => atsSend('/api/ats/screening/start', 'POST', { application_id: app.id }), 'Screening restarted')}>
            <RefreshCcw aria-hidden />{' '}{tr('hiring.restartScreening')}</Button>
        )}
        {isClientReview && app.status === 'active' && (
          <>
            <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run('client-approve', () => clientDecision(app.id, 'approve'), 'Client approval recorded')}>
              {busy === 'client-approve' ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : <CheckCircle2 aria-hidden />}{' '}{tr('hiring.clientApproved')}</Button>
            <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run('client-reject', () => clientDecision(app.id, 'reject'), 'Client rejection recorded')}>
              {busy === 'client-reject' ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : <XCircle aria-hidden />}{' '}{tr('hiring.clientRejected')}</Button>
          </>
        )}
        {isScreen && !closed && (
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run('rescreen', () => atsSend(`/api/ats/jobs/${enc(job.id)}/rescreen`, 'POST', { application_ids: [app.id] }), 'Résumé rescreened')}>
            <RefreshCcw aria-hidden />{' '}{tr('hiring.rescreenRSum')}</Button>
        )}
        {app.status === 'active' && (
          <Button size="sm" variant="outline" onClick={() => setAction({ kind: 'hold', ids: [app.id], label: c.name })}><Pause aria-hidden />{' '}{tr('hiring.hold')}</Button>
        )}
        {(app.status === 'on_hold' || app.status === 'rejected') && (
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run('activate', () => setApplicationStatus(app.id, 'active'), 'Back in the pipeline')}><Play aria-hidden />{' '}{tr('hiring.reactivate')}</Button>
        )}
        {app.status !== 'rejected' && app.status !== 'hired' && (
          <Button size="sm" variant="outline" className="text-red-700 hover:text-red-700 dark:text-red-400" onClick={() => setAction({ kind: 'reject', ids: [app.id], label: c.name })}><Ban aria-hidden />{' '}{tr('hiring.reject')}</Button>
        )}
      </div>

      <Segmented<Tab>
        label={tr('hiring.applicationSections')}
        value={tab}
        onChange={setTab}
        options={[
          { value: 'overview', label: tr('hiring.match') },
          { value: 'stages', label: tr('hiring.stages') },
          { value: 'timeline', label: tr('hiring.timeline'), count: timeline.length },
          { value: 'resume', label: tr('hiring.rSum') },
        ]}
      />

      {tab === 'overview' && seesComp && (
        <CompensationCard app={app} country={c.country} canEdit={role === 'admin' || role === 'recruiter'} onSaved={onChanged} />
      )}
      {tab === 'overview' && <MatchPanel detail={detail} />}
      {tab === 'stages' && <StagesPanel detail={full} seesComp={seesComp} role={role} onChanged={onChanged} />}
      {tab === 'timeline' && <CommentBox appId={app.id} clientJob={!!job.client_id} onPosted={comments.reload} />}
      {tab === 'timeline' && (
        timeline.length === 0 ? <p className="text-sm text-muted-foreground">{tr('hiring.nothingHasHappenedYet')}</p> : (
          <ol className="relative space-y-4 border-l border-border pl-5">
            {timeline.map((t, i) => (
              <li key={i} className="relative">
                <span
                  aria-hidden
                  className={cn(
                    'absolute -left-[1.6rem] top-1 h-2.5 w-2.5 rounded-full ring-4 ring-background',
                    t.kind === 'result' ? (t.outcome === 'pass' ? 'bg-green-500' : t.outcome === 'fail' ? 'bg-red-500' : 'bg-muted-foreground') : t.kind === 'comment' ? 'bg-amber-500' : 'bg-primary',
                  )}
                />
                <p className="text-sm font-medium text-foreground">
                  {t.kind === 'comment' && <MessageSquare className="mr-1 inline h-3.5 w-3.5 text-muted-foreground" aria-hidden />}
                  {t.title}
                  {t.kind === 'result' && t.score != null && <span className="ml-1 tabular-nums text-muted-foreground">· {Math.round(t.score)}</span>}
                </p>
                {t.detail && <p className="mt-0.5 whitespace-pre-wrap text-sm text-muted-foreground">{t.detail}</p>}
                <p className="mt-0.5 text-xs text-muted-foreground">{formatDateTime(t.at)}{t.kind === 'move' ? ` · ${t.by}` : ''}</p>
              </li>
            ))}
          </ol>
        )
      )}
      {tab === 'resume' && <ResumePanel detail={detail} />}

      <ActionDialog
        request={action}
        stages={job.pipeline}
        onClose={() => setAction(null)}
        onDone={({ kind }) => {
          setAction(null)
          addToast({ type: 'success', title: kind === 'move' ? tr('hiring.moved') : kind === 'reject' ? tr('hiring.rejected') : tr('hiring.onHold') })
          onChanged()
        }}
      />
    </div>
  )
}

interface CommentDoc { id: string; author_id: string; author_name: string; author_role: string; visibility: 'internal' | 'client'; body: string; created_at: string }

function CommentBox({ appId, clientJob, onPosted }: { appId: string; clientJob: boolean; onPosted: () => void }) {
  const { t } = useT()
  const addToast = useToast()
  const [text, setText] = useState('')
  const [shared, setShared] = useState(false)
  const [busy, setBusy] = useState(false)
  const post = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    setBusy(true)
    try {
      await atsSend(`/api/ats/applications/${enc(appId)}/comments`, 'POST', { body: text.trim(), visibility: shared ? 'client' : 'internal' })
      setText('')
      onPosted()
    } catch (err) {
      addToast({ type: 'error', title: t('hiring.couldNotPostTheComment'), message: errorMessage(err) })
    } finally {
      setBusy(false)
    }
  }
  return (
    <form onSubmit={post} className="space-y-2 rounded-2xl border border-border p-3">
      <label htmlFor={`cm-${appId}`} className="sr-only">{t('hiring.addAComment')}</label>
      <Textarea id={`cm-${appId}`} rows={2} maxLength={4000} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('hiring.addANoteForTheTeam')} className="min-h-0" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        {clientJob ? (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch checked={shared} onCheckedChange={setShared} aria-label={t('hiring.shareWithTheClient')} />{' '}{t('hiring.shareWithTheClient')}</label>
        ) : <span />}
        <Button size="sm" type="submit" disabled={busy || !text.trim()}>
          {busy ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : <MessageSquare aria-hidden />}{' '}{t('hiring.comment')}</Button>
      </div>
    </form>
  )
}

function MatchPanel({ detail }: { detail: ApplicationDetail }) {
  const { t } = useT()
  const m = detail.application.match
  if (!m) return <p className="text-sm text-muted-foreground">{t('hiring.notScreenedYetTheMatchScore384')}</p>
  const rows = Object.entries(m.breakdown ?? {}).sort((a, b) => b[1] - a[1])
  return (
    <div className="space-y-4">
      {m.missing_must.length > 0 && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-3">
          <p className="text-sm font-medium text-red-700 dark:text-red-400">{t('hiring.missingMustHaves')}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {m.missing_must.map((s) => <span key={s} className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs text-red-700 dark:text-red-400">{s}</span>)}
          </div>
        </div>
      )}
      {rows.length > 0 && (
        <table className="w-full text-sm">
          <caption className="sr-only">{t('hiring.matchScoreBreakdown')}</caption>
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k}>
                <th scope="row" className="w-2/5 py-1 pr-3 text-left font-normal text-muted-foreground">{MATCH_WEIGHT_LABELS[k as keyof typeof MATCH_WEIGHT_LABELS] ?? k}</th>
                <td className="py-1">
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary/80" style={{ width: `${Math.max(0, Math.min(100, v))}%` }} /></div>
                    <span className="w-9 text-right tabular-nums text-foreground">{Math.round(v)}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {m.reasons.length > 0 && (
        <ul className="space-y-1 text-sm text-foreground">
          {m.reasons.map((r, i) => <li key={i} className="flex gap-2"><span aria-hidden className="text-muted-foreground">•</span>{r}</li>)}
        </ul>
      )}
    </div>
  )
}

function ResumePanel({ detail }: { detail: ApplicationDetail }) {
  const { t } = useT()
  const c = detail.candidate
  if (!c) return <p className="text-sm text-muted-foreground">{t('hiring.youCantSeeThisCandidatesRb99')}</p>
  const p = c.parsed
  return (
    <div className="space-y-4 text-sm">
      {c.resume?.storage_url && (
        <Button size="sm" variant="outline" asChild>
          <a href={c.resume.storage_url} target="_blank" rel="noopener noreferrer"><FileText aria-hidden /> {c.resume.file_name} <ExternalLink aria-hidden /></a>
        </Button>
      )}
      {p ? (
        <dl className="grid gap-3 sm:grid-cols-2">
          {p.summary && <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">{t('hiring.summary')}</dt><dd className="text-foreground">{p.summary}</dd></div>}
          <div><dt className="text-xs text-muted-foreground">{t('hiring.experience')}</dt><dd className="tabular-nums text-foreground">{p.total_years != null ? t('hiring.totalYearsYears', { total_years: p.total_years }) : '—'}</dd></div>
          <div><dt className="text-xs text-muted-foreground">{t('hiring.noticePeriod')}</dt><dd className="tabular-nums text-foreground">{p.notice_days != null ? t('hiring.noticeDaysDays', { notice_days: p.notice_days }) : '—'}</dd></div>
          <div><dt className="text-xs text-muted-foreground">{t('hiring.currentSalary')}</dt><dd className="tabular-nums text-foreground">{p.current_salary?.toLocaleString() ?? '—'}</dd></div>
          <div><dt className="text-xs text-muted-foreground">{t('hiring.expectedSalary')}</dt><dd className="tabular-nums text-foreground">{p.expected_salary?.toLocaleString() ?? '—'}</dd></div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted-foreground">{t('hiring.skills')}</dt>
            <dd className="mt-1 flex flex-wrap gap-1.5">{p.skills.length ? p.skills.map((s) => <Badge key={s} variant="outline">{s}</Badge>) : '—'}</dd>
          </div>
          {p.titles.length > 0 && <div><dt className="text-xs text-muted-foreground">{t('hiring.roles')}</dt><dd className="text-foreground">{p.titles.join(', ')}</dd></div>}
          {p.companies.length > 0 && <div><dt className="text-xs text-muted-foreground">{t('hiring.companies')}</dt><dd className="text-foreground">{p.companies.join(', ')}</dd></div>}
          {p.education.length > 0 && (
            <div className="sm:col-span-2">
              <dt className="text-xs text-muted-foreground">{t('hiring.education')}</dt>
              <dd className="text-foreground">{p.education.map((e) => [e.degree, e.field, e.institution, e.year].filter(Boolean).join(', ')).join(' · ')}</dd>
            </div>
          )}
          <div className="sm:col-span-2 text-xs text-muted-foreground">{t('hiring.readByValue', { value: p.parser === 'ai' ? 'AI' : t('hiring.theKeywordParser') })}</div>
        </dl>
      ) : (
        <p className="text-muted-foreground">{t('hiring.noParsedRSumYet')}</p>
      )}
      {c.resume?.text && (
        <details className="rounded-2xl border border-border p-3">
          <summary className="cursor-pointer text-sm font-medium text-foreground">{t('hiring.rSumText')}</summary>
          <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap font-sans text-xs text-muted-foreground">{c.resume.text}</pre>
        </details>
      )}
    </div>
  )
}

type StageExtras = { seesComp: boolean; role?: string; onChanged: () => void }

function StagesPanel({ detail, ...extras }: { detail: ApplicationDetail } & StageExtras) {
  const { t } = useT()
  const { application: app, job } = detail
  const reached = new Set([app.stage_id, ...app.history.map((h) => h.to), ...app.results.map((r) => r.stage_id)])
  const stages = job.pipeline.filter((s) => reached.has(s.id) && s.type !== 'applied' && s.type !== 'hired' && s.type !== 'rejected')
  if (!stages.length) return <p className="text-sm text-muted-foreground">{t('hiring.noStagesFinishedYet')}</p>
  return (
    <div className="space-y-4">
      {stages.map((s) => <StageBlock key={s.id} stage={s} detail={detail} {...extras} />)}
    </div>
  )
}

function StageBlock({ stage, detail, seesComp, role, onChanged }: { stage: PipelineStage; detail: ApplicationDetail } & StageExtras) {
  const { t } = useT()
  const result = detail.application.results.filter((r) => r.stage_id === stage.id).sort((a, b) => b.at.localeCompare(a.at))[0]
  const calls = (detail.calls ?? []).filter((c) => c.stage_id === stage.id)
  const interviews = (detail.interviews ?? []).filter((i) => i.stage_id === stage.id)
  const examId = stage.config?.kind === 'assessment' ? stage.config.exam_id : null
  return (
    <section className="rounded-2xl border border-border p-4">
      <header className="mb-2 flex items-center justify-between gap-2">
        <h3 className="font-semibold text-foreground">{stage.name}</h3>
        {result && (
          <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', result.outcome === 'pass' ? 'bg-green-500/15 text-green-700 dark:text-green-400' : result.outcome === 'fail' ? 'bg-red-500/15 text-red-700 dark:text-red-400' : 'bg-muted text-muted-foreground')}>
            {result.outcome === 'pass' ? t('hiring.passed') : result.outcome === 'fail' ? t('hiring.didNotPass') : result.outcome === 'pending' ? t('hiring.inProgress') : t('hiring.skipped')}
            {result.score != null && <span className="tabular-nums"> · {Math.round(result.score)}</span>}
          </span>
        )}
      </header>
      {result?.summary && <p className="text-sm text-muted-foreground">{result.summary}</p>}
      {stage.type === 'assessment' && examId && (
        <Link href={`/dashboard/admin/assessments/${examId}/results`} className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">{t('hiring.openTestResults')}{' '}<ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </Link>
      )}
      {calls.map((call) => <CallBlock key={call.id} call={call} stage={stage} />)}
      {interviews.map((iv) => <InterviewBlock key={iv.id} iv={iv} stage={stage} />)}
      {stage.type === 'hr_round' && seesComp && (
        <HrRoundPanel
          app={detail.application}
          canDecide={role === 'admin' || role === 'recruiter' || role === 'hiring_manager'}
          canResend={role === 'admin' || role === 'recruiter'}
          onChanged={onChanged}
        />
      )}
      {stage.type === 'bgv' && seesComp && <BgvPanel applicationId={detail.application.id} />}
      {!result && !calls.length && !interviews.length && stage.type !== 'hr_round' && stage.type !== 'bgv' && <p className="text-sm text-muted-foreground">{t('hiring.nothingRecordedYet')}</p>}
    </section>
  )
}

function CallBlock({ call, stage }: { call: ScreeningCall; stage: PipelineStage }) {
  const { formatDateTime } = useLocaleDates()
  const { t: tr } = useT()
  const questions = stage.config?.kind === 'bot_screen' ? stage.config.questions : []
  return (
    <div className="mt-3 space-y-3 rounded-xl bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">{tr('hiring.valueAttemptAttemptValue2Date', { value: CHANNEL_LABELS[call.channel], attempt: call.attempt, value2: call.status.replace(/_/g, ' '), date: formatDateTime(call.created_at) })}{call.score != null && <>{' '}{tr('hiring.score2')}{' '}<span className="tabular-nums text-foreground">{Math.round(call.score)}</span></>}
      </p>
      {call.summary && <p className="text-sm text-foreground">{call.summary}</p>}
      {call.recording_url && (
        <audio controls preload="none" src={call.recording_url} className="w-full" aria-label={tr('hiring.callRecording')}>
          <a href={call.recording_url}>{tr('hiring.downloadTheRecording')}</a>
        </audio>
      )}
      {Object.keys(call.answers ?? {}).length > 0 && (
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          {Object.entries(call.answers).map(([qid, ans]) => (
            <div key={qid}>
              <dt className="text-xs text-muted-foreground">{questions.find((q) => q.id === qid)?.text ?? qid}</dt>
              <dd className="text-foreground">{typeof ans === 'boolean' ? (ans ? tr('hiring.yes') : tr('hiring.no')) : String(ans ?? '—')}</dd>
            </div>
          ))}
        </dl>
      )}
      {call.transcript.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm font-medium text-foreground">{tr('hiring.transcriptCount', { count: call.transcript.length })}</summary>
          <ol className="mt-2 max-h-80 space-y-2 overflow-y-auto">
            {call.transcript.map((t, i) => (
              <li key={i} className={cn('max-w-[85%] rounded-2xl px-3 py-2 text-sm', t.role === 'bot' ? 'bg-background text-foreground' : 'ml-auto bg-primary/10 text-foreground')}>
                <span className="sr-only">{t.role === 'bot' ? tr('hiring.bot') : tr('hiring.candidate3')}</span>{t.text}
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  )
}

const REC: Record<string, string> = { strong_yes: 'Strong yes', yes: 'Yes', no: 'No', strong_no: 'Strong no' }

function InterviewBlock({ iv, stage }: { iv: AtsInterview; stage: PipelineStage }) {
  const { formatDateTime } = useLocaleDates()
  const { t } = useT()
  const criteria = stage.config?.kind === 'interview' ? stage.config.scorecard.criteria : []
  const nameOf = (uid: string) => iv.panel.find((p) => p.user_id === uid)?.name || iv.panel.find((p) => p.user_id === uid)?.email || 'Interviewer'
  return (
    <div className="mt-3 space-y-2 rounded-xl bg-muted/30 p-3 text-sm">
      <p className="text-xs text-muted-foreground">
        {iv.mode === 'f2f' ? t('hiring.faceToFaceValue', { value: iv.location ? ` · ${iv.location}` : '' }) : PROVIDER_LABELS[iv.provider ?? 'livekit']}
        {' · '}{iv.scheduled_at ? formatDateTime(iv.scheduled_at) : t('hiring.notScheduled')} · {iv.status.replace(/_/g, ' ')}
      </p>
      {iv.join_url && iv.status === 'scheduled' && (
        <a href={iv.join_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">{t('hiring.joinLink')}{' '}<ExternalLink className="h-3.5 w-3.5" aria-hidden /></a>
      )}
      <p className="text-xs text-muted-foreground">{t('hiring.panel')}{' '}{iv.panel.map((p) => p.name || p.email).join(', ') || t('hiring.noneYet')}</p>
      {iv.scorecards.map((sc) => (
        <div key={sc.interviewer_id} className="rounded-xl border border-border bg-background p-3">
          <p className="font-medium text-foreground">{nameOf(sc.interviewer_id)} · <span className={sc.recommendation.includes('yes') ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}>{REC[sc.recommendation]}</span></p>
          <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
            {Object.entries(sc.ratings).map(([cid, r]) => (
              <div key={cid} className="flex justify-between gap-2"><dt className="truncate text-muted-foreground">{criteria.find((k) => k.id === cid)?.label ?? cid}</dt><dd className="tabular-nums text-foreground">{r}/5</dd></div>
            ))}
          </dl>
          {sc.notes && <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{sc.notes}</p>}
        </div>
      ))}
    </div>
  )
}
