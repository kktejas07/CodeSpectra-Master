/**
 * Bot screening settings for the tenant (ATS admins).
 *  GET   → { settings, status (which platform keys are configured — booleans), webhooks, can_edit_platform_keys }
 *  PATCH → numbers per region, template names, voice agent SIP URI, timings
 *  POST  { action: 'apply_sip', phone_number_id } → enable WhatsApp calling + SIP on that number
 * Platform keys themselves are saved through /api/admin/server-secrets (superadmin).
 */
import { NextRequest, NextResponse } from 'next/server'
import { auditAts, can, requireAts, tenantFromRequest } from '@/lib/ats/access'
import { getAPIUser, isSuperAdminCaller } from '@/lib/route-auth'
import { limitRequest } from '@/lib/rate-limit'
import { connectionStatus, getPlatformConfig, getTenantSettings, whatsappReady } from '@/lib/ats/screening/config'
import { appBaseUrl } from '@/lib/ats/screening/machine'
import { applySipSettings, parseSipUri } from '@/lib/ats/screening/providers/whatsapp'
import { toE164 } from '@/lib/ats/screening/regions'
import { settingsCol, nowIso } from '@/lib/ats/screening/store'
import type { RegionNumber, TenantScreeningSettings } from '@/lib/ats/screening/types'

export const runtime = 'nodejs'

const gate = (req: NextRequest) => requireAts(['admin', 'recruiter'], tenantFromRequest(req))

export async function GET(req: NextRequest) {
  const g = await gate(req)
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
  try {
    const [settings, status, user] = await Promise.all([getTenantSettings(g.actor.tenantId), connectionStatus(), getAPIUser()])
    const base = appBaseUrl()
    return NextResponse.json({
      settings,
      status,
      can_edit: can(g.actor, 'settings.manage'),
      can_edit_platform_keys: isSuperAdminCaller(user),
      webhooks: {
        whatsapp: `${base}/api/ats/screening/webhooks/whatsapp`,
        vapi: `${base}/api/ats/screening/webhooks/vapi`,
        twilio: `${base}/api/ats/screening/webhooks/twilio`,
        exotel: `${base}/api/ats/screening/webhooks/exotel?token=<exotel webhook token>`,
        tick: `${base}/api/ats/screening/tick`,
      },
    })
  } catch (e) {
    console.error('[ats/screening/settings] GET failed:', e)
    return NextResponse.json({ error: 'Could not load settings' }, { status: 500 })
  }
}

const ID = /^[A-Za-z0-9_-]{1,64}$/
const PROVIDERS = new Set(['vapi', 'exotel', 'twilio'])

function parseRegions(raw: unknown): { ok: true; value: Record<string, RegionNumber> } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'regions must be an object' }
  const out: Record<string, RegionNumber> = {}
  const entries = Object.entries(raw as Record<string, unknown>)
  if (entries.length > 60) return { ok: false, error: 'Too many regions' }
  for (const [k, v] of entries) {
    const key = k.trim().toUpperCase()
    if (key !== '*' && !/^[A-Z]{2}$/.test(key)) return { ok: false, error: `Region "${k}" must be a 2-letter country code or *` }
    const r = (v || {}) as Record<string, unknown>
    const s = (x: unknown) => (typeof x === 'string' ? x.trim() : '')
    const wa = s(r.whatsapp_phone_number_id)
    const vapi = s(r.vapi_phone_number_id)
    const callRaw = s(r.call_number)
    const waDisplayRaw = s(r.whatsapp_display_number)
    if (wa && !/^\d{5,25}$/.test(wa)) return { ok: false, error: `${key}: WhatsApp phone number ID is the numeric ID from Meta` }
    if (vapi && !ID.test(vapi)) return { ok: false, error: `${key}: Vapi phone number ID looks wrong` }
    const call = callRaw ? toE164(callRaw) : null
    if (callRaw && !call) return { ok: false, error: `${key}: caller number must be in international format` }
    const waDisplay = waDisplayRaw ? toE164(waDisplayRaw) : null
    if (waDisplayRaw && !waDisplay) return { ok: false, error: `${key}: WhatsApp number must be in international format` }
    const provider = s(r.provider)
    if (provider && !PROVIDERS.has(provider)) return { ok: false, error: `${key}: provider must be vapi, exotel or twilio` }
    if (!wa && !vapi && !call) continue
    out[key] = {
      whatsapp_phone_number_id: wa || null,
      whatsapp_display_number: waDisplay,
      call_number: call,
      vapi_phone_number_id: vapi || null,
      provider: (provider || 'vapi') as RegionNumber['provider'],
    }
  }
  return { ok: true, value: out }
}

const num = (v: unknown, min: number, max: number): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : undefined

