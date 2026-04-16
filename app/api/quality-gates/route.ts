import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-client'

/**
 * GET /api/quality-gates
 * Retrieve user's quality gate configurations
 */
export async function GET(request: NextRequest) {
  try {
    const { data: gates, error } = await supabase
      .from('quality_gates')
      .select('*')
      .order('is_default', { ascending: false })

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      gates: gates || [],
    })
  } catch (error) {
    console.error('[v0] Fetch quality gates error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch quality gates' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/quality-gates
 * Create or update quality gate configuration
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      id,
      gate_name,
      description,
      min_quality_score,
      max_bugs_count,
      max_vulnerabilities_count,
      max_code_smells_count,
      min_test_coverage_percent,
      is_default,
      custom_rules,
    } = body

    if (!gate_name) {
      return NextResponse.json(
        { success: false, error: 'Gate name is required' },
        { status: 400 }
      )
    }

    let result
    if (id) {
      // Update existing gate
      result = await supabase
        .from('quality_gates')
        .update({
          gate_name,
          description,
          min_quality_score: min_quality_score || 70,
          max_bugs_count: max_bugs_count || 0,
          max_vulnerabilities_count: max_vulnerabilities_count || 0,
          max_code_smells_count: max_code_smells_count || 10,
          min_test_coverage_percent: min_test_coverage_percent || 50,
          custom_rules: custom_rules || {},
          is_active: true,
          updated_at: new Date(),
        })
        .eq('id', id)
        .select()
        .single()
    } else {
      // Create new gate
      result = await supabase
        .from('quality_gates')
        .insert({
          gate_name,
          description,
          min_quality_score: min_quality_score || 70,
          max_bugs_count: max_bugs_count || 0,
          max_vulnerabilities_count: max_vulnerabilities_count || 0,
          max_code_smells_count: max_code_smells_count || 10,
          min_test_coverage_percent: min_test_coverage_percent || 50,
          is_default: is_default || false,
          custom_rules: custom_rules || {},
          is_active: true,
        })
        .select()
        .single()
    }

    const { data, error } = result

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: `Quality gate ${id ? 'updated' : 'created'} successfully`,
      gate: data,
    })
  } catch (error) {
    console.error('[v0] Save quality gate error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to save quality gate' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/quality-gates
 * Delete a quality gate
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const gateId = searchParams.get('id')

    if (!gateId) {
      return NextResponse.json(
        { success: false, error: 'Gate ID is required' },
        { status: 400 }
      )
    }

    const { error } = await supabase
      .from('quality_gates')
      .delete()
      .eq('id', gateId)

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Quality gate deleted successfully',
    })
  } catch (error) {
    console.error('[v0] Delete quality gate error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to delete quality gate' },
      { status: 500 }
    )
  }
}
