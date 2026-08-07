import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { trackDeviceFingerprint, recordSecurityEvent } from '@/lib/db/security'
import { clientLimiterKeyFromRequest } from '@/lib/in-memory-rate-limit'
import { getMongoDb } from '@/lib/mongodb'

export const runtime = 'nodejs'

/**
 * POST /api/security/track
 * Records a device fingerprint against the current authenticated user.
 * Called after login/signup/session-restore so admins can see which device
 * each user uses, and so we can detect multi-account abuse (same device → many
 * accounts) and block risky fingerprints.
 */
export async function POST(request: NextRequest) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  try {
    const body = await request.json()
    const visitorId = typeof body.visitorId === 'string' ? body.visitorId.trim() : ''

    const ip = clientLimiterKeyFromRequest(request, null).replace(/^(ip:|u:)/, '')
    const userAgent = request.headers.get('user-agent') || undefined

    if (!visitorId) {
      return NextResponse.json({ ok: true, skipped: true })
    }

    // Reject tracking from a blocked device up front.
    const fpBlocked = await isFingerprintBlocked(visitorId)
    if (fpBlocked) {
      await recordSecurityEvent({
        type: 'auth.blocked_fingerprint',
        severity: 'critical',
        user_id: gate.user.id,
        email: gate.user.email,
        ip,
        visitorId,
        detail: 'Blocked device fingerprint attempted to sync',
        metadata: { userAgent },
      })
      return NextResponse.json({ ok: false, blocked: true }, { status: 403 })
    }

    const result = await trackDeviceFingerprint({
      visitorId,
      user_id: gate.user.id,
      email: gate.user.email,
      ip,
      user_agent: userAgent,
    })

    // Flag multi-account risk — the same device has signed into other accounts.
    if (result.multiAccountRisk) {
      await recordSecurityEvent({
        type: 'auth.multi_account',
        severity: 'warning',
        user_id: gate.user.id,
        email: gate.user.email,
        ip,
        visitorId,
        detail: 'Same device fingerprint used by multiple accounts',
        metadata: { userAgent },
      })
    }

    return NextResponse.json({ ok: true, multiAccountRisk: result.multiAccountRisk })
  } catch {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

async function isFingerprintBlocked(visitorId: string): Promise<boolean> {
  try {
    const db = await getMongoDb()
    const doc = await db.collection('device_fingerprints').findOne({ visitorId })
    return Boolean(doc?.is_blocked)
  } catch {
    return false
  }
}
