/**
 * /api/admin/question-bot (superadmin)
 * GET   — overview: settings, spend, caps, domains with coverage per cell, last runs.
 * PATCH — settings { enabled, daily_question_cap, per_run_cap, per_cell_cap, monthly_cost_cap_usd, run_hour_utc }.
 */
import { NextRequest, NextResponse } from 'next/server'
import { audit, botAdmin, botOverview, readBody, serverError } from '@/lib/question-bot/http'
import { cleanBotSettingsPatch } from '@/lib/question-bot/settings'
import { updateBotSettings } from '@/lib/question-bot/store'
import { resetQuestionBotCache } from '@/lib/question-bot/run'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const g = await botAdmin()
  if ('res' in g) return g.res
  try {
    return NextResponse.json(await botOverview())
  } catch (e) {
    return serverError('overview', e)
  }
}

export async function PATCH(req: NextRequest) {
  const g = await botAdmin()
  if ('res' in g) return g.res
  const body = await readBody(req)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  const v = cleanBotSettingsPatch(body)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
  try {
    const settings = await updateBotSettings(v.patch, g.user.id)
    resetQuestionBotCache()
    await audit(g.user.id, 'question_bot.settings', 'settings', `Changed ${Object.keys(v.patch).join(', ')}`)
    return NextResponse.json({ settings })
  } catch (e) {
    return serverError('settings', e)
  }
}
