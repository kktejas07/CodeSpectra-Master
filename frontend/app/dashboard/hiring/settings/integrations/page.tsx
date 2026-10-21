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
import { PlatformAdminHint } from '@/components/hiring/platform-admin-hint'
import { useT } from '@/lib/i18n/client'
import { useApiError } from '@/lib/i18n/use-api-error'

type Connectable = 'zoom' | 'google_meet' | 'teams'
interface Row { provider: Connectable; status: 'connected' | 'error' | 'disconnected'; account_label: string | null; connected_at: string | null; last_error: string | null }
interface Data {
  providers: Row[]
  livekit_configured: boolean
  platform_apps: { google: boolean; microsoft: boolean }
  redirect_uris: { google: string; microsoft: string }
  settings: { timezone: string; work_start_hour: number; work_end_hour: number; default_provider: MeetingProvider | null }
  can_manage: boolean
  is_platform_admin?: boolean
}

function StatusBadge({ row }: { row: Row }) {
  const { t } = useT()
  if (row.status === 'connected') return <Badge variant="success"><CheckCircle2 aria-hidden />{' '}{t('hiring.connected')}</Badge>
  if (row.status === 'error') return <Badge variant="warning">{t('hiring.needsAttention')}</Badge>
  return <Badge variant="outline">{t('hiring.notConnected')}</Badge>
}

