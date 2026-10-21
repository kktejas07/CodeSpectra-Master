import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export const runtime = 'nodejs'

// GET: List pending invitations for current user
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })

  const { id: codeathonId } = await params

  try {
    const db = await getMongoDb()
    const invitations = await db.collection('codeathon_invitations')
      .find({
        codeathon_id: codeathonId,
        invitee_id: user.id,
        status: 'pending',
      })
      .toArray()

    return NextResponse.json({ invitations })
  } catch (e) {
    console.error('[Invitations list]', e)
    return NextResponse.json({ error: 'Failed to list invitations' }, { status: 500 })
  }
}
