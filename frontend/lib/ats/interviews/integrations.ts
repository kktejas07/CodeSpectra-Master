/**
 * Per-tenant meeting-provider connections (Zoom S2S, Google OAuth, Microsoft
 * Graph OAuth). Credentials are stored AES-GCM encrypted (tokens.ts); access
 * tokens are refreshed here and never leave the server.
 *
 * OAuth apps: one platform app per provider (Platform settings secrets
 * `ats_google_client_id/secret`, `ats_microsoft_client_id/secret[/tenant]`, or
 * env ATS_GOOGLE_CLIENT_ID/…), or a tenant's own app supplied at connect time.
 */
import { readServerSecrets } from '@/lib/server-secrets-cache'
import { getAppOrigin } from '@/lib/app-origin'
import type { MeetingProvider } from '@/lib/ats/contract'
import { meetingIntegrations, nowIso, type ConnectableProvider, type MeetingIntegrationDoc } from './db'
import { decryptJson, encryptJson, newNonce, oauthStateKey, signToken, verifyToken, type SignedPayload } from './tokens'
import { ProviderError, type ProviderContext } from './providers/types'

// ─── Shapes ──────────────────────────────────────────────────────────────────

export interface ZoomCreds { account_id: string; client_id: string; client_secret: string }
export interface OAuthApp { client_id: string; client_secret: string; ms_tenant?: string }
export interface OAuthCreds {
  app?: OAuthApp | null
  refresh_token?: string
  access_token?: string
  expires_at?: number
}

export const GOOGLE_SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/calendar.events']
export const MICROSOFT_SCOPES = ['offline_access', 'openid', 'email', 'User.Read', 'Calendars.ReadWrite', 'OnlineMeetings.ReadWrite']

export const callbackPath = (p: 'google' | 'microsoft') => `/api/ats/integrations/meetings/${p}/callback`
export const redirectUri = (p: 'google' | 'microsoft', origin = getAppOrigin()) => `${origin}${callbackPath(p)}`

// ─── Platform OAuth app config ───────────────────────────────────────────────

async function platformApp(p: 'google' | 'microsoft'): Promise<OAuthApp | null> {
  const s = (await readServerSecrets().catch(() => ({}))) as Record<string, unknown>
  const pick = (k: string, env: string) => {
    const v = typeof s[k] === 'string' ? String(s[k]).trim() : ''
    return v && !v.includes('•') ? v : (process.env[env] || '').trim()
  }
  const id = pick(`ats_${p}_client_id`, `ATS_${p.toUpperCase()}_CLIENT_ID`)
  const secret = pick(`ats_${p}_client_secret`, `ATS_${p.toUpperCase()}_CLIENT_SECRET`)
  if (!id || !secret) return null
  const msTenant = p === 'microsoft' ? pick('ats_microsoft_tenant', 'ATS_MICROSOFT_TENANT') || 'common' : undefined
  return { client_id: id, client_secret: secret, ...(msTenant ? { ms_tenant: msTenant } : {}) }
}

export async function platformAppConfigured(): Promise<{ google: boolean; microsoft: boolean }> {
  const [g, m] = await Promise.all([platformApp('google'), platformApp('microsoft')])
  return { google: !!g, microsoft: !!m }
}

// ─── Pure request builders (tests) ───────────────────────────────────────────

