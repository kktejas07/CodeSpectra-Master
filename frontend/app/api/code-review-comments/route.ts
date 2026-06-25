import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/api-auth'
import { codeReviewComments, newId, nowIso } from '@/lib/db/misc'
import type { Filter } from 'mongodb'

interface CodeReviewComment {
  id?: string
  issue_id: string
  user_id: string
  content: string
  parent_comment_id?: string | null
  created_at?: string
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = new URL(request.url).searchParams
    const issueId = searchParams.get('issue_id')
    const parentCommentId = searchParams.get('parent_id')

    if (!issueId) {
      return NextResponse.json({ error: 'Issue ID is required' }, { status: 400 })
    }

    const col = await codeReviewComments()
    const filter: Filter<Record<string, unknown>> = { issue_id: issueId }
    filter.parent_comment_id = parentCommentId ? parentCommentId : null

    const comments = await col.find(filter).sort({ created_at: 1 }).toArray()
    return NextResponse.json(comments)
  } catch (error) {
    console.error('[CodeSpectra] Get comments error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch comments' },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAPIUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const body = (await request.json()) as CodeReviewComment
    if (!body.issue_id || !body.content) {
      return NextResponse.json(
        { error: 'Issue ID and content are required' },
        { status: 400 },
      )
    }

    const doc = {
      id: newId(),
      issue_id: body.issue_id,
      user_id: user.id,
      content: body.content,
      parent_comment_id: body.parent_comment_id || null,
      created_at: nowIso(),
    }
    const col = await codeReviewComments()
    await col.insertOne(doc)

    return NextResponse.json(doc, { status: 201 })
  } catch (error) {
    console.error('[CodeSpectra] Create comment error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create comment' },
      { status: 500 },
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getAPIUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const commentId = new URL(request.url).searchParams.get('id')
    if (!commentId) {
      return NextResponse.json({ error: 'Comment ID is required' }, { status: 400 })
    }

    const col = await codeReviewComments()
    await col.deleteOne({ id: commentId, user_id: user.id })
    return NextResponse.json({ message: 'Comment deleted' })
  } catch (error) {
    console.error('[CodeSpectra] Delete comment error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete comment' },
      { status: 500 },
    )
  }
}