export async function PATCH(req: NextRequest) {
  const g = await gate(req)
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
  if (!can(g.actor, 'settings.manage')) return NextResponse.json({ error: 'Only hiring admins can change screening settings' }, { status: 403 })
  const limited = await limitRequest(req, 'ats-screening-settings', g.actor.userId, 30, 60_000)
  if (limited) return limited
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'Invalid JSON', code: 'invalid_json' }, { status: 400 })

  const set: Partial<TenantScreeningSettings> = {}
  if ('regions' in body) {
    const r = parseRegions(body.regions)
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
    set.regions = r.value
  }
  for (const k of ['template_chat', 'template_call'] as const) {
    if (!(k in body)) continue
    const v = typeof body[k] === 'string' ? (body[k] as string).trim() : ''
    if (v && !/^[a-z0-9_]{1,512}$/.test(v)) return NextResponse.json({ error: 'Template names use lowercase letters, numbers and underscores' }, { status: 400 })
    set[k] = v || null
  }
  if ('template_language' in body) {
    const v = typeof body.template_language === 'string' ? body.template_language.trim() : ''
    if (v && !/^[a-z]{2,3}(_[A-Z]{2})?$/.test(v)) return NextResponse.json({ error: 'Template language looks like en or en_US' }, { status: 400 })
    set.template_language = v || null
  }
  if ('voice_agent_sip_uri' in body) {
    const v = typeof body.voice_agent_sip_uri === 'string' ? body.voice_agent_sip_uri.trim() : ''
    if (v && !parseSipUri(v)) return NextResponse.json({ error: 'SIP URI looks like sip:agent.example.com:5061' }, { status: 400 })
    set.voice_agent_sip_uri = v || null
  }
  if ('quiet_hours' in body) {
    const q = (body.quiet_hours || {}) as Record<string, unknown>
    const start = num(q.start, 0, 23)
    const end = num(q.end, 1, 24)
    if (start === undefined || end === undefined || start >= end || end - start < 4) {
      return NextResponse.json({ error: 'Outreach hours need a start before the end, at least 4 hours apart' }, { status: 400 })
    }
    set.quiet_hours = { start: Math.round(start), end: Math.round(end) }
  }
  for (const [k, min, max] of [['reminder_after_hours', 1, 20], ['reply_timeout_hours', 2, 23], ['permission_timeout_hours', 1, 72], ['retry_delay_hours', 0.5, 48]] as const) {
    if (!(k in body)) continue
    const v = num(body[k], min, max)
    if (v === undefined) return NextResponse.json({ error: `${k.replace(/_/g, ' ')} must be between ${min} and ${max}` }, { status: 400 })
    set[k] = v
  }
  try {
    await (await settingsCol()).updateOne(
      { tenant_id: g.actor.tenantId },
      { $set: { ...set, tenant_id: g.actor.tenantId, updated_at: nowIso(), updated_by: g.actor.userId } },
      { upsert: true },
    )
    await auditAts(g.actor, 'ats.screening.settings', 'ats_screening_settings', g.actor.tenantId, Object.keys(set).join(','), req)
    return NextResponse.json({ ok: true, settings: await getTenantSettings(g.actor.tenantId) })
  } catch (e) {
    console.error('[ats/screening/settings] PATCH failed:', e)
    return NextResponse.json({ error: 'Could not save settings' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const g = await gate(req)
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
  if (!can(g.actor, 'settings.manage')) return NextResponse.json({ error: 'Only hiring admins can do this' }, { status: 403 })
  const limited = await limitRequest(req, 'ats-screening-sip', g.actor.userId, 5, 60_000)
  if (limited) return limited
  const body = (await req.json().catch(() => ({}))) as { action?: unknown; phone_number_id?: unknown }
  if (body.action !== 'apply_sip') return NextResponse.json({ error: 'Unknown action', code: 'unknown_action' }, { status: 400 })
  const pnid = typeof body.phone_number_id === 'string' ? body.phone_number_id.trim() : ''
  const [cfg, tenant] = await Promise.all([getPlatformConfig(), getTenantSettings(g.actor.tenantId)])
  const allowed = new Set([cfg.whatsapp.phone_number_id, ...Object.values(tenant.regions).map((r) => r.whatsapp_phone_number_id)].filter(Boolean))
  if (!pnid || !allowed.has(pnid)) return NextResponse.json({ error: 'Pick a WhatsApp number from your regions' }, { status: 400 })
  const sip = tenant.voice_agent_sip_uri || cfg.voice.voice_agent_sip_uri
  if (!whatsappReady(cfg) || !sip) return NextResponse.json({ error: 'WhatsApp keys and a voice agent SIP URI are needed first' }, { status: 409 })
  const res = await applySipSettings(cfg, pnid, sip)
  await auditAts(g.actor, 'ats.screening.apply_sip', 'whatsapp_number', pnid, res.ok ? 'ok' : res.error, req)
  return res.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: res.error }, { status: 502 })
}
