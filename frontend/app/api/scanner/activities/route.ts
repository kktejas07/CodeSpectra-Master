import { NextRequest, NextResponse } from 'next/server'
import { getMongoDb } from '@/lib/mongodb'
import { newId, nowIso } from '@/lib/db/scans'
import type { Filter } from 'mongodb'

interface ScanActivityEventDoc {
  id: string
  project_id: string
  user_id?: string | null
  event_type: string
  event_data: Record<string, unknown>
  created_at: string
}

async function activities() {
  const db = await getMongoDb()
  return db.collection<ScanActivityEventDoc>('code_scan_activities')
}

/** GET /api/scanner/activities — list activity events with date-range filtering. */
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
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    }

    const filter: Filter<ScanActivityEventDoc> = { project_id: projectId }
    if (eventType) filter.event_type = eventType
    if (startDate || endDate) {
      filter.created_at = {}
      if (startDate) (filter.created_at as Record<string, string>).$gte = new Date(startDate).toISOString()
      if (endDate) (filter.created_at as Record<string, string>).$lte = new Date(endDate).toISOString()
    }

    const col = await activities()
    const total = await col.countDocuments(filter)
    const data = await col
      .find(filter)
      .sort({ created_at: -1 })
      .skip(offset)
      .limit(limit)
      .toArray()

    return NextResponse.json({
      activities: data,
      count: data.length,
      total,
      offset,
      limit,
    })
  } catch (error) {
    console.error('[CodeSpectra] API Error in GET /api/scanner/activities:', error)
    return NextResponse.json({ error: 'Failed to fetch activities' }, { status: 500 })
  }
}

/** POST /api/scanner/activities — create a new activity event. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { projectId, eventType, eventData, userId } = body as {
      projectId?: string
      eventType?: string
      eventData?: Record<string, unknown>
      userId?: string
    }

    if (!projectId || !eventType) {
      return NextResponse.json(
        { error: 'projectId and eventType are required' },
        { status: 400 },
      )
    }

    const doc: ScanActivityEventDoc = {
      id: newId(),
      project_id: projectId,
      user_id: userId ?? null,
      event_type: eventType,
      event_data: eventData || {},
      created_at: nowIso(),
    }

    const col = await activities()
    await col.insertOne(doc)

    return NextResponse.json(doc, { status: 201 })
  } catch (error) {
    console.error('[CodeSpectra] API Error in POST /api/scanner/activities:', error)
    return NextResponse.json({ error: 'Failed to create activity' }, { status: 500 })
  }
}
