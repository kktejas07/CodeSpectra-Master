import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-client'

/**
 * GET /api/analysis-history
 * Retrieve user's code analysis history
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100)
    const offset = parseInt(searchParams.get('offset') || '0')
    const repoId = searchParams.get('repo_id')

    let query = supabase
      .from('code_analyses')
      .select('*')
      .order('analyzed_at', { ascending: false })
      .limit(limit)
      .offset(offset)

    if (repoId) {
      query = query.eq('github_repo_id', repoId)
    }

    const { data: analyses, error } = await query

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      analyses: analyses || [],
      count: analyses?.length || 0,
    })
  } catch (error) {
    console.error('[v0] Fetch analysis history error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch analysis history' },
      { status: 500 }
    )
  }
}
