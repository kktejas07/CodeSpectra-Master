/**
 * Question bot domains (pure, client-safe). A domain is one area the bank
 * should cover — an engineering branch (matches bank rows by `branch`) or a
 * skill (matches rows the bot tagged with `domain`). Each domain carries its
 * gap targets: question type → difficulty → how many questions the bank
 * should hold (approved + waiting drafts).
 *
 * Stored in the `question_domains` collection (lib/question-bot/store.ts),
 * seeded from DEFAULT_DOMAINS once; admins add / edit / switch off domains.
 */
import { z } from 'zod'
import { scanPrompt } from '@/lib/ai/prompt-guard'

export const BANK_DIFFICULTIES = ['Easy', 'Medium', 'Hard'] as const
export type BankDifficulty = (typeof BANK_DIFFICULTIES)[number]

/** Question types the bot writes. Coding questions are verified by running the reference solution. */
export const BOT_QUESTION_TYPES = ['mcq', 'coding'] as const
export type BotQuestionType = (typeof BOT_QUESTION_TYPES)[number]

export type DomainTargets = Partial<Record<BotQuestionType, Partial<Record<BankDifficulty, number>>>>

export interface QuestionDomain {
  /** Stable slug (lowercase, `a-z0-9_`). For branches it equals the branch id. */
  id: string
  label: string
  kind: 'branch' | 'skill'
  /** Bank `branch` this domain also counts (branches only). */
  branch?: string
  /** Topics the bot rotates through when writing for this domain. */
  topics: string[]
  /** Language the coding reference solutions are written in (domains with coding targets). */
  language?: string
  targets: DomainTargets
  active: boolean
  created_at?: string
  updated_at?: string
}

/** Max questions a single target cell may ask for. */
export const MAX_TARGET = 5000

const MCQ_DEFAULT: Record<BankDifficulty, number> = { Easy: 200, Medium: 150, Hard: 100 }
const CODING_DEFAULT: Record<BankDifficulty, number> = { Easy: 30, Medium: 40, Hard: 50 }

function seed(id: string, label: string, kind: QuestionDomain['kind'], topics: string[], coding?: string): QuestionDomain {
  return {
    id,
    label,
    kind,
    ...(kind === 'branch' ? { branch: id } : {}),
    topics,
    ...(coding ? { language: coding } : {}),
    targets: { mcq: { ...MCQ_DEFAULT }, ...(coding ? { coding: { ...CODING_DEFAULT } } : {}) },
    active: true,
  }
}

/** Seed list: the 8 engineering branches plus the core skills and aptitude. */
export const DEFAULT_DOMAINS: readonly QuestionDomain[] = [
  seed('cse', 'Computer Science (CSE)', 'branch', ['Data structures and algorithms', 'Operating systems', 'DBMS', 'Computer networks', 'Theory of computation'], 'python'),
  seed('it', 'Information Technology (IT)', 'branch', ['Web technologies', 'DBMS', 'Computer networks', 'Software engineering', 'Cloud basics'], 'python'),
  seed('ece', 'Electronics and Communication (ECE)', 'branch', ['Signals and systems', 'Digital electronics', 'Analog electronics', 'Communication systems', 'Microprocessors']),
  seed('eee', 'Electrical and Electronics (EEE)', 'branch', ['Circuit theory', 'Electrical machines', 'Power systems', 'Control systems', 'Power electronics']),
  seed('mech', 'Mechanical (Mech)', 'branch', ['Thermodynamics', 'Fluid mechanics', 'Strength of materials', 'Machine design', 'Manufacturing processes']),
  seed('civil', 'Civil', 'branch', ['Structural analysis', 'Concrete technology', 'Geotechnical engineering', 'Surveying', 'Transportation engineering']),
  seed('chem', 'Chemical (Chem)', 'branch', ['Chemical reaction engineering', 'Mass transfer', 'Heat transfer', 'Process control', 'Thermodynamics']),
  seed('ai_ds', 'AI and Data Science (AI&DS)', 'branch', ['Machine learning', 'Deep learning', 'Probability and statistics', 'Data engineering', 'NLP'], 'python'),
  seed('java', 'Java', 'skill', ['Core Java and OOP', 'Collections', 'Concurrency', 'JVM and memory', 'Streams and lambdas'], 'java'),
  seed('python', 'Python', 'skill', ['Core Python', 'Data structures', 'Functions and closures', 'OOP in Python', 'Standard library'], 'python'),
  seed('sql', 'SQL', 'skill', ['Joins', 'Aggregation and grouping', 'Subqueries and CTEs', 'Indexes and performance', 'Transactions']),
  seed('javascript', 'JavaScript / TypeScript', 'skill', ['Closures and scope', 'Async and promises', 'Prototypes and classes', 'TypeScript types', 'DOM and events'], 'javascript'),
  seed('react', 'React', 'skill', ['Components and props', 'Hooks', 'State management', 'Rendering and performance', 'Testing React']),
  seed('node', 'Node.js', 'skill', ['Event loop', 'Streams and buffers', 'Express and APIs', 'Modules and packaging', 'Error handling'], 'javascript'),
  seed('devops', 'DevOps', 'skill', ['CI/CD pipelines', 'Docker', 'Kubernetes', 'Infrastructure as code', 'Monitoring and logging']),
  seed('cloud', 'Cloud (AWS / Azure / GCP)', 'skill', ['Compute services', 'Storage services', 'Networking and VPC', 'IAM and security', 'Serverless']),
  seed('data_science', 'Data science', 'skill', ['Statistics', 'Pandas and NumPy', 'Model evaluation', 'Feature engineering', 'Visualisation'], 'python'),
  seed('cyber_security', 'Cyber security', 'skill', ['Web vulnerabilities (OWASP)', 'Cryptography', 'Network security', 'Identity and access', 'Incident response']),
  seed('aptitude', 'Aptitude (quant / logical / verbal)', 'skill', ['Quantitative aptitude', 'Logical reasoning', 'Verbal ability', 'Data interpretation', 'Puzzles']),
]

