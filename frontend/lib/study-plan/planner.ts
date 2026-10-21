/**
 * Deterministic weekly planner (pure, unit tested in tests/study-plan.test.ts).
 *
 * Budget = hours/week × 60 × load factor (adapted weekly from completion, 0.6–1.2).
 * A daily challenge each day (when the week has room), then the rest is split Learn 30 %,
 * practice 45 %, tests 15 % (of 90 %) — in the last quarter of the plan (or its final week)
 * Learn 10 %, practice 40 %, tests 40 %. Practice absorbs unused Learn / test time.
 * Areas are taken in priority order (weak-areas.ts); each gets a Learn post that matches its
 * topic (not read before, level by mastery) and practice sets at its next difficulty, at most
 * three sets per area per week. Company targets get timed company tests at a level that
 * follows mastery (easy → moderate → tough). Items are spread over the week's days (longest
 * first onto the lightest day; tests on the last days). Same input → same week.
 */
import { DEFAULT_DOMAINS } from '@/lib/question-bot/domains'
import type { Difficulty, ItemKind, PlanItem, PlanTarget, PlanWeek, WeakArea, WeekSummary } from './types'

export interface CatalogPost { slug: string; title: string; tags: string[]; category: string; level: string; reading_minutes: number }
export interface PlannerCatalog {
  posts: CatalogPost[]
  /** company pattern for company targets */
  pattern?: { id: string; label: string; minutes: number } | null
}
export interface PlannerInput {
  target: PlanTarget
  weakAreas: WeakArea[]
  catalog: PlannerCatalog
  weekNo: number
  /** YYYY-MM-DD (learner's local date) */
  startDay: string
  /** days left in the plan including startDay */
  daysLeft: number
  loadFactor: number
  /** Learn slugs read already (never planned again) */
  readSlugs?: string[]
}

export const PRACTICE_COUNT = 10
export const PRACTICE_MINUTES = 20
export const DAILY_MINUTES = 15
export const MAX_SETS_PER_AREA = 3

/** Plain FNV-1a → base36 (client-safe stable ids). */
export function stableId(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
  return h.toString(36).padStart(7, '0')
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

export function daysBetween(a: string, b: string): number {
  const p = (s: string) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d) }
  return Math.round((p(b) - p(a)) / 86_400_000)
}

/** The learner's local calendar date. */
export function localDay(nowMs: number, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(nowMs))
  } catch {
    return new Date(nowMs).toISOString().slice(0, 10)
  }
}

export function localHour(nowMs: number, tz: string): number {
  try {
    return Number(new Intl.DateTimeFormat('en-US', { timeZone: tz || 'UTC', hour: '2-digit', hourCycle: 'h23' }).format(new Date(nowMs))) % 24
  } catch {
    return new Date(nowMs).getUTCHours()
  }
}

/** Learn categories that fit each bank domain (lib/learn/types.ts). */
const DOMAIN_CATEGORIES: Record<string, string[]> = {
  cse: ['dsa', 'system-design', 'databases'], it: ['technologies', 'databases', 'cloud'], ai_ds: ['ai-ml'], data_science: ['ai-ml'],
  java: ['languages'], python: ['languages'], javascript: ['languages', 'technologies'], react: ['technologies'], node: ['technologies'],
  sql: ['databases'], devops: ['cloud'], cloud: ['cloud'], cyber_security: ['security'], aptitude: ['interview-prep'], interview: ['interview-prep', 'career'],
}

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9+#]+/).filter((w) => w.length > 2 && !['and', 'the', 'with', 'for'].includes(w))

export function matchPost(area: WeakArea, posts: CatalogPost[], exclude: Set<string>): CatalogPost | null {
  const cats = DOMAIN_CATEGORIES[area.domain] || []
  const want = new Set(words(`${area.topic || ''} ${area.topic ? '' : area.domain.replace(/_/g, ' ')}`))
  const level = area.mastery < 0.45 ? 'beginner' : area.mastery < 0.75 ? 'intermediate' : 'advanced'
  let best: { p: CatalogPost; score: number } | null = null
  for (const p of posts) {
    if (exclude.has(p.slug)) continue
    const hay = new Set([...p.tags.flatMap(words), ...words(p.title)])
    let overlap = 0
    for (const w of want) if (hay.has(w)) overlap++
    const catHit = cats.includes(p.category)
    if (!overlap && !catHit) continue
    const score = overlap * 3 + (catHit ? 2 : 0) + (p.level === level ? 1 : 0)
    if (!best || score > best.score || (score === best.score && p.slug < best.p.slug)) best = { p, score }
  }
  return best?.p ?? null
}

