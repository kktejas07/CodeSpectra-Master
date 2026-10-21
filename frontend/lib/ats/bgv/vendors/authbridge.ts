/**
 * AuthBridge (India) — configurable adapter. AuthBridge's API is not public:
 * configure everything from your AuthBridge onboarding pack in Hiring settings
 * → Background checks → AuthBridge (off by default):
 *
 *  - sandbox / production base URLs and which one is live
 *  - auth: OAuth client-credentials (client id + secret → bearer token from
 *    `token_path`), an API key in a named header, or HTTP Basic
 *  - per check: the path to POST it to and AuthBridge's check code
 *  - response mapping: dotted paths to the reference / status / note fields
 *    and which status values mean verified / discrepancy / unable to verify
 *  - webhook: HMAC of the raw body (header, algorithm, hex / base64, prefix)
 *    with the webhook secret; event id field for idempotency
 *  - optional status path ("{ref}" placeholder) for the scheduler's polling
 *
 * Request body we send per check (data minimised: only that check's fields;
 * Aadhaar is only ever the last 4 digits; no documents):
 *   { reference_id: "<case id>:<check type>", check_code, candidate: {…}, details: {…} }
 * If your onboarding pack needs a different shape, change buildAuthBridgeBody.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { BgvCheckType } from '@/lib/ats/contract'
import type { AuthBridgeMapping, AuthBridgeSettings, BgvCaseDoc, BgvCheck, BgvCheckStatus, BgvSettingsDoc, VendorSecrets } from '../types'
import { cleanBaseUrl, cleanPath, joinUrl, pick, vendorRequest } from './http'
import { VendorError, type BgvVendor, type ConnectionTest, type VendorCheckResult, type VendorContext, type VendorPii, type WebhookEvent } from './types'

export const AUTHBRIDGE_CHECKS: BgvCheckType[] = ['identity', 'pan', 'aadhaar', 'address', 'education', 'employment', 'uan_epfo', 'court_record', 'criminal', 'reference']

export const DEFAULT_AB_MAPPING: AuthBridgeMapping = {
  ref_field: 'reference_id',
  status_field: 'status',
  notes_field: null,
  webhook_event_id_field: 'event_id',
  webhook_ref_field: 'reference_id',
  webhook_status_field: 'status',
  verified: ['verified', 'clear', 'green', 'positive'],
  discrepancy: ['discrepancy', 'red', 'negative', 'major_discrepancy', 'minor_discrepancy', 'amber'],
  unable_to_verify: ['unable_to_verify', 'insufficient', 'stop_check', 'closed', 'cancelled'],
}

export function defaultAuthBridgeSettings(): AuthBridgeSettings {
  return {
    enabled: false,
    env: 'sandbox',
    sandbox_base_url: null,
    production_base_url: null,
    auth_mode: 'oauth_client_credentials',
    token_path: '/oauth/token',
    scope: null,
    api_key_header: 'x-api-key',
    test_path: null,
    checks: {},
    status_path: null,
    mapping: { ...DEFAULT_AB_MAPPING },
    webhook: { header: 'x-authbridge-signature', algorithm: 'sha256', encoding: 'hex', prefix: '' },
  }
}

const str = (v: unknown, max: number, re?: RegExp) => {
  if (typeof v !== 'string') return null
  const s = v.trim().slice(0, max)
  return s && (!re || re.test(s)) ? s : null
}
const FIELD_RE = /^[A-Za-z0-9_$-]+(\.[A-Za-z0-9_$-]+){0,6}$/
const HEADER_RE = /^[A-Za-z0-9-]{1,60}$/
const CODE_RE = /^[A-Za-z0-9_.:-]{1,60}$/
const values = (v: unknown, cur: string[]) => Array.isArray(v) ? [...new Set(v.map((x) => String(x).trim().toLowerCase()).filter((x) => /^[a-z0-9_ -]{1,40}$/.test(x)))].slice(0, 20) : cur

/** Pure: validated settings patch over the current settings. */
export function cleanAuthBridgeSettings(raw: unknown, cur: AuthBridgeSettings = defaultAuthBridgeSettings()): AuthBridgeSettings {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const m = (p.mapping && typeof p.mapping === 'object' ? p.mapping : {}) as Record<string, unknown>
  const w = (p.webhook && typeof p.webhook === 'object' ? p.webhook : {}) as Record<string, unknown>
  const checks = { ...cur.checks }
  if (p.checks && typeof p.checks === 'object') {
    for (const t of AUTHBRIDGE_CHECKS) {
      const v = (p.checks as Record<string, unknown>)[t]
      if (v === null || v === '') { delete checks[t]; continue }
      if (!v || typeof v !== 'object') continue
      const path = cleanPath((v as Record<string, unknown>).path)
      const code = str((v as Record<string, unknown>).code, 60, CODE_RE) || ''
      if (path) checks[t] = { path, code }
      else delete checks[t]
    }
  }
  const field = (k: keyof AuthBridgeMapping, nullable = false) => {
    if (m[k] === undefined) return cur.mapping[k]
    if (nullable && (m[k] === null || m[k] === '')) return null
    return str(m[k], 120, FIELD_RE) || cur.mapping[k]
  }
  const url = (v: unknown, c: string | null) => (v === undefined ? c : v === null || v === '' ? null : cleanBaseUrl(v) || c)
  const optPath = (v: unknown, c: string | null) => (v === undefined ? c : v === null || v === '' ? null : cleanPath(v) || c)
  return {
    enabled: typeof p.enabled === 'boolean' ? p.enabled : cur.enabled,
    env: p.env === 'production' ? 'production' : p.env === 'sandbox' ? 'sandbox' : cur.env,
    sandbox_base_url: url(p.sandbox_base_url, cur.sandbox_base_url),
    production_base_url: url(p.production_base_url, cur.production_base_url),
    auth_mode: p.auth_mode === 'api_key' || p.auth_mode === 'basic' || p.auth_mode === 'oauth_client_credentials' ? p.auth_mode : cur.auth_mode,
    token_path: p.token_path !== undefined ? cleanPath(p.token_path) || cur.token_path : cur.token_path,
    scope: p.scope === undefined ? cur.scope : str(p.scope, 200, /^[\w :./-]+$/),
    api_key_header: p.api_key_header !== undefined ? str(p.api_key_header, 60, HEADER_RE) || cur.api_key_header : cur.api_key_header,
    test_path: optPath(p.test_path, cur.test_path),
    checks,
    status_path: optPath(p.status_path, cur.status_path),
    mapping: {
      ref_field: field('ref_field') as string,
      status_field: field('status_field') as string,
      notes_field: field('notes_field', true) as string | null,
      webhook_event_id_field: field('webhook_event_id_field') as string,
      webhook_ref_field: field('webhook_ref_field') as string,
      webhook_status_field: field('webhook_status_field') as string,
      verified: values(m.verified, cur.mapping.verified),
      discrepancy: values(m.discrepancy, cur.mapping.discrepancy),
      unable_to_verify: values(m.unable_to_verify, cur.mapping.unable_to_verify),
    },
    webhook: {
      header: w.header !== undefined ? str(w.header, 60, HEADER_RE) || cur.webhook.header : cur.webhook.header,
      algorithm: w.algorithm === 'sha512' || w.algorithm === 'sha1' || w.algorithm === 'sha256' ? w.algorithm : cur.webhook.algorithm,
      encoding: w.encoding === 'base64' || w.encoding === 'hex' ? w.encoding : cur.webhook.encoding,
      prefix: w.prefix !== undefined ? str(w.prefix, 20, /^[\w=:-]*$/) || '' : cur.webhook.prefix,
    },
  }
}

