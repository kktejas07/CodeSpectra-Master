import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { getUserById } from '@/lib/db/admin'
import { auditAdmin } from '@/lib/admin-audit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Didit session ids are UUIDs; anything else never reaches the upstream URL. */
const SESSION_ID_RE = /^[A-Za-z0-9-]{8,64}$/

/**
 * GET /api/kyc/didit/session/[sessionId] — full Didit session (ID document and
 * face data). Superadmin, or a tenant admin for a session whose user belongs
 * to their own organisation (D27/E10). Every read is audited.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
): Promise<NextResponse> {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })
  if (user.role !== 'superadmin' && user.role !== 'tenant_admin') {
    return NextResponse.json({ error: 'Forbidden', code: 'forbidden' }, { status: 403 })
  }

  const { sessionId } = await params
  if (!SESSION_ID_RE.test(sessionId || '')) {
    return NextResponse.json({ error: 'Invalid session id' }, { status: 400 })
  }

  const db = await getMongoDb()
  const local = await db.collection('kyc_sessions').findOne({ id: sessionId }, { projection: { user_id: 1 } })
  if (!local) return NextResponse.json({ error: 'Not found', code: 'not_found' }, { status: 404 })

  if (user.role === 'tenant_admin') {
    const owner = local.user_id ? await getUserById(String(local.user_id)) : null
    const ownerTenant = (owner?.tenantId as string | null) ?? (owner?.organizationId as string | null) ?? null
    if (!user.tenantId || !ownerTenant || ownerTenant !== user.tenantId) {
      // Same answer as a missing session: don't confirm it exists.
      return NextResponse.json({ error: 'Not found', code: 'not_found' }, { status: 404 })
    }
  }

  let apiKey = process.env.DIDIT_API_KEY
  try {
    const settings = await db.collection('platform_settings').findOne({ key: 'kyc_providers' })
    if (settings?.value?.didit_api_key) apiKey = settings.value.didit_api_key
  } catch { /* use env fallback */ }
  if (!apiKey) return NextResponse.json({ error: 'Identity verification is not configured' }, { status: 503 })

  try {
    const res = await fetch(`https://verification.didit.me/v3/session/${encodeURIComponent(sessionId)}/`, {
      headers: { 'x-api-key': apiKey },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      console.error('[Didit session fetch] upstream', res.status)
      return NextResponse.json({ error: 'Could not load the verification session' }, { status: 502 })
    }
    const data = await res.json()
    await auditAdmin(user, 'admin.kyc.session_view', 'kyc', `kyc_session/${sessionId}`, `user/${String(local.user_id || '')}`)
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    console.error('[Didit session fetch]', e)
    return NextResponse.json({ error: 'Failed to fetch session details' }, { status: 500 })
  }
}
