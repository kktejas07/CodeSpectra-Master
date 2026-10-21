/**
 * GET /api/integrity/config?kind=exam|contest&id=… — what the candidate's page
 * needs: whether integrity monitoring is on, which signals (for the consent
 * screen), and whether consent is already on file for the running attempt.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { candidateIntegrity } from '@/lib/integrity/service'
import { errorBody } from '@/lib/services/result'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const r = await candidateIntegrity(user, req.nextUrl.searchParams.get('kind') || '', req.nextUrl.searchParams.get('id') || '')
    return r.ok ? NextResponse.json(r.data, { headers: { 'Cache-Control': 'no-store' } }) : NextResponse.json(errorBody(r), { status: r.status })
  } catch (e) {
    console.error('[integrity/config] failed:', (e as Error).message)
    return NextResponse.json({ error: 'Could not load the test settings' }, { status: 500 })
  }
}
