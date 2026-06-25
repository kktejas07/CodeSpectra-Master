import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { qualityGates } from '@/lib/db/misc'
import { rowToQualityGateDTO } from '@/lib/quality-gate-dto'

export async function GET() {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ success: false, error: gate.error }, { status: gate.status })
  }

  try {
    const col = await qualityGates()
    const data = await col
      .find({ user_id: gate.user.id })
      .sort({ created_at: 1 })
      .toArray()
    const gates = data.map((r) => rowToQualityGateDTO(r as unknown as Record<string, unknown>))
    return NextResponse.json({ version: 1, exported_at: new Date().toISOString(), gates })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed' },
      { status: 500 },
    )
  }
}
