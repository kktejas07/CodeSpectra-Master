/**
 * Mentor studio. GET → seller status, profile, session types (with price / commission preview).
 * PUT { headline, bio, skills[], companies[], experience_years, languages[], linkedin_url?, avatar_url? }
 * → create/update the profile (new profiles wait for admin verification).
 * PATCH { listed: boolean } → show / hide in the /mentors directory.
 */
import type { NextRequest } from 'next/server'
import { bodyOf, errorResponse, json, userGate } from '@/lib/mentors/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const g = await userGate(req)
  if ('res' in g) return g.res
  try {
    const { studioView } = await import('@/lib/mentors/service')
    return json(await studioView(g.user.id))
  } catch (e) {
    return errorResponse(e, 'mentor studio')
  }
}

export async function PUT(req: NextRequest) {
  const g = await userGate(req, { write: true })
  if ('res' in g) return g.res
  try {
    const { saveProfile } = await import('@/lib/mentors/service')
    return json({ profile: await saveProfile(g.user.id, await bodyOf(req)) })
  } catch (e) {
    return errorResponse(e, 'mentor profile')
  }
}

export async function PATCH(req: NextRequest) {
  const g = await userGate(req, { write: true })
  if ('res' in g) return g.res
  try {
    const b = await bodyOf(req)
    if (typeof b.listed !== 'boolean') return json({ error: 'Send { listed: true | false }' }, 400)
    const { setListed } = await import('@/lib/mentors/service')
    await setListed(g.user.id, b.listed)
    return json({ ok: true })
  } catch (e) {
    return errorResponse(e, 'mentor listed')
  }
}
