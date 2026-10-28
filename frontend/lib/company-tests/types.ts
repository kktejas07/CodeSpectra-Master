/**
 * Company exam patterns (collection `company_exam_patterns`) and the practice
 * versions built from them (`company_test_versions`). Pure and client-safe:
 * the admin page, the company page and the server routes all import from here.
 *
 * A pattern describes one company's hiring test (sections, question counts,
 * timing, negative marking, cut-off). Seeds are plausible public patterns and
 * start `verified: false` — an admin checks them against the source before
 * relying on them. Nothing here claims to be the official pattern.
 */
import { z } from 'zod'
import { isQuestionType, resolveQuestionType, type QuestionType } from '@/lib/question-types'

export const PRACTICE_LEVELS = ['easy', 'moderate', 'tough'] as const
export type PracticeLevel = (typeof PRACTICE_LEVELS)[number]
export const LEVEL_LABEL: Record<PracticeLevel, string> = { easy: 'Easy', moderate: 'Moderate', tough: 'Tough' }

export type BankDifficulty = 'Easy' | 'Medium' | 'Hard'
export const BANK_DIFFICULTIES: readonly BankDifficulty[] = ['Easy', 'Medium', 'Hard']

/**
 * Share of each bank difficulty in a version. Easy = bank Easy; Moderate =
 * mostly Medium with some Easy and Hard; Tough = mostly Hard.
 */
export const LEVEL_MIX: Record<PracticeLevel, Record<BankDifficulty, number>> = {
  easy: { Easy: 1, Medium: 0, Hard: 0 },
  moderate: { Easy: 0.2, Medium: 0.6, Hard: 0.2 },
  tough: { Easy: 0, Medium: 0.3, Hard: 0.7 },
}

export interface PatternSection {
  id: string
  name: string
  questionCount: number
  timeMinutes: number
  /** Question types this section may hold (canonical ids from lib/question-types). */
  questionTypes: QuestionType[]
  /** Topic categories, e.g. quant, logical, verbal, coding. */
  categories: string[]
  /** Section cut-off; falls back to the pattern's cut-off. */
  cutoffPercent?: number
}

export interface CompanyExamPattern {
  id: string
  companySlug: string
  companyName: string
  examName: string
  sections: PatternSection[]
  /** Fraction of a question's marks taken off for a wrong answer (0 = none, 0.25 = a quarter). */
  negativeMarking: number
  /** Overall cut-off, percent of total marks. */
  cutoffPercent: number
  notes?: string
  sourceUrl?: string
  /** ISO date (YYYY-MM-DD) the pattern was last checked by a person. */
  lastReviewed?: string
  /** False until an admin has checked the pattern against a public source. */
  verified: boolean
  active: boolean
  createdAt: string
  updatedAt: string
  updatedBy?: string
}

export interface VersionSection {
  sectionId: string
  name: string
  timeMinutes: number
  questionIds: string[]
  /** AI drafts generated for the shortfall, waiting for review. */
  pendingDraftIds: string[]
  /** Questions still missing after bank + drafts. */
  missing: number
}

export interface CompanyTestVersion {
  id: string // `${patternId}:${level}`
  patternId: string
  companySlug: string
  level: PracticeLevel
  sections: VersionSection[]
  /** True when every section has its full count of approved questions. */
  complete: boolean
  builtAt: string
  refreshedAt?: string
  /** Bumped on every build/refresh. */
  revision: number
}

export const MAX_PATTERN_SECTIONS = 8
export const MAX_SECTION_QUESTIONS = 100

const slug = z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{0,62}$/, 'Use lowercase letters, numbers and dashes')
const category = z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9 _-]{0,39}$/, 'Categories are short words like quant or coding')
const questionType = z.string().refine((t) => isQuestionType(t), 'Unknown question type').transform((t) => resolveQuestionType(t) as QuestionType)
const httpUrl = z.string().trim().max(500).refine((u) => {
  try {
    const p = new URL(u).protocol
    return p === 'https:' || p === 'http:'
  } catch {
    return false
  }
}, 'Enter a full http(s) link')

export const patternSectionSchema = z.object({
  id: z.string().trim().regex(/^[A-Za-z0-9_-]{1,40}$/).optional(),
  name: z.string().trim().min(1).max(80),
  questionCount: z.number().int().min(1).max(MAX_SECTION_QUESTIONS),
  timeMinutes: z.number().int().min(1).max(300),
  questionTypes: z.array(questionType).min(1).max(12),
  categories: z.array(category).max(10).default([]),
  cutoffPercent: z.number().min(0).max(100).optional(),
})

/** Admin create/update body. */
export const patternInputSchema = z.object({
  id: slug.optional(),
  companySlug: slug,
  companyName: z.string().trim().min(1).max(80),
  examName: z.string().trim().min(2).max(120),
  sections: z.array(patternSectionSchema).min(1).max(MAX_PATTERN_SECTIONS),
  negativeMarking: z.number().min(0).max(1).default(0),
  cutoffPercent: z.number().min(0).max(100).default(60),
  notes: z.string().trim().max(2000).optional(),
  sourceUrl: z.union([httpUrl, z.literal('')]).optional(),
  lastReviewed: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal('')]).optional(),
  verified: z.boolean().default(false),
  active: z.boolean().default(true),
})
export type PatternInput = z.infer<typeof patternInputSchema>

