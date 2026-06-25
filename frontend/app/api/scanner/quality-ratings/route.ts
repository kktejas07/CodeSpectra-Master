import { NextResponse, NextRequest } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { qualityRatings, newId, nowIso } from '@/lib/db/misc'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
    const branch = searchParams.get('branch') || 'main'

    if (!projectId) {
      return NextResponse.json({ error: 'projectId required' }, { status: 400 })
    }

    const col = await qualityRatings()
    const data = await col
      .find({ project_id: projectId, branch_name: branch })
      .sort({ updated_at: -1 })
      .limit(1)
      .next()

    return NextResponse.json({
      data:
        data ?? {
          security_rating: 'E',
          reliability_rating: 'E',
          maintainability_rating: 'E',
          quality_gate_status: 'NOT_COMPUTED',
        },
    })
  } catch (error) {
    console.error('[CodeSpectra] Quality ratings error:', error)
    return NextResponse.json({ error: 'Failed to fetch ratings' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  try {
    const body = await request.json()
    const { projectId, branch = 'main', ratings } = body
    if (!projectId || !ratings) {
      return NextResponse.json({ error: 'projectId and ratings required' }, { status: 400 })
    }

    const now = nowIso()
    const col = await qualityRatings()
    await col.updateOne(
      { project_id: projectId, branch_name: branch },
      {
        $set: {
          security_rating: ratings.security_rating,
          reliability_rating: ratings.reliability_rating,
          maintainability_rating: ratings.maintainability_rating,
          quality_gate_status: ratings.quality_gate_status,
          updated_at: now,
        },
        $setOnInsert: { id: newId(), project_id: projectId, branch_name: branch, created_at: now },
      },
      { upsert: true },
    )

    const doc = await col.findOne({ project_id: projectId, branch_name: branch })
    return NextResponse.json(doc)
  } catch (error) {
    console.error('[CodeSpectra] Update ratings error:', error)
    return NextResponse.json({ error: 'Failed to update ratings' }, { status: 400 })
  }
}
