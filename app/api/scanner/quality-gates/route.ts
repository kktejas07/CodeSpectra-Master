import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId') || 'default'

    const { data, error } = await supabase
      .from('quality_gates')
      .select('*')
      .eq('project_id', projectId)

    if (error) throw error

    return Response.json({
      success: true,
      gates: data || [],
    })
  } catch (error) {
    console.error('[API] Error fetching quality gates:', error)
    return Response.json(
      { success: false, error: 'Failed to fetch quality gates' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const {
      projectId = 'default',
      name,
      securityIssuesThreshold,
      reliabilityIssuesThreshold,
      maintainabilityIssuesThreshold,
      coverageThreshold,
      duplicationsThreshold,
    } = body

    if (!name) {
      return Response.json(
        { success: false, error: 'Gate name is required' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('quality_gates')
      .insert([
        {
          project_id: projectId,
          name,
          security_issues_threshold: securityIssuesThreshold || 0,
          reliability_issues_threshold: reliabilityIssuesThreshold || 0,
          maintainability_issues_threshold: maintainabilityIssuesThreshold || 5,
          coverage_threshold: coverageThreshold || 80,
          duplications_threshold: duplicationsThreshold || 3,
        },
      ])
      .select()

    if (error) throw error

    return Response.json({
      success: true,
      gate: data?.[0],
    })
  } catch (error) {
    console.error('[API] Error creating quality gate:', error)
    return Response.json(
      { success: false, error: 'Failed to create quality gate' },
      { status: 500 }
    )
  }
}
