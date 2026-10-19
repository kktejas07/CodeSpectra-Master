'use client'

/**
 * Candidate background-verification portal (public, signed link; no account).
 * Wizard: consent (India: DPDP notice + e-sign; USA: standalone FCRA
 * disclosure, then authorization + state notices + e-sign) → one step per
 * check (form + uploads, save as draft) → review & submit. After submitting
 * the page is read-only with a status per check; a check the verifier
 * reopened ("more info needed") becomes editable again.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Circle, Clock, Loader2, Mail, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Panel } from '@/components/app/page-kit'
import { Illustration, SoftGlow } from '@/components/visuals'
import { NativeSelect } from '@/components/hiring/ui'
import { checkDef, REGION_LABELS, US_STATES, type CheckDef } from '@/lib/ats/bgv/catalog'
import type { BgvCheckType, BgvRegion } from '@/lib/ats/contract'
import { csrfFetch } from '@/lib/csrf-fetch'
import { cn } from '@/lib/utils'
import { CheckForm, type PortalDoc } from './check-form'

interface PortalCheck {
  type: BgvCheckType
  status: string
  candidate_input: boolean
  data: Record<string, unknown>
  documents: PortalDoc[]
  missing: string[]
  editable: boolean
  info_request: { message: string; at: string } | null
}
interface View {
  case_id: string
  region: BgvRegion
  status: string
  company: string
  job_title: string
  candidate_name: string
  deadline: string | null
  submitted_at: string | null
  purged: boolean
  options: { employment_years: number | null; address_years: number | null; references_count: number }
  consent: { signed_at: string; version: string; name: string; state: string | null } | null
  texts: {
    consent: { version: string; text: string }
    disclosure: { version: string; text: string } | null
    state_notices: { state: string; title: string; text: string; version: string }[]
  } | null
  checks: PortalCheck[]
}

const STATUS: Record<string, { label: string; variant: 'outline' | 'info' | 'success' | 'warning' | 'danger' | 'secondary' }> = {
  not_started: { label: 'To do', variant: 'outline' },
  submitted: { label: 'Submitted', variant: 'info' },
  in_progress: { label: 'Being verified', variant: 'info' },
  verified: { label: 'Verified', variant: 'success' },
  discrepancy: { label: 'Under review', variant: 'warning' },
  unable_to_verify: { label: 'Under review', variant: 'warning' },
  waived: { label: 'Not required', variant: 'secondary' },
}
const CASE_STATUS: Record<string, string> = {
  invited: 'Not started', in_progress: 'In progress', submitted: 'Submitted — waiting for verification', verifying: 'Being verified',
  clear: 'Completed', consider: 'Under review by the hiring team', failed: 'Closed', cancelled: 'Closed',
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })

function LegalText({ text, label }: { text: string; label: string }) {
  return (
    <div tabIndex={0} role="document" aria-label={label} className="max-h-[50vh] overflow-y-auto whitespace-pre-wrap rounded-2xl border border-border bg-muted/30 p-4 text-sm leading-relaxed text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {text}
    </div>
  )
}

export default function BgvPortalPage() {
  const { token = '' } = useParams<{ token: string }>()
  const [view, setView] = useState<View | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [step, setStep] = useState<number>(0)
  const [drafts, setDrafts] = useState<Record<string, Record<string, unknown>>>({})
  const [dirty, setDirty] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string; list?: string[] } | null>(null)
  const [consentForm, setConsentForm] = useState({ name: '', agree: false, disclosureAck: false, state: '' })
  const [usPage, setUsPage] = useState<'disclosure' | 'authorization'>('disclosure')
  const [resent, setResent] = useState<string | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)

  const adopt = useCallback((v: View, keepStep = true) => {
    setView(v)
    setDrafts(Object.fromEntries(v.checks.map((k) => [k.type, structuredClone(k.data || {})])))
    setDirty({})
    if (!keepStep) setStep(0)
  }, [])

  useEffect(() => {
    let off = false
    ;(async () => {
      try {
        const r = await fetch(`/api/ats/bgv/portal?token=${encodeURIComponent(token)}`, { cache: 'no-store' })
        const j = await r.json().catch(() => ({}))
        if (off) return
        if (!r.ok) setLoadError(j.error || 'This link is not valid.')
        else adopt(j, false)
      } catch {
        if (!off) setLoadError('Could not load your verification. Check your connection and try again.')
      }
    })()
    return () => { off = true }
  }, [token, adopt])

  // Steps: the checks the candidate fills in, then review.
  const formChecks = useMemo(() => (view?.checks || []).filter((k) => k.candidate_input), [view])
  const reopened = formChecks.filter((k) => k.info_request && k.editable)
  const stepChecks = view?.submitted_at ? reopened : formChecks
  const reviewStep = stepChecks.length
  const current = step < stepChecks.length ? stepChecks[step] : null

  useEffect(() => { headingRef.current?.focus() }, [step, view?.consent?.signed_at, usPage])

  async function post(body: Record<string, unknown>, key: string): Promise<View | null> {
    setBusy(key); setMsg(null)
    try {
      const r = await csrfFetch('/api/ats/bgv/portal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, ...body }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        const list = j.errors || (j.missing ? Object.entries(j.missing as Record<string, string[]>).flatMap(([t, m]) => m.map((x) => `${checkDef(view!.region, t as BgvCheckType)?.label || t}: ${x}`)) : undefined)
        setMsg({ ok: false, text: j.error || 'Something went wrong. Try again.', list })
        return null
      }
      return j as View
    } catch {
      setMsg({ ok: false, text: 'Could not save. Check your connection and try again.' })
      return null
    } finally {
      setBusy(null)
    }
  }

  async function save(k: PortalCheck, quiet = false): Promise<boolean> {
    if (!dirty[k.type]) return true
    const v = await post({ action: 'save', check: k.type, data: drafts[k.type] }, `save:${k.type}`)
    if (!v) return false
    adopt(v)
    if (!quiet) setMsg({ ok: true, text: 'Saved. You can come back to this link any time.' })
    return true
  }

  async function upload(k: PortalCheck, slot: string, item: number | null, file: File) {
    if (file.size > 10 * 1024 * 1024) { setMsg({ ok: false, text: 'Files can be up to 10 MB.' }); return }
    // Save typed data first so a reload doesn't lose it.
    if (dirty[k.type] && !(await save(k, true))) return
    setBusy(`${slot}:${item ?? '-'}`); setMsg(null)
    try {
      const fd = new FormData()
      fd.set('token', token); fd.set('check', k.type); fd.set('slot', slot)
      if (item !== null) fd.set('item', String(item))
      fd.set('file', file)
      const r = await csrfFetch('/api/ats/bgv/portal/upload', { method: 'POST', body: fd })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) setMsg({ ok: false, text: j.error || 'Upload failed. Try again.' })
      else { adopt(j); setMsg({ ok: true, text: `${file.name} uploaded.` }) }
    } catch {
      setMsg({ ok: false, text: 'Upload failed. Check your connection and try again.' })
    } finally {
      setBusy(null)
    }
  }

  async function remove(id: string) {
    const v = await post({ action: 'remove_document', document_id: id }, `rm:${id}`)
    if (v) adopt(v)
  }

  async function go(to: number) {
    if (current && current.editable && !(await save(current, true))) return
    setMsg(null)
    setStep(Math.max(0, Math.min(reviewStep, to)))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function submit() {
    const v = await post({ action: 'submit' }, 'submit')
    if (v) { adopt(v, false); setMsg({ ok: true, text: "Thank you — you've submitted your verification. We'll email you if anything else is needed." }) }
  }

  async function sign() {
    const v = await post({ action: 'consent', name: consentForm.name, agree: consentForm.agree, disclosure_ack: consentForm.disclosureAck, state: consentForm.state || undefined }, 'consent')
    if (v) { adopt(v, false); setMsg({ ok: true, text: 'Consent recorded. Next, fill in each section.' }) }
  }

  async function requestNewLink() {
    setBusy('resend')
    try {
      const r = await csrfFetch('/api/ats/bgv/portal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, action: 'resend' }) })
      const j = await r.json().catch(() => ({}))
      setResent(j.message || j.error || 'Request sent.')
    } catch {
      setResent('Could not send the request. Try again later.')
    } finally {
      setBusy(null)
    }
  }

  const shell = (children: React.ReactNode) => (
    <main className="relative isolate min-h-screen bg-background px-4 py-8 sm:py-12">
      <SoftGlow />
      <div className="mx-auto w-full max-w-3xl">{children}</div>
    </main>
  )

  if (loadError) {
    return shell(
      <Panel className="p-6 text-center sm:p-8">
        <Illustration name="locked" className="mx-auto w-36" />
        <h1 className="mt-3 text-lg font-semibold text-foreground">This link doesn&apos;t work any more</h1>
        <p className="mt-1 text-sm text-muted-foreground">{loadError}</p>
        {resent ? (
          <p role="status" className="mt-4 text-sm text-foreground">{resent}</p>
        ) : (
          <Button className="mt-5 min-h-11" onClick={() => void requestNewLink()} disabled={busy === 'resend'}>
            {busy === 'resend' ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Mail className="h-4 w-4" aria-hidden />} Email me a new link
          </Button>
        )}
      </Panel>,
    )
  }
  if (!view) {
    return <div className="flex min-h-[70vh] items-center justify-center bg-background"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground motion-reduce:animate-none" aria-label="Loading your verification" /></div>
  }

  const header = (
    <div className="mb-5 flex items-start gap-4">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary"><ShieldCheck className="h-5 w-5" aria-hidden /></span>
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground">{view.company} · {view.job_title}</p>
        <p className="text-base font-semibold text-foreground">Background verification ({REGION_LABELS[view.region]})</p>
        <p className="text-sm text-muted-foreground">
          {CASE_STATUS[view.status] || view.status}
          {!view.submitted_at && view.deadline ? ` · please finish by ${fmtDate(view.deadline)}` : ''}
        </p>
      </div>
    </div>
  )
  const banner = msg && (
    <div role={msg.ok ? 'status' : 'alert'} aria-live="polite" className={cn('mb-4 rounded-xl border px-3 py-2 text-sm', msg.ok ? 'border-green-500/30 bg-green-500/10 text-green-800 dark:text-green-300' : 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400')}>
      <p className="flex items-start gap-2">{msg.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}{msg.text}</p>
      {msg.list && msg.list.length > 0 && <ul className="mt-1 list-disc pl-8">{msg.list.slice(0, 12).map((x) => <li key={x}>{x}</li>)}</ul>}
    </div>
  )

  if (view.purged || ['cancelled', 'failed'].includes(view.status) && !view.submitted_at) {
    return shell(
      <Panel className="p-6 sm:p-8">
        {header}
        <p className="text-sm text-muted-foreground">This verification is closed. Contact the hiring team if you have questions.</p>
      </Panel>,
    )
  }

  // ─── Consent ───────────────────────────────────────────────────────────────
  if (!view.consent && view.texts) {
    const t = view.texts
    const us = view.region === 'US'
    if (us && usPage === 'disclosure' && t.disclosure) {
      return shell(
        <Panel className="space-y-4 p-6 sm:p-8">
          {header}
          <h1 ref={headingRef} tabIndex={-1} className="text-xl font-semibold text-foreground focus:outline-none">Disclosure regarding background investigation</h1>
          <LegalText text={t.disclosure.text} label="Disclosure" />
          <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm text-foreground">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--primary)]" checked={consentForm.disclosureAck} onChange={(e) => setConsentForm({ ...consentForm, disclosureAck: e.target.checked })} />
            I have read this disclosure.
          </label>
          <Button className="min-h-11" disabled={!consentForm.disclosureAck} onClick={() => setUsPage('authorization')}>Continue <ChevronRight className="h-4 w-4" aria-hidden /></Button>
        </Panel>,
      )
    }
    const notices = us ? t.state_notices.filter((n) => !consentForm.state || n.state === consentForm.state) : []
    return shell(
      <Panel className="space-y-4 p-6 sm:p-8">
        {header}
        {banner}
        <h1 ref={headingRef} tabIndex={-1} className="text-xl font-semibold text-foreground focus:outline-none">{us ? 'Authorization' : 'Your consent'}</h1>
        <p className="text-sm text-muted-foreground">{us ? 'Read the authorization below and sign it to continue.' : 'Before you share anything, please read how your data will be used.'}</p>
        <LegalText text={t.consent.text} label={us ? 'Authorization' : 'Consent notice'} />
        {us && (
          <div className="space-y-3">
            <div className="max-w-xs space-y-1.5">
              <label htmlFor="bgv-state" className="text-sm font-medium text-foreground">State you live or will work in</label>
              <NativeSelect id="bgv-state" value={consentForm.state} onChange={(v) => setConsentForm({ ...consentForm, state: v })} options={US_STATES.map((s) => ({ value: s, label: s }))} placeholder="Choose…" className="h-11" />
            </div>
            {notices.length > 0 && consentForm.state && notices.map((n) => (
              <div key={n.state}><p className="mb-1 text-sm font-medium text-foreground">{n.title}</p><LegalText text={n.text} label={n.title} /></div>
            ))}
          </div>
        )}
        <div className="max-w-md space-y-1.5">
          <label htmlFor="bgv-sign" className="text-sm font-medium text-foreground">Type your full name to sign</label>
          <Input id="bgv-sign" className="h-11" value={consentForm.name} onChange={(e) => setConsentForm({ ...consentForm, name: e.target.value })} autoComplete="name" placeholder={view.candidate_name} />
        </div>
        <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm text-foreground">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--primary)]" checked={consentForm.agree} onChange={(e) => setConsentForm({ ...consentForm, agree: e.target.checked })} />
          {us ? 'I authorize the background investigation described above and agree that my typed name is my electronic signature.' : 'I consent to this verification and agree that my typed name is my electronic signature.'}
        </label>
        <p className="text-xs text-muted-foreground">We record the date, time and your IP address with your signature.</p>
        <div className="flex flex-wrap gap-2">
          {us && <Button variant="outline" className="min-h-11" onClick={() => setUsPage('disclosure')}><ChevronLeft className="h-4 w-4" aria-hidden /> Back</Button>}
          <Button className="min-h-11" disabled={busy === 'consent' || !consentForm.agree || consentForm.name.trim().length < 2} onClick={() => void sign()}>
            {busy === 'consent' && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />} Sign and continue
          </Button>
        </div>
      </Panel>,
    )
  }

  // ─── Read-only after submit (nothing reopened) ─────────────────────────────
  const done = formChecks.filter((k) => k.missing.length === 0).length
  const statusList = (
    <ul className="divide-y divide-border">
      {view.checks.map((k) => {
        const s = STATUS[k.status] || STATUS.not_started
        const label = checkDef(view.region, k.type)?.label || k.type
        return (
          <li key={k.type} className="flex items-center justify-between gap-3 py-3">
            <span className="text-sm text-foreground">{label}{!k.candidate_input && <span className="block text-xs text-muted-foreground">Checked by the verification provider</span>}</span>
            <Badge variant={s.variant}>{s.label}</Badge>
          </li>
        )
      })}
    </ul>
  )
  if (view.submitted_at && !reopened.length) {
    return shell(
      <Panel className="space-y-4 p-6 sm:p-8">
        {header}
        {banner}
        <h1 ref={headingRef} tabIndex={-1} className="text-xl font-semibold text-foreground focus:outline-none">Thanks — your verification is submitted</h1>
        <p className="text-sm text-muted-foreground">Submitted on {fmtDate(view.submitted_at)}. You&apos;ll get an email if the hiring team needs anything else.</p>
        {statusList}
      </Panel>,
    )
  }

  // ─── Wizard ────────────────────────────────────────────────────────────────
  const def: CheckDef | null = current ? checkDef(view.region, current.type) : null
  const pct = Math.round(((view.submitted_at ? 0 : done) / Math.max(1, formChecks.length)) * 100)
  const minItems = current?.type === 'reference' ? view.options.references_count : def?.group?.min ?? 0
  const coverage = current?.type === 'address' && view.options.address_years ? `List every address for the last ${view.options.address_years} years.`
    : current?.type === 'employment' && view.options.employment_years ? `Cover the last ${view.options.employment_years} years of employment.` : null
  const allMissing = stepChecks.flatMap((k) => k.missing.map((m) => ({ type: k.type, m })))

  return shell(
    <>
      <Panel className="mb-4 p-5 sm:p-6">
        {header}
        {!view.submitted_at && (
          <div>
            <div className="mb-1 flex justify-between text-xs text-muted-foreground"><span>{done} of {formChecks.length} sections complete</span><span className="tabular-nums">{pct}%</span></div>
            <Progress value={pct} aria-label="Sections complete" />
          </div>
        )}
        <nav aria-label="Sections" className="mt-4">
          <ol className="flex gap-2 overflow-x-auto pb-1">
            {stepChecks.map((k, i) => (
              <li key={k.type} className="shrink-0">
                <button type="button" onClick={() => void go(i)} aria-current={i === step ? 'step' : undefined}
                  className={cn('inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', i === step ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground')}>
                  {k.missing.length === 0 ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400" aria-hidden /> : <Circle className="h-3.5 w-3.5" aria-hidden />}
                  {checkDef(view.region, k.type)?.label || k.type}
                  <span className="sr-only">{k.missing.length === 0 ? ' (complete)' : ' (incomplete)'}</span>
                </button>
              </li>
            ))}
            <li className="shrink-0">
              <button type="button" onClick={() => void go(reviewStep)} aria-current={step === reviewStep ? 'step' : undefined}
                className={cn('inline-flex min-h-9 items-center rounded-full border px-3 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', step === reviewStep ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground')}>
                Review &amp; submit
              </button>
            </li>
          </ol>
        </nav>
      </Panel>

      <Panel className="p-5 sm:p-8">
        {banner}
        {current && def ? (
          <div className="space-y-5">
            <div>
              <h1 ref={headingRef} tabIndex={-1} className="text-xl font-semibold text-foreground focus:outline-none">{def.label}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{def.description}</p>
            </div>
            {current.info_request && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-foreground">
                <p className="font-medium">The hiring team asked for more information</p>
                <p className="mt-0.5 whitespace-pre-wrap">{current.info_request.message}</p>
              </div>
            )}
            <CheckForm
              def={def}
              values={drafts[current.type] || {}}
              setValues={(v) => { setDrafts((d) => ({ ...d, [current.type]: v })); setDirty((d) => ({ ...d, [current.type]: true })) }}
              docs={current.documents}
              disabled={!current.editable || !!busy?.startsWith('save')}
              busy={busy}
              onUpload={(slot, item, file) => void upload(current, slot, item, file)}
              onRemove={(id) => void remove(id)}
              minItems={minItems}
              hintText={coverage}
            />
            {current.missing.length > 0 && !dirty[current.type] && (
              <div className="rounded-xl bg-muted/50 px-3 py-2 text-sm">
                <p className="font-medium text-foreground">Still needed</p>
                <ul className="mt-1 list-disc pl-5 text-muted-foreground">{current.missing.slice(0, 10).map((m) => <li key={m}>{m}</li>)}</ul>
              </div>
            )}
            <div className="flex flex-wrap justify-between gap-2 border-t border-border pt-4">
              <Button variant="outline" className="min-h-11" disabled={step === 0 || !!busy} onClick={() => void go(step - 1)}><ChevronLeft className="h-4 w-4" aria-hidden /> Back</Button>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" className="min-h-11" disabled={!dirty[current.type] || !!busy} onClick={() => void save(current)}>
                  {busy === `save:${current.type}` && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />} Save draft
                </Button>
                <Button className="min-h-11" disabled={!!busy} onClick={() => void go(step + 1)}>Save and continue <ChevronRight className="h-4 w-4" aria-hidden /></Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div>
              <h1 ref={headingRef} tabIndex={-1} className="text-xl font-semibold text-foreground focus:outline-none">Review and submit</h1>
              <p className="mt-1 text-sm text-muted-foreground">Check that everything is complete. After you submit, you can&apos;t change your answers unless the hiring team asks for more information.</p>
            </div>
            {allMissing.length > 0 ? (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-3 text-sm">
                <p className="flex items-center gap-2 font-medium text-foreground"><Clock className="h-4 w-4" aria-hidden /> A few things are still missing</p>
                <ul className="mt-2 space-y-1">
                  {stepChecks.filter((k) => k.missing.length).map((k) => (
                    <li key={k.type}>
                      <button type="button" className="font-medium text-primary underline-offset-2 hover:underline" onClick={() => void go(stepChecks.indexOf(k))}>{checkDef(view.region, k.type)?.label}</button>
                      <span className="text-muted-foreground">: {k.missing.slice(0, 4).join(', ')}{k.missing.length > 4 ? ` and ${k.missing.length - 4} more` : ''}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="flex items-center gap-2 text-sm text-foreground"><CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" aria-hidden /> Everything we need is here.</p>
            )}
            {statusList}
            <div className="flex flex-wrap justify-between gap-2 border-t border-border pt-4">
              <Button variant="outline" className="min-h-11" disabled={!stepChecks.length || !!busy} onClick={() => void go(step - 1)}><ChevronLeft className="h-4 w-4" aria-hidden /> Back</Button>
              <Button className="min-h-11" disabled={allMissing.length > 0 || !!busy} onClick={() => void submit()}>
                {busy === 'submit' && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />} {view.submitted_at ? 'Send updates' : 'Submit verification'}
              </Button>
            </div>
          </div>
        )}
      </Panel>
    </>,
  )
}
