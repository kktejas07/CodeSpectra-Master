/**
 * Study plan service: create / read / regenerate a plan, check items off (XP + streak reuse),
 * practice sets from the question bank, AI-worded weekly notes within caps, reminders and the
 * weekly adapt job (scheduler, with a per-plan lock so one replica builds each week).
 */
import 'server-only'
import { z } from 'zod'
import { newId, nowIso } from '@/lib/db/ids'
import { getMongoDb } from '@/lib/mongodb'
import { computeStreak } from '@/lib/streak'
import { zonedWallToUtc } from '@/lib/marketplace/slots'
import { domainBankFilter, DEFAULT_DOMAINS, type QuestionDomain } from '@/lib/question-bot/domains'
import { plansCol, practiceCol, settingsCol } from './db'
import { gatherSignals } from './signals'
import { computeWeakAreas, patternFocus } from './weak-areas'
import { addDays, adaptLoad, buildWeek, daysBetween, localDay, localHour, summarizeWeek, templateNote, type CatalogPost, type PlannerCatalog } from './planner'
import { DEFAULT_STUDY_SETTINGS, aiAllowed, StudySettingsPatch, type StudyPlanSettings, type AiUsage } from './settings'
import type { PlanItem, PlanTarget, PlanWeek, Reminders, StudyPlanDoc, WeakArea } from './types'

export class StudyPlanError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

const LOCK_MS = 5 * 60_000
const XP_PER_ITEM = 5

// ─── Settings ────────────────────────────────────────────────────────────────

export async function getStudySettings(): Promise<StudyPlanSettings & { usage: AiUsage }> {
  const d = await (await settingsCol()).findOne({ _id: 'global' })
  return { ...DEFAULT_STUDY_SETTINGS, ...(d ? Object.fromEntries(Object.entries(d).filter(([k]) => k in DEFAULT_STUDY_SETTINGS)) : {}), usage: d?.usage ?? { day: null, day_count: 0, month: null, month_cost_usd: 0 } } as StudyPlanSettings & { usage: AiUsage }
}

export async function saveStudySettings(raw: unknown, actorId: string): Promise<StudyPlanSettings> {
  const r = StudySettingsPatch.safeParse(raw)
  if (!r.success) throw new StudyPlanError(400, r.error.issues[0]?.message || 'Invalid settings')
  await (await settingsCol()).updateOne({ _id: 'global' }, { $set: { ...r.data, updated_at: nowIso(), updated_by: actorId } }, { upsert: true })
  return getStudySettings()
}

async function recordAiUse(costUsd: number, now: Date): Promise<void> {
  const col = await settingsCol()
  const day = now.toISOString().slice(0, 10), month = now.toISOString().slice(0, 7)
  // Roll the counters over first (conditional), then increment.
  await col.updateOne({ _id: 'global', 'usage.day': { $ne: day } }, { $set: { 'usage.day': day, 'usage.day_count': 0 } }, { upsert: false }).catch(() => undefined)
  await col.updateOne({ _id: 'global', 'usage.month': { $ne: month } }, { $set: { 'usage.month': month, 'usage.month_cost_usd': 0 } }).catch(() => undefined)
  await col.updateOne({ _id: 'global' }, { $inc: { 'usage.day_count': 1, 'usage.month_cost_usd': Math.max(0, costUsd) } }, { upsert: true })
}

// ─── Input ───────────────────────────────────────────────────────────────────

const DOMAIN_IDS = DEFAULT_DOMAINS.map((d) => d.id)

export const PlanInputSchema = z.object({
  kind: z.enum(['company', 'skills']),
  pattern_id: z.string().regex(/^[a-z0-9-]{1,60}$/).optional().nullable(),
  domains: z.array(z.string().regex(/^[a-z0-9_]{1,40}$/)).max(6).default([]),
  days: z.coerce.number().int().min(7).max(180),
  hours_per_week: z.coerce.number().int().min(2).max(40),
  timezone: z.string().max(64).optional(),
  reminders: z.object({ email: z.boolean(), whatsapp: z.boolean(), hour: z.coerce.number().int().min(0).max(23) }).partial().optional(),
}).strict()

