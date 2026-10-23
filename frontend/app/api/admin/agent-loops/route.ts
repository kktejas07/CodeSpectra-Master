/**
 * Admin → Agent loops (superadmin).
 *  GET  ?loop=<id>&status=open|applied|dismissed|failed|any      loops (settings, AI use, last run, open counts),
 *                                                                  plus that loop's runs and findings when `loop` is set
 *  POST { action: 'settings', loop, patch }                        switch on/off, AI, notify, caps, schedule
 *       { action: 'run', loop }                                    run now (ignores the switch and schedule, never the caps)
 *       { action: 'decide', id, decision: 'apply' | 'dismiss' }    apply a finding's proposal / dismiss it
 *       { action: 'search-console', csv }                          import a Search Console queries export (SEO loop)
 * Platform scope only: findings for organisations stay with their notes.
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireSuperAdmin } from '@/lib/route-auth'
import { apiErrorFor } from '@/lib/api-errors'
import { auditAdmin } from '@/lib/admin-audit'
import { limitRequest } from '@/lib/rate-limit'
import { AGENT_LOOP_IDS, AGENT_LOOPS, loopDef } from '@/lib/agent-loops/registry'
import { LoopSettingsPatchSchema } from '@/lib/agent-loops/settings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const Query = z.object({
  loop: z.enum(AGENT_LOOP_IDS).optional(),
  status: z.enum(['open', 'applied', 'dismissed', 'failed', 'any']).default('open'),
})

export async function GET(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const q = Query.safeParse(Object.fromEntries([...new URL(req.url).searchParams].filter(([, v]) => v !== '')))
  if (!q.success) return NextResponse.json(apiErrorFor('invalid_request'), { status: 400 })
  try {
    const store = await import('@/lib/agent-loops/store')
    const [{ capSpendFor }, last, open, { getCronRuns }] = await Promise.all([
      import('@/lib/ai/usage-record'), store.lastRuns(AGENT_LOOP_IDS), store.countOpenFindings(), import('@/lib/cron-heartbeat'),
    ])
    const beats = await getCronRuns(AGENT_LOOPS.map((l) => l.heartbeat)).catch(() => ({} as Record<string, never>))
    const loops = await Promise.all(AGENT_LOOPS.map(async (def) => {
      const { settings, aiCallsToday } = await store.getLoopSettings(def.id)
      return { ...def, settings, ai: { calls_today: aiCallsToday, spent_month_usd: await capSpendFor([def.aiFeature], 0) }, last_run: last[def.id] ?? null, open: open[def.id] ?? 0, heartbeat_row: beats[def.heartbeat] ?? null }
    }))
    if (!q.data.loop) return NextResponse.json({ loops })
    const [runs, findings] = await Promise.all([
      store.listRuns(q.data.loop, 20),
      store.listFindings({ loop: q.data.loop, status: q.data.status, tenantId: null, limit: 100 }),
    ])
    const extra = q.data.loop === 'seo-gap' ? { search: await (await import('@/lib/agent-loops/search-log')).queryStatsSummary().catch(() => null) } : {}
    return NextResponse.json({ loops, runs, findings, ...extra })
  } catch (e) {
    console.error('[agent-loops] GET:', (e as Error)?.message)
    return NextResponse.json(apiErrorFor('server_error'), { status: 500 })
  }
}

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('settings'), loop: z.enum(AGENT_LOOP_IDS), patch: LoopSettingsPatchSchema }),
  z.object({ action: z.literal('run'), loop: z.enum(AGENT_LOOP_IDS) }),
  z.object({ action: z.literal('decide'), id: z.string().regex(/^alf_[0-9a-f-]{36}$/), decision: z.enum(['apply', 'dismiss']) }),
  z.object({ action: z.literal('search-console'), csv: z.string().min(1).max(500_000) }),
])

export async function POST(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const limited = await limitRequest(req, 'admin-agent-loops', gate.user.id, 30, 60_000)
  if (limited) return limited
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json(apiErrorFor('invalid_request'), { status: 400 })
  const b = parsed.data
  try {
    if (b.action === 'settings') {
      const { saveLoopSettings } = await import('@/lib/agent-loops/store')
      const settings = await saveLoopSettings(b.loop, b.patch, gate.user.id)
      await auditAdmin(gate.user, 'agent_loop.settings', 'agent_loop', b.loop, JSON.stringify(b.patch).slice(0, 300)).catch(() => undefined)
      return NextResponse.json({ ok: true, settings })
    }
    if (b.action === 'run') {
      const { runAgentLoopNow } = await import('@/lib/agent-loops/runner')
      await auditAdmin(gate.user, 'agent_loop.run', 'agent_loop', b.loop, loopDef(b.loop).heartbeat).catch(() => undefined)
      const r = await runAgentLoopNow(b.loop, gate.user.id)
      if (!r.ok) {
        const inUse = r.reason !== 'failed'
        return NextResponse.json(apiErrorFor(inUse ? 'rate_limited_shortly' : 'failed'), { status: inUse ? 409 : 500 })
      }
      return NextResponse.json({ ok: true, run: r.run })
    }
    if (b.action === 'decide') {
      const { decideFinding } = await import('@/lib/agent-loops/findings')
      const r = await decideFinding(b.id, b.decision, gate.user)
      if (!r.ok) return NextResponse.json({ ...apiErrorFor(r.status === 404 ? 'not_found' : r.status === 409 ? 'nothing_to_update' : 'failed'), finding: r.finding ?? null }, { status: r.status })
      return NextResponse.json({ ok: true, finding: r.finding })
    }
    const [{ parseSearchConsoleCsv }, { importSearchConsole }] = await Promise.all([import('@/lib/agent-loops/pure/seo-gap'), import('@/lib/agent-loops/search-log')])
    const rows = parseSearchConsoleCsv(b.csv)
    if (!rows.length) return NextResponse.json(apiErrorFor('invalid_request'), { status: 400 })
    const kept = await importSearchConsole(rows)
    await auditAdmin(gate.user, 'agent_loop.search_console_import', 'agent_loop', 'seo-gap', `${kept} of ${rows.length}`).catch(() => undefined)
    return NextResponse.json({ ok: true, rows: rows.length, kept })
  } catch (e) {
    console.error('[agent-loops] POST:', (e as Error)?.message)
    return NextResponse.json(apiErrorFor('server_error'), { status: 500 })
  }
}
