'use client'

/**
 * Campus — the student's side of the placement portal: join a college (invite
 * link or college email), see drives with eligibility, apply, track
 * applications and offers. Placement staff get a link to the console; an
 * organisation admin can set their organisation up as a college here.
 * Every record shown is the signed-in student's own (GET /api/campus/me).
 */
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowRight, Briefcase, CalendarDays, GraduationCap, School } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useToast } from '@/lib/toast-context'
import { PageHeader, Panel, Section } from '@/components/app/page-kit'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonList, SkeletonText } from '@/components/ui/skeleton-boneyard'
import { Field, StatusPill, ctcRange, errorOf, fieldClass, fmtDate, money } from '@/components/campus/shared'

interface DriveCard {
  id: string; title: string; company: string; role_title: string; description: string
  ctc_minor_min: number | null; ctc_minor_max: number | null; currency: string
  schedule: { apply_by: string; test_at: string | null; interview_at: string | null }
  status: string; process: { mode: string; pattern_id: string | null; external_url: string | null }
  eligible: boolean; reasons: string[]; open: boolean
  application: { id: string; status: string; applied_at: string } | null
}
interface Membership {
  college: { id: string; name: string; slug: string }
  student: { id: string; name: string; email: string; roll_no: string | null; status: string; cgpa: number | null; backlogs: number; department: string | null; batch: string | null }
  drives: DriveCard[]
  offers: Array<{ id: string; company_name: string; role_title: string; ctc_minor: number; currency: string; joining_date: string | null; status: string }>
}
interface MeResponse {
  memberships: Membership[]
  joinable: Array<{ slug: string; name: string; city: string | null }>
  staff: { role: string; college?: string } | null
  can_onboard: boolean
}

export default function CampusPage() {
  return (
    <Suspense fallback={<div className="w-full space-y-6" aria-busy="true"><SkeletonText lines={2} /><SkeletonList count={4} /></div>}>
      <CampusInner />
    </Suspense>
  )
}

function CampusInner() {
  const gate = usePageGuard('user')
  const addToast = useToast()
  const params = useSearchParams()
  const router = useRouter()
  const invite = params.get('invite')
  const [data, setData] = useState<MeResponse | null>(null)
  const [error, setError] = useState(false)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    if (!gate.ready) return
    let live = true
    setError(false)
    fetch('/api/campus/me', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => { if (live) setData(d) })
      .catch(() => { if (live) setError(true) })
    return () => { live = false }
  }, [gate.ready, reload])

  const refresh = useCallback(() => setReload((n) => n + 1), [])

  if (!gate.ready || (!data && !error)) {
    return <div className="w-full space-y-6" aria-busy="true"><SkeletonText lines={2} /><SkeletonList count={4} /></div>
  }

  return (
    <div className="w-full space-y-8">
      <PageHeader
        icon={<GraduationCap aria-hidden />}
        title="Campus"
        description="Placement drives from your college, your applications and offers."
        actions={data?.staff ? (
          <Button asChild size="sm"><Link href="/dashboard/placement">Open placement console</Link></Button>
        ) : undefined}
      />

      {error && <EmptyState illustration="error" title="We couldn't load your campus page" description="Check your connection and try again." actionLabel="Try again" onAction={refresh} />}

      {data && invite && (
        <InviteJoin token={invite} onDone={(msg) => { addToast({ type: 'success', title: msg }); router.replace('/dashboard/campus'); refresh() }} />
      )}

      {data?.can_onboard && <OnboardCollege onDone={() => { addToast({ type: 'success', title: 'Your college is set up' }); router.push('/dashboard/placement') }} />}

      {data && !invite && data.memberships.length === 0 && !data.staff && (
        <SelfJoin colleges={data.joinable} onDone={(msg) => { addToast({ type: 'success', title: msg }); refresh() }} />
      )}

      {data?.memberships.map((m) => <MembershipView key={m.college.id} m={m} onChange={refresh} />)}
    </div>
  )
}

function InviteJoin({ token, onDone }: { token: string; onDone: (msg: string) => void }) {
  const [roll, setRoll] = useState('')
  const [needsRoll, setNeedsRoll] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const done = useRef(onDone)
  useEffect(() => { done.current = onDone }, [onDone])
  const started = useRef(false)
  const submit = useCallback(async (rollNo?: string) => {
    setBusy(true)
    setMsg(null)
    try {
      const r = await csrfFetch('/api/campus/join', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, ...(rollNo ? { roll_no: rollNo } : {}) }) })
      if (!r.ok) { setMsg(await errorOf(r)); if (r.status === 403) setNeedsRoll(true); return }
      const d = await r.json()
      if (d.needs_roll_no) { setNeedsRoll(true); setMsg('Your account email is not on your college domain. Enter your roll number to verify.'); return }
      done.current(`You joined ${d.college}`)
    } finally { setBusy(false) }
  }, [token])

  // Try once on arrival: a college-domain account is verified without typing anything.
  useEffect(() => {
    if (started.current) return
    started.current = true
    void submit()
  }, [submit])

  return (
    <Panel>
      <h2 className="text-lg font-semibold text-foreground">Join your college</h2>
      {msg && <p className="mt-2 text-sm text-muted-foreground" role="status">{msg}</p>}
      {needsRoll && (
        <form className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={(e) => { e.preventDefault(); void submit(roll) }}>
          <Field id="roll" label="Roll number" className="sm:w-64">
            <Input id="roll" value={roll} onChange={(e) => setRoll(e.target.value)} autoComplete="off" required maxLength={40} />
          </Field>
          <Button type="submit" disabled={busy || !roll.trim()} className="min-h-11">Verify</Button>
        </form>
      )}
      {busy && !needsRoll && <p className="mt-2 text-sm text-muted-foreground">Checking your invitation…</p>}
    </Panel>
  )
}