export function buildGoogleAuthUrl(app: OAuthApp, redirect: string, state: string): string {
  const q = new URLSearchParams({
    client_id: app.client_id,
    redirect_uri: redirect,
    response_type: 'code',
    scope: GOOGLE_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`
}

export function buildMicrosoftAuthUrl(app: OAuthApp, redirect: string, state: string): string {
  const q = new URLSearchParams({
    client_id: app.client_id,
    redirect_uri: redirect,
    response_type: 'code',
    response_mode: 'query',
    scope: MICROSOFT_SCOPES.join(' '),
    prompt: 'select_account',
    state,
  })
  return `https://login.microsoftonline.com/${encodeURIComponent(app.ms_tenant || 'common')}/oauth2/v2.0/authorize?${q}`
}

export function tokenEndpoint(p: 'google' | 'microsoft', app: OAuthApp): string {
  return p === 'google'
    ? 'https://oauth2.googleapis.com/token'
    : `https://login.microsoftonline.com/${encodeURIComponent(app.ms_tenant || 'common')}/oauth2/v2.0/token`
}

export function buildCodeExchange(p: 'google' | 'microsoft', app: OAuthApp, code: string, redirect: string): URLSearchParams {
  const b = new URLSearchParams({ client_id: app.client_id, client_secret: app.client_secret, code, redirect_uri: redirect, grant_type: 'authorization_code' })
  if (p === 'microsoft') b.set('scope', MICROSOFT_SCOPES.join(' '))
  return b
}

export function buildRefresh(p: 'google' | 'microsoft', app: OAuthApp, refreshToken: string): URLSearchParams {
  const b = new URLSearchParams({ client_id: app.client_id, client_secret: app.client_secret, refresh_token: refreshToken, grant_type: 'refresh_token' })
  if (p === 'microsoft') b.set('scope', MICROSOFT_SCOPES.join(' '))
  return b
}

export function buildZoomTokenRequest(c: ZoomCreds): { url: string; headers: Record<string, string> } {
  return {
    url: `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(c.account_id)}`,
    headers: { Authorization: `Basic ${Buffer.from(`${c.client_id}:${c.client_secret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
  }
}

/** Email claim of an id_token we just received from the token endpoint over TLS. */
export function idTokenEmail(idToken: unknown): string | null {
  if (typeof idToken !== 'string') return null
  try {
    const p = JSON.parse(Buffer.from(idToken.split('.')[1] || '', 'base64url').toString('utf8'))
    const e = p.email || p.preferred_username || p.upn
    return typeof e === 'string' ? e.slice(0, 200) : null
  } catch {
    return null
  }
}

// ─── Storage ─────────────────────────────────────────────────────────────────

const PROVIDER_FOR: Record<'google' | 'microsoft', ConnectableProvider> = { google: 'google_meet', microsoft: 'teams' }
const OAUTH_FOR: Partial<Record<ConnectableProvider, 'google' | 'microsoft'>> = { google_meet: 'google', teams: 'microsoft' }

export async function getIntegration(tenantId: string, provider: ConnectableProvider): Promise<MeetingIntegrationDoc | null> {
  return (await meetingIntegrations()).findOne({ tenant_id: tenantId, provider })
}

export async function listIntegrations(tenantId: string) {
  const rows = await (await meetingIntegrations()).find({ tenant_id: tenantId }).toArray()
  return rows.map((r) => ({
    provider: r.provider,
    status: r.status,
    account_label: r.account_label ?? null,
    connected_at: r.connected_at,
    last_error: r.last_error ?? null,
  }))
}

async function save(tenantId: string, provider: ConnectableProvider, userId: string, creds: unknown, label: string | null, status: MeetingIntegrationDoc['status'] = 'connected') {
  const now = nowIso()
  await (await meetingIntegrations()).updateOne(
    { tenant_id: tenantId, provider },
    {
      $set: { status, secret: await encryptJson(creds), account_label: label, updated_at: now, last_error: null, connected_by: userId, connected_at: now },
      $setOnInsert: { tenant_id: tenantId, provider },
    },
    { upsert: true },
  )
}

export async function disconnect(tenantId: string, provider: ConnectableProvider): Promise<void> {
  zoomCache.delete(tenantId)
  await (await meetingIntegrations()).deleteOne({ tenant_id: tenantId, provider })
}

async function markError(tenantId: string, provider: ConnectableProvider, message: string) {
  await (await meetingIntegrations()).updateOne(
    { tenant_id: tenantId, provider },
    { $set: { status: 'error', last_error: message.slice(0, 300), updated_at: nowIso() } },
  ).catch(() => {})
}

// ─── Zoom ────────────────────────────────────────────────────────────────────

const zoomCache = new Map<string, { token: string; exp: number }>()

async function fetchZoomToken(c: ZoomCreds, f: typeof fetch): Promise<{ token: string; exp: number }> {
  const req = buildZoomTokenRequest(c)
  const res = await f(req.url, { method: 'POST', headers: req.headers, signal: AbortSignal.timeout(15_000) })
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; reason?: string; error?: string }
  if (!res.ok || !j.access_token) {
    throw new ProviderError('zoom', `Zoom rejected the credentials${j.reason || j.error ? `: ${j.reason || j.error}` : ''}`, 'auth', res.status)
  }
  return { token: j.access_token, exp: Date.now() + Math.max(60, (j.expires_in || 3600) - 120) * 1000 }
}

/** Validate then store Zoom S2S credentials. */
export async function connectZoom(tenantId: string, userId: string, c: ZoomCreds, f: typeof fetch = fetch): Promise<void> {
  const t = await fetchZoomToken(c, f)
  zoomCache.set(tenantId, t)
  await save(tenantId, 'zoom', userId, c, `Zoom account ${c.account_id.slice(0, 6)}…`)
}

// ─── Google / Microsoft OAuth ────────────────────────────────────────────────

/** Start OAuth: optional tenant-owned app (kept as a pending row), signed state, redirect URL. */
export async function startOAuth(
  tenantId: string,
  userId: string,
  provider: 'google_meet' | 'teams',
  ownApp?: OAuthApp | null,
): Promise<string> {
  const p = OAUTH_FOR[provider]!
  const app = ownApp || (await platformApp(p))
  if (!app) {
    throw new ProviderError(provider, `${p === 'google' ? 'Google' : 'Microsoft'} sign-in isn't set up on this platform yet. Ask the platform admin to add the OAuth app, or enter your own app's client ID and secret.`, 'config')
  }
  if (ownApp) {
    // Reconnecting with the tenant's own app replaces the old connection.
    await save(tenantId, provider, userId, { app: ownApp } satisfies OAuthCreds, null, 'error')
    await markError(tenantId, provider, 'Sign-in not finished yet.')
  }
  const state = signToken(await oauthStateKey(), { k: 'oauth', i: provider, n: newNonce(), e: Date.now() + 15 * 60_000, t: tenantId, u: userId, p: ownApp ? 'own' : 'platform' })
  return p === 'google' ? buildGoogleAuthUrl(app, redirectUri('google'), state) : buildMicrosoftAuthUrl(app, redirectUri('microsoft'), state)
}

export async function verifyOAuthState(state: unknown): Promise<SignedPayload | null> {
  return verifyToken(await oauthStateKey(), state, 'oauth')
}

async function appFor(tenantId: string, provider: ConnectableProvider, own: boolean): Promise<OAuthApp | null> {
  if (own) {
    const row = await getIntegration(tenantId, provider)
    const c = await decryptJson<OAuthCreds>(row?.secret)
    return c?.app ?? null
  }
  return platformApp(OAUTH_FOR[provider]!)
}

/** OAuth callback: exchange the code, keep the refresh token. */
export async function completeOAuth(
  which: 'google' | 'microsoft',
  state: SignedPayload,
  code: string,
  f: typeof fetch = fetch,
): Promise<void> {
  const provider = PROVIDER_FOR[which]
  const tenantId = state.t!
  const app = await appFor(tenantId, provider, state.p === 'own')
  if (!app) throw new ProviderError(provider, 'The OAuth app for this connection is missing. Start again from Hiring settings.', 'config')
  const res = await f(tokenEndpoint(which, app), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: buildCodeExchange(which, app, code, redirectUri(which)),
    signal: AbortSignal.timeout(15_000),
  })
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; id_token?: string; error_description?: string; error?: string }
  if (!res.ok || !j.access_token) throw new ProviderError(provider, `Sign-in failed: ${j.error_description || j.error || res.status}`, 'auth', res.status)
  if (!j.refresh_token) {
    throw new ProviderError(provider, 'No refresh token was returned. Remove CodeSpectra from the account\'s connected apps and connect again.', 'auth')
  }
  const creds: OAuthCreds = {
    app: state.p === 'own' ? app : null,
    refresh_token: j.refresh_token,
    access_token: j.access_token,
    expires_at: Date.now() + Math.max(60, (j.expires_in || 3600) - 120) * 1000,
  }
  await save(tenantId, provider, state.u!, creds, idTokenEmail(j.id_token))
}

async function oauthAccessToken(tenantId: string, provider: 'google_meet' | 'teams', f: typeof fetch): Promise<string> {
  const which = OAUTH_FOR[provider]!
  const row = await getIntegration(tenantId, provider)
  const c = await decryptJson<OAuthCreds>(row?.secret)
  if (!row || row.status !== 'connected' || !c?.refresh_token) throw notConnected(provider)
  if (c.access_token && (c.expires_at || 0) > Date.now()) return c.access_token
  const app = c.app || (await platformApp(which))
  if (!app) throw new ProviderError(provider, 'The OAuth app is no longer configured. Reconnect in Hiring settings.', 'config')
  const res = await f(tokenEndpoint(which, app), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: buildRefresh(which, app, c.refresh_token),
    signal: AbortSignal.timeout(15_000),
  })
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string; error_description?: string }
  if (!res.ok || !j.access_token) {
    const msg = `The ${provider === 'teams' ? 'Microsoft' : 'Google'} connection expired or was revoked (${j.error || res.status}). Reconnect it in Hiring settings → Integrations.`
    if (res.status === 400 || res.status === 401) await markError(tenantId, provider, msg)
    throw new ProviderError(provider, msg, 'auth', res.status)
  }
  const next: OAuthCreds = {
    ...c,
    access_token: j.access_token,
    // Microsoft rotates refresh tokens; Google usually doesn't return one here.
    refresh_token: j.refresh_token || c.refresh_token,
    expires_at: Date.now() + Math.max(60, (j.expires_in || 3600) - 120) * 1000,
  }
  await (await meetingIntegrations()).updateOne({ tenant_id: tenantId, provider }, { $set: { secret: await encryptJson(next), updated_at: nowIso() } })
  return j.access_token
}

