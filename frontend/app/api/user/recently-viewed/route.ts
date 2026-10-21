import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const COL = 'user_recently_viewed'
const MAX = 50

/** GET — recent items for the logged-in user. */
export async function GET() {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })
  const db = await getMongoDb()
  const items = await db
    .collection(COL)
    .find({ userId: user.id })
    .sort({ viewedAt: -1 })
    .limit(MAX)
    .toArray()
  return NextResponse.json({
    items: items.map((r) => ({
      type: r.type,
      id: r.itemId,
      title: r.title,
      href: r.href,
      viewedAt: r.viewedAt,
    })),
  })
}

/** POST { type, id, title, href } — record a view. */
export async function POST(req: NextRequest) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const type = String(body.type || '').trim()
  const id = String(body.id || '').trim()
  const title = String(body.title || id).trim()
  const href = String(body.href || '').trim()
  if (!type || !id || !href) return NextResponse.json({ error: 'type, id, href required' }, { status: 400 })

  const db = await getMongoDb()
  const col = db.collection(COL)
  await col.updateOne(
    { userId: user.id, type, itemId: id },
    {
      $set: {
        userId: user.id,
        type,
        itemId: id,
        title,
        href,
        viewedAt: new Date().toISOString(),
      },
    },
    { upsert: true },
  )
  // Trim oldest beyond MAX
  const extras = await col.find({ userId: user.id }).sort({ viewedAt: -1 }).skip(MAX).project({ _id: 1 }).toArray()
  if (extras.length) await col.deleteMany({ _id: { $in: extras.map((e) => e._id) } })
  return NextResponse.json({ ok: true })
}

/** DELETE — clear history (?type=&id= removes one entry, no params clears all). */
export async function DELETE(req: NextRequest) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })
  const type = req.nextUrl.searchParams.get('type')?.trim()
  const id = req.nextUrl.searchParams.get('id')?.trim()
  const db = await getMongoDb()
  const col = db.collection(COL)
  if (type && id) {
    await col.deleteOne({ userId: user.id, type, itemId: id })
  } else {
    await col.deleteMany({ userId: user.id })
  }
  return NextResponse.json({ ok: true })
}
