/**
 * create_problem: generate a coding problem (statement + sample and hidden
 * tests) with the same generator as POST /api/ai/generate-problem, preview
 * it, and save it as an unpublished draft owned by the caller's organisation.
 */
import { ToolInputError } from '@/lib/agent/contract'
import { generateCodingProblem, logGeneratedProblem, saveGeneratedProblem, shapeGeneratedProblem } from '@/lib/services/problems'
import { writeTool } from '../define'
import { argsObject, optEnum, optString, optStringArray } from '../args'
import { serviceUser } from '../scope'
import { problemLink } from '../loaders'
import { DRAFT_KEY, openDraft, sealDraft } from '../seal'
import { clip } from '../output'

export interface CreateProblemArgs {
  role?: string
  difficulty: 'easy' | 'medium' | 'hard'
  topics: string[]
  language_hint?: string
  [DRAFT_KEY]?: unknown
}

export const createProblemTool = writeTool<CreateProblemArgs>({
  name: 'create_problem',
  risk: 'create',
  description: 'Generate a coding problem with sample and hidden test cases using the AI generator, saved as an UNPUBLISHED draft in your organisation\'s library. The preview shows the statement and sample tests (hidden tests are counted, not shown).',
  parameters: {
    type: 'object',
    properties: {
      role: { type: 'string', description: 'Who it is for, e.g. "Backend engineer".' },
      difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
      topics: { type: 'array', items: { type: 'string' }, maxItems: 10 },
      language_hint: { type: 'string', description: 'e.g. python, javascript, java.' },
    },
  },
  parse(raw) {
    const r = argsObject(raw, ['role', 'difficulty', 'topics', 'language_hint'])
    const role = optString(r, 'role', { max: 120 })
    const lang = optString(r, 'language_hint', { max: 40 })
    return {
      ...(role ? { role } : {}),
      difficulty: optEnum(r, 'difficulty', ['easy', 'medium', 'hard'] as const) ?? 'medium',
      topics: optStringArray(r, 'topics', { maxItems: 10, maxLen: 60 }) ?? [],
      ...(lang ? { language_hint: lang } : {}),
    }
  },
  async propose(a, ctx) {
    const result = await generateCodingProblem(ctx.caller.userId, a)
    if (!result) throw new ToolInputError('The AI problem generator is unavailable right now. Try again in a moment.')
    a[DRAFT_KEY] = await sealDraft('create_problem', ctx.caller, { result })
    const s = shapeGeneratedProblem(result)
    const samples = s.test_cases.filter((t) => t.is_sample)
    return {
      title: `Create coding problem “${clip(s.title, 80)}” (draft)`,
      preview: {
        fields: { Title: s.title, Difficulty: s.difficulty, Topics: (Array.isArray(result.topics) ? result.topics : a.topics).join(', ') || '—', Status: 'Unpublished draft' },
        statement: clip(result.statement_md, 1500),
        tests: { sample: samples.length, hidden: s.test_cases.length - samples.length },
        sample_tests: samples.slice(0, 3).map((t) => ({ input: clip(t.stdin, 200), output: clip(t.expected_stdout, 200) })),
        warnings: s.test_cases.length === 0 ? ['The generator returned no test cases; the problem cannot be graded until you add some.'] : [],
      },
    }
  },
  async execute(a, ctx) {
    const user = serviceUser(ctx.caller)
    const draft = await openDraft<{ result: Record<string, unknown> }>('create_problem', ctx.caller, a[DRAFT_KEY])
    const result = draft?.result ?? (await generateCodingProblem(user.id, a))
    if (!result) return { ok: false, message: 'The AI problem generator is unavailable right now. Try again in a moment.' }
    const saved = await saveGeneratedProblem(user, result, { mode: 'draft' })
    await logGeneratedProblem(user.id, result, saved.id)
    return { ok: true, message: `Saved “${shapeGeneratedProblem(result).title}” as an unpublished draft.`, link: problemLink(saved.slug), data: { problem_id: saved.id, slug: saved.slug } }
  },
})