function notConnected(provider: MeetingProvider) {
  const name = provider === 'zoom' ? 'Zoom' : provider === 'teams' ? 'Microsoft Teams' : 'Google Meet'
  return new ProviderError(provider, `${name} isn't connected for your organisation. Connect it in Hiring settings → Integrations, or pick another meeting type.`, 'not_connected')
}

/** Is the provider usable for this tenant right now (no network)? */
export async function isConnected(tenantId: string, provider: MeetingProvider): Promise<boolean> {
  if (provider === 'livekit' || provider === 'manual') return true
  const row = await getIntegration(tenantId, provider)
  return !!row && row.status === 'connected'
}

/** Provider context with a lazily-fetched access token. */
export function providerContext(tenantId: string, provider: MeetingProvider, f: typeof fetch = fetch): ProviderContext {
  return {
    tenantId,
    fetch: f,
    origin: getAppOrigin(),
    getAccessToken: async () => {
      if (provider === 'zoom') {
        const hit = zoomCache.get(tenantId)
        if (hit && hit.exp > Date.now()) return hit.token
        const row = await getIntegration(tenantId, 'zoom')
        const c = await decryptJson<ZoomCreds>(row?.secret)
        if (!row || row.status !== 'connected' || !c) throw notConnected('zoom')
        try {
          const t = await fetchZoomToken(c, f)
          zoomCache.set(tenantId, t)
          return t.token
        } catch (e) {
          await markError(tenantId, 'zoom', e instanceof Error ? e.message : String(e))
          throw e
        }
      }
      if (provider === 'google_meet' || provider === 'teams') return oauthAccessToken(tenantId, provider, f)
      return ''
    },
  }
}
