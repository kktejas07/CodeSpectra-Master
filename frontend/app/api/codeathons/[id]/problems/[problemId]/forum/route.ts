import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export const runtime = 'nodejs'

// GET: List forum posts for a problem
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; problemId: string }> }
): Promise<NextResponse> {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })

  const { id: codeathonId, problemId } = await params

  try {
    const db = await getMongoDb()
    const posts = await db.collection('codeathon_forum_posts')
      .find({ codeathon_id: codeathonId, problem_id: problemId, parent_id: null })
      .sort({ created_at: -1 })
      .limit(50)
      .toArray()

    // Get reply counts
    const postIds = posts.map(p => p.id)
    const replyCounts = await db.collection('codeathon_forum_posts')
      .aggregate([
        { $match: { parent_id: { $in: postIds } } },
        { $group: { _id: '$parent_id', count: { $sum: 1 } } },
      ])
      .toArray()
    const replyCountMap = new Map(replyCounts.map(r => [r._id, r.count]))

    // Get user names
    const userIds = [...new Set(posts.map(p => p.user_id))]
    const users = await db.collection('user')
      .find({ id: { $in: userIds } })
      .project({ id: 1, fullName: 1, email: 1 })
      .toArray()
    const userMap = new Map(users.map(u => [u.id, u]))

    const enrichedPosts = posts.map(p => ({
      ...p,
      user_name: userMap.get(p.user_id)?.fullName || userMap.get(p.user_id)?.email || 'Unknown',
      reply_count: replyCountMap.get(p.id) || 0,
    }))

    return NextResponse.json({ posts: enrichedPosts })
  } catch (e) {
    console.error('[Forum list]', e)
    return NextResponse.json({ error: 'Failed to load posts' }, { status: 500 })
  }
}

// POST: Create a new forum post
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; problemId: string }> }
): Promise<NextResponse> {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })

  const { id: codeathonId, problemId } = await params
  const body = await request.json() as { content: string; title?: string }

  if (!body.content?.trim()) {
    return NextResponse.json({ error: 'Content is required' }, { status: 400 })
  }

  try {
    const db = await getMongoDb()
    const post = {
      id: crypto.randomUUID(),
      codeathon_id: codeathonId,
      problem_id: problemId,
      user_id: user.id,
      title: body.title || '',
      content: body.content.trim(),
      parent_id: null,
      created_at: new Date().toISOString(),
    }
    await db.collection('codeathon_forum_posts').insertOne(post)

    return NextResponse.json({ post }, { status: 201 })
  } catch (e) {
    console.error('[Forum create]', e)
    return NextResponse.json({ error: 'Failed to create post' }, { status: 500 })
  }
}
