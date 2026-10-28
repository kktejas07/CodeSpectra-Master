/**
 * Paid, proctored CodeSpectra certifications — shared types, the program
 * schema (zod) and starter blueprints (pure, client-safe).
 *
 * A program is an exam blueprint (sections drawn from the approved question
 * bank by domain / type / difficulty), a pass mark, mandatory proctoring with
 * a trust threshold + human review, an attempt policy and a price per attempt
 * in integer minor units (INR paise / US cents). Passing (and clearing review)
 * issues a credential into the skill passport with a public verify page and
 * an expiry; holders renew by passing again.
 */
import { z } from 'zod'

export const PROGRAM_STATUSES = ['draft', 'published', 'retired'] as const
export type ProgramStatus = (typeof PROGRAM_STATUSES)[number]

export const PROGRAM_LEVELS = ['foundation', 'associate', 'practitioner', 'professional'] as const
export type ProgramLevel = (typeof PROGRAM_LEVELS)[number]

export const CERT_CURRENCIES = ['INR', 'USD'] as const
export type CertCurrency = (typeof CERT_CURRENCIES)[number]

/** Bank question types a section may draw (objective + coding: all auto-gradable or reviewer-graded). */
export const SECTION_TYPES = ['mcq', 'multiple_response', 'true_false', 'fill_blanks', 'numeric', 'output_prediction', 'coding', 'debugging', 'sql'] as const

export const REVIEW_POLICIES = ['always', 'below_threshold'] as const
export type ReviewPolicy = (typeof REVIEW_POLICIES)[number]

const slugRe = /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/
const idRe = /^[a-z0-9_]{1,40}$/

export const DifficultyMixSchema = z.object({
  Easy: z.number().int().min(0).max(200),
  Medium: z.number().int().min(0).max(200),
  Hard: z.number().int().min(0).max(200),
}).strict()

export const BlueprintSectionSchema = z.object({
  id: z.string().regex(idRe),
  name: z.string().trim().min(1).max(80),
  /** Question-bot domain ids (lib/question-bot/domains.ts) the section draws from. */
  domains: z.array(z.string().regex(idRe)).min(1).max(8),
  /** Optional bank `subject` filter (exact match, any of). */
  subjects: z.array(z.string().trim().min(1).max(80)).max(12).default([]),
  types: z.array(z.enum(SECTION_TYPES)).min(1).max(SECTION_TYPES.length),
  difficulty: DifficultyMixSchema,
  /** Minutes for this section; null shares the overall time. */
  minutes: z.number().int().min(1).max(300).nullable().default(null),
}).strict()

export const PriceSchema = z.object({
  INR: z.number().int().min(0).max(100_000_00).nullable().default(null),
  USD: z.number().int().min(0).max(10_000_00).nullable().default(null),
}).strict()

export const ProgramInputSchema = z.object({
  slug: z.string().regex(slugRe),
  title: z.string().trim().min(3).max(80),
  summary: z.string().trim().min(10).max(400),
  description: z.string().trim().max(4000).default(''),
  level: z.enum(PROGRAM_LEVELS),
  /** Canonical skill names the credential is evidence for (passport). */
  skills: z.array(z.string().trim().min(1).max(40)).min(1).max(10),
  blueprint: z.object({
    sections: z.array(BlueprintSectionSchema).min(1).max(8),
    duration_min: z.number().int().min(10).max(300),
    pass_percent: z.number().int().min(30).max(100),
  }).strict(),
  proctoring: z.object({
    /** 0–100: attempts with a lower integrity trust score are held for review (and never auto-issued). */
    min_trust: z.number().int().min(0).max(100),
    review: z.enum(REVIEW_POLICIES),
    /** Require the Device Audit browser extension (strict proctoring). */
    strict_extension: z.boolean().default(false),
  }).strict(),
  attempts: z.object({
    cooldown_days: z.number().int().min(0).max(365),
    max_per_year: z.number().int().min(1).max(12),
  }).strict(),
  price: PriceSchema,
  validity_months: z.number().int().min(6).max(60),
  /** Holders may renew from this many days before expiry. */
  renewal_window_days: z.number().int().min(0).max(365).default(90),
}).strict()

export type ProgramInput = z.infer<typeof ProgramInputSchema>
export type BlueprintSection = z.infer<typeof BlueprintSectionSchema>
export type DifficultyMix = z.infer<typeof DifficultyMixSchema>

export interface ProgramDoc extends ProgramInput {
  id: string
  status: ProgramStatus
  /** Bumped on every save of a published program; attempts record the version they were built from. */
  version: number
  created_by: string
  created_at: string
  updated_at: string
  published_at?: string | null
}

/** What the public catalog shows (no blueprint internals beyond counts). */
export interface PublicProgram {
  id: string
  slug: string
  title: string
  summary: string
  description: string
  level: ProgramLevel
  skills: string[]
  questions: number
  sections: Array<{ name: string; questions: number }>
  duration_min: number
  pass_percent: number
  validity_months: number
  price: { INR: number | null; USD: number | null }
  attempts: { cooldown_days: number; max_per_year: number }
  updated_at: string
}

export const ATTEMPT_STATUSES = ['ready', 'in_review', 'passed', 'failed', 'rejected', 'void'] as const
export type AttemptStatus = (typeof ATTEMPT_STATUSES)[number]

