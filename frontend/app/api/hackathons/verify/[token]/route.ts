import { NextResponse } from 'next/server'
import { getMongoDb } from '@/lib/mongodb'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params

  try {
    const db = await getMongoDb()
    // Find team by QR token (used as verification token)
    const team = await db.collection('hackathon_teams').findOne(
      { qr_token: token },
      { projection: { id: 1, name: 1, hackathon_id: 1, xp: 1, level: 1, members: 1 } },
    )
    if (!team) {
      return NextResponse.json({ valid: false, error: 'Certificate not found' }, { status: 404 })
    }

    const hk = await db.collection('hackathons').findOne(
      { id: team.hackathon_id },
      { projection: { id: 1, name: 1, slug: 1, results_released: true, released_at: 1 } },
    )
    if (!hk || !hk.results_released) {
      return NextResponse.json({ valid: false, error: 'Results not yet released' }, { status: 404 })
    }

    return NextResponse.json({
      valid: true,
      event: hk.name,
      team: team.name,
      members: team.members?.map((m: any) => m.name) || [],
      xp: team.xp,
      released_at: hk.released_at,
    })
  } catch {
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 })
  }
}
