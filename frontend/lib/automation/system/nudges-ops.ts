/**
 * Wave 15 operations automations:
 *   feed-source-health   events-feed / tech-news sources with 3 bad pulls in a row → admin alert
 *                        (bell + Slack/Teams); still failing after 7 days → switched off
 *                        (the digest and /news keep running on the other sources). ON by default
 *                        (admins only, no AI).
 *   content-freshness    weekly list of stale Learn posts and question-bank items (12+ months,
 *                        deprecated APIs, dead links) for the editor queue, with AI refresh notes
 *                        within a daily + monthly cap (feature "learn-freshness", platform hard stop
 *                        respected, template note as the fallback). OFF by default (spends AI).
 *   nudge-signals        emits the events organisation workflow templates start on (invite
 *                        expiring, offer pending, at-risk learner, talent invite waiting, BGV
 *                        overdue, drive no-shows). Read-only: ON by default.
 */
import { getMongoDb } from '@/lib/mongodb'
import { logger } from '@/lib/logger'
import { emit } from '../events'
import { nextSourceHealth, sourceHealthAction, stalenessReasons, extractLinks, driveClosedAt, stepKey, type SourceHealth } from '../nudges/rules'
import { getNudgeSettings } from '../nudges/settings'
import type { SystemAutomation } from './types'

type Doc = Record<string, any>
const DAY = 86_400_000

// ─── Feed source health ─────────────────────────────────────────────────────

export async function runFeedSourceHealth(now = new Date()): Promise<Record<string, number>> {
  const db = await getMongoDb()
  const health = db.collection<SourceHealth & { key: string }>('feed_source_health')
  await health.createIndex({ key: 1 }, { unique: true }).catch(() => {})
  const { SIGNAL_FEEDS } = await import('@/lib/signals/feeds')
  const names = new Map(SIGNAL_FEEDS.map((f) => [f.id, f.name]))
  const events = (await db.collection('events_feed_sources').find({ enabled: true }, { projection: { _id: 0, id: 1, last_run_at: 1, last_error: 1, last_count: 1, config: 1 } }).limit(500).toArray()) as Doc[]
  const signals = (await db.collection('signal_feed_state').find({ enabled: { $ne: false } }, { projection: { _id: 0, id: 1, last_run_at: 1, last_error: 1 } }).limit(500).toArray()) as Doc[]
  const pulls = [
    // A small calendar can legitimately return nothing: 0 items only counts after a few days of it (AUTO-103).
    ...events.map((s) => ({ kind: 'events' as const, id: String(s.id), name: String(s.config?.name || s.id), last_run_at: s.last_run_at ?? null, ok: !s.last_error, empty: !s.last_error && !(Number(s.last_count) > 0), error: s.last_error ? String(s.last_error) : Number(s.last_count) > 0 ? null : 'No items fetched' })),
    // A news feed with nothing new is normal: only errors count.
    ...signals.map((s) => ({ kind: 'signals' as const, id: String(s.id), name: names.get(String(s.id)) || String(s.id), last_run_at: s.last_run_at ?? null, ok: !s.last_error, error: s.last_error ? String(s.last_error) : null })),
  ]
  const out = { checked: pulls.length, alerted: 0, disabled: 0 }
  const { sendAdminAlert } = await import('../alerts')
  for (const p of pulls) {
    const key = `${p.kind}:${p.id}`
    const prev = (await health.findOne({ key }, { projection: { _id: 0 } })) as (SourceHealth & { key: string }) | null
    const next = nextSourceHealth(prev, { id: p.id, last_run_at: p.last_run_at, ok: p.ok, error: p.error, empty: 'empty' in p ? p.empty : false })
    const action = sourceHealthAction(next, now)
    const where = p.kind === 'events' ? 'Admin → Events feed' : 'Admin → Tech news'
    const link = p.kind === 'events' ? '/dashboard/admin/events-feed' : '/dashboard/admin/signals'
    if (action === 'alert') {
      await sendAdminAlert({ key: `feed-source:${key}`, title: `Feed source failing: ${p.name}`, detail: `${p.name} (${p.kind === 'events' ? 'events feed' : 'tech news'}) had ${next.bad_streak} bad pulls in a row. Last good pull: ${next.last_good_at || 'never'}. Last error: ${(next.last_error || 'none').slice(0, 200)}. It is switched off automatically after ${7} days of failures. Check it under ${where}.`, severity: 'warning', link, windowMinutes: 24 * 60 }).catch(() => false)
      next.alerted_at = now.toISOString()
      out.alerted++
    } else if (action === 'disable') {
      const col = p.kind === 'events' ? 'events_feed_sources' : 'signal_feed_state'
      await db.collection(col).updateOne({ id: p.id }, { $set: { enabled: false, auto_disabled_at: now.toISOString(), auto_disabled_reason: (next.last_error || 'failing for 7 days').slice(0, 200) } })
      await sendAdminAlert({ key: `feed-source-off:${key}`, title: `Feed source switched off: ${p.name}`, detail: `${p.name} failed every pull for 7 days, so it was switched off. Other sources keep the digest and news pages full. Switch it back on under ${where} once it is fixed.`, severity: 'warning', link, windowMinutes: 7 * 24 * 60 }).catch(() => false)
      next.disabled_at = now.toISOString()
      out.disabled++
    }
    await health.updateOne({ key }, { $set: { ...next, key } }, { upsert: true })
  }
  return out
}

