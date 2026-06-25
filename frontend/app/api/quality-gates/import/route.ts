import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/route-auth'
import { qualityGates, newId, nowIso } from '@/lib/db/misc'
import { bodyToQualityGateRow, rowToQualityGateDTO } from '@/lib/quality-gate-dto'

const gateImportSchema = z.object({
  gates: z
    .array(
      z.object({
        gate_name: z.string().min(1).max(200),
        description: z.string().max(4000).optional(),
        min_quality_score: z.number().optional(),
        max_bugs_count: z.number().optional(),
        max_vulnerabilities_count: z.number().optional(),
        max_code_smells_count: z.number().optional(),
        min_test_coverage_percent: z.number().optional(),
        max_security_hotspots_count: z.number().optional(),
        max_duplicated_code_percentage: z.number().optional(),
        is_active: z.boolean().optional(),
        enforce_on_push: z.boolean().optional(),
        standards: z.array(z.string()).optional(),
        custom_rules: z.record(z.string(), z.any()).optional(),
      }),
    )
    .min(1)
    .max(24),
})

export async function POST(request: NextRequest): Promise<NextResponse> {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ success: false, error: gate.error }, { status: gate.status })
  }

  let parsed: z.infer<typeof gateImportSchema>
  try {
    parsed = gateImportSchema.parse(await request.json())
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON or schema' }, { status: 400 })
  }

  const col = await qualityGates()
  const created: ReturnType<typeof rowToQualityGateDTO>[] = []
  for (const g of parsed.gates) {
    const body: Record<string, unknown> = { ...g, is_default: false }
    const row = bodyToQualityGateRow(gate.user.id, body, 'insert')
    const doc = { ...row, id: newId(), created_at: nowIso() }
    await col.insertOne(doc as unknown as Parameters<typeof col.insertOne>[0])
    created.push(rowToQualityGateDTO(doc as unknown as Record<string, unknown>))
  }

  return NextResponse.json({ success: true, created_count: created.length, gates: created })
}
