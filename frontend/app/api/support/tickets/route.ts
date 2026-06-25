import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { supportTickets, newId, nowIso } from '@/lib/db/misc'

export async function GET(_req: NextRequest) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  try {
    const col = await supportTickets()
    const list = await col
      .find({ user_id: gate.user.id })
      .sort({ created_at: -1 })
      .toArray()
    return NextResponse.json(list)
  } catch (error) {
    console.error('[CodeSpectra] Support tickets fetch error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  try {
    const body = (await req.json()) as { title?: string; description?: string; priority?: string }
    const doc = {
      id: newId(),
      user_id: gate.user.id,
      title: body.title ?? '',
      description: body.description ?? '',
      priority: body.priority ?? 'medium',
      status: 'open',
      created_at: nowIso(),
    }
    const col = await supportTickets()
    await col.insertOne(doc as unknown as Parameters<typeof col.insertOne>[0])
    return NextResponse.json(doc)
  } catch (error) {
    console.error('[CodeSpectra] Support ticket creation error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
