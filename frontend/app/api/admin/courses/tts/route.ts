import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { synthesizeTts, estimateSpokenSeconds } from '@/lib/courses/tts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const user = await getAPIUser()
  if (!user || user.role !== 'superadmin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { text, lang = 'en' } = await request.json()
    if (!text) return NextResponse.json({ error: 'text is required' }, { status: 400 })

    const combined = await synthesizeTts(text)
    return NextResponse.json({
      success: true,
      audioUrl: `data:audio/mpeg;base64,${combined.toString('base64')}`,
      duration: estimateSpokenSeconds(text),
      lang,
    })
  } catch (e) {
    console.error('[tts] error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
