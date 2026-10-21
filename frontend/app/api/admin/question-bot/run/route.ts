/**
 * POST /api/admin/question-bot/run (superadmin) — "Run now". Works while the
 * nightly run is switched off, but always within the daily and monthly caps.
 */
import { NextRequest, NextResponse } from 'next/server'
import { limitRequest } from '@/lib/rate-limit'
import { audit, botAdmin, serverError } from '@/lib/question-bot/http'
import { runQuestionBot } from '@/lib/question-bot/run'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(req: NextRequest) {
  const g = await botAdmin()
  if ('res' in g) return g.res
  const limited = await limitRequest(req, 'question-bot-run', g.user.id, 6, 60 * 60_000)
  if (limited) return limited
  try {
    // Leave headroom under maxDuration for the last batch.
    const r = await runQuestionBot({ trigger: 'manual', by: g.user.id, timeBudgetMs: 200_000 })
    await audit(g.user.id, 'question_bot.run', r.runId || 'none', r.message)
    return NextResponse.json(r, { status: r.status === 'blocked' ? 409 : 200 })
  } catch (e) {
    return serverError('run', e)
  }
}
