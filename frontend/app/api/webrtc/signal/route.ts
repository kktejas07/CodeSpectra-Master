import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { newId, nowIso } from '@/lib/db/ai'
import { getMongoDb } from '@/lib/mongodb'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * WebRTC signaling server.
 * Handles offer/answer/ICE candidate exchange between interviewer and candidate.
 * Uses MongoDB for message persistence (no WebSocket needed — polling-based).
 */

interface SignalMessage {
  id: string
  room_id: string
  sender_id: string
  type: 'offer' | 'answer' | 'ice-candidate' | 'join' | 'leave' | 'chat'
  payload: unknown
  created_at: string
}

// POST: Send a signaling message
export async function POST(req: NextRequest): Promise<NextResponse> {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const body = await req.json().catch(() => ({})) as {
    room_id?: string
    type?: string
    payload?: unknown
  }

  if (!body.room_id || !body.type) {
    return NextResponse.json({ error: 'room_id + type required' }, { status: 400 })
  }

  const validTypes = ['offer', 'answer', 'ice-candidate', 'join', 'leave', 'chat']
  if (!validTypes.includes(body.type)) {
    return NextResponse.json({ error: `type must be one of: ${validTypes.join(', ')}` }, { status: 400 })
  }

  try {
    const db = await getMongoDb()
    const col = db.collection('webrtc_signals')

    const msg: SignalMessage = {
      id: newId(),
      room_id: body.room_id,
      sender_id: gate.user.id,
      type: body.type as SignalMessage['type'],
      payload: body.payload || null,
      created_at: nowIso(),
    }

    await col.insertOne(msg)

    return NextResponse.json({ ok: true, id: msg.id })
  } catch (e: unknown) {
    const msg = 'Signal send failed'
    console.error('[webrtc/signal]', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// GET: Poll for new signaling messages (since a given timestamp)
export async function GET(req: NextRequest): Promise<NextResponse> {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const roomId = req.nextUrl.searchParams.get('room_id') || ''
  const since = req.nextUrl.searchParams.get('since') || ''

  if (!roomId) {
    return NextResponse.json({ error: 'room_id required' }, { status: 400 })
  }

  try {
    const db = await getMongoDb()
    const col = db.collection('webrtc_signals')

    const query: Record<string, unknown> = {
      room_id: roomId,
      sender_id: { $ne: gate.user.id }, // Don't return own messages
    }
    if (since) {
      query.created_at = { $gt: since }
    }

    const messages = await col
      .find(query)
      .sort({ created_at: 1 })
      .limit(50)
      .toArray()

    // Clean up old signals (older than 1 hour)
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString()
    await col.deleteMany({ created_at: { $lt: oneHourAgo } })

    return NextResponse.json({ messages })
  } catch (e: unknown) {
    const msg = 'Signal fetch failed'
    console.error('[webrtc/signal]', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
