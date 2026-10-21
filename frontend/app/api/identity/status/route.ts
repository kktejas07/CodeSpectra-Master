import { NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { identityVerifications } from '@/lib/db/ai'

export const runtime = 'nodejs'

export async function GET(): Promise<NextResponse> {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })

  const col = await identityVerifications()
  const latest = await col.findOne(
    { user_id: user.id },
    { sort: { created_at: -1 } }
  )

  if (!latest) {
    return NextResponse.json({ status: 'none', verified: false })
  }

  return NextResponse.json({
    status: latest.status,
    verified: latest.status === 'approved',
    id: latest.id,
    created_at: latest.created_at,
    reasoning: latest.result?.reasoning,
  })
}