/**
 * Mongo filter for the bank rows that belong to a domain: rows the bot tagged
 * with this domain, plus (branches) every row of that branch. Pure.
 */
export function domainBankFilter(d: Pick<QuestionDomain, 'id' | 'kind' | 'branch'>): Record<string, unknown> {
  const or: Record<string, unknown>[] = [{ domain: d.id }]
  if (d.kind === 'branch' && d.branch) or.push({ branch: d.branch })
  return or.length === 1 ? or[0] : { $or: or }
}

/** Every (type, difficulty, target) cell of a domain with target > 0. Pure. */
export function targetCells(d: Pick<QuestionDomain, 'targets'>): Array<{ type: BotQuestionType; difficulty: BankDifficulty; target: number }> {
  const out: Array<{ type: BotQuestionType; difficulty: BankDifficulty; target: number }> = []
  for (const type of BOT_QUESTION_TYPES) {
    const row = d.targets?.[type]
    if (!row) continue
    for (const difficulty of BANK_DIFFICULTIES) {
      const target = Math.max(0, Math.floor(Number(row[difficulty]) || 0))
      if (target > 0) out.push({ type, difficulty, target })
    }
  }
  return out
}

// ─── Admin input ────────────────────────────────────────────────────────────

const count = z.coerce.number().int().min(0).max(MAX_TARGET)
const targetRow = z.object({ Easy: count.optional(), Medium: count.optional(), Hard: count.optional() }).strict()

export const DomainInputSchema = z.object({
  id: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{2,40}$/, 'Use 2–40 lowercase letters, digits or underscores.'),
  label: z.string().trim().min(2).max(80),
  kind: z.enum(['branch', 'skill']).default('skill'),
  branch: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{1,40}$/).optional(),
  topics: z.array(z.string().trim().min(2).max(120)).max(30).default([]),
  language: z.enum(['python', 'javascript', 'java', 'cpp', 'c']).optional(),
  targets: z.object({ mcq: targetRow.optional(), coding: targetRow.optional() }).strict().default({}),
  active: z.boolean().default(true),
}).strict()

// No defaults here: a patch must only touch the fields it names.
export const DomainPatchSchema = z.object({
  label: z.string().trim().min(2).max(80),
  topics: z.array(z.string().trim().min(2).max(120)).max(30),
  language: z.enum(['python', 'javascript', 'java', 'cpp', 'c']),
  targets: z.object({ mcq: targetRow.optional(), coding: targetRow.optional() }).strict(),
  active: z.boolean(),
}).partial().strict()

export type DomainInput = z.infer<typeof DomainInputSchema>

/** Labels and topics go into the bot's prompt: refuse text that reads like a prompt injection. */
function injectionIn(texts: readonly (string | undefined)[]): string | null {
  for (const t of texts) if (t && scanPrompt(t).flagged) return `"${t.slice(0, 40)}" looks like an instruction to the AI. Use a plain topic name.`
  return null
}

/** Validate a new domain from the admin UI. Pure. */
export function parseDomainInput(raw: unknown): { ok: true; domain: QuestionDomain } | { ok: false; error: string } {
  const r = DomainInputSchema.safeParse(raw)
  if (!r.success) return { ok: false, error: r.error.issues[0]?.message || 'Invalid domain' }
  const v = r.data
  if (v.targets.coding && !v.language) return { ok: false, error: 'Pick a language for coding questions.' }
  const bad = injectionIn([v.label, ...v.topics])
  if (bad) return { ok: false, error: bad }
  return {
    ok: true,
    domain: {
      id: v.id,
      label: v.label,
      kind: v.kind,
      ...(v.kind === 'branch' ? { branch: v.branch || v.id } : {}),
      topics: [...new Set(v.topics)],
      ...(v.language ? { language: v.language } : {}),
      targets: v.targets as DomainTargets,
      active: v.active,
    },
  }
}

/** Validate an edit (label / topics / targets / active / language). Pure. */
export function parseDomainPatch(raw: unknown): { ok: true; patch: Partial<QuestionDomain> } | { ok: false; error: string } {
  const r = DomainPatchSchema.safeParse(raw)
  if (!r.success) return { ok: false, error: r.error.issues[0]?.message || 'Invalid change' }
  const patch: Partial<QuestionDomain> = {}
  for (const [k, v] of Object.entries(r.data)) if (v !== undefined) (patch as Record<string, unknown>)[k] = v
  if (patch.topics) patch.topics = [...new Set(patch.topics)]
  const bad = injectionIn([patch.label, ...(patch.topics ?? [])])
  if (bad) return { ok: false, error: bad }
  return { ok: true, patch }
}
