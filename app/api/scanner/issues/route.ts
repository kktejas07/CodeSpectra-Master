import { NextResponse, NextRequest } from 'next/server'
import { supabaseServer } from '@/lib/supabase-client'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
    const scanId = searchParams.get('scanId')
    const severity = searchParams.get('severity')
    const status = searchParams.get('status')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    let query = supabaseServer.from('code_issues').select('*')

    if (projectId) query = query.eq('project_id', projectId)
    if (scanId) query = query.eq('scan_id', scanId)
    if (severity) query = query.eq('severity', severity)
    if (status) query = query.eq('status', status)

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1)

    if (error) throw error

    return NextResponse.json({
      data: data || [],
      pagination: { page, limit, total: count || 0 },
    })
  } catch (error) {
    console.error('[v0] Issues list error:', error)
    return NextResponse.json({ error: 'Failed to fetch issues' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { data: { user }, error: authError } = await supabaseServer.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()

    const { data, error } = await supabaseServer
      .from('code_issues')
      .insert([{ ...body, created_at: new Date().toISOString() }])
      .select()

    if (error) throw error

    return NextResponse.json(data?.[0], { status: 201 })
  } catch (error) {
    console.error('[v0] Create issue error:', error)
    return NextResponse.json({ error: 'Failed to create issue' }, { status: 400 })
  }
}
