import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireSuperAdmin } from '@/lib/route-auth'
import { users as getUsersCollection } from '@/lib/db/admin'
import { setSessionCookie } from '@/lib/session'
import { normalizeUserRole } from '@/lib/rbac'
import { accountBlockReason } from '@/lib/auth-account'
import { auditAdmin } from '@/lib/admin-audit'

function cookieStoreHasImpersonation(store: Awaited<ReturnType<typeof cookies>>): boolean {
  return !!store.get('codespectra_impersonator')?.value
}

const SESSION_COOKIE = 'codespectra_session'
const IMPERSONATOR_COOKIE = 'codespectra_impersonator'
const IMPERSONATING_COOKIE = 'codespectra_impersonating'
// SEC-010: an impersonation lasts at most one hour (token + cookies), so a
// forgotten "view as" can't leave the browser signed in as the user for a week.
const MAX_AGE = 60 * 60

// The impersonator cookie holds the admin's REAL session token — it must be
// httpOnly so JS can never read it. The flag cookie is public so the client
// can pause its Firebase heartbeat while impersonating.
const impersonatorCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  secure: process.env.NODE_ENV === 'production',
  maxAge: MAX_AGE,
}

const flagCookieOptions = {
  httpOnly: false,
  sameSite: 'lax' as const,
  path: '/',
  secure: process.env.NODE_ENV === 'production',
  maxAge: MAX_AGE,
}

/** GET /api/admin/impersonate — is the current session an impersonation? */
export async function GET() {
  const cookieStore = await cookies()
  const impersonating = cookieStore.get(IMPERSONATING_COOKIE)?.value === '1'
  return NextResponse.json({ impersonating })
}

/**
 * POST /api/admin/impersonate — superadmin logs in as another user.
 * Saves the admin's real session cookie and replaces the session with the
 * target user's. Call POST /api/admin/impersonate/stop to restore it.
 */
export async function POST(request: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  let body: { userId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const userId = (body.userId || '').trim()
  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 })
  }

  try {
    const userCol = await getUsersCollection()
    const target = await userCol.findOne({ $or: [{ _id: userId }, { id: userId }] } as any)
    if (!target) {
      return NextResponse.json({ error: 'User not found', code: 'user_not_found' }, { status: 404 })
    }

    // Privilege guard: never impersonate a fellow superadmin.
    if (normalizeUserRole(target.role as string | null | undefined) === 'superadmin') {
      return NextResponse.json({ error: 'Cannot impersonate a superadmin' }, { status: 403 })
    }
    if (accountBlockReason(target)) {
      return NextResponse.json({ error: 'This account is deactivated.' }, { status: 409 })
    }
    if (cookieStoreHasImpersonation(await cookies())) {
      return NextResponse.json({ error: 'Stop the current impersonation first.' }, { status: 409 })
    }

    const cookieStore = await cookies()
    const currentSession = cookieStore.get(SESSION_COOKIE)?.value
    if (!currentSession) {
      return NextResponse.json({ error: 'No active session to restore from' }, { status: 401 })
    }

    // Keep the admin's real session so "stop" can restore it exactly.
    cookieStore.set(IMPERSONATOR_COOKIE, currentSession, impersonatorCookieOptions)
    cookieStore.set(IMPERSONATING_COOKIE, '1', flagCookieOptions)

    await setSessionCookie(
      {
        uid: target.id || String(target._id),
        email: target.email || '',
        role: normalizeUserRole(target.role as string | null | undefined),
        imp: gate.user.id,
      },
      { maxAgeSec: MAX_AGE },
    )
    await auditAdmin(gate.user, 'admin.impersonate.start', 'user', `user/${target.id || String(target._id)}`, `email=${target.email}`, 'critical')

    return NextResponse.json({
      ok: true,
      user: {
        id: target.id || String(target._id),
        email: target.email,
        name: target.fullName || target.name || null,
      },
    })
  } catch (e: unknown) {
    const msg = 'Failed to impersonate'
    console.error('[CodeSpectra] admin/impersonate POST:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
