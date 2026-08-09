import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { getGeneralSettings } from '@/lib/platform-general-settings-server'

export async function GET() {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  try {
    const db = await getMongoDb()
    const filter: Record<string, unknown> = gate.user.role === 'tenant_admin'
      ? (gate.user.tenantId ? { tenant_id: gate.user.tenantId } : { _id: null })
      : {}
    const data = await db.collection('codeathons').find(filter).toArray()
    return NextResponse.json({ data })
  } catch { return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}

export async function POST(request: Request) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  try {
    const body = await request.json()
    const db = await getMongoDb()
    const now = new Date().toISOString()
    const doc = {
      id: crypto.randomUUID(),
      title: body.title,
      description: body.description || '',
      startDate: body.startDate || '',
      endDate: body.endDate || '',
      status: body.status || 'upcoming',
      participants: 0,
      prizePool: body.prizePool || '',
      cert_template: body.cert_template || (await getGeneralSettings()).certificate_template,
      tenant_id: gate.user.tenantId || null,
      createdAt: now,
      updatedAt: now,
    }
    await db.collection('codeathons').insertOne(doc)
    return NextResponse.json(doc, { status: 201 })
  } catch { return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}

export async function DELETE(request: Request) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const db = await getMongoDb()
    await db.collection('codeathons').deleteOne({ id })
    return NextResponse.json({ ok: true })
  } catch { return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}
