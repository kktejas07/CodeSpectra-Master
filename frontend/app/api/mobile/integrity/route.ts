/**
 * Play Integrity for the Android app (lib/mobile/play-integrity.ts).
 *
 * GET  → { nonce } one-time, 5 min, bound to the signed-in user.
 * POST { token, package_name, nonce, session_kind?, session_id? }
 *      → decodes the token with Google, stores this session's device trust
 *        and returns { trust, app_recognized, licensed, reasons }.
 *        With session_kind + session_id (a proctored attempt) the result is
 *        also written to that attempt's proctor timeline.
 * POST { platform: 'ios', kind: attestation|assertion|devicecheck, token,
 *        key_id?, bundle_id, nonce, session_kind?, session_id? }
 *      → App Attest / DeviceCheck (lib/mobile/app-attest.ts), same response;
 *        { reattest: true } tells the app to make a new App Attest key.
 * An integrity SIGNAL only: nothing here signs anyone out or fails a test.
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAPIUser } from '@/lib/route-auth'
import { readSessionCookie } from '@/lib/session'
import { rateLimitRedis } from '@/lib/upstash-rate-limit'
import { advanceAttestCounter, appAttestRoot, getAttestKey, iosIntegrityConfig, iosVerdict, isAttestKeyId, isBundleId, isIosToken, saveAttestKey, validateDeviceCheckToken, verifyAssertion, verifyAttestation } from '@/lib/mobile/app-attest'
import { consumeNonce, decodeIntegrityToken, evaluateIntegrity, integrityConfig, isIntegrityToken, isPackageName, issueNonce, saveDeviceTrust } from '@/lib/mobile/play-integrity'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const Session = {
  nonce: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  session_kind: z.enum(['exam', 'problem', 'interview']).optional(),
  session_id: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/).optional(),
}
const AndroidBody = z.object({
  platform: z.literal('android').optional(),
  token: z.string().refine(isIntegrityToken),
  package_name: z.string().refine(isPackageName),
  ...Session,
})
const IosBody = z.object({
  platform: z.literal('ios'),
  kind: z.enum(['attestation', 'assertion', 'devicecheck']),
  token: z.string().refine(isIosToken),
  key_id: z.string().refine(isAttestKeyId).optional(),
  bundle_id: z.string().refine(isBundleId),
  ...Session,
}).refine((b) => b.kind === 'devicecheck' || !!b.key_id)
const Body = z.union([IosBody, AndroidBody])
type Verdict = Awaited<ReturnType<typeof evaluateIntegrity>>

const unauthorized = () => NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })
const limited = (seconds: number) =>
  NextResponse.json({ error: `Too many requests. Try again in ${seconds}s.`, code: 'rate_limited_seconds', params: { seconds } }, { status: 429 })

export async function GET() {
  const user = await getAPIUser()
  if (!user) return unauthorized()
  const rl = await rateLimitRedis(`mobile-integrity:nonce:${user.id}`, 20, 10 * 60_000)
  if (!rl.ok) return limited(rl.retryAfterSec)
  try {
    return NextResponse.json(await issueNonce(user.id))
  } catch (e) {
    console.error('[mobile/integrity] nonce failed:', (e as Error)?.message)
    return NextResponse.json({ error: 'Something went wrong. Please try again.', code: 'server_error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const user = await getAPIUser()
  if (!user) return unauthorized()
  const len = Number(req.headers.get('content-length') || 0)
  if (len > 32 * 1024) return NextResponse.json({ error: 'Invalid request', code: 'invalid_request' }, { status: 400 })
  const raw = await req.json().catch(() => null)
  if (raw === null) return NextResponse.json({ error: 'Invalid JSON', code: 'invalid_json' }, { status: 400 })
  const parsed = Body.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request', code: 'invalid_request' }, { status: 400 })
  const body = parsed.data
  const rl = await rateLimitRedis(`mobile-integrity:verify:${user.id}`, 10, 10 * 60_000)
  if (!rl.ok) return limited(rl.retryAfterSec)

  if (body.platform === 'ios') return verifyIos(user.id, body)
  try {
    const cfg = await integrityConfig()
    if (!cfg.serviceAccount) return NextResponse.json({ error: 'This feature is not available yet', code: 'feature_unavailable' }, { status: 503 })
    if (!cfg.packageNames.includes(body.package_name)) return NextResponse.json({ error: 'Invalid request', code: 'invalid_request' }, { status: 400 })
    if (!(await consumeNonce(user.id, body.nonce))) return NextResponse.json({ error: 'Invalid token', code: 'auth_invalid_token' }, { status: 400 })

    const payload = await decodeIntegrityToken(cfg, body.package_name, body.token)
    const verdict = evaluateIntegrity(payload, { packageName: body.package_name, nonce: body.nonce, certDigests: cfg.certDigests })

    await record(user.id, body.package_name, verdict, 'play_integrity', body)
    return NextResponse.json({ trust: verdict.trust, app_recognized: verdict.app_recognized, licensed: verdict.licensed, reasons: verdict.reasons })
  } catch (e) {
    // Never echo Google's response; it may include request details.
    console.error('[mobile/integrity] verify failed:', (e as Error)?.message)
    return NextResponse.json({ error: 'Something went wrong. Try again in a moment.', code: 'server_error_moment' }, { status: 502 })
  }
}

/** Store this session's device trust and, for a proctored attempt, a timeline event. */
async function record(userId: string, pkg: string, verdict: Verdict, source: string, body: { session_kind?: string; session_id?: string }) {
  const session = await readSessionCookie().catch(() => null)
  const sid = session?.uid === userId && session.sid ? session.sid : 'bearer'
  await saveDeviceTrust(userId, sid, pkg, verdict)
  if (body.session_kind && body.session_id) {
    const { proctorEvents, newId, nowIso } = await import('@/lib/db/ai')
    await (await proctorEvents()).insertOne({
      id: newId(),
      user_id: userId,
      session_kind: body.session_kind,
      session_id: body.session_id,
      event_type: `device_integrity_${verdict.trust}`,
      meta: { source, app_recognized: verdict.app_recognized, licensed: verdict.licensed, reasons: verdict.reasons.join(',').slice(0, 200) },
      created_at: nowIso(),
    } as never)
  }
}

