import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { newId, nowIso } from '@/lib/db/ai'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: {
    session_kind?: string
    session_id?: string
    chunk_index?: number
    data?: string
    mime_type?: string
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.session_id || !body.session_kind || body.chunk_index === undefined || !body.data) {
    return NextResponse.json({ error: 'session_id, session_kind, chunk_index, and data required' }, { status: 400 })
  }

  const dataBuffer = Buffer.from(body.data, 'base64')
  const sizeBytes = dataBuffer.length

  // Reject chunks over 50MB to prevent abuse
  if (sizeBytes > 50 * 1024 * 1024) {
    return NextResponse.json({ error: 'Chunk too large (max 50MB)' }, { status: 413 })
  }

  try {
    const db = await getMongoDb()
    const doc = {
      id: newId(),
      user_id: user.id,
      session_kind: body.session_kind,
      session_id: body.session_id,
      chunk_index: body.chunk_index,
      data: body.data,
      mime_type: body.mime_type || 'video/webm',
      size: sizeBytes,
      created_at: nowIso(),
    }
    await db.collection('session_recordings').insertOne(doc)
    return NextResponse.json({ ok: true, id: doc.id, size: sizeBytes })
  } catch (e) {
    console.error('[session-recording] error:', e)
    return NextResponse.json({ error: 'Failed to save recording chunk' }, { status: 500 })
  }
}
