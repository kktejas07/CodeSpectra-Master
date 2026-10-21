/** GET ?status=pending|verified|rejected|suspended — mentor profiles for verification (superadmin). */
import type { NextRequest } from 'next/server'
import { adminGate, errorResponse, json } from '@/lib/mentors/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const g = await adminGate(req)
  if ('res' in g) return g.res
  try {
    const { listMentorsAdmin } = await import('@/lib/mentors/service')
    return json({ mentors: await listMentorsAdmin(req.nextUrl.searchParams.get('status')) })
  } catch (e) {
    return errorResponse(e, 'admin mentors')
  }
}
