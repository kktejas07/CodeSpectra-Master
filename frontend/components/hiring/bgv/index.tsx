'use client'

/**
 * <BgvPanel applicationId /> — background verification on the candidate's BGV
 * stage. Admin / recruiter: every check's data and documents (documents open
 * through 5-minute signed links; every view is audit-logged), verify / flag /
 * waive with notes, ask the candidate for more, assign a vendor, decide a
 * "consider" result (US: pre-adverse → wait → final adverse notice).
 * Hiring manager: status summary only. Others get nothing from the API.
 */
import { formatDate } from '@/lib/i18n/format'
import { useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, Eye, FileText, Loader2, Mail, ShieldCheck, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState } from '@/components/ui/empty-state'
import { InlineError, LoadingRows, NativeSelect, ErrorState } from '@/components/hiring/ui'
import { atsGet, atsSend, errorMessage, useAts } from '@/components/hiring/lib/api'
import { checkDef, REGION_LABELS, type FieldDef } from '@/lib/ats/bgv/catalog'
import type { BgvFullView, BgvSummaryView, BgvView } from '@/lib/ats/bgv/access'
import type { BgvCheckStatus } from '@/lib/ats/bgv/types'
import { useToast } from '@/lib/toast-context'
import { useConfirm } from '@/lib/confirm-context'
import { useT, activeLocale } from '@/lib/i18n/client'
import type { Translator } from '@/lib/i18n/catalog'

interface Resp {
  case: BgvView | null
  in_bgv_stage?: boolean
  can?: { verify: boolean; reveal: boolean }
  vendors?: { id: string; label: string; ready: boolean }[]
  fair_chance_hint?: string | null
}

type Variant = 'outline' | 'info' | 'success' | 'warning' | 'danger' | 'secondary'
const CHECK_STATUS = (t: Translator): Record<BgvCheckStatus, { label: string; variant: Variant }> => ({
  not_started: { label: t('hiring.notStarted'), variant: 'outline' },
  submitted: { label: t('hiring.submitted'), variant: 'info' },
  in_progress: { label: t('hiring.inProgress'), variant: 'info' },
  verified: { label: t('hiring.verified'), variant: 'success' },
  discrepancy: { label: t('hiring.discrepancy'), variant: 'danger' },
  unable_to_verify: { label: t('hiring.unableToVerify'), variant: 'warning' },
  waived: { label: t('hiring.waived'), variant: 'secondary' },
})
const CASE_STATUS = (t: Translator): Record<string, { label: string; variant: Variant }> => ({
  invited: { label: t('hiring.invited'), variant: 'outline' },
  in_progress: { label: t('hiring.candidateFillingIn'), variant: 'info' },
  submitted: { label: t('hiring.submitted'), variant: 'info' },
  verifying: { label: t('hiring.verifying'), variant: 'info' },
  clear: { label: t('hiring.clear'), variant: 'success' },
  consider: { label: t('hiring.consider'), variant: 'warning' },
  failed: { label: t('hiring.failed'), variant: 'danger' },
  cancelled: { label: t('hiring.cancelled'), variant: 'secondary' },
})

