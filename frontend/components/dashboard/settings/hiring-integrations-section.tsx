'use client'

/**
 * Admin → Settings → Hiring integrations (superadmin). Platform-level keys the
 * hiring features need — WhatsApp, voice bot, phone callbacks, meetings OAuth
 * apps, LiveKit video — saved to platform_settings.secrets via
 * /api/admin/server-secrets. Env vars stay as a fallback. Company-level keys
 * (Zoom, Checkr) live on Hiring → Settings.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Briefcase, Check, Copy, Eye, EyeOff, Loader2, Lock, Save } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useToast } from '@/lib/toast-context'
import { platformSettingsHref } from '@/lib/platform-settings-nav'

type Meta = Record<string, unknown>

interface FieldDef {
  key: string
  label: string
  secret?: boolean
  placeholder?: string
  hint?: string
  options?: { value: string; label: string }[]
}

interface Badge { label?: string; ok: (m: Meta) => boolean }

interface GroupDef {
  id: string
  title: string
  description: React.ReactNode
  fields: FieldDef[]
  badges: Badge[]
  urls?: { label: string; path: string }[]
  note?: React.ReactNode
}

/** Saved in the dashboard OR present in the server env. */
const set = (m: Meta, k: string) => Boolean(m[`has_${k}`] || (typeof m[k] === 'string' && String(m[k]).trim()) || m[`env_${k}`])
const all = (...keys: string[]) => (m: Meta) => keys.every((k) => set(m, k))
const any = (...keys: string[]) => (m: Meta) => keys.some((k) => set(m, k))

