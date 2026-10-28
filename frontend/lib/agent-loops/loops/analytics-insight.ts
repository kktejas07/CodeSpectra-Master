/**
 * Analytics insight loop (server only) — weekly, ON by default (read-only).
 *
 * Platform scope for platform admins: KPIs, funnels, AI spend and copilot use
 * (lib/analytics/query), failed workflow runs and scheduled-job health,
 * this week vs last (rules in lib/agent-loops/pure/analytics-insight).
 * Notes are always kept as findings in the run log. Sending them is a
 * separate switch (off by default): an in-app note (email too when the person
 * allows email notifications) in each recipient's language, with a link to
 * every page to act on. With "organisation admins" on, each organisation's
 * admins get a note about their own organisation's KPIs only.
 * Optional AI (capped) adds a two-sentence "what to do first" per language.
 */
import 'server-only'
import type { Locale } from '@/lib/i18n/config'
import type { LoopContext } from '../runner'
import type { FindingInput, LoopResult } from '../types'
import { funnelNotes, jobNotes, kpiNotes, rankNotes, spendNotes, workflowNotes, type InsightNote } from '../pure/analytics-insight'
import { findingKey } from '../pure/content-qa'

const LOOP = 'analytics-insight'
const MAX_TENANTS = 50

const SUMMARY_SYSTEM = `You are an analyst for an online assessments and coding-events platform. Given this week's notes (already computed numbers), write at most two short sentences saying what the admin should look at first and why. Use only the numbers given. Answer JSON: {"summary":"..."} in the language requested.`

type Scope = { kind: 'platform' } | { kind: 'tenant'; tenantId: string }

async function notesFor(scope: Scope, now: Date): Promise<InsightNote[]> {
  const [{ getKpis, getFunnels, getAiUsage }, { parseRange, previousRange }] = await Promise.all([import('@/lib/analytics/query'), import('@/lib/analytics/range')])
  const range = parseRange({ preset: '7d' }, now)
  const prev = previousRange(range)
  const kpis = await getKpis(range, scope as never)
  if (scope.kind === 'tenant') return kpiNotes(kpis)
  const [fc, fp, ac, ap] = await Promise.all([getFunnels(range, scope), getFunnels(prev, scope), getAiUsage(range), getAiUsage(prev)])
  const { getMongoDb } = await import('@/lib/mongodb')
  const runs = (await getMongoDb()).collection('workflow_runs')
  const failedIn = async (from: Date, to: Date) => {
    const q = { status: 'failed', started_at: { $gte: from.toISOString(), $lt: to.toISOString() } }
    const [n, wfs] = await Promise.all([runs.countDocuments(q), runs.distinct('workflow_id', q)])
    return { failed: n, workflows: wfs.length }
  }
  const [wc, wp] = await Promise.all([failedIn(range.from, range.to), failedIn(prev.from, prev.to)])
  const [{ SCHEDULED_JOBS, jobHealth }, { getCronRuns }] = await Promise.all([import('@/lib/automation/job-registry'), import('@/lib/cron-heartbeat')])
  const beats = await getCronRuns(SCHEDULED_JOBS.map((j) => j.id))
  return [
    ...kpiNotes(kpis), ...funnelNotes(fc, fp), ...spendNotes(ac, ap), ...workflowNotes(wc, wp.failed),
    ...jobNotes(jobHealth(SCHEDULED_JOBS, beats, now)),
  ]
}

/** The note lines in `locale` (lib/i18n/messages/<locale>/notify.json). */
async function noteLines(notes: readonly InsightNote[], locale: Locale): Promise<string[]> {
  const { outboundT } = await import('@/lib/i18n/outbound')
  const t = outboundT('notify', locale)
  return notes.map((n) => t(n.kind === 'job_unhealthy' ? `agentLoops.note.job_${n.params.state === 'stale' ? 'stale' : 'failing'}` : `agentLoops.note.${n.kind}`, { label: n.label, ...n.params }))
}

