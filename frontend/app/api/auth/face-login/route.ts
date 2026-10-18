import { NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getUserById, updateUserById } from '@/lib/db/admin'
import { writeAuditLog } from '@/lib/db/misc'
import { clientLimiterKeyFromRequest } from '@/lib/in-memory-rate-limit'
import { faceSignInAllowed } from '@/lib/auth-trusted-device'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function status(uid: string) {
  const p = (await getUserById(uid)) as Record<string, unknown> | null
  return {
    enrolled: !!p?.facial_biometric_template,
    enabled: p?.face_login_disabled !== true,
    available: faceSignInAllowed(p),
  }
}

/** GET /api/auth/face-login — { enrolled, enabled, available } for the signed-in user. */
export async function GET() {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(await status(user.id))
}

/** PATCH /api/auth/face-login — body { enabled: boolean } turns face sign-in on or off for this account. */
export async function PATCH(request: Request) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = (await request.json().catch(() => ({}))) as { enabled?: unknown }
  if (typeof body.enabled !== 'boolean') return NextResponse.json({ error: 'Choose on or off.' }, { status: 400 })
  try {
    await updateUserById(user.id, { face_login_disabled: !body.enabled } as never)
    await writeAuditLog({ action: body.enabled ? 'auth.face_login.enable' : 'auth.face_login.disable', outcome: 'success', actor: user.email, actorIp: clientLimiterKeyFromRequest(request, null).replace(/^(ip:|u:)/, ''), resource: 'user/' + user.id, resourceType: 'auth', severity: 'info', user_id: user.id }).catch(() => {})
    return NextResponse.json(await status(user.id))
  } catch (e) {
    console.error('[face-login] update failed:', e)
    return NextResponse.json({ error: 'Couldn’t save the setting.' }, { status: 500 })
  }
}
