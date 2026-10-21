'use client'

/**
 * Mentor studio: profile (verified by an admin), weekly availability + policy, session types
 * (marketplace service products) and upcoming sessions. Payments, payouts, refunds and
 * marking sessions done live in the seller dashboard (linked).
 */
import { Suspense, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { CalendarClock, GraduationCap, Plus, Trash2, Video } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { PageHeader, Panel } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { api, money, toMajor, toMinor } from '@/components/marketplace/seller/shared'
import { OFFERING_LABELS, OFFERING_TYPES, type MentorProfile, type OfferingType } from '@/lib/mentors/types'

interface StudioOffering {
  id: string; slug: string; type: OfferingType | null; title: string; description_md: string; duration_min: number
  currency: 'INR' | 'USD'; price: number; provider: string; status: string; review_note?: string | null
  quote: { buyer_total: number; platform_commission: number; mentor_earnings: number; commission_bps: number; tax: number } | null
}
interface Studio { seller: { status: string; display_name: string; slug: string } | null; profile: MentorProfile | null; offerings: StudioOffering[] }
interface SessionRow { id: string; start: string; end: string; status: string; order_id: string; title: string; offering_type: string | null; has_attachment: boolean; rescheduled: boolean; dispute_open: boolean }

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const TABS = ['profile', 'availability', 'offerings', 'sessions'] as const
const STATUS_TEXT: Record<string, string> = { pending: 'Waiting for verification', verified: 'Verified', rejected: 'Not approved', suspended: 'Suspended' }
const STATUS_TONE: Record<string, string> = { pending: 'bg-amber-500/15 text-amber-700 dark:text-amber-300', verified: 'bg-green-500/15 text-green-700 dark:text-green-300', rejected: 'bg-red-500/15 text-red-700 dark:text-red-300', suspended: 'bg-red-500/15 text-red-700 dark:text-red-300' }
const OFFER_STATUS: Record<string, string> = { draft: 'Draft', pending_review: 'In review', published: 'Live', rejected: 'Needs changes', archived: 'Archived' }

function Studio() {
  const gate = usePageGuard('user')
  const addToast = useToast()
  const sp = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const tab = (TABS as readonly string[]).includes(sp.get('tab') || '') ? (sp.get('tab') as string) : 'profile'
  const [data, setData] = useState<Studio | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(() => { api<Studio>('/api/mentors/me').then(setData).catch((e) => setErr(e.message)) }, [])
  useEffect(() => { if (gate.ready) load() }, [gate.ready, load])
  const go = (t: string) => router.replace(`${pathname}?tab=${t}`, { scroll: false })

  if (!gate.ready) return null
  if (err) return <EmptyState illustration="error" title="We could not load your mentor studio" description={err} actionLabel="Try again" onAction={() => { setErr(null); load() }} />
  if (!data) return <div className="h-48 animate-pulse rounded-3xl bg-muted motion-reduce:animate-none" />

  const header = (
    <PageHeader title="Mentoring" icon={<GraduationCap />} description="Offer paid 1:1 sessions — mock interviews, code reviews, resume reviews and career guidance."
      actions={<div className="flex flex-wrap gap-2"><Button asChild variant="outline" className="rounded-full"><Link href="/mentors">Find a mentor</Link></Button>{data.seller?.status === 'approved' && <Button asChild variant="outline" className="rounded-full"><Link href="/dashboard/seller?tab=bookings">Payouts and bookings</Link></Button>}</div>} />
  )
  if (!data.seller) {
    return (
      <div className="mx-auto w-full max-w-5xl">
        {header}
        <EmptyState title="Start with a seller account" description="Mentors are paid through the marketplace. Apply to sell (it takes a few minutes, with payout details), then come back to set up your mentor profile." actionLabel="Apply to sell" actionHref="/dashboard/seller/apply" />
      </div>
    )
  }
  const p = data.profile
  return (
    <div className="mx-auto w-full max-w-5xl">
      {header}
      {p && (
        <Panel className="mb-6 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_TONE[p.status]}`}>{STATUS_TEXT[p.status]}</span>
            {data.seller.status !== 'approved' && <span className="text-muted-foreground">Your seller account is {data.seller.status}. Session types go live once it is approved.</span>}
            {p.status === 'verified' && <Link className="text-primary underline-offset-2 hover:underline" href={`/mentors/${p.slug}`}>View your public page</Link>}
            {p.review_note && p.status !== 'verified' && <span className="text-muted-foreground">Note: {p.review_note}</span>}
          </div>
          {p.status === 'verified' && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-primary" checked={p.listed} onChange={async (e) => {
                try { await api('/api/mentors/me', { method: 'PATCH', body: { listed: e.target.checked } }); load() } catch (x) { addToast({ type: 'error', title: (x as Error).message }) }
              }} />Show me in the mentor directory
            </label>
          )}
        </Panel>
      )}
      <Tabs value={p ? tab : 'profile'} onValueChange={go}>
        <TabsList className="mb-4 flex h-auto flex-wrap justify-start">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="availability" disabled={!p}>Availability</TabsTrigger>
          <TabsTrigger value="offerings" disabled={!p}>Session types</TabsTrigger>
          <TabsTrigger value="sessions" disabled={!p}>Sessions</TabsTrigger>
        </TabsList>
        <TabsContent value="profile"><ProfileForm profile={p} onSaved={load} /></TabsContent>
        {p && <TabsContent value="availability"><AvailabilityForm profile={p} onSaved={load} /></TabsContent>}
        {p && <TabsContent value="offerings"><Offerings offerings={data.offerings} hasAvailability={p.availability.weekly.length > 0} onChanged={load} /></TabsContent>}
        {p && <TabsContent value="sessions"><Sessions /></TabsContent>}
      </Tabs>
    </div>
  )
}

