import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { suggestedFixes } from '@/lib/db/misc'

export async function POST(req: NextRequest) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  try {
    const { ids } = (await req.json()) as { ids: string[] }
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'No fix IDs provided' }, { status: 400 })
    }
    const col = await suggestedFixes()
    const now = new Date().toISOString()
    const result = await col.updateMany(
      { id: { $in: ids }, user_id: gate.user.id },
      { $set: { status: 'applied', applied_at: now } }
    )
    return NextResponse.json({ applied: result.modifiedCount })
  } catch (error) {
    console.error('[CodeSpectra] Error applying fix batch:', error)
    return NextResponse.json({ error: 'Failed to apply fixes' }, { status: 500 })
  }
}
