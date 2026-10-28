/** Read tools for hackathons and codeathons (staff view; no hidden tests). */
import { getMongoDb } from '@/lib/mongodb'
import { normalizeSubmissionStatus } from '@/lib/hackathons/submission-state'
import { readTool } from '../define'
import { argsObject, optEnum, paging, reqString } from '../args'
import { tenantFilter } from '../scope'
import { codeathonLink, hackathonLink, loadCodeathon, loadHackathon } from '../loaders'
import { clip } from '../output'

type Doc = Record<string, any>

const hkSummary = (h: Doc) => ({
  id: h.id,
  slug: h.slug,
  title: clip(h.name, 120),
  status: h.status,
  type: h.event_type || 'hackathon',
  starts_at: h.starts_at,
  ends_at: h.ends_at,
  team_size: h.max_per_team,
  max_teams: h.num_teams,
  problems: Array.isArray(h.tasks) ? h.tasks.length : 0,
  judges: Array.isArray(h.judges) ? h.judges.length : 0,
  results_released: h.results_released === true,
  link: hackathonLink(String(h.id)),
})

export const listHackathonsTool = readTool({
  name: 'list_hackathons',
  description: 'List your organisation\'s hackathons with status (draft/open/live/closed), dates, team size and release state.',
  parameters: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: ['draft', 'open', 'live', 'closed', 'any'] },
      page: { type: 'integer', minimum: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 50 },
    },
  },
  parse(raw) {
    const r = argsObject(raw, ['status', 'page', 'limit'])
    return { status: optEnum(r, 'status', ['draft', 'open', 'live', 'closed', 'any'] as const) ?? 'any', ...paging(r, 20, 50) }
  },
  async run(a, ctx) {
    const db = await getMongoDb()
    const filter: Doc = { ...tenantFilter(ctx.caller) }
    if (a.status !== 'any') filter.status = a.status
    const col = db.collection('hackathons')
    const [total, rows] = await Promise.all([
      col.countDocuments(filter),
      col.find(filter, { projection: { _id: 0, description: 0, rules: 0 } }).sort({ created_at: -1 }).skip((a.page - 1) * a.limit).limit(a.limit).toArray(),
    ])
    return { data: { total, page: a.page, hackathons: rows.map(hkSummary) } }
  },
})

export const getHackathonTool = readTool({
  name: 'get_hackathon',
  description: 'One hackathon: settings, problems, rubric, judges, teams and submission status counts.',
  parameters: {
    type: 'object',
    properties: { hackathon_id: { type: 'string', description: 'Id or slug.' } },
    required: ['hackathon_id'],
  },
  parse(raw) {
    const r = argsObject(raw, ['hackathon_id'])
    return { id: reqString(r, 'hackathon_id', { max: 128 }) }
  },
  async run(a, ctx) {
    const hk = await loadHackathon(ctx.caller, a.id)
    const db = await getMongoDb()
    const [teams, subs, judges] = await Promise.all([
      db.collection('hackathon_teams').find({ hackathon_id: hk.id }, { projection: { _id: 0, id: 1, name: 1, members: 1, final_rank: 1, final_total: 1 } }).limit(200).toArray(),
      db.collection('hackathon_submissions').find({ hackathon_id: hk.id }, { projection: { _id: 0, status: 1, team_id: 1 } }).toArray(),
      Array.isArray(hk.judges) && hk.judges.length
        ? db.collection('user').find({ $or: [{ id: { $in: hk.judges } }, { _id: { $in: hk.judges } }] } as never, { projection: { id: 1, _id: 1, name: 1, fullName: 1, email: 1 } }).toArray()
        : Promise.resolve([]),
    ])
    const byStatus: Record<string, number> = {}
    for (const s of subs) { const st = normalizeSubmissionStatus(s.status); byStatus[st] = (byStatus[st] || 0) + 1 }
    const features = (hk.features || {}) as Doc
    return {
      data: {
        ...hkSummary(hk),
        description: clip(hk.description, 600),
        problems: (hk.tasks || []).map((t: Doc) => ({ slug: t.problem_slug, title: clip(t.problem_title, 100), points: t.points, difficulty: t.difficulty })),
        rubric: features.judging_rubrics ? features.rubric_criteria : null,
        leaderboard_visibility: features.leaderboard_visibility ?? null,
        judges: (judges as Doc[]).map((j) => ({ id: String(j.id || j._id), name: clip(j.fullName || j.name, 60), email: j.email })),
        teams: { count: teams.length, list: teams.slice(0, 30).map((t) => ({ id: t.id, name: clip(t.name, 60), members: (t.members || []).length, rank: t.final_rank ?? null })) },
        submissions: { total: subs.length, by_status: byStatus },
      },
    }
  },
})

const coSummary = (c: Doc) => ({
  id: c.id,
  title: clip(c.title, 120),
  status: c.status,
  type: c.event_type || 'individual',
  starts_at: c.startDate || null,
  ends_at: c.endDate || null,
  difficulty: c.difficulty || null,
  problems: Array.isArray(c.problems) ? c.problems.length : 0,
  participants: c.participants ?? 0,
  results_released: c.results_released === true,
  link: codeathonLink(),
})

export const listCodeathonsTool = readTool({
  name: 'list_codeathons',
  description: 'List your organisation\'s codeathons with status, dates and release state.',
  parameters: {
    type: 'object',
    properties: { page: { type: 'integer', minimum: 1 }, limit: { type: 'integer', minimum: 1, maximum: 50 } },
  },
  parse(raw) {
    return paging(argsObject(raw, ['page', 'limit']), 20, 50)
  },
  async run(a, ctx) {
    const db = await getMongoDb()
    const col = db.collection('codeathons')
    const filter = tenantFilter(ctx.caller)
    const [total, rows] = await Promise.all([
      col.countDocuments(filter),
      col.find(filter, { projection: { _id: 0, rules: 0 } }).sort({ createdAt: -1 }).skip((a.page - 1) * a.limit).limit(a.limit).toArray(),
    ])
    return { data: { total, page: a.page, codeathons: rows.map(coSummary) } }
  },
})

export const getCodeathonTool = readTool({
  name: 'get_codeathon',
  description: 'One codeathon: settings, problems (titles, points, test counts — never the tests), registrations and submissions.',
  parameters: { type: 'object', properties: { codeathon_id: { type: 'string' } }, required: ['codeathon_id'] },
  parse(raw) {
    const r = argsObject(raw, ['codeathon_id'])
    return { id: reqString(r, 'codeathon_id', { max: 128 }) }
  },
  async run(a, ctx) {
    const c = await loadCodeathon(ctx.caller, a.id)
    const db = await getMongoDb()
    const [registrations, submissions] = await Promise.all([
      db.collection('codeathon_registrations').countDocuments({ codeathon_id: c.id }),
      db.collection('codeathon_submissions').countDocuments({ codeathon_id: c.id }),
    ])
    return {
      data: {
        ...coSummary(c),
        description: clip(c.description, 600),
        team_size: c.event_type === 'team' ? { min: c.team_size_min ?? 1, max: c.team_size_max ?? 1 } : null,
        problem_visibility: c.problem_visibility || 'during_contest',
        problems: (c.problems || []).map((p: Doc) => ({
          title: clip(p.title, 100),
          difficulty: p.difficulty,
          points: p.points,
          tests: Array.isArray(p.test_cases) ? p.test_cases.length : 0,
        })),
        registrations,
        submissions,
      },
    }
  },
})
