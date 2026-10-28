/**
 * Admin → Daily digest (superadmin).
 *  GET                         settings, templates, AI status, next run, digests (all statuses), run history
 *  GET ?date=YYYY-MM-DD        one digest (any status) with its items
 *  POST { action: 'run', n?, use_ai? }       run now (replaces that date's digest; never a second one)
 *       { action: 'preview', n?, use_ai? }   build without saving or publishing
 *       { action: 'settings', patch }        weights, quotas, N, time, auto-publish, AI caps
 *       { action: 'templates', patch }       heading / intro / outro / section headings per language
 *       { action: 'publish' | 'unpublish', date }
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireSuperAdmin } from '@/lib/route-auth'
import { apiErrorFor } from '@/lib/api-errors'
import { auditAdmin } from '@/lib/admin-audit'
import { DigestSettingsPatchSchema } from '@/lib/digest/settings'
import { DigestTemplatesPatchSchema } from '@/lib/digest/templates'
import { isDigestDate, localDay, nextRunLabel } from '@/lib/digest/schedule'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const date = new URL(req.url).searchParams.get('date')
  try {
    const store = await import('@/lib/digest/store')
    if (date) {
      if (!isDigestDate(date)) return NextResponse.json(apiErrorFor('invalid_request'), { status: 400 })
      const digest = await store.getDigest(date)
      return digest ? NextResponse.json({ digest }) : NextResponse.json(apiErrorFor('not_found'), { status: 404 })
    }
    const [{ settings, templates, rawTemplates }, list, runs] = await Promise.all([store.getDigestConfig(), store.listDigests({ limit: 30 }), store.listRuns(20)])
    const { digestAiStatus } = await import('@/lib/digest/ai')
    const now = new Date()
    const today = localDay(now, settings.timezone)
    return NextResponse.json({
      settings, templates, raw_templates: rawTemplates,
      ai: await digestAiStatus(settings).catch(() => null),
      today, has_today: list.rows.some((r) => r.date === today),
      next_run: nextRunLabel(now, settings, list.rows.some((r) => r.date === today)),
      digests: list.rows, total: list.total,
      runs: runs.map((r) => ({ ...r, trace: undefined, trace_count: r.trace?.length || 0 })),
      last_trace: runs[0]?.trace?.slice(0, 120) || [],
    })
  } catch (e) {
    console.error('[digest] admin GET:', (e as Error)?.message)
    return NextResponse.json(apiErrorFor('server_error'), { status: 500 })
  }
}

const RunBody = z.object({ n: z.coerce.number().int().min(1).max(60).optional(), use_ai: z.boolean().optional() })
const Body = z.discriminatedUnion('action', [
  RunBody.extend({ action: z.literal('run') }),
  RunBody.extend({ action: z.literal('preview') }),
  z.object({ action: z.literal('settings'), patch: DigestSettingsPatchSchema }),
  z.object({ action: z.literal('templates'), patch: DigestTemplatesPatchSchema }),
  z.object({ action: z.literal('publish'), date: z.string().refine(isDigestDate) }),
  z.object({ action: z.literal('unpublish'), date: z.string().refine(isDigestDate) }),
])

export async function POST(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json(apiErrorFor('invalid_request'), { status: 400 })
  const b = parsed.data
  const audit = (action: string, detail: string) => auditAdmin(gate.user, `digest.${action}`, 'daily_digest', 'default', detail.slice(0, 300)).catch(() => undefined)
  try {
    if (b.action === 'run' || b.action === 'preview') {
      const { runDailyDigest } = await import('@/lib/digest/service')
      const r = await runDailyDigest({ trigger: b.action === 'preview' ? 'preview' : 'admin', preview: b.action === 'preview', n: b.n, useAi: b.use_ai, by: gate.user.id })
      if (b.action === 'run') await audit('run', `${r.date}: ${r.status}`)
      return NextResponse.json({ ok: r.ok, status: r.status, message: r.message, run_id: r.run_id, date: r.date, digest: r.digest })
    }
    const store = await import('@/lib/digest/store')
    if (b.action === 'settings') {
      const settings = await store.saveDigestSettings(b.patch, gate.user.id)
      await audit('settings', JSON.stringify(b.patch))
      return NextResponse.json({ ok: true, settings })
    }
    if (b.action === 'templates') {
      const templates = await store.saveDigestTemplates(b.patch, gate.user.id)
      await audit('templates', Object.keys(b.patch).join(','))
      return NextResponse.json({ ok: true, templates })
    }
    const svc = await import('@/lib/digest/service')
    if (b.action === 'publish') {
      const d = await svc.publishDigest(b.date, gate.user.id)
      if (!d) return NextResponse.json(apiErrorFor('not_found'), { status: 404 })
      await audit('publish', b.date)
      return NextResponse.json({ ok: true, digest: d })
    }
    const ok = await svc.unpublishDigest(b.date)
    await audit('unpublish', b.date)
    return NextResponse.json({ ok })
  } catch (e) {
    console.error('[digest] admin POST:', (e as Error)?.message)
    return NextResponse.json(apiErrorFor('server_error'), { status: 500 })
  }
}
