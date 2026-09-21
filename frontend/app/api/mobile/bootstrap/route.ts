/**
 * GET /api/mobile/bootstrap — the entire mobile shell renders from this
 * document: user, role-gated tabs (minus DB-denied routes), theme tokens,
 * and flags. Any authenticated role may call it; it only ever reveals what
 * the caller is allowed to see.
 */
import { NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { buildBootstrap } from '@/lib/mobile/manifest'
import { getDeniedRoutesForRole } from '@/lib/mobile/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const mode = searchParams.get('mode') === 'light' ? 'light' : 'dark'

  const denied = await getDeniedRoutesForRole(user.role)

  // Badges: unread notifications on the profile tab. Best-effort — a badge
  // must never 500 the bootstrap.
  let unread = 0
  try {
    const db = await getMongoDb()
    unread = await db.collection('notifications').countDocuments({
      user_id: user.id,
      $or: [{ read: false }, { read: { $exists: false } }],
    })
  } catch { /* badge stays 0 */ }

  let maintenanceMode = false
  let faceEnrollmentRequired = false
  try {
    const db = await getMongoDb()
    const general = await db.collection('platform_settings').findOne({ key: 'general' })
    maintenanceMode = Boolean((general?.value as { maintenance_mode?: boolean } | undefined)?.maintenance_mode)
    const profile = await db.collection('user').findOne(
      { $or: [{ id: user.id }, { _id: user.id as never }] },
      { projection: { facial_biometric_template: 1 } },
    )
    faceEnrollmentRequired = user.role === 'user' && !profile?.facial_biometric_template
  } catch { /* flags stay false */ }

  return NextResponse.json(
    buildBootstrap({
      user: {
        id: user.id,
        email: user.email,
        name: user.name ?? user.fullName ?? null,
        role: user.role,
        tenantId: user.tenantId ?? null,
      },
      denied,
      badges: unread > 0 ? { profile: unread } : {},
      mode,
      faceEnrollmentRequired,
      maintenanceMode,
    }),
  )
}
