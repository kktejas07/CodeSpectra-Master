/**
 * /api/admin/interview-sim (superadmin)
 * GET   — settings, this month's estimated AI spend and session counts.
 * PATCH — settings { enabled, daily_sessions_per_user, questions_per_session, max_followups_per_question,
 *         monthly_cost_cap_usd, session_cost_cap_usd, allow_voice, allow_recordings, recording_retention_days }.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { readJson, serverError } from '@/lib/interview-sim/http'
import { cleanSimSettingsPatch } from '@/lib/interview-sim/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function admin() {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return { res: NextResponse.json({ error: gate.error }, { status: gate.status }) }
  return { user: gate.user }
}

async function overview() {
  const { getSimSettings, monthSpend, sessions, recordings, dayKey } = await import('@/lib/interview-sim/store')
  const now = new Date()
  const [settings, month, today, recs] = await Promise.all([
    getSimSettings(true),
    monthSpend(now),
    (await sessions()).countDocuments({ day: dayKey(now) }),
    (await recordings()).countDocuments({}),
  ])
  return { settings, usage: { month_cost_usd: Math.round(month.cost_usd * 100) / 100, month_sessions: month.sessions, today_sessions: today, recordings: recs } }
}

export async function GET() {
  const g = await admin()
  if ('res' in g) return g.res
  try {
    return NextResponse.json(await overview())
  } catch (e) {
    return serverError('admin-get', e)
  }
}

export async function PATCH(req: NextRequest) {
  const g = await admin()
  if ('res' in g) return g.res
  const v = cleanSimSettingsPatch(await readJson(req))
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
  try {
    const { updateSimSettings } = await import('@/lib/interview-sim/store')
    await updateSimSettings(v.patch, g.user.id)
    const { auditAdmin } = await import('@/lib/admin-audit')
    await auditAdmin({ id: g.user.id }, 'interview_sim.settings', 'interview_sim', 'settings', `Changed ${Object.keys(v.patch).join(', ')}`.slice(0, 480), 'info').catch(() => undefined)
    return NextResponse.json(await overview())
  } catch (e) {
    return serverError('admin-patch', e)
  }
}
