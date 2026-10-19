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

const CHANNEL_LABEL: Record<BotChannel, string> = { whatsapp_chat: 'WhatsApp chat', whatsapp_call: 'WhatsApp call', phone_call: 'Phone call' }
const ACTIVE = ['queued', 'permission_requested', 'ringing', 'in_progress']

function StatePill({ ok, label }: { ok: boolean; label?: string }) {
  return ok
    ? <Badge variant="success">{label || 'Connected'}</Badge>
    : <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300">{label || 'Simulated — not configured'}</Badge>
}

function KeyLine({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      {ok ? <Check className="h-4 w-4 text-green-600 dark:text-green-400" aria-hidden /> : <X className="h-4 w-4 text-muted-foreground" aria-hidden />}
      <span className={ok ? 'text-foreground' : 'text-muted-foreground'}>{children}</span>
      <span className="sr-only">{ok ? 'configured' : 'missing'}</span>
    </li>
  )
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false)
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex gap-2">
        <Input readOnly value={value} className="font-mono text-xs" aria-label={label} onFocus={(e) => e.currentTarget.select()} />
        <Button
          type="button" variant="outline" size="icon" aria-label={`Copy ${label}`}
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
      if (!res.ok) throw new Error(json.error || 'Could not start the test')
      setCall(json.call)
      addToast({ type: 'success', title: json.call?.simulated ? 'Simulated test started' : 'Test started — check your phone' })
    } catch (e) {
      addToast({ type: 'error', title: 'Test failed', message: (e as Error).message })
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
      if (!res.ok) throw new Error(json.error || 'Could not update')
      if (json.call) setCall(json.call)
      setReply('')
    } catch (e) {
      addToast({ type: 'error', title: 'Could not send', message: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel>
      <div className="grid gap-4 sm:grid-cols-[1fr_200px_auto] sm:items-end">
        <div className="space-y-1">
          <Label htmlFor="test-phone">Your phone number</Label>
          <Input id="test-phone" type="tel" inputMode="tel" placeholder="+91 98765 43210" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="test-channel">Channel</Label>
          <Select value={channel} onValueChange={(v) => setChannel(v as BotChannel)}>
            <SelectTrigger id="test-channel"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(CHANNEL_LABEL) as BotChannel[]).map((c) => <SelectItem key={c} value={c}>{CHANNEL_LABEL[c]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={start} disabled={busy || !phone.trim()} className="min-h-11">
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Phone className="mr-2 h-4 w-4" />} Test with my number
        </Button>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        {configured
          ? 'Runs the real flow on your phone with three sample questions. Nothing is added to a pipeline.'
          : 'This channel isn’t configured, so the test is simulated — nothing is sent. Reply below as if you were the candidate.'}
      </p>

      {call && (
        <div className="mt-5 space-y-3 rounded-2xl border border-border bg-muted/30 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-foreground">{CHANNEL_LABEL[call.channel]}</span>
            <Badge variant="outline">{call.status.replace(/_/g, ' ')}</Badge>
            {call.simulated && <StatePill ok={false} label="Simulated" />}
            {typeof call.score === 'number' && <span className="ml-auto font-mono text-sm tabular-nums text-foreground">Score {call.score}/100</span>}
          </div>
          <ol className="max-h-80 space-y-2 overflow-y-auto" aria-live="polite">
            {call.transcript.map((t, i) => (
              <li key={i} className={t.role === 'bot' ? 'mr-8 rounded-xl bg-card px-3 py-2 text-sm text-foreground' : 'ml-8 rounded-xl bg-primary/10 px-3 py-2 text-sm text-foreground'}>
                <span className="sr-only">{t.role === 'bot' ? 'Bot: ' : 'You: '}</span>{t.text}
              </li>
            ))}
          </ol>
          {call.summary && <p className="text-sm text-muted-foreground">{call.summary}</p>}
          {call.error && <p className="text-sm text-red-600 dark:text-red-400">{call.error}</p>}
          {call.simulated && ACTIVE.includes(call.status) && (
            <div className="space-y-2">
              {(call.step === 'awaiting_consent' || call.step === 'asking') && (
                <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (reply.trim()) void simulate({ event: 'reply', text: reply }) }}>
                  <Input aria-label="Reply as the candidate" placeholder="Reply as the candidate (e.g. yes, 4, I want to grow…)" value={reply} onChange={(e) => setReply(e.target.value)} />
                  <Button type="submit" size="icon" aria-label="Send reply" disabled={busy || !reply.trim()}><Send className="h-4 w-4" /></Button>
                </form>
              )}
              {call.step === 'awaiting_permission' && (
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => simulate({ event: 'permission', accept: true })} disabled={busy}>Allow call</Button>
                  <Button variant="outline" onClick={() => simulate({ event: 'permission', accept: false })} disabled={busy}>Decline call</Button>
                </div>
              )}
              {call.step === 'calling' && (
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" disabled={busy} onClick={() => simulate({
                    event: 'call_report',
                    transcript: [
                      { role: 'bot', text: 'Are you open to working from our office?' }, { role: 'candidate', text: 'Yes, I am.' },
                      { role: 'bot', text: 'How many years of experience do you have?' }, { role: 'candidate', text: 'About five years.' },
                      { role: 'bot', text: 'What are you looking for next?' }, { role: 'candidate', text: 'A product team where I can own backend services end to end.' },
                    ],
                    answers: { q_relocate: true, q_years: 5 },
                  })}>Finish call with sample answers</Button>
                  <Button variant="outline" onClick={() => simulate({ event: 'no_answer' })} disabled={busy}>No answer</Button>
                </div>
              )}
            </div>
          )}
          {!call.simulated && ACTIVE.includes(call.status) && (
            <Button variant="ghost" size="sm" onClick={() => void refresh(call.id)}><Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" /> Waiting for replies…</Button>
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
      if (!res.ok) { setError(json.error || 'Could not load settings'); return }
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
      setError('Could not load settings')
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
      if (!res.ok) throw new Error(json.error || 'Save failed')
      addToast({ type: 'success', title: 'Screening settings saved' })
      await load()
    } catch (e) {
      addToast({ type: 'error', title: 'Could not save', message: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }

  async function applySip(pnid: string) {
    setApplying(pnid)
    try {
      const res = await csrfFetch(`/api/ats/screening/settings${q}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'apply_sip', phone_number_id: pnid }) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Failed')
      addToast({ type: 'success', title: 'WhatsApp calling enabled on this number' })
    } catch (e) {
      addToast({ type: 'error', title: 'Could not enable calling', message: (e as Error).message })
    } finally {
      setApplying(null)
    }
  }

  if (error) {
    return <EmptyState illustration="locked" title="Bot screening settings aren't available" description={error} actionLabel="Back to hiring" actionHref="/dashboard/hiring" />
  }
  if (!data) {
    return <div className="flex min-h-[40vh] items-center justify-center" role="status"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground motion-reduce:animate-none" /><span className="sr-only">Loading</span></div>
  }
  const st = data.status
  const edit = data.can_edit
  const setRow = (i: number, patch: Partial<RegionRow>) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)))

  return (
    <div className="space-y-8">
      <PageHeader
        title="Bot screening"
        description="Candidates are screened on WhatsApp chat, WhatsApp calls or a regional phone number — tried in the order each job's stage sets. Messages and calls only go out between your outreach hours, in the candidate's local time."
        icon={<Bot />}
        illustration="integrations"
      />

      <Section title="Connections" description="Which providers are set up. Channels that aren't use a simulated provider, so you can try the flow without sending anything.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Panel className="p-5">
            <div className="mb-3 flex items-center justify-between gap-2"><h3 className="font-semibold text-foreground">WhatsApp chat</h3><StatePill ok={st.whatsapp.ready} /></div>
            <ul className="space-y-1.5">
              <KeyLine ok={st.whatsapp.access_token}>Access token</KeyLine>
              <KeyLine ok={st.whatsapp.app_secret}>App secret</KeyLine>
              <KeyLine ok={st.whatsapp.verify_token}>Webhook verify token</KeyLine>
              <KeyLine ok={st.whatsapp.default_number || rows.some((r) => r.whatsapp_phone_number_id)}>A WhatsApp number</KeyLine>
            </ul>
          </Panel>
          <Panel className="p-5">
            <div className="mb-3 flex items-center justify-between gap-2"><h3 className="font-semibold text-foreground">WhatsApp calls</h3><StatePill ok={st.whatsapp_call.ready} /></div>
            <ul className="space-y-1.5">
              <KeyLine ok={st.whatsapp.ready}>WhatsApp chat connected</KeyLine>
              <KeyLine ok={st.whatsapp_call.voice_agent_sip_uri || !!form.voice_agent_sip_uri}>Voice agent SIP URI</KeyLine>
              <KeyLine ok={st.vapi.whatsapp_trunk || st.voice_agent_webhook}>Agent dialer (Vapi trunk or custom)</KeyLine>
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">Mode: {st.whatsapp.call_mode === 'graph' ? 'Graph API (WebRTC)' : 'SIP'}</p>
          </Panel>
          <Panel className="p-5">
            <div className="mb-3 flex items-center justify-between gap-2"><h3 className="font-semibold text-foreground">Phone calls</h3><StatePill ok={st.vapi.ready || st.voice_agent_webhook} /></div>
            <ul className="space-y-1.5">
              <KeyLine ok={st.vapi.api_key}>Vapi API key</KeyLine>
              <KeyLine ok={st.vapi.webhook_secret}>Vapi webhook secret</KeyLine>
              <KeyLine ok={st.vapi.regions.length > 0 || rows.some((r) => r.vapi_phone_number_id)}>
                Regional numbers{st.vapi.regions.length ? ` (${st.vapi.regions.join(', ')})` : ''}
              </KeyLine>
              <KeyLine ok={st.twilio}>Twilio status callbacks (optional)</KeyLine>
              <KeyLine ok={st.exotel}>Exotel status callbacks (optional)</KeyLine>
            </ul>
          </Panel>
          <Panel className="p-5">
            <div className="mb-3 flex items-center justify-between gap-2"><h3 className="font-semibold text-foreground">Voice notes</h3><StatePill ok={st.deepgram} label={st.deepgram ? 'Transcribed' : 'Ask to type'} /></div>
            <p className="text-sm text-muted-foreground">With a Deepgram key, voice-note answers on WhatsApp are transcribed. Without it, candidates are asked to type instead.</p>
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
        title="Numbers per region"
        description="Pick numbers by the candidate's country (or their phone's country code). Use * for your default. Leave empty to use the platform's numbers."
        actions={edit ? <Button variant="outline" onClick={() => setRows((r) => [...r, { key: '', whatsapp_phone_number_id: '', whatsapp_display_number: '', call_number: '', vapi_phone_number_id: '', provider: 'vapi' }])}><Plus className="mr-2 h-4 w-4" /> Add region</Button> : null}
      >
        {rows.length === 0 ? (
          <EmptyState
            compact
            illustration="integrations"
            title="No regional numbers yet"
            description="Screening uses the platform's default WhatsApp number and regional caller numbers. Add a region to use your own."
          />
        ) : (
          <div className="space-y-3">
            {rows.map((r, i) => (
              <Panel key={i} className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[90px_1fr_1fr_1fr_1fr_130px_auto] lg:items-end">
                <div className="space-y-1">
                  <Label htmlFor={`rk-${i}`}>Country</Label>
                  <Input id={`rk-${i}`} placeholder="IN" maxLength={2} value={r.key} disabled={!edit} onChange={(e) => setRow(i, { key: e.target.value.toUpperCase() })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`rw-${i}`}>WhatsApp phone number ID</Label>
                  <Input id={`rw-${i}`} inputMode="numeric" value={r.whatsapp_phone_number_id} disabled={!edit} onChange={(e) => setRow(i, { whatsapp_phone_number_id: e.target.value.trim() })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`rd-${i}`}>WhatsApp number</Label>
                  <Input id={`rd-${i}`} type="tel" placeholder="+91…" value={r.whatsapp_display_number} disabled={!edit} onChange={(e) => setRow(i, { whatsapp_display_number: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`rc-${i}`}>Caller number</Label>
                  <Input id={`rc-${i}`} type="tel" placeholder="+91…" value={r.call_number} disabled={!edit} onChange={(e) => setRow(i, { call_number: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`rv-${i}`}>Vapi phone number ID</Label>
                  <Input id={`rv-${i}`} value={r.vapi_phone_number_id} disabled={!edit} onChange={(e) => setRow(i, { vapi_phone_number_id: e.target.value.trim() })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`rp-${i}`}>Carrier</Label>
                  <Select value={r.provider} onValueChange={(v) => setRow(i, { provider: v as RegionRow['provider'] })} disabled={!edit}>
                    <SelectTrigger id={`rp-${i}`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="vapi">Vapi number</SelectItem>
                      <SelectItem value="exotel">Exotel (India)</SelectItem>
                      <SelectItem value="twilio">Twilio</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  {edit && r.whatsapp_phone_number_id && (
                    <Button variant="outline" size="sm" className="min-h-10" disabled={applying === r.whatsapp_phone_number_id} onClick={() => applySip(r.whatsapp_phone_number_id)}>
                      {applying === r.whatsapp_phone_number_id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enable calls'}
                    </Button>
                  )}
                  {edit && (
                    <Button variant="ghost" size="icon" aria-label={`Remove region ${r.key || i + 1}`} onClick={() => setRows((rs) => rs.filter((_, k) => k !== i))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </Panel>
            ))}
          </div>
        )}
      </Section>

      <Section title="Messages and timing">
        <Panel>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="tc">Chat template name</Label>
              <Input id="tc" placeholder={st.whatsapp.template_chat} value={form.template_chat} disabled={!edit} onChange={(e) => setForm({ ...form, template_chat: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="tl">Call template name</Label>
              <Input id="tl" placeholder={st.whatsapp.template_call} value={form.template_call} disabled={!edit} onChange={(e) => setForm({ ...form, template_call: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="tg">Template language</Label>
              <Input id="tg" placeholder={st.whatsapp.template_language} value={form.template_language} disabled={!edit} onChange={(e) => setForm({ ...form, template_language: e.target.value })} />
            </div>
            <div className="space-y-1 sm:col-span-2 lg:col-span-3">
              <Label htmlFor="sip">Your voice agent SIP URI (optional — overrides the platform agent)</Label>
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
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Save settings
              </Button>
            </div>
          )}
        </Panel>
      </Section>

      <Section title="Webhook URLs" description="Paste these into Meta, Vapi, Twilio and Exotel. The tick URL is for your scheduler (every 5 minutes, Bearer CRON_SECRET).">
        <Panel className="grid gap-4 md:grid-cols-2">
          <CopyField label="WhatsApp (Meta) — fields: messages, calls" value={data.webhooks.whatsapp} />
          <CopyField label="Vapi server URL" value={data.webhooks.vapi} />
          <CopyField label="Twilio status callback" value={data.webhooks.twilio} />
          <CopyField label="Exotel status callback" value={data.webhooks.exotel} />
          <CopyField label="Scheduler tick" value={data.webhooks.tick} />
        </Panel>
      </Section>

      {edit && (
        <Section title="Test with my number" description="Try a channel end to end before candidates see it.">
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
