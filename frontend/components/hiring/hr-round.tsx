'use client'

/**
 * Staff-only pieces of the candidate page: the compensation card (experienced
 * vs fresher, history, recruiter edit) and the HR round panel (form status,
 * resend link, pass / hold / fail with an override when the form isn't in).
 * The API enforces access; these only render for admin / recruiter / hiring manager.
 */
import { useState } from 'react'
import { CheckCircle2, History, Loader2, Pause, Pencil, Send, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/lib/toast-context'
import { useLocaleDates } from '@/lib/i18n/use-dates'
import type { AtsApplication, Compensation } from '@/lib/ats/contract'
import { compensationSummary, formatMoney, parseCompensation } from '@/lib/ats/compensation'
import { atsSend, errorMessage, useAts } from './lib/api'
import { CompensationFields, draftFrom, draftToBody, type CompDraft } from './compensation-fields'
import { InlineError } from './ui'
import { useT } from '@/lib/i18n/client'
import type { Translator } from '@/lib/i18n/catalog'

const enc = encodeURIComponent

const SOURCE_TEXT = (t: Translator): Record<Compensation['source'], string> => ({
  apply: t('hiring.fromTheApplication'),
  hr_form: t('hiring.confirmedByTheCandidate'),
  recruiter: t('hiring.enteredByTheHiringTeam'),
})

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="tabular-nums text-foreground">{value}</dd>
    </div>
  )
}

function CompensationFigures({ c }: { c: Compensation }) {
  const { t } = useT()
  const m = (n: number | null | undefined) => formatMoney(n, c.currency, c.period)
  if (c.experience_level === 'fresher') {
    return (
      <dl className="grid gap-3 text-sm sm:grid-cols-3">
        <Row label={t('hiring.expectedCtc')} value={m(c.expected_ctc)} />
        <Row label={t('hiring.canJoinIn')} value={c.notice_days != null ? `${c.notice_days} days` : '—'} />
        <Row label={t('hiring.negotiable')} value={c.negotiable == null ? '—' : c.negotiable ? 'Yes' : 'No'} />
      </dl>
    )
  }
  const b = c.breakup
  return (
    <dl className="grid gap-3 text-sm sm:grid-cols-3">
      <Row label={c.currently_employed === false ? t('hiring.lastDrawnCtc') : t('hiring.currentCtc')} value={m(c.current_ctc)} />
      <Row label={t('hiring.expectedCtc')} value={m(c.expected_ctc)} />
      <Row label={c.currently_employed === false ? t('hiring.notCurrentlyEmployed') : t('hiring.noticePeriod')} value={c.currently_employed === false ? 'Can join now' : c.notice_days != null ? `${c.notice_days} days` : '—'} />
      {b && (b.fixed != null || b.variable != null) && (
        <>
          <Row label={t('hiring.fixed')} value={m(b.fixed)} />
          <Row label={t('hiring.variableBonus')} value={m(b.variable)} />
        </>
      )}
      <Row label={t('hiring.negotiable')} value={c.negotiable == null ? '—' : c.negotiable ? 'Yes' : 'No'} />
    </dl>
  )
}

