import { NextRequest, NextResponse } from 'next/server'
import { getMongoDb } from '@/lib/mongodb'
import { getAPIUser } from '@/lib/route-auth'
import { isTenantStaff } from '@/lib/exam-access'
import { codeathonPubliclyVisible } from '@/lib/codeathon-visibility'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params

  try {
    const db = await getMongoDb()
    const event = (await db.collection('codeathons').findOne({ id }, { projection: { _id: 0, id: 1, status: 1, published: 1, is_published: 1, visibility: 1, deletedAt: 1, tenant_id: 1 } })) as Record<string, unknown> | null
    if (!event) return NextResponse.json({ error: 'Codeathon not found' }, { status: 404 })
    if (!codeathonPubliclyVisible(event)) {
      const user = await getAPIUser()
      if (!isTenantStaff(user, event)) return NextResponse.json({ error: 'Codeathon not found' }, { status: 404 })
    }
    const sponsors = await db.collection('codeathon_sponsors')
      .find({ codeathon_id: id }, { projection: { _id: 0 } })
      .sort({ tier: 1, name: 1 })
      .toArray()

    return NextResponse.json({ sponsors })
  } catch (e) {
    console.error('[Sponsors]', (e as Error)?.message)
    return NextResponse.json({ error: 'Failed to load sponsors' }, { status: 500 })
  }
}