const list = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean)

function ProfileForm({ profile, onSaved }: { profile: MentorProfile | null; onSaved: () => void }) {
  const addToast = useToast()
  const [f, setF] = useState({
    headline: profile?.headline ?? '', bio: profile?.bio ?? '', skills: profile?.skills.join(', ') ?? '', companies: profile?.companies.join(', ') ?? '',
    experience_years: String(profile?.experience_years ?? ''), languages: profile?.languages.join(', ') ?? 'English', linkedin_url: profile?.linkedin_url ?? '',
  })
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value })
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      await api('/api/mentors/me', { method: 'PUT', body: { headline: f.headline, bio: f.bio, skills: list(f.skills), companies: list(f.companies), experience_years: Number(f.experience_years || 0), languages: list(f.languages), linkedin_url: f.linkedin_url || null } })
      addToast({ type: 'success', title: profile ? 'Profile saved' : 'Profile sent for verification', message: profile ? undefined : 'An admin checks new mentors, usually within two working days.' })
      onSaved()
    } catch (x) { addToast({ type: 'error', title: 'Could not save', message: (x as Error).message }) } finally { setBusy(false) }
  }
  return (
    <Panel className="p-5 sm:p-6">
      <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><Label htmlFor="m-headline">Headline</Label><Input id="m-headline" required maxLength={140} value={f.headline} onChange={set('headline')} placeholder="Senior backend engineer · 8 years at product companies" /></div>
        <div className="sm:col-span-2"><Label htmlFor="m-bio">About you</Label><Textarea id="m-bio" required rows={6} maxLength={4000} value={f.bio} onChange={set('bio')} placeholder="What you have worked on and how you help learners" /></div>
        <div><Label htmlFor="m-skills">Skills (comma separated)</Label><Input id="m-skills" required value={f.skills} onChange={set('skills')} placeholder="System design, Java, React" /></div>
        <div><Label htmlFor="m-companies">Companies (comma separated)</Label><Input id="m-companies" value={f.companies} onChange={set('companies')} placeholder="Amazon, Infosys" /></div>
        <div><Label htmlFor="m-exp">Years of experience</Label><Input id="m-exp" type="number" min={0} max={50} required value={f.experience_years} onChange={set('experience_years')} /></div>
        <div><Label htmlFor="m-lang">Languages you mentor in</Label><Input id="m-lang" value={f.languages} onChange={set('languages')} /></div>
        <div className="sm:col-span-2"><Label htmlFor="m-li">LinkedIn profile (helps verification)</Label><Input id="m-li" type="url" value={f.linkedin_url} onChange={set('linkedin_url')} placeholder="https://www.linkedin.com/in/…" /></div>
        <div className="sm:col-span-2"><Button type="submit" disabled={busy} className="min-h-[44px] rounded-full">{busy ? 'Saving…' : profile ? 'Save profile' : 'Send for verification'}</Button></div>
      </form>
    </Panel>
  )
}

