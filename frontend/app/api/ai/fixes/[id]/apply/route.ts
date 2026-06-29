import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { suggestedFixes } from '@/lib/db/misc'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  try {
    const col = await suggestedFixes()
    const result = await col.updateOne(
      { id, user_id: gate.user.id },
      { $set: { status: 'applied', applied_at: new Date().toISOString() } }
    )
    if (result.matchedCount === 0) {
      return NextResponse.json({ error: 'Fix not found' }, { status: 404 })
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[CodeSpectra] Error applying fix:', error)
    return NextResponse.json({ error: 'Failed to apply fix' }, { status: 500 })
  }
}
