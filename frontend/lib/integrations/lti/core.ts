/**
 * LTI 1.3 tool provider — protocol core (tests/lti.test.ts).
 *
 * Security (IMS LTI 1.3 core + Security Framework):
 *  - OIDC third-party initiated login: the platform calls /api/lti/login, we
 *    answer with a redirect to its auth endpoint carrying a fresh random
 *    `state` (single use, 10 min, also bound to a SameSite=None cookie) and
 *    `nonce`.
 *  - The id_token posted to /api/lti/launch is verified against the
 *    platform's JWKS (RS256 only), iss = registered issuer, aud contains our
 *    client_id (azp required and equal when aud has several entries), exp /
 *    iat with 60 s leeway, nonce = the one we issued for that state (and never
 *    seen before), deployment_id registered, LTI version 1.3.0, a known
 *    message type and its required claims.
 *  - Deep-linking responses and AGS client assertions are signed with the
 *    tool's own RS256 key (published at /api/lti/jwks).
 */
import { SignJWT, jwtVerify, type JWK, type JWTPayload, type JWTVerifyGetKey, type CryptoKey } from 'jose'

/** SEC-031: the three platform URLs the server will fetch / redirect to. */
export const PLATFORM_URL_FIELDS = ['auth_login_url', 'auth_token_url', 'jwks_url'] as const

export const LTI = {
  version: 'https://purl.imsglobal.org/spec/lti/claim/version',
  messageType: 'https://purl.imsglobal.org/spec/lti/claim/message_type',
  deploymentId: 'https://purl.imsglobal.org/spec/lti/claim/deployment_id',
  targetLinkUri: 'https://purl.imsglobal.org/spec/lti/claim/target_link_uri',
  resourceLink: 'https://purl.imsglobal.org/spec/lti/claim/resource_link',
  roles: 'https://purl.imsglobal.org/spec/lti/claim/roles',
  context: 'https://purl.imsglobal.org/spec/lti/claim/context',
  custom: 'https://purl.imsglobal.org/spec/lti/claim/custom',
  ags: 'https://purl.imsglobal.org/spec/lti-ags/claim/endpoint',
  dlSettings: 'https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings',
  dlContentItems: 'https://purl.imsglobal.org/spec/lti-dl/claim/content_items',
  dlData: 'https://purl.imsglobal.org/spec/lti-dl/claim/data',
} as const

export const AGS_SCOPES = {
  lineitem: 'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem',
  score: 'https://purl.imsglobal.org/spec/lti-ags/scope/score',
} as const

export interface LtiPlatform {
  id: string
  tenant_id: string
  name: string
  issuer: string
  client_id: string
  deployment_ids: string[]
  auth_login_url: string
  auth_token_url: string
  /** Audience for client assertions when the token endpoint asks for one (default: the token URL). */
  auth_token_aud: string | null
  jwks_url: string
}

export type LaunchKind = 'resource' | 'deep_link'

export interface LaunchClaims {
  kind: LaunchKind
  sub: string
  email: string | null
  name: string | null
  roles: string[]
  instructor: boolean
  deployment_id: string
  context: { id: string | null; title: string | null }
  resource_link_id: string | null
  target_link_uri: string | null
  custom: Record<string, string>
  ags: { lineitem: string | null; lineitems: string | null; scope: string[] } | null
  deep_link: { return_url: string; data: string | null; accept_types: string[]; accept_multiple: boolean } | null
}

export type LaunchError =
  | 'bad_version' | 'bad_message_type' | 'bad_deployment' | 'bad_nonce' | 'bad_azp' | 'missing_sub'
  | 'missing_resource_link' | 'missing_deep_link_settings' | 'bad_signature' | 'bad_issuer' | 'bad_audience' | 'expired'

const httpsUrl = (v: unknown): string | null => {
  if (typeof v !== 'string' || v.length > 2048) return null
  try {
    const u = new URL(v)
    return u.protocol === 'https:' ? u.toString() : null
  } catch {
    return null
  }
}

const str = (v: unknown, n = 255): string | null => (typeof v === 'string' && v.length ? v.slice(0, n) : null)

const INSTRUCTOR_ROLES = /#(Instructor|Administrator|ContentDeveloper|TeachingAssistant)$|\/(Instructor|Administrator)$/

/**
 * Claim checks after the signature, iss, aud and exp were verified (pure).
 * `expectedNonce` is the nonce issued with the state; `seenNonce` = it was already used.
 */
