import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/api-auth'
import { getMongoDb } from '@/lib/mongodb'
import { ObjectId } from 'mongodb'
import type { IdRouteContext } from '@/lib/app-route-context'

export async function PATCH(req: NextRequest, { params }: IdRouteContext) {
  const { id } = await params
  try {
    const user = await getAPIUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))

    const db = await getMongoDb()
    const result = await db.collection('notification_preferences').updateOne(
      { _id: ObjectId.isValid(id) ? new ObjectId(id) : id, user_id: user.id },
      { $set: body }
    )

    if (!result.matchedCount) {
      return NextResponse.json({ error: 'Notification preference not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[CodeSpectra] Preferences update error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
