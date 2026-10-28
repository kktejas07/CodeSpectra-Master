/**
 * POST /api/push/test — send a test notification to the caller's own app
 * (PWA) devices. Bypasses quiet hours (the user asked for it right now) but
 * not the push channel switch. 3 per 10 minutes.
 */
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { limitRequest } from '@/lib/rate-limit'
import { sendWebPushToUser, userAllowsPush } from '@/lib/pwa/web-push'
import { outboundT } from '@/lib/i18n/outbound'
import { localeForUser } from '@/lib/i18n/recipient'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const limited = await limitRequest(req, 'push-test', gate.user.id, 3, 10 * 60_000)
  if (limited) return limited
  try {
    if (!(await userAllowsPush(gate.user.id, 'push.test'))) {
      return NextResponse.json({ error: 'Push notifications are switched off for your account' }, { status: 409 })
    }
    // In the user's interface language (lib/i18n/messages/*/notify.json).
    const t = outboundT('notify', await localeForUser(gate.user.id))
    const sent = await sendWebPushToUser(gate.user.id, {
      title: t('push.test.title'),
      body: t('push.test.body'),
      link: '/dashboard/notifications/preferences',
      data: { type: 'push.test' },
    }, { urgent: true })
    return NextResponse.json({ ok: sent > 0, sent })
  } catch (e) {
    console.error('[push/test] failed:', (e as Error)?.message)
    return NextResponse.json({ error: 'Could not send a test notification' }, { status: 500 })
  }
}
