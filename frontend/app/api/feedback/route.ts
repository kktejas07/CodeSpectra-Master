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

    const parseResult = feedbackSchema.pick({ type: true, content: true, user_id: true, user_name: true, user_email: true, source: true }).safeParse(json)

    if (!parseResult.success) {
      return NextResponse.json({ error: parseResult.error.issues }, { status: 400 })
    }

    const data = parseResult.data

    const id = await insertFeedback({
      type: data.type as 'bug' | 'complaint' | 'suggestion' | 'other',
      content: data.content,
      user_id: data.user_id,
      // ponytail: prefer the authenticated session over client-sent values
      // (clients must not be able to impersonate another reporter).
      user_name: user?.name || user?.fullName || data.user_name,
      user_email: user?.email || data.user_email,
      source: typeof json.source === 'string' ? json.source.slice(0, 64) : undefined,
      status: 'open',
    })

    // Notify superadmins
    const { notifySuperAdmins } = await import('@/lib/notifications')
    await notifySuperAdmins({
      type: 'system.feedback_received',
      title: 'New Feedback Received',
      message: `A user has submitted a new ${data.type}.`,
      title_i18n: { key: 'admin.feedback.title' },
      message_i18n: { key: 'admin.feedback.message', params: { kind: String(data.type) } },
      link: '/dashboard/admin/feedback',
    })

    return NextResponse.json({ success: true, id })
  } catch (error: any) {
    console.error('Failed to submit feedback:', error)
    return NextResponse.json({ error: 'Internal server error', code: 'internal_error' }, { status: 500 })
  }
}
