/**
 * LTI 1.3 tool provider — storage and flows (Moodle and any LTI 1.3 platform).
 *
 *  lti_platforms     registrations per organisation (issuer + client_id unique)
 *  lti_tool_keys     the tool's RS256 key pair (private JWK encrypted), auto-created
 *  lti_states        OIDC state → nonce, single use, 10 min TTL
 *  lti_nonces        id_token nonces already accepted (replay guard), 2 h TTL
 *  lti_launches      a verified launch, consumed by /lti/launch/[token] or the deep-link picker, 2 h TTL
 *  lti_grade_links   (platform, LMS user, test, line item) → CodeSpectra user, for grade passback (AGS);
 *                    a failed post keeps `pending_pct` and is retried with backoff (CORE-041)
 *  lti_accounts      (platform, LMS user) → the one CodeSpectra account it is bound to (SEC-030)
 *
 * SEC-031: every platform URL is checked with isSafeUrl on save, and the JWKS,
 * token and score requests go through safeFetch (no private-network targets).
 */
import 'server-only'
import { randomBytes } from 'node:crypto'
import { createRemoteJWKSet, customFetch, exportJWK, generateKeyPair, importJWK, type JWK } from 'jose'
import { isSafeUrl, safeFetch } from '@/lib/url-safety'
import type { APIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { nowIso } from '@/lib/db/ids'
import { getAppOrigin } from '@/lib/app-origin'
import { fail } from '@/lib/community/http'
import { lazyCollection } from '@/lib/community/lazy'
import { openJson, sealJson } from '../store'
import { ensureIntegrationLink } from '../exam-links'
import {
  AGS_SCOPES, PLATFORM_URL_FIELDS, agsScore, gradeRetryAt, launchBindingDecision, oidcAuthUrl, scoresUrl, signClientAssertion, signDeepLinkResponse, validatePlatform, verifyLaunchToken,
  type LaunchClaims, type LtiPlatform, type ToolKey,
} from './core'

interface PlatformDoc extends LtiPlatform { created_by: string; created_at: string; updated_at: string }
interface KeyDoc { kid: string; public_jwk: JWK; private_jwk: string; active: boolean; created_at: string }
interface StateDoc { state: string; nonce: string; platform_id: string; expires_at: Date; used: boolean }
interface NonceDoc { nonce: string; platform_id: string; expires_at: Date }
interface LaunchDoc { token: string; platform_id: string; tenant_id: string; claims: LaunchClaims; exam_id: string | null; used: boolean; used_by?: string | null; created_at: string; expires_at: Date }
interface GradeLinkDoc {
  platform_id: string; tenant_id: string; sub: string; user_id: string; exam_id: string; lineitem: string; created_at: string
  last_pct: number | null; last_sent_at: string | null; last_error: string | null
  /** CORE-041: score still to deliver, failures so far, next retry (null = none scheduled) */
  pending_pct?: number | null; failures?: number; next_retry_at?: string | null
}
interface AccountLinkDoc { platform_id: string; sub: string; user_id: string; created_at: string }

const platformsCol = lazyCollection<PlatformDoc>('lti_platforms', (c) => Promise.all([
  c.createIndex({ id: 1 }, { unique: true, name: 'ltip_id' }),
  c.createIndex({ issuer: 1, client_id: 1 }, { unique: true, name: 'ltip_iss_client' }),
  c.createIndex({ tenant_id: 1 }, { name: 'ltip_tenant' }),
]))
const keysCol = lazyCollection<KeyDoc>('lti_tool_keys', (c) => c.createIndex({ kid: 1 }, { unique: true, name: 'ltik_kid' }))
const statesCol = lazyCollection<StateDoc>('lti_states', (c) => Promise.all([
  c.createIndex({ state: 1 }, { unique: true, name: 'lts_state' }),
  c.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0, name: 'lts_ttl' }),
]))
const noncesCol = lazyCollection<NonceDoc>('lti_nonces', (c) => Promise.all([
  c.createIndex({ nonce: 1, platform_id: 1 }, { unique: true, name: 'ltn_nonce' }),
  c.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0, name: 'ltn_ttl' }),
]))
const launchesCol = lazyCollection<LaunchDoc>('lti_launches', (c) => Promise.all([
  c.createIndex({ token: 1 }, { unique: true, name: 'ltl_token' }),
  c.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0, name: 'ltl_ttl' }),
]))
const gradeLinksCol = lazyCollection<GradeLinkDoc>('lti_grade_links', (c) => Promise.all([
  c.createIndex({ platform_id: 1, sub: 1, exam_id: 1, lineitem: 1 }, { unique: true, name: 'ltg_unique' }),
  c.createIndex({ exam_id: 1, user_id: 1 }, { name: 'ltg_exam_user' }),
  c.createIndex({ next_retry_at: 1 }, { name: 'ltg_retry', partialFilterExpression: { next_retry_at: { $type: 'string' } } }),
]))
const accountsCol = lazyCollection<AccountLinkDoc>('lti_accounts', (c) => Promise.all([
  c.createIndex({ platform_id: 1, sub: 1 }, { unique: true, name: 'lta_platform_sub' }),
  c.createIndex({ user_id: 1 }, { name: 'lta_user' }),
]))

