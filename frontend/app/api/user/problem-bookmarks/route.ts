import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const COL = 'problem_bookmarks'

export async function GET() {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })
  const db = await getMongoDb()
  const rows = await db.collection(COL).find({ userId: user.id }).sort({ createdAt: -1 }).toArray()
  return NextResponse.json({
    items: rows.map((r) => ({
      problemId: r.problemId,
      slug: r.slug,
      title: r.title,
      difficulty: r.difficulty || null,
      createdAt: r.createdAt,
    })),
  })
}

/** POST { problemId, slug, title, difficulty? } — toggle bookmark. */
export async function POST(req: NextRequest) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const problemId = String(body.problemId || body.slug || '').trim()
  const slug = String(body.slug || problemId).trim()
  const title = String(body.title || slug).trim()
  const difficulty = body.difficulty ? String(body.difficulty) : null
  if (!problemId) return NextResponse.json({ error: 'problemId required' }, { status: 400 })

  const db = await getMongoDb()
  const col = db.collection(COL)
  const existing = await col.findOne({ userId: user.id, problemId })
  if (existing) {
    await col.deleteOne({ _id: existing._id })
    return NextResponse.json({ saved: false })
  }
  await col.insertOne({
    userId: user.id,
    problemId,
    slug,
    title,
    difficulty,
    createdAt: new Date().toISOString(),
  })
  return NextResponse.json({ saved: true })
}
