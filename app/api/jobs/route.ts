import { NextResponse, NextRequest } from 'next/server'
import { supabaseServer } from '@/lib/supabase-client'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const location = searchParams.get('location')
    const jobType = searchParams.get('jobType')
    const level = searchParams.get('level')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '10')

    let query = supabaseServer.from('job_postings').select('*').eq('is_active', true)

    if (location) query = query.ilike('location', `%${location}%`)
    if (jobType) query = query.eq('job_type', jobType)
    if (level) query = query.eq('experience_level', level)

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1)

    if (error) throw error

    return NextResponse.json({ 
      data: data || [],
      pagination: { page, limit, total: count || 0 }
    })
  } catch (error) {
    console.error('[v0] Jobs API error:', error)
    return NextResponse.json({ 
      data: [],
      error: 'Failed to fetch jobs'
    }, { status: 500 })
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
      .from('job_postings')
      .insert([{
        ...body,
        created_by: user.id,
      }])
      .select()

    if (error) throw error

    return NextResponse.json(data?.[0], { status: 201 })
  } catch (error) {
    console.error('[v0] Create job error:', error)
    return NextResponse.json({ error: 'Failed to create job' }, { status: 400 })
  }
}
