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
import { useT } from '@/lib/i18n/client'

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
  const { t } = useT()
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
        title={t('career.campus')}
        description={t('career.placementDrivesFromYourCollegeYour84a')}
        actions={data?.staff ? (
          <Button asChild size="sm"><Link href="/dashboard/placement">{t('career.openPlacementConsole')}</Link></Button>
        ) : undefined}
      />

      {error && <EmptyState illustration="error" title={t('career.weCouldntLoadYourCampusPage')} description={t('career.checkYourConnectionAndTryAgain')} actionLabel={t('common.tryAgain')} onAction={refresh} />}

      {data && invite && (
        <InviteJoin token={invite} onDone={(msg) => { addToast({ type: 'success', title: msg }); router.replace('/dashboard/campus'); refresh() }} />
      )}

      {data?.can_onboard && <OnboardCollege onDone={() => { addToast({ type: 'success', title: t('career.yourCollegeIsSetUp') }); router.push('/dashboard/placement') }} />}

      {data && !invite && data.memberships.length === 0 && !data.staff && (
        <SelfJoin colleges={data.joinable} onDone={(msg) => { addToast({ type: 'success', title: msg }); refresh() }} />
      )}

      {data?.memberships.map((m) => <MembershipView key={m.college.id} m={m} onChange={refresh} />)}
    </div>
  )
}

function InviteJoin({ token, onDone }: { token: string; onDone: (msg: string) => void }) {
  const { t } = useT()
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
      if (d.needs_roll_no) { setNeedsRoll(true); setMsg(t('career.yourAccountEmailIsNotOnff1')); return }
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
      <h2 className="text-lg font-semibold text-foreground">{t('career.joinYourCollege')}</h2>
      {msg && <p className="mt-2 text-sm text-muted-foreground" role="status">{msg}</p>}
      {needsRoll && (
        <form className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={(e) => { e.preventDefault(); void submit(roll) }}>
          <Field id="roll" label={t('career.rollNumber')} className="sm:w-64">
            <Input id="roll" value={roll} onChange={(e) => setRoll(e.target.value)} autoComplete="off" required maxLength={40} />
          </Field>
          <Button type="submit" disabled={busy || !roll.trim()} className="min-h-11">{t('career.verify')}</Button>
        </form>
      )}
      {busy && !needsRoll && <p className="mt-2 text-sm text-muted-foreground">{t('career.checkingYourInvitation')}</p>}
    </Panel>
  )
}

function SelfJoin({ colleges, onDone }: { colleges: MeResponse['joinable']; onDone: (msg: string) => void }) {
  const { t } = useT()
  const [college, setCollege] = useState('')
  const [roll, setRoll] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  if (!colleges.length) {
    return <EmptyState illustration="team" title={t('career.noCollegeLinkedYet')} description={t('career.whenYourPlacementOfficeInvitesYou795')} />
  }
  return (
    <Panel>
      <h2 className="text-lg font-semibold text-foreground">{t('career.joinYourCollege')}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t('career.useTheInviteLinkFromYourd14')}</p>
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
        <Field id="college" label={t('career.college')}>
          <select id="college" className={fieldClass} value={college} onChange={(e) => setCollege(e.target.value)} required>
            <option value="">{t('career.selectYourCollege')}</option>
            {colleges.map((c) => <option key={c.slug} value={c.slug}>{c.name}{c.city ? ` — ${c.city}` : ''}</option>)}
          </select>
        </Field>
        <Field id="self-roll" label={t('career.rollNumber')}>
          <Input id="self-roll" value={roll} onChange={(e) => setRoll(e.target.value)} required maxLength={40} autoComplete="off" />
        </Field>
        <Button type="submit" disabled={busy || !college || !roll.trim()} className="min-h-11">{t('career.join')}</Button>
      </form>
      {err && <p className="mt-3 text-sm text-destructive" role="alert">{err}</p>}
    </Panel>
  )
}

function OnboardCollege({ onDone }: { onDone: () => void }) {
  const { t } = useT()
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
          <h2 className="text-lg font-semibold text-foreground">{t('career.runPlacementsForYourCollege')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('career.setYourOrganisationUpAsA9e0')}</p>
        </div>
        {!open && <Button variant="outline" onClick={() => setOpen(true)} className="min-h-11"><School className="mr-2 h-4 w-4" aria-hidden />{t('career.setUpYourCollege')}</Button>}
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
          <Field id="cname" label={t('career.collegeName')}><Input id="cname" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={160} /></Field>
          <Field id="ccity" label={t('career.city')}><Input id="ccity" value={city} onChange={(e) => setCity(e.target.value)} maxLength={80} /></Field>
          <Field id="cdomains" label={t('career.collegeEmailDomains')} hint={t('career.commaSeparatedEGCollegeEdu5dc')} className="sm:col-span-2">
            <Input id="cdomains" value={domains} onChange={(e) => setDomains(e.target.value)} placeholder="college.edu" />
          </Field>
          {err && <p className="text-sm text-destructive sm:col-span-2" role="alert">{err}</p>}
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" disabled={busy} className="min-h-11">{t('career.setUpCollege')}</Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} className="min-h-11">{t('common.cancel')}</Button>
          </div>
        </form>
      )}
    </Panel>
  )
}