export async function runAnalyticsInsight(ctx: LoopContext): Promise<LoopResult> {
  const { isoWeekKey } = await import('@/lib/social/share')
  const week = isoWeekKey(ctx.now)
  const notes = rankNotes(await notesFor({ kind: 'platform' }, ctx.now), ctx.settings.max_items)
  const findings: FindingInput[] = notes.map((n) => ({
    key: findingKey(LOOP, n.key, 'metric', week), kind: `insight_${n.kind}`, severity: n.severity,
    target: { type: n.kind === 'job_unhealthy' ? 'job' : n.kind === 'workflow_failures' ? 'workflow' : 'metric', id: n.key, label: n.label.slice(0, 160), url: n.link },
    params: { ...n.params }, detail: n.ask ?? null,
  }))
  const out: string[] = []
  let notified = 0

  if (ctx.settings.notify && notes.length) {
    const { getMongoDb } = await import('@/lib/mongodb')
    const admins = await (await getMongoDb()).collection('user').find({ role: 'superadmin' }, { projection: { _id: 1, id: 1 } }).limit(50).toArray()
    notified += await send(ctx, admins.map((a) => String(a.id || a._id)), notes, '/dashboard/admin/agent-loops?loop=analytics-insight', week, 'platform')
  }

  // Organisation admins: their own organisation's KPIs only.
  if (ctx.settings.notify && ctx.settings.org_admins) {
    const { getMongoDb } = await import('@/lib/mongodb')
    const db = await getMongoDb()
    const rows = await db.collection('user').aggregate<{ _id: string; ids: string[] }>([
      { $match: { role: 'tenant_admin', tenantId: { $type: 'string' } } },
      { $group: { _id: '$tenantId', ids: { $push: { $ifNull: ['$id', { $toString: '$_id' }] } } } },
      { $limit: MAX_TENANTS },
    ]).toArray()
    for (const r of rows) {
      if (ctx.timeUp()) { out.push('tenants_partial'); break }
      const tn = rankNotes(await notesFor({ kind: 'tenant', tenantId: r._id }, ctx.now).catch(() => []), ctx.settings.max_items)
      if (!tn.length) continue
      for (const n of tn) findings.push({ key: findingKey(LOOP, n.key, `tenant:${r._id}`, week), kind: `insight_${n.kind}`, severity: n.severity, target: { type: 'metric', id: n.key, label: n.label.slice(0, 160), url: '/dashboard/analytics' }, params: { ...n.params }, tenant_id: r._id })
      notified += await send(ctx, r.ids.slice(0, 20), tn, '/dashboard/analytics', week, `tenant:${r._id}`)
    }
  }
  if (notified) out.push(`notified:${notified}`)
  return { summary: { notes: notes.length, critical: notes.filter((n) => n.severity === 'critical').length, notified }, findings, notes: out }
}

/** One note per recipient in their language (AI summary per language when allowed). Once per week per scope. */
async function send(ctx: LoopContext, userIds: readonly string[], notes: readonly InsightNote[], link: string, week: string, scope: string): Promise<number> {
  const [{ notify }, { localeForUser }, { outboundT }] = await Promise.all([import('@/lib/notifications'), import('@/lib/i18n/recipient'), import('@/lib/i18n/outbound')])
  const sentKey = `sent:${scope}`
  if (ctx.state[sentKey] === week) return 0
  const summaries = new Map<Locale, string | null>()
  let n = 0
  for (const uid of userIds) {
    const locale = await localeForUser(uid).catch(() => 'en' as Locale)
    if (!summaries.has(locale)) {
      let s: string | null = null
      if (ctx.settings.use_ai) {
        const { loopAi } = await import('../ai')
        const lang = locale === 'hi' ? 'Hindi' : locale === 'te' ? 'Telugu' : 'English'
        const json = await loopAi('analytics-insight', ctx.settings, ctx.ai, { system: SUMMARY_SYSTEM, trusted: `Language: ${lang}\nNotes:\n${(await noteLines(notes, 'en')).join('\n')}` }) as { summary?: unknown } | null
        s = typeof json?.summary === 'string' ? json.summary.trim().slice(0, 400) : null
      }
      summaries.set(locale, s)
    }
    const t = outboundT('notify', locale)
    const lines = await noteLines(notes.slice(0, 5), locale)
    const message = [summaries.get(locale), ...lines.map((l) => `• ${l}`), t('agentLoops.insight.more')].filter(Boolean).join('\n')
    const r = await notify({ user_id: uid, type: 'agent_loop.insight', locale, title: t('agentLoops.insight.title', { count: notes.length }), message, link, icon: 'trending-up', send_email: true })
    if (r) n++
  }
  await ctx.saveState({ [sentKey]: week })
  return n
}
