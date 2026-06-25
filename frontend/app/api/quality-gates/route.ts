import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { qualityGates, newId, nowIso } from '@/lib/db/misc'
import { bodyToQualityGateRow, rowToQualityGateDTO } from '@/lib/quality-gate-dto'

/** GET /api/quality-gates — list the signed-in user's gate configurations. */
export async function GET() {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ success: false, error: gate.error }, { status: gate.status })
  }

  try {
    const col = await qualityGates()
    const data = await col
      .find({ user_id: gate.user.id })
      .sort({ is_default: -1, created_at: -1 })
      .toArray()
    const gates = data.map((r) => rowToQualityGateDTO(r as unknown as Record<string, unknown>))
    return NextResponse.json({ success: true, gates })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed' },
      { status: 500 },
    )
  }
}

/** POST /api/quality-gates — create or update a gate for the signed-in user. */
export async function POST(request: NextRequest) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ success: false, error: gate.error }, { status: gate.status })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const col = await qualityGates()

  const duplicateFrom =
    typeof body.duplicate_from_id === 'string' ? body.duplicate_from_id.trim() : ''
  if (duplicateFrom) {
    const src = await col.findOne({ id: duplicateFrom, user_id: gate.user.id })
    if (!src) {
      return NextResponse.json({ success: false, error: 'Gate not found' }, { status: 404 })
    }
    const dto = rowToQualityGateDTO(src as unknown as Record<string, unknown>)
    const baseName = dto.gate_name.replace(/ \(copy\)$/i, '').trim() || 'Gate'
    const dupBody: Record<string, unknown> = {
      gate_name: `${baseName} (copy)`,
      description: dto.description,
      min_quality_score: dto.min_quality_score,
      max_bugs_count: dto.max_bugs_count,
      max_vulnerabilities_count: dto.max_vulnerabilities_count,
      max_code_smells_count: dto.max_code_smells_count,
      min_test_coverage_percent: dto.min_test_coverage_percent,
      max_security_hotspots_count: dto.max_security_hotspots_count,
      max_duplicated_code_percentage: dto.max_duplicated_code_percentage,
      enforce_on_push: dto.enforce_on_push,
      standards: [...dto.standards],
      is_default: false,
      is_active: dto.is_active,
      custom_rules: { ...(dto.custom_rules ?? {}) },
    }
    const row = bodyToQualityGateRow(gate.user.id, dupBody, 'insert')
    const doc = { ...row, id: newId(), created_at: nowIso() }
    await col.insertOne(doc as unknown as Parameters<typeof col.insertOne>[0])
    return NextResponse.json({
      success: true,
      message: 'Quality gate duplicated',
      gate: rowToQualityGateDTO(doc as unknown as Record<string, unknown>),
    })
  }

  const id = typeof body.id === 'string' ? body.id : undefined
  const gateName = typeof body.gate_name === 'string' ? body.gate_name.trim() : ''
  if (!gateName) {
    return NextResponse.json({ success: false, error: 'Gate name is required' }, { status: 400 })
  }

  if (id) {
    const existing = await col.findOne({ id, user_id: gate.user.id })
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Gate not found' }, { status: 404 })
    }
    const row = bodyToQualityGateRow(gate.user.id, { ...body, gate_name: gateName }, 'update')
    await col.updateOne({ id, user_id: gate.user.id }, { $set: { ...row, updated_at: nowIso() } })
    const updated = await col.findOne({ id })
    return NextResponse.json({
      success: true,
      message: 'Quality gate updated successfully',
      gate: rowToQualityGateDTO(updated as unknown as Record<string, unknown>),
    })
  }

  const row = bodyToQualityGateRow(gate.user.id, { ...body, gate_name: gateName }, 'insert')
  const doc = { ...row, id: newId(), created_at: nowIso() }
  await col.insertOne(doc as unknown as Parameters<typeof col.insertOne>[0])
  return NextResponse.json({
    success: true,
    message: 'Quality gate created successfully',
    gate: rowToQualityGateDTO(doc as unknown as Record<string, unknown>),
  })
}

/** DELETE /api/quality-gates?id=… */
export async function DELETE(request: NextRequest) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ success: false, error: gate.error }, { status: gate.status })
  }

  const gateId = new URL(request.url).searchParams.get('id')
  if (!gateId) {
    return NextResponse.json({ success: false, error: 'Gate ID is required' }, { status: 400 })
  }
  const col = await qualityGates()
  const res = await col.deleteOne({ id: gateId, user_id: gate.user.id })
  if (res.deletedCount === 0) {
    return NextResponse.json({ success: false, error: 'Gate not found' }, { status: 404 })
  }
  return NextResponse.json({ success: true, message: 'Quality gate deleted successfully' })
}