async function verifyIos(userId: string, body: z.infer<typeof IosBody>) {
  try {
    const cfg = await iosIntegrityConfig()
    if (!cfg.teamId || (body.kind === 'devicecheck' && !cfg.deviceCheck)) {
      return NextResponse.json({ error: 'This feature is not available yet', code: 'feature_unavailable' }, { status: 503 })
    }
    if (!cfg.bundleIds.includes(body.bundle_id)) return NextResponse.json({ error: 'Invalid request', code: 'invalid_request' }, { status: 400 })
    if (!(await consumeNonce(userId, body.nonce))) return NextResponse.json({ error: 'Invalid token', code: 'auth_invalid_token' }, { status: 400 })

    let verdict: Verdict
    let reattest = false
    if (body.kind === 'attestation') {
      const r = verifyAttestation(body.token, await appAttestRoot(cfg), {
        appIds: cfg.bundleIds.map((b) => `${cfg.teamId}.${b}`), challenge: body.nonce, keyId: body.key_id!, allowDevelopment: cfg.allowDevelopment,
      })
      if (r.ok && r.publicKeyPem && r.appId) {
        await saveAttestKey({ key_id: body.key_id!, public_key_pem: r.publicKeyPem, app_id: r.appId, counter: 0, development: r.development, user_id: userId })
      }
      verdict = iosVerdict('attestation', r.ok, r.reasons)
    } else if (body.kind === 'assertion') {
      const key = await getAttestKey(body.key_id!)
      if (!key) {
        reattest = true
        verdict = iosVerdict('assertion', false, ['unknown_key'])
      } else {
        const r = verifyAssertion(body.token, { publicKeyPem: key.public_key_pem, counter: key.counter, appId: key.app_id }, body.nonce)
        const ok = r.ok && (await advanceAttestCounter(body.key_id!, key.counter, r.counter, userId))
        verdict = iosVerdict('assertion', ok, r.ok && !ok ? ['counter_replay'] : r.reasons)
      }
    } else {
      verdict = iosVerdict('devicecheck', await validateDeviceCheckToken(cfg, body.token), ['devicecheck_invalid'])
    }

    await record(userId, body.bundle_id, verdict, body.kind === 'devicecheck' ? 'devicecheck' : 'app_attest', body)
    return NextResponse.json({ trust: verdict.trust, app_recognized: verdict.app_recognized, licensed: null, reasons: verdict.reasons, ...(reattest ? { reattest: true } : {}) })
  } catch (e) {
    // Never echo Apple's response.
    console.error('[mobile/integrity] ios verify failed:', (e as Error)?.message)
    return NextResponse.json({ error: 'Something went wrong. Try again in a moment.', code: 'server_error_moment' }, { status: 502 })
  }
}