export const STATE_COOKIE = 'cs_lti_state'
export const launchUrl = () => `${getAppOrigin()}/api/lti/launch`
export const loginUrl = () => `${getAppOrigin()}/api/lti/login`
export const jwksUrl = () => `${getAppOrigin()}/api/lti/jwks`

// ─── Platforms (organisation admin) ──────────────────────────────────────────

export async function listPlatforms(tenantId: string) {
  return (await platformsCol()).find({ tenant_id: tenantId }, { projection: { _id: 0 } }).sort({ created_at: -1 }).limit(50).toArray()
}

export async function savePlatform(user: APIUser, tenantId: string, raw: Record<string, unknown>, id?: string) {
  const v = validatePlatform(raw)
  if (!v.ok) throw fail(v.error, 400, 'lti_platform_invalid', { detail: v.error })
  // SEC-031: the server fetches / redirects to these — public hosts only.
  for (const k of PLATFORM_URL_FIELDS) {
    const chk = await isSafeUrl(v.value[k])
    if (!chk.safe) throw fail('The login, token and key set URLs must be public https:// addresses.', 400, 'lti_platform_unsafe_url', { field: k })
  }
  const col = await platformsCol()
  const now = nowIso()
  try {
    if (id) {
      const r = await col.findOneAndUpdate({ id, tenant_id: tenantId }, { $set: { ...v.value, updated_at: now } }, { returnDocument: 'after', projection: { _id: 0 } })
      if (!r) throw fail('Platform not found', 404, 'lti_platform_missing')
      return r
    }
    const doc: PlatformDoc = { id: `ltp_${randomBytes(8).toString('hex')}`, tenant_id: tenantId, ...v.value, created_by: user.id, created_at: now, updated_at: now }
    await col.insertOne(doc)
    return doc
  } catch (e) {
    if ((e as { code?: number }).code === 11000) throw fail('This issuer and client ID are already registered.', 409, 'lti_platform_exists')
    throw e
  }
}

export async function deletePlatform(tenantId: string, id: string) {
  await (await platformsCol()).deleteOne({ id, tenant_id: tenantId })
  return { ok: true }
}

// ─── Tool key ────────────────────────────────────────────────────────────────

let keyCache: ToolKey | null = null

export async function toolKey(): Promise<ToolKey> {
  if (keyCache) return keyCache
  const col = await keysCol()
  let row = await col.findOne({ active: true }, { projection: { _id: 0 } })
  if (!row) {
    const { publicKey, privateKey } = await generateKeyPair('RS256', { extractable: true, modulusLength: 2048 })
    const kid = randomBytes(8).toString('hex')
    const pub = { ...(await exportJWK(publicKey)), kid, alg: 'RS256', use: 'sig' }
    const priv = { ...(await exportJWK(privateKey)), kid, alg: 'RS256' }
    try {
      await col.insertOne({ kid, public_jwk: pub, private_jwk: await sealJson(priv), active: true, created_at: nowIso() })
    } catch { /* another instance won the race */ }
    row = await col.findOne({ active: true }, { projection: { _id: 0 } })
    if (!row) throw new Error('LTI key could not be created')
  }
  const jwk = await openJson<JWK>(row.private_jwk)
  if (!jwk) throw new Error('LTI key could not be decrypted (encryption key changed?)')
  keyCache = { kid: row.kid, privateKey: (await importJWK(jwk, 'RS256')) as ToolKey['privateKey'], publicJwk: row.public_jwk }
  return keyCache
}

