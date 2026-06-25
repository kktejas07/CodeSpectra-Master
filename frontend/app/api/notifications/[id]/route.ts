import { NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/api-auth'
import { notifications, nowIso } from '@/lib/db/admin'
import type { IdRouteContext } from '@/lib/app-route-context'

async function markRead(userId: string, id: string) {
  const col = await notifications()
  await col.updateOne(
    { id, user_id: userId },
    { $set: { is_read: true, read_at: nowIso() } },
  )
  return NextResponse.json({ success: true })
}

export async function POST(_req: Request, { params }: IdRouteContext) {
  const { id } = await params
  try {
    const user = await getAPIUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return await markRead(user.id, id)
  } catch (error) {
    console.error('[CodeSpectra] Mark notification read error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function PATCH(_req: Request, { params }: IdRouteContext) {
  const { id } = await params
  try {
    const user = await getAPIUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return await markRead(user.id, id)
  } catch (error) {
    console.error('[CodeSpectra] Mark notification read error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: IdRouteContext) {
  const { id } = await params
  try {
    const user = await getAPIUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const col = await notifications()
    await col.deleteOne({ id, user_id: user.id })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[CodeSpectra] Delete notification error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