function zones(): string[] {
  try {
    return (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? []
  } catch {
    return []
  }
}

function IntegrationsInner() {
  const apiError = useApiError()
  const { t } = useT()
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
      if (!r.ok) { setError(apiError(j, t('hiring.couldNotLoadIntegrations'))); return }
      setData(j); setError(null)
      setSched({ timezone: j.settings.timezone, start: String(j.settings.work_start_hour), end: String(j.settings.work_end_hour) })
    } catch {
      setError(t('hiring.couldNotLoadIntegrations'))
    }
  }, [q])
  useEffect(() => { void load() }, [load])

  // Result of an OAuth round trip.
  useEffect(() => {
    const ok = sp.get('connected')
    const err = sp.get('error')
    if (ok) addToast({ type: 'success', title: t('hiring.valueConnected', { value: PROVIDER_LABELS[ok as MeetingProvider] || 'Meeting app' }) })
    if (err) addToast({ type: 'error', title: t('hiring.connectionFailed'), message: err })
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
    if (r) { addToast({ type: 'success', title: t('hiring.zoomConnected') }); setZoom({ account_id: '', client_id: '', client_secret: '' }); void load() }
  }
  async function startOAuth(p: 'google_meet' | 'teams') {
    const o = own[p]
    const r = await post(p, { action: 'start_oauth', provider: p, ...(o.open ? { client_id: o.client_id, client_secret: o.client_secret, ms_tenant: o.ms_tenant } : {}) })
    if (r?.url) window.location.assign(String(r.url))
  }
  async function disconnect(p: Connectable) {
    const ok = await confirm({ title: t('hiring.disconnectValue', { value: PROVIDER_LABELS[p] }), description: t('hiring.interviewsAlreadyBookedKeepTheirLinks5ef'), confirmText: t('hiring.disconnect'), destructive: true })
    if (!ok) return
    if (await post(`dis-${p}`, { action: 'disconnect', provider: p })) { addToast({ type: 'success', title: t('hiring.valueDisconnected', { value: PROVIDER_LABELS[p] }) }); void load() }
  }
  async function saveSchedule() {
    const r = await post('sched', { action: 'settings', timezone: sched.timezone, work_start_hour: Number(sched.start), work_end_hour: Number(sched.end) })
    if (r) { addToast({ type: 'success', title: t('hiring.schedulingSettingsSaved') }); void load() }
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
            ? t('hiring.createsAGoogleCalendarEventWitha86')
            : t('hiring.createsAnOutlookEventWithA251')}
        </p>
        {r.account_label && <p className="text-sm text-foreground">{t('hiring.accountAccountLabel', { account_label: r.account_label })}</p>}
        {r.last_error && <p className="text-sm text-amber-700 dark:text-amber-400">{r.last_error}</p>}
        {manage && (
          <>
            {!platformReady && !o.open && (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{t('hiring.thePlatformAppIsntSetUpf7e')}</p>
                <PlatformAdminHint isPlatformAdmin={!!data.is_platform_admin} what={`platform ${which === 'google' ? 'Google' : 'Microsoft'} OAuth app`} className="text-xs text-muted-foreground" />
              </div>
            )}
            <button type="button" className="text-sm text-primary hover:underline" aria-expanded={o.open} onClick={() => setOwn((s) => ({ ...s, [p]: { ...o, open: !o.open } }))}>
              {o.open ? t('hiring.useThePlatformApp') : t('hiring.useOurOwnOauthApp')}
            </button>
            {o.open && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t('hiring.clientId')} htmlFor={`${p}-cid`}><Input id={`${p}-cid`} value={o.client_id} onChange={(e) => setOwn((s) => ({ ...s, [p]: { ...o, client_id: e.target.value } }))} autoComplete="off" /></Field>
                <Field label={t('hiring.clientSecret')} htmlFor={`${p}-sec`}><Input id={`${p}-sec`} type="password" value={o.client_secret} onChange={(e) => setOwn((s) => ({ ...s, [p]: { ...o, client_secret: e.target.value } }))} autoComplete="off" /></Field>
                {p === 'teams' && (
                  <Field label={t('hiring.microsoftTenant')} htmlFor="ms-tenant" hint={t('hiring.yourDirectoryTenantIdOrDomain3fa')}>
                    <Input id="ms-tenant" value={o.ms_tenant} onChange={(e) => setOwn((s) => ({ ...s, teams: { ...o, ms_tenant: e.target.value } }))} placeholder={t('hiring.common')} />
                  </Field>
                )}
                <p className="text-xs text-muted-foreground sm:col-span-2">{t('hiring.redirectUriToRegister')}{' '}<code className="break-all font-mono">{data.redirect_uris[which]}</code></p>
              </div>
            )}
            <InlineError message={formErr[p]} />
            <div className="flex flex-wrap gap-2">
              <Button className="min-h-11" disabled={!!busy || (!platformReady && !o.open)} onClick={() => void startOAuth(p)}>
                {busy === p && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />}
                {r.status === 'disconnected' ? t('hiring.connectValue', { value: p === 'google_meet' ? 'Google' : 'Microsoft' }) : t('hiring.reconnect')}
              </Button>
              {r.status !== 'disconnected' && <Button variant="outline" className="min-h-11" disabled={!!busy} onClick={() => void disconnect(p)}>{t('hiring.disconnect')}</Button>}
            </div>
          </>
        )}
      </Panel>
    )
  }

  return (
    <div className="space-y-8">
      {!manage && <p className="rounded-xl bg-muted/40 px-4 py-3 text-sm text-muted-foreground">{t('hiring.onlyHiringAdminsCanConnectOr42f')}</p>}
      <Section title={t('hiring.meetingApps')} description={t('hiring.pickOnePerInterviewStageOre86')}>
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 font-semibold text-foreground"><Video className="h-4 w-4 text-primary" aria-hidden /> {PROVIDER_LABELS.livekit}</h3>
              {data.livekit_configured ? <Badge variant="success"><CheckCircle2 aria-hidden />{' '}{t('hiring.ready')}</Badge> : <Badge variant="warning">{t('hiring.notSetUp')}</Badge>}
            </div>
            <p className="text-sm text-muted-foreground">{t('hiring.candidatesJoinFromTheirInviteLink6c1')}</p>
            {!data.livekit_configured && <PlatformAdminHint isPlatformAdmin={!!data.is_platform_admin} what="video server (LiveKit) keys" />}
          </Panel>

          <Panel className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold text-foreground">Zoom</h3>
              <StatusBadge row={row('zoom')} />
            </div>
            <p className="text-sm text-muted-foreground">{t('hiring.usesAServerToServerOauth882')}</p>
            {row('zoom').account_label && <p className="text-sm text-foreground">{row('zoom').account_label}</p>}
            {row('zoom').last_error && <p className="text-sm text-amber-700 dark:text-amber-400">{row('zoom').last_error}</p>}
            {manage && (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label={t('hiring.accountId')} htmlFor="z-acc"><Input id="z-acc" value={zoom.account_id} onChange={(e) => setZoom({ ...zoom, account_id: e.target.value })} autoComplete="off" /></Field>
                  <Field label={t('hiring.clientId')} htmlFor="z-cid"><Input id="z-cid" value={zoom.client_id} onChange={(e) => setZoom({ ...zoom, client_id: e.target.value })} autoComplete="off" /></Field>
                  <Field label={t('hiring.clientSecret')} htmlFor="z-sec"><Input id="z-sec" type="password" value={zoom.client_secret} onChange={(e) => setZoom({ ...zoom, client_secret: e.target.value })} autoComplete="off" /></Field>
                </div>
                <InlineError message={formErr.zoom} />
                <div className="flex flex-wrap gap-2">
                  <Button className="min-h-11" disabled={!!busy || !zoom.account_id || !zoom.client_id || !zoom.client_secret} onClick={() => void connectZoom()}>
                    {busy === 'zoom' && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />}
                    {row('zoom').status === 'disconnected' ? t('hiring.connectZoom') : t('hiring.replaceCredentials')}
                  </Button>
                  {row('zoom').status !== 'disconnected' && <Button variant="outline" className="min-h-11" disabled={!!busy} onClick={() => void disconnect('zoom')}>{t('hiring.disconnect')}</Button>}
                </div>
              </>
            )}
          </Panel>

          {oauthCard('google_meet')}
          {oauthCard('teams')}
        </div>
      </Section>

      <Section title={t('hiring.selfScheduling')} description={t('hiring.candidatesSeeFreeTimesInsideThesea01')}>
        <Panel className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label={t('hiring.timeZone')} htmlFor="s-tz" className="lg:col-span-2">
              <Input id="s-tz" list="s-tz-list" value={sched.timezone} onChange={(e) => setSched({ ...sched, timezone: e.target.value })} disabled={!manage} />
              <datalist id="s-tz-list">{tzList.map((z) => <option key={z} value={z} />)}</datalist>
            </Field>
            <Field label={t('hiring.dayStarts')} htmlFor="s-start"><NativeSelect id="s-start" value={sched.start} onChange={(v) => setSched({ ...sched, start: v })} options={hours.slice(0, 24)} disabled={!manage} /></Field>
            <Field label={t('hiring.dayEnds')} htmlFor="s-end"><NativeSelect id="s-end" value={sched.end} onChange={(v) => setSched({ ...sched, end: v })} options={hours.slice(1)} disabled={!manage} /></Field>
          </div>
          <InlineError message={formErr.sched} />
          {manage && (
            <Button className="min-h-11" disabled={!!busy} onClick={() => void saveSchedule()}>
              {busy === 'sched' && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />}{' '}{t('common.save')}</Button>
          )}
        </Panel>
      </Section>
    </div>
  )
}

export default function HiringIntegrationsPage() {
  const { t } = useT()
  return (
    <HiringShell title={t('hiring.integrations')} description={t('hiring.connectTheMeetingAppsYourTeamaac')} icon={<PlugZap />}>
      <Suspense fallback={<LoadingRows rows={4} />}>
        <IntegrationsInner />
      </Suspense>
    </HiringShell>
  )
}
