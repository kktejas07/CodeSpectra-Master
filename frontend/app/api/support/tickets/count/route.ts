import { NextResponse } from 'next/server'
import { getMongoDb } from '@/lib/mongodb'
import { getAPIUser } from '@/lib/route-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })

  const db = await getMongoDb()
  const filter = user.role === 'superadmin'
    ? { status: 'open' }
    : { user_id: user.id, status: 'open' }
  const open = await db.collection('support_tickets').countDocuments(filter)
  return NextResponse.json({ open })
}
