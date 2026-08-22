import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const COL = 'course_wishlists'

/** GET — list wishlist course ids for the logged-in user. */
export async function GET() {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const db = await getMongoDb()
    const rows = await db.collection(COL).find({ userId: user.id }).project({ courseId: 1 }).toArray()
    return NextResponse.json({ data: rows.map(r => String(r.courseId)) })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

/**
 * POST { courseId } — toggle wishlist.
 * Returns { saved: boolean }.
 */
export async function POST(request: NextRequest) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const body = await request.json().catch(() => ({}))
    const courseId = String(body?.courseId || '').trim()
    if (!courseId) return NextResponse.json({ error: 'courseId required' }, { status: 400 })

    const db = await getMongoDb()
    const col = db.collection(COL)
    const existing = await col.findOne({ userId: user.id, courseId })
    if (existing) {
      await col.deleteOne({ _id: existing._id })
      return NextResponse.json({ saved: false })
    }
    await col.updateOne(
      { userId: user.id, courseId },
      { $set: { userId: user.id, courseId, savedAt: new Date().toISOString() } },
      { upsert: true },
    )
    return NextResponse.json({ saved: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
