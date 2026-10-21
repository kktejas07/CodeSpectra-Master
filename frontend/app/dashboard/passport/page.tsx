'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { BadgeCheck, Copy, Download, Eye, EyeOff, Loader2, RefreshCw, ShieldCheck, UserSearch } from 'lucide-react'
import { Linkedin } from '@/components/ui/brand-icons'
import { PageHeader, Panel, Section, StatCard } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, NativeSelect, Segmented } from '@/components/hiring/ui'
import { SkillList } from '@/components/passport/skill-list'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { useConfirm } from '@/lib/confirm-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { EVIDENCE_KIND_LABELS, type EvidenceKind, type PassportSummary, type PassportVisibility, type PublicSkill } from '@/lib/passport/core'
import { AVAILABILITY, AVAILABILITY_LABELS, INVITE_TARGET_LABELS, type ConsentCopy, type InviteTarget } from '@/lib/talent/core'
import { cn } from '@/lib/utils'

interface EvidenceRow { id: string; kind: EvidenceKind; title: string; score: number; at: string; skills: string[]; proctored: boolean; trust: number | null; link: string | null; private_by_default: boolean }
interface InviteRow { id: string; tenant_id: string; tenant_name: string; recruiter_name: string; target_type: InviteTarget; target_title: string; message: string | null; status: string; created_at: string; expires_at: string; fulfilment?: { ok: boolean; error?: string | null } | null }
interface TalentView { discoverable: boolean; consented_at: string | null; regime: string; city: string | null; country: string | null; graduation_year: number | null; availability: string | null; blocked: Array<{ tenant_id: string; name: string }> }
interface PassportResponse {
  passport: { handle: string; name: string; visibility: PassportVisibility; hidden: string[]; shown: string[]; show_self_reported: boolean; issued_at: string; credential_id: string; share_url: string | null; verify_url: string; linkedin_url: string }
  summary: PassportSummary
  evidence: EvidenceRow[]
  public_skills: PublicSkill[]
  talent: TalentView
  consent: ConsentCopy
  invites: InviteRow[]
}

async function readError(res: Response, fallback: string): Promise<string> {
  try { const j = await res.json(); return String(j.error || fallback) } catch { return fallback }
}

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

