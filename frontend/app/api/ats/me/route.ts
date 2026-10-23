import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser, isSuperAdminCaller } from '@/lib/route-auth'
import { ATS_TENANT_COOKIE, listMyMemberships, resolveActorFor, tenantFromRequest } from '@/lib/ats/access'

/**
 * GET /api/ats/me[?tenant=] — the caller's hiring-team memberships and the
 * active one (sidebar + tenant switcher). `memberships: []` = not on any team.
 * POST /api/ats/me { tenant } — switch the active tenant (cookie).
 */
export async function GET(req: NextRequest) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })
  try {
    const [memberships, actor] = await Promise.all([listMyMemberships(user), resolveActorFor(user, tenantFromRequest(req))])
    return NextResponse.json(
      {
        memberships,
        current: actor ? { tenant_id: actor.tenantId, role: actor.role, client_id: actor.clientId } : null,
        superadmin: isSuperAdminCaller(user),
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  } catch (e) {
    console.error('[ats/me] GET failed:', e)
    return NextResponse.json({ memberships: [], current: null, superadmin: isSuperAdminCaller(user) })
  }
}

export async function POST(req: NextRequest) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })
  let tenant: unknown
  try { tenant = ((await req.json()) as { tenant?: unknown })?.tenant } catch { return NextResponse.json({ error: 'Invalid JSON', code: 'invalid_json' }, { status: 400 }) }
  if (typeof tenant !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(tenant)) return NextResponse.json({ error: 'Invalid tenant' }, { status: 400 })
  const actor = await resolveActorFor(user, tenant)
  if (!actor) return NextResponse.json({ error: "You're not on this organization's hiring team" }, { status: 403 })
  const res = NextResponse.json({ current: { tenant_id: actor.tenantId, role: actor.role, client_id: actor.clientId } })
  res.cookies.set(ATS_TENANT_COOKIE, actor.tenantId, { path: '/', sameSite: 'lax', httpOnly: true, secure: process.env.NODE_ENV === 'production', maxAge: 180 * 86_400 })
  return res
}