export function settingsOf(s: BgvSettingsDoc): AuthBridgeSettings {
  const d = defaultAuthBridgeSettings()
  const a = s.authbridge || {}
  return { ...d, ...a, mapping: { ...d.mapping, ...(a as Partial<AuthBridgeSettings>).mapping }, webhook: { ...d.webhook, ...(a as Partial<AuthBridgeSettings>).webhook } } as AuthBridgeSettings
}

export function authBridgeBaseUrl(s: AuthBridgeSettings): string | null {
  return s.env === 'production' ? s.production_base_url : s.sandbox_base_url
}

/** Pure: vendor status value → ours. */
export function mapAuthBridgeStatus(v: unknown, m: AuthBridgeMapping): BgvCheckStatus {
  const s = String(v ?? '').trim().toLowerCase()
  if (!s) return 'in_progress'
  if (m.verified.includes(s)) return 'verified'
  if (m.discrepancy.includes(s)) return 'discrepancy'
  if (m.unable_to_verify.includes(s)) return 'unable_to_verify'
  return 'in_progress'
}

/** Our per-check reference, also sent as reference_id. */
export const ourRef = (caseId: string, type: BgvCheckType) => `${caseId}:${type}`

const dropMasked = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([k]) => !k.endsWith('_masked')))

/** Pure: request body for one check (only that check's data). */
export function buildAuthBridgeBody(c: Pick<BgvCaseDoc, 'id'>, k: BgvCheck, code: string, pii: VendorPii, identity: Record<string, unknown>, sens: Record<string, string>): Record<string, unknown> {
  const details: Record<string, unknown> = { ...dropMasked((k.data || {}) as Record<string, unknown>), ...sens }
  if (k.type === 'aadhaar') { for (const key of Object.keys(details)) if (!['opt_out', 'last4', 'alt_id_type'].includes(key)) delete details[key] }
  return {
    reference_id: ourRef(c.id, k.type),
    check_code: code,
    candidate: {
      name: [pii.first_name, pii.middle_name, pii.last_name].filter(Boolean).join(' ') || null,
      father_name: (identity.father_name as string) || null,
      dob: pii.dob || null,
      email: pii.email || null,
      phone: pii.phone || null,
    },
    details,
  }
}