export interface AttemptDoc {
  id: string
  user_id: string
  program_id: string
  program_slug: string
  program_version: number
  order_id: string
  /** Renewal of this credential id (when the holder renews). */
  renews_credential_id: string | null
  exam_id: string
  invite_token: string
  /** Bank question ids drawn for this attempt (exposure control + no repeats on retakes). */
  bank_question_ids: string[]
  status: AttemptStatus
  score_pct: number | null
  trust_score: number | null
  flags: string[]
  review: { status: 'pending' | 'approved' | 'rejected' | null; by: string | null; at: string | null; note: string }
  credential_id: string | null
  submitted_at: string | null
  decided_at: string | null
  created_at: string
  updated_at: string
}

/** cancelled = replaced by a newer checkout before payment (CORE-040); a late payment on it is still settled. */
export const ORDER_STATUSES = ['pending', 'paid', 'failed', 'refunded', 'cancelled'] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

export interface CertOrderDoc {
  id: string
  user_id: string
  user_email: string
  program_id: string
  program_slug: string
  renews_credential_id: string | null
  currency: CertCurrency
  amount: number
  gateway: 'phonepe' | 'razorpay' | 'stripe' | 'free'
  payment: { ref: string | null; intent: string | null; txn: string | null; paid_amount: number | null }
  status: OrderStatus
  attempt_id: string | null
  /**
   * CORE-040: paid while another attempt for the program was already open
   * (double checkout). No attempt is created; the payment is refunded
   * (`refund.ok`) or left for an admin (`refund.ok === false`).
   */
  duplicate?: { attempt_id: string; at: string } | null
  refund?: { ok: boolean; ref: string | null; at: string; error?: string } | null
  created_at: string
  updated_at: string
  paid_at: string | null
}

export type CredentialStatus = 'active' | 'renewed' | 'revoked'

export interface CredentialDoc {
  id: string
  user_id: string
  holder_name: string
  program_id: string
  program_slug: string
  program_title: string
  level: ProgramLevel
  skills: string[]
  attempt_id: string
  score_pct: number
  issued_at: string
  expires_at: string
  status: CredentialStatus
  renewed_from: string | null
  renewed_by: string | null
  revoked_at: string | null
  revoke_reason: string | null
  /** Row in certification_attempts (shared certificate + passport evidence). */
  certificate_row_id: string
  reminder_sent_at: string | null
}

/** Starter blueprints an admin can add as drafts (price and publishing are up to them). */
export const PROGRAM_TEMPLATES: ReadonlyArray<Omit<ProgramInput, 'price'>> = [
  tpl('java-associate', 'Java Associate', 'associate', ['java', 'oop'], 'Core Java, OOP, collections and concurrency basics, with a short coding section.', [
    sec('core', 'Core Java and OOP', ['java'], ['mcq', 'multiple_response'], 8, 8, 4),
    sec('coding', 'Coding', ['java'], ['coding'], 1, 1, 0, 40),
  ], 90, 65),
  tpl('python-associate', 'Python Associate', 'associate', ['python'], 'Core Python, data structures, functions and the standard library, with a short coding section.', [
    sec('core', 'Core Python', ['python'], ['mcq', 'multiple_response'], 8, 8, 4),
    sec('coding', 'Coding', ['python'], ['coding'], 1, 1, 0, 40),
  ], 90, 65),
  tpl('sql-practitioner', 'SQL Practitioner', 'practitioner', ['sql'], 'Joins, aggregation, subqueries, indexes and transactions — reading and writing real queries.', [
    sec('concepts', 'Concepts', ['sql'], ['mcq', 'multiple_response'], 6, 8, 4),
    sec('queries', 'Writing queries', ['sql'], ['sql', 'coding'], 1, 2, 1, 45),
  ], 90, 65),
  tpl('dsa-fundamentals', 'DSA Fundamentals', 'foundation', ['data structures', 'algorithms', 'problem solving'], 'Arrays, strings, hashing, stacks, queues, trees, sorting and complexity.', [
    sec('concepts', 'Concepts and complexity', ['cse'], ['mcq'], 8, 8, 4),
    sec('coding', 'Problem solving', ['cse', 'python', 'java'], ['coding'], 1, 1, 1, 60),
  ], 100, 60),
  tpl('frontend-react', 'Frontend React', 'associate', ['react', 'javascript'], 'Components, hooks, state, rendering performance and modern JavaScript.', [
    sec('js', 'JavaScript', ['javascript'], ['mcq', 'multiple_response'], 5, 5, 2),
    sec('react', 'React', ['react'], ['mcq', 'multiple_response'], 5, 6, 3),
  ], 60, 65),
  tpl('aptitude-placements', 'Aptitude for Placements', 'foundation', ['aptitude', 'logical reasoning'], 'Quantitative aptitude, logical reasoning, verbal ability and data interpretation for campus placements.', [
    sec('quant', 'Quantitative aptitude', ['aptitude'], ['mcq', 'numeric'], 6, 6, 3),
    sec('logical', 'Logical and verbal', ['aptitude'], ['mcq'], 6, 6, 3),
  ], 60, 60),
]

function sec(id: string, name: string, domains: string[], types: Array<(typeof SECTION_TYPES)[number]>, Easy: number, Medium: number, Hard: number, minutes: number | null = null): BlueprintSection {
  return { id, name, domains, subjects: [], types, difficulty: { Easy, Medium, Hard }, minutes }
}

function tpl(slug: string, title: string, level: ProgramLevel, skills: string[], summary: string, sections: BlueprintSection[], duration: number, pass: number): Omit<ProgramInput, 'price'> {
  return {
    slug, title, summary, description: '', level, skills,
    blueprint: { sections, duration_min: duration, pass_percent: pass },
    proctoring: { min_trust: 70, review: 'always', strict_extension: false },
    attempts: { cooldown_days: 14, max_per_year: 3 },
    validity_months: 24,
    renewal_window_days: 90,
  }
}
