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
import { formatDateTime } from '@/lib/format-datetime'
import type { AtsApplication, Compensation } from '@/lib/ats/contract'
import { compensationSummary, formatMoney, parseCompensation } from '@/lib/ats/compensation'
import { atsSend, errorMessage, useAts } from './lib/api'
import { CompensationFields, draftFrom, draftToBody, type CompDraft } from './compensation-fields'
import { InlineError } from './ui'

const enc = encodeURIComponent

const SOURCE_TEXT: Record<Compensation['source'], string> = {
  apply: 'From the application',
  hr_form: 'Confirmed by the candidate',
  recruiter: 'Entered by the hiring team',
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="tabular-nums text-foreground">{value}</dd>
    </div>
  )
}

function CompensationFigures({ c }: { c: Compensation }) {
  const m = (n: number | null | undefined) => formatMoney(n, c.currency, c.period)
  if (c.experience_level === 'fresher') {
    return (
      <dl className="grid gap-3 text-sm sm:grid-cols-3">
        <Row label="Expected CTC" value={m(c.expected_ctc)} />
        <Row label="Can join in" value={c.notice_days != null ? `${c.notice_days} days` : '—'} />
        <Row label="Negotiable" value={c.negotiable == null ? '—' : c.negotiable ? 'Yes' : 'No'} />
      </dl>
    )
  }
  const b = c.breakup
  return (
    <dl className="grid gap-3 text-sm sm:grid-cols-3">
      <Row label={c.currently_employed === false ? 'Last drawn CTC' : 'Current CTC'} value={m(c.current_ctc)} />
      <Row label="Expected CTC" value={m(c.expected_ctc)} />
      <Row label={c.currently_employed === false ? 'Not currently employed' : 'Notice period'} value={c.currently_employed === false ? 'Can join now' : c.notice_days != null ? `${c.notice_days} days` : '—'} />
      {b && (b.fixed != null || b.variable != null) && (
        <>
          <Row label="Fixed" value={m(b.fixed)} />
          <Row label="Variable / bonus" value={m(b.variable)} />
        </>
      )}
      <Row label="Negotiable" value={c.negotiable == null ? '—' : c.negotiable ? 'Yes' : 'No'} />
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
      addToast({ type: 'success', title: 'Compensation saved' })
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
          <h3 id={`comp-${app.id}`} className="font-semibold text-foreground">Compensation</h3>
          {c && <Badge variant="outline">{c.experience_level === 'fresher' ? 'Fresher' : 'Experienced'}</Badge>}
        </div>
        {canEdit && !editing && (
          <Button size="sm" variant="outline" onClick={() => { setDraft(draftFrom(c, country)); setEditing(true) }}>
            <Pencil aria-hidden /> {c ? 'Edit' : 'Add'}
          </Button>
        )}
      </header>
      {editing ? (
        <form onSubmit={save} className="space-y-3">
          <CompensationFields idPrefix={`comp-edit-${app.id}`} value={draft} onChange={setDraft} hourlyAllowed showNegotiable />
          <InlineError message={error} />
          <div className="flex gap-2">
            <Button size="sm" type="submit" disabled={busy}>{busy && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />} Save</Button>
            <Button size="sm" type="button" variant="ghost" onClick={() => { setEditing(false); setError(null) }}>Cancel</Button>
          </div>
        </form>
      ) : c ? (
        <div className="space-y-3">
          <CompensationFigures c={c} />
          <p className="text-xs text-muted-foreground">
            {SOURCE_TEXT[c.source]}{c.confirmed_at ? ` · ${formatDateTime(c.confirmed_at)}` : ''} · {c.currency}, {c.period === 'year' ? 'per year' : c.period === 'month' ? 'per month' : 'per hour'}
          </p>
          {history.length > 1 && (
            <details className="rounded-xl border border-border px-3 py-2">
              <summary className="flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground"><History className="h-3.5 w-3.5" aria-hidden /> History ({history.length})</summary>
              <ol className="mt-2 space-y-1.5 text-sm">
                {history.map((h, i) => (
                  <li key={i} className="flex flex-wrap justify-between gap-2">
                    <span className="text-foreground">{compensationSummary(h)}</span>
                    <span className="text-xs text-muted-foreground">{SOURCE_TEXT[h.source]}{h.confirmed_at ? ` · ${formatDateTime(h.confirmed_at)}` : ''}</span>
                  </li>
                ))}
              </ol>
            </details>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Not shared yet. It&apos;s collected on the apply form and confirmed in the HR round.</p>
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
      addToast({ type: 'success', title: 'New link sent', message: 'Earlier links no longer work.' })
      q.reload()
    } catch (e) {
      addToast({ type: 'error', title: 'Could not resend', message: errorMessage(e) })
    } finally {
      setBusy(null)
    }
  }

  const decide = async (decision: 'pass' | 'fail' | 'hold') => {
    setError(null)
    if (decision === 'pass' && blocked && (!override || reason.trim().length < 5)) {
      setError('The compensation form isn’t in yet. Turn on the override and give a reason to pass anyway.')
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
      addToast({ type: 'success', title: decision === 'pass' ? 'HR round passed' : decision === 'fail' ? 'HR round failed' : 'Put on hold' })
      q.reload()
      onChanged()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  if (q.loading && !s) return <p className="mt-2 text-sm text-muted-foreground" role="status">Loading the HR round…</p>
  if (q.error && !s) return <InlineError message={q.error.message} />
  if (!s) return null

  return (
    <div className="mt-3 space-y-4">
      {s.collect && (
        <div className="flex flex-col gap-2 rounded-xl bg-muted/30 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium text-foreground">Compensation form · {f ? FORM_STATUS[f.status] : 'Not sent'}</p>
            <p className="text-xs text-muted-foreground">
              {f?.submitted_at ? `Submitted ${formatDateTime(f.submitted_at)}${f.submissions > 1 ? ` (updated ${f.submissions - 1}×)` : ''}` : f?.sent_at ? `Sent ${formatDateTime(f.sent_at)}${f.deadline ? ` · due ${formatDateTime(f.deadline)}` : ''}${f.reminded_at ? ' · reminder sent' : ''}` : 'The candidate gets a secure link when they enter this stage.'}
            </p>
          </div>
          {canResend && s.can_resend && (
            <Button size="sm" variant="outline" disabled={!!busy} onClick={resend}>
              {busy === 'resend' ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : <Send aria-hidden />} Resend link
            </Button>
          )}
        </div>
      )}

      {decided ? (
        <p className="text-sm text-foreground">
          HR decision: <span className={decided.decision === 'pass' ? 'font-medium text-green-700 dark:text-green-400' : 'font-medium text-red-700 dark:text-red-400'}>{decided.decision === 'pass' ? 'Passed' : 'Did not pass'}</span>
          {decided.offered_ctc != null && <> · offered {formatMoney(decided.offered_ctc, decided.currency || 'INR', (decided.period as Compensation['period']) || 'year')}</>}
          {decided.notes && <span className="block text-muted-foreground">{decided.notes}</span>}
        </p>
      ) : canDecide && s.in_hr_round && active ? (
        <div className="space-y-3">
          {f?.decision?.decision === 'hold' && <p className="text-xs text-muted-foreground">On hold since {formatDateTime(f.decision.at)}{f.decision.notes ? ` — ${f.decision.notes}` : ''}</p>}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor={`hr-notes-${app.id}`} className="text-xs">Notes for the team</Label>
              <Textarea id={`hr-notes-${app.id}`} rows={2} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-0" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`hr-offer-${app.id}`} className="text-xs">Offered CTC ({app.compensation?.currency || 'optional'})</Label>
              <Input id={`hr-offer-${app.id}`} inputMode="decimal" value={offered} onChange={(e) => setOffered(e.target.value.replace(/[^\d.]/g, '').slice(0, 12))} placeholder="Optional" />
            </div>
          </div>
          {blocked && (
            <div className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
              <label className="flex items-center justify-between gap-3 text-sm text-foreground">
                <span>Pass without the candidate&apos;s compensation form</span>
                <Switch checked={override} onCheckedChange={setOverride} aria-label="Pass without the compensation form" />
              </label>
              {override && (
                <div className="space-y-1.5">
                  <Label htmlFor={`hr-reason-${app.id}`} className="text-xs">Reason (recorded on the timeline)</Label>
                  <Input id={`hr-reason-${app.id}`} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Confirmed on the HR call" />
                </div>
              )}
            </div>
          )}
          <InlineError message={error} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={!!busy || (blocked && !override)} onClick={() => decide('pass')}>
              {busy === 'pass' ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : <CheckCircle2 aria-hidden />} Pass
            </Button>
            {app.status === 'active' && (
              <Button size="sm" variant="outline" disabled={!!busy} onClick={() => decide('hold')}>
                {busy === 'hold' ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : <Pause aria-hidden />} Hold
              </Button>
            )}
            <Button size="sm" variant="outline" className="text-red-700 hover:text-red-700 dark:text-red-400" disabled={!!busy} onClick={() => decide('fail')}>
              {busy === 'fail' ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : <XCircle aria-hidden />} Fail
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