// ─── Auth ────────────────────────────────────────────────────────────────────

const tokenCache = new Map<string, { token: string; exp: number }>()
export function __clearAuthBridgeTokens() { tokenCache.clear() }

async function authHeaders(s: AuthBridgeSettings, secrets: VendorSecrets, cacheKey: string): Promise<Record<string, string>> {
  const base = authBridgeBaseUrl(s)
  if (!base) throw new VendorError('authbridge', `AuthBridge: add the ${s.env} base URL from your onboarding pack first.`, 400)
  if (s.auth_mode === 'api_key') {
    if (!secrets.authbridge_api_key) throw new VendorError('authbridge', 'AuthBridge: add the API key first.', 400)
    return { [s.api_key_header]: secrets.authbridge_api_key }
  }
  if (!secrets.authbridge_client_id || !secrets.authbridge_client_secret) throw new VendorError('authbridge', 'AuthBridge: add the client ID and client secret first.', 400)
  if (s.auth_mode === 'basic') return { Authorization: `Basic ${Buffer.from(`${secrets.authbridge_client_id}:${secrets.authbridge_client_secret}`).toString('base64')}` }
  const key = `${cacheKey}:${s.env}:${secrets.authbridge_client_id}`
  const hit = tokenCache.get(key)
  if (hit && hit.exp > Date.now()) return { Authorization: `Bearer ${hit.token}` }
  const form = new URLSearchParams({ grant_type: 'client_credentials', client_id: secrets.authbridge_client_id, client_secret: secrets.authbridge_client_secret })
  if (s.scope) form.set('scope', s.scope)
  const r = await vendorRequest('authbridge', 'AuthBridge sign-in', joinUrl(base, s.token_path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: form.toString(),
  })
  const token = pick(r.body, 'access_token') ?? pick(r.body, 'data.access_token') ?? pick(r.body, 'token')
  if (typeof token !== 'string' || !token) throw new VendorError('authbridge', 'AuthBridge sign-in: no access_token in the answer.', 502)
  const ttl = Number(pick(r.body, 'expires_in')) || 3000
  tokenCache.set(key, { token, exp: Date.now() + Math.max(60, ttl - 60) * 1000 })
  if (tokenCache.size > 500) tokenCache.delete(tokenCache.keys().next().value as string)
  return { Authorization: `Bearer ${token}` }
}

