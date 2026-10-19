'use client'

/**
 * Candidate HR form (public, signed link — no account needed). The candidate
 * confirms compensation for the HR round: experienced → current or last drawn
 * CTC, breakup, expected CTC, notice; fresher → expected CTC and when they can
 * join. Prefilled from what they gave when applying; editable until HR decides.
 */
import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Loader2, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/app/page-kit'
import { Illustration, SoftGlow } from '@/components/visuals'
import { csrfFetch } from '@/lib/csrf-fetch'
import { CompensationFields, draftFrom, draftToBody, emptyDraft, type CompDraft } from '@/components/hiring/compensation-fields'
import { parseCompensation } from '@/lib/ats/compensation'
import type { Compensation } from '@/lib/ats/contract'

interface Info {
  company: string
  job_title: string
  candidate_name: string
  open: boolean
  status: string
  deadline: string | null
  submitted_at: string | null
  country: string | null
  currency: string
  hourly_allowed: boolean
  prefill: Partial<Compensation> | null
}

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })

export default function HrFormPage() {
  const { token = '' } = useParams<{ token: string }>()
  const [info, setInfo] = useState<Info | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [draft, setDraft] = useState<CompDraft>(() => emptyDraft())
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/ats/hr-form?token=${encodeURIComponent(token)}`, { cache: 'no-store' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setLoadError(j.error || 'This link is not valid.'); return }
      setInfo(j)
      setDraft(j.prefill ? draftFrom(j.prefill, j.country) : { ...emptyDraft(j.country), currency: j.currency })
      setLoadError(null)
    } catch {
      setLoadError('Could not load the form. Check your connection and try again.')
    }
  }, [token])
  useEffect(() => { void load() }, [load])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const body = draftToBody(draft)
    const check = parseCompensation(body, { source: 'hr_form', country: info?.country, allowHourly: info?.hourly_allowed })
    if (!check.ok) { setError(check.errors[0]); return }
    setBusy(true)
    try {
      const r = await csrfFetch('/api/ats/hr-form', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, token }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) setError(j.error || 'Could not save your details.')
      else setDone(true)
    } catch {
      setError('Something went wrong. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  const shell = (children: React.ReactNode) => (
    <main className="relative isolate flex min-h-[85vh] items-center justify-center bg-background px-4 py-10">
      <SoftGlow />
      <Panel className="w-full max-w-lg p-6 sm:p-8">{children}</Panel>
    </main>
  )

  if (!info && !loadError) {
    return <div className="flex min-h-[70vh] items-center justify-center bg-background"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground motion-reduce:animate-none" aria-label="Loading the form" /></div>
  }
  if (loadError || !info) {
    return shell(
      <div className="text-center">
        <Illustration name="locked" className="mx-auto w-36" />
        <h1 className="mt-3 text-lg font-semibold text-foreground">This link doesn&apos;t work</h1>
        <p className="mt-1 text-sm text-muted-foreground">{loadError}</p>
      </div>,
    )
  }
  if (done) {
    return shell(
      <div className="text-center" role="status">
        <Illustration name="success" className="mx-auto w-36" />
        <h1 className="mt-3 text-lg font-semibold text-foreground">Thanks, {info.candidate_name.split(' ')[0] || 'there'}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Your details are with the {info.company} hiring team. You can reopen this link to correct them until they decide.</p>
      </div>,
    )
  }
  if (!info.open) {
    return shell(
      <div className="text-center">
        <Illustration name="inbox" className="mx-auto w-36" />
        <h1 className="mt-3 text-lg font-semibold text-foreground">This form is closed</h1>
        <p className="mt-1 text-sm text-muted-foreground">The hiring team has already moved your {info.job_title} application forward. They&apos;ll be in touch.</p>
      </div>,
    )
  }

  return shell(
    <form onSubmit={submit} noValidate className="space-y-5">
      <header>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{info.company} · HR round</p>
        <h1 className="mt-1 text-xl font-semibold text-foreground">Confirm your compensation</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          For the {info.job_title} role.{info.deadline ? ` Please complete it by ${day(info.deadline)}.` : ''}
          {info.submitted_at ? ' You already sent this — update anything that changed.' : ''}
        </p>
      </header>
      <CompensationFields idPrefix="hr-form" value={draft} onChange={setDraft} hourlyAllowed={info.hourly_allowed} showNegotiable />
      {error && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</p>}
      <Button type="submit" className="min-h-11 w-full rounded-full" disabled={busy || !draft.experience_level}>
        {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />}
        {busy ? 'Saving…' : info.submitted_at ? 'Update my details' : 'Submit'}
      </Button>
      <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <Lock className="h-3 w-3" aria-hidden /> Shared only with the hiring team. Payslips or offer letters are asked for later, in background verification.
      </p>
    </form>,
  )
}
