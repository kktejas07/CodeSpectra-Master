/**
 * POST /api/notifications/push-token  — register a device push token.
 * DELETE /api/notifications/push-token — remove a device push token.
 *
 * Auth required. Tokens are stored in the `push_tokens` collection and used
 * by `notify()` to fan out FCM push messages. Duplicate tokens for the same
 * user are de-duplicated.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { randomUUID } from 'node:crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function validToken(token: unknown): token is string {
  return typeof token === 'string' && token.length >= 20 && token.length <= 512
}

export async function POST(req: NextRequest) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  const userId = gate.user.id
  const body = await req.json().catch(() => ({})) as { token?: string; userId?: string }
  const token = body.token
  if (!validToken(token)) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 })
  }

  try {
    const db = await getMongoDb()
    const col = db.collection('push_tokens')
    const now = new Date().toISOString()

    // De-duplicate: same token registered on another account moves to this one.
    await col.deleteMany({ token, user_id: { $ne: userId } })

    const existing = await col.findOne({ user_id: userId, token })
    if (existing) {
      await col.updateOne({ _id: existing._id }, { $set: { updated_at: now } })
    } else {
      await col.insertOne({
        id: randomUUID(),
        user_id: userId,
        token,
        platform: 'web',
        created_at: now,
        updated_at: now,
      })
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[push-token] POST error:', e)
    return NextResponse.json({ error: 'Failed to save token' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  const userId = gate.user.id
  const body = await req.json().catch(() => ({})) as { token?: string }
  if (!validToken(body.token)) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 })
  }

  try {
    const db = await getMongoDb()
    await db.collection('push_tokens').deleteMany({ user_id: userId, token: body.token })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[push-token] DELETE error:', e)
    return NextResponse.json({ error: 'Failed to remove token' }, { status: 500 })
  }
}
