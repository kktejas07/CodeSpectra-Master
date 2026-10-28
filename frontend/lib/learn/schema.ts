/**
 * Generator output contract (pure): the zod schema the LLM's JSON must match,
 * the required-section check, and assembly of the validated sections into the
 * post's markdown body.
 */
import { z } from 'zod'
import { PROSE_FIRST_CATEGORIES, type LearnCategoryId, type LearnLanguage, type LearnLevel, type FurtherReading, type PracticeLink } from './types'
import { sanitizeMarkdown } from './markdown'

export const SECTION_HEADINGS = {
  concept: 'What it is',
  intuition: 'Intuition',
  steps: 'Step by step',
  complexity: 'Complexity',
  code_examples: 'Code examples',
  use_cases: 'Real-world use cases',
  common_mistakes: 'Common mistakes',
  interview_questions: 'Interview questions',
  practice: 'Practice',
  further_reading: 'Further reading',
} as const
export type SectionKey = keyof typeof SECTION_HEADINGS
/** Sections an admin can ask the bot to rewrite. */
export const REGENERATABLE_SECTIONS: SectionKey[] = ['concept', 'intuition', 'steps', 'complexity', 'code_examples', 'use_cases', 'common_mistakes', 'interview_questions']

const str = (min: number, max: number) => z.string().trim().min(min).max(max)

export const GeneratedPostSchema = z.object({
  title: str(8, 140),
  summary: str(40, 400),
  level: z.enum(['beginner', 'intermediate', 'advanced']),
  tags: z.array(str(1, 40)).max(10).default([]),
  sections: z.object({
    concept: str(150, 8000),
    intuition: str(80, 6000),
    steps: str(80, 8000),
    complexity: z
      .object({
        rows: z.array(z.object({ case: str(1, 80), time: str(1, 60), space: str(1, 60) })).max(12).default([]),
        notes: z.string().max(3000).default(''),
      })
      .nullable()
      .optional(),
    code_examples: z.array(z.object({ language: str(1, 30), code: str(10, 8000), explanation: z.string().max(2000).default('') })).max(6).default([]),
    use_cases: z.array(str(10, 800)).min(1).max(10),
    common_mistakes: z.array(str(10, 800)).min(1).max(10),
    interview_questions: z.array(z.object({ question: str(8, 400), answer: str(10, 2000) })).min(1).max(8),
    further_reading: z.array(z.object({ title: str(1, 200), url: str(8, 2048) })).max(10).default([]),
  }),
})
export type GeneratedPost = z.infer<typeof GeneratedPostSchema>

const LANG_ALIASES: Record<string, LearnLanguage> = {
  python: 'python', py: 'python', python3: 'python',
  javascript: 'javascript', js: 'javascript', node: 'javascript', nodejs: 'javascript',
  typescript: 'typescript', ts: 'typescript',
  java: 'java',
  'c++': 'cpp', cpp: 'cpp', cxx: 'cpp',
}

export function normalizeLanguage(lang: string): string {
  const k = String(lang || '').trim().toLowerCase()
  return LANG_ALIASES[k] ?? k.replace(/[^a-z0-9+#-]/g, '').slice(0, 20)
}

export type ValidationResult =
  | { ok: true; post: GeneratedPost; issues: string[] }
  | { ok: false; errors: string[] }

/**
 * Schema + required sections. Hard errors reject the output (the generator
 * retries); soft `issues` lower the quality score but keep the draft.
 */
export function validateGeneratedPost(raw: unknown, ctx: { category: LearnCategoryId; languages: LearnLanguage[] }): ValidationResult {
  const parsed = GeneratedPostSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.slice(0, 12).map((i) => `${i.path.join('.') || 'root'}: ${i.message}`) }
  }
  const post = parsed.data
  post.sections.code_examples = post.sections.code_examples.map((c) => ({ ...c, language: normalizeLanguage(c.language) }))
  const errors: string[] = []
  const issues: string[] = []
  const proseFirst = PROSE_FIRST_CATEGORIES.has(ctx.category)
  const wanted = new Set<string>(ctx.languages)
  const covered = new Set(post.sections.code_examples.map((c) => c.language).filter((l) => wanted.has(l)))
  if (!proseFirst) {
    const need = Math.min(2, wanted.size || 2)
    if (covered.size < need) errors.push(`code_examples: need examples in at least ${need} of: ${[...wanted].join(', ')}`)
    else if (covered.size < wanted.size) issues.push(`code:missing-languages(${[...wanted].filter((l) => !covered.has(l)).join(',')})`)
  }
  if (ctx.category === 'dsa' && !(post.sections.complexity && post.sections.complexity.rows.length)) {
    errors.push('complexity: algorithm posts need a complexity table')
  }
  if (post.sections.further_reading.length === 0) issues.push('sources:none-cited')
  return errors.length ? { ok: false, errors } : { ok: true, post, issues }
}

