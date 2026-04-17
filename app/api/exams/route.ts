import { NextResponse, NextRequest } from 'next/server'
import { supabaseServer } from '@/lib/supabase-client'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const level = searchParams.get('level')
    const subject = searchParams.get('subject')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '10')

    let query = supabaseServer.from('exams').select('*').eq('status', 'available')

    if (level) query = query.eq('difficulty_level', level)
    if (subject) query = query.eq('subject', subject)

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1)

    if (error) throw error

    return NextResponse.json({ 
      data: data || [],
      pagination: { page, limit, total: count || 0 }
    })
  } catch (error) {
    console.error('[v0] Exams API error:', error)
    return NextResponse.json({ 
      data: [],
      error: 'Failed to fetch exams'
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
      .from('exams')
      .insert([{
        ...body,
        created_by: user.id,
        status: 'available',
      }])
      .select()

    if (error) throw error

    return NextResponse.json(data?.[0], { status: 201 })
  } catch (error) {
    console.error('[v0] Create exam error:', error)
    return NextResponse.json({ error: 'Failed to create exam' }, { status: 400 })
  }
}