export async function publicJwks(): Promise<{ keys: JWK[] }> {
  await toolKey()
  const rows = await (await keysCol()).find({}, { projection: { _id: 0, public_jwk: 1 } }).limit(5).toArray()
  return { keys: rows.map((r) => r.public_jwk) }
}

// ─── OIDC login ──────────────────────────────────────────────────────────────

async function platformFor(issuer: string, clientId?: string | null): Promise<PlatformDoc> {
  const col = await platformsCol()
  const list = await col.find({ issuer: issuer.replace(/\/+$/, ''), ...(clientId ? { client_id: clientId } : {}) }, { projection: { _id: 0 } }).limit(2).toArray()
  if (list.length !== 1) throw fail('This learning platform is not registered with CodeSpectra.', 400, 'lti_unknown_platform')
  return list[0]
}

/** Step 1: the platform's login initiation → redirect to its auth endpoint with fresh state + nonce. */
export async function oidcLogin(params: Record<string, string>): Promise<{ redirect: string; state: string }> {
  const iss = params.iss
  const loginHint = params.login_hint
  if (!iss || !loginHint || loginHint.length > 2000) throw fail('The login request is missing iss or login_hint.', 400, 'lti_bad_login')
  const platform = await platformFor(iss, params.client_id || null)
  if (params.lti_deployment_id && !platform.deployment_ids.includes(params.lti_deployment_id)) throw fail('Unknown deployment.', 400, 'lti_bad_login')
  const state = randomBytes(24).toString('base64url')
  const nonce = randomBytes(24).toString('base64url')
  await (await statesCol()).insertOne({ state, nonce, platform_id: platform.id, expires_at: new Date(Date.now() + 10 * 60_000), used: false })
  return { state, redirect: oidcAuthUrl(platform, { redirectUri: launchUrl(), loginHint, messageHint: params.lti_message_hint?.slice(0, 2000) || null, state, nonce }) }
}

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>()

/**
 * Step 2: the id_token form post. `cookieState` is the state cookie when the
 * browser sent it (it is SameSite=None; a browser that blocks it still has
 * the single-use server-side state + nonce).
 */
export async function oidcLaunch(form: { id_token?: string; state?: string }, cookieState: string | null): Promise<{ token: string; kind: LaunchClaims['kind'] }> {
  const state = String(form.state || '')
  const idToken = String(form.id_token || '')
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(state) || !idToken || idToken.length > 20_000) throw fail('The launch is missing its state or token.', 400, 'lti_bad_launch')
  if (cookieState && cookieState !== state) throw fail('This launch was started in another window. Open the activity again.', 400, 'lti_state_mismatch')
  const s = await (await statesCol()).findOneAndUpdate({ state, used: false, expires_at: { $gt: new Date() } }, { $set: { used: true } }, { projection: { _id: 0 } })
  if (!s) throw fail('This launch link expired. Open the activity again from your course.', 400, 'lti_state_expired')
  const platform = await (await platformsCol()).findOne({ id: s.platform_id }, { projection: { _id: 0 } })
  if (!platform) throw fail('This learning platform is not registered with CodeSpectra.', 400, 'lti_unknown_platform')
  let keys = jwksCache.get(platform.jwks_url)
  if (!keys) {
    keys = createRemoteJWKSet(new URL(platform.jwks_url), {
      timeoutDuration: 10_000, cooldownDuration: 30_000, cacheMaxAge: 10 * 60_000,
      // SEC-031: no private-network JWKS (and no redirect into one).
      [customFetch]: (url: string, opts: { headers?: HeadersInit; method?: string; signal?: AbortSignal }) => safeFetch(url, { headers: opts.headers, method: opts.method || 'GET', signal: opts.signal }),
    })
    jwksCache.set(platform.jwks_url, keys)
  }
  const r = await verifyLaunchToken(idToken, platform, keys, { expected: s.nonce })
  if (!r.ok) throw fail('The launch could not be verified.', 401, 'lti_invalid_token', { reason: r.error })
  // Replay guard: a nonce is accepted once.
  try {
    await (await noncesCol()).insertOne({ nonce: s.nonce, platform_id: platform.id, expires_at: new Date(Date.now() + 2 * 3_600_000) })
  } catch {
    throw fail('The launch could not be verified.', 401, 'lti_invalid_token', { reason: 'bad_nonce' })
  }
  const examId = r.claims.custom.exam_id && /^[A-Za-z0-9_-]{1,128}$/.test(r.claims.custom.exam_id) ? r.claims.custom.exam_id : null
  const token = randomBytes(24).toString('base64url')
  await (await launchesCol()).insertOne({ token, platform_id: platform.id, tenant_id: platform.tenant_id, claims: r.claims, exam_id: examId, used: false, created_at: nowIso(), expires_at: new Date(Date.now() + 2 * 3_600_000) })
  return { token, kind: r.claims.kind }
}

