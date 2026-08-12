import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export const runtime = 'nodejs'

// GET: List replies for a post
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; problemId: string; postId: string }> }
): Promise<NextResponse> {
  const { postId } = await params

  try {
    const db = await getMongoDb()
    const replies = await db.collection('codeathon_forum_posts')
      .find({ parent_id: postId })
      .sort({ created_at: 1 })
      .toArray()

    // Get user names
    const userIds = [...new Set(replies.map(r => r.user_id))]
    const users = await db.collection('user')
      .find({ id: { $in: userIds } })
      .project({ id: 1, fullName: 1, email: 1 })
      .toArray()
    const userMap = new Map(users.map(u => [u.id, u]))

    const enrichedReplies = replies.map(r => ({
      ...r,
      user_name: userMap.get(r.user_id)?.fullName || userMap.get(r.user_id)?.email || 'Unknown',
    }))

    return NextResponse.json({ replies: enrichedReplies })
  } catch (e) {
    console.error('[Forum replies]', e)
    return NextResponse.json({ error: 'Failed to load replies' }, { status: 500 })
  }
}

// POST: Create a reply
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; problemId: string; postId: string }> }
): Promise<NextResponse> {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: codeathonId, problemId, postId } = await params
  const body = await request.json() as { content: string }

  if (!body.content?.trim()) {
    return NextResponse.json({ error: 'Content is required' }, { status: 400 })
  }

  try {
    const db = await getMongoDb()
    const reply = {
      id: crypto.randomUUID(),
      codeathon_id: codeathonId,
      problem_id: problemId,
      user_id: user.id,
      content: body.content.trim(),
      parent_id: postId,
      created_at: new Date().toISOString(),
    }
    await db.collection('codeathon_forum_posts').insertOne(reply)

    return NextResponse.json({ reply }, { status: 201 })
  } catch (e) {
    console.error('[Forum reply create]', e)
    return NextResponse.json({ error: 'Failed to create reply' }, { status: 500 })
  }
}
