import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { lessonVideoMeta, lessonVideoPlayback } from '@/lib/courses/lesson-mp4'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function mediaHeaders(mime: string, bytes: number) {
  return {
    'Content-Type': mime,
    'Content-Length': String(bytes),
    'Cache-Control': 'private, max-age=3600',
    'Accept-Ranges': 'bytes',
  }
}

export async function HEAD(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; lessonId: string }> },
) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const { id: courseId, lessonId } = await params
  const meta = await lessonVideoMeta(courseId, lessonId)
  if (!meta) return NextResponse.json({ error: 'Video not found' }, { status: 404 })
  return new NextResponse(null, { status: 200, headers: mediaHeaders(meta.mime, meta.bytes) })
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; lessonId: string }> },
) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const { id: courseId, lessonId } = await params
  const video = await lessonVideoPlayback(courseId, lessonId)
  if (!video) return NextResponse.json({ error: 'Video not found' }, { status: 404 })

  return new NextResponse(new Uint8Array(video.data), {
    headers: mediaHeaders(video.mime, video.bytes),
  })
}