function AvailabilityForm({ profile, onSaved }: { profile: MentorProfile; onSaved: () => void }) {
  const addToast = useToast()
  const a = profile.availability
  const [tz, setTz] = useState(a.timezone || (typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC'))
  const [rows, setRows] = useState(a.weekly.length ? a.weekly : [{ dow: 1, start: '18:00', end: '21:00' }])
  const [buffer, setBuffer] = useState(String(a.buffer_min))
  const [maxDay, setMaxDay] = useState(String(a.max_per_day))
  const [resH, setResH] = useState(String(profile.policy.reschedule_hours))
  const [maxRes, setMaxRes] = useState(String(profile.policy.max_reschedules))
  const [busy, setBusy] = useState(false)
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      await api('/api/mentors/me/availability', { method: 'PUT', body: { timezone: tz, weekly: rows, buffer_min: Number(buffer), max_per_day: Number(maxDay), reschedule_hours: Number(resH), max_reschedules: Number(maxRes) } })
      addToast({ type: 'success', title: 'Availability saved', message: 'Every session type now uses these times.' })
      onSaved()
    } catch (x) { addToast({ type: 'error', title: 'Could not save', message: (x as Error).message }) } finally { setBusy(false) }
  }
  const sel = 'h-10 rounded-lg border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
  return (
    <Panel className="p-5 sm:p-6">
      <form onSubmit={save} className="space-y-5">
        <div className="max-w-sm"><Label htmlFor="a-tz">Your time zone</Label><Input id="a-tz" value={tz} onChange={(e) => setTz(e.target.value)} placeholder="Asia/Kolkata" /></div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-foreground">Weekly windows</legend>
          {rows.map((r, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor={`d-${i}`}>Day</label>
              <select id={`d-${i}`} className={sel} value={r.dow} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, dow: Number(e.target.value) } : x)))}>{DAYS.map((d, n) => <option key={d} value={n}>{d}</option>)}</select>
              <label className="sr-only" htmlFor={`s-${i}`}>From</label>
              <input id={`s-${i}`} type="time" className={sel} value={r.start} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} />
              <span className="text-sm text-muted-foreground">to</span>
              <label className="sr-only" htmlFor={`e-${i}`}>Until</label>
              <input id={`e-${i}`} type="time" className={sel} value={r.end} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} />
              <Button type="button" variant="ghost" size="icon" aria-label={`Remove window ${i + 1}`} onClick={() => setRows(rows.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => setRows([...rows, { dow: 6, start: '10:00', end: '13:00' }])}><Plus className="mr-1 h-4 w-4" />Add a window</Button>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-4">
          <div><Label htmlFor="a-buf">Break between sessions (min)</Label><Input id="a-buf" type="number" min={0} max={120} value={buffer} onChange={(e) => setBuffer(e.target.value)} /></div>
          <div><Label htmlFor="a-max">Max sessions per day (0 = no limit)</Label><Input id="a-max" type="number" min={0} max={12} value={maxDay} onChange={(e) => setMaxDay(e.target.value)} /></div>
          <div><Label htmlFor="a-rh">Reschedule up to (hours before)</Label><Input id="a-rh" type="number" min={2} max={168} value={resH} onChange={(e) => setResH(e.target.value)} /></div>
          <div><Label htmlFor="a-rm">Reschedules allowed</Label><Input id="a-rm" type="number" min={0} max={3} value={maxRes} onChange={(e) => setMaxRes(e.target.value)} /></div>
        </div>
        <Button type="submit" disabled={busy} className="min-h-[44px] rounded-full">{busy ? 'Saving…' : 'Save availability'}</Button>
      </form>
    </Panel>
  )
}