function MembershipView({ m, onChange }: { m: Membership; onChange: () => void }) {
  const { t } = useT()
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
      else addToast({ type: 'success', title: t('career.appliedToCompany', { company: d.company }) })
      if (j.next?.href && j.next.kind === 'company_test') addToast({ type: 'info', title: t('career.nextTakeTheCompanyTestFrom193') })
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
          <p className="text-sm text-muted-foreground">{[m.student.department, m.student.batch, m.student.roll_no].filter(Boolean).join(' · ') || t('career.yourPlacementOfficeWillAddYour7b9')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <StatusPill status={m.student.status} />
          {m.student.cgpa !== null && <span className="tabular-nums text-muted-foreground">CGPA {m.student.cgpa}</span>}
          <Link href={`/leagues/colleges/${m.college.slug}`} className="inline-flex items-center gap-1 font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t('career.collegeLeague')}{' '}<ArrowRight className="h-4 w-4" aria-hidden /></Link>
        </div>
      </Panel>
      {m.student.status !== 'verified' && (
        <p className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200" role="status">{t('career.yourAccountIsntVerifiedYetSod8f')}</p>
      )}

      <Section title={t('career.openDrives')} description={t('career.drivesYouCanApplyToNow')}>
        {open.length === 0 ? (
          <EmptyState compact illustration="jobs" title={t('career.noOpenDrivesRightNow')} description={t('career.youllGetANotificationWhenYourcb3')} />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {open.map((d) => (
              <Panel key={d.id} className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-primary">{d.company}</p>
                    <h3 className="text-base font-semibold text-foreground">{d.role_title}</h3>
                  </div>
                  {d.eligible ? <StatusPill status="open" /> : <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">{t('career.notEligible')}</span>}
                </div>
                {d.description && <p className="line-clamp-3 text-sm text-muted-foreground">{d.description}</p>}
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4" aria-hidden />{t('career.applyByDate', { date: fmtDate(d.schedule.apply_by) })}</span>
                  {ctcRange(d.ctc_minor_min, d.ctc_minor_max, d.currency) && <span className="tabular-nums">CTC {ctcRange(d.ctc_minor_min, d.ctc_minor_max, d.currency)}</span>}
                </div>
                {!d.eligible && <ul className="list-disc pl-5 text-sm text-muted-foreground">{d.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
                <div className="mt-auto">
                  <Button onClick={() => apply(d)} disabled={!d.eligible || busy === d.id} className="min-h-11"><Briefcase className="mr-2 h-4 w-4" aria-hidden />{t('career.apply')}</Button>
                </div>
              </Panel>
            ))}
          </div>
        )}
      </Section>

      <Section title={t('career.myApplications')}>
        {mine.length === 0 ? (
          <EmptyState compact illustration="inbox" title={t('career.noApplicationsYet')} description={t('career.drivesYouApplyToShowUpc25')} />
        ) : (
          <div className="space-y-3">
            {mine.map((d) => (
              <Panel key={d.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">{d.company} · {d.role_title}</p>
                  <p className="text-sm text-muted-foreground">{t('career.appliedDate', { date: fmtDate(d.application!.applied_at) })}{d.schedule.test_at ? t('career.testDate', { date: fmtDate(d.schedule.test_at) }) : ''}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill status={d.application!.status} />
                  {d.process.mode === 'company_test' && d.process.pattern_id && d.application!.status !== 'withdrawn' && (
                    <Button asChild size="sm" variant="outline"><Link href={`/dashboard/company-tests/${encodeURIComponent(d.process.pattern_id)}`}>{t('career.takeTheTest')}</Link></Button>
                  )}
                  {d.process.mode === 'external' && d.process.external_url && (
                    <Button asChild size="sm" variant="outline"><a href={d.process.external_url} target="_blank" rel="noopener noreferrer">{t('career.companyForm')}</a></Button>
                  )}
                  {['applied', 'shortlisted'].includes(d.application!.status) && (
                    <Button size="sm" variant="ghost" onClick={() => withdraw(d)} disabled={busy === d.id}>{t('career.withdraw')}</Button>
                  )}
                </div>
              </Panel>
            ))}
          </div>
        )}
      </Section>

      {m.offers.length > 0 && (
        <Section title={t('career.myOffers')}>
          <div className="grid gap-4 md:grid-cols-2">
            {m.offers.map((o) => (
              <Panel key={o.id} className="space-y-1 p-5">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-foreground">{o.company_name}</p>
                  <StatusPill status={o.status} />
                </div>
                <p className="text-sm text-muted-foreground">{o.role_title}</p>
                <p className="text-lg font-bold tabular-nums text-foreground">{money(o.ctc_minor, o.currency)}<span className="ml-1 text-sm font-normal text-muted-foreground">{t('career.perYear')}</span></p>
                {o.joining_date && <p className="text-sm text-muted-foreground">{t('career.joiningDate2', { date: fmtDate(o.joining_date) })}</p>}
              </Panel>
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}
