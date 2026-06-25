import { NextRequest, NextResponse } from 'next/server'

type NormalizedGate = {
  min_quality_score: number
  max_bugs_count: number
  max_vulnerabilities_count: number
  max_code_smells_count: number
  min_test_coverage_percent: number
}

function num(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number.parseFloat(v) : NaN
  return Number.isFinite(n) ? n : fallback
}

function normalizeGateConfig(raw: unknown): NormalizedGate | null {
  if (!raw || typeof raw !== 'object') return null
  const g = raw as Record<string, unknown>
  return {
    min_quality_score: num(g.min_quality_score, 50),
    max_bugs_count: num(g.max_bugs_count ?? g.max_bugs, 0),
    max_vulnerabilities_count: num(g.max_vulnerabilities_count ?? g.max_vulnerabilities, 0),
    max_code_smells_count: num(g.max_code_smells_count ?? g.max_code_smells, 10),
    min_test_coverage_percent: num(g.min_test_coverage_percent ?? g.min_test_coverage_percentage, 50),
  }
}

/**
 * POST /api/check-quality-gate
 * Check if metrics pass the given gate thresholds (DB field names or API aliases).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const gate_config = normalizeGateConfig(body.gate_config)
    if (!gate_config) {
      return NextResponse.json(
        { success: false, error: 'Quality gate configuration required' },
        { status: 400 }
      )
    }

    const quality_score = num(body.quality_score, 0)
    const bugs_count = num(body.bugs_count, 0)
    const vulnerabilities_count = num(body.vulnerabilities_count, 0)
    const code_smells_count = num(body.code_smells_count, 0)
    const test_coverage_percent = num(body.test_coverage_percent, 0)

    const results = {
      passes: true,
      details: [] as Array<{
        metric: string
        current: number
        required?: number
        max?: number
        min?: number
        status: 'passed' | 'failed'
      }>,
    }

    if (quality_score < gate_config.min_quality_score) {
      results.passes = false
      results.details.push({
        metric: 'Quality Score',
        current: quality_score,
        required: gate_config.min_quality_score,
        status: 'failed',
      })
    } else {
      results.details.push({
        metric: 'Quality Score',
        current: quality_score,
        required: gate_config.min_quality_score,
        status: 'passed',
      })
    }

    if (bugs_count > gate_config.max_bugs_count) {
      results.passes = false
      results.details.push({
        metric: 'Bugs',
        current: bugs_count,
        max: gate_config.max_bugs_count,
        status: 'failed',
      })
    } else {
      results.details.push({
        metric: 'Bugs',
        current: bugs_count,
        max: gate_config.max_bugs_count,
        status: 'passed',
      })
    }

    if (vulnerabilities_count > gate_config.max_vulnerabilities_count) {
      results.passes = false
      results.details.push({
        metric: 'Vulnerabilities',
        current: vulnerabilities_count,
        max: gate_config.max_vulnerabilities_count,
        status: 'failed',
      })
    } else {
      results.details.push({
        metric: 'Vulnerabilities',
        current: vulnerabilities_count,
        max: gate_config.max_vulnerabilities_count,
        status: 'passed',
      })
    }

    if (code_smells_count > gate_config.max_code_smells_count) {
      results.passes = false
      results.details.push({
        metric: 'Code Smells',
        current: code_smells_count,
        max: gate_config.max_code_smells_count,
        status: 'failed',
      })
    } else {
      results.details.push({
        metric: 'Code Smells',
        current: code_smells_count,
        max: gate_config.max_code_smells_count,
        status: 'passed',
      })
    }

    if (test_coverage_percent < gate_config.min_test_coverage_percent) {
      results.passes = false
      results.details.push({
        metric: 'Test Coverage',
        current: test_coverage_percent,
        min: gate_config.min_test_coverage_percent,
        status: 'failed',
      })
    } else {
      results.details.push({
        metric: 'Test Coverage',
        current: test_coverage_percent,
        min: gate_config.min_test_coverage_percent,
        status: 'passed',
      })
    }

    return NextResponse.json({
      success: true,
      passes: results.passes,
      details: results.details,
      message: results.passes ? 'Code passes quality gate' : 'Code does not pass quality gate',
    })
  } catch (error) {
    console.error('[CodeSpectra] Check quality gate error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to check quality gate' },
      { status: 500 }
    )
  }
}