export default function PassportPage() {
  const gate = usePageGuard('/dashboard/passport')
  const addToast = useToast()
  const confirm = useConfirm()
  const [data, setData] = useState<PassportResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [qr, setQr] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/passport', { credentials: 'include', cache: 'no-store' })
      if (!res.ok) throw new Error(await readError(res, 'Your passport couldn’t be loaded.'))
      setData(await res.json())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { if (gate.ready) void load() }, [gate.ready, load])

  const verifyUrl = data?.passport.verify_url
  useEffect(() => {
    if (!verifyUrl) return
    let live = true
    import('qrcode').then((QR) => QR.toDataURL(verifyUrl, { margin: 1, width: 280 })).then((u) => { if (live) setQr(u) }).catch(() => {})
    return () => { live = false }
  }, [verifyUrl])

  const patch = useCallback(async (body: Record<string, unknown>, ok = 'Saved') => {
    setSaving(true)
    try {
      const res = await csrfFetch('/api/passport', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) throw new Error(await readError(res, 'Couldn’t save.'))
      addToast({ type: 'success', title: ok })
      await load()
    } catch (e) {
      addToast({ type: 'error', title: 'Not saved', message: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }, [addToast, load])

  if (!gate.ready) return null

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-6 sm:px-6">
      <PageHeader
        title="Skill passport"
        description="Your skills, verified by results you earned here — tests, contests, courses and certificates. You decide who sees it."
        icon={<BadgeCheck />}
        actions={data && (
          <Button
            variant="outline"
            className="h-11 rounded-xl"
            onClick={async () => {
              const { downloadPassportPdf } = await import('@/lib/passport/pdf')
              await downloadPassportPdf({
                name: data.passport.name, handle: data.passport.handle, verifyUrl: data.passport.verify_url, credentialId: data.passport.credential_id,
                issuedAt: data.passport.issued_at, skills: data.public_skills, selfReported: data.passport.show_self_reported ? data.summary.selfReported : null,
              }).catch(() => addToast({ type: 'error', title: 'The PDF couldn’t be made. Try again.' }))
            }}
          >
            <Download className="h-4 w-4" aria-hidden /> Download PDF
          </Button>
        )}
      />

      {loading && !data && (
        <div className="flex items-center gap-2 text-muted-foreground" role="status"><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> Loading your passport…</div>
      )}
      {error && !data && (
        <EmptyState illustration="error" title="We couldn’t load your passport" description={error} actionLabel="Try again" onAction={() => void load()} />
      )}

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Verified skills" value={data.summary.skills.length} icon={<ShieldCheck />} />
            <StatCard label="Results counted" value={data.evidence.length} icon={<BadgeCheck />} />
            <StatCard label="Shown to others" value={data.passport.visibility === 'private' ? 'Only you' : data.passport.visibility === 'link' ? 'Anyone with the link' : 'Public'} icon={<Eye />} />
          </div>

          <SharePanel data={data} qr={qr} saving={saving} onPatch={patch} confirm={confirm} addToast={addToast} />

          <Section title="Verified skills" description="Proctored results count most; older results count less over time. A level needs enough evidence, not one lucky test.">
            {data.summary.skills.length ? (
              <SkillList skills={data.summary.skills.map((s) => ({ ...s, evidence: s.evidence.map((e) => ({ kind: e.kind, title: e.title, score: e.score, at: e.at, proctored: e.proctored, link: e.link })) }))} />
            ) : (
              <EmptyState
                illustration="certificate"
                title="No verified skills yet"
                description="Take a test, finish a course or place in a contest — your results show up here as verified skills."
                actionLabel="Browse company tests"
                actionHref="/dashboard/company-tests"
              />
            )}
            {data.summary.excluded.length > 0 && (
              <p className="text-sm text-muted-foreground">{data.summary.excluded.length} result{data.summary.excluded.length === 1 ? ' was' : 's were'} not counted because the integrity score was too low.</p>
            )}
          </Section>

          <EvidencePanel data={data} saving={saving} onPatch={patch} />

          <Section title="Self-reported skills" description="Skills you typed on your profile. They never change a level and are labelled “self-reported” if you show them.">
            <Panel className="space-y-4">
              {data.summary.selfReported.length ? (
                <ul className="flex flex-wrap gap-2">{data.summary.selfReported.map((s) => <li key={s} className="rounded-full border border-dashed border-border px-3 py-1 text-sm capitalize text-muted-foreground">{s}</li>)}</ul>
              ) : (
                <p className="text-sm text-muted-foreground">None yet. Add skills on <Link href="/dashboard/profile" className="text-primary underline-offset-2 hover:underline">your profile</Link>.</p>
              )}
              <label className="flex items-center gap-3 text-sm text-foreground">
                <Switch checked={data.passport.show_self_reported} disabled={saving} onCheckedChange={(v) => void patch({ show_self_reported: v })} aria-label="Show self-reported skills on my passport" />
                Show them on my passport
              </label>
            </Panel>
          </Section>

          <DiscoveryPanel data={data} reload={load} addToast={addToast} />
          <InvitesPanel data={data} reload={load} addToast={addToast} confirm={confirm} />
        </>
      )}
    </div>
  )
}

type Toast = ReturnType<typeof useToast>
type Confirm = ReturnType<typeof useConfirm>

