import { NextResponse, NextRequest } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { newId, nowIso } from '@/lib/db/scans'
import type { Filter } from 'mongodb'

interface FileMetricDoc {
  id: string
  scan_id?: string | null
  project_id?: string | null
  user_id: string
  file_path: string
  lines_of_code: number
  language?: string | null
  complexity?: number | null
  created_at: string
}

async function fileMetrics() {
  const db = await getMongoDb()
  return db.collection<FileMetricDoc>('file_metrics')
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
    const scanId = searchParams.get('scanId')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    const filter: Filter<FileMetricDoc> = {}
    if (projectId) filter.project_id = projectId
    if (scanId) filter.scan_id = scanId

    const col = await fileMetrics()
    const total = await col.countDocuments(filter)
    const data = await col
      .find(filter)
      .sort({ lines_of_code: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray()

    return NextResponse.json({
      data,
      pagination: { page, limit, total },
    })
  } catch (error) {
    console.error('[CodeSpectra] File metrics error:', error)
    return NextResponse.json({ error: 'Failed to fetch metrics' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  try {
    const body = await request.json()
    const items = Array.isArray(body) ? body : [body]
    const now = nowIso()
    const docs: FileMetricDoc[] = items.map((m: Partial<FileMetricDoc>) => ({
      id: m.id ?? newId(),
      created_at: m.created_at ?? now,
      user_id: gate.user.id,
      ...m,
    } as FileMetricDoc))

    const col = await fileMetrics()
    await col.insertMany(docs)

    return NextResponse.json({ data: docs, count: docs.length }, { status: 201 })
  } catch (error) {
    console.error('[CodeSpectra] Create metrics error:', error)
    return NextResponse.json({ error: 'Failed to create metrics' }, { status: 400 })
  }
}
