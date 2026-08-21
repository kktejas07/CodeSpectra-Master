import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { loadLessonCaptions } from '@/lib/courses/lesson-captions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; lessonId: string }> }
) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const { id: courseId, lessonId } = await params
  const vtt = await loadLessonCaptions(courseId, lessonId)
  if (!vtt) return NextResponse.json({ error: 'Captions not found' }, { status: 404 })

  return new NextResponse(vtt, {
    headers: {
      'Content-Type': 'text/vtt; charset=utf-8',
      'Cache-Control': 'private, max-age=3600',
    },
  })
}