export function companyLevel(areas: WeakArea[]): 'easy' | 'moderate' | 'tough' {
  const tested = areas.filter((a) => a.evidence > 0 && a.domain !== 'interview')
  if (!tested.length) return 'easy'
  const avg = tested.reduce((s, a) => s + a.mastery, 0) / tested.length
  return avg < 0.5 ? 'easy' : avg < 0.75 ? 'moderate' : 'tough'
}

/** Next week's load from this week's completion (minutes done / planned). */
export function adaptLoad(prev: number, s: Pick<WeekSummary, 'minutes_planned' | 'minutes_done'>): number {
  const r = s.minutes_planned > 0 ? s.minutes_done / s.minutes_planned : 1
  const f = r < 0.4 ? prev * 0.8 : r < 0.7 ? prev * 0.9 : r > 0.9 ? prev * 1.1 : prev
  return Math.round(Math.min(1.2, Math.max(0.6, f)) * 100) / 100
}

export function summarizeWeek(w: PlanWeek): WeekSummary {
  const done = w.items.filter((i) => i.done_at)
  return {
    week_no: w.week_no, start: w.start, end: w.end, planned: w.items.length, done: done.length,
    minutes_planned: w.items.reduce((a, i) => a + i.minutes, 0), minutes_done: done.reduce((a, i) => a + i.minutes, 0),
  }
}

const domainLabels = new Map<string, string>(DEFAULT_DOMAINS.map((d) => [d.id, d.label]))

function practiceHref(id: string) { return `/dashboard/study-plan/practice/${id}` }

