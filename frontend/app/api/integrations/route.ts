import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { integrations, newId, nowIso } from '@/lib/db/misc'

export async function GET(_req: NextRequest) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  try {
    const col = await integrations()
    const list = await col.find({ user_id: gate.user.id }).toArray()
    return NextResponse.json(list)
  } catch (error) {
    console.error('[CodeSpectra] Integrations fetch error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  try {
    const body = (await req.json()) as Record<string, unknown>
    const doc = {
      id: newId(),
      user_id: gate.user.id,
      provider: body.provider,
      name: body.name,
      auth_token: body.auth_token,
      config: body.config ?? {},
      is_active: true,
      connected_at: nowIso(),
      created_at: nowIso(),
    }
    const col = await integrations()
    await col.insertOne(doc as unknown as Parameters<typeof col.insertOne>[0])
    return NextResponse.json(doc)
  } catch (error) {
    console.error('[CodeSpectra] Integration creation error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