const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ')

const FENCE_LANG: Record<string, string> = { cpp: 'cpp', python: 'python', javascript: 'javascript', typescript: 'typescript', java: 'java' }

function codeBlock(lang: string, code: string): string {
  const fence = code.includes('```') ? '~~~~' : '```'
  return `${fence}${FENCE_LANG[lang] ?? lang}\n${code.replace(/\s+$/, '')}\n${fence}`
}

export const LANGUAGE_LABELS: Record<string, string> = { python: 'Python', javascript: 'JavaScript', typescript: 'TypeScript', java: 'Java', cpp: 'C++' }

/** Markdown for one section (used for assembly and for "regenerate section"). */
export function sectionMarkdown(key: SectionKey, s: GeneratedPost['sections'], extra: { practice?: PracticeLink[]; sources?: FurtherReading[]; practiceQuery?: string } = {}): string {
  switch (key) {
    case 'concept': return s.concept
    case 'intuition': return s.intuition
    case 'steps': return s.steps
    case 'complexity': {
      const c = s.complexity
      if (!c || (!c.rows.length && !c.notes.trim())) return ''
      const table = c.rows.length
        ? `| Case | Time | Space |\n| --- | --- | --- |\n${c.rows.map((r) => `| ${cell(r.case)} | ${cell(r.time)} | ${cell(r.space)} |`).join('\n')}`
        : ''
      return [table, c.notes.trim()].filter(Boolean).join('\n\n')
    }
    case 'code_examples':
      return s.code_examples
        .map((c) => `### ${LANGUAGE_LABELS[c.language] ?? c.language}\n\n${codeBlock(c.language, c.code)}${c.explanation.trim() ? `\n\n${c.explanation.trim()}` : ''}`)
        .join('\n\n')
    case 'use_cases': return s.use_cases.map((u) => `- ${u.replace(/\n+/g, ' ')}`).join('\n')
    case 'common_mistakes': return s.common_mistakes.map((u) => `- ${u.replace(/\n+/g, ' ')}`).join('\n')
    case 'interview_questions':
      return s.interview_questions.map((q, i) => `${i + 1}. **${q.question.replace(/\n+/g, ' ')}**\n\n   ${q.answer.replace(/\n+/g, '\n   ')}`).join('\n\n')
    case 'practice': {
      const list = extra.practice ?? []
      if (list.length) {
        return `Try these problems on CodeSpectra:\n\n${list.map((p) => `- [${p.title.replace(/[[\]]/g, '')}](/dashboard/problems/${encodeURIComponent(p.slug)})${p.difficulty ? ` · ${p.difficulty}` : ''}`).join('\n')}`
      }
      const q = extra.practiceQuery ? `?q=${encodeURIComponent(extra.practiceQuery)}` : ''
      return `Put this into practice: [browse coding problems on CodeSpectra](/dashboard/problems${q}).`
    }
    case 'further_reading': {
      const list = extra.sources ?? []
      if (!list.length) return ''
      return list.map((r) => {
        let host = ''
        try { host = new URL(r.url).hostname.replace(/^www\./, '') } catch { /* keep */ }
        return `- [${r.title.replace(/[[\]]/g, '')}](${r.url})${host ? ` · ${host}` : ''}`
      }).join('\n')
    }
  }
}

/** Full post body from validated sections + our own practice links and vetted sources. */
export function assembleMarkdown(post: GeneratedPost, extra: { practice: PracticeLink[]; sources: FurtherReading[]; practiceQuery?: string }): string {
  const order: SectionKey[] = ['concept', 'intuition', 'steps', 'complexity', 'code_examples', 'use_cases', 'common_mistakes', 'interview_questions', 'practice', 'further_reading']
  const parts = order
    .map((k) => {
      const body = sectionMarkdown(k, post.sections, extra).trim()
      return body ? `## ${SECTION_HEADINGS[k]}\n\n${body}` : ''
    })
    .filter(Boolean)
  return sanitizeMarkdown(parts.join('\n\n'))
}

export function levelOf(v: unknown, fallback: LearnLevel): LearnLevel {
  return v === 'beginner' || v === 'intermediate' || v === 'advanced' ? v : fallback
}