async function loadLaunch(token: string, kind: LaunchClaims['kind']): Promise<LaunchDoc> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) throw fail('This launch link expired. Open the activity again from your course.', 404, 'lti_state_expired')
  const l = await (await launchesCol()).findOne({ token, expires_at: { $gt: new Date() } }, { projection: { _id: 0 } })
  if (!l || l.claims.kind !== kind) throw fail('This launch link expired. Open the activity again from your course.', 404, 'lti_state_expired')
  return l
}

async function tenantExams(tenantId: string) {
  const filter = tenantId === 'platform' ? { $or: [{ tenant_id: null }, { tenant_id: { $exists: false } }, { tenant_id: 'platform' }] } : { tenant_id: tenantId }
  return (await getMongoDb()).collection('exams').find({ ...filter, status: { $ne: 'archived' } }, { projection: { _id: 0, id: 1, title: 1 } }).sort({ created_at: -1 }).limit(200).toArray()
}

/** What the learner's launch page shows before they continue. */
export async function launchSummary(token: string) {
  const l = await loadLaunch(token, 'resource')
  const exam = l.exam_id ? await (await getMongoDb()).collection('exams').findOne({ id: l.exam_id, ...(l.tenant_id === 'platform' ? {} : { tenant_id: l.tenant_id }) }, { projection: { _id: 0, id: 1, title: 1 } }) : null
  return { exam: exam ? { id: String(exam.id), title: String(exam.title || 'Assessment') } : null, email: l.claims.email, name: l.claims.name, context: l.claims.context.title, used: l.used }
}

/**
 * The signed-in learner continues: the account is linked to the LMS user
 * (email must match when the LMS sent one), grade passback is recorded, and
 * they get the test link.
 */
export async function continueLaunch(user: APIUser, token: string): Promise<{ url: string }> {
  const l = await loadLaunch(token, 'resource')
  // SEC-030: bind the launch to the first account that continues it, and the LMS user to one account.
  const accounts = await accountsCol()
  const linked = await accounts.findOne({ platform_id: l.platform_id, sub: l.claims.sub }, { projection: { _id: 0, user_id: 1 } })
  const bind = launchBindingDecision({ userId: user.id, userEmail: user.email, launchEmail: l.claims.email, launchUsedBy: l.used_by ?? null, linkedUserId: linked?.user_id ?? null })
  if (!bind.ok) throw bindingError(bind.code, l.claims.email)
  if (!l.exam_id) throw fail('This activity isn’t linked to a CodeSpectra test yet. Ask your teacher to pick one.', 409, 'lti_no_exam')
  const db = await getMongoDb()
  const exam = await db.collection('exams').findOne({ id: l.exam_id, ...(l.tenant_id === 'platform' ? {} : { tenant_id: l.tenant_id }) }, { projection: { _id: 0, id: 1 } })
  if (!exam) throw fail('This activity isn’t linked to a CodeSpectra test yet. Ask your teacher to pick one.', 409, 'lti_no_exam')
  // Atomic claim: a second account loses even if both press Continue at once.
  const claimed = await (await launchesCol()).updateOne(
    { token, $or: [{ used_by: { $exists: false } }, { used_by: null }, { used_by: user.id }] } as never,
    { $set: { used: true, used_by: user.id } },
  )
  if (claimed.matchedCount === 0) throw bindingError('lti_launch_taken', null)
  try {
    await accounts.insertOne({ platform_id: l.platform_id, sub: l.claims.sub, user_id: user.id, created_at: nowIso() })
  } catch (e) {
    if ((e as { code?: number }).code !== 11000) throw e
    const now = await accounts.findOne({ platform_id: l.platform_id, sub: l.claims.sub }, { projection: { _id: 0, user_id: 1 } })
    if (now && now.user_id !== user.id) throw bindingError('lti_account_mismatch', null)
  }
  const lineitem = l.claims.ags?.lineitem
  if (lineitem && l.claims.ags?.scope.includes(AGS_SCOPES.score)) {
    // user_id is set once: a later launch can never re-point an existing grade link.
    await (await gradeLinksCol()).updateOne(
      { platform_id: l.platform_id, sub: l.claims.sub, exam_id: l.exam_id, lineitem },
      { $set: { tenant_id: l.tenant_id }, $setOnInsert: { user_id: user.id, platform_id: l.platform_id, sub: l.claims.sub, exam_id: l.exam_id, lineitem, created_at: nowIso(), last_pct: null, last_sent_at: null, last_error: null } },
      { upsert: true },
    )
  }
  return { url: await ensureIntegrationLink(l.exam_id, `lti:${l.platform_id}`) }
}

