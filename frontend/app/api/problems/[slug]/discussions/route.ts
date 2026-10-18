import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { problems } from '@/lib/db/problems'
import { checkProblemAccess, packLockedError } from '@/lib/entitlements'
import type { APIUser } from '@/lib/route-auth'

/** Discussions can carry solutions, so a pack-locked problem's thread is locked too. */
async function packGate(user: APIUser, slug: string): Promise<NextResponse | null> {
  try {
    const doc = await (await problems()).findOne({ slug }, { projection: { id: 1, slug: 1, topics: 1, created_by: 1 } })
    if (!doc) return null
    const access = await checkProblemAccess(user, doc, !!doc.created_by && doc.created_by === user.id)
    return access.locked ? NextResponse.json(packLockedError(access), { status: 402 }) : null
  } catch (e) {
    console.error('[discussions] pack access check failed:', e)
    return NextResponse.json({ error: 'Could not load discussions. Please try again.' }, { status: 503 })
  }
}

interface DiscussionDoc {
  id: string
  problem_slug: string
  user_id: string
  user_name: string
  content: string
  parent_id: string | null
  created_at: string
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { slug } = await ctx.params
  const locked = await packGate(gate.user, slug)
  if (locked) return locked

  try {
    const db = await getMongoDb()
    const list = await db
      .collection<DiscussionDoc>('problem_discussions')
      .find({ problem_slug: slug })
      .sort({ created_at: -1 })
      .toArray()
    return NextResponse.json({ discussions: list })
  } catch {
    return NextResponse.json({ error: 'Failed to load discussions' }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { slug } = await ctx.params
  const locked = await packGate(gate.user, slug)
  if (locked) return locked

  try {
    const { content, parent_id = null } = (await req.json()) as {
      content?: string; parent_id?: string | null
    }
    if (!content?.trim()) return NextResponse.json({ error: 'Content required' }, { status: 400 })
    if (content.length > 5000) return NextResponse.json({ error: 'Content too long' }, { status: 400 })

    const db = await getMongoDb()
    const doc: DiscussionDoc = {
      id: crypto.randomUUID(),
      problem_slug: slug,
      user_id: gate.user.id,
      user_name: gate.user.fullName || gate.user.name || gate.user.email?.split('@')[0] || 'User',
      content: content.trim(),
      parent_id: parent_id || null,
      created_at: new Date().toISOString(),
    }
    await db.collection('problem_discussions').insertOne(doc)
    return NextResponse.json(doc, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to post comment' }, { status: 500 })
  }
}