const GROUPS: GroupDef[] = [
  {
    id: 'whatsapp',
    title: 'WhatsApp Business',
    description: 'Meta Cloud API for screening chats and WhatsApp calls. Use a system-user token with whatsapp_business_messaging (and calling, for calls).',
    badges: [{ ok: all('meta_whatsapp_access_token', 'meta_whatsapp_app_secret') }],
    fields: [
      { key: 'meta_whatsapp_access_token', label: 'Access token', secret: true, placeholder: 'EAAG…' },
      { key: 'meta_whatsapp_app_secret', label: 'App secret', secret: true, hint: 'Verifies webhook signatures.' },
      { key: 'meta_whatsapp_verify_token', label: 'Webhook verify token', secret: true, hint: 'Any string you choose — enter the same one in Meta.' },
      { key: 'meta_whatsapp_phone_number_id', label: 'Phone number ID', hint: 'Default sender. Companies can add their own per region.' },
      { key: 'meta_whatsapp_waba_id', label: 'WhatsApp Business account ID' },
      { key: 'meta_whatsapp_graph_version', label: 'Graph API version', placeholder: 'v23.0' },
      { key: 'meta_whatsapp_template_chat', label: 'Chat template name', placeholder: 'candidate_screening_chat' },
      { key: 'meta_whatsapp_template_call', label: 'Call template name', placeholder: 'candidate_screening_call' },
      { key: 'meta_whatsapp_template_status', label: 'Stage update template name', placeholder: 'application_status_update', hint: 'Approved template with 4 body variables: candidate name, job title, company, stage.' },
      { key: 'meta_whatsapp_template_language', label: 'Template language', placeholder: 'en' },
      {
        key: 'meta_whatsapp_call_mode', label: 'Call mode',
        options: [{ value: '', label: 'SIP (default)' }, { value: 'sip', label: 'SIP' }, { value: 'graph', label: 'Graph API (WebRTC)' }],
        hint: 'SIP: the voice agent dials the number over SIP. Graph: calls start through the Graph API.',
      },
    ],
    urls: [{ label: 'WhatsApp webhook URL', path: '/api/ats/screening/webhooks/whatsapp' }],
  },
  {
    id: 'vapi',
    title: 'Voice bot — Vapi',
    description: 'Places screening phone calls and, with a SIP trunk, WhatsApp calls.',
    badges: [{ ok: all('vapi_api_key', 'vapi_webhook_secret') }],
    fields: [
      { key: 'vapi_api_key', label: 'Private API key', secret: true },
      { key: 'vapi_webhook_secret', label: 'Webhook secret', secret: true, hint: 'Any string you choose — set it as the server URL secret in Vapi.' },
      { key: 'vapi_phone_number_ids', label: 'Phone number IDs per region', placeholder: 'IN=…, US=…, *=…', hint: 'Country code = Vapi phone number ID. * is the default.' },
      { key: 'vapi_whatsapp_trunk_number_id', label: 'WhatsApp trunk number ID', hint: 'A Vapi BYO SIP trunk number pointed at wa.meta.vc.' },
    ],
    urls: [{ label: 'Vapi server URL', path: '/api/ats/screening/webhooks/vapi' }],
  },
  {
    id: 'voice-agent',
    title: 'Voice bot — your own voice agent',
    description: 'Optional. Any SIP voice agent (for example a LiveKit agent service) instead of, or next to, Vapi.',
    badges: [{ ok: any('voice_agent_webhook_url', 'voice_agent_sip_uri') }],
    fields: [
      { key: 'voice_agent_sip_uri', label: 'SIP URI', placeholder: 'sip:agent.example.com:5061', hint: 'Set the same URI in the WhatsApp number’s SIP settings.' },
      { key: 'voice_agent_webhook_url', label: 'Dial webhook URL', placeholder: 'https://agent.example.com/dial' },
      { key: 'voice_agent_webhook_secret', label: 'Webhook secret', secret: true },
    ],
  },
  {
    id: 'phone',
    title: 'Phone numbers',
    description: 'Optional. Call status callbacks when companies place calls through their own Twilio or Exotel numbers.',
    badges: [{ label: 'Twilio', ok: any('twilio_auth_token') }, { label: 'Exotel', ok: any('exotel_webhook_token') }],
    fields: [
      { key: 'twilio_auth_token', label: 'Twilio auth token', secret: true, hint: 'Verifies Twilio’s request signatures.' },
      { key: 'exotel_webhook_token', label: 'Exotel webhook token', secret: true, hint: 'Any string you choose — it goes in the callback URL below.' },
    ],
    urls: [
      { label: 'Twilio status callback URL', path: '/api/ats/screening/webhooks/twilio' },
      { label: 'Exotel status callback URL', path: '/api/ats/screening/webhooks/exotel?token=<exotel webhook token>' },
    ],
  },
  {
    id: 'stt',
    title: 'Speech-to-text',
    description: 'Transcribes WhatsApp voice-note answers. Without it, candidates are asked to type instead.',
    badges: [{ label: 'Deepgram', ok: any('deepgram_api_key') }],
    fields: [],
    note: (
      <>
        The Deepgram key is shared with the AI features. Set it in{' '}
        <Link href={platformSettingsHref('llm')} className="text-primary hover:underline">AI &amp; LLM keys → Speech &amp; voice</Link>.
      </>
    ),
  },
  {
    id: 'meetings',
    title: 'Meetings',
    description: 'Platform OAuth apps so companies can connect Google Meet or Microsoft Teams with one click. Companies can still use their own app.',
    badges: [
      { label: 'Google', ok: all('ats_google_client_id', 'ats_google_client_secret') },
      { label: 'Microsoft', ok: all('ats_microsoft_client_id', 'ats_microsoft_client_secret') },
    ],
    fields: [
      { key: 'ats_google_client_id', label: 'Google OAuth client ID', placeholder: '….apps.googleusercontent.com' },
      { key: 'ats_google_client_secret', label: 'Google OAuth client secret', secret: true },
      { key: 'ats_microsoft_client_id', label: 'Microsoft client (application) ID' },
      { key: 'ats_microsoft_client_secret', label: 'Microsoft client secret', secret: true },
      { key: 'ats_microsoft_tenant', label: 'Microsoft tenant', placeholder: 'common', hint: 'Leave empty to allow any work account.' },
    ],
    urls: [
      { label: 'Google redirect URI', path: '/api/ats/integrations/meetings/google/callback' },
      { label: 'Microsoft redirect URI', path: '/api/ats/integrations/meetings/microsoft/callback' },
    ],
    note: 'Zoom is connected per company on Hiring → Settings → Integrations (a Server-to-Server OAuth app from their Zoom account).',
  },
  {
    id: 'video',
    title: 'Video (LiveKit)',
    description: 'Built-in video interviews. Candidates join from their invite link; the panel joins from the interview page.',
    badges: [{ ok: all('livekit_url', 'livekit_api_key', 'livekit_api_secret') }],
    fields: [
      { key: 'livekit_url', label: 'LiveKit URL', placeholder: 'wss://your-project.livekit.cloud' },
      { key: 'livekit_api_key', label: 'API key', placeholder: 'API…' },
      { key: 'livekit_api_secret', label: 'API secret', secret: true },
    ],
  },
]

const ALL_FIELDS = GROUPS.flatMap((g) => g.fields)
const PLAIN_KEYS = ALL_FIELDS.filter((f) => !f.secret).map((f) => f.key)
const SECRET_KEYS = ALL_FIELDS.filter((f) => f.secret).map((f) => f.key)

function StatusPill({ ok, label, env }: { ok: boolean; label?: string; env?: boolean }) {
  const text = ok ? (env ? 'Set in server env' : '✓ Active') : 'Not configured'
  return ok ? (
    <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-[11px] font-medium text-green-700 dark:text-green-300">
      {label ? `${label}: ` : ''}{text}
    </span>
  ) : (
    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
      {label ? `${label}: ` : ''}{text}
    </span>
  )
}