function bindingError(code: 'lti_email_mismatch' | 'lti_launch_taken' | 'lti_account_mismatch', email: string | null) {
  if (code === 'lti_email_mismatch') return fail('Sign in with the same email you use in your course.', 403, code, { email: email || '' })
  if (code === 'lti_launch_taken') return fail('This activity link was already opened with another account. Open the activity again from your course.', 403, code)
  return fail('Your course account is linked to a different CodeSpectra account. Sign in with that account, or ask your teacher for help.', 403, code)
}

/** Deep-link picker data (instructor launch): the organisation's tests. */
export async function deepLinkSummary(token: string) {
  const l = await loadLaunch(token, 'deep_link')
  if (!l.claims.instructor) throw fail('Only teachers can add CodeSpectra tests to a course.', 403, 'lti_instructor_only')
  return { context: l.claims.context.title, multiple: !!l.claims.deep_link?.accept_multiple, exams: (await tenantExams(l.tenant_id)).map((e) => ({ id: String(e.id), title: String(e.title || 'Assessment') })) }
}

/** Sign the deep-linking response for the chosen tests; the page auto-posts it back to the LMS. */
export async function deepLinkRespond(token: string, examIds: string[]): Promise<{ return_url: string; jwt: string }> {
  const l = await loadLaunch(token, 'deep_link')
  if (!l.claims.instructor) throw fail('Only teachers can add CodeSpectra tests to a course.', 403, 'lti_instructor_only')
  if (l.used) throw fail('This launch link expired. Open the activity again from your course.', 409, 'lti_state_expired')
  const exams = await tenantExams(l.tenant_id)
  const chosen = exams.filter((e) => examIds.includes(String(e.id))).slice(0, l.claims.deep_link?.accept_multiple ? 20 : 1)
  if (!chosen.length) throw fail('Pick at least one test.', 400, 'lti_pick_exam')
  const platform = await (await platformsCol()).findOne({ id: l.platform_id }, { projection: { _id: 0 } })
  if (!platform) throw fail('This learning platform is not registered with CodeSpectra.', 400, 'lti_unknown_platform')
  const jwt = await signDeepLinkResponse(await toolKey(), {
    clientId: platform.client_id, issuer: platform.issuer, deploymentId: l.claims.deployment_id, data: l.claims.deep_link?.data ?? null,
    launchUrl: launchUrl(), items: chosen.map((e) => ({ exam_id: String(e.id), title: String(e.title || 'Assessment') })),
  })
  await (await launchesCol()).updateOne({ token }, { $set: { used: true } })
  return { return_url: l.claims.deep_link!.return_url, jwt }
}

// ─── Grade passback (AGS) ────────────────────────────────────────────────────

const tokenCache = new Map<string, { token: string; exp: number }>()

async function agsToken(platform: PlatformDoc, f: (url: string, init: RequestInit) => Promise<Response> = safeFetch): Promise<string> {
  const hit = tokenCache.get(platform.id)
  if (hit && hit.exp > Date.now()) return hit.token
  const assertion = await signClientAssertion(await toolKey(), { clientId: platform.client_id, aud: platform.auth_token_aud || platform.auth_token_url })
  const res = await f(platform.auth_token_url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer', client_assertion: assertion, scope: AGS_SCOPES.score }),
    signal: AbortSignal.timeout(15_000),
  })
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string }
  if (!res.ok || !j.access_token) throw new Error(`Token request failed (${j.error || res.status})`)
  tokenCache.set(platform.id, { token: j.access_token, exp: Date.now() + Math.max(60, (j.expires_in || 3600) - 120) * 1000 })
  return j.access_token
}

type LinkKey = Pick<GradeLinkDoc, 'platform_id' | 'sub' | 'exam_id' | 'lineitem'>
const linkKey = (g: LinkKey) => ({ platform_id: g.platform_id, sub: g.sub, exam_id: g.exam_id, lineitem: g.lineitem })

