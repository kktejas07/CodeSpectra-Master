import { supabaseServer } from '@/lib/supabase-client'

/**
 * Initialize sample SonarQube data for demonstration
 */
export async function initializeSampleData(projectId: string = 'demo-project') {
  try {
    console.log('[v0] Initializing sample SonarQube data...')

    // 1. Create sample quality gate
    const { data: gateData, error: gateError } = await supabaseServer
      .from('quality_gates')
      .insert([
        {
          project_id: projectId,
          name: 'Production Ready',
          is_default: true,
          security_issues_threshold: 0,
          reliability_issues_threshold: 0,
          maintainability_issues_threshold: 5,
          coverage_threshold: 80.0,
          duplications_threshold: 3.0,
        },
      ])
      .select()

    if (gateError) console.error('[v0] Error creating gate:', gateError)
    else console.log('[v0] Quality gate created:', gateData?.[0])

    // 2. Create sample quality ratings
    const { data: ratingData, error: ratingError } = await supabaseServer
      .from('quality_ratings')
      .insert([
        {
          project_id: projectId,
          branch_name: 'main',
          security_rating: 'B',
          reliability_rating: 'C',
          maintainability_rating: 'B',
          quality_gate_status: 'PASSED',
          security_score: 7.5,
          reliability_score: 5.0,
          maintainability_score: 7.0,
        },
      ])
      .select()

    if (ratingError) console.error('[v0] Error creating rating:', ratingError)
    else console.log('[v0] Quality rating created:', ratingData?.[0])

    // 3. Create sample file metrics
    const { data: metricsData, error: metricsError } = await supabaseServer
      .from('file_metrics')
      .insert([
        {
          project_id: projectId,
          file_path: 'src/app/page.tsx',
          file_language: 'typescript',
          lines_of_code: 245,
          complexity: 8,
          bugs: 0,
          vulnerabilities: 0,
          code_smells: 2,
          coverage: 85.5,
          duplication: 2.1,
        },
        {
          project_id: projectId,
          file_path: 'src/components/scanner/quality-gate-dashboard.tsx',
          file_language: 'typescript',
          lines_of_code: 412,
          complexity: 12,
          bugs: 1,
          vulnerabilities: 0,
          code_smells: 5,
          coverage: 72.3,
          duplication: 4.5,
        },
      ])
      .select()

    if (metricsError) console.error('[v0] Error creating metrics:', metricsError)
    else console.log('[v0] File metrics created:', metricsData?.length)

    // 4. Create sample issues
    const { data: issuesData, error: issuesError } = await supabaseServer
      .from('code_issues')
      .insert([
        {
          project_id: projectId,
          file_path: 'src/app/page.tsx',
          line_number: 45,
          type: 'code_smell',
          severity: 'major',
          rule: 'cognitive-complexity',
          message: 'Refactor this function to reduce its Cognitive Complexity from 18 to the 15 allowed.',
          status: 'OPEN',
        },
        {
          project_id: projectId,
          file_path: 'src/components/scanner/quality-gate-dashboard.tsx',
          line_number: 120,
          type: 'bug',
          severity: 'critical',
          rule: 'potential-null-reference',
          message: 'Variable may be null or undefined.',
          status: 'OPEN',
        },
      ])
      .select()

    if (issuesError) console.error('[v0] Error creating issues:', issuesError)
    else console.log('[v0] Issues created:', issuesData?.length)

    // 5. Create activity timeline
    const { data: activitiesData, error: activitiesError } = await supabaseServer
      .from('code_scan_activities')
      .insert([
        {
          project_id: projectId,
          event_type: 'scan_completed',
          event_data: { scanId: 'scan-1', issuesFound: 15 },
        },
        {
          project_id: projectId,
          event_type: 'quality_gate_passed',
          event_data: { gateId: 'gate-1', branch: 'main' },
        },
      ])
      .select()

    if (activitiesError) console.error('[v0] Error creating activities:', activitiesError)
    else console.log('[v0] Activities created:', activitiesData?.length)

    console.log('[v0] Sample data initialization completed!')
    return { success: true }
  } catch (error) {
    console.error('[v0] Error initializing sample data:', error)
    return { success: false, error }
  }
}

/**
 * Clear all SonarQube data for a project
 */
export async function clearProjectData(projectId: string) {
  try {
    console.log('[v0] Clearing data for project:', projectId)

    await supabaseServer.from('code_scan_activities').delete().eq('project_id', projectId)
    await supabaseServer.from('code_issues').delete().eq('project_id', projectId)
    await supabaseServer.from('file_metrics').delete().eq('project_id', projectId)
    await supabaseServer.from('quality_ratings').delete().eq('project_id', projectId)
    await supabaseServer.from('quality_gates').delete().eq('project_id', projectId)

    console.log('[v0] Project data cleared')
    return { success: true }
  } catch (error) {
    console.error('[v0] Error clearing project data:', error)
    return { success: false, error }
  }
}
