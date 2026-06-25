import { NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/api-auth'
import { notifications, nowIso } from '@/lib/db/admin'

export async function POST() {
  try {
    const user = await getAPIUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const col = await notifications()
    await col.updateMany(
      { user_id: user.id, is_read: false },
      { $set: { is_read: true, read_at: nowIso() } },
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[CodeSpectra] Mark all notifications read error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