/** One score post. Success clears the retry state; a failure schedules the next try (CORE-041). */
async function sendScore(g: GradeLinkDoc, percent: number, now = new Date()): Promise<boolean> {
  const col = await gradeLinksCol()
  const platform = await (await platformsCol()).findOne({ id: g.platform_id }, { projection: { _id: 0 } })
  if (!platform) {
    await col.updateOne(linkKey(g), { $set: { last_error: 'Platform removed', next_retry_at: null } })
    return false
  }
  try {
    const token = await agsToken(platform)
    const res = await safeFetch(scoresUrl(g.lineitem), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/vnd.ims.lis.v1.score+json' },
      body: JSON.stringify(agsScore({ userId: g.sub, percent })),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) throw new Error(`Score post failed (${res.status})`)
    await col.updateOne(linkKey(g), { $set: { last_pct: percent, last_sent_at: nowIso(), last_error: null, pending_pct: null, failures: 0, next_retry_at: null } })
    return true
  } catch (e) {
    const failures = (g.pending_pct === percent ? g.failures ?? 0 : 0) + 1
    await col.updateOne(linkKey(g), { $set: { last_error: String((e as Error)?.message || 'Score post failed').slice(0, 200), pending_pct: percent, failures, next_retry_at: gradeRetryAt(failures, now) } })
    return false
  }
}

/**
 * Send a learner's released result for a test to every LMS line item linked to it. Never
 * throws: a failed post is kept and re-sent by retryFailedGrades (scheduler, every 5 min).
 */
export async function passbackGrade(examId: string, userId: string, percent: number): Promise<number> {
  let sent = 0
  try {
    const links = await (await gradeLinksCol()).find({ exam_id: examId, user_id: userId }, { projection: { _id: 0 } }).limit(20).toArray()
    for (const g of links) if (await sendScore(g, percent)) sent++
  } catch (e) {
    console.error('[lti] passback failed', (e as Error)?.message)
  }
  return sent
}

/** CORE-041: re-send scores whose post failed, once their backoff is due. Idempotent (AGS replaces the score). */
export async function retryFailedGrades(now = new Date(), limit = 100): Promise<{ sent: number; failed: number }> {
  const out = { sent: 0, failed: 0 }
  const col = await gradeLinksCol()
  const due = await col.find({ next_retry_at: { $lte: now.toISOString() }, pending_pct: { $type: 'number' } } as never, { projection: { _id: 0 } }).sort({ next_retry_at: 1 }).limit(limit).toArray()
  for (const g of due) {
    // Claim the row so a parallel sweep doesn't post the same score twice.
    const c = await col.updateOne({ ...linkKey(g), next_retry_at: g.next_retry_at } as never, { $set: { next_retry_at: new Date(now.getTime() + 10 * 60_000).toISOString() } })
    if (!c.modifiedCount) continue
    if (await sendScore(g, g.pending_pct as number, now)) out.sent++
    else out.failed++
  }
  return out
}

/** "Resend grades" (organisation admin): retry every undelivered score of the organisation now. */
export async function resendFailedGrades(tenantId: string): Promise<{ queued: number; sent: number; failed: number }> {
  const col = await gradeLinksCol()
  const now = new Date()
  const r = await col.updateMany({ tenant_id: tenantId, pending_pct: { $type: 'number' } } as never, { $set: { next_retry_at: now.toISOString(), failures: 0 } })
  const res = await retryFailedGrades(now, 200)
  return { queued: r.modifiedCount, ...res }
}

export async function gradeLinkStats(tenantId: string) {
  const rows = await (await gradeLinksCol()).aggregate<{ _id: string; links: number; sent: number; errors: number; pending?: number }>([
    { $match: { tenant_id: tenantId } },
    { $group: { _id: '$platform_id', links: { $sum: 1 }, sent: { $sum: { $cond: [{ $ne: ['$last_sent_at', null] }, 1, 0] } }, errors: { $sum: { $cond: [{ $ne: ['$last_error', null] }, 1, 0] } }, pending: { $sum: { $cond: [{ $eq: [{ $type: '$pending_pct' }, 'double'] }, 1, { $cond: [{ $eq: [{ $type: '$pending_pct' }, 'int'] }, 1, 0] }] } } } },
  ]).toArray()
  return Object.fromEntries(rows.map((r) => [r._id, { links: r.links, sent: r.sent, errors: r.errors, pending: r.pending ?? 0 }]))
}

