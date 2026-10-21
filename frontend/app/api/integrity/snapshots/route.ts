/**
 * POST /api/integrity/snapshots — one small camera still (JPEG data URL,
 * ≤ 150 KB) taken when a camera violation happens. Only when the author
 * turned snapshots on, only for the caller's running, consented attempt;
 * stored through lib/storage and deleted after the test's retention period.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { storeSnapshot } from '@/lib/integrity/service'
import { errorBody } from '@/lib/services/result'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const len = Number(req.headers.get('content-length') || 0)
  if (len > 256 * 1024) return NextResponse.json({ error: 'Image too large' }, { status: 413 })
  const body = await req.json().catch(() => null)
  try {
    const r = await storeSnapshot(user, body)
    return r.ok ? NextResponse.json(r.data, { status: 201 }) : NextResponse.json(errorBody(r), { status: r.status })
  } catch (e) {
    console.error('[integrity/snapshots] failed:', (e as Error).message)
    return NextResponse.json({ error: 'Could not save the snapshot' }, { status: 500 })
  }
}