function SelfJoin({ colleges, onDone }: { colleges: MeResponse['joinable']; onDone: (msg: string) => void }) {
  const [college, setCollege] = useState('')
  const [roll, setRoll] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  if (!colleges.length) {
    return <EmptyState illustration="team" title="No college linked yet" description="When your placement office invites you, open the link in the email to join. You'll see drives you're eligible for here." />
  }
  return (
    <Panel>
      <h2 className="text-lg font-semibold text-foreground">Join your college</h2>
      <p className="mt-1 text-sm text-muted-foreground">Use the invite link from your placement office, or join here if you signed up with your college email.</p>
      <form
        className="mt-4 grid gap-4 sm:grid-cols-[1fr_200px_auto] sm:items-end"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true); setErr(null)
          try {
            const r = await csrfFetch('/api/campus/join', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ college, roll_no: roll }) })
            if (!r.ok) { setErr(await errorOf(r)); return }
            const d = await r.json()
            onDone(d.status === 'already_joined' ? 'You are already a member' : `You joined ${d.college}`)
          } finally { setBusy(false) }
        }}
      >
        <Field id="college" label="College">
          <select id="college" className={fieldClass} value={college} onChange={(e) => setCollege(e.target.value)} required>
            <option value="">Select your college</option>
            {colleges.map((c) => <option key={c.slug} value={c.slug}>{c.name}{c.city ? ` — ${c.city}` : ''}</option>)}
          </select>
        </Field>
        <Field id="self-roll" label="Roll number">
          <Input id="self-roll" value={roll} onChange={(e) => setRoll(e.target.value)} required maxLength={40} autoComplete="off" />
        </Field>
        <Button type="submit" disabled={busy || !college || !roll.trim()} className="min-h-11">Join</Button>
      </form>
      {err && <p className="mt-3 text-sm text-destructive" role="alert">{err}</p>}
    </Panel>
  )
}

function OnboardCollege({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [domains, setDomains] = useState('')
  const [city, setCity] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  return (
    <Panel>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Run placements for your college</h2>
          <p className="mt-1 text-sm text-muted-foreground">Set your organisation up as a college to invite students, track readiness and run placement drives.</p>
        </div>
        {!open && <Button variant="outline" onClick={() => setOpen(true)} className="min-h-11"><School className="mr-2 h-4 w-4" aria-hidden />Set up your college</Button>}
      </div>
      {open && (
        <form
          className="mt-4 grid gap-4 sm:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault()
            setBusy(true); setErr(null)
            try {
              const r = await csrfFetch('/api/campus/college', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, city: city || null, email_domains: domains }) })
              if (!r.ok) { setErr(await errorOf(r)); return }
              onDone()
            } finally { setBusy(false) }
          }}
        >
          <Field id="cname" label="College name"><Input id="cname" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={160} /></Field>
          <Field id="ccity" label="City"><Input id="ccity" value={city} onChange={(e) => setCity(e.target.value)} maxLength={80} /></Field>
          <Field id="cdomains" label="College email domains" hint="Comma separated, e.g. college.edu. Students on these domains are verified automatically." className="sm:col-span-2">
            <Input id="cdomains" value={domains} onChange={(e) => setDomains(e.target.value)} placeholder="college.edu" />
          </Field>
          {err && <p className="text-sm text-destructive sm:col-span-2" role="alert">{err}</p>}
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" disabled={busy} className="min-h-11">Set up college</Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} className="min-h-11">Cancel</Button>
          </div>
        </form>
      )}
    </Panel>
  )
}

