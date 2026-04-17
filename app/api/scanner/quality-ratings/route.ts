import { NextResponse, NextRequest } from 'next/server'
import { supabaseServer } from '@/lib/supabase-client'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
    const branch = searchParams.get('branch') || 'main'

    if (!projectId) {
      return NextResponse.json({ error: 'projectId required' }, { status: 400 })
    }

    const { data, error } = await supabaseServer
      .from('quality_ratings')
      .select('*')
      .eq('project_id', projectId)
      .eq('branch_name', branch)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single()

    if (error && error.code !== 'PGRST116') throw error

    return NextResponse.json({
      data: data || {
        security_rating: 'E',
        reliability_rating: 'E',
        maintainability_rating: 'E',
        quality_gate_status: 'NOT_COMPUTED',
      },
    })
  } catch (error) {
    console.error('[v0] Quality ratings error:', error)
    return NextResponse.json({ error: 'Failed to fetch ratings' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { data: { user }, error: authError } = await supabaseServer.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { projectId, branch = 'main', ratings } = body

    const { data, error } = await supabaseServer
      .from('quality_ratings')
      .upsert(
        {
          project_id: projectId,
          branch_name: branch,
          security_rating: ratings.security_rating,
          reliability_rating: ratings.reliability_rating,
          maintainability_rating: ratings.maintainability_rating,
          quality_gate_status: ratings.quality_gate_status,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'project_id,branch_name' }
      )
      .select()

    if (error) throw error

    return NextResponse.json(data?.[0])
  } catch (error) {
    console.error('[v0] Update ratings error:', error)
    return NextResponse.json({ error: 'Failed to update ratings' }, { status: 400 })
  }
}
