/** Route helpers + the overview payload for /api/admin/question-bot/** (server only). */
import 'server-only'
import { NextResponse } from 'next/server'
import { requireSuperAdmin, type APIUser } from '@/lib/route-auth'
import { logger } from '@/lib/logger'
import { BANK_DIFFICULTIES, BOT_QUESTION_TYPES } from './domains'
import { countKey, domainCoverage } from './planner'
import { runBudget } from './settings'
import { coverageCounts, getBotSettings, listDomains, recentRuns, runInProgress, usageSoFar } from './store'
import { THIN_BANK_MIN } from '@/lib/adaptive-test'

/** The bank is platform-wide: the bot is superadmin only. */
export async function botAdmin(): Promise<{ user: APIUser } | { res: NextResponse }> {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return { res: NextResponse.json({ error: gate.error }, { status: gate.status }) }
  return { user: gate.user }
}

export async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const b = await req.json()
    return b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export function serverError(tag: string, e: unknown): NextResponse {
  logger.error(`[question-bot] ${tag}: ${(e as Error)?.message}`)
  return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
}

export async function audit(actorId: string, action: string, resource: string, detail: string): Promise<void> {
  const { auditAdmin } = await import('@/lib/admin-audit')
  await auditAdmin({ id: actorId }, action, 'question_bot', resource, detail.slice(0, 480), 'info').catch(() => undefined)
}

/** Everything the admin page shows (also used by get_question_coverage). */
export async function botOverview(now = new Date()) {
  const [settings, domains, runs, usage, running] = await Promise.all([getBotSettings(), listDomains(), recentRuns(10), usageSoFar(now), runInProgress(now)])
  const cov = await coverageCounts(domains)
  return {
    settings,
    usage,
    running,
    budget: runBudget(settings, usage.writtenToday, usage.spentThisMonth),
    thinMin: THIN_BANK_MIN,
    domains: domains.map((d) => ({
      ...d,
      coverage: domainCoverage(d, cov.total),
      // Every type × level (target 0 included) so the grid can raise any cell.
      cells: BOT_QUESTION_TYPES.flatMap((type) => BANK_DIFFICULTIES.map((difficulty) => ({
        type,
        difficulty,
        target: Math.max(0, Number(d.targets?.[type]?.[difficulty]) || 0),
        current: cov.total[countKey(d.id, type, difficulty)] || 0,
        approved: cov.approved[countKey(d.id, type, difficulty)] || 0,
      }))),
    })),
    runs,
  }
}