const enc = encodeURIComponent
const when = (iso: string | null | undefined) => (iso ? formatDate(activeLocale(), iso, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—')

function show(f: FieldDef, data: Record<string, unknown>): string | null {
  if (f.sensitive) return typeof data[`${f.key}_masked`] === 'string' ? String(data[`${f.key}_masked`]) : null
  const v = data[f.key]
  if (v === undefined || v === null || v === '') return null
  if (f.type === 'checkbox') return v === true ? 'Yes' : null
  if (f.type === 'select') return f.options?.find((o) => o.value === v)?.label || String(v)
  return String(v)
}

function KeyValues({ fields, data }: { fields: FieldDef[]; data: Record<string, unknown> }) {
  const rows = fields.map((f) => [f.label, show(f, data)] as const).filter(([, v]) => v)
  if (!rows.length) return null
  return (
    <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[minmax(0,14rem)_1fr]">
      {rows.map(([l, v]) => (
        <div key={l} className="contents">
          <dt className="text-muted-foreground">{l}</dt>
          <dd className="break-words whitespace-pre-wrap text-foreground">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

function SummaryPanel({ c }: { c: BgvSummaryView }) {
  const { td, t } = useT()
  const s = CASE_STATUS(t)[c.status] || CASE_STATUS(t).invited
  return (
    <div className="mt-3 space-y-2">
      <p className="flex flex-wrap items-center gap-2 text-sm"><Badge variant={s.variant}>{s.label}</Badge><span className="text-muted-foreground">{td(`hiring.regionLabels:${c.region}`, REGION_LABELS[c.region])}</span></p>
      <ul className="divide-y divide-border rounded-2xl border border-border">
        {c.checks.map((k) => (
          <li key={k.type} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
            <span>{k.label}</span><Badge variant={CHECK_STATUS(t)[k.status].variant}>{CHECK_STATUS(t)[k.status].label}</Badge>
          </li>
        ))}
      </ul>
    </div>
  )
}

function CheckBlock({ c, k, canVerify, canReveal, onCase }: { c: BgvFullView; k: BgvFullView['checks'][number]; canVerify: boolean; canReveal: boolean; onCase: (v: BgvView) => void }) {
  const { t } = useT()
  const addToast = useToast()
  const def = checkDef(c.region, k.type)
  const [mode, setMode] = useState<null | 'mark' | 'info'>(null)
  const [status, setStatus] = useState<BgvCheckStatus>('verified')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [revealed, setRevealed] = useState<Record<string, string> | null>(null)
  const st = CHECK_STATUS(t)[k.status]
  const closed = ['clear', 'failed', 'cancelled'].includes(c.status) || !!c.purged_at
  const groupItems = def?.group && Array.isArray(k.data[def.group.key]) ? (k.data[def.group.key] as Record<string, unknown>[]) : []

  async function act(body: Record<string, unknown>, okText: string) {
    setBusy(String(body.action)); setErr(null)
    try {
      const r = await atsSend<{ case: BgvView }>(`/api/ats/bgv/${enc(c.id)}/checks`, 'POST', { type: k.type, ...body })
      onCase(r.case); setMode(null); setText('')
      addToast({ type: 'success', title: okText })
    } catch (e) {
      setErr(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }
  async function reveal() {
    setBusy('reveal'); setErr(null)
    try {
      const r = await atsSend<{ values: Record<string, string> }>(`/api/ats/bgv/${enc(c.id)}/checks`, 'POST', { type: k.type, action: 'reveal' })
      setRevealed(r.values)
    } catch (e) {
      setErr(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }
  async function openDoc(id: string) {
    // Open the tab synchronously (popup blockers), then point it at the signed link.
    const w = window.open('', '_blank', 'noopener=no')
    try {
      const r = await atsGet<{ url: string }>(`/api/ats/bgv/${enc(c.id)}/documents/${enc(id)}`)
      if (w) { w.opener = null; w.location.href = r.url } else window.location.assign(r.url)
    } catch (e) {
      w?.close()
      setErr(errorMessage(e))
    }
  }
  const docsFor = (item: number | null) => k.documents.filter((d) => d.item === item)
  const docList = (item: number | null) => docsFor(item).length > 0 && (
    <ul className="mt-2 flex flex-wrap gap-2">
      {docsFor(item).map((d) => {
        const slot = (item === null ? def?.documents : def?.group?.documents)?.find((x) => x.slot === d.slot)
        return (
          <li key={d.id}>
            <button type="button" onClick={() => void openDoc(d.id)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" title={d.name}>
              <FileText className="h-3.5 w-3.5 text-primary" aria-hidden /><span className="max-w-[12rem] truncate">{slot?.label || d.slot}: {d.name}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )

  return (
    <details className="group rounded-2xl border border-border open:bg-muted/20">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-2xl">
        <span className="text-sm font-medium text-foreground">{k.label}{c.critical_checks.includes(k.type) && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{t('hiring.critical')}</span>}</span>
        <span className="flex items-center gap-2">
          {k.info_request && <Badge variant="warning">{t('hiring.infoRequested')}</Badge>}
          <Badge variant={st.variant}>{st.label}</Badge>
        </span>
      </summary>
      <div className="space-y-3 border-t border-border px-3 py-3">
        {!def?.candidate_input && <p className="text-sm text-muted-foreground">{def?.description || t('hiring.performedByTheVendor')}</p>}
        {def && <KeyValues fields={def.fields} data={k.data} />}
        {docList(null)}
        {def?.group && groupItems.map((it, i) => (
          <div key={i} className="rounded-xl border border-border p-3">
            <p className="mb-1 text-xs font-semibold text-muted-foreground">{def.group!.itemLabel} {i + 1}</p>
            <KeyValues fields={def.group!.fields} data={it} />
            {docList(i)}
          </div>
        ))}
        {revealed && (
          <p className="rounded-xl bg-amber-500/10 px-3 py-2 font-mono text-sm text-foreground">{Object.entries(revealed).map(([key, v]) => `${key.toUpperCase()}: ${v}`).join(' · ') || t('hiring.nothingStored')}</p>
        )}
        {k.notes && <p className="whitespace-pre-wrap rounded-xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground">{k.notes}</p>}
        {k.verified_at && <p className="text-xs text-muted-foreground">{t('hiring.decidedValue', { value: when(k.verified_at) })}{k.verified_by?.startsWith('vendor:') ? t('hiring.byValue', { value: k.verified_by.slice(7) }) : ''}</p>}
        <InlineError message={err} />
        {canVerify && !closed && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant={mode === 'mark' ? 'default' : 'outline'} className="min-h-9" onClick={() => setMode(mode === 'mark' ? null : 'mark')}>{t('hiring.recordResult')}</Button>
            {def?.candidate_input && c.submitted_at && <Button size="sm" variant={mode === 'info' ? 'default' : 'outline'} className="min-h-9" onClick={() => setMode(mode === 'info' ? null : 'info')}>{t('hiring.askForMoreInfo')}</Button>}
            {canReveal && def?.fields.some((f) => f.sensitive) && !revealed && (
              <Button size="sm" variant="ghost" className="min-h-9" disabled={busy === 'reveal'} onClick={() => void reveal()}><Eye className="h-4 w-4" aria-hidden />{' '}{t('hiring.revealFullNumber')}</Button>
            )}
          </div>
        )}
        {mode === 'mark' && (
          <div className="space-y-2 rounded-xl border border-border p-3">
            <label htmlFor={`st-${k.type}`} className="text-sm font-medium">{t('hiring.result')}</label>
            <NativeSelect id={`st-${k.type}`} value={status} onChange={(v) => setStatus(v as BgvCheckStatus)} options={[
              { value: 'verified', label: t('hiring.verified') }, { value: 'discrepancy', label: t('hiring.discrepancy') }, { value: 'unable_to_verify', label: t('hiring.unableToVerify') },
              { value: 'waived', label: t('hiring.waiveNotRequired') }, { value: 'in_progress', label: t('hiring.inProgress') },
            ]} />
            <label htmlFor={`nt-${k.type}`} className="text-sm font-medium">{t('hiring.notesValue', { value: status === 'verified' || status === 'in_progress' ? t('common.optionalParen') : t('hiring.required') })}</label>
            <Textarea id={`nt-${k.type}`} value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} rows={2} placeholder={t('hiring.whoYouSpokeToWhatYou2b2')} />
            <Button size="sm" className="min-h-9" disabled={!!busy} onClick={() => void act({ action: 'mark', status, notes: text }, 'Result saved')}>
              {busy === 'mark' && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />}{' '}{t('hiring.saveResult')}</Button>
          </div>
        )}
        {mode === 'info' && (
          <div className="space-y-2 rounded-xl border border-border p-3">
            <label htmlFor={`ri-${k.type}`} className="text-sm font-medium">{t('hiring.messageToTheCandidate')}</label>
            <Textarea id={`ri-${k.type}`} value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} rows={3} placeholder={t('hiring.eGPleaseUploadYourRelieving1c8')} />
            <p className="text-xs text-muted-foreground">{t('hiring.thisCheckOpensAgainForThe89f')}</p>
            <Button size="sm" className="min-h-9" disabled={!!busy || text.trim().length < 5} onClick={() => void act({ action: 'request_info', message: text }, 'Request sent to the candidate')}>
              {busy === 'request_info' && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />}{' '}{t('hiring.sendRequest')}</Button>
          </div>
        )}
      </div>
    </details>
  )
}

function FullPanel({ data, onCase, reload }: { data: Resp & { case: BgvFullView }; onCase: (v: BgvView) => void; reload: () => void }) {
  const { td, t } = useT()
  const c = data.case
  const addToast = useToast()
  const confirm = useConfirm()
  const can = data.can || { verify: false, reveal: false }
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [vendor, setVendor] = useState(c.vendor)
  const [note, setNote] = useState('')
  const s = CASE_STATUS(t)[c.status] || CASE_STATUS(t).invited
  const a = c.adverse_action
  const adverseOpen = !!a?.pre_adverse_sent_at && !a.final_sent_at && !a.withdrawn_at
  const waitOver = adverseOpen && !!a?.earliest_final_at && Date.now() >= Date.parse(a.earliest_final_at)
  const closed = ['clear', 'failed', 'cancelled'].includes(c.status) || !!c.purged_at

  async function run(key: string, url: string, body: Record<string, unknown> | undefined, okText: string) {
    setBusy(key); setErr(null)
    try {
      const r = await atsSend<{ case: BgvView; adverse_started?: boolean }>(url, 'POST', body)
      onCase(r.case)
      addToast({ type: 'success', title: r.adverse_started ? t('hiring.preAdverseNoticeSent') : okText })
      setNote('')
    } catch (e) {
      setErr(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }
  async function fail() {
    const us = c.region === 'US'
    const ok = await confirm({
      title: us ? t('hiring.startTheAdverseAction') : t('hiring.failTheBackgroundCheck'),
      description: us
        ? t('hiring.theCandidateGetsAPreAdversebf6')
        : t('hiring.theStageResultBecomesFailAnde24'),
      confirmText: us ? t('hiring.sendPreAdverseNotice') : t('hiring.failCheck'),
      destructive: true,
    })
    if (ok) await run('fail', `/api/ats/bgv/${enc(c.id)}/decision`, { decision: 'fail', note }, 'Background check failed')
  }
  async function erase() {
    const ok = await confirm({ title: t('hiring.deleteThisCandidatesBgvData'), description: t('hiring.allUploadedDocumentsAndFormAnswers573'), confirmText: t('hiring.deleteData'), destructive: true })
    if (ok) await run('erase', `/api/ats/bgv/${enc(c.id)}/erase`, { confirm: 'DELETE' }, 'Background check data deleted')
  }

  return (
    <div className="mt-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant={s.variant}>{s.label}</Badge>
        <span className="text-muted-foreground">{td(`hiring.regionLabels:${c.region}`, REGION_LABELS[c.region])} · {data.vendors?.find((v) => v.id === c.vendor)?.label || c.vendor}</span>
        {c.submitted_at ? <span className="text-muted-foreground">{t('hiring.submittedValue', { value: when(c.submitted_at) })}</span> : c.deadline ? <span className="text-muted-foreground">{t('hiring.dueValue', { value: when(c.deadline) })}</span> : null}
      </div>
      {c.consent ? (
        <p className="text-xs text-muted-foreground">{t('hiring.consentSignedBy')}{' '}{c.consent.name || t('hiring.theCandidate')}{' '}{t('hiring.onValueVersionVersion', { value: when(c.consent.signed_at), version: c.consent.version })}{c.consent.disclosure_version ? t('hiring.disclosureDisclosureVersion', { disclosure_version: c.consent.disclosure_version }) : ''}{c.consent.ip ? t('hiring.ipIp', { ip: c.consent.ip }) : ''}).</p>
      ) : !closed && <p className="text-xs text-muted-foreground">{t('hiring.waitingForTheCandidatesConsent')}</p>}
      {c.purged_at && <p className="rounded-xl bg-muted/50 px-3 py-2 text-sm text-muted-foreground">{t('hiring.documentsAndAnswersWereDeletedOnfc9', { value: when(c.purged_at), value2: c.purge_reason === 'candidate_request' ? t('hiring.candidateRequest') : t('hiring.retentionPeriod') })}</p>}
      {data.fair_chance_hint && <p className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-foreground"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />{data.fair_chance_hint}</p>}
      {c.vendor_invitation_url && <p className="text-xs text-muted-foreground">{t('hiring.vendorInvitation')}{' '}<a className="text-primary underline" href={c.vendor_invitation_url} target="_blank" rel="noreferrer">{t('hiring.open2')}</a></p>}

      {c.status === 'consider' && can.verify && (
        <div className="space-y-2 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3">
          <p className="text-sm font-medium text-foreground">{t('hiring.decisionNeeded')}</p>
          {adverseOpen ? (
            <>
              <p className="text-sm text-muted-foreground">{t('hiring.preAdverseNoticeSentValue', { value: when(a!.pre_adverse_sent_at) })}{' '}{waitOver ? t('hiring.theWaitingPeriodIsOver') : t('hiring.youCanSendTheFinalNoticed5e', { value: when(a!.earliest_final_at), waiting_days: a!.waiting_days })}</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="destructive" className="min-h-9" disabled={!waitOver || !!busy} onClick={() => void run('final', `/api/ats/bgv/${enc(c.id)}/decision`, { action: 'final_adverse' }, 'Final adverse notice sent')}>{t('hiring.sendFinalAdverseNotice')}</Button>
                <Button size="sm" variant="outline" className="min-h-9" disabled={!!busy} onClick={() => void run('withdraw', `/api/ats/bgv/${enc(c.id)}/decision`, { action: 'withdraw_adverse' }, 'Adverse action withdrawn')}>{t('hiring.withdraw')}</Button>
              </div>
            </>
          ) : (
            <>
              <label htmlFor={`dec-${c.id}`} className="sr-only">{t('hiring.decisionNote')}</label>
              <Textarea id={`dec-${c.id}`} value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000} placeholder={t('hiring.whyEGTheDiscrepancyWas453')} />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" className="min-h-9" disabled={!!busy} onClick={() => void run('pass', `/api/ats/bgv/${enc(c.id)}/decision`, { decision: 'pass', note }, 'Marked clear')}>{t('hiring.pass')}</Button>
                <Button size="sm" variant="destructive" className="min-h-9" disabled={!!busy} onClick={() => void fail()}>{c.region === 'US' ? t('hiring.failStartAdverseAction') : t('hiring.fail')}</Button>
              </div>
            </>
          )}
        </div>
      )}

      <div className="space-y-2">
        {c.checks.map((k) => <CheckBlock key={k.type} c={c} k={k} canVerify={can.verify} canReveal={can.reveal} onCase={onCase} />)}
      </div>
      <InlineError message={err} />
      {can.verify && !closed && (
        <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
          <div className="space-y-1">
            <label htmlFor={`vendor-${c.id}`} className="text-xs font-medium text-muted-foreground">{t('hiring.vendor')}</label>
            <NativeSelect id={`vendor-${c.id}`} value={vendor} onChange={setVendor} options={(data.vendors || []).map((v) => ({ value: v.id, label: v.label, disabled: !v.ready }))} className="h-9 w-56" />
          </div>
          <Button size="sm" variant="outline" className="min-h-9" disabled={!!busy || vendor === c.vendor} onClick={() => void run('vendor', `/api/ats/bgv/${enc(c.id)}/vendor`, { vendor }, 'Vendor assigned')}>{t('hiring.assign')}</Button>
          {c.candidate_email && (!c.submitted_at || c.checks.some((k) => k.info_request)) && (
            <Button size="sm" variant="outline" className="min-h-9" disabled={!!busy} onClick={() => void run('resend', `/api/ats/bgv/${enc(c.id)}/resend`, undefined, 'New link sent')}><Mail className="h-4 w-4" aria-hidden />{' '}{t('hiring.resendLink')}</Button>
          )}
          <Button size="sm" variant="ghost" className="min-h-9" onClick={reload}>{t('hiring.refresh')}</Button>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <Link href="/dashboard/hiring/settings/bgv" className="text-primary hover:underline">{t('hiring.backgroundCheckSettings')}</Link>
        {can.reveal && !c.purged_at && (
          <button type="button" onClick={() => void erase()} disabled={!!busy} className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-red-700 hover:bg-red-500/10 dark:text-red-400"><Trash2 className="h-3.5 w-3.5" aria-hidden />{' '}{t('hiring.deleteDataOnRequest')}</button>
        )}
      </div>
    </div>
  )
}

export function BgvPanel({ applicationId }: { applicationId: string }) {
  const { t } = useT()
  const q = useAts<Resp>(`/api/ats/bgv?application_id=${enc(applicationId)}`)
  const addToast = useToast()
  const [region, setRegion] = useState('auto')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  if (q.loading && !q.data) return <LoadingRows rows={2} className="mt-3" />
  if (q.error && !q.data) return <ErrorState compact message={q.error.message} onRetry={q.reload} />
  const d = q.data
  if (!d) return null
  const onCase = (v: BgvView) => q.setData((p) => (p ? { ...p, case: v } : p))

  if (!d.case || (d.case.view === 'full' && d.case.status === 'cancelled' && d.in_bgv_stage && d.can?.verify)) {
    const canStart = d.in_bgv_stage && d.can?.verify
    return (
      <div className="mt-3 space-y-3">
        {d.case?.view === 'full' && <p className="text-sm text-muted-foreground">{t('hiring.theLastBackgroundCheckWasCancelled')}</p>}
        {!d.case && <EmptyState compact illustration="security" title={t('hiring.noBackgroundCheckYet')} description={canStart ? t('hiring.startOneToSendTheCandidate74e') : t('hiring.itStartsWhenTheCandidateReaches801')} />}
        {canStart && (
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <label htmlFor={`bgv-region-${applicationId}`} className="text-xs font-medium text-muted-foreground">{t('hiring.region')}</label>
              <NativeSelect id={`bgv-region-${applicationId}`} value={region} onChange={setRegion} className="h-9 w-48" options={[{ value: 'auto', label: t('hiring.fromTheStageCandidate') }, { value: 'IN', label: t('hiring.india') }, { value: 'US', label: t('hiring.unitedStates') }]} />
            </div>
            <Button size="sm" className="min-h-9" disabled={busy} onClick={async () => {
              setBusy(true); setErr(null)
              try {
                await atsSend('/api/ats/bgv', 'POST', { application_id: applicationId, ...(region !== 'auto' ? { region } : {}) })
                addToast({ type: 'success', title: t('hiring.backgroundCheckStarted') })
                q.reload()
              } catch (e) {
                setErr(errorMessage(e))
              } finally {
                setBusy(false)
              }
            }}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <ShieldCheck className="h-4 w-4" aria-hidden />} {d.case ? t('hiring.restartBackgroundCheck') : t('hiring.startBackgroundCheck')}
            </Button>
          </div>
        )}
        <InlineError message={err} />
      </div>
    )
  }
  if (d.case.view === 'summary') return <SummaryPanel c={d.case} />
  if (d.case.view === 'client') return <p className="mt-2 text-sm text-muted-foreground">{t('hiring.backgroundCheckResult', { result: d.case.result })}</p>
  return <FullPanel data={d as Resp & { case: BgvFullView }} onCase={onCase} reload={q.reload} />
}

export default BgvPanel
