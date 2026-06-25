import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { listScansWithMetrics } from '@/lib/db/scans'

/**
 * POST /api/reports/generate
 * Lightweight scan summary report — aggregates recent `code_scans` + `code_metrics`.
 */
export async function POST(): Promise<NextResponse> {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ success: false, error: gate.error }, { status: gate.status })
  }

  try {
    const rows = await listScansWithMetrics(gate.user.id, { limit: 40 })

    let sumQ = 0
    let nQ = 0
    let bugs = 0
    let vulns = 0
    let smells = 0
    for (const s of rows) {
      const m = s.code_metrics
      if (m) {
        if (typeof m.overall_quality_score === 'number') {
          sumQ += m.overall_quality_score
          nQ += 1
        }
        bugs += Number(m.bugs ?? 0)
        vulns += Number(m.vulnerabilities ?? 0)
        smells += Number(m.code_smells ?? 0)
      }
    }

    return NextResponse.json({
      success: true,
      generated_at: new Date().toISOString(),
      window: { scans_considered: rows.length },
      aggregates: {
        avg_quality_score: nQ ? Math.round(sumQ / nQ) : null,
        total_bugs: bugs,
        total_vulnerabilities: vulns,
        total_code_smells: smells,
      },
      recent_scans: rows.map((s) => ({
        id: s.id,
        created_at: s.created_at,
        scan_type: s.scan_type,
        language: s.language,
        repo: s.github_repo_name ?? null,
        file: s.file_path ?? null,
      })),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
