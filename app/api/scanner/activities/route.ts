import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-client'

/**
 * GET /api/scanner/activities
 * Fetch activity events with optional date range filtering
 */
export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams
    const projectId = searchParams.get('projectId')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const eventType = searchParams.get('eventType')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    if (!projectId) {
      return NextResponse.json(
        { error: 'projectId is required' },
        { status: 400 }
      )
    }

    let query = supabaseServer.from('code_scan_activities').select('*')

    if (projectId) query = query.eq('project_id', projectId)
    if (eventType) query = query.eq('event_type', eventType)

    if (startDate || endDate) {
      if (startDate) query = query.gte('created_at', new Date(startDate).toISOString())
      if (endDate) query = query.lte('created_at', new Date(endDate).toISOString())
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) throw error

    return NextResponse.json({
      activities: data || [],
      count: data?.length || 0,
      total: count || 0,
      offset,
      limit,
    })
  } catch (error) {
    console.error('[v0] API Error in GET /api/scanner/activities:', error)
    return NextResponse.json(
      { error: 'Failed to fetch activities' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/scanner/activities
 * Create a new activity event
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { projectId, eventType, eventData, userId } = body

    if (!projectId || !eventType) {
      return NextResponse.json(
        { error: 'projectId and eventType are required' },
        { status: 400 }
      )
    }

    const { data, error } = await supabaseServer
      .from('code_scan_activities')
      .insert([
        {
          project_id: projectId,
          user_id: userId,
          event_type: eventType,
          event_data: eventData || {},
        },
      ])
      .select()

    if (error) throw error

    return NextResponse.json(data?.[0], { status: 201 })
  } catch (error) {
    console.error('[v0] API Error in POST /api/scanner/activities:', error)
    return NextResponse.json(
      { error: 'Failed to create activity' },
      { status: 500 }
    )
  }
}