function SharePanel({ data, qr, saving, onPatch, confirm, addToast }: { data: PassportResponse; qr: string | null; saving: boolean; onPatch: (b: Record<string, unknown>, ok?: string) => Promise<void>; confirm: Confirm; addToast: Toast }) {
  const p = data.passport
  const [handle, setHandle] = useState(p.handle)
  useEffect(() => setHandle(p.handle), [p.handle])
  const copy = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); addToast({ type: 'success', title: `${what} copied` }) } catch { addToast({ type: 'error', title: 'Couldn’t copy. Select the link and copy it.' }) }
  }
  return (
    <Section title="Sharing" description="Private: only you. Link only: anyone you send the link to (never in search engines). Public: anyone, and search engines may list it.">
      <Panel className="grid gap-6 lg:grid-cols-[1fr_auto]">
        <div className="min-w-0 space-y-5">
          <Segmented
            label="Who can see your passport"
            value={p.visibility}
            onChange={(v) => { if (v !== p.visibility && !saving) void onPatch({ visibility: v }, v === 'private' ? 'Your passport is private' : 'Sharing updated') }}
            options={[{ value: 'private', label: 'Private' }, { value: 'link', label: 'Link only' }, { value: 'public', label: 'Public' }]}
          />
          <form
            className="flex flex-col gap-2 sm:flex-row sm:items-end"
            onSubmit={(e) => { e.preventDefault(); if (handle.trim() && handle.trim() !== p.handle) void onPatch({ handle: handle.trim().toLowerCase() }, 'Handle updated') }}
          >
            <Field label="Your handle" htmlFor="passport-handle" hint="Changing it also changes your link and credential id." className="flex-1">
              <Input id="passport-handle" value={handle} onChange={(e) => setHandle(e.target.value)} maxLength={30} autoComplete="off" spellCheck={false} />
            </Field>
            <Button type="submit" variant="outline" disabled={saving || handle.trim() === p.handle} className="h-9">Save handle</Button>
          </form>
          {p.share_url ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Your passport link</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input readOnly value={p.share_url} aria-label="Passport link" className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
                <Button type="button" variant="outline" onClick={() => void copy(p.share_url!, 'Link')}><Copy className="h-4 w-4" aria-hidden /> Copy</Button>
                <Button asChild variant="outline"><a href={p.share_url} target="_blank" rel="noopener noreferrer"><Eye className="h-4 w-4" aria-hidden /> Preview</a></Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Choose “Link only” or “Public” to get a link you can share.</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button asChild className="h-11 rounded-xl">
              <a href={p.linkedin_url} target="_blank" rel="noopener noreferrer"><Linkedin className="h-4 w-4" aria-hidden /> Add to LinkedIn</a>
            </Button>
            <Button type="button" variant="outline" className="h-11 rounded-xl" onClick={() => void copy(p.verify_url, 'Verify link')}><ShieldCheck className="h-4 w-4" aria-hidden /> Copy verify link</Button>
            <Button
              type="button"
              variant="ghost"
              className="h-11 rounded-xl"
              disabled={saving}
              onClick={async () => {
                const ok = await confirm({ title: 'Reset your links?', description: 'Your current passport link, QR code and credential id stop working. LinkedIn entries need the new verify link.', confirmText: 'Reset links', destructive: true })
                if (ok) void onPatch({ rotate: true }, 'New links created')
              }}
            >
              <RefreshCw className="h-4 w-4" aria-hidden /> Reset links
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Credential id <span className="break-all font-mono">{p.credential_id}</span> · issued {day(p.issued_at)}</p>
        </div>
        <figure className="flex flex-col items-center gap-2 self-start">
          <div className="rounded-2xl border border-border/70 bg-white p-2">
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt="QR code that opens the verify page for your passport" width={144} height={144} className="h-36 w-36" />
            ) : (
              <div className="h-36 w-36" aria-hidden />
            )}
          </div>
          <figcaption className="text-xs text-muted-foreground">Scan to verify</figcaption>
        </figure>
      </Panel>
    </Section>
  )
}

