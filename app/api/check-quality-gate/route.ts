import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/check-quality-gate
 * Check if an analysis result passes the configured quality gate
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      quality_score,
      bugs_count,
      vulnerabilities_count,
      code_smells_count,
      test_coverage_percent,
      gate_config,
    } = body

    if (!gate_config) {
      return NextResponse.json(
        { success: false, error: 'Quality gate configuration required' },
        { status: 400 }
      )
    }

    // Check each threshold
    const results = {
      passes: true,
      details: [] as any[],
    }

    // Quality Score Check
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

    // Bugs Check
    if (bugs_count > (gate_config.max_bugs_count || 0)) {
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

    // Vulnerabilities Check
    if (vulnerabilities_count > (gate_config.max_vulnerabilities_count || 0)) {
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

    // Code Smells Check
    if (code_smells_count > (gate_config.max_code_smells_count || 10)) {
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

    // Test Coverage Check
    if (test_coverage_percent < (gate_config.min_test_coverage_percent || 50)) {
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
      message: results.passes
        ? 'Code passes quality gate'
        : 'Code does not pass quality gate',
    })
  } catch (error) {
    console.error('[v0] Check quality gate error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to check quality gate' },
      { status: 500 }
    )
  }
}
