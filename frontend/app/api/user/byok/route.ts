/**
 * GET  /api/user/byok — returns { has_key: boolean, provider?: string }
 * POST /api/user/byok — save { api_key: string }
 * DELETE /api/user/byok — remove stored key
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { saveByokKey, deleteByokKey, hasByokKey } from '@/lib/byok'
import { getMongoDb } from '@/lib/mongodb'

export async function GET() {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const has_key = await hasByokKey(user.id)
  let provider: string | undefined
  if (has_key) {
    const db = await getMongoDb()
    const doc = await db.collection('user_byok').findOne({ user_id: user.id }, { projection: { provider: 1 } })
    provider = (doc?.provider as string) || undefined
  }

  return NextResponse.json({ has_key, provider })
}

export async function POST(req: NextRequest) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { api_key?: string }
  try {
    body = (await req.json()) as { api_key?: string }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.api_key) return NextResponse.json({ error: 'api_key required' }, { status: 400 })

  const result = await saveByokKey(user.id, body.api_key)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 })

  return NextResponse.json({ ok: true, provider: result.provider })
}

export async function DELETE() {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await deleteByokKey(user.id)
  return NextResponse.json({ ok: true })
}
