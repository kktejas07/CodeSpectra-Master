/**
 * POST /api/interview-sim/[id]/transcribe — server speech-to-text for voice
 * answers when the browser has no speech recognition (Deepgram, the same
 * provider the hiring bot screening uses). Body: the raw audio (WebM / Ogg /
 * MP4, ≤ 8 MB), header `x-language`. 501 when no Deepgram key is configured —
 * the page then asks the learner to type.
 */
import { NextRequest, NextResponse } from 'next/server'
import { limitRequest } from '@/lib/rate-limit'
import { SESSION_ID_RE, serverError, simUser } from '@/lib/interview-sim/http'
import { LANGUAGE_IDS } from '@/lib/interview-sim/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MAX_BYTES = 8 * 1048576

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await simUser()
  if ('res' in g) return g.res
  const { id } = await ctx.params
  if (!SESSION_ID_RE.test(id)) return NextResponse.json({ error: 'Interview not found.' }, { status: 404 })
  const limited = await limitRequest(req, 'interview-sim-stt', g.user.id, 30, 10 * 60_000)
  if (limited) return limited
  const mime = (req.headers.get('content-type') || '').split(';')[0].trim()
  if (!/^(audio|video)\/(webm|ogg|mp4|mpeg|wav)$/.test(mime)) return NextResponse.json({ error: 'Unsupported audio format.' }, { status: 415 })
  const lang = req.headers.get('x-language') || 'en-IN'
  if (!(LANGUAGE_IDS as readonly string[]).includes(lang)) return NextResponse.json({ error: 'Unsupported language.' }, { status: 400 })
  if (Number(req.headers.get('content-length') || 0) > MAX_BYTES) return NextResponse.json({ error: 'That answer is too long to transcribe. Keep answers under three minutes.' }, { status: 413 })
  try {
    const { getOwnSession, getSimSettings } = await import('@/lib/interview-sim/store')
    const [s, settings] = await Promise.all([getOwnSession(id, g.user.id), getSimSettings()])
    if (!s || s.status !== 'active') return NextResponse.json({ error: 'This interview is not running.' }, { status: 409 })
    if (!settings.allow_voice) return NextResponse.json({ error: 'Voice answers are switched off.' }, { status: 400 })
    const { getApiKey } = await import('@/lib/ai/get-api-key')
    const key = await getApiKey('deepgram')
    if (!key?.key) return NextResponse.json({ error: 'Speech-to-text is not set up. Type your answer instead.' }, { status: 501 })
    const audio = await req.arrayBuffer()
    if (!audio.byteLength) return NextResponse.json({ error: 'No audio was sent.' }, { status: 400 })
    if (audio.byteLength > MAX_BYTES) return NextResponse.json({ error: 'That answer is too long to transcribe. Keep answers under three minutes.' }, { status: 413 })
    const { transcribeAudio } = await import('@/lib/ats/screening/transcribe')
    const text = await transcribeAudio(key.key, audio, mime, lang, { feature: 'interview-sim-stt', userId: g.user.id })
    if (!text) return NextResponse.json({ error: 'We could not hear an answer. Try again closer to the microphone, or type it.' }, { status: 422 })
    return NextResponse.json({ text: text.slice(0, 6000) })
  } catch (e) {
    return serverError('transcribe', e)
  }
}
