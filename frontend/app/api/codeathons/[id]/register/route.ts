import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import {
  codeathons,
  codeathonRegistrations,
  newId,
  nowIso,
} from '@/lib/db/content'
import type { IdRouteContext } from '@/lib/app-route-context'

export async function POST(request: Request, { params }: IdRouteContext) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  const { id } = await params
  try {
    const data = (await request.json().catch(() => ({}))) as { teamName?: string }

    const regCol = await codeathonRegistrations()
    const existing = await regCol.findOne({ codeathon_id: id, user_id: gate.user.id })
    if (existing) {
      return NextResponse.json({
        success: true,
        registrationId: existing.id,
        codeathonId: id,
        registeredAt: existing.registered_at,
        alreadyRegistered: true,
      })
    }

    const doc = {
      id: newId(),
      codeathon_id: id,
      user_id: gate.user.id,
      team_name: data.teamName ?? null,
      registered_at: nowIso(),
    }
    await regCol.insertOne(doc)

    // Increment participant counter.
    const codeCol = await codeathons()
    await codeCol.updateOne({ id }, { $inc: { participants: 1 } })

    return NextResponse.json({
      success: true,
      registrationId: doc.id,
      codeathonId: id,
      registeredAt: doc.registered_at,
    })
  } catch (error) {
    console.error('[CodeSpectra] codeathon register:', error)
    return NextResponse.json({ error: 'Failed to register for codeathon' }, { status: 400 })
  }
}
