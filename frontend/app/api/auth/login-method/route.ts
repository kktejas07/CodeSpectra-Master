import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { updateUserLastLogin } from '@/lib/db/admin'
import { createUserSession } from '@/lib/db/sessions'
import { clientLimiterKeyFromRequest } from '@/lib/in-memory-rate-limit'

/** POST /api/auth/login-method — record how the signed-in user last signed in. */
export async function POST(request: NextRequest) {
  try {
    const user = await getAPIUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { uid, method } = (await request.json().catch(() => ({}))) as { uid?: unknown; method?: unknown }
    if (typeof method !== 'string' || !['google', 'github', 'email', 'sso'].includes(method)) {
      return NextResponse.json({ error: 'Invalid method' }, { status: 400 })
    }
    if (uid !== undefined && uid !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await updateUserLastLogin(user.id, method as 'google' | 'github' | 'email' | 'sso')

    const ip = clientLimiterKeyFromRequest(request, null).replace(/^(ip:|u:)/, '')
    const ua = request.headers.get('user-agent') || 'Unknown device'
    createUserSession({ user_id: user.id, email: user.email, ip, user_agent: ua }).catch(() => {})

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[login-method] Error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
