/**
 * Play Integrity for the Android app (lib/mobile/play-integrity.ts).
 *
 * GET  → { nonce } one-time, 5 min, bound to the signed-in user.
 * POST { token, package_name, nonce, session_kind?, session_id? }
 *      → decodes the token with Google, stores this session's device trust
 *        and returns { trust, app_recognized, licensed, reasons }.
 *        With session_kind + session_id (a proctored attempt) the result is
 *        also written to that attempt's proctor timeline.
 * An integrity SIGNAL only: nothing here signs anyone out or fails a test.
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAPIUser } from '@/lib/route-auth'
import { readSessionCookie } from '@/lib/session'
import { rateLimitRedis } from '@/lib/upstash-rate-limit'
import { consumeNonce, decodeIntegrityToken, evaluateIntegrity, integrityConfig, isIntegrityToken, isPackageName, issueNonce, saveDeviceTrust } from '@/lib/mobile/play-integrity'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const Body = z.object({
  token: z.string().refine(isIntegrityToken),
  nonce: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  package_name: z.string().refine(isPackageName),
  session_kind: z.enum(['exam', 'problem', 'interview']).optional(),
  session_id: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/).optional(),
})

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

  try {
    const cfg = await integrityConfig()
    if (!cfg.serviceAccount) return NextResponse.json({ error: 'This feature is not available yet', code: 'feature_unavailable' }, { status: 503 })
    if (!cfg.packageNames.includes(body.package_name)) return NextResponse.json({ error: 'Invalid request', code: 'invalid_request' }, { status: 400 })
    if (!(await consumeNonce(user.id, body.nonce))) return NextResponse.json({ error: 'Invalid token', code: 'auth_invalid_token' }, { status: 400 })

    const payload = await decodeIntegrityToken(cfg, body.package_name, body.token)
    const verdict = evaluateIntegrity(payload, { packageName: body.package_name, nonce: body.nonce, certDigests: cfg.certDigests })

    const session = await readSessionCookie().catch(() => null)
    const sid = session?.uid === user.id && session.sid ? session.sid : 'bearer'
    await saveDeviceTrust(user.id, sid, body.package_name, verdict)

    if (body.session_kind && body.session_id) {
      const { proctorEvents, newId, nowIso } = await import('@/lib/db/ai')
      await (await proctorEvents()).insertOne({
        id: newId(),
        user_id: user.id,
        session_kind: body.session_kind,
        session_id: body.session_id,
        event_type: `device_integrity_${verdict.trust}`,
        meta: { source: 'play_integrity', app_recognized: verdict.app_recognized, licensed: verdict.licensed, reasons: verdict.reasons.join(',').slice(0, 200) },
        created_at: nowIso(),
      } as never)
    }
    return NextResponse.json({ trust: verdict.trust, app_recognized: verdict.app_recognized, licensed: verdict.licensed, reasons: verdict.reasons })
  } catch (e) {
    // Never echo Google's response; it may include request details.
    console.error('[mobile/integrity] verify failed:', (e as Error)?.message)
    return NextResponse.json({ error: 'Something went wrong. Try again in a moment.', code: 'server_error_moment' }, { status: 502 })
  }
}