export function CompensationCard({
  app,
  country,
  canEdit,
  onSaved,
}: {
  app: AtsApplication
  country?: string | null
  canEdit: boolean
  onSaved: () => void
}) {
  const { formatDateTime } = useLocaleDates()
  const { t } = useT()
  const addToast = useToast()
  const c = app.compensation ?? null
  const history = [...(app.compensation_history ?? [])].reverse()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<CompDraft>(() => draftFrom(c, country))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const body = draftToBody(draft)
    const check = parseCompensation(body, { source: 'recruiter', country })
    if (!check.ok) { setError(check.errors[0]); return }
    setBusy(true)
    setError(null)
    try {
      await atsSend(`/api/ats/applications/${enc(app.id)}/compensation`, 'PATCH', body)
      addToast({ type: 'success', title: t('hiring.compensationSaved') })
      setEditing(false)
      onSaved()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-2xl border border-border p-4" aria-labelledby={`comp-${app.id}`}>
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 id={`comp-${app.id}`} className="font-semibold text-foreground">{t('hiring.compensation')}</h3>
          {c && <Badge variant="outline">{c.experience_level === 'fresher' ? t('hiring.fresher') : t('hiring.experienced')}</Badge>}
        </div>
        {canEdit && !editing && (
          <Button size="sm" variant="outline" onClick={() => { setDraft(draftFrom(c, country)); setEditing(true) }}>
            <Pencil aria-hidden /> {c ? t('hiring.edit') : t('hiring.add')}
          </Button>
        )}
      </header>
      {editing ? (
        <form onSubmit={save} className="space-y-3">
          <CompensationFields idPrefix={`comp-edit-${app.id}`} value={draft} onChange={setDraft} hourlyAllowed showNegotiable />
          <InlineError message={error} />
          <div className="flex gap-2">
            <Button size="sm" type="submit" disabled={busy}>{busy && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />}{' '}{t('common.save')}</Button>
            <Button size="sm" type="button" variant="ghost" onClick={() => { setEditing(false); setError(null) }}>{t('common.cancel')}</Button>
          </div>
        </form>
      ) : c ? (
        <div className="space-y-3">
          <CompensationFigures c={c} />
          <p className="text-xs text-muted-foreground">
            {SOURCE_TEXT(t)[c.source]}{c.confirmed_at ? ` · ${formatDateTime(c.confirmed_at)}` : ''} · {c.currency}, {c.period === 'year' ? t('hiring.perYear') : c.period === 'month' ? t('hiring.perMonth') : t('hiring.perHour')}
          </p>
          {history.length > 1 && (
            <details className="rounded-xl border border-border px-3 py-2">
              <summary className="flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground"><History className="h-3.5 w-3.5" aria-hidden />{' '}{t('hiring.historyCount', { count: history.length })}</summary>
              <ol className="mt-2 space-y-1.5 text-sm">
                {history.map((h, i) => (
                  <li key={i} className="flex flex-wrap justify-between gap-2">
                    <span className="text-foreground">{compensationSummary(h)}</span>
                    <span className="text-xs text-muted-foreground">{SOURCE_TEXT(t)[h.source]}{h.confirmed_at ? ` · ${formatDateTime(h.confirmed_at)}` : ''}</span>
                  </li>
                ))}
              </ol>
            </details>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t('hiring.notSharedYetItsCollectedOnace')}</p>
      )}
    </section>
  )
}

interface HrStatus {
  in_hr_round: boolean
  collect: boolean
  confirmed: boolean
  can_resend: boolean
  form: {
    status: 'not_sent' | 'sent' | 'submitted' | 'expired'
    sent_at: string | null
    deadline: string | null
    submitted_at: string | null
    reminded_at: string | null
    submissions: number
    hr_interview_id?: string | null
    decision?: { decision: 'pass' | 'fail' | 'hold'; notes: string | null; offered_ctc: number | null; currency: string | null; period: string | null; override_reason: string | null; at: string } | null
  } | null
}

const FORM_STATUS: Record<NonNullable<HrStatus['form']>['status'], string> = {
  not_sent: 'Not sent',
  sent: 'Waiting for the candidate',
  submitted: 'Submitted',
  expired: 'Overdue',
}

export function HrRoundPanel({ app, canDecide, canResend, onChanged }: { app: AtsApplication; canDecide: boolean; canResend: boolean; onChanged: () => void }) {
  const { formatDateTime } = useLocaleDates()
  const { t } = useT()
  const addToast = useToast()
  const q = useAts<HrStatus>(`/api/ats/applications/${enc(app.id)}/hr-round`)
  const [notes, setNotes] = useState('')
  const [offered, setOffered] = useState('')
  const [override, setOverride] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const s = q.data
  const f = s?.form ?? null
  const active = app.status === 'active' || app.status === 'on_hold'
  const blocked = !!s?.collect && !s.confirmed
  const decided = f?.decision && f.decision.decision !== 'hold' ? f.decision : null

  const resend = async () => {
    setBusy('resend')
    try {
      await atsSend(`/api/ats/applications/${enc(app.id)}/hr-round`, 'POST', { action: 'resend' })
      addToast({ type: 'success', title: t('hiring.newLinkSent'), message: t('hiring.earlierLinksNoLongerWork') })
      q.reload()
    } catch (e) {
      addToast({ type: 'error', title: t('hiring.couldNotResend'), message: errorMessage(e) })
    } finally {
      setBusy(null)
    }
  }

  const decide = async (decision: 'pass' | 'fail' | 'hold') => {
    setError(null)
    if (decision === 'pass' && blocked && (!override || reason.trim().length < 5)) {
      setError(t('hiring.theCompensationFormIsntInYet21e'))
      return
    }
    setBusy(decision)
    try {
      await atsSend(`/api/ats/applications/${enc(app.id)}/hr-decision`, 'POST', {
        decision,
        notes: notes.trim() || undefined,
        ...(offered.trim() ? { offered_ctc: offered.trim() } : {}),
        ...(decision === 'pass' && blocked ? { override: { reason: reason.trim() } } : {}),
      })
      addToast({ type: 'success', title: decision === 'pass' ? t('hiring.hrRoundPassed') : decision === 'fail' ? t('hiring.hrRoundFailed') : t('hiring.putOnHold') })
      q.reload()
      onChanged()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  if (q.loading && !s) return <p className="mt-2 text-sm text-muted-foreground" role="status">{t('hiring.loadingTheHrRound')}</p>
  if (q.error && !s) return <InlineError message={q.error.message} />
  if (!s) return null

  return (
    <div className="mt-3 space-y-4">
      {s.collect && (
        <div className="flex flex-col gap-2 rounded-xl bg-muted/30 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium text-foreground">{t('hiring.compensationFormValue', { value: f ? FORM_STATUS[f.status] : t('hiring.notSent') })}</p>
            <p className="text-xs text-muted-foreground">
              {f?.submitted_at ? t('hiring.submittedDateValue', { date: formatDateTime(f.submitted_at), value: f.submissions > 1 ? ` (updated ${f.submissions - 1}×)` : '' }) : f?.sent_at ? t('hiring.sentDateValueValue2', { date: formatDateTime(f.sent_at), value: f.deadline ? ` · due ${formatDateTime(f.deadline)}` : '', value2: f.reminded_at ? ' · reminder sent' : '' }) : t('hiring.theCandidateGetsASecureLinkbcb')}
            </p>
          </div>
          {canResend && s.can_resend && (
            <Button size="sm" variant="outline" disabled={!!busy} onClick={resend}>
              {busy === 'resend' ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : <Send aria-hidden />}{' '}{t('hiring.resendLink')}</Button>
          )}
        </div>
      )}

      {decided ? (
        <p className="text-sm text-foreground">{t('hiring.hrDecision')}{' '}<span className={decided.decision === 'pass' ? 'font-medium text-green-700 dark:text-green-400' : 'font-medium text-red-700 dark:text-red-400'}>{decided.decision === 'pass' ? t('hiring.passed') : t('hiring.didNotPass')}</span>
          {decided.offered_ctc != null && <>{' '}{t('hiring.offered')}{' '}{formatMoney(decided.offered_ctc, decided.currency || 'INR', (decided.period as Compensation['period']) || 'year')}</>}
          {decided.notes && <span className="block text-muted-foreground">{decided.notes}</span>}
        </p>
      ) : canDecide && s.in_hr_round && active ? (
        <div className="space-y-3">
          {f?.decision?.decision === 'hold' && <p className="text-xs text-muted-foreground">{t('hiring.onHoldSinceDate', { date: formatDateTime(f.decision.at) })}{f.decision.notes ? ` — ${f.decision.notes}` : ''}</p>}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor={`hr-notes-${app.id}`} className="text-xs">{t('hiring.notesForTheTeam')}</Label>
              <Textarea id={`hr-notes-${app.id}`} rows={2} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-0" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`hr-offer-${app.id}`} className="text-xs">{t('hiring.offeredCtc')}{app.compensation?.currency || t('hiring.optional2')})</Label>
              <Input id={`hr-offer-${app.id}`} inputMode="decimal" value={offered} onChange={(e) => setOffered(e.target.value.replace(/[^\d.]/g, '').slice(0, 12))} placeholder={t('hiring.optional3')} />
            </div>
          </div>
          {blocked && (
            <div className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
              <label className="flex items-center justify-between gap-3 text-sm text-foreground">
                <span>{t('hiring.passWithoutTheCandidatesCompensationForm')}</span>
                <Switch checked={override} onCheckedChange={setOverride} aria-label={t('hiring.passWithoutTheCompensationForm')} />
              </label>
              {override && (
                <div className="space-y-1.5">
                  <Label htmlFor={`hr-reason-${app.id}`} className="text-xs">{t('hiring.reasonRecordedOnTheTimeline')}</Label>
                  <Input id={`hr-reason-${app.id}`} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('hiring.eGConfirmedOnTheHref7')} />
                </div>
              )}
            </div>
          )}
          <InlineError message={error} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={!!busy || (blocked && !override)} onClick={() => decide('pass')}>
              {busy === 'pass' ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : <CheckCircle2 aria-hidden />}{' '}{t('hiring.pass')}</Button>
            {app.status === 'active' && (
              <Button size="sm" variant="outline" disabled={!!busy} onClick={() => decide('hold')}>
                {busy === 'hold' ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : <Pause aria-hidden />}{' '}{t('hiring.hold')}</Button>
            )}
            <Button size="sm" variant="outline" className="text-red-700 hover:text-red-700 dark:text-red-400" disabled={!!busy} onClick={() => decide('fail')}>
              {busy === 'fail' ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : <XCircle aria-hidden />}{' '}{t('hiring.fail')}</Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
