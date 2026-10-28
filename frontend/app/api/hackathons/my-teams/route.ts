import { NextResponse, NextRequest } from 'next/server'
import { getAPIUser } from '@/lib/api-auth'
import { hackathons, hackathonTeams } from '@/lib/db/qr-events'

export const runtime = 'nodejs'

export async function GET(_req: NextRequest) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })

  const hkCol = await hackathons()
  const tkCol = await hackathonTeams()

  const myTeams = await tkCol
    .find({ 'members.user_id': user.id }, { projection: { _id: 0 } })
    .toArray()

  const teams = await Promise.all(
    myTeams.map(async (t) => {
      const hk = await hkCol.findOne({ id: t.hackathon_id }, { projection: { name: 1, slug: 1, starts_at: 1, ends_at: 1, status: 1 } })
      return { ...t, hackathon: hk || null }
    })
  )

  return NextResponse.json({ teams })
}