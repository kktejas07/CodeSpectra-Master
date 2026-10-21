'use client'

/**
 * Hiring → Settings → Bot screening: numbers per region, provider connection
 * status (booleans only), platform keys (superadmin), webhook URLs and
 * "Test with my number" (simulated when a channel isn't configured).
 * APIs: /api/ats/screening/settings, /api/ats/screening/test, /api/ats/screening/[id],
 * Platform keys are set in Admin → Settings → Hiring integrations (superadmin).
 */
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Bot, Check, Copy, Loader2, Phone, Plus, Save, Send, Trash2, X } from 'lucide-react'
import { PageHeader, Panel, Section } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useToast } from '@/lib/toast-context'
import type { BotChannel } from '@/lib/ats/contract'
import { PlatformAdminHint } from '@/components/hiring/platform-admin-hint'
import { useT } from '@/lib/i18n/client'
import type { Translator } from '@/lib/i18n/catalog'

interface RegionRow { key: string; whatsapp_phone_number_id: string; whatsapp_display_number: string; call_number: string; vapi_phone_number_id: string; provider: 'vapi' | 'exotel' | 'twilio' }
interface Status {
  whatsapp: { access_token: boolean; app_secret: boolean; verify_token: boolean; default_number: boolean; ready: boolean; call_mode: string; template_chat: string; template_call: string; template_language: string }
  whatsapp_call: { ready: boolean; voice_agent_sip_uri: boolean }
  vapi: { api_key: boolean; webhook_secret: boolean; regions: string[]; whatsapp_trunk: boolean; ready: boolean }
  voice_agent_webhook: boolean
  deepgram: boolean
  twilio: boolean
  exotel: boolean
}
interface SettingsResp {
  settings: {
    regions: Record<string, Omit<RegionRow, 'key'>>
    template_chat: string | null; template_call: string | null; template_language: string | null; voice_agent_sip_uri: string | null
    quiet_hours: { start: number; end: number }
    reminder_after_hours: number; reply_timeout_hours: number; permission_timeout_hours: number; retry_delay_hours: number
  }
  status: Status
  can_edit: boolean
  can_edit_platform_keys: boolean
  webhooks: Record<'whatsapp' | 'vapi' | 'twilio' | 'exotel' | 'tick', string>
}
interface Call {
  id: string; channel: BotChannel; provider: string; status: string; step: string; simulated: boolean
  transcript: { role: 'bot' | 'candidate'; text: string; at: string }[]
  answers: Record<string, unknown>; score: number | null; summary: string | null; error?: string | null; recording_url?: string | null
}

const CHANNEL_LABEL = (t: Translator): Record<BotChannel, string> => ({ whatsapp_chat: t('hiring.whatsappChat'), whatsapp_call: t('hiring.whatsappCall'), phone_call: t('hiring.phoneCall') })
const ACTIVE = ['queued', 'permission_requested', 'ringing', 'in_progress']

function StatePill({ ok, label }: { ok: boolean; label?: string }) {
  const { t } = useT()
  return ok
    ? <Badge variant="success">{label || t('hiring.connected')}</Badge>
    : <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300">{label || t('hiring.simulatedNotConfigured')}</Badge>
}

function KeyLine({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  const { t } = useT()
  return (
    <li className="flex items-center gap-2 text-sm">
      {ok ? <Check className="h-4 w-4 text-green-600 dark:text-green-400" aria-hidden /> : <X className="h-4 w-4 text-muted-foreground" aria-hidden />}
      <span className={ok ? 'text-foreground' : 'text-muted-foreground'}>{children}</span>
      <span className="sr-only">{ok ? t('hiring.configured') : t('hiring.missing2')}</span>
    </li>
  )
}

function CopyField({ label, value }: { label: string; value: string }) {
  const { t } = useT()
  const [done, setDone] = useState(false)
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex gap-2">
        <Input readOnly value={value} className="font-mono text-xs" aria-label={label} onFocus={(e) => e.currentTarget.select()} />
        <Button
          type="button" variant="outline" size="icon" aria-label={t('hiring.copyLabel', { label })}
          onClick={async () => { try { await navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1500) } catch { /* ignore */ } }}
        >
          {done ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  )
}

// ─── Test with my number ────────────────────────────────────────────────────