function Offerings({ offerings, hasAvailability, onChanged }: { offerings: StudioOffering[]; hasAvailability: boolean; onChanged: () => void }) {
  const addToast = useToast()
  const [editing, setEditing] = useState<StudioOffering | 'new' | null>(null)
  if (!hasAvailability) return <EmptyState title="Set your availability first" description="Session types use your weekly windows to offer times to learners." actionLabel="Set availability" actionHref="/dashboard/mentor?tab=availability" />
  return (
    <div className="space-y-4">
      {editing ? <OfferingForm initial={editing === 'new' ? null : editing} onDone={() => { setEditing(null); onChanged() }} onCancel={() => setEditing(null)} /> : (
        <Button className="min-h-[44px] rounded-full" onClick={() => setEditing('new')}><Plus className="mr-1 h-4 w-4" />Add a session type</Button>
      )}
      {offerings.length === 0 && !editing && <EmptyState title="No session types yet" description="Add a mock interview, code review, resume review or career guidance session with its length and price." />}
      {offerings.map((o) => (
        <Panel key={o.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="font-semibold text-foreground">{o.title}</p>
            <p className="text-sm text-muted-foreground">{o.type ? OFFERING_LABELS[o.type] : 'Session'} · <span className="tabular-nums">{o.duration_min}</span> min · {money(o.price, o.currency)} · {OFFER_STATUS[o.status] ?? o.status}</p>
            {o.quote && <p className="text-xs text-muted-foreground">You earn about <span className="font-medium tabular-nums text-foreground">{money(o.quote.mentor_earnings, o.currency)}</span> per session after the <span className="tabular-nums">{(o.quote.commission_bps / 100).toFixed(1)}%</span> platform fee.</p>}
            {o.review_note && o.status === 'rejected' && <p className="text-xs text-red-600 dark:text-red-400">Reviewer note: {o.review_note}</p>}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="rounded-full" onClick={() => setEditing(o)}>Edit</Button>
            <Button variant="ghost" size="sm" className="rounded-full" onClick={async () => {
              try { await api(`/api/mentors/me/offerings/${o.id}`, { method: 'DELETE' }); onChanged() } catch (x) { addToast({ type: 'error', title: (x as Error).message }) }
            }}>Remove</Button>
          </div>
        </Panel>
      ))}
    </div>
  )
}

function OfferingForm({ initial, onDone, onCancel }: { initial: StudioOffering | null; onDone: () => void; onCancel: () => void }) {
  const addToast = useToast()
  const [type, setType] = useState<OfferingType>(initial?.type ?? 'mock_interview')
  const [title, setTitle] = useState(initial?.title ?? '')
  const [desc, setDesc] = useState(initial?.description_md ?? '')
  const [duration, setDuration] = useState(String(initial?.duration_min ?? 60))
  const [currency, setCurrency] = useState<'INR' | 'USD'>(initial?.currency ?? 'INR')
  const [price, setPrice] = useState(toMajor(initial?.price ?? null))
  const [provider, setProvider] = useState(initial?.provider ?? 'livekit')
  const [quote, setQuote] = useState<StudioOffering['quote']>(null)
  const [busy, setBusy] = useState(false)
  const minor = toMinor(price)
  useEffect(() => {
    if (minor === null || Number.isNaN(minor)) { setQuote(null); return }
    const t = setTimeout(() => { api<{ quote: StudioOffering['quote'] }>('/api/mentors/me/quote', { body: { type, currency, price: minor } }).then((r) => setQuote(r.quote)).catch(() => setQuote(null)) }, 400)
    return () => clearTimeout(t)
  }, [minor, currency, type])
  const sel = 'h-10 w-full rounded-lg border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (minor === null || Number.isNaN(minor)) { addToast({ type: 'error', title: 'Enter a price like 499 or 499.50' }); return }
    setBusy(true)
    try {
      const body = { type, title: title || undefined, description_md: desc, duration_min: Number(duration), currency, price: minor, provider }
      await api(initial ? `/api/mentors/me/offerings/${initial.id}` : '/api/mentors/me/offerings', { method: initial ? 'PATCH' : 'POST', body })
      addToast({ type: 'success', title: initial ? 'Session type saved' : 'Session type added', message: 'It goes live once the marketplace review approves it.' })
      onDone()
    } catch (x) { addToast({ type: 'error', title: 'Could not save', message: (x as Error).message }) } finally { setBusy(false) }
  }
  return (
    <Panel className="p-5 sm:p-6">
      <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        <div><Label htmlFor="o-type">Type</Label><select id="o-type" className={sel} value={type} onChange={(e) => setType(e.target.value as OfferingType)} disabled={!!initial}>{OFFERING_TYPES.map((t) => <option key={t} value={t}>{OFFERING_LABELS[t]}</option>)}</select></div>
        <div><Label htmlFor="o-title">Title (optional)</Label><Input id="o-title" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={OFFERING_LABELS[type]} /></div>
        <div className="sm:col-span-2"><Label htmlFor="o-desc">What happens in the session</Label><Textarea id="o-desc" rows={4} required maxLength={5000} value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
        <div><Label htmlFor="o-dur">Length</Label><select id="o-dur" className={sel} value={duration} onChange={(e) => setDuration(e.target.value)}>{[15, 30, 45, 60, 90, 120].map((d) => <option key={d} value={d}>{d} minutes</option>)}</select></div>
        <div><Label htmlFor="o-prov">Video</Label><select id="o-prov" className={sel} value={provider} onChange={(e) => setProvider(e.target.value)}><option value="livekit">Built-in CodeSpectra video</option><option value="zoom">Zoom (your connected account)</option><option value="google_meet">Google Meet (your connected account)</option><option value="teams">Microsoft Teams (your connected account)</option></select></div>
        <div><Label htmlFor="o-cur">Currency</Label><select id="o-cur" className={sel} value={currency} onChange={(e) => setCurrency(e.target.value as 'INR' | 'USD')}><option value="INR">INR (₹)</option><option value="USD">USD ($)</option></select></div>
        <div><Label htmlFor="o-price">Price</Label><Input id="o-price" inputMode="decimal" required value={price} onChange={(e) => setPrice(e.target.value)} placeholder="999" /></div>
        <p className="text-sm text-muted-foreground sm:col-span-2" role="status">
          {quote ? <>Learner pays <span className="font-medium tabular-nums text-foreground">{money(quote.buyer_total, currency)}</span>{quote.tax ? <> (incl. <span className="tabular-nums">{money(quote.tax, currency)}</span> tax)</> : null}. You earn <span className="font-medium tabular-nums text-foreground">{money(quote.mentor_earnings, currency)}</span> after the <span className="tabular-nums">{(quote.commission_bps / 100).toFixed(1)}%</span> platform fee.</> : 'Enter a price to see what you earn.'}
        </p>
        <div className="flex gap-2 sm:col-span-2"><Button type="submit" disabled={busy} className="min-h-[44px] rounded-full">{busy ? 'Saving…' : 'Save'}</Button><Button type="button" variant="outline" className="min-h-[44px] rounded-full" onClick={onCancel}>Cancel</Button></div>
      </form>
    </Panel>
  )
}

