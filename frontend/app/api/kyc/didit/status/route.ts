import { NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export const runtime = 'nodejs'

export async function GET(): Promise<NextResponse> {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const db = await getMongoDb()

    // Get latest KYC session for this user
    const session = await db.collection('kyc_sessions')
      .findOne({ user_id: user.id }, { sort: { created_at: -1 } })

    // Get latest identity verification
    const verification = await db.collection('identity_verifications')
      .findOne({ user_id: user.id }, { sort: { created_at: -1 } })

    return NextResponse.json({
      kyc_status: session?.status || verification?.status || 'none',
      verified: session?.status === 'approved' || verification?.status === 'approved',
      provider: session?.provider || verification?.provider || null,
      session_id: session?.id || null,
      result: verification?.result || null,
      created_at: session?.created_at || verification?.created_at || null,
    })
  } catch (e) {
    console.error('[KYC status]', e)
    return NextResponse.json({ error: 'Failed to fetch status' }, { status: 500 })
  }
}