function CopyBox({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false)
  const id = `copy-${label.replace(/\W+/g, '-').toLowerCase()}`
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex gap-2">
        <Input id={id} readOnly value={value} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
        <Button
          type="button" variant="outline" size="icon" aria-label={`Copy ${label}`}
          onClick={async () => { try { await navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1500) } catch { /* clipboard blocked */ } }}
        >
          {done ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  )
}

export function HiringIntegrationsSection() {
  const addToast = useToast()
  const [meta, setMeta] = useState<Meta>({})
  const [plain, setPlain] = useState<Record<string, string>>({})
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [origin, setOrigin] = useState('')
  const [visible, setVisible] = useState<Record<string, boolean>>({})
  const [revealed, setRevealed] = useState<Record<string, string>>({})
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/server-secrets', { credentials: 'include', cache: 'no-store' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Could not load settings')
      const s = (json.secrets || {}) as Meta
      setMeta(s)
      setPlain(Object.fromEntries(PLAIN_KEYS.map((k) => [k, typeof s[k] === 'string' ? String(s[k]) : ''])))
    } catch (e) {
      addToast({ type: 'error', title: 'Could not load hiring integrations', message: (e as Error).message })
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    setOrigin(window.location.origin)
    void load()
    const t = timers.current
    return () => { Object.values(t).forEach(clearTimeout) }
  }, [load])

  const toggleReveal = useCallback(async (key: string) => {
    if (visible[key]) {
      clearTimeout(timers.current[key])
      setVisible((v) => ({ ...v, [key]: false }))
      setRevealed((v) => { const n = { ...v }; delete n[key]; return n })
      return
    }
    if (meta[`has_${key}`]) {
      const res = await fetch(`/api/admin/server-secrets/reveal?key=${key}`, { credentials: 'include' })
      const json = await res.json().catch(() => ({}))
      if (res.ok && json.value) setRevealed((v) => ({ ...v, [key]: json.value }))
    }
    setVisible((v) => ({ ...v, [key]: true }))
    clearTimeout(timers.current[key])
    timers.current[key] = setTimeout(() => {
      setVisible((v) => ({ ...v, [key]: false }))
      setRevealed((v) => { const n = { ...v }; delete n[key]; return n })
    }, 30_000)
  }, [meta, visible])

  async function save() {
    const url = (plain.livekit_url || '').trim()
    if (url && !/^wss?:\/\/\S+$/i.test(url)) {
      addToast({ type: 'error', title: 'Check the LiveKit URL', message: 'It must start with wss:// (or ws:// for local testing).' })
      return
    }
    setSaving(true)
    try {
      // Plain values are always sent (an empty one clears it); secrets only when typed.
      const body: Record<string, string> = {}
      for (const k of PLAIN_KEYS) body[k] = (plain[k] || '').trim()
      for (const k of SECRET_KEYS) if ((draft[k] || '').trim()) body[k] = draft[k].trim()
      const res = await csrfFetch('/api/admin/server-secrets', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Save failed')
      setDraft({})
      await load()
      addToast({ type: 'success', title: 'Hiring integrations saved' })
    } catch (e) {
      addToast({ type: 'error', title: 'Save failed', message: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="flex min-h-[20vh] items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin motion-reduce:animate-none" />Loading…</div>
  }

  const envKey = Boolean(meta.ats_encryption_key_from_env)
  const urlFor = (path: string) => `${origin}${path}`

  return (
    <Card className="rounded-3xl border-border/70 shadow-sm" data-testid="hiring-integrations-section">
      <div className="border-b border-border/60 px-6 py-4">
        <div className="flex items-center gap-2">
          <Briefcase className="h-5 w-5 text-primary" aria-hidden />
          <h3 className="font-semibold text-foreground">Hiring integrations</h3>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Platform keys for bot screening, meetings and video interviews, shared by every company. Saved values take
          effect within 30 seconds — no redeploy. Server environment variables are used only when a field here is empty.
        </p>
      </div>

      <div className="space-y-6 px-6 py-6">
        {GROUPS.map((g) => (
          <div key={g.id} className="space-y-3 rounded-lg border border-border/60 bg-card/40 p-4" data-testid={`hiring-${g.id}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-foreground">{g.title}</p>
              <div className="flex flex-wrap items-center gap-2">
                {g.badges.map((b, i) => {
                  const ok = b.ok(meta)
                  const fromEnv = ok && !b.ok({ ...meta, ...Object.fromEntries(Object.keys(meta).filter((k) => k.startsWith('env_')).map((k) => [k, false])) })
                  return <StatusPill key={i} ok={ok} label={b.label} env={fromEnv} />
                })}
                {g.fields.length > 0 && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">Dynamic</span>}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{g.description}</p>

            {g.fields.length > 0 && (
              <div className="grid gap-4 sm:grid-cols-2">
                {g.fields.map((f) => {
                  const id = `hire_${f.key}`
                  const has = Boolean(meta[`has_${f.key}`])
                  return (
                    <div key={f.key} className="space-y-1.5">
                      <Label htmlFor={id}>{f.label}</Label>
                      {f.secret ? (
                        <>
                          <div className="relative">
                            <Input
                              id={id}
                              type={visible[f.key] ? 'text' : 'password'}
                              value={draft[f.key] ? draft[f.key] : visible[f.key] ? (revealed[f.key] ?? '') : ''}
                              readOnly={Boolean(visible[f.key] && !draft[f.key] && has)}
                              onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                              placeholder={has ? 'Saved — enter a new value to replace' : f.placeholder || 'Not set'}
                              className="pr-10 font-mono"
                              autoComplete="off"
                            />
                            <button
                              type="button"
                              aria-label={visible[f.key] ? `Hide ${f.label}` : `Show ${f.label}`}
                              title="Toggle visibility"
                              onClick={() => void toggleReveal(f.key)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              {visible[f.key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                          {has ? (
                            <p className="font-mono text-[11px] text-muted-foreground">Current key: {String(meta[`${f.key}_masked`] ?? '—')}</p>
                          ) : meta[`env_${f.key}`] ? (
                            <p className="text-[11px] text-muted-foreground">Using the server environment value.</p>
                          ) : null}
                        </>
                      ) : f.options ? (
                        <select
                          id={id}
                          value={plain[f.key] || ''}
                          onChange={(e) => setPlain((p) => ({ ...p, [f.key]: e.target.value }))}
                          className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      ) : (
                        <Input
                          id={id}
                          value={plain[f.key] || ''}
                          onChange={(e) => setPlain((p) => ({ ...p, [f.key]: e.target.value }))}
                          placeholder={f.placeholder}
                          className="font-mono"
                          autoComplete="off"
                        />
                      )}
                      {f.hint && <p className="text-[11px] text-muted-foreground">{f.hint}</p>}
                      {!f.secret && !plain[f.key] && meta[`env_${f.key}`] ? (
                        <p className="text-[11px] text-muted-foreground">Using the server environment value.</p>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            )}

            {g.urls && origin && (
              <div className="grid gap-3 sm:grid-cols-2">
                {g.urls.map((u) => <CopyBox key={u.path} label={u.label} value={urlFor(u.path)} />)}
              </div>
            )}
            {g.note && <p className="text-xs text-muted-foreground">{g.note}</p>}
          </div>
        ))}

        <div className="space-y-3 rounded-lg border border-border/60 bg-card/40 p-4" data-testid="hiring-bgv">
          <p className="text-sm font-semibold text-foreground">Background checks (Checkr)</p>
          <p className="text-xs text-muted-foreground">
            Checkr keys are set per company on Hiring → Settings → Background checks. Each company adds this webhook in
            Checkr with its own company ID in place of &lt;tenantId&gt; — that page shows the exact URL.
          </p>
          {origin && <CopyBox label="Checkr webhook URL" value={urlFor('/api/ats/bgv/webhooks/checkr?tenant=<tenantId>')} />}
        </div>

        <div className="space-y-2 rounded-lg border border-border/60 bg-card/40 p-4" data-testid="hiring-encryption">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-sm font-semibold text-foreground"><Lock className="h-4 w-4 text-primary" aria-hidden /> Credential encryption key</p>
            {envKey ? (
              <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-[11px] font-medium text-green-700 dark:text-green-300">Using ATS_ENCRYPTION_KEY</span>
            ) : (
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">Using the session secret</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {envKey
              ? 'Company meeting credentials (Zoom, Google, Microsoft) are encrypted with ATS_ENCRYPTION_KEY.'
              : meta.ats_encryption_key_too_short
                ? 'ATS_ENCRYPTION_KEY is set but shorter than 32 characters, so the session secret is used — set a 32+ character ATS_ENCRYPTION_KEY on the server for production.'
                : 'Using the session secret — set ATS_ENCRYPTION_KEY (32+ characters) on the server for production.'}
          </p>
          <p className="text-[11px] text-muted-foreground">
            This key can only be set on the server: storing it in the database next to the credentials it protects would defeat the purpose. Changing it means companies reconnect their meeting apps.
          </p>
        </div>
      </div>

      <div className="flex justify-end border-t border-border/60 bg-muted/20 px-6 py-4">
        <Button className="min-h-11 gap-2 rounded-lg" onClick={() => void save()} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Save className="h-4 w-4" />}
          Save hiring integrations
        </Button>
      </div>
    </Card>
  )
}
