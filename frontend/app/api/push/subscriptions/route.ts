/**
 * App (PWA) web push subscriptions for the signed-in user — docs/pwa.md.
 *   GET    → { configured, publicKey, enabled, devices[] }  (no endpoints returned)
 *   POST   { endpoint, keys: { p256dh, auth }, replaces? } → save this device
 *   DELETE { endpoint } → remove this device
 * Auth required; CSRF is checked by proxy.ts for every mutating /api call;
 * per-user rate limit on writes.
 */
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { limitRequest } from '@/lib/rate-limit'
import { getMongoDb } from '@/lib/mongodb'
import { subscribeSchema, unsubscribeSchema } from '@/lib/pwa/push-schemas'
import { getVapidConfig, listDevices, removeSubscription, saveSubscription } from '@/lib/pwa/web-push'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store' }

export async function GET() {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  try {
    const [vapid, devices, pref] = await Promise.all([
      getVapidConfig(),
      listDevices(gate.user.id),
      (await getMongoDb()).collection('notification_preferences').findOne({ user_id: gate.user.id, type: 'push' }, { projection: { enabled: 1 } }),
    ])
    return NextResponse.json(
      { configured: !!vapid, publicKey: vapid?.publicKey ?? null, enabled: pref?.enabled !== false, devices },
      { headers: NO_STORE },
    )
  } catch (e) {
    console.error('[push/subscriptions] GET failed:', (e as Error)?.message)
    return NextResponse.json({ error: 'Could not load push settings' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const limited = await limitRequest(req, 'push-subscribe', gate.user.id, 10, 60_000)
  if (limited) return limited
  const parsed = subscribeSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 })
  try {
    if (!(await getVapidConfig())) return NextResponse.json({ error: 'Push is not set up yet' }, { status: 503 })
    await saveSubscription(gate.user.id, parsed.data, req.headers.get('user-agent'), parsed.data.replaces)
    return NextResponse.json({ ok: true }, { headers: NO_STORE })
  } catch (e) {
    console.error('[push/subscriptions] POST failed:', (e as Error)?.message)
    return NextResponse.json({ error: 'Could not save this device' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const limited = await limitRequest(req, 'push-subscribe', gate.user.id, 10, 60_000)
  if (limited) return limited
  const parsed = unsubscribeSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request', code: 'invalid_request' }, { status: 400 })
  try {
    const removed = await removeSubscription(gate.user.id, parsed.data.endpoint)
    return NextResponse.json({ ok: true, removed }, { headers: NO_STORE })
  } catch (e) {
    console.error('[push/subscriptions] DELETE failed:', (e as Error)?.message)
    return NextResponse.json({ error: 'Could not remove this device' }, { status: 500 })
  }
}