export function validateLaunchClaims(p: JWTPayload & Record<string, unknown>, expect: { clientId: string; deploymentIds: string[]; expectedNonce: string; seenNonce?: boolean }): { ok: true; claims: LaunchClaims } | { ok: false; error: LaunchError } {
  const aud = Array.isArray(p.aud) ? p.aud : [p.aud]
  if (aud.length > 1 && p.azp !== expect.clientId) return { ok: false, error: 'bad_azp' }
  if (p.azp !== undefined && p.azp !== expect.clientId) return { ok: false, error: 'bad_azp' }
  if (typeof p.nonce !== 'string' || p.nonce !== expect.expectedNonce || expect.seenNonce) return { ok: false, error: 'bad_nonce' }
  if (p[LTI.version] !== '1.3.0') return { ok: false, error: 'bad_version' }
  const type = p[LTI.messageType]
  if (type !== 'LtiResourceLinkRequest' && type !== 'LtiDeepLinkingRequest') return { ok: false, error: 'bad_message_type' }
  const dep = p[LTI.deploymentId]
  if (typeof dep !== 'string' || !expect.deploymentIds.includes(dep)) return { ok: false, error: 'bad_deployment' }
  const sub = str(p.sub)
  if (!sub) return { ok: false, error: 'missing_sub' }
  const roles = Array.isArray(p[LTI.roles]) ? (p[LTI.roles] as unknown[]).filter((r): r is string => typeof r === 'string').slice(0, 50) : []
  const ctx = (p[LTI.context] || {}) as Record<string, unknown>
  const custom: Record<string, string> = {}
  for (const [k, v] of Object.entries((p[LTI.custom] || {}) as Record<string, unknown>)) if (/^[a-z0-9_]{1,40}$/i.test(k) && (typeof v === 'string' || typeof v === 'number')) custom[k] = String(v).slice(0, 200)
  const agsRaw = p[LTI.ags] as Record<string, unknown> | undefined
  const ags = agsRaw ? { lineitem: httpsUrl(agsRaw.lineitem), lineitems: httpsUrl(agsRaw.lineitems), scope: Array.isArray(agsRaw.scope) ? (agsRaw.scope as unknown[]).filter((s): s is string => typeof s === 'string') : [] } : null
  const base = {
    sub,
    email: str(p.email, 200)?.toLowerCase() ?? null,
    name: str(p.name, 200) ?? str(p.given_name, 200),
    roles,
    instructor: roles.some((r) => INSTRUCTOR_ROLES.test(r)),
    deployment_id: dep,
    context: { id: str(ctx.id), title: str(ctx.title, 200) },
    target_link_uri: httpsUrl(p[LTI.targetLinkUri]),
    custom,
    ags,
  }
  if (type === 'LtiResourceLinkRequest') {
    const rl = (p[LTI.resourceLink] || {}) as Record<string, unknown>
    const rlId = str(rl.id)
    if (!rlId) return { ok: false, error: 'missing_resource_link' }
    return { ok: true, claims: { ...base, kind: 'resource', resource_link_id: rlId, deep_link: null } }
  }
  const dl = (p[LTI.dlSettings] || {}) as Record<string, unknown>
  const ret = httpsUrl(dl.deep_link_return_url)
  if (!ret) return { ok: false, error: 'missing_deep_link_settings' }
  return {
    ok: true,
    claims: {
      ...base, kind: 'deep_link', resource_link_id: null,
      deep_link: { return_url: ret, data: str(dl.data, 2048), accept_types: Array.isArray(dl.accept_types) ? (dl.accept_types as unknown[]).map(String) : [], accept_multiple: dl.accept_multiple === true },
    },
  }
}

