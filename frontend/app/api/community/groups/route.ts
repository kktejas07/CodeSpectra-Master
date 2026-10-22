/** GET — my study groups + open ones. POST — create a study group (max 12 members). */
import type { NextRequest } from 'next/server'
import { bodyOf, errJson, errorResponse, json, userGate } from '@/lib/community/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const g = await userGate(req)
  if ('res' in g) return g.res
  try {
    const { listGroups } = await import('@/lib/community/service')
    return json(await listGroups(g.user))
  } catch (e) { return errorResponse(e, 'community groups') }
}

export async function POST(req: NextRequest) {
  const g = await userGate(req, { write: true, bucket: 'community-group', max: 5 })
  if ('res' in g) return g.res
  try {
    const { createGroup } = await import('@/lib/community/service')
    return json(await createGroup(g.user, await bodyOf(req)), 201)
  } catch (e) { return errorResponse(e, 'community group create') }
}
