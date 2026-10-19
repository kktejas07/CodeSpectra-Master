'use client'

/**
 * Hiring settings → Integrations: meeting apps per organisation (Zoom, Google
 * Meet, Microsoft Teams; built-in video needs nothing) and the working hours
 * used for self-scheduling. Admins manage; recruiters can see what's connected.
 */
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { CheckCircle2, Loader2, PlugZap, Video } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Panel, Section } from '@/components/app/page-kit'
import { HiringShell } from '@/components/hiring/shell'
import { ErrorState, Field, InlineError, LoadingRows, NativeSelect } from '@/components/hiring/ui'
import { PROVIDER_LABELS } from '@/components/hiring/lib/labels'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useToast } from '@/lib/toast-context'
import { useConfirm } from '@/lib/confirm-context'
import type { MeetingProvider } from '@/lib/ats/contract'

type Connectable = 'zoom' | 'google_meet' | 'teams'
interface Row { provider: Connectable; status: 'connected' | 'error' | 'disconnected'; account_label: string | null; connected_at: string | null; last_error: string | null }
interface Data {
  providers: Row[]
  livekit_configured: boolean
  platform_apps: { google: boolean; microsoft: boolean }
  redirect_uris: { google: string; microsoft: string }
  settings: { timezone: string; work_start_hour: number; work_end_hour: number; default_provider: MeetingProvider | null }
  can_manage: boolean
}

function StatusBadge({ row }: { row: Row }) {
  if (row.status === 'connected') return <Badge variant="success"><CheckCircle2 aria-hidden /> Connected</Badge>
  if (row.status === 'error') return <Badge variant="warning">Needs attention</Badge>
  return <Badge variant="outline">Not connected</Badge>
}