function TestPanel({ q, status }: { q: string; status: Status }) {
  const { t: tr } = useT()
  const addToast = useToast()
  const [phone, setPhone] = useState('')
  const [channel, setChannel] = useState<BotChannel>('whatsapp_chat')
  const [call, setCall] = useState<Call | null>(null)
  const [busy, setBusy] = useState(false)
  const [reply, setReply] = useState('')
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const configured = channel === 'whatsapp_chat' ? status.whatsapp.ready : channel === 'whatsapp_call' ? status.whatsapp_call.ready : status.vapi.ready || status.voice_agent_webhook

  const refresh = useCallback(async (id: string) => {
    const res = await fetch(`/api/ats/screening/${id}${q}`, { credentials: 'include', cache: 'no-store' })
    if (res.ok) setCall((await res.json()).call)
  }, [q])

  useEffect(() => {
    if (timer.current) clearInterval(timer.current)
    if (call && ACTIVE.includes(call.status) && !call.simulated) timer.current = setInterval(() => void refresh(call.id), 4000)
    return () => { if (timer.current) clearInterval(timer.current) }
  }, [call, refresh])

  async function start() {
    setBusy(true)
    try {
      const res = await csrfFetch(`/api/ats/screening/test${q}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, channel }) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || tr('hiring.couldNotStartTheTest'))
      setCall(json.call)
      addToast({ type: 'success', title: json.call?.simulated ? tr('hiring.simulatedTestStarted') : tr('hiring.testStartedCheckYourPhone') })
    } catch (e) {
      addToast({ type: 'error', title: tr('hiring.testFailed'), message: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  async function simulate(body: Record<string, unknown>) {
    if (!call) return
    setBusy(true)
    try {
      const res = await csrfFetch(`/api/ats/screening/${call.id}${q}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || tr('hiring.couldNotUpdate'))
      if (json.call) setCall(json.call)
      setReply('')
    } catch (e) {
      addToast({ type: 'error', title: tr('hiring.couldNotSend'), message: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel>
      <div className="grid gap-4 sm:grid-cols-[1fr_200px_auto] sm:items-end">
        <div className="space-y-1">
          <Label htmlFor="test-phone">{tr('hiring.yourPhoneNumber')}</Label>
          <Input id="test-phone" type="tel" inputMode="tel" placeholder="+91 98765 43210" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="test-channel">{tr('hiring.channel')}</Label>
          <Select value={channel} onValueChange={(v) => setChannel(v as BotChannel)}>
            <SelectTrigger id="test-channel"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(CHANNEL_LABEL(tr)) as BotChannel[]).map((c) => <SelectItem key={c} value={c}>{CHANNEL_LABEL(tr)[c]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={start} disabled={busy || !phone.trim()} className="min-h-11">
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Phone className="mr-2 h-4 w-4" />}{' '}{tr('hiring.testWithMyNumber')}</Button>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        {configured
          ? tr('hiring.runsTheRealFlowOnYoure63')
          : tr('hiring.thisChannelIsntConfiguredSoThecd1')}
      </p>

      {call && (
        <div className="mt-5 space-y-3 rounded-2xl border border-border bg-muted/30 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-foreground">{CHANNEL_LABEL(tr)[call.channel]}</span>
            <Badge variant="outline">{call.status.replace(/_/g, ' ')}</Badge>
            {call.simulated && <StatePill ok={false} label={tr('hiring.simulated')} />}
            {typeof call.score === 'number' && <span className="ml-auto font-mono text-sm tabular-nums text-foreground">{tr('hiring.scoreScore100', { score: call.score })}</span>}
          </div>
          <ol className="max-h-80 space-y-2 overflow-y-auto" aria-live="polite">
            {call.transcript.map((t, i) => (
              <li key={i} className={t.role === 'bot' ? 'mr-8 rounded-xl bg-card px-3 py-2 text-sm text-foreground' : 'ml-8 rounded-xl bg-primary/10 px-3 py-2 text-sm text-foreground'}>
                <span className="sr-only">{t.role === 'bot' ? tr('hiring.bot') : tr('hiring.you')}</span>{t.text}
              </li>
            ))}
          </ol>
          {call.summary && <p className="text-sm text-muted-foreground">{call.summary}</p>}
          {call.error && <p className="text-sm text-red-600 dark:text-red-400">{call.error}</p>}
          {call.simulated && ACTIVE.includes(call.status) && (
            <div className="space-y-2">
              {(call.step === 'awaiting_consent' || call.step === 'asking') && (
                <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (reply.trim()) void simulate({ event: 'reply', text: reply }) }}>
                  <Input aria-label={tr('hiring.replyAsTheCandidate')} placeholder={tr('hiring.replyAsTheCandidateEG7f0')} value={reply} onChange={(e) => setReply(e.target.value)} />
                  <Button type="submit" size="icon" aria-label={tr('hiring.sendReply')} disabled={busy || !reply.trim()}><Send className="h-4 w-4" /></Button>
                </form>
              )}
              {call.step === 'awaiting_permission' && (
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => simulate({ event: 'permission', accept: true })} disabled={busy}>{tr('hiring.allowCall')}</Button>
                  <Button variant="outline" onClick={() => simulate({ event: 'permission', accept: false })} disabled={busy}>{tr('hiring.declineCall')}</Button>
                </div>
              )}
              {call.step === 'calling' && (
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" disabled={busy} onClick={() => simulate({
                    event: 'call_report',
                    transcript: [
                      { role: 'bot', text: tr('hiring.areYouOpenToWorkingFrombe4') }, { role: 'candidate', text: tr('hiring.yesIAm') },
                      { role: 'bot', text: tr('hiring.howManyYearsOfExperienceDoc2b') }, { role: 'candidate', text: tr('hiring.aboutFiveYears') },
                      { role: 'bot', text: tr('hiring.whatAreYouLookingForNext') }, { role: 'candidate', text: tr('hiring.aProductTeamWhereICane2c') },
                    ],
                    answers: { q_relocate: true, q_years: 5 },
                  })}>{tr('hiring.finishCallWithSampleAnswers')}</Button>
                  <Button variant="outline" onClick={() => simulate({ event: 'no_answer' })} disabled={busy}>{tr('hiring.noAnswer')}</Button>
                </div>
              )}
            </div>
          )}
          {!call.simulated && ACTIVE.includes(call.status) && (
            <Button variant="ghost" size="sm" onClick={() => void refresh(call.id)}><Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" />{' '}{tr('hiring.waitingForReplies')}</Button>
          )}
        </div>
      )}
    </Panel>
  )
}

