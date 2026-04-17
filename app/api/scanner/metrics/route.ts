import { NextResponse, NextRequest } from 'next/server'
import { supabaseServer } from '@/lib/supabase-client'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
    const scanId = searchParams.get('scanId')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    let query = supabaseServer.from('file_metrics').select('*')

    if (projectId) query = query.eq('project_id', projectId)
    if (scanId) query = query.eq('scan_id', scanId)

    const { data, error, count } = await query
      .order('lines_of_code', { ascending: false })
      .range((page - 1) * limit, page * limit - 1)

    if (error) throw error

    return NextResponse.json({
      data: data || [],
      pagination: { page, limit, total: count || 0 },
    })
  } catch (error) {
    console.error('[v0] File metrics error:', error)
    return NextResponse.json({ error: 'Failed to fetch metrics' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { data: { user }, error: authError } = await supabaseServer.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const metrics = Array.isArray(body) ? body : [body]

    const { data, error } = await supabaseServer
      .from('file_metrics')
      .insert(metrics)
      .select()

    if (error) throw error

    return NextResponse.json({ data, count: data?.length || 0 }, { status: 201 })
  } catch (error) {
    console.error('[v0] Create metrics error:', error)
    return NextResponse.json({ error: 'Failed to create metrics' }, { status: 400 })
  }
}
