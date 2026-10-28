/**
 * /api/admin/assistants (superadmin) — the five wave-15 assistants.
 * GET   → per assistant: settings, defaults, AI usage today, last-7-day stats; plus the run log
 *         (?assistant=<id> narrows it, ?limit= up to 200).
 * PATCH { id, patch } → settings (only the fields that assistant shows; switching one on makes
 *         the caller the superadmin who receives its copilot proposals).
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { apiErrorBody, apiErrorFor } from '@/lib/api-errors'
import { ASSISTANTS, DEFAULT_ASSISTANT_SETTINGS, cleanAssistantPatch, isAssistantId } from '@/lib/assistants/registry'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function gate() {
  const g = await requireSuperAdmin()
  if ('error' in g) return { res: NextResponse.json(apiErrorBody(String(g.error), 'code' in g ? (g.code as string) : undefined), { status: g.status }) }
  return { user: g.user }
}

export async function GET(req: NextRequest) {
  const g = await gate()
  if ('res' in g) return g.res
  const sp = req.nextUrl.searchParams
  const only = sp.get('assistant')
  const limit = Math.max(1, Math.min(200, Number(sp.get('limit')) || 40))
  const { getAllAssistantSettings, listRuns, runStats, aiUsageToday } = await import('@/lib/assistants/store')
  const [settings, runs, stats, support] = await Promise.all([
    getAllAssistantSettings(true), listRuns(isAssistantId(only) ? only : null, limit), runStats(7), aiUsageToday('support'),
  ])
  return NextResponse.json({
    assistants: ASSISTANTS.map((a) => ({ ...a, settings: settings[a.id], defaults: DEFAULT_ASSISTANT_SETTINGS[a.id], stats: stats[a.id] ?? { runs: 0, failed: 0, last_at: null }, ai_today: a.id === 'support' ? support : null })),
    runs,
  }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function PATCH(req: NextRequest) {
  const g = await gate()
  if ('res' in g) return g.res
  const body = (await req.json().catch(() => null)) as { id?: unknown; patch?: unknown } | null
  if (!body || !isAssistantId(body.id)) return NextResponse.json(apiErrorFor('invalid_request'), { status: 400 })
  const v = cleanAssistantPatch(body.id, body.patch)
  if (!v.ok) return NextResponse.json(apiErrorBody(v.error, 'invalid_request'), { status: 400 })
  const { saveAssistantSettings } = await import('@/lib/assistants/store')
  const settings = await saveAssistantSettings(body.id, v.patch, g.user.id)
  const { auditAdmin } = await import('@/lib/admin-audit')
  await auditAdmin({ id: g.user.id }, 'assistant.settings', 'assistant', body.id, `Changed ${Object.keys(v.patch).join(', ')}`.slice(0, 480), 'info').catch(() => undefined)
  return NextResponse.json({ settings })
}
