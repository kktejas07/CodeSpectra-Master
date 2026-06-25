import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/api-auth'
import { notifications, newId, nowIso } from '@/lib/db/admin'

export async function GET() {
  try {
    const user = await getAPIUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const col = await notifications()
    const list = await col
      .find({ user_id: user.id })
      .sort({ created_at: -1 })
      .toArray()

    return NextResponse.json(list)
  } catch (error) {
    console.error('[CodeSpectra] Notifications fetch error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAPIUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const title = typeof body.title === 'string' ? body.title : 'Notification'
    const message = typeof body.message === 'string' ? body.message : ''
    const type = typeof body.type === 'string' ? body.type : 'info'

    const doc = {
      id: newId(),
      user_id: user.id,
      title,
      message,
      type,
      is_read: false,
      created_at: nowIso(),
    }

    const col = await notifications()
    await col.insertOne(doc)

    return NextResponse.json(doc)
  } catch (error) {
    console.error('[CodeSpectra] Notification creation error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
