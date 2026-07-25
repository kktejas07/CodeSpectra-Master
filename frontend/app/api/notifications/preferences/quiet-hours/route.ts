import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/api-auth'
import { getMongoDb } from '@/lib/mongodb'

export async function PUT(req: NextRequest) {
  const user = await getAPIUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const { quietStart, quietEnd } = body as { quietStart?: string; quietEnd?: string }

  if (!quietStart || !quietEnd) {
    return NextResponse.json({ error: 'quietStart and quietEnd are required' }, { status: 400 })
  }

  const db = await getMongoDb()
  await db.collection('notification_preferences').updateOne(
    { user_id: user.id, _id: 'quiet_hours' as any },
    {
      $set: {
        user_id: user.id,
        _id: 'quiet_hours',
        quietStart,
        quietEnd,
        updated_at: new Date().toISOString(),
      } as any,
    },
    { upsert: true },
  )

  return NextResponse.json({ success: true })
}