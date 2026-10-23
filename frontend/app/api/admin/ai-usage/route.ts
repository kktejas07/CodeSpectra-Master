/**
 * /api/admin/ai-usage (superadmin)
 * GET   ?days=30            — AI spend: by day, feature, model/provider, tenant; this month vs last; budget; price book.
 * GET   ?days=30&format=csv — the same rows as CSV (counts and money only; no prompts, no user ids).
 * PATCH                     — price overrides, unknown-model price, monthly budget, hard stop, INR rate.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { apiErrorFor } from '@/lib/api-errors'
import { utcDayKeys } from '@/lib/admin/overview'
import { SEED_NOTE } from '@/lib/ai/pricing'
import { AiCostSettingsPatch, bookFor, denseSpend, spendCsv, summarizeSpend } from '@/lib/ai/spend'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const sp = new URL(req.url).searchParams
  const days = Math.max(1, Math.min(90, Math.floor(Number(sp.get('days')) || 30)))
  try {
    const [{ getAiCostSettings }, { spendRows, monthSpend }] = await Promise.all([import('@/lib/ai/usage-record'), import('@/lib/ai/spend-report')])
    const settings = await getAiCostSettings(true)
    const book = bookFor(settings)
    const now = new Date()
    const keys = utcDayKeys(now, days)
    const rows = await spendRows(new Date(`${keys[0]}T00:00:00.000Z`), new Date(now.getTime() + 1))
    if (sp.get('format') === 'csv') {
      return new NextResponse(spendCsv(rows, book), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="ai-spend-${keys[0]}-to-${keys[keys.length - 1]}.csv"`,
          'Cache-Control': 'private, no-store',
        },
      })
    }
    const summary = summarizeSpend(rows, book)
    const month = await monthSpend(now)
    const { summary: _drop, ...monthOut } = month
    return NextResponse.json({
      days,
      dayKeys: keys,
      byDayMicros: denseSpend(summary.byDay, keys),
      totals: summary.totals,
      byFeature: summary.byFeature.slice(0, 100),
      byModel: summary.byModel.slice(0, 100),
      byTenant: summary.byTenant.slice(0, 100),
      month: monthOut,
      settings,
      book: { prices: book.prices, unknown: book.unknown, seedNote: SEED_NOTE },
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (e) {
    console.error('[admin/ai-usage]', (e as Error)?.message)
    return NextResponse.json(apiErrorFor('server_error_retry'), { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json(apiErrorFor('invalid_json'), { status: 400 })
  const r = AiCostSettingsPatch.safeParse(body)
  if (!r.success) {
    const i = r.error.issues[0]
    return NextResponse.json({ ...apiErrorFor('invalid_request'), error: i ? `${i.path.join('.') || 'settings'}: ${i.message}` : 'Invalid settings' }, { status: 400 })
  }
  try {
    const { saveAiCostSettings } = await import('@/lib/ai/usage-record')
    const { mergeAiCostSettings } = await import('@/lib/ai/spend')
    // Price rows are validated one by one (cleanPrice); unusable rows are dropped.
    const patch = mergeAiCostSettings({ ...r.data })
    const changed = Object.keys(r.data) as (keyof typeof patch)[]
    const settings = await saveAiCostSettings(Object.fromEntries(changed.map((k) => [k, patch[k]])), gate.user.id)
    const { auditAdmin } = await import('@/lib/admin-audit')
    await auditAdmin({ id: gate.user.id }, 'ai_cost.settings', 'ai_cost', 'settings', `Changed ${changed.join(', ')}`.slice(0, 480), 'info').catch(() => undefined)
    return NextResponse.json({ settings })
  } catch (e) {
    console.error('[admin/ai-usage] save', (e as Error)?.message)
    return NextResponse.json(apiErrorFor('save_failed'), { status: 500 })
  }
}
