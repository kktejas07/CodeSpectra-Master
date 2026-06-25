import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { integrations } from '@/lib/db/misc'
import type { IdRouteContext } from '@/lib/app-route-context'

export async function POST(_req: NextRequest, { params }: IdRouteContext) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  const { id } = await params
  try {
    const col = await integrations()
    await col.updateOne(
      { id, user_id: gate.user.id },
      { $set: { is_active: false } },
    )
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[CodeSpectra] Integration disconnect error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
