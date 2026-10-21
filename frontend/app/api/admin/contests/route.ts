/**
 * GET /api/admin/contests            contests this admin manages (+ platform AI caps for superadmin).
 * PUT /api/admin/contests            { settings: { ai_daily_runs, ai_monthly_cost_usd, ai_cost_per_1k_tokens_usd } } (superadmin).
 */
import { NextResponse } from 'next/server'
import { contestPhase } from '@/lib/contests/config'
import { getContestSettings, listAdminContests, saveContestSettings } from '@/lib/contests/service'
import { guarded, readJson, respond, unauthorized, withUser } from '@/lib/contests/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const user = await withUser()
  if (!user) return unauthorized()
  return guarded('admin-list', async () => {
    const r = await listAdminContests(user, { status: new URL(req.url).searchParams.get('status') || undefined })
    if (!r.ok) return respond(r)
    const items = r.data.map((c) => ({
      id: c.id, slug: c.slug, title: c.title, format: c.format, status: c.status, visibility: c.visibility, phase: contestPhase(c),
      starts_at: c.schedule.starts_at, ends_at: c.schedule.ends_at, ready: !c.config_errors?.length, results_released: c.results_released,
    }))
    return NextResponse.json({ items, settings: user.role === 'superadmin' ? await getContestSettings() : null })
  })
}

export async function PUT(req: Request) {
  const user = await withUser()
  if (!user) return unauthorized()
  const body = await readJson(req)
  return guarded('admin-settings', async () => respond(await saveContestSettings(user, body.settings)))
}
