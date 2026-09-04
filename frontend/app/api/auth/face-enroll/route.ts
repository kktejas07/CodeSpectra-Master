import { NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { getUserById } from '@/lib/db/admin'
import { writeAuditLog } from '@/lib/db/misc'
import { clientLimiterKeyFromRequest } from '@/lib/in-memory-rate-limit'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const user = await getAPIUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { descriptor } = await request.json()

    if (!descriptor || !Array.isArray(descriptor) || descriptor.length !== 128) {
      return NextResponse.json({ error: 'Invalid biometric descriptor format. Expected 128-dimensional array.' }, { status: 400 })
    }

    // ponytail: signup stores `_id` as a UUID string. Passing that UUID to the
    // BSON ObjectId constructor throws (500) for every email-signup user.
    // Look up via getUserById, then update by the actual `_id`.
    const profile = await getUserById(user.id)
    if (!profile) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 })
    }

    const db = await getMongoDb()
    const result = await db.collection('user').updateOne(
      { _id: profile._id } as any,
      {
        $set: {
          facial_biometric_template: descriptor,
          biometric_enrolled_at: new Date(),
        },
      },
    )
    if (result.matchedCount === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 })
    }

    const actorIp = clientLimiterKeyFromRequest(request, null).replace(/^(ip:|u:)/, '')
    await writeAuditLog({
      action: 'auth.biometric_enroll',
      outcome: 'success',
      actor: user.email,
      actorIp,
      resource: 'user/' + user.id,
      resourceType: 'auth',
      severity: 'info',
      user_id: user.id,
      detail: 'User enrolled 3D facial biometric template'
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[FaceEnroll] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