// ─── Content freshness ──────────────────────────────────────────────────────

const AI_FEATURE = 'learn-freshness'
const LINK_CHECKS_PER_RUN = 60

async function deadLinks(urls: string[], budget: { left: number }): Promise<number> {
  const { safeFetch } = await import('@/lib/url-safety')
  let dead = 0
  for (const u of urls) {
    if (budget.left <= 0) break
    budget.left--
    try {
      const res = await safeFetch(u, { method: 'HEAD', signal: AbortSignal.timeout(6000), headers: { 'User-Agent': 'CodeSpectraLinkCheck/1.0' } }, 3)
      // 404 / 410 only: some sites refuse HEAD (405) or bots (403) while the page is fine.
      if (res.status === 404 || res.status === 410) dead++
    } catch {
      /* network errors are not proof the page is gone */
    }
  }
  return dead
}

export async function runContentFreshness(now = new Date()): Promise<Record<string, number>> {
  const db = await getMongoDb()
  const queue = db.collection('content_freshness_queue')
  await Promise.all([
    queue.createIndex({ kind: 1, ref_id: 1 }, { unique: true }),
    queue.createIndex({ status: 1, detected_at: -1 }),
  ]).catch(() => {})
  const budget = { left: LINK_CHECKS_PER_RUN }
  const found: { kind: 'learn' | 'question'; ref_id: string; title: string; reasons: string[]; text: string }[] = []
  const posts = (await db.collection('learn_posts').find({ status: 'published', $or: [{ locale: { $exists: false } }, { locale: 'en' }] }, { projection: { _id: 0, id: 1, title: 1, body: 1, updated_at: 1, published_at: 1 } }).sort({ updated_at: 1 }).limit(2000).toArray()) as Doc[]
  for (const p of posts) {
    const text = String(p.body || '')
    const links = budget.left > 0 ? extractLinks(text, 5) : []
    const reasons = stalenessReasons({ updated_at: p.updated_at || p.published_at, text, dead_links: links.length ? await deadLinks(links, budget) : 0 }, now)
    if (reasons.length) found.push({ kind: 'learn', ref_id: String(p.id), title: String(p.title || '').slice(0, 200), reasons, text })
  }
  const qs = (await db.collection('question_bank').find({ is_active: true, review_status: { $ne: 'draft' } }, { projection: { _id: 0, id: 1, title: 1, question: 1, explanation: 1, options: 1, updatedAt: 1 } }).sort({ updatedAt: 1 }).limit(5000).toArray()) as Doc[]
  for (const q of qs) {
    const text = [q.question, q.explanation, ...((q.options as string[]) || [])].filter(Boolean).join('\n')
    const reasons = stalenessReasons({ updated_at: q.updatedAt, text }, now)
    // Age alone is common in a big bank: list questions only for a concrete problem.
    if (reasons.some((r) => r !== 'older_than_12_months')) found.push({ kind: 'question', ref_id: String(q.id), title: String(q.title || q.question || '').slice(0, 200), reasons, text })
  }
  const ts = now.toISOString()
  for (const f of found) {
    await queue.updateOne({ kind: f.kind, ref_id: f.ref_id }, { $set: { title: f.title, reasons: f.reasons, last_checked_at: ts }, $setOnInsert: { kind: f.kind, ref_id: f.ref_id, status: 'open', detected_at: ts } }, { upsert: true })
  }
  // Fixed since the last run: close it.
  const stillStale = new Set(found.map((f) => `${f.kind}:${f.ref_id}`))
  const open = (await queue.find({ status: 'open' }, { projection: { _id: 0, kind: 1, ref_id: 1 } }).limit(10_000).toArray()) as Doc[]
  let fixed = 0
  for (const o of open) if (!stillStale.has(`${o.kind}:${o.ref_id}`)) { await queue.updateOne({ kind: o.kind, ref_id: o.ref_id }, { $set: { status: 'done', closed_at: ts } }); fixed++ }

  // AI refresh notes for Learn posts, inside the caps.
  const s = await getNudgeSettings()
  const day = ts.slice(0, 10)
  let drafted = await queue.countDocuments({ ai_note_at: { $gte: `${day}T00:00:00.000Z` } })
  let fallback = 0
  const { aiBudgetBlocks, featureSpendMicros } = await import('@/lib/ai/usage-record')
  const monthUsd = ((await featureSpendMicros([AI_FEATURE], now)) ?? Number.POSITIVE_INFINITY) / 1_000_000
  const aiOk = s.freshness_ai_daily > 0 && monthUsd < s.freshness_ai_monthly_usd && !(await aiBudgetBlocks(AI_FEATURE))
  const needNotes = (await queue.find({ kind: 'learn', status: 'open', ai_note: { $exists: false } }, { projection: { _id: 0, ref_id: 1, reasons: 1, title: 1 } }).limit(50).toArray()) as Doc[]
  const textBy = new Map(found.filter((f) => f.kind === 'learn').map((f) => [f.ref_id, f.text]))
  for (const item of needNotes) {
    let note: string | null = null
    let source: 'ai' | 'template' = 'template'
    if (aiOk && drafted < s.freshness_ai_daily) {
      try {
        const [{ backendComplete }, { fenceUntrusted, untrustedRule }] = await Promise.all([import('@/lib/ai/backend'), import('@/lib/ai/untrusted-input')])
        const r = await backendComplete({
          feature: AI_FEATURE, modelRole: 'fast', cache: false,
          systemMessage: `You review technical learning articles for freshness. List, in at most 6 short bullet points, what is likely outdated (versions, deprecated APIs, dead links) and what the editor should update. Plain text, no markdown headings, no new facts you are unsure of. ${untrustedRule(['post'])}`,
          userMessage: `Detected issues: ${(item.reasons as string[]).join(', ')}\nTitle: ${String(item.title)}\n${fenceUntrusted('post', String(textBy.get(String(item.ref_id)) || '').slice(0, 6000), 6000)}`,
        })
        if (r.ok && r.text) { note = String(r.text).replace(/<[^>]*>/g, '').slice(0, 1500); source = 'ai'; drafted++ }
      } catch (e) {
        logger.warn('[content-freshness] AI note failed', (e as Error)?.message)
      }
    }
    if (!note) { note = templateNote(item.reasons as string[]); fallback++ }
    await queue.updateOne({ kind: 'learn', ref_id: item.ref_id }, { $set: { ai_note: note, ai_note_source: source, ...(source === 'ai' ? { ai_note_at: ts } : {}) } })
  }
  return { learn_posts: posts.length, questions: qs.length, stale: found.length, fixed, ai_notes: drafted, template_notes: fallback, links_checked: LINK_CHECKS_PER_RUN - budget.left }
}