export const RemindersSchema = z.object({ email: z.boolean().optional(), whatsapp: z.boolean().optional(), hour: z.coerce.number().int().min(0).max(23).optional(), timezone: z.string().max(64).optional() }).strict()

const validTz = (tz: string | undefined) => {
  if (!tz) return false
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true } catch { return false }
}

// ─── Catalog ─────────────────────────────────────────────────────────────────

async function loadPosts(): Promise<CatalogPost[]> {
  const db = await getMongoDb()
  const rows = await db.collection('learn_posts').find({ status: 'published' }, { projection: { _id: 0, slug: 1, title: 1, tags: 1, category: 1, level: 1, reading_minutes: 1 } }).sort({ published_at: -1 }).limit(800).toArray()
  return rows.map((r) => ({ slug: String(r.slug), title: String(r.title || ''), tags: Array.isArray(r.tags) ? r.tags.map(String) : [], category: String(r.category || ''), level: String(r.level || ''), reading_minutes: Number(r.reading_minutes) || 8 }))
}

async function loadPattern(id: string | null | undefined) {
  if (!id) return null
  const { getPattern } = await import('@/lib/company-tests/db')
  const p = await getPattern(id)
  if (!p || p.active === false) return null
  return { id: p.id, label: p.examName || p.companyName, minutes: Math.max(30, Math.min(240, p.sections.reduce((s, x) => s + (x.timeMinutes || 0), 0) || 90)), sections: p.sections }
}

export async function planTargets(): Promise<{ patterns: { id: string; label: string; company: string }[]; domains: { id: string; label: string }[] }> {
  const { listPatterns } = await import('@/lib/company-tests/db')
  const pats = await listPatterns({ activeOnly: true }).catch(() => [])
  return { patterns: pats.map((p) => ({ id: p.id, label: p.examName, company: p.companyName })), domains: DEFAULT_DOMAINS.filter((d) => d.active).map((d) => ({ id: d.id, label: d.label })) }
}

// ─── Building ────────────────────────────────────────────────────────────────

interface BuildCtx { target: PlanTarget; tz: string; weekNo: number; loadFactor: number; readSlugs: string[]; now: Date }

async function buildFor(userId: string, c: BuildCtx): Promise<{ week: PlanWeek; areas: WeakArea[] }> {
  const [signals, posts, pattern] = await Promise.all([gatherSignals(userId, c.now), loadPosts(), loadPattern(c.target.kind === 'company' ? c.target.pattern_id : null)])
  const focus = [
    ...(pattern ? patternFocus(pattern.sections) : []),
    // Chosen subjects: every topic of the domain (lib/question-bot/domains.ts), so an untested subject still gets a full week.
    ...c.target.domains.flatMap((d): { domain: string; topic: string | null }[] => { const dom = DEFAULT_DOMAINS.find((x) => x.id === d); return dom?.topics.length ? dom.topics.map((t) => ({ domain: d, topic: t })) : [{ domain: d, topic: null }] }),
  ]
  const areas = computeWeakAreas(signals, { nowMs: c.now.getTime(), focus })
  // Areas of the target first: a company plan studies that company's sections before anything else.
  const focusDomains = new Set(focus.map((f) => f.domain))
  const ranked = focusDomains.size ? [...areas.filter((a) => focusDomains.has(a.domain)), ...areas.filter((a) => !focusDomains.has(a.domain) && a.domain === 'interview'), ...areas.filter((a) => !focusDomains.has(a.domain) && a.domain !== 'interview')] : areas
  const startDay = addDays(c.target.start_date, (c.weekNo - 1) * 7)
  const catalog: PlannerCatalog = { posts, pattern: pattern ? { id: pattern.id, label: pattern.label, minutes: pattern.minutes } : null }
  const week = buildWeek({ target: c.target, weakAreas: ranked, catalog, weekNo: c.weekNo, startDay, daysLeft: c.target.days - (c.weekNo - 1) * 7, loadFactor: c.loadFactor, readSlugs: c.readSlugs })
  return { week, areas: ranked.slice(0, 12) }
}

