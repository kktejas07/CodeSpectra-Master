import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-client'

/**
 * POST /api/apply-fix
 * Apply a suggested fix to the codebase
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { fix_id } = body

    if (!fix_id) {
      return NextResponse.json(
        { success: false, error: 'Fix ID is required' },
        { status: 400 }
      )
    }

    // Get the fix details
    const { data: fix, error: fetchError } = await supabase
      .from('suggested_fixes')
      .select('*')
      .eq('id', fix_id)
      .single()

    if (fetchError || !fix) {
      return NextResponse.json(
        { success: false, error: 'Fix not found' },
        { status: 404 }
      )
    }

    // Update fix status to applied
    const { error: updateError } = await supabase
      .from('suggested_fixes')
      .update({
        status: 'applied',
        applied_at: new Date(),
      })
      .eq('id', fix_id)

    if (updateError) {
      return NextResponse.json(
        { success: false, error: updateError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Fix applied successfully',
      fix: {
        id: fix.id,
        original_code: fix.original_code,
        suggested_code: fix.suggested_code,
        status: 'applied',
      },
    })
  } catch (error) {
    console.error('[v0] Apply fix error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to apply fix' },
      { status: 500 }
    )
  }
}