/** Verify an id_token's signature (platform JWKS), issuer, audience and expiry, then the LTI claims. */
export async function verifyLaunchToken(idToken: string, platform: Pick<LtiPlatform, 'issuer' | 'client_id' | 'deployment_ids'>, keys: JWTVerifyGetKey, nonce: { expected: string; seen?: boolean }, now?: Date): Promise<{ ok: true; claims: LaunchClaims } | { ok: false; error: LaunchError }> {
  let payload: JWTPayload
  try {
    const r = await jwtVerify(idToken, keys, { issuer: platform.issuer, audience: platform.client_id, algorithms: ['RS256'], clockTolerance: 60, maxTokenAge: '1h', ...(now ? { currentDate: now } : {}) })
    payload = r.payload
  } catch (e) {
    const code = (e as { code?: string }).code
    if (code === 'ERR_JWT_EXPIRED') return { ok: false, error: 'expired' }
    if (code === 'ERR_JWT_CLAIM_VALIDATION_FAILED') {
      const claim = (e as { claim?: string }).claim
      return { ok: false, error: claim === 'iss' ? 'bad_issuer' : claim === 'aud' ? 'bad_audience' : 'expired' }
    }
    return { ok: false, error: 'bad_signature' }
  }
  return validateLaunchClaims(payload as JWTPayload & Record<string, unknown>, { clientId: platform.client_id, deploymentIds: platform.deployment_ids, expectedNonce: nonce.expected, seenNonce: nonce.seen })
}

/** The OIDC authentication request URL (response_mode=form_post, prompt=none). */
export function oidcAuthUrl(platform: Pick<LtiPlatform, 'auth_login_url' | 'client_id'>, p: { redirectUri: string; loginHint: string; messageHint?: string | null; state: string; nonce: string }): string {
  const u = new URL(platform.auth_login_url)
  const q: Record<string, string> = {
    scope: 'openid', response_type: 'id_token', response_mode: 'form_post', prompt: 'none',
    client_id: platform.client_id, redirect_uri: p.redirectUri, login_hint: p.loginHint, state: p.state, nonce: p.nonce,
  }
  if (p.messageHint) q.lti_message_hint = p.messageHint
  for (const [k, v] of Object.entries(q)) u.searchParams.set(k, v)
  return u.toString()
}

export interface ToolKey { kid: string; privateKey: CryptoKey | Uint8Array | JWK; publicJwk: JWK }

/** Deep-linking response JWT: one LTI resource link per chosen test, each with a 0–100 line item. */
export async function signDeepLinkResponse(key: ToolKey, p: { clientId: string; issuer: string; deploymentId: string; data: string | null; launchUrl: string; items: { exam_id: string; title: string }[]; now?: number }): Promise<string> {
  const now = Math.floor((p.now ?? Date.now()) / 1000)
  return new SignJWT({
    [LTI.messageType]: 'LtiDeepLinkingResponse',
    [LTI.version]: '1.3.0',
    [LTI.deploymentId]: p.deploymentId,
    ...(p.data ? { [LTI.dlData]: p.data } : {}),
    [LTI.dlContentItems]: p.items.map((i) => ({
      type: 'ltiResourceLink',
      title: i.title.slice(0, 200),
      url: p.launchUrl,
      custom: { exam_id: i.exam_id },
      lineItem: { scoreMaximum: 100, label: i.title.slice(0, 200), resourceId: i.exam_id },
      window: { targetName: '_blank' },
    })),
  })
    .setProtectedHeader({ alg: 'RS256', kid: key.kid, typ: 'JWT' })
    .setIssuer(p.clientId)
    .setAudience(p.issuer)
    .setIssuedAt(now)
    .setExpirationTime(now + 300)
    .setJti(crypto.randomUUID())
    .sign(key.privateKey as CryptoKey)
}

/** client_credentials assertion for the platform's token endpoint (RFC 7523). */
export async function signClientAssertion(key: ToolKey, p: { clientId: string; aud: string; now?: number }): Promise<string> {
  const now = Math.floor((p.now ?? Date.now()) / 1000)
  return new SignJWT({})
    .setProtectedHeader({ alg: 'RS256', kid: key.kid, typ: 'JWT' })
    .setIssuer(p.clientId)
    .setSubject(p.clientId)
    .setAudience(p.aud)
    .setIssuedAt(now)
    .setExpirationTime(now + 300)
    .setJti(crypto.randomUUID())
    .sign(key.privateKey as CryptoKey)
}

/** Our 0–100 result → an AGS score (score.maximum 100; fully graded once released). */
export function agsScore(p: { userId: string; percent: number; timestamp?: string; comment?: string | null }) {
  const pct = Math.max(0, Math.min(100, Math.round(p.percent * 100) / 100))
  return {
    userId: p.userId,
    scoreGiven: pct,
    scoreMaximum: 100,
    activityProgress: 'Completed',
    gradingProgress: 'FullyGraded',
    timestamp: p.timestamp ?? new Date().toISOString(),
    ...(p.comment ? { comment: p.comment.slice(0, 500) } : {}),
  }
}