function weekEndInstant(week: PlanWeek, tz: string): string {
  const [y, m, d] = addDays(week.end, 1).split('-').map(Number)
  try { return new Date(zonedWallToUtc(y, m, d, 0, tz)).toISOString() } catch { return new Date(Date.UTC(y, m - 1, d)).toISOString() }
}

/** Coach note: AI words it within the caps; the template is the fallback. Prompt carries only structured data. */
async function coachNote(userId: string, week: PlanWeek, areas: WeakArea[], last: StudyPlanDoc['history'][number] | null, target: PlanTarget, now: Date): Promise<{ note: string; source: 'ai' | 'template' }> {
  const fallback = { note: templateNote(week, areas, last), source: 'template' as const }
  try {
    const s = await getStudySettings()
    // Cap source: own counter or the platform-recorded cost, whichever is higher.
    const { capSpendFor } = await import('@/lib/ai/usage-record')
    const ledger = s.usage.month === now.toISOString().slice(0, 7) ? s.usage.month_cost_usd : 0
    if (!aiAllowed(s, { ...s.usage, month: now.toISOString().slice(0, 7), month_cost_usd: await capSpendFor(['study-plan-note'], ledger, now) }, now).ok) return fallback
    // AI notes are a plan feature (lib/billing/entitlement-features.ts); free plans get the template.
    const { hasEntitlement } = await import('@/lib/entitlements')
    if (!(await hasEntitlement({ id: userId, role: 'user' }, 'study_plan_ai_notes')).allowed) return fallback
    const [{ backendComplete }, { withUsageMeter, meteredUsd }, { estimateAiCost }, { scanUntrusted, neutraliseUntrusted }] = await Promise.all([
      import('@/lib/ai/backend'), import('@/lib/ai/usage-meter'), import('@/lib/db/analytics'), import('@/lib/ai/untrusted-input'),
    ])
    // Labels come from the bank / patterns (not typed by the learner) — still neutralised and scanned.
    const facts = {
      target: neutraliseUntrusted(target.label).slice(0, 80),
      days_left: target.days - (week.week_no - 1) * 7,
      hours_planned: Math.round(week.items.reduce((a, i) => a + i.minutes, 0) / 6) / 10,
      focus: areas.slice(0, 3).map((a) => ({ area: neutraliseUntrusted(a.label).slice(0, 80), percent_right: Math.round(a.mastery * 100) })),
      last_week: last ? { done: last.done, planned: last.planned } : null,
    }
    if (scanUntrusted(JSON.stringify(facts)).reasons.length) return fallback
    let cost = 0
    const { platformModelOverrides } = await import('@/lib/interviews/ai-mock-engine')
    const overrides = await platformModelOverrides()
    const res = await withUsageMeter((u) => { cost += meteredUsd(u, () => estimateAiCost(u.model, u.inputTokens, u.outputTokens)) }, () => backendComplete({
      systemMessage: 'You are a study coach. Write 2 short, encouraging, concrete sentences for a learner about this week of their study plan. Use only the facts given. No lists, no headings, no invented numbers, no promises of results.',
      userMessage: JSON.stringify(facts),
      modelRole: 'fast', responseFormat: 'text', feature: 'study-plan-note', userId, cache: false,
      ...overrides,
    }))
    await recordAiUse(cost, now)
    const text = String((res.ok && (res.text || res.raw)) || '').replace(/\s+/g, ' ').trim()
    return text.length >= 20 ? { note: text.slice(0, 400), source: 'ai' } : fallback
  } catch (e) {
    console.error('[study-plan] coach note failed', (e as Error)?.message)
    return fallback
  }
}

