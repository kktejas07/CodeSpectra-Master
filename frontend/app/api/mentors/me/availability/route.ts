/** PUT { timezone, weekly: [{dow,start,end}], buffer_min, max_per_day, reschedule_hours?, max_reschedules? } — copied onto every session type. */
import type { NextRequest } from 'next/server'
import { bodyOf, errorResponse, json, userGate } from '@/lib/mentors/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PUT(req: NextRequest) {
  const g = await userGate(req, { write: true })
  if ('res' in g) return g.res
  try {
    const { saveAvailability } = await import('@/lib/mentors/service')
    return json({ profile: await saveAvailability(g.user.id, await bodyOf(req)) })
  } catch (e) {
    return errorResponse(e, 'mentor availability')
  }
}