function EvidencePanel({ data, saving, onPatch }: { data: PassportResponse; saving: boolean; onPatch: (b: Record<string, unknown>, ok?: string) => Promise<void> }) {
  const hidden = useMemo(() => new Set(data.passport.hidden), [data.passport.hidden])
  const shown = useMemo(() => new Set(data.passport.shown), [data.passport.shown])
  const visible = (e: EvidenceRow) => !hidden.has(e.id) && (!e.private_by_default || shown.has(e.id))
  const toggle = (e: EvidenceRow) => {
    const on = !visible(e)
    const h = new Set(hidden)
    const s = new Set(shown)
    if (on) { h.delete(e.id); if (e.private_by_default) s.add(e.id) } else { h.add(e.id); s.delete(e.id) }
    void onPatch({ hidden: [...h], shown: [...s] }, on ? 'Result shown' : 'Result hidden')
  }
  return (
    <Section title="Results on your passport" description="Hide any result you don’t want others to see — hidden results stop counting on your shared passport. Company hiring tests are hidden until you choose to show them.">
      {data.evidence.length === 0 ? (
        <EmptyState compact illustration="assessment" title="No results yet" description="Released test scores, contest placements, finished courses and certificates appear here." />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border/70">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted/40 text-left text-muted-foreground">
              <tr><th className="px-4 py-2.5 font-medium">Result</th><th className="px-4 py-2.5 font-medium">Skills</th><th className="px-4 py-2.5 font-medium">Score</th><th className="px-4 py-2.5 font-medium">Date</th><th className="px-4 py-2.5 font-medium"><span className="sr-only">Show on passport</span></th></tr>
            </thead>
            <tbody>
              {data.evidence.map((e) => {
                const on = visible(e)
                return (
                  <tr key={e.id} className={cn('border-t border-border/60', !on && 'text-muted-foreground')}>
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-1.5 font-medium text-foreground">
                        {e.proctored && <ShieldCheck className="h-4 w-4 shrink-0 text-primary" aria-label="Proctored" />}
                        {e.link ? <Link href={e.link} className="underline-offset-2 hover:underline">{e.title}</Link> : e.title}
                      </span>
                      <span className="text-xs text-muted-foreground">{EVIDENCE_KIND_LABELS[e.kind]}{e.private_by_default ? ' · company test' : ''}{e.trust != null ? ` · integrity ${Math.round(e.trust)}` : ''}</span>
                    </td>
                    <td className="px-4 py-2.5 capitalize">{e.skills.join(', ') || '—'}</td>
                    <td className="px-4 py-2.5 tabular-nums">{e.score}</td>
                    <td className="px-4 py-2.5 tabular-nums whitespace-nowrap">{day(e.at)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={() => toggle(e)} aria-pressed={on} aria-label={`${on ? 'Hide' : 'Show'} ${e.title} on my passport`}>
                        {on ? <><Eye className="h-4 w-4" aria-hidden /> Shown</> : <><EyeOff className="h-4 w-4" aria-hidden /> Hidden</>}
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  )
}

function DiscoveryPanel({ data, reload, addToast }: { data: PassportResponse; reload: () => Promise<void>; addToast: Toast }) {
  const t = data.talent
  const [form, setForm] = useState({ city: t.city ?? '', country: t.country ?? '', graduation_year: t.graduation_year ? String(t.graduation_year) : '', availability: t.availability ?? '' })
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => setForm({ city: t.city ?? '', country: t.country ?? '', graduation_year: t.graduation_year ? String(t.graduation_year) : '', availability: t.availability ?? '' }), [t.city, t.country, t.graduation_year, t.availability])
  const save = async (discoverable: boolean, msg: string) => {
    setBusy(true)
    try {
      const year = form.graduation_year.trim() ? Number(form.graduation_year) : null
      const body = {
        discoverable,
        ...(discoverable && !t.discoverable ? { consent } : {}),
        city: form.city.trim() || null,
        country: form.country.trim() ? form.country.trim().toUpperCase() : null,
        graduation_year: year,
        availability: form.availability || null,
      }
      const res = await csrfFetch('/api/passport/talent', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) throw new Error(await readError(res, 'Couldn’t save.'))
      addToast({ type: 'success', title: msg })
      setConsent(false)
      await reload()
    } catch (e) {
      addToast({ type: 'error', title: 'Not saved', message: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }
  return (
    <Section title="Let recruiters find you" description="Off unless you turn it on. Companies see your shared passport summary — never your email or phone until you accept an invite.">
      <Panel className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2 font-medium text-foreground">
            <UserSearch className="h-5 w-5 text-primary" aria-hidden />
            {t.discoverable ? `You’re discoverable (since ${day(t.consented_at || new Date().toISOString())})` : 'You’re not discoverable'}
          </p>
          {t.discoverable && (
            <Button type="button" variant="outline" disabled={busy} onClick={() => void save(false, 'You’re no longer discoverable')}>Stop being discoverable</Button>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="City" htmlFor="talent-city"><Input id="talent-city" value={form.city} maxLength={80} onChange={(e) => setForm({ ...form, city: e.target.value })} autoComplete="address-level2" /></Field>
          <Field label="Country code" htmlFor="talent-country" hint="Two letters, e.g. IN, US, GB"><Input id="talent-country" value={form.country} maxLength={2} onChange={(e) => setForm({ ...form, country: e.target.value.replace(/[^a-z]/gi, '') })} autoComplete="country" /></Field>
          <Field label="Graduation year" htmlFor="talent-year"><Input id="talent-year" inputMode="numeric" value={form.graduation_year} maxLength={4} onChange={(e) => setForm({ ...form, graduation_year: e.target.value.replace(/\D/g, '') })} /></Field>
          <Field label="Availability" htmlFor="talent-avail">
            <NativeSelect id="talent-avail" value={form.availability} onChange={(v) => setForm({ ...form, availability: v })} placeholder="Not set" options={AVAILABILITY.map((a) => ({ value: a, label: AVAILABILITY_LABELS[a] }))} />
          </Field>
        </div>
        {t.discoverable ? (
          <Button type="button" disabled={busy} onClick={() => void save(true, 'Details saved')}>Save details</Button>
        ) : (
          <div className="space-y-3 rounded-2xl border border-border/70 bg-muted/30 p-4">
            <p className="font-medium text-foreground">{data.consent.title}</p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">{data.consent.points.map((x) => <li key={x}>{x}</li>)}</ul>
            {data.passport.visibility === 'private' && <p className="text-sm text-amber-700 dark:text-amber-400">Share your passport (link only or public) first — recruiters see the shared view.</p>}
            <label className="flex items-start gap-3 text-sm text-foreground">
              <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} className="mt-0.5" aria-describedby="consent-help" />
              <span>{data.consent.checkbox}</span>
            </label>
            <p id="consent-help" className="text-xs text-muted-foreground">You can withdraw at any time from this page.</p>
            <Button type="button" className="h-11 rounded-xl" disabled={busy || !consent || data.passport.visibility === 'private'} onClick={() => void save(true, 'You’re now discoverable')}>Turn on discovery</Button>
          </div>
        )}
        {t.blocked.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Blocked organisations</p>
            <ul className="flex flex-wrap gap-2">
              {t.blocked.map((b) => (
                <li key={b.tenant_id} className="flex items-center gap-2 rounded-full border border-border px-3 py-1 text-sm">
                  {b.name}
                  <button
                    type="button"
                    className="rounded text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={async () => {
                      const res = await csrfFetch('/api/passport/blocks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tenant_id: b.tenant_id, block: false }) })
                      if (res.ok) { addToast({ type: 'success', title: `${b.name} unblocked` }); await reload() } else addToast({ type: 'error', title: await readError(res, 'Couldn’t unblock.') })
                    }}
                  >Unblock</button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Panel>
    </Section>
  )
}

function InvitesPanel({ data, reload, addToast, confirm }: { data: PassportResponse; reload: () => Promise<void>; addToast: Toast; confirm: Confirm }) {
  const [busy, setBusy] = useState<string | null>(null)
  const answer = async (inv: InviteRow, action: 'accept' | 'decline') => {
    if (action === 'accept') {
      const ok = await confirm({ title: `Accept ${inv.tenant_name}’s invite?`, description: `Your email address and phone number will be shared with ${inv.tenant_name} so they can contact you about “${inv.target_title}”.`, confirmText: 'Accept and share contact' })
      if (!ok) return
    }
    setBusy(inv.id)
    try {
      const res = await csrfFetch(`/api/passport/invites/${encodeURIComponent(inv.id)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) })
      if (!res.ok) throw new Error(await readError(res, 'Couldn’t save your answer.'))
      addToast({ type: 'success', title: action === 'accept' ? 'Invite accepted' : 'Invite declined' })
      await reload()
    } catch (e) {
      addToast({ type: 'error', title: 'Not saved', message: (e as Error).message })
    } finally {
      setBusy(null)
    }
  }
  const blockReport = async (inv: InviteRow, report: boolean) => {
    const ok = await confirm({
      title: report ? `Report ${inv.tenant_name}?` : `Block ${inv.tenant_name}?`,
      description: report ? 'They will be blocked, and the CodeSpectra team will review the report.' : 'They won’t find you in search again and their open invites close.',
      confirmText: report ? 'Block and report' : 'Block',
      destructive: true,
    })
    if (!ok) return
    const res = await csrfFetch('/api/passport/blocks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tenant_id: inv.tenant_id, block: true, report, ...(report ? { reason: 'other', invite_id: inv.id } : {}) }) })
    if (res.ok) { addToast({ type: 'success', title: report ? 'Reported and blocked' : 'Blocked' }); await reload() } else addToast({ type: 'error', title: await readError(res, 'Couldn’t save.') })
  }
  return (
    <section id="invites" className="scroll-mt-20">
      <Section title="Invites from recruiters" description="Accepting shares your contact details with that organisation only.">
        {data.invites.length === 0 ? (
          <EmptyState compact illustration="jobs" title="No invites yet" description={data.talent.discoverable ? 'When a company invites you to a test, job or interview, it shows up here.' : 'Turn on discovery above so companies can invite you.'} />
        ) : (
          <ul className="space-y-3">
            {data.invites.map((inv) => (
              <li key={inv.id}>
                <Panel className="space-y-3 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground">{inv.tenant_name} · {INVITE_TARGET_LABELS[inv.target_type]}</p>
                      <p className="text-sm text-muted-foreground">{inv.target_title} · from {inv.recruiter_name} · {day(inv.created_at)}</p>
                    </div>
                    <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium capitalize', inv.status === 'accepted' ? 'bg-green-500/10 text-green-700 dark:text-green-400' : inv.status === 'pending' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>{inv.status}</span>
                  </div>
                  {inv.message && <p className="whitespace-pre-line rounded-xl bg-muted/40 p-3 text-sm text-foreground">{inv.message}</p>}
                  {inv.status === 'accepted' && inv.fulfilment && (
                    <p className="text-sm text-muted-foreground">{inv.fulfilment.ok ? (inv.target_type === 'test' ? 'Check your email for the test link.' : 'You’ve been added to the job; the recruiter will contact you.') : inv.fulfilment.error}</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {inv.status === 'pending' && (
                      <>
                        <Button type="button" className="h-11 rounded-xl" disabled={busy === inv.id} onClick={() => void answer(inv, 'accept')}>Accept</Button>
                        <Button type="button" variant="outline" className="h-11 rounded-xl" disabled={busy === inv.id} onClick={() => void answer(inv, 'decline')}>Decline</Button>
                      </>
                    )}
                    {!data.talent.blocked.some((b) => b.tenant_id === inv.tenant_id) && (
                      <>
                        <Button type="button" variant="ghost" className="h-11" onClick={() => void blockReport(inv, false)}>Block</Button>
                        <Button type="button" variant="ghost" className="h-11 text-destructive" onClick={() => void blockReport(inv, true)}>Report</Button>
                      </>
                    )}
                  </div>
                </Panel>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </section>
  )
}

