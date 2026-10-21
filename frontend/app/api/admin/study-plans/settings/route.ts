/** Study plan settings (superadmin): AI coach notes on/off, daily count cap, monthly cost cap, default reminder hour. */
import type { NextRequest } from 'next/server'
import { bodyOf, errorResponse, gate, json } from '@/lib/study-plan/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const g = await gate(req, { admin: true })
  if ('res' in g) return g.res
  try {
    const { getStudySettings } = await import('@/lib/study-plan/service')
    const { plansCol } = await import('@/lib/study-plan/db')
    const [settings, active] = await Promise.all([getStudySettings(), (await plansCol()).countDocuments({ status: 'active' })])
    return json({ settings, active_plans: active })
  } catch (e) {
    return errorResponse(e, 'settings read')
  }
}

export async function PUT(req: NextRequest) {
  const g = await gate(req, { admin: true, write: true })
  if ('res' in g) return g.res
  try {
    const { saveStudySettings } = await import('@/lib/study-plan/service')
    return json({ settings: await saveStudySettings(await bodyOf(req), g.user.id) })
  } catch (e) {
    return errorResponse(e, 'settings save')
  }
}
