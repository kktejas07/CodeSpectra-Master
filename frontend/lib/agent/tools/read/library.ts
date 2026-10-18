/** Read tools for the question bank and the coding-problem library. */
import { questionBank } from '@/lib/question-bank'
import { problems } from '@/lib/db/problems'
import { sanitizeRegex } from '@/lib/sanitize'
import { BANK_QUESTION_TYPES as ALL_QUESTION_TYPES } from '@/lib/question-types'
import { ToolInputError } from '@/lib/agent/contract'
import { readTool } from '../define'
import { argsObject, optEnum, optInt, optString, optStringArray } from '../args'
import { problemLink } from '../loaders'
import { clip } from '../output'

type Doc = Record<string, any>

export const searchQuestionBankTool = readTool({
  name: 'search_question_bank',
  description: 'Search the question bank by text, topic (subject), difficulty and question type. Returns ids, titles and metadata only — never answers or test cases. Use the ids with create_test/update_test.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', maxLength: 200 },
      topic: { type: 'string', description: 'Subject / skill, e.g. "SQL", "React".', maxLength: 100 },
      difficulty: { type: 'string', enum: ['Easy', 'Medium', 'Hard'] },
      type: { type: 'string', description: 'Question type, e.g. mcq, coding, sql, short_answer.' },
      limit: { type: 'integer', minimum: 1, maximum: 30 },
    },
  },
  parse(raw) {
    const r = argsObject(raw, ['query', 'topic', 'difficulty', 'type', 'limit'])
    const type = optString(r, 'type', { max: 40 })?.toLowerCase()
    if (type && !(ALL_QUESTION_TYPES as readonly string[]).includes(type)) {
      throw new ToolInputError(`Unknown question type "${type}". Use one of: ${ALL_QUESTION_TYPES.join(', ')}.`)
    }
    return {
      query: optString(r, 'query', { max: 200 }),
      topic: optString(r, 'topic', { max: 100 }),
      difficulty: optEnum(r, 'difficulty', ['Easy', 'Medium', 'Hard'] as const),
      type,
      limit: optInt(r, 'limit', 1, 30) ?? 15,
    }
  },
  async run(a) {
    // Bank docs carry answer keys; the projection never reads them.
    const filter: Doc = { is_active: { $ne: false } }
    if (a.difficulty) filter.difficulty = a.difficulty
    if (a.type) filter.type = a.type
    if (a.topic) filter.subject = { $regex: sanitizeRegex(a.topic), $options: 'i' }
    if (a.query) {
      const re = { $regex: sanitizeRegex(a.query), $options: 'i' }
      filter.$or = [{ title: re }, { question: re }, { subject: re }, { tags: re }]
    }
    const col = await questionBank()
    const [total, rows] = await Promise.all([
      col.countDocuments(filter),
      col.find(filter, { projection: { _id: 0, id: 1, title: 1, question: 1, type: 1, difficulty: 1, marks: 1, subject: 1, tags: 1, review_status: 1 } })
        .sort({ createdAt: -1 }).limit(a.limit).toArray(),
    ])
    return {
      data: {
        total,
        questions: rows.map((q) => ({
          id: q.id,
          title: clip(q.title, 100),
          preview: clip(q.question, 140),
          type: q.type,
          difficulty: q.difficulty,
          points: q.marks,
          topic: q.subject || null,
          tags: (q.tags || []).slice(0, 6),
          approved: q.review_status !== 'draft',
        })),
      },
    }
  },
})

export const searchProblemsTool = readTool({
  name: 'search_problems',
  description: 'Search coding problems you can use in hackathons and codeathons (platform problems plus your organisation\'s own). Returns slug, title, difficulty, topics and test counts.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', maxLength: 200 },
      difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
      topics: { type: 'array', items: { type: 'string' }, maxItems: 10 },
      include_drafts: { type: 'boolean', description: 'Also show your unpublished problems.' },
      limit: { type: 'integer', minimum: 1, maximum: 30 },
    },
  },
  parse(raw) {
    const r = argsObject(raw, ['query', 'difficulty', 'topics', 'include_drafts', 'limit'])
    return {
      query: optString(r, 'query', { max: 200 }),
      difficulty: optEnum(r, 'difficulty', ['easy', 'medium', 'hard'] as const),
      topics: optStringArray(r, 'topics', { maxItems: 10, maxLen: 60 })?.map((t) => t.toLowerCase()),
      includeDrafts: r.include_drafts === true,
      limit: optInt(r, 'limit', 1, 30) ?? 15,
    }
  },
  async run(a, ctx) {
    const and: Doc[] = []
    // Same scope as GET /api/problems for admins: platform + own organisation.
    if (ctx.caller.role === 'tenant_admin') {
      and.push({ $or: [{ tenant_id: { $exists: false } }, { tenant_id: null }, { tenant_id: ctx.caller.tenantId ?? '__none__' }] })
    }
    if (a.includeDrafts) {
      and.push({ $or: [{ is_published: true }, { created_by: ctx.caller.userId }, ...(ctx.caller.tenantId ? [{ tenant_id: ctx.caller.tenantId }] : [])] })
    } else {
      and.push({ is_published: { $ne: false } })
    }
    const filter: Doc = and.length ? { $and: and } : {}
    if (a.difficulty) filter.difficulty = a.difficulty
    if (a.query) filter.title = { $regex: sanitizeRegex(a.query), $options: 'i' }
    if (a.topics?.length) filter.topics = { $in: a.topics }
    const col = await problems()
    const rows = await col.find(filter as never, { projection: { _id: 0, id: 1, slug: 1, title: 1, difficulty: 1, topics: 1, is_published: 1, visibility: 1, tenant_id: 1, test_cases: 1 } })
      .sort({ created_at: -1 }).limit(a.limit).toArray()
    return {
      data: {
        problems: (rows as unknown as Doc[]).map((p) => {
          const tests = Array.isArray(p.test_cases) ? p.test_cases : []
          return {
            slug: p.slug,
            id: p.id,
            title: clip(p.title, 100),
            difficulty: p.difficulty,
            topics: (p.topics || []).slice(0, 6),
            published: p.is_published !== false,
            owner: p.tenant_id ? 'your organisation' : 'platform',
            tests: { sample: tests.filter((t: Doc) => t.is_sample === true).length, hidden: tests.filter((t: Doc) => t.is_sample !== true).length },
            link: problemLink(String(p.slug)),
          }
        }),
      },
    }
  },
})
