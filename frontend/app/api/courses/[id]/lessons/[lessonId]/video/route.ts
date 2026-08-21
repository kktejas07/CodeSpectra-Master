import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { lessonVideoPlayback } from '@/lib/courses/lesson-mp4'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; lessonId: string }> }
) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const { id: courseId, lessonId } = await params
  const video = await lessonVideoPlayback(courseId, lessonId)
  if (!video) return NextResponse.json({ error: 'Video not found' }, { status: 404 })

  if (video.kind === 'redirect') {
    return NextResponse.redirect(video.url, 302)
  }

  return new NextResponse(new Uint8Array(video.data), {
    headers: {
      'Content-Type': video.mime,
      'Content-Length': String(video.data.length),
      'Cache-Control': 'private, max-age=3600',
      'Accept-Ranges': 'bytes',
    },
  })
}
