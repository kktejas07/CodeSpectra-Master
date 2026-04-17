import { NextRequest, NextResponse } from 'next/server'

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

    // This would connect to Supabase
    // For now, returning mock data structure
    const activities = [
      {
        id: '1',
        projectId,
        eventType: 'scan_completed',
        eventData: { scanId: 'scan-1', issuesFound: 15 },
        createdAt: new Date(),
      },
      {
        id: '2',
        projectId,
        eventType: 'issue_created',
        eventData: { issueId: 'issue-1', severity: 'high' },
        createdAt: new Date(Date.now() - 3600000),
      },
    ]

    return NextResponse.json({
      data: activities,
      count: activities.length,
      total: activities.length,
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

    // This would insert into Supabase
    const newActivity = {
      id: `activity-${Date.now()}`,
      projectId,
      userId,
      eventType,
      eventData,
      createdAt: new Date(),
    }

    return NextResponse.json(newActivity, { status: 201 })
  } catch (error) {
    console.error('[v0] API Error in POST /api/scanner/activities:', error)
    return NextResponse.json(
      { error: 'Failed to create activity' },
      { status: 500 }
    )
  }
}
