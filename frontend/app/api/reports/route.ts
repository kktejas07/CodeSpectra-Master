import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { notifySuperAdmins } from '@/lib/notifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** POST /api/reports — raise complaint or report issue on a listing. */
export async function POST(req: NextRequest) {
  try {
    const user = await getAPIUser()
    const body = await req.json().catch(() => ({}))
    const kind = body.kind === 'complaint' ? 'complaint' : body.kind === 'issue' ? 'issue' : null
    const entityType = String(body.entityType || '').trim().slice(0, 100)
    const entityId = String(body.entityId || '').trim().slice(0, 200)
    const entityTitle = String(body.entityTitle || '').trim().slice(0, 300)
    const message = String(body.message || '').trim().slice(0, 4000)
    const contactEmail = String(body.contactEmail || user?.email || '').trim().slice(0, 320)

    if (!kind) return NextResponse.json({ error: 'kind required' }, { status: 400 })
    if (!entityType || !entityId) return NextResponse.json({ error: 'entity required' }, { status: 400 })
    if (message.length < 8) return NextResponse.json({ error: 'Please add more detail' }, { status: 400 })

    const db = await getMongoDb()
    
    // Map to the platform_feedback schema + extra fields.
    // ponytail: content stays the raw message — the old baked-in
    // "Report for [type] title: ..." caption prefix is gone; context lives
    // in entityType/entityTitle/source which the admin UI renders as
    // "Regarding". Reporter identity is captured so the admin list never
    // falls back to showing a raw UID as a name.
    const doc = {
      type: kind === 'complaint' ? 'complaint' : 'bug', // Map 'issue' to 'bug' for Admin UI badge
      content: message,
      user_id: user?.id || null,
      user_name: user?.name || user?.fullName || null,
      user_email: user?.email || contactEmail || null,
      source: entityType || undefined,
      status: 'open',
      created_at: new Date().toISOString(),
      // Additional metadata
      original_kind: kind,
      entityType,
      entityId,
      entityTitle,
      contactEmail: contactEmail || null,
      userEmail: user?.email || null,
    }
    
    await db.collection('platform_feedback').insertOne(doc)
    
    // Notify superadmins
    await notifySuperAdmins({
      type: 'system.feedback_received',
      title: 'New Feedback Received',
      message: `${kind === 'complaint' ? 'Complaint' : 'Issue'} reported for ${entityTitle}`,
    })
    
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[POST /api/reports]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
