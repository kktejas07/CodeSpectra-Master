/**
 * /api/admin/integrity/[kind]/[id] — reviewer overview of one test or contest.
 *   GET  settings, platform AI caps (superadmin), attempts with trust scores, report status
 *   PUT  { settings?: patch, global?: caps (superadmin only) }
 * Staff of the test's / contest's organisation only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/route-auth'
import { getGlobal, getSettings, listAttempts, loadStaffTarget, saveGlobal, saveSettings } from '@/lib/integrity/service'
import { getReport } from '@/lib/integrity/similarity-job'
import { auditAdmin } from '@/lib/admin-audit'
import { errorBody } from '@/lib/services/result'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ kind: string; id: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const gate = await requireAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { kind, id } = await ctx.params
  try {
    const t = await loadStaffTarget(gate.user, kind, id)
    if (!t.ok) return NextResponse.json(errorBody(t), { status: t.status })
    const [settings, attempts, report, global] = await Promise.all([
      getSettings(t.data.kind, t.data.id),
      listAttempts(t.data),
      getReport(t.data),
      gate.user.role === 'superadmin' ? getGlobal() : Promise.resolve(null),
    ])
    return NextResponse.json({
      target: { kind: t.data.kind, id: t.data.id, title: t.data.title },
      settings,
      global,
      attempts,
      report: report ? { status: report.status, finished_at: report.finished_at, error: report.error, trigger: report.trigger, clusters: report.questions.reduce((n, q) => n + q.clusters.length, 0), ai_rows: report.ai.length } : null,
    })
  } catch (e) {
    console.error('[admin/integrity] GET failed:', (e as Error).message)
    return NextResponse.json({ error: 'Could not load integrity data' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const gate = await requireAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { kind, id } = await ctx.params
  const body = (await req.json().catch(() => null)) as { settings?: unknown; global?: unknown } | null
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  try {
    const t = await loadStaffTarget(gate.user, kind, id)
    if (!t.ok) return NextResponse.json(errorBody(t), { status: t.status })
    const out: Record<string, unknown> = {}
    if (body.settings !== undefined) {
      const r = await saveSettings(gate.user, t.data, body.settings)
      if (!r.ok) return NextResponse.json(errorBody(r), { status: r.status })
      out.settings = r.data
      await auditAdmin(gate.user, 'integrity.settings.update', t.data.kind, t.data.id)
    }
    if (body.global !== undefined) {
      const g = await saveGlobal(gate.user, body.global)
      if (!g.ok) return NextResponse.json(errorBody(g), { status: g.status })
      out.global = g.data
      await auditAdmin(gate.user, 'integrity.caps.update', 'platform', 'global')
    }
    return NextResponse.json(out)
  } catch (e) {
    console.error('[admin/integrity] PUT failed:', (e as Error).message)
    return NextResponse.json({ error: 'Could not save' }, { status: 500 })
  }
}