export function buildWeek(input: PlannerInput): PlanWeek {
  const days = Math.max(1, Math.min(7, Math.floor(input.daysLeft)))
  const budget = Math.max(DAILY_MINUTES * days, Math.round(input.target.hours_per_week * 60 * input.loadFactor * (days / 7)))
  const finalPhase = input.daysLeft <= Math.max(7, Math.round(input.target.days * 0.25))
  const share = finalPhase ? { daily: 0.1, learn: 0.1, practice: 0.4, tests: 0.4 } : { daily: 0.1, learn: 0.3, practice: 0.45, tests: 0.15 }
  const isCompany = input.target.kind === 'company' && !!input.catalog.pattern
  if (!isCompany) { share.practice += share.tests * 0.6; share.learn += share.tests * 0.4; share.tests = 0 }
  const areas = input.weakAreas.filter((a) => a.priority > 0)
  const studyAreas = areas.filter((a) => a.domain !== 'interview')
  const items: Omit<PlanItem, 'day'>[] = []
  const mk = (kind: ItemKind, key: string, rest: Omit<PlanItem, 'id' | 'kind' | 'day' | 'href'> & { href?: string }): Omit<PlanItem, 'day'> => {
    const id = stableId(`${input.weekNo}|${kind}|${key}`)
    return { id, kind, href: rest.href ?? (kind === 'practice' ? practiceHref(id) : '/dashboard/study-plan'), ...rest }
  }

  // Daily challenge — one a day while the budget allows.
  // One a day when the week has room for it (≥ 3× the daily minutes), else what the share allows.
  const dailyN = budget >= days * DAILY_MINUTES * 3 ? days : Math.min(days, Math.floor((budget * share.daily) / DAILY_MINUTES) || 1)
  const daily: Omit<PlanItem, 'day'>[] = Array.from({ length: dailyN }, (_, i) => mk('daily_challenge', `d${i}`, { title: 'Daily coding challenge', minutes: DAILY_MINUTES, reason: 'Keeps your streak going and your problem solving warm.', ref: {}, href: '/dashboard' }))

  // The rest of the week (after daily challenges) is split by the remaining shares.
  const rest = Math.max(0, budget - daily.length * DAILY_MINUTES)
  const scale = 1 / (1 - share.daily)
  let used = 0
  // Tests (company targets).
  let testBudget = Math.round(rest * share.tests * scale)
  const tests: Omit<PlanItem, 'day'>[] = []
  if (isCompany && input.catalog.pattern) {
    const p = input.catalog.pattern
    const level = companyLevel(areas)
    const want = finalPhase ? 2 : 1
    for (let i = 0; i < want && (i === 0 || testBudget >= p.minutes * 0.6); i++) {
      tests.push(mk('company_test', `${p.id}:${i}`, { title: `${p.label} practice test (${level})`, minutes: p.minutes, reason: finalPhase ? 'Exam is close: full timed runs under real conditions.' : 'A timed run shows how your sections are moving.', ref: { pattern_id: p.id, level }, href: `/dashboard/company-tests/${encodeURIComponent(p.id)}` }))
      testBudget -= p.minutes
      used += p.minutes
    }
  }
  // Interview gaps → one AI mock interview when an interview area is weak.
  const interviewArea = areas.find((a) => a.domain === 'interview' && a.mastery < 0.7)
  if (interviewArea) used += 30
  if (interviewArea) tests.push(mk('interview', interviewArea.key, { title: `Mock interview: ${interviewArea.topic || 'practice round'}`, minutes: 30, reason: `Your last interviews showed a gap in ${interviewArea.topic || 'answers'}.`, area_key: interviewArea.key, ref: {}, href: '/dashboard/interviews/ai-mock' }))

  // Learn posts.
  let learnBudget = Math.round(rest * share.learn * scale)
  const seen = new Set(input.readSlugs || [])
  const learn: Omit<PlanItem, 'day'>[] = []
  for (const a of studyAreas) {
    if (learnBudget < 10) break
    const p = matchPost(a, input.catalog.posts, seen)
    if (!p) continue
    seen.add(p.slug)
    const minutes = Math.min(30, Math.max(8, (p.reading_minutes || 8) + 5))
    learn.push(mk('learn', p.slug, { title: p.title, minutes, reason: `Builds ${a.topic || domainLabels.get(a.domain) || a.domain} (about ${Math.round(a.mastery * 100)} % right so far).`, area_key: a.key, ref: { slug: p.slug }, href: `/learn/${encodeURIComponent(p.slug)}` }))
    learnBudget -= minutes
    used += minutes
  }

  // Practice sets — round robin over areas by priority, ≤ 3 per area.
  // Practice takes whatever is left (its own share plus unused Learn / test time).
  let practiceBudget = rest - used
  const practice: Omit<PlanItem, 'day'>[] = []
  const perArea = new Map<string, number>()
  const pool = studyAreas.slice(0, 8)
  for (let round = 0; round < MAX_SETS_PER_AREA && practiceBudget >= PRACTICE_MINUTES && pool.length; round++) {
    for (const a of pool) {
      if (practiceBudget < PRACTICE_MINUTES) break
      // weaker areas get extra rounds: round 1 needs priority ≥ 0.15, round 2 ≥ 0.3
      if (round > 0 && a.priority < 0.15 * round) continue
      const n = perArea.get(a.key) || 0
      const diff: Difficulty = n === 0 ? a.next_difficulty : a.next_difficulty === 'Easy' ? 'Medium' : a.next_difficulty
      practice.push(mk('practice', `${a.key}:${n}`, { title: `${PRACTICE_COUNT} ${diff.toLowerCase()} questions: ${a.topic || domainLabels.get(a.domain) || a.domain}`, minutes: PRACTICE_MINUTES, reason: n === 0 ? `One of your weakest areas right now.` : 'A second set to lock it in.', area_key: a.key, ref: { domain: a.domain, topic: a.topic, difficulty: diff, count: PRACTICE_COUNT } }))
      perArea.set(a.key, n + 1)
      practiceBudget -= PRACTICE_MINUTES
    }
  }

  // Spread over the days.
  const dayKeys = Array.from({ length: days }, (_, i) => addDays(input.startDay, i))
  const load = dayKeys.map(() => 0)
  const placed: PlanItem[] = []
  daily.forEach((it, i) => { placed.push({ ...it, day: dayKeys[i % days] }); load[i % days] += it.minutes })
  tests.forEach((it, i) => { const d = Math.max(0, days - 1 - i * 3); placed.push({ ...it, day: dayKeys[d] }); load[d] += it.minutes })
  for (const it of [...learn, ...practice].sort((x, y) => y.minutes - x.minutes || x.id.localeCompare(y.id))) {
    let best = 0
    for (let d = 1; d < days; d++) if (load[d] < load[best]) best = d
    placed.push({ ...it, day: dayKeys[best] })
    load[best] += it.minutes
  }
  const order: Record<ItemKind, number> = { daily_challenge: 0, learn: 1, practice: 2, interview: 3, mock_test: 4, company_test: 5 }
  placed.sort((x, y) => x.day.localeCompare(y.day) || order[x.kind] - order[y.kind] || x.id.localeCompare(y.id))
  return { week_no: input.weekNo, start: dayKeys[0], end: dayKeys[days - 1], load_factor: input.loadFactor, items: placed }
}

/** Template coach note (used when AI is off, over its cap, or fails). */
export function templateNote(week: PlanWeek, areas: WeakArea[], last?: WeekSummary | null): string {
  const top = areas.filter((a) => a.priority > 0).slice(0, 2).map((a) => a.topic || domainLabels.get(a.domain) || a.domain)
  const mins = week.items.reduce((s, i) => s + i.minutes, 0)
  const lastLine = last && last.planned ? ` Last week you finished ${last.done} of ${last.planned} items.` : ''
  return `This week: about ${Math.round(mins / 60 * 10) / 10} hours, focused on ${top.length ? top.join(' and ') : 'your target topics'}.${lastLine}`
}