function zones(): string[] {
  try {
    return (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? []
  } catch {
    return []
  }
}

function IntegrationsInner() {
  const sp = useSearchParams()
  const tenant = sp.get('tenant')
  const q = tenant ? `?tenant=${encodeURIComponent(tenant)}` : ''
  const addToast = useToast()
  const confirm = useConfirm()
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [formErr, setFormErr] = useState<Record<string, string | null>>({})
  const [zoom, setZoom] = useState({ account_id: '', client_id: '', client_secret: '' })
  const [own, setOwn] = useState<Record<'google_meet' | 'teams', { open: boolean; client_id: string; client_secret: string; ms_tenant: string }>>({
    google_meet: { open: false, client_id: '', client_secret: '', ms_tenant: '' },
    teams: { open: false, client_id: '', client_secret: '', ms_tenant: '' },
  })
  const [sched, setSched] = useState({ timezone: '', start: '9', end: '18' })
  const tzList = useMemo(zones, [])

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/ats/integrations/meetings${q}`, { credentials: 'include', cache: 'no-store' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setError(j.error || 'Could not load integrations'); return }
      setData(j); setError(null)
      setSched({ timezone: j.settings.timezone, start: String(j.settings.work_start_hour), end: String(j.settings.work_end_hour) })
    } catch {
      setError('Could not load integrations')
    }
  }, [q])
  useEffect(() => { void load() }, [load])

  // Result of an OAuth round trip.
  useEffect(() => {
    const ok = sp.get('connected')
    const err = sp.get('error')
    if (ok) addToast({ type: 'success', title: `${PROVIDER_LABELS[ok as MeetingProvider] || 'Meeting app'} connected` })
    if (err) addToast({ type: 'error', title: 'Connection failed', message: err })
  }, [sp, addToast])

  async function post(key: string, body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    setBusy(key); setFormErr((f) => ({ ...f, [key]: null }))
    try {
      const r = await csrfFetch(`/api/ats/integrations/meetings${q}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setFormErr((f) => ({ ...f, [key]: j.error || 'Something went wrong' })); return null }
      return j
    } catch {
      setFormErr((f) => ({ ...f, [key]: 'Something went wrong. Try again.' }))
      return null
    } finally {
      setBusy(null)
    }
  }

  async function connectZoom() {
    const r = await post('zoom', { action: 'connect_zoom', ...zoom })
    if (r) { addToast({ type: 'success', title: 'Zoom connected' }); setZoom({ account_id: '', client_id: '', client_secret: '' }); void load() }
  }
  async function startOAuth(p: 'google_meet' | 'teams') {
    const o = own[p]
    const r = await post(p, { action: 'start_oauth', provider: p, ...(o.open ? { client_id: o.client_id, client_secret: o.client_secret, ms_tenant: o.ms_tenant } : {}) })
    if (r?.url) window.location.assign(String(r.url))
  }
  async function disconnect(p: Connectable) {
    const ok = await confirm({ title: `Disconnect ${PROVIDER_LABELS[p]}?`, description: 'Interviews already booked keep their links. New interviews can\'t use it until you connect again.', confirmText: 'Disconnect', destructive: true })
    if (!ok) return
    if (await post(`dis-${p}`, { action: 'disconnect', provider: p })) { addToast({ type: 'success', title: `${PROVIDER_LABELS[p]} disconnected` }); void load() }
  }
  async function saveSchedule() {
    const r = await post('sched', { action: 'settings', timezone: sched.timezone, work_start_hour: Number(sched.start), work_end_hour: Number(sched.end) })
    if (r) { addToast({ type: 'success', title: 'Scheduling settings saved' }); void load() }
  }

  if (error) return <ErrorState message={error} onRetry={() => void load()} />
  if (!data) return <LoadingRows rows={4} />
  const row = (p: Connectable) => data.providers.find((x) => x.provider === p)!
  const manage = data.can_manage
  const hours = Array.from({ length: 25 }, (_, i) => ({ value: String(i), label: `${String(i).padStart(2, '0')}:00` }))

  const oauthCard = (p: 'google_meet' | 'teams') => {
    const r = row(p)
    const which = p === 'google_meet' ? 'google' : 'microsoft'
    const platformReady = data.platform_apps[which]
    const o = own[p]
    return (
      <Panel className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold text-foreground">{PROVIDER_LABELS[p]}</h3>
          <StatusBadge row={r} />
        </div>
        <p className="text-sm text-muted-foreground">
          {p === 'google_meet'
            ? 'Creates a Google Calendar event with a Meet link on the connected account; Google emails the invite.'
            : 'Creates an Outlook event with a Teams link on the connected work account; Outlook emails the invite.'}
        </p>
        {r.account_label && <p className="text-sm text-foreground">Account: {r.account_label}</p>}
        {r.last_error && <p className="text-sm text-amber-700 dark:text-amber-400">{r.last_error}</p>}
        {manage && (
          <>
            {!platformReady && !o.open && <p className="text-sm text-muted-foreground">The platform app isn&apos;t set up yet — use your own app below.</p>}
            <button type="button" className="text-sm text-primary hover:underline" aria-expanded={o.open} onClick={() => setOwn((s) => ({ ...s, [p]: { ...o, open: !o.open } }))}>
              {o.open ? 'Use the platform app' : 'Use our own OAuth app'}
            </button>
            {o.open && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Client ID" htmlFor={`${p}-cid`}><Input id={`${p}-cid`} value={o.client_id} onChange={(e) => setOwn((s) => ({ ...s, [p]: { ...o, client_id: e.target.value } }))} autoComplete="off" /></Field>
                <Field label="Client secret" htmlFor={`${p}-sec`}><Input id={`${p}-sec`} type="password" value={o.client_secret} onChange={(e) => setOwn((s) => ({ ...s, [p]: { ...o, client_secret: e.target.value } }))} autoComplete="off" /></Field>
                {p === 'teams' && (
                  <Field label="Microsoft tenant" htmlFor="ms-tenant" hint="Your directory (tenant) ID or domain. Leave empty for any work account.">
                    <Input id="ms-tenant" value={o.ms_tenant} onChange={(e) => setOwn((s) => ({ ...s, teams: { ...o, ms_tenant: e.target.value } }))} placeholder="common" />
                  </Field>
                )}
                <p className="text-xs text-muted-foreground sm:col-span-2">Redirect URI to register: <code className="break-all font-mono">{data.redirect_uris[which]}</code></p>
              </div>
            )}
            <InlineError message={formErr[p]} />
            <div className="flex flex-wrap gap-2">
              <Button className="min-h-11" disabled={!!busy || (!platformReady && !o.open)} onClick={() => void startOAuth(p)}>
                {busy === p && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />}
                {r.status === 'disconnected' ? `Connect ${p === 'google_meet' ? 'Google' : 'Microsoft'}` : 'Reconnect'}
              </Button>
              {r.status !== 'disconnected' && <Button variant="outline" className="min-h-11" disabled={!!busy} onClick={() => void disconnect(p)}>Disconnect</Button>}
            </div>
          </>
        )}
      </Panel>
    )
  }

  return (
    <div className="space-y-8">
      {!manage && <p className="rounded-xl bg-muted/40 px-4 py-3 text-sm text-muted-foreground">Only hiring admins can connect or change meeting apps.</p>}
      <Section title="Meeting apps" description="Pick one per interview stage or per interview. Built-in video always works and needs no setup.">
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 font-semibold text-foreground"><Video className="h-4 w-4 text-primary" aria-hidden /> {PROVIDER_LABELS.livekit}</h3>
              {data.livekit_configured ? <Badge variant="success"><CheckCircle2 aria-hidden /> Ready</Badge> : <Badge variant="warning">Not set up</Badge>}
            </div>
            <p className="text-sm text-muted-foreground">Candidates join from their invite link without an account; the panel joins from the interview page.</p>
            {!data.livekit_configured && <p className="text-sm text-amber-700 dark:text-amber-400">The platform admin needs to set the video server (LiveKit) keys.</p>}
          </Panel>

          <Panel className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold text-foreground">Zoom</h3>
              <StatusBadge row={row('zoom')} />
            </div>
            <p className="text-sm text-muted-foreground">Uses a Server-to-Server OAuth app from your Zoom account. Meetings are created on the app owner&apos;s Zoom user.</p>
            {row('zoom').account_label && <p className="text-sm text-foreground">{row('zoom').account_label}</p>}
            {row('zoom').last_error && <p className="text-sm text-amber-700 dark:text-amber-400">{row('zoom').last_error}</p>}
            {manage && (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Account ID" htmlFor="z-acc"><Input id="z-acc" value={zoom.account_id} onChange={(e) => setZoom({ ...zoom, account_id: e.target.value })} autoComplete="off" /></Field>
                  <Field label="Client ID" htmlFor="z-cid"><Input id="z-cid" value={zoom.client_id} onChange={(e) => setZoom({ ...zoom, client_id: e.target.value })} autoComplete="off" /></Field>
                  <Field label="Client secret" htmlFor="z-sec"><Input id="z-sec" type="password" value={zoom.client_secret} onChange={(e) => setZoom({ ...zoom, client_secret: e.target.value })} autoComplete="off" /></Field>
                </div>
                <InlineError message={formErr.zoom} />
                <div className="flex flex-wrap gap-2">
                  <Button className="min-h-11" disabled={!!busy || !zoom.account_id || !zoom.client_id || !zoom.client_secret} onClick={() => void connectZoom()}>
                    {busy === 'zoom' && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />}
                    {row('zoom').status === 'disconnected' ? 'Connect Zoom' : 'Replace credentials'}
                  </Button>
                  {row('zoom').status !== 'disconnected' && <Button variant="outline" className="min-h-11" disabled={!!busy} onClick={() => void disconnect('zoom')}>Disconnect</Button>}
                </div>
              </>
            )}
          </Panel>

          {oauthCard('google_meet')}
          {oauthCard('teams')}
        </div>
      </Section>

      <Section title="Self-scheduling" description="Candidates see free times inside these hours on weekdays, minus the panel's calendar entries and other interviews.">
        <Panel className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Time zone" htmlFor="s-tz" className="lg:col-span-2">
              <Input id="s-tz" list="s-tz-list" value={sched.timezone} onChange={(e) => setSched({ ...sched, timezone: e.target.value })} disabled={!manage} />
              <datalist id="s-tz-list">{tzList.map((z) => <option key={z} value={z} />)}</datalist>
            </Field>
            <Field label="Day starts" htmlFor="s-start"><NativeSelect id="s-start" value={sched.start} onChange={(v) => setSched({ ...sched, start: v })} options={hours.slice(0, 24)} disabled={!manage} /></Field>
            <Field label="Day ends" htmlFor="s-end"><NativeSelect id="s-end" value={sched.end} onChange={(v) => setSched({ ...sched, end: v })} options={hours.slice(1)} disabled={!manage} /></Field>
          </div>
          <InlineError message={formErr.sched} />
          {manage && (
            <Button className="min-h-11" disabled={!!busy} onClick={() => void saveSchedule()}>
              {busy === 'sched' && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />} Save
            </Button>
          )}
        </Panel>
      </Section>
    </div>
  )
}

export default function HiringIntegrationsPage() {
  return (
    <HiringShell title="Integrations" description="Connect the meeting apps your team interviews on." icon={<PlugZap />}>
      <Suspense fallback={<LoadingRows rows={4} />}>
        <IntegrationsInner />
      </Suspense>
    </HiringShell>
  )
}
