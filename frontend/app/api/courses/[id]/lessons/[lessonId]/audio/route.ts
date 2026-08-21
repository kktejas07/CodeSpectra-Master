import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { lessonAudioPlayback } from '@/lib/courses/lesson-audio'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; lessonId: string }> }
) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const { id: courseId, lessonId } = await params
  const audio = await lessonAudioPlayback(courseId, lessonId)
  if (!audio) return NextResponse.json({ error: 'Audio not found' }, { status: 404 })

  if (audio.kind === 'redirect') {
    return NextResponse.redirect(audio.url, 302)
  }

  return new NextResponse(new Uint8Array(audio.data), {
    headers: {
      'Content-Type': audio.mime,
      'Content-Length': String(audio.data.length),
      'Cache-Control': 'private, max-age=3600',
      'Accept-Ranges': 'bytes',
    },
  })
}