/** Normalize a validated input into a stored pattern (ids for sections, slug id). Pure. */
export function patternFromInput(input: PatternInput, now: string, actor?: string, existing?: CompanyExamPattern): CompanyExamPattern {
  const usedIds = new Set<string>()
  const sections = input.sections.map((s, i) => {
    let id = s.id || `s${i + 1}`
    while (usedIds.has(id)) id = `${id}_${i + 1}`
    usedIds.add(id)
    return {
      id,
      name: s.name,
      questionCount: s.questionCount,
      timeMinutes: s.timeMinutes,
      questionTypes: [...new Set(s.questionTypes)],
      categories: [...new Set(s.categories)],
      ...(s.cutoffPercent !== undefined ? { cutoffPercent: s.cutoffPercent } : {}),
    }
  })
  const id = existing?.id || input.id || slugify(`${input.companySlug}-${input.examName}`)
  return {
    id,
    companySlug: input.companySlug,
    companyName: input.companyName,
    examName: input.examName,
    sections,
    negativeMarking: input.negativeMarking,
    cutoffPercent: input.cutoffPercent,
    ...(input.notes ? { notes: input.notes } : {}),
    ...(input.sourceUrl ? { sourceUrl: input.sourceUrl } : {}),
    ...(input.lastReviewed ? { lastReviewed: input.lastReviewed } : {}),
    verified: input.verified,
    active: input.active,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    ...(actor ? { updatedBy: actor } : {}),
  }
}

export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 63) || 'pattern'
}

export const versionId = (patternId: string, level: PracticeLevel): string => `${patternId}:${level}`

export function isPracticeLevel(v: unknown): v is PracticeLevel {
  return typeof v === 'string' && (PRACTICE_LEVELS as readonly string[]).includes(v)
}

export function patternTotals(p: Pick<CompanyExamPattern, 'sections'>): { questions: number; minutes: number } {
  return p.sections.reduce((t, s) => ({ questions: t.questions + s.questionCount, minutes: t.minutes + s.timeMinutes }), { questions: 0, minutes: 0 })
}

/** Tags stamped on bank questions used by (or generated for) a company test. */
export function companyTags(companySlug: string, patternId: string, level: PracticeLevel): string[] {
  return [`company:${companySlug}`, `company-test:${patternId}:${level}`]
}

/** Admin settings for the company test bot (doc `company_test_settings` key 'settings'). */
export interface CompanyTestSettings {
  /** Weekly rotation job. Off by default. */
  refreshEnabled: boolean
  /** Share of each version's questions swapped per refresh, 0–100. */
  rotatePercent: number
  /** AI-generated questions per UTC day (all patterns). */
  aiDailyQuestionCap: number
  /** Estimated AI spend per calendar month (USD). */
  aiMonthlyCostCapUsd: number
}

export const DEFAULT_SETTINGS: CompanyTestSettings = {
  refreshEnabled: false,
  rotatePercent: 30,
  aiDailyQuestionCap: 40,
  aiMonthlyCostCapUsd: 5,
}

export const settingsSchema = z.object({
  refreshEnabled: z.boolean().optional(),
  rotatePercent: z.number().int().min(5).max(80).optional(),
  aiDailyQuestionCap: z.number().int().min(0).max(2000).optional(),
  aiMonthlyCostCapUsd: z.number().min(0).max(1000).optional(),
})

export function mergeSettings(raw: unknown, base: CompanyTestSettings = DEFAULT_SETTINGS): CompanyTestSettings {
  const p = settingsSchema.safeParse(raw ?? {})
  return p.success ? { ...base, ...Object.fromEntries(Object.entries(p.data).filter(([, v]) => v !== undefined)) } : base
}

/** How many more questions the AI caps allow today (0 once either cap is reached). */
export function remainingUnderCaps(u: { today: number; monthCostUsd: number }, s: Pick<CompanyTestSettings, 'aiDailyQuestionCap' | 'aiMonthlyCostCapUsd'>): number {
  if (u.monthCostUsd >= s.aiMonthlyCostCapUsd) return 0
  return Math.max(0, s.aiDailyQuestionCap - u.today)
}

export interface VersionSummary {
  level: PracticeLevel
  built: boolean
  complete: boolean
  questions: number
  wanted: number
  pending: number
  missing: number
  builtAt?: string
  refreshedAt?: string
}

/** Status of one level of a pattern for admin and learner screens (no question ids). */
export function versionSummary(pattern: Pick<CompanyExamPattern, 'sections'>, level: PracticeLevel, v?: CompanyTestVersion | null): VersionSummary {
  const wanted = patternTotals(pattern).questions
  if (!v) return { level, built: false, complete: false, questions: 0, wanted, pending: 0, missing: wanted }
  const questions = v.sections.reduce((n, s) => n + s.questionIds.length, 0)
  const pending = v.sections.reduce((n, s) => n + s.pendingDraftIds.length, 0)
  return {
    level, built: true, complete: v.complete, questions, wanted, pending,
    missing: Math.max(0, wanted - questions - pending),
    builtAt: v.builtAt, ...(v.refreshedAt ? { refreshedAt: v.refreshedAt } : {}),
  }
}