/** Deterministic refresh note when AI is off, capped or over budget. */
export function templateNote(reasons: string[]): string {
  const lines = reasons.map((r) => r === 'older_than_12_months' ? '• Not updated for over a year: check versions, screenshots and links.'
    : r.startsWith('deprecated:') ? `• Mentions ${r.slice(11)}: replace with the current approach.`
    : r.startsWith('dead_links:') ? `• ${r.slice(11)} link(s) return “not found”: replace or remove them.` : `• ${r}`)
  return lines.join('\n')
}

// ─── Nudge signals (events for organisation workflow templates) ─────────────

export async function runNudgeSignals(now = new Date()): Promise<Record<string, number>> {
  const out = { invite: 0, offer: 0, at_risk: 0, talent: 0, bgv: 0, no_show: 0 }
  const safe = async (label: string, fn: () => Promise<void>) => { try { await fn() } catch (e) { logger.warn(`[nudge-signals] ${label} failed`, (e as Error)?.message) } }
  const [learning, hiring] = await Promise.all([import('./nudges-learning'), import('./nudges-hiring')])
  await safe('invites', async () => {
    for (const { inv, step, exam } of await learning.dueInviteReminders(now)) {
      const r = await emit('assessment.invite.expiring', { invite_id: inv.id, exam_id: inv.exam_id || null, exam_title: exam?.title || null, email: inv.email, name: inv.full_name || null, user_id: inv.user_id || null, hours_left: step, expires_at: inv.expires_at }, { tenantId: inv.tenant_id || null, idempotencyKey: `assessment.invite.expiring:${String(inv.id)}:${stepKey(step)}` })
      if (r.id) out.invite++
    }
  })
  await safe('offers', async () => {
    for (const { app, job, step, deadline } of await hiring.dueOfferFollowUps(now)) {
      if (step === 'expired') continue // offer.expired comes from the follow-up automation (it records the expiry)
      const r = await emit('offer.pending', { application_id: app.id, job_id: job.id, job_title: job.title, candidate_id: app.candidate_id, step, days_waiting: Math.floor((now.getTime() - Date.parse(String(app.stage_entered_at))) / DAY), stage_entered_at: app.stage_entered_at, expires_at: deadline }, { tenantId: String(job.tenant_id), idempotencyKey: `offer.pending:${String(app.id)}:${String(app.stage_entered_at)}:${step}` })
      if (r.id) out.offer++
    }
  })
  await safe('cohorts', async () => {
    const week = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - ((now.getUTCDay() + 6) % 7))).toISOString().slice(0, 10)
    for (const { cohort, learners } of await learning.cohortsAtRisk(now)) for (const { member, risk } of learners) {
      if (!risk.at_risk) continue
      const r = await emit('cohort.member_at_risk', { cohort_id: cohort.id, cohort_title: cohort.title, user_id: member.user_id, email: member.email, name: member.name, reasons: risk.reasons, missed_assignments: risk.missed, days_inactive: risk.days_inactive, week }, { tenantId: cohort.tenant_id || null, idempotencyKey: `cohort.member_at_risk:${String(cohort.id)}:${String(member.user_id)}:${week}` })
      if (r.id) out.at_risk++
    }
  })
  await safe('talent', async () => {
    for (const { inv, step } of await learning.dueTalentInvites(now)) {
      const r = await emit('talent.invite.pending', { invite_id: inv.id, learner_id: inv.learner_id, target_type: inv.target_type, target_title: inv.target_title, step, expires_at: inv.expires_at }, { tenantId: String(inv.tenant_id), idempotencyKey: `talent.invite.pending:${String(inv.id)}:${step}` })
      if (r.id) out.talent++
    }
  })
  await safe('bgv', async () => {
    for (const { c, check, days } of await hiring.overdueBgvChecks(now)) {
      const r = await emit('bgv.overdue', { case_id: c.id, application_id: c.application_id, candidate_name: c.candidate_name, job_title: c.job_title, vendor: c.vendor, check: check.type, days_overdue: days }, { tenantId: String(c.tenant_id), idempotencyKey: `bgv.overdue:${String(c.id)}:${String(check.type)}:${String(c.vendor_ordered_at)}` })
      if (r.id) out.bgv++
    }
  })
  await safe('drives', async () => {
    const db = await getMongoDb()
    const recent = (await db.collection('live_drives').find({ status: { $in: ['scheduled', 'ended'] }, 'schedule.start_at': { $gte: new Date(now.getTime() - 3 * DAY).toISOString(), $lte: now.toISOString() } }, { projection: { _id: 0, id: 1, title: 1, owner: 1, schedule: 1 } }).limit(200).toArray()) as Doc[]
    for (const d of recent) {
      if (now.getTime() < driveClosedAt(d.schedule) + 30 * 60_000) continue
      const n = await db.collection('live_drive_candidates').countDocuments({ drive_id: d.id, state: 'not_started', started_at: null })
      if (!n) continue
      const r = await emit('drive.no_show', { drive_id: d.id, title: d.title, no_shows: n, starts_at: d.schedule.start_at }, { tenantId: d.owner?.tenant_id || null, idempotencyKey: `drive.no_show:${String(d.id)}` })
      if (r.id) out.no_show++
    }
  })
  return out
}

