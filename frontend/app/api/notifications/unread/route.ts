import { NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const user = await getAPIUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { getUnreadCount } = await import('@/lib/notifications')
    const count = await getUnreadCount(user.id)
    return NextResponse.json({ count })
  } catch (error) {
    console.error('[notifications/unread]', error)
    return NextResponse.json({ error: 'Something went wrong with notifications. Try again.' }, { status: 500 })
  }
}