function Sessions() {
  const [rows, setRows] = useState<SessionRow[] | null>(null)
  const [past, setPast] = useState(false)
  const [err, setErr] = useState(false)
  useEffect(() => {
    setRows(null)
    api<{ sessions: SessionRow[] }>(`/api/mentors/me/sessions${past ? '?past=1' : ''}`).then((r) => setRows(r.sessions)).catch(() => setErr(true))
  }, [past])
  if (err) return <EmptyState illustration="error" title="We could not load your sessions" description="Reload the page to try again." />
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Button size="sm" variant={past ? 'outline' : 'default'} className="rounded-full" onClick={() => setPast(false)}>Upcoming</Button>
        <Button size="sm" variant={past ? 'default' : 'outline'} className="rounded-full" onClick={() => setPast(true)}>All</Button>
      </div>
      {rows === null ? <div className="h-24 animate-pulse rounded-2xl bg-muted motion-reduce:animate-none" /> : rows.length === 0 ? (
        <EmptyState title="No sessions yet" description="Booked sessions show up here with the learner's attachments and a join button." />
      ) : rows.map((s) => (
        <Panel key={s.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="font-semibold text-foreground">{s.title}</p>
            <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground"><CalendarClock className="h-4 w-4" aria-hidden /><span className="tabular-nums">{new Date(s.start).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span>
              {s.has_attachment && <span>· Code attached</span>}{s.rescheduled && <span>· Rescheduled</span>}{s.dispute_open && <span className="text-amber-700 dark:text-amber-300">· Dispute open</span>}{s.status === 'completed' && <span>· Done</span>}</p>
          </div>
          <Button asChild size="sm" className="min-h-[44px] rounded-full"><Link href={`/dashboard/sessions/${s.id}`}><Video className="mr-1 h-4 w-4" />Open</Link></Button>
        </Panel>
      ))}
    </div>
  )
}

export default function MentorStudioPage() {
  return <Suspense fallback={null}><Studio /></Suspense>
}
