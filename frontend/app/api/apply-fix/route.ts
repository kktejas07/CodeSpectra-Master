import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { codeScans } from '@/lib/db/scans'
import { suggestedFixes } from '@/lib/db/misc'

type ApplyAction = 'apply' | 'unapply'

function parseAction(body: { action?: unknown }): ApplyAction {
  const a = typeof body.action === 'string' ? body.action.trim().toLowerCase() : ''
  return a === 'unapply' ? 'unapply' : 'apply'
}

/**
 * POST /api/apply-fix — mark suggested fix(es) applied or unapply.
 * Phase 6 migration to MongoDB.
 */
export async function POST(request: NextRequest) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ success: false, error: gate.error }, { status: gate.status })
  }

  let body: { fix_id?: string; fix_ids?: unknown; action?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const action = parseAction(body)
  const isUnapply = action === 'unapply'

  const fixId = typeof body.fix_id === 'string' ? body.fix_id.trim() : ''
  const fixIdsRaw = Array.isArray(body.fix_ids) ? body.fix_ids : []
  const fixIds = fixIdsRaw
    .filter((x): x is string => typeof x === 'string' && x.length > 0)
    .map((x) => x.trim())
    .slice(0, 40)

  if (!fixId && fixIds.length === 0) {
    return NextResponse.json(
      { success: false, error: 'Provide fix_id or fix_ids (max 40)' },
      { status: 400 },
    )
  }

  const now = isUnapply ? null : new Date().toISOString()
  const appliedSet = isUnapply
    ? { applied: false, applied_at: null, applied_by: null }
    : { applied: true, applied_at: now, applied_by: gate.user.id }

  const fixesCol = await suggestedFixes()
  const scansCol = await codeScans()

  try {
    if (fixIds.length > 0) {
      const rows = await fixesCol.find({ id: { $in: fixIds } }).toArray()
      if (rows.length === 0) {
        return NextResponse.json({ success: false, error: 'Fix not found' }, { status: 404 })
      }

      const scanIds = [...new Set(rows.map((r) => r.scan_id as string))]
      const scans = await scansCol.find({ id: { $in: scanIds } }).toArray()
      const allowedScanIds = new Set(
        scans.filter((s) => s.user_id === gate.user.id).map((s) => s.id),
      )
      const allowedFixIds = rows
        .filter((r) => allowedScanIds.has(r.scan_id as string))
        .map((r) => r.id)

      if (allowedFixIds.length === 0) {
        return NextResponse.json({ success: false, error: 'Fix not found' }, { status: 404 })
      }

      await fixesCol.updateMany({ id: { $in: allowedFixIds } }, { $set: appliedSet })

      return NextResponse.json({
        success: true,
        message: isUnapply
          ? `${allowedFixIds.length} fix(es) unmarked`
          : `${allowedFixIds.length} fix(es) marked applied`,
        applied_count: allowedFixIds.length,
        applied_ids: allowedFixIds,
        action,
      })
    }

    const fix = await fixesCol.findOne({ id: fixId })
    if (!fix) {
      return NextResponse.json({ success: false, error: 'Fix not found' }, { status: 404 })
    }
    const scan = await scansCol.findOne({ id: fix.scan_id as string })
    if (!scan || scan.user_id !== gate.user.id) {
      return NextResponse.json({ success: false, error: 'Fix not found' }, { status: 404 })
    }

    await fixesCol.updateOne({ id: fixId }, { $set: appliedSet })

    return NextResponse.json({
      success: true,
      message: isUnapply ? 'Fix unmarked (undo apply)' : 'Fix applied successfully',
      action,
      fix: {
        id: fix.id,
        original_code: fix.original_code,
        suggested_code: fix.suggested_code,
        status: isUnapply ? 'pending' : 'applied',
      },
    })
  } catch (error) {
    console.error('[CodeSpectra] apply-fix:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed' },
      { status: 500 },
    )
  }
}
