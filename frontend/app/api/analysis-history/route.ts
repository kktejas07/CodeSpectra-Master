import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { listScansWithMetrics } from '@/lib/db/scans'
import type { ClientAnalysisPayload } from '@/lib/scanner-analysis-mapper'

type ScanWithMetrics = Awaited<ReturnType<typeof listScansWithMetrics>>[number]

function rowToClientScan(row: ScanWithMetrics) {
  const m = row.code_metrics
  const ts = row.completed_at || row.created_at
  const fromJson = m?.metrics_json as ClientAnalysisPayload | null | undefined

  if (fromJson && typeof fromJson === 'object' && 'quality' in fromJson) {
    const j = fromJson as ClientAnalysisPayload & {
      storedScanId?: string
      scannerLanguage?: string
    }
    return {
      ...j,
      id: row.id,
      timeMs: row.scan_duration_ms ?? j.timeMs ?? 0,
      timestamp: ts,
      language: j.scannerLanguage ?? row.language,
    }
  }

  return {
    id: row.id,
    quality: m?.overall_quality_score ?? 0,
    bugs: m?.bugs ?? 0,
    vulnerabilities: m?.vulnerabilities ?? 0,
    codeSmells: m?.code_smells ?? 0,
    securityHotspots: m?.security_hotspots ?? 0,
    duplicatePercentage: Number(m?.duplicated_code_percentage ?? 0),
    complexityScore: m?.complexity_score ?? 0,
    maintainabilityIndex: m?.maintainability_index ?? 0,
    testCoveragePercentage: Number(m?.test_coverage_percentage ?? 0),
    performance: '',
    bestPractices: [] as string[],
    issues: [] as ClientAnalysisPayload['issues'],
    suggestions: [] as string[],
    timeMs: row.scan_duration_ms ?? 0,
    timestamp: ts,
    language: row.language,
  }
}

/**
 * GET /api/analysis-history
 * Lists scans from MongoDB `code_scans` + `code_metrics` for the signed-in user.
 */
export async function GET(request: NextRequest) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json(
      { success: false, error: gate.error },
      { status: gate.status },
    )
  }

  const { searchParams } = new URL(request.url)
  const limit = Math.min(
    Math.max(parseInt(searchParams.get('limit') || '20', 10) || 20, 1),
    100,
  )
  const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10) || 0, 0)

  try {
    const rows = await listScansWithMetrics(gate.user.id, { limit, offset })
    const scans = rows.map(rowToClientScan)
    return NextResponse.json({ success: true, scans, count: scans.length })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[CodeSpectra] analysis-history:', msg)
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
