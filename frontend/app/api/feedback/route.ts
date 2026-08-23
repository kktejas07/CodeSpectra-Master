import { NextResponse } from 'next/server'
import { insertFeedback, feedbackSchema } from '@/lib/db/feedback'
import { getAPIUser } from '@/lib/route-auth'

export async function POST(req: Request) {
  try {
    const user = await getAPIUser()
    const json = await req.json()

    // Attach user ID if logged in
    if (user && !json.user_id) {
      json.user_id = user.id
    }

    const parseResult = feedbackSchema.pick({ type: true, content: true, user_id: true }).safeParse(json)

    if (!parseResult.success) {
      return NextResponse.json({ error: parseResult.error.issues }, { status: 400 })
    }

    const data = parseResult.data

    const id = await insertFeedback({
      type: data.type as 'bug' | 'complaint' | 'suggestion' | 'other',
      content: data.content,
      user_id: data.user_id,
      status: 'open',
    })

    return NextResponse.json({ success: true, id })
  } catch (error: any) {
    console.error('Failed to submit feedback:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
