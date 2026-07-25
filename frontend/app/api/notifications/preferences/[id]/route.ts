import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/api-auth'
import { getMongoDb } from '@/lib/mongodb'
import { notificationPreferences } from '@/lib/db/admin'
import type { IdRouteContext } from '@/lib/app-route-context'

export async function PATCH(req: NextRequest, { params }: IdRouteContext) {
  const { id } = await params
  try {
    const user = await getAPIUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const col = await notificationPreferences()

    const filter: Record<string, unknown> = { user_id: user.id }
    if (id === 'email' || id === 'in_app' || id === 'slack') {
      filter._id = id
    } else {
      filter._id = (() => { try { const { ObjectId } = require('mongodb'); return new ObjectId(id) } catch { return id } })()
    }

    const existing = await col.findOne(filter)
    if (existing) {
      await col.updateOne(filter, { $set: { ...body, updated_at: new Date().toISOString() } })
    } else {
      await col.insertOne({ _id: id, user_id: user.id, ...body, updated_at: new Date().toISOString() })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[CodeSpectra] Preferences update error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
