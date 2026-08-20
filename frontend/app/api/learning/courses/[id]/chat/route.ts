import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { backendPost } from '@/lib/ai/backend'

export const runtime = 'nodejs'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const user = gate.user
  const resolved = await params
  const courseId = resolved.id

  let body: { message: string, lessonId?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  try {
    // Forward to internal backend API
    const data = await backendPost<Record<string, unknown>>(`/internal/learning/courses/${courseId}/chat`, {
      message: body.message,
      lesson_id: body.lessonId,
      user_id: user.id
    })
    return NextResponse.json(data)
  } catch (error: any) {
    console.error('Course Chat Error:', error)
    return NextResponse.json({ error: 'Failed to communicate with AI assistant.' }, { status: 500 })
  }
}
