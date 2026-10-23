/** POST { code } — join a private study group with its invite code. */
import type { NextRequest } from 'next/server'
import { bodyOf, errJson, errorResponse, json, userGate } from '@/lib/community/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const g = await userGate(req, { write: true, bucket: 'community-group-join', max: 10 })
  if ('res' in g) return g.res
  try {
    const body = await bodyOf(req)
    const { joinGroupByCode } = await import('@/lib/community/service')
    return json(await joinGroupByCode(g.user, String(body.code || '').trim().toLowerCase()))
  } catch (e) { return errorResponse(e, 'community group code') }
}