export const OPS_NUDGE_AUTOMATIONS: SystemAutomation[] = [
  {
    id: 'feed-source-health',
    title: 'Feed source health alerts',
    description: 'Hourly: an events-feed or tech-news source with 3 bad pulls in a row (errors, or no events) raises an admin alert (bell + Slack/Teams) with its last good pull and error; after 7 days of failures it is switched off so the digest and news run on the other sources.',
    group: 'Operations',
    refs: ['W15-AUTO-11'],
    defaultOn: true,
    cadence: { kind: 'interval', minutes: 60 },
    run: async (now) => runFeedSourceHealth(now),
  },
  {
    id: 'content-freshness',
    title: 'Content freshness checks',
    description: 'Weekly: lists Learn posts and question-bank items that are over a year old, mention deprecated APIs or have dead links in the editor queue (Admin → Automations → Content freshness), with AI refresh notes inside the daily and monthly cap under Nudge limits.',
    group: 'Operations',
    refs: ['W15-AUTO-12'],
    defaultOn: false,
    cadence: { kind: 'weekly', weekdayUtc: 1, hourUtc: 3 },
    // Up to 60 link checks + AI notes: the heavy lane, never the every-minute critical one (AUTO-099).
    heavy: true,
    run: async (now) => runContentFreshness(now),
  },
  {
    id: 'nudge-signals',
    title: 'Nudge signals for workflows',
    description: 'Hourly, read-only: emits the events organisation workflow templates start on — test invite closing, offer waiting, learner at risk, talent invite waiting, background check overdue, drive no-shows. Sends nothing itself.',
    group: 'Operations',
    refs: ['W15-AUTO-SIG'],
    defaultOn: true,
    cadence: { kind: 'interval', minutes: 60 },
    run: async (now) => runNudgeSignals(now),
    emits: ['assessment.invite.expiring', 'offer.pending', 'cohort.member_at_risk', 'talent.invite.pending', 'bgv.overdue', 'drive.no_show'],
  },
]
