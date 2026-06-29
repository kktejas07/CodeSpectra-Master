import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export async function GET() {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  try {
    const db = await getMongoDb()
    const userId = gate.user.id

    const scanCount = await db.collection('scan_comments').countDocuments({ user_id: userId })
    const reviewCount = await db.collection('code_review_comments').countDocuments({ user_id: userId })
    const fixCount = await db.collection('suggested_fixes').countDocuments({ user_id: userId })
    const integrationCount = await db.collection('integrations').countDocuments({ user_id: userId })

    const userDoc = await db.collection('user').findOne({ id: userId }) || {}
    const createdAt = userDoc?.createdAt || userDoc?.created_at

    return NextResponse.json({
      scans: scanCount,
      reviews: reviewCount,
      fixes: fixCount,
      integrations: integrationCount,
      memberSince: createdAt ? new Date(createdAt).toISOString() : null,
    })
  } catch (error) {
    console.error('[CodeSpectra] Error fetching user stats:', error)
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 })
  }
}