// ─── Page ───────────────────────────────────────────────────────────────────

function toRows(regions: SettingsResp['settings']['regions']): RegionRow[] {
  return Object.entries(regions || {}).map(([key, r]) => ({
    key,
    whatsapp_phone_number_id: r.whatsapp_phone_number_id || '',
    whatsapp_display_number: r.whatsapp_display_number || '',
    call_number: r.call_number || '',
    vapi_phone_number_id: r.vapi_phone_number_id || '',
    provider: (r.provider || 'vapi') as RegionRow['provider'],
  }))
}

function ScreeningSettingsInner() {
  const { t } = useT()
  const sp = useSearchParams()
  const tenant = sp.get('tenant')
  const q = tenant ? `?tenant=${encodeURIComponent(tenant)}` : ''
  const addToast = useToast()
  const [data, setData] = useState<SettingsResp | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<RegionRow[]>([])
  const [form, setForm] = useState({ template_chat: '', template_call: '', template_language: '', voice_agent_sip_uri: '', start: 9, end: 20, reminder: 4, timeout: 23, permission: 24, retry: 2 })
  const [saving, setSaving] = useState(false)
  const [applying, setApplying] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/ats/screening/settings${q}`, { credentials: 'include', cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) { setError(json.error || t('hiring.couldNotLoadSettings')); return }
      setData(json)
      setError(null)
      const s = json.settings as SettingsResp['settings']
      setRows(toRows(s.regions))
      setForm({
        template_chat: s.template_chat || '', template_call: s.template_call || '', template_language: s.template_language || '',
        voice_agent_sip_uri: s.voice_agent_sip_uri || '', start: s.quiet_hours.start, end: s.quiet_hours.end,
        reminder: s.reminder_after_hours, timeout: s.reply_timeout_hours, permission: s.permission_timeout_hours, retry: s.retry_delay_hours,
      })
    } catch {
      setError(t('hiring.couldNotLoadSettings'))
    }
  }, [q])
  useEffect(() => { void load() }, [load])

  async function save() {
    setSaving(true)
    try {
      const regions: Record<string, Omit<RegionRow, 'key'>> = {}
      for (const r of rows) {
        const key = r.key.trim().toUpperCase()
        if (!key) continue
        const { key: _k, ...rest } = r // eslint-disable-line @typescript-eslint/no-unused-vars
        regions[key] = rest
      }
      const res = await csrfFetch(`/api/ats/screening/settings${q}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          regions,
          template_chat: form.template_chat, template_call: form.template_call, template_language: form.template_language,
          voice_agent_sip_uri: form.voice_agent_sip_uri,
          quiet_hours: { start: Number(form.start), end: Number(form.end) },
          reminder_after_hours: Number(form.reminder), reply_timeout_hours: Number(form.timeout),
          permission_timeout_hours: Number(form.permission), retry_delay_hours: Number(form.retry),
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || t('hiring.saveFailed'))
      addToast({ type: 'success', title: t('hiring.screeningSettingsSaved') })
      await load()
    } catch (e) {
      addToast({ type: 'error', title: t('hiring.couldNotSave'), message: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }

  async function applySip(pnid: string) {
    setApplying(pnid)
    try {
      const res = await csrfFetch(`/api/ats/screening/settings${q}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'apply_sip', phone_number_id: pnid }) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || t('hiring.failed'))
      addToast({ type: 'success', title: t('hiring.whatsappCallingEnabledOnThisNumber') })
    } catch (e) {
      addToast({ type: 'error', title: t('hiring.couldNotEnableCalling'), message: (e as Error).message })
    } finally {
      setApplying(null)
    }
  }

  if (error) {
    return <EmptyState illustration="locked" title={t('hiring.botScreeningSettingsArentAvailable')} description={error} actionLabel={t('hiring.backToHiring')} actionHref="/dashboard/hiring" />
  }
  if (!data) {
    return <div className="flex min-h-[40vh] items-center justify-center" role="status"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground motion-reduce:animate-none" /><span className="sr-only">{t('hiring.loading')}</span></div>
  }
  const st = data.status
  const edit = data.can_edit
  const setRow = (i: number, patch: Partial<RegionRow>) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)))

  return (
    <div className="space-y-8">
      <PageHeader
        title={t('hiring.botScreening')}
        description={t('hiring.candidatesAreScreenedOnWhatsappChat805')}
        icon={<Bot />}
        illustration="integrations"
      />

      <Section title={t('hiring.connections')} description={t('hiring.whichProvidersAreSetUpChannelsfa4')}>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Panel className="p-5">
            <div className="mb-3 flex items-center justify-between gap-2"><h3 className="font-semibold text-foreground">{t('hiring.whatsappChat')}</h3><StatePill ok={st.whatsapp.ready} /></div>
            <ul className="space-y-1.5">
              <KeyLine ok={st.whatsapp.access_token}>{t('hiring.accessToken')}</KeyLine>
              <KeyLine ok={st.whatsapp.app_secret}>{t('hiring.appSecret')}</KeyLine>
              <KeyLine ok={st.whatsapp.verify_token}>{t('hiring.webhookVerifyToken')}</KeyLine>
              <KeyLine ok={st.whatsapp.default_number || rows.some((r) => r.whatsapp_phone_number_id)}>{t('hiring.aWhatsappNumber')}</KeyLine>
            </ul>
          </Panel>
          <Panel className="p-5">
            <div className="mb-3 flex items-center justify-between gap-2"><h3 className="font-semibold text-foreground">{t('hiring.whatsappCalls')}</h3><StatePill ok={st.whatsapp_call.ready} /></div>
            <ul className="space-y-1.5">
              <KeyLine ok={st.whatsapp.ready}>{t('hiring.whatsappChatConnected')}</KeyLine>
              <KeyLine ok={st.whatsapp_call.voice_agent_sip_uri || !!form.voice_agent_sip_uri}>{t('hiring.voiceAgentSipUri')}</KeyLine>
              <KeyLine ok={st.vapi.whatsapp_trunk || st.voice_agent_webhook}>{t('hiring.agentDialerVapiTrunkOrCustom')}</KeyLine>
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">{t('hiring.modeValue', { value: st.whatsapp.call_mode === 'graph' ? t('hiring.graphApiWebrtc') : t('hiring.sip') })}</p>
          </Panel>
          <Panel className="p-5">
            <div className="mb-3 flex items-center justify-between gap-2"><h3 className="font-semibold text-foreground">{t('hiring.phoneCalls')}</h3><StatePill ok={st.vapi.ready || st.voice_agent_webhook} /></div>
            <ul className="space-y-1.5">
              <KeyLine ok={st.vapi.api_key}>{t('hiring.vapiApiKey')}</KeyLine>
              <KeyLine ok={st.vapi.webhook_secret}>{t('hiring.vapiWebhookSecret')}</KeyLine>
              <KeyLine ok={st.vapi.regions.length > 0 || rows.some((r) => r.vapi_phone_number_id)}>{t('hiring.regionalNumbers')}{st.vapi.regions.length ? ` (${st.vapi.regions.join(', ')})` : ''}
              </KeyLine>
              <KeyLine ok={st.twilio}>{t('hiring.twilioStatusCallbacksOptional')}</KeyLine>
              <KeyLine ok={st.exotel}>{t('hiring.exotelStatusCallbacksOptional')}</KeyLine>
            </ul>
          </Panel>
          <Panel className="p-5">
            <div className="mb-3 flex items-center justify-between gap-2"><h3 className="font-semibold text-foreground">{t('hiring.voiceNotes')}</h3><StatePill ok={st.deepgram} label={st.deepgram ? t('hiring.transcribed') : t('hiring.askToType')} /></div>
            <p className="text-sm text-muted-foreground">{t('hiring.withADeepgramKeyVoiceNote1d0')}</p>
          </Panel>
        </div>
      </Section>

      {!(st.whatsapp.ready && st.whatsapp_call.ready && (st.vapi.ready || st.voice_agent_webhook)) && (
        <Panel className="p-4">
          <PlatformAdminHint
            isPlatformAdmin={data.can_edit_platform_keys}
            what="WhatsApp, voice bot and phone keys"
            className="text-sm text-muted-foreground"
          />
        </Panel>
      )}

      <Section
        title={t('hiring.numbersPerRegion')}
        description={t('hiring.pickNumbersByTheCandidatesCountrybda')}
        actions={edit ? <Button variant="outline" onClick={() => setRows((r) => [...r, { key: '', whatsapp_phone_number_id: '', whatsapp_display_number: '', call_number: '', vapi_phone_number_id: '', provider: 'vapi' }])}><Plus className="mr-2 h-4 w-4" />{' '}{t('hiring.addRegion')}</Button> : null}
      >
        {rows.length === 0 ? (
          <EmptyState
            compact
            illustration="integrations"
            title={t('hiring.noRegionalNumbersYet')}
            description={t('hiring.screeningUsesThePlatformsDefaultWhatsapp413')}
          />
        ) : (
          <div className="space-y-3">
            {rows.map((r, i) => (
              <Panel key={i} className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[90px_1fr_1fr_1fr_1fr_130px_auto] lg:items-end">
                <div className="space-y-1">
                  <Label htmlFor={`rk-${i}`}>{t('hiring.country')}</Label>
                  <Input id={`rk-${i}`} placeholder={t('hiring.in2')} maxLength={2} value={r.key} disabled={!edit} onChange={(e) => setRow(i, { key: e.target.value.toUpperCase() })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`rw-${i}`}>{t('hiring.whatsappPhoneNumberId')}</Label>
                  <Input id={`rw-${i}`} inputMode="numeric" value={r.whatsapp_phone_number_id} disabled={!edit} onChange={(e) => setRow(i, { whatsapp_phone_number_id: e.target.value.trim() })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`rd-${i}`}>{t('hiring.whatsappNumber')}</Label>
                  <Input id={`rd-${i}`} type="tel" placeholder="+91…" value={r.whatsapp_display_number} disabled={!edit} onChange={(e) => setRow(i, { whatsapp_display_number: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`rc-${i}`}>{t('hiring.callerNumber')}</Label>
                  <Input id={`rc-${i}`} type="tel" placeholder="+91…" value={r.call_number} disabled={!edit} onChange={(e) => setRow(i, { call_number: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`rv-${i}`}>{t('hiring.vapiPhoneNumberId')}</Label>
                  <Input id={`rv-${i}`} value={r.vapi_phone_number_id} disabled={!edit} onChange={(e) => setRow(i, { vapi_phone_number_id: e.target.value.trim() })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`rp-${i}`}>{t('hiring.carrier')}</Label>
                  <Select value={r.provider} onValueChange={(v) => setRow(i, { provider: v as RegionRow['provider'] })} disabled={!edit}>
                    <SelectTrigger id={`rp-${i}`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="vapi">{t('hiring.vapiNumber')}</SelectItem>
                      <SelectItem value="exotel">{t('hiring.exotelIndia')}</SelectItem>
                      <SelectItem value="twilio">{t('hiring.twilio')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  {edit && r.whatsapp_phone_number_id && (
                    <Button variant="outline" size="sm" className="min-h-10" disabled={applying === r.whatsapp_phone_number_id} onClick={() => applySip(r.whatsapp_phone_number_id)}>
                      {applying === r.whatsapp_phone_number_id ? <Loader2 className="h-4 w-4 animate-spin" /> : t('hiring.enableCalls')}
                    </Button>
                  )}
                  {edit && (
                    <Button variant="ghost" size="icon" aria-label={t('hiring.removeRegionValue', { value: r.key || i + 1 })} onClick={() => setRows((rs) => rs.filter((_, k) => k !== i))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </Panel>
            ))}
          </div>
        )}
      </Section>

      <Section title={t('hiring.messagesAndTiming')}>
        <Panel>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="tc">{t('hiring.chatTemplateName')}</Label>
              <Input id="tc" placeholder={st.whatsapp.template_chat} value={form.template_chat} disabled={!edit} onChange={(e) => setForm({ ...form, template_chat: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="tl">{t('hiring.callTemplateName')}</Label>
              <Input id="tl" placeholder={st.whatsapp.template_call} value={form.template_call} disabled={!edit} onChange={(e) => setForm({ ...form, template_call: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="tg">{t('hiring.templateLanguage')}</Label>
              <Input id="tg" placeholder={st.whatsapp.template_language} value={form.template_language} disabled={!edit} onChange={(e) => setForm({ ...form, template_language: e.target.value })} />
            </div>
            <div className="space-y-1 sm:col-span-2 lg:col-span-3">
              <Label htmlFor="sip">{t('hiring.yourVoiceAgentSipUriOptional6b9')}</Label>
              <Input id="sip" placeholder="sip:agent.example.com:5061" value={form.voice_agent_sip_uri} disabled={!edit} onChange={(e) => setForm({ ...form, voice_agent_sip_uri: e.target.value })} />
            </div>
            {([
              ['start', 'Outreach from (hour)', 0, 23], ['end', 'Outreach until (hour)', 1, 24],
              ['reminder', 'Reminder after (hours)', 1, 20], ['timeout', 'Give up after (hours)', 2, 23],
              ['permission', 'Wait for call permission (hours)', 1, 72], ['retry', 'Retry a missed call after (hours)', 0.5, 48],
            ] as const).map(([k, label, min, max]) => (
              <div key={k} className="space-y-1">
                <Label htmlFor={`f-${k}`}>{label}</Label>
                <Input id={`f-${k}`} type="number" min={min} max={max} step={k === 'retry' ? 0.5 : 1} className="tabular-nums" value={form[k]} disabled={!edit} onChange={(e) => setForm({ ...form, [k]: Number(e.target.value) })} />
              </div>
            ))}
          </div>
          {edit && (
            <div className="mt-5 flex justify-end">
              <Button onClick={save} disabled={saving} className="min-h-11">
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}{' '}{t('hiring.saveSettings')}</Button>
            </div>
          )}
        </Panel>
      </Section>

      <Section title={t('hiring.webhookUrls')} description={t('hiring.pasteTheseIntoMetaVapiTwilio4e6')}>
        <Panel className="grid gap-4 md:grid-cols-2">
          <CopyField label={t('hiring.whatsappMetaFieldsMessagesCalls')} value={data.webhooks.whatsapp} />
          <CopyField label={t('hiring.vapiServerUrl')} value={data.webhooks.vapi} />
          <CopyField label={t('hiring.twilioStatusCallback')} value={data.webhooks.twilio} />
          <CopyField label={t('hiring.exotelStatusCallback')} value={data.webhooks.exotel} />
          <CopyField label={t('hiring.schedulerTick')} value={data.webhooks.tick} />
        </Panel>
      </Section>

      {edit && (
        <Section title={t('hiring.testWithMyNumber')} description={t('hiring.tryAChannelEndToEnd37c')}>
          <TestPanel q={q} status={st} />
        </Section>
      )}
    </div>
  )
}

export default function ScreeningSettingsPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <Suspense fallback={null}>
        <ScreeningSettingsInner />
      </Suspense>
    </div>
  )
}