function readSlugsOf(p: Pick<StudyPlanDoc, 'week' | 'read_slugs'> | null): string[] {
  const done = (p?.week.items || []).filter((i) => i.kind === 'learn' && i.done_at && i.ref.slug).map((i) => i.ref.slug as string)
  return [...new Set([...(p?.read_slugs || []), ...done])].slice(-500)
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function createPlan(user: { id: string; tenantId?: string | null }, raw: unknown, now = new Date()): Promise<StudyPlanDoc> {
  const r = PlanInputSchema.safeParse(raw)
  if (!r.success) throw new StudyPlanError(400, r.error.issues[0] ? `${r.error.issues[0].path.join('.') || 'plan'}: ${r.error.issues[0].message}` : 'Invalid plan')
  const v = r.data
  const tz = validTz(v.timezone) ? v.timezone! : 'Asia/Kolkata'
  const domains = v.domains.filter((d) => DOMAIN_IDS.includes(d))
  let label = 'My skills plan'
  if (v.kind === 'company') {
    const p = await loadPattern(v.pattern_id)
    if (!p) throw new StudyPlanError(400, 'Choose a company test pattern.')
    label = p.label
  } else {
    if (!domains.length) throw new StudyPlanError(400, 'Choose at least one subject to focus on.')
    label = domains.map((d) => DEFAULT_DOMAINS.find((x) => x.id === d)?.label || d).slice(0, 3).join(', ')
  }
  const target: PlanTarget = { kind: v.kind, pattern_id: v.kind === 'company' ? v.pattern_id ?? null : null, label, domains, start_date: localDay(now.getTime(), tz), days: v.days, hours_per_week: v.hours_per_week }
  const col = await plansCol()
  const before = await col.findOne({ user_id: user.id }, { projection: { _id: 0 } })
  const { week, areas } = await buildFor(user.id, { target, tz, weekNo: 1, loadFactor: 1, readSlugs: readSlugsOf(before), now })
  const note = await coachNote(user.id, week, areas, null, target, now)
  const s = await getStudySettings().catch(() => DEFAULT_STUDY_SETTINGS)
  const reminders: Reminders = { email: v.reminders?.email ?? before?.reminders.email ?? true, whatsapp: v.reminders?.whatsapp ?? before?.reminders.whatsapp ?? false, hour: v.reminders?.hour ?? before?.reminders.hour ?? s.default_reminder_hour, timezone: tz, last_sent_day: null }
  const ts = nowIso()
  const doc: StudyPlanDoc = {
    id: before?.id ?? newId(), user_id: user.id, tenant_id: user.tenantId ?? null, target, weak_areas: areas, week: { ...week, note: note.note, note_source: note.source },
    history: [], reminders, status: 'active', practice_sets: {}, lock_until: null, next_adapt_at: weekEndInstant(week, tz), regenerated_at: ts,
    read_slugs: readSlugsOf(before), active_days: before?.active_days ?? [], created_at: before?.created_at ?? ts, updated_at: ts,
  }
  await col.replaceOne({ user_id: user.id }, doc, { upsert: true })
  // AUTO-088: a (new or rebuilt) study plan; one event per plan regeneration.
  void import('@/lib/automation/events').then(({ emit }) => emit('study_plan.created', {
    user_id: user.id, plan_id: doc.id, target_kind: target.kind, target_label: target.label, days: target.days, hours_per_week: target.hours_per_week, rebuilt: !!before,
  }, { idempotencyKey: `study_plan.created:${doc.id}:${ts}` })).catch((e) => console.error('[automation] emit failed:', e))
  return doc
}

/** Claim the plan for a rebuild (one writer at a time). */
async function claim(filter: Record<string, unknown>, now: Date): Promise<StudyPlanDoc | null> {
  const col = await plansCol()
  return col.findOneAndUpdate(
    { ...filter, $or: [{ lock_until: null }, { lock_until: { $exists: false } }, { lock_until: { $lt: now.toISOString() } }] } as never,
    { $set: { lock_until: new Date(now.getTime() + LOCK_MS).toISOString() } },
    { returnDocument: 'after', projection: { _id: 0 } },
  ) as Promise<StudyPlanDoc | null>
}

/**
 * Build the next week (adapt) or rebuild the current one (manual / agent regenerate):
 * fresh weak areas, load factor from last week's completion, done items kept on a rebuild.
 */
export async function regeneratePlan(userId: string, mode: 'rebuild' | 'advance', now = new Date()): Promise<StudyPlanDoc> {
  const p = await claim(mode === 'advance' ? { user_id: userId, status: 'active', next_adapt_at: { $lte: now.toISOString() } } : { user_id: userId, status: 'active' }, now)
  if (!p) throw new StudyPlanError(409, mode === 'advance' ? 'Nothing to adapt yet.' : 'Your plan is being updated. Try again in a minute.')
  const col = await plansCol()
  try {
    const tz = p.reminders.timezone || 'Asia/Kolkata'
    const today = localDay(now.getTime(), tz)
    // Which week are we in? (advance can skip weeks the learner was away for)
    const weekNo = Math.max(1, Math.floor(daysBetween(p.target.start_date, today) / 7) + 1)
    const daysLeft = p.target.days - (weekNo - 1) * 7
    if (daysLeft <= 0) {
      const history = [...p.history.filter((h) => h.week_no !== p.week.week_no), summarizeWeek(p.week)].slice(-30)
      await col.updateOne({ id: p.id }, { $set: { status: 'finished', history, lock_until: null, updated_at: nowIso() } })
      return { ...p, status: 'finished', history }
    }
    const advancing = weekNo !== p.week.week_no
    const last = summarizeWeek(p.week)
    const history = advancing ? [...p.history.filter((h) => h.week_no !== last.week_no), last].slice(-30) : p.history
    const loadFactor = advancing ? adaptLoad(p.week.load_factor || 1, last) : p.week.load_factor || 1
    const readSlugs = readSlugsOf(p)
    const { week, areas } = await buildFor(userId, { target: p.target, tz, weekNo, loadFactor, readSlugs, now })
    if (!advancing) {
      // Keep check-offs of the same items (stable ids) on a rebuild.
      const done = new Map(p.week.items.filter((i) => i.done_at).map((i) => [i.id, i.done_at]))
      for (const it of week.items) if (done.has(it.id)) it.done_at = done.get(it.id)
    }
    const note = await coachNote(userId, week, areas, advancing ? last : history[history.length - 1] ?? null, p.target, now)
    const next: Partial<StudyPlanDoc> = {
      week: { ...week, note: note.note, note_source: note.source }, weak_areas: areas, history, read_slugs: readSlugs,
      practice_sets: advancing ? {} : p.practice_sets ?? {}, next_adapt_at: weekEndInstant(week, tz), regenerated_at: nowIso(), lock_until: null, updated_at: nowIso(),
    }
    await col.updateOne({ id: p.id }, { $set: next })
    return { ...p, ...next } as StudyPlanDoc
  } catch (e) {
    await col.updateOne({ id: p.id }, { $set: { lock_until: null } }).catch(() => undefined)
    throw e
  }
}

export async function getPlan(userId: string): Promise<StudyPlanDoc | null> {
  return (await plansCol()).findOne({ user_id: userId }, { projection: { _id: 0 } })
}

export async function deletePlan(userId: string): Promise<void> {
  await (await plansCol()).deleteOne({ user_id: userId })
}

export interface PlanView {
  plan: Omit<StudyPlanDoc, 'practice_sets' | 'lock_until'>
  today: string
  today_items: PlanItem[]
  progress: { done: number; total: number; minutes_done: number; minutes_total: number }
  streak: { current: number; longest: number; activeToday: boolean }
  days_left: number
}

export async function planView(userId: string, now = new Date()): Promise<PlanView | null> {
  let p = await getPlan(userId)
  if (!p) return null
  // A week that ended while the scheduler was away is built on read.
  if (p.status === 'active' && p.next_adapt_at <= now.toISOString()) p = await regeneratePlan(userId, 'advance', now).catch(() => p) as StudyPlanDoc
  const tz = p.reminders.timezone || 'Asia/Kolkata'
  const today = localDay(now.getTime(), tz)
  const { getAcceptedDays } = await import('@/lib/activity-streak')
  const accepted = await getAcceptedDays(userId).catch(() => [] as string[])
  // Daily challenges tick themselves off when an accepted submission exists that day.
  const auto = p.week.items.filter((i) => i.kind === 'daily_challenge' && !i.done_at && accepted.includes(i.day))
  if (auto.length) {
    for (const it of auto) await setItemDone(userId, it.id, true, now).catch(() => undefined)
    p = (await getPlan(userId)) ?? p
  }
  const items = p.week.items
  const done = items.filter((i) => i.done_at)
  const streak = computeStreak([...(p.active_days || []), ...accepted], today)
  const { practice_sets: _ps, lock_until: _lk, ...rest } = p
  void _ps; void _lk
  return {
    plan: rest, today, today_items: items.filter((i) => i.day === today),
    progress: { done: done.length, total: items.length, minutes_done: done.reduce((a, i) => a + i.minutes, 0), minutes_total: items.reduce((a, i) => a + i.minutes, 0) },
    streak, days_left: Math.max(0, p.target.days - daysBetween(p.target.start_date, today)),
  }
}

/** Check an item off (or undo). First completion awards XP once (idempotent per item). */
export async function setItemDone(userId: string, itemId: string, done: boolean, now = new Date()): Promise<PlanItem> {
  if (!/^[a-z0-9]{1,16}$/.test(itemId)) throw new StudyPlanError(404, 'Item not found')
  const col = await plansCol()
  const p = await col.findOne({ user_id: userId, 'week.items.id': itemId }, { projection: { _id: 0, id: 1, week: 1, reminders: 1 } })
  const item = p?.week.items.find((i) => i.id === itemId)
  if (!p || !item) throw new StudyPlanError(404, 'Item not found')
  const day = localDay(now.getTime(), p.reminders.timezone || 'Asia/Kolkata')
  const at = done ? nowIso() : null
  await col.updateOne({ id: p.id, 'week.items.id': itemId } as never, {
    $set: { 'week.items.$.done_at': at, updated_at: nowIso() },
    ...(done ? { $addToSet: { active_days: day } } : {}),
  } as never)
  if (done && !item.done_at) {
    const { awardXpWithLevelUp } = await import('@/lib/xp-service')
    await awardXpWithLevelUp({ userId, amount: XP_PER_ITEM, reason: 'challenge_completed', submissionId: `study:${p.id}:${p.week.week_no}:${itemId}`, metadata: { source: 'study_plan', kind: item.kind }, quiet: true }).catch(() => undefined)
  }
  return { ...item, done_at: at }
}

export async function updateReminders(userId: string, raw: unknown): Promise<Reminders> {
  const r = RemindersSchema.safeParse(raw)
  if (!r.success) throw new StudyPlanError(400, r.error.issues[0]?.message || 'Invalid reminders')
  const p = await getPlan(userId)
  if (!p) throw new StudyPlanError(404, 'Create a study plan first.')
  const next: Reminders = { ...p.reminders, ...Object.fromEntries(Object.entries(r.data).filter(([k, v]) => v !== undefined && (k !== 'timezone' || validTz(v as string)))) }
  await (await plansCol()).updateOne({ id: p.id }, { $set: { reminders: next, updated_at: nowIso() } })
  return next
}

// ─── Practice sets ───────────────────────────────────────────────────────────

// ponytail: ordering / matching left out — their stored option order or pairs would give the answer away; add with server-side shuffling if needed.
const PRACTICE_TYPES = ['mcq', 'multiple_response', 'true_false', 'yes_no', 'fill_blanks', 'numeric', 'short_answer']

type Doc = Record<string, any>

export interface PracticeQuestion { id: string; type: string; prompt: string; options?: string[]; matrix?: { rows: string[]; columns: string[] }; table?: { columns: string[]; rows: string[] } }

const publicQ = (q: Doc): PracticeQuestion => ({
  id: q.id, type: q.type, prompt: String(q.question || q.title || ''),
  ...(Array.isArray(q.options) ? { options: q.options } : {}),
  ...(q.matrix ? { matrix: q.matrix } : {}),
  ...(q.table ? { table: q.table } : {}),
})

async function practiceItem(userId: string, itemId: string) {
  const p = await getPlan(userId)
  const item = p?.week.items.find((i) => i.id === itemId && i.kind === 'practice')
  if (!p || !item) throw new StudyPlanError(404, 'Practice set not found')
  return { p, item }
}

/** Draw (once) and return the set's questions without answers, plus any results already saved. */
export async function getPracticeSet(userId: string, itemId: string): Promise<{ item: PlanItem; questions: PracticeQuestion[]; results: { question_id: string; correct: boolean }[] }> {
  const { p, item } = await practiceItem(userId, itemId)
  const db = await getMongoDb()
  let ids = p.practice_sets?.[itemId]
  if (!ids?.length) {
    const domainDoc = ((await db.collection('question_domains').findOne({ id: item.ref.domain }, { projection: { _id: 0, id: 1, kind: 1, branch: 1 } })) as Pick<QuestionDomain, 'id' | 'kind' | 'branch'> | null)
      ?? DEFAULT_DOMAINS.find((d) => d.id === item.ref.domain) ?? { id: String(item.ref.domain), kind: 'skill' as const }
    const base = { is_active: { $ne: false }, review_status: { $ne: 'draft' }, type: { $in: PRACTICE_TYPES }, difficulty: item.ref.difficulty || 'Medium' }
    const want = Math.min(20, item.ref.count || 10)
    const pick = async (extra: Doc, n: number, exclude: string[]) => n <= 0 ? [] : (await db.collection('question_bank').aggregate<Doc>([{ $match: { $and: [domainBankFilter(domainDoc), base, extra, { id: { $nin: exclude } }] } }, { $sample: { size: n } }, { $project: { _id: 0, id: 1 } }]).toArray()).map((d) => String(d.id))
    const first = item.ref.topic ? await pick({ subject: item.ref.topic }, want, []) : []
    const rest = await pick({}, want - first.length, first)
    ids = [...first, ...rest]
    if (!ids.length) throw new StudyPlanError(409, 'There are no approved questions for this topic yet. Mark it done and try a Learn post instead.')
    // First draw wins (two tabs racing get the same set).
    await (await plansCol()).updateOne({ id: p.id, [`practice_sets.${itemId}`]: { $exists: false } } as never, { $set: { [`practice_sets.${itemId}`]: ids } } as never)
    ids = (await getPlan(userId))?.practice_sets?.[itemId] ?? ids
  }
  const qs = await db.collection('question_bank').find({ id: { $in: ids } }, { projection: { _id: 0, id: 1, type: 1, question: 1, title: 1, options: 1, matrix: 1, table: 1 } }).toArray()
  const qm = new Map(qs.map((q) => [String(q.id), q]))
  const results = await (await practiceCol()).find({ user_id: userId, item_id: itemId }, { projection: { _id: 0, question_id: 1, correct: 1 } }).toArray()
  return { item, questions: ids.map((id) => qm.get(id)).filter(Boolean).map((q) => publicQ(q as Doc)), results }
}

/** Grade answers (server-side, same grader as tests), save once per question, tick the item off. */
export async function submitPractice(userId: string, itemId: string, rawAnswers: unknown): Promise<{ results: { question_id: string; correct: boolean; answer?: string; explanation?: string }[]; score: number; total: number }> {
  const { p, item } = await practiceItem(userId, itemId)
  const ids = p.practice_sets?.[itemId] || []
  if (!ids.length) throw new StudyPlanError(409, 'Open the practice set first.')
  const answers = (rawAnswers && typeof rawAnswers === 'object' && !Array.isArray(rawAnswers) ? rawAnswers : {}) as Record<string, unknown>
  const db = await getMongoDb()
  const qs = await db.collection('question_bank').find({ id: { $in: ids } }, { projection: { _id: 0 } }).toArray() as Doc[]
  const { compareObjectiveAnswer } = await import('@/lib/grading')
  const col = await practiceCol()
  const out: { question_id: string; correct: boolean; answer?: string; explanation?: string }[] = []
  for (const q of qs) {
    const v = answers[q.id]
    const s = Array.isArray(v) ? v.map((x) => String(x ?? '')).join(', ') : typeof v === 'string' || typeof v === 'number' ? String(v).slice(0, 2000) : ''
    if (!s.trim()) continue
    const correct = compareObjectiveAnswer({ type: q.type, options: q.options, answer: String(q.answer ?? ''), tolerance: q.tolerance, pairs: q.pairs, matrix: q.matrix, table: q.table }, s).correct
    try {
      await col.insertOne({ id: newId(), user_id: userId, plan_id: p.id, item_id: itemId, domain: String(item.ref.domain), topic: item.ref.topic ?? null, difficulty: item.ref.difficulty || 'Medium', question_id: String(q.id), correct, created_at: nowIso() })
    } catch (e) {
      if ((e as { code?: number })?.code !== 11000) throw e // answered before: first answer counts
    }
    out.push({ question_id: String(q.id), correct, answer: typeof q.answer === 'string' ? q.answer.slice(0, 500) : undefined, explanation: typeof q.explanation === 'string' ? q.explanation.slice(0, 2000) : undefined })
  }
  if (out.length) await setItemDone(userId, itemId, true).catch(() => undefined)
  return { results: out, score: out.filter((r) => r.correct).length, total: ids.length }
}

// ─── Scheduler ───────────────────────────────────────────────────────────────

/**
 * Hourly: (1) adapt plans whose week has ended (claimed per plan), (2) send the day's reminder
 * at each learner's chosen local hour (claimed per plan + local day, so a retry never double-sends).
 */
export async function runStudyPlanTick(now = new Date(), opts: { maxAdapt?: number; maxRemind?: number } = {}): Promise<{ adapted: number; reminded: number; finished: number }> {
  const col = await plansCol()
  const rep = { adapted: 0, reminded: 0, finished: 0 }
  const due = await col.find({ status: 'active', next_adapt_at: { $lte: now.toISOString() } }, { projection: { _id: 0, user_id: 1 } }).limit(opts.maxAdapt ?? 100).toArray()
  for (const d of due) {
    try {
      const r = await regeneratePlan(d.user_id, 'advance', now)
      if (r.status === 'finished') rep.finished++
      else rep.adapted++
    } catch (e) {
      if (!(e instanceof StudyPlanError)) console.error('[study-plan] adapt failed', (e as Error)?.message)
    }
  }
  const candidates = await col.find({ status: 'active', $or: [{ 'reminders.email': true }, { 'reminders.whatsapp': true }] }, { projection: { _id: 0, id: 1, user_id: 1, reminders: 1, week: 1 } }).limit(opts.maxRemind ?? 2000).toArray()
  for (const p of candidates) {
    const tz = p.reminders.timezone || 'Asia/Kolkata'
    if (localHour(now.getTime(), tz) !== p.reminders.hour) continue
    const day = localDay(now.getTime(), tz)
    const open = p.week.items.filter((i) => i.day === day && !i.done_at)
    if (!open.length) continue
    const claimed = await col.updateOne({ id: p.id, 'reminders.last_sent_day': { $ne: day } }, { $set: { 'reminders.last_sent_day': day } })
    if (!claimed.modifiedCount) continue
    const mins = open.reduce((a, i) => a + i.minutes, 0)
    const { notify } = await import('@/lib/notifications')
    // The learner chose this reminder and its hour: 'subscribed' — de-duplicated per plan + day, never
    // capped (AUTO-108). Should it ever be held, the day's claim is undone so a later run can retry (AUTO-109).
    let held = false
    const sent = await notify({
      budget: { class: 'subscribed', topic: 'study-plan-reminder', object: `${p.id}:${day}`, source: 'study-plan' },
      on_held: (o) => { held = o === 'capped' },
      user_id: p.user_id, type: 'study_plan.reminder', title: "Today's study plan",
      message: `${open.length} item${open.length === 1 ? '' : 's'} left today (about ${mins} min): ${open.slice(0, 2).map((i) => i.title).join('; ').slice(0, 160)}`,
      title_i18n: { key: 'studyPlan.title' },
      message_i18n: { key: 'studyPlan.message', params: { count: open.length, mins, items: open.slice(0, 2).map((i) => i.title).join('; ').slice(0, 160) } },
      link: '/dashboard/study-plan', icon: 'calendar-check',
      // E-mail honours the learner's notification preferences + unsubscribe; WhatsApp only with consent (lib/whatsapp-send).
      send_email: p.reminders.email, send_whatsapp: p.reminders.whatsapp, skip_push: false,
    }).catch(() => null)
    if (sent) rep.reminded++
    else if (held) await col.updateOne({ id: p.id, 'reminders.last_sent_day': day }, { $unset: { 'reminders.last_sent_day': '' } } as never).catch(() => {})
  }
  return rep
}