/** The scores endpoint for a line item URL (keeps its query string, as the spec requires). */
export function scoresUrl(lineitem: string): string {
  const u = new URL(lineitem)
  u.pathname = `${u.pathname.replace(/\/+$/, '')}/scores`
  return u.toString()
}

/** Platform registration from the admin form. */
export function validatePlatform(raw: Record<string, unknown>): { ok: true; value: Omit<LtiPlatform, 'id' | 'tenant_id'> } | { ok: false; error: string } {
  const name = String(raw.name || '').replace(/\s+/g, ' ').trim().slice(0, 80)
  const issuer = String(raw.issuer || '').trim().replace(/\/+$/, '')
  const client_id = String(raw.client_id || '').trim().slice(0, 200)
  const deployment_ids = (Array.isArray(raw.deployment_ids) ? raw.deployment_ids : String(raw.deployment_ids || '').split(/[\s,]+/)).map((d) => String(d).trim()).filter((d) => /^[\w.:-]{1,200}$/.test(d)).slice(0, 20)
  const urls = { auth_login_url: httpsUrl(raw.auth_login_url), auth_token_url: httpsUrl(raw.auth_token_url), jwks_url: httpsUrl(raw.jwks_url) }
  if (!name) return { ok: false, error: 'Give the platform a name.' }
  if (!httpsUrl(issuer)) return { ok: false, error: 'The issuer must be the platform’s https:// URL.' }
  if (!client_id) return { ok: false, error: 'Enter the client ID the platform gave you.' }
  if (!deployment_ids.length) return { ok: false, error: 'Enter at least one deployment ID.' }
  if (!urls.auth_login_url || !urls.auth_token_url || !urls.jwks_url) return { ok: false, error: 'The login, token and key set URLs must be https://.' }
  const aud = raw.auth_token_aud ? httpsUrl(raw.auth_token_aud) : null
  return { ok: true, value: { name, issuer, client_id, deployment_ids, auth_login_url: urls.auth_login_url, auth_token_url: urls.auth_token_url, auth_token_aud: aud, jwks_url: urls.jwks_url } }
}

/** Moodle's endpoints for a site URL (Site administration → External tool → Manage tools shows the same). */
export function moodleDefaults(site: string): Pick<LtiPlatform, 'issuer' | 'auth_login_url' | 'auth_token_url' | 'jwks_url'> | null {
  const base = httpsUrl(site)?.replace(/\/+$/, '')
  if (!base) return null
  return { issuer: base, auth_login_url: `${base}/mod/lti/auth.php`, auth_token_url: `${base}/mod/lti/token.php`, jwks_url: `${base}/mod/lti/certs.php` }
}

// ─── Grade passback retry (CORE-041) ─────────────────────────────────────────

export const GRADE_RETRY_MAX = 8

/**
 * When to retry a failed score post: 5 min, 10, 20, 40 … capped at 12 h; null
 * after GRADE_RETRY_MAX failures (the admin can still press "Resend grades").
 */
export function gradeRetryAt(failures: number, now: Date = new Date()): string | null {
  if (!Number.isFinite(failures) || failures < 1 || failures > GRADE_RETRY_MAX) return null
  const delay = Math.min(12 * 3_600_000, 5 * 60_000 * 2 ** (failures - 1))
  return new Date(now.getTime() + delay).toISOString()
}

// ─── Launch → account binding (SEC-030) ──────────────────────────────────────

/**
 * Who may continue a resource launch. A launch token is bound to the first
 * account that continues it, and an LMS user (platform + sub) is bound to one
 * CodeSpectra account for good, so a copied launch link can't send a friend's
 * score to someone else's gradebook.
 */
export function launchBindingDecision(p: {
  userId: string
  userEmail: string
  launchEmail: string | null
  launchUsedBy: string | null
  /** account already linked to this LMS user, if any */
  linkedUserId: string | null
}): { ok: true } | { ok: false; code: 'lti_email_mismatch' | 'lti_launch_taken' | 'lti_account_mismatch' } {
  if (p.launchEmail && p.launchEmail.toLowerCase() !== p.userEmail.toLowerCase()) return { ok: false, code: 'lti_email_mismatch' }
  if (p.launchUsedBy && p.launchUsedBy !== p.userId) return { ok: false, code: 'lti_launch_taken' }
  if (p.linkedUserId && p.linkedUserId !== p.userId) return { ok: false, code: 'lti_account_mismatch' }
  return { ok: true }
}
