/**
 * GET /api/newsletter/admin/recipient-count — count active subscribers.
 */
import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { newsletterSubscribers } from '@/lib/db/newsletter'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const gate = await requireSuperAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  try {
    const col = await newsletterSubscribers()
    const count = await col.countDocuments({ status: 'subscribed' })
    return NextResponse.json({ count })
  } catch (e) {
    console.error('[newsletter] count error:', e)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