function MembershipView({ m, onChange }: { m: Membership; onChange: () => void }) {
  const addToast = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const open = m.drives.filter((d) => d.open && !d.application)
  const mine = m.drives.filter((d) => d.application)

  const apply = async (d: DriveCard) => {
    setBusy(d.id)
    try {
      const r = await csrfFetch(`/api/campus/drives/${d.id}/apply`, { method: 'POST' })
      if (!r.ok) { addToast({ type: 'error', title: await errorOf(r) }); return }
      const j = await r.json()
      if (j.warning) addToast({ type: 'warning', title: j.warning })
      else addToast({ type: 'success', title: `Applied to ${d.company}` })
      if (j.next?.href && j.next.kind === 'company_test') addToast({ type: 'info', title: 'Next: take the company test from the drive card' })
      onChange()
    } finally { setBusy(null) }
  }
  const withdraw = async (d: DriveCard) => {
    setBusy(d.id)
    try {
      const r = await csrfFetch(`/api/campus/drives/${d.id}/apply`, { method: 'DELETE' })
      if (!r.ok) addToast({ type: 'error', title: await errorOf(r) })
      onChange()
    } finally { setBusy(null) }
  }

  return (
    <div className="space-y-6">
      <Panel className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{m.college.name}</p>
          <p className="text-lg font-semibold text-foreground">{m.student.name}</p>
          <p className="text-sm text-muted-foreground">{[m.student.department, m.student.batch, m.student.roll_no].filter(Boolean).join(' · ') || 'Your placement office will add your department and batch'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <StatusPill status={m.student.status} />
          {m.student.cgpa !== null && <span className="tabular-nums text-muted-foreground">CGPA {m.student.cgpa}</span>}
          <Link href={`/leagues/colleges/${m.college.slug}`} className="inline-flex items-center gap-1 font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">College league <ArrowRight className="h-4 w-4" aria-hidden /></Link>
        </div>
      </Panel>
      {m.student.status !== 'verified' && (
        <p className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200" role="status">
          Your account isn't verified yet, so you can't apply to drives. Open the invite link again and enter your roll number, or ask your placement office to verify you.
        </p>
      )}

      <Section title="Open drives" description="Drives you can apply to now.">
        {open.length === 0 ? (
          <EmptyState compact illustration="jobs" title="No open drives right now" description="You'll get a notification when your placement office opens a drive you're eligible for." />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {open.map((d) => (
              <Panel key={d.id} className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-primary">{d.company}</p>
                    <h3 className="text-base font-semibold text-foreground">{d.role_title}</h3>
                  </div>
                  {d.eligible ? <StatusPill status="open" /> : <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">Not eligible</span>}
                </div>
                {d.description && <p className="line-clamp-3 text-sm text-muted-foreground">{d.description}</p>}
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4" aria-hidden />Apply by {fmtDate(d.schedule.apply_by)}</span>
                  {ctcRange(d.ctc_minor_min, d.ctc_minor_max, d.currency) && <span className="tabular-nums">CTC {ctcRange(d.ctc_minor_min, d.ctc_minor_max, d.currency)}</span>}
                </div>
                {!d.eligible && <ul className="list-disc pl-5 text-sm text-muted-foreground">{d.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
                <div className="mt-auto">
                  <Button onClick={() => apply(d)} disabled={!d.eligible || busy === d.id} className="min-h-11"><Briefcase className="mr-2 h-4 w-4" aria-hidden />Apply</Button>
                </div>
              </Panel>
            ))}
          </div>
        )}
      </Section>

      <Section title="My applications">
        {mine.length === 0 ? (
          <EmptyState compact illustration="inbox" title="No applications yet" description="Drives you apply to show up here with their next step." />
        ) : (
          <div className="space-y-3">
            {mine.map((d) => (
              <Panel key={d.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">{d.company} · {d.role_title}</p>
                  <p className="text-sm text-muted-foreground">Applied {fmtDate(d.application!.applied_at)}{d.schedule.test_at ? ` · Test ${fmtDate(d.schedule.test_at)}` : ''}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill status={d.application!.status} />
                  {d.process.mode === 'company_test' && d.process.pattern_id && d.application!.status !== 'withdrawn' && (
                    <Button asChild size="sm" variant="outline"><Link href={`/dashboard/company-tests/${encodeURIComponent(d.process.pattern_id)}`}>Take the test</Link></Button>
                  )}
                  {d.process.mode === 'external' && d.process.external_url && (
                    <Button asChild size="sm" variant="outline"><a href={d.process.external_url} target="_blank" rel="noopener noreferrer">Company form</a></Button>
                  )}
                  {['applied', 'shortlisted'].includes(d.application!.status) && (
                    <Button size="sm" variant="ghost" onClick={() => withdraw(d)} disabled={busy === d.id}>Withdraw</Button>
                  )}
                </div>
              </Panel>
            ))}
          </div>
        )}
      </Section>

      {m.offers.length > 0 && (
        <Section title="My offers">
          <div className="grid gap-4 md:grid-cols-2">
            {m.offers.map((o) => (
              <Panel key={o.id} className="space-y-1 p-5">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-foreground">{o.company_name}</p>
                  <StatusPill status={o.status} />
                </div>
                <p className="text-sm text-muted-foreground">{o.role_title}</p>
                <p className="text-lg font-bold tabular-nums text-foreground">{money(o.ctc_minor, o.currency)}<span className="ml-1 text-sm font-normal text-muted-foreground">per year</span></p>
                {o.joining_date && <p className="text-sm text-muted-foreground">Joining {fmtDate(o.joining_date)}</p>}
              </Panel>
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}