// ─── Webhook ─────────────────────────────────────────────────────────────────

/** Pure: HMAC of the raw body per the configured header / algorithm / encoding / prefix. */
export function verifyAuthBridgeSignature(raw: string, header: string | null | undefined, secret: string | null | undefined, w: AuthBridgeSettings['webhook']): boolean {
  if (!secret || !header) return false
  let got = header.trim()
  if (w.prefix && got.toLowerCase().startsWith(w.prefix.toLowerCase())) got = got.slice(w.prefix.length)
  const mac = createHmac(w.algorithm, secret).update(raw, 'utf8').digest(w.encoding)
  const a = Buffer.from(w.encoding === 'hex' ? mac.toLowerCase() : mac)
  const b = Buffer.from(w.encoding === 'hex' ? got.toLowerCase() : got)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Pure: webhook body → event with the (HMAC-authenticated) per-check result. */
export function parseAuthBridgeWebhook(raw: string, s: AuthBridgeSettings): WebhookEvent | null {
  let j: unknown
  try { j = JSON.parse(raw) } catch { return null }
  const m = s.mapping
  const ref = pick(j, m.webhook_ref_field)
  if (typeof ref !== 'string' && typeof ref !== 'number') return null
  const refStr = String(ref).slice(0, 200)
  const rawStatus = pick(j, m.webhook_status_field)
  const evId = pick(j, m.webhook_event_id_field)
  const id = typeof evId === 'string' || typeof evId === 'number'
    ? `ab:${String(evId).slice(0, 120)}`
    : `ab:${createHmac('sha256', 'authbridge-event').update(raw).digest('hex').slice(0, 40)}`
  const note = m.notes_field ? pick(j, m.notes_field) : null
  const status = mapAuthBridgeStatus(rawStatus, m)
  return {
    id,
    type: `check.${String(rawStatus ?? 'update').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 30)}`,
    report_ref: null,
    candidate_ref: null,
    check_refs: [refStr],
    check_updates: [{ ref: refStr, status, notes: `AuthBridge: ${typeof note === 'string' && note.trim() ? note.trim().slice(0, 300) : String(rawStatus ?? 'update').slice(0, 40)}` }],
    // With a status endpoint configured, re-read over the authenticated API instead of trusting the body.
    refresh: !!s.status_path,
  }
}

// ─── Vendor ──────────────────────────────────────────────────────────────────

function requireReady(ctx: { settings: BgvSettingsDoc }): AuthBridgeSettings {
  const s = settingsOf(ctx.settings)
  if (!s.enabled) throw new VendorError('authbridge', 'AuthBridge is turned off. Configure it from your AuthBridge onboarding pack in Hiring settings → Background checks.', 400)
  return s
}

export const authBridgeVendor: BgvVendor = {
  id: 'authbridge',
  label: 'AuthBridge (India)',
  regions: ['IN'],
  supports: AUTHBRIDGE_CHECKS,
  ready: true,
  poll: true,
  async order(ctx: VendorContext) {
    const s = requireReady(ctx)
    const auth = await authHeaders(s, ctx.secrets, ctx.case.tenant_id)
    const base = authBridgeBaseUrl(s)!
    const identity = (ctx.case.checks.find((k) => k.type === 'identity')?.data || {}) as Record<string, unknown>
    const refs: Partial<Record<BgvCheckType, string>> = {}
    const failed: { type: BgvCheckType; message: string }[] = []
    let firstError: VendorError | null = null
    for (const k of ctx.case.checks) {
      const conf = s.checks[k.type]
      if (!conf?.path || k.status === 'waived' || (k.status !== 'submitted' && k.status !== 'not_started')) continue
      const sens = ctx.sensitive ? await ctx.sensitive(k.type) : {}
      try {
        const r = await vendorRequest('authbridge', 'AuthBridge', joinUrl(base, conf.path), {
          method: 'POST',
          headers: { ...auth, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(buildAuthBridgeBody(ctx.case, k, conf.code, ctx.pii, identity, sens)),
        })
        const ref = pick(r.body, s.mapping.ref_field)
        refs[k.type] = typeof ref === 'string' || typeof ref === 'number' ? String(ref) : ourRef(ctx.case.id, k.type)
      } catch (e) {
        if (!(e instanceof VendorError)) throw e
        firstError ||= e
        failed.push({ type: k.type, message: e.message })
      }
    }
    const checks = Object.keys(refs) as BgvCheckType[]
    if (!checks.length && firstError) throw firstError
    return { checks, check_refs: refs, failed }
  },
  async getStatus(ctx: VendorContext) {
    const s = settingsOf(ctx.settings)
    const base = authBridgeBaseUrl(s)
    if (!s.status_path || !base) return { done: false, checks: [] } // webhook-only setup
    const auth = await authHeaders(s, ctx.secrets, ctx.case.tenant_id)
    const out: VendorCheckResult[] = []
    for (const k of ctx.case.checks.filter((x) => x.status === 'in_progress' && x.vendor_ref)) {
      const r = await vendorRequest('authbridge', 'AuthBridge', joinUrl(base, s.status_path.replace('{ref}', encodeURIComponent(k.vendor_ref!))), { method: 'GET', headers: { ...auth, Accept: 'application/json' } })
      const raw = pick(r.body, s.mapping.status_field)
      const status = mapAuthBridgeStatus(raw, s.mapping)
      const note = s.mapping.notes_field ? pick(r.body, s.mapping.notes_field) : null
      out.push({ type: k.type, status, vendor_ref: k.vendor_ref, notes: `AuthBridge: ${typeof note === 'string' && note.trim() ? note.trim().slice(0, 300) : String(raw ?? 'update').slice(0, 40)}` })
    }
    return { done: out.every((x) => x.status !== 'in_progress'), checks: out.filter((x) => x.status !== 'in_progress') }
  },
  verifyWebhook(raw, headers, secrets, ctx) {
    const s = ctx ? settingsOf(ctx.settings) : defaultAuthBridgeSettings()
    return verifyAuthBridgeSignature(raw, headers.get(s.webhook.header), secrets.authbridge_webhook_secret, s.webhook)
  },
  parseWebhook(raw, settings) {
    return parseAuthBridgeWebhook(raw, settings ? settingsOf(settings) : defaultAuthBridgeSettings())
  },
  async testConnection(settings, secrets): Promise<ConnectionTest> {
    const s = settingsOf(settings)
    try {
      const auth = await authHeaders(s, secrets, `test:${Date.now()}`)
      if (s.test_path) {
        await vendorRequest('authbridge', 'AuthBridge', joinUrl(authBridgeBaseUrl(s)!, s.test_path), { method: 'GET', headers: { ...auth, Accept: 'application/json' } })
        return { ok: true, message: `Connected to AuthBridge (${s.env}).` }
      }
      return s.auth_mode === 'oauth_client_credentials'
        ? { ok: true, message: `AuthBridge issued a token (${s.env}). Add a test path to check an API call too.` }
        : { ok: true, message: 'Credentials saved. Add a test path from your onboarding pack to check them against AuthBridge.' }
    } catch (e) {
      return { ok: false, message: e instanceof VendorError ? e.message : 'Could not reach AuthBridge.' }
    }
  },
}
