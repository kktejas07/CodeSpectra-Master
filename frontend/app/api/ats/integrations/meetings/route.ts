import { NextRequest, NextResponse } from 'next/server'
import { auditAts, requireAts, tenantFromRequest } from '@/lib/ats/access'
import { CONNECTABLE, interviewSettings, nowIso, type ConnectableProvider } from '@/lib/ats/interviews/db'
import {
  connectZoom, disconnect, listIntegrations, platformAppConfigured, redirectUri, startOAuth, type OAuthApp,
} from '@/lib/ats/interviews/integrations'
import { tenantInterviewSettings } from '@/lib/ats/interviews/service'
import { isMeetingProvider, ProviderError } from '@/lib/ats/interviews/providers'
import { livekitConfig } from '@/lib/ats/interviews/livekit'
import { isValidTimeZone } from '@/lib/ats/interviews/tz'
import { interviewErrorResponse, NO_STORE } from '@/lib/ats/interviews/http'
import { limitRequest } from '@/lib/rate-limit'
import { getAPIUser } from '@/lib/route-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET — connection status per provider (+ scheduling settings). Recruiters read it to pick a meeting type. */
export async function GET(req: NextRequest) {
  const gate = await requireAts(['admin', 'recruiter'], tenantFromRequest(req))
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { actor } = gate
  try {
    const [rows, apps, settings, lk, user] = await Promise.all([listIntegrations(actor.tenantId), platformAppConfigured(), tenantInterviewSettings(actor.tenantId), livekitConfig(), getAPIUser()])
    return NextResponse.json({
      providers: CONNECTABLE.map((p) => rows.find((r) => r.provider === p) || { provider: p, status: 'disconnected', account_label: null, connected_at: null, last_error: null }),
      livekit_configured: !!lk,
      platform_apps: apps,
      redirect_uris: { google: redirectUri('google'), microsoft: redirectUri('microsoft') },
      settings,
      can_manage: actor.role === 'admin',
      is_platform_admin: user?.role === 'superadmin',
    }, { headers: NO_STORE })
  } catch (e) {
    return interviewErrorResponse(e, 'integrations get')
  }
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

function ownApp(b: Record<string, unknown>): OAuthApp | null {
  const id = str(b.client_id, 200)
  const secret = str(b.client_secret, 400)
  if (!id && !secret) return null
  if (!id || !secret) throw new ProviderError('manual', 'Enter both the client ID and the client secret, or leave both empty.', 'config')
  const t = str(b.ms_tenant, 100)
  if (t && !/^[A-Za-z0-9.-]{1,100}$/.test(t)) throw new ProviderError('manual', 'The Microsoft tenant must be a tenant ID, domain, or "common".', 'config')
  return { client_id: id, client_secret: secret, ...(t ? { ms_tenant: t } : {}) }
}

/**
 * POST (ATS admin)
 *  { action: 'connect_zoom', account_id, client_id, client_secret }
 *  { action: 'start_oauth', provider: 'google_meet' | 'teams', client_id?, client_secret?, ms_tenant? } → { url }
 *  { action: 'disconnect', provider }
 *  { action: 'settings', timezone?, work_start_hour?, work_end_hour?, default_provider? }
 */
export async function POST(req: NextRequest) {
  const gate = await requireAts(['admin'], tenantFromRequest(req))
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { actor } = gate
  const limited = await limitRequest(req, 'ats-meeting-integrations', actor.userId, 20, 60_000)
  if (limited) return limited
  let b: Record<string, unknown>
  try {
    const raw = await req.json()
    b = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  } catch {
    return NextResponse.json({ error: 'Invalid JSON', code: 'invalid_json' }, { status: 400 })
  }
  try {
    switch (b.action) {
      case 'connect_zoom': {
        const c = { account_id: str(b.account_id, 100), client_id: str(b.client_id, 200), client_secret: str(b.client_secret, 400) }
        if (!c.account_id || !c.client_id || !c.client_secret || c.client_secret.includes('•')) {
          return NextResponse.json({ error: 'Enter the Zoom account ID, client ID and client secret.' }, { status: 400 })
        }
        await connectZoom(actor.tenantId, actor.userId, c)
        await auditAts(actor, 'ats.meetings.connect', 'meeting_integration', 'zoom', undefined, req).catch(() => {})
        return NextResponse.json({ ok: true })
      }
      case 'start_oauth': {
        if (b.provider !== 'google_meet' && b.provider !== 'teams') return NextResponse.json({ error: 'Unknown provider' }, { status: 400 })
        const url = await startOAuth(actor.tenantId, actor.userId, b.provider, ownApp(b))
        return NextResponse.json({ url })
      }
      case 'disconnect': {
        if (!(CONNECTABLE as readonly string[]).includes(String(b.provider))) return NextResponse.json({ error: 'Unknown provider' }, { status: 400 })
        await disconnect(actor.tenantId, b.provider as ConnectableProvider)
        await auditAts(actor, 'ats.meetings.disconnect', 'meeting_integration', String(b.provider), undefined, req).catch(() => {})
        return NextResponse.json({ ok: true })
      }
      case 'settings': {
        const set: Record<string, unknown> = { updated_at: nowIso(), updated_by: actor.userId }
        if (b.timezone !== undefined) {
          if (!isValidTimeZone(b.timezone)) return NextResponse.json({ error: 'Pick a valid time zone.' }, { status: 400 })
          set.timezone = b.timezone
        }
        const s = b.work_start_hour === undefined ? undefined : Number(b.work_start_hour)
        const e = b.work_end_hour === undefined ? undefined : Number(b.work_end_hour)
        if (s !== undefined || e !== undefined) {
          const cur = await tenantInterviewSettings(actor.tenantId)
          const start = s ?? cur.work_start_hour
          const end = e ?? cur.work_end_hour
          if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > 24 || end - start < 1) {
            return NextResponse.json({ error: 'Working hours must be whole hours, start before end.' }, { status: 400 })
          }
          set.work_start_hour = start
          set.work_end_hour = end
        }
        if (b.default_provider !== undefined) {
          if (b.default_provider !== null && !isMeetingProvider(b.default_provider)) return NextResponse.json({ error: 'Unknown meeting type' }, { status: 400 })
          set.default_provider = b.default_provider
        }
        await (await interviewSettings()).updateOne({ tenant_id: actor.tenantId }, { $set: set, $setOnInsert: { tenant_id: actor.tenantId } }, { upsert: true })
        return NextResponse.json({ settings: await tenantInterviewSettings(actor.tenantId) })
      }
      default:
        return NextResponse.json({ error: 'Unknown action', code: 'unknown_action' }, { status: 400 })
    }
  } catch (e) {
    if (e instanceof ProviderError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.code === 'config' ? 400 : 502 })
    return interviewErrorResponse(e, 'integrations post')
  }
}
