import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** POST /api/reports — raise complaint or report issue on a listing. */
export async function POST(req: NextRequest) {
  try {
    const user = await getAPIUser()
    const body = await req.json().catch(() => ({}))
    const kind = body.kind === 'complaint' ? 'complaint' : body.kind === 'issue' ? 'issue' : null
    const entityType = String(body.entityType || '').trim()
    const entityId = String(body.entityId || '').trim()
    const entityTitle = String(body.entityTitle || '').trim()
    const message = String(body.message || '').trim()
    const contactEmail = String(body.contactEmail || user?.email || '').trim()

    if (!kind) return NextResponse.json({ error: 'kind required' }, { status: 400 })
    if (!entityType || !entityId) return NextResponse.json({ error: 'entity required' }, { status: 400 })
    if (message.length < 8) return NextResponse.json({ error: 'Please add more detail' }, { status: 400 })

    const db = await getMongoDb()
    const doc = {
      kind,
      entityType,
      entityId,
      entityTitle,
      message,
      contactEmail: contactEmail || null,
      userId: user?.id || null,
      userEmail: user?.email || null,
      status: 'open',
      createdAt: new Date().toISOString(),
    }
    await db.collection('listing_reports').insertOne(doc)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
