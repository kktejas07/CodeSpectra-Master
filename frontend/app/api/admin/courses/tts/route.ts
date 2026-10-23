import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin, gateErrorBody } from '@/lib/route-auth'
import { synthesizeTts, estimateSpokenSeconds } from '@/lib/courses/tts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const gate = await requireSuperAdmin() // SEC-029: enforces admin 2FA
  if ('error' in gate) return NextResponse.json(gateErrorBody(gate), { status: gate.status })

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
    return NextResponse.json({ error: 'Something went wrong. Please try again.', code: 'server_error' }, { status: 500 })
  }
}
