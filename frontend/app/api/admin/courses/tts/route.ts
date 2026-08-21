import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import * as googleTTS from 'google-tts-api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/admin/courses/tts
// Generates audio from text using Google TTS (free, no API key needed)
export async function POST(request: NextRequest) {
  const user = await getAPIUser()
  if (!user || user.role !== 'superadmin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { text, lang = 'en', slow = false } = await request.json()

    if (!text) {
      return NextResponse.json({ error: 'text is required' }, { status: 400 })
    }

    // Google TTS has a 200 char limit per request, so we split long text
    const chunks = splitText(text, 190)
    const buffers: Buffer[] = []

    for (const chunk of chunks) {
      try {
        const result = await googleTTS.getAllAudioBase64(chunk, {
          lang,
          slow,
          host: 'https://translate.google.com',
          timeout: 10000,
        })
        for (const r of result) {
          buffers.push(Buffer.from(r.base64, 'base64'))
        }
      } catch (e) {
        console.warn('[tts] chunk failed:', e)
      }
    }

    if (buffers.length === 0) {
      return NextResponse.json({ error: 'TTS generation failed' }, { status: 500 })
    }

    const combined = Buffer.concat(buffers)
    const audioBase64 = combined.toString('base64')

    return NextResponse.json({
      success: true,
      audioUrl: `data:audio/mpeg;base64,${audioBase64}`,
      duration: estimateDuration(text),
    })

  } catch (e) {
    console.error('[tts] error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// Split text into chunks at sentence boundaries
function splitText(text: string, maxLen: number): string[] {
  const sentences = text.replace(/([.!?])\s+/g, '$1|').split('|')
  const chunks: string[] = []
  let current = ''

  for (const sentence of sentences) {
    if ((current + ' ' + sentence).trim().length > maxLen) {
      if (current) chunks.push(current.trim())
      current = sentence
    } else {
      current = current ? current + ' ' + sentence : sentence
    }
  }
  if (current.trim()) chunks.push(current.trim())
  return chunks
}

// Estimate audio duration from word count (~150 words per minute)
function estimateDuration(text: string): number {
  const words = text.split(/\s+/).length
  return Math.round((words / 150) * 60)
}
