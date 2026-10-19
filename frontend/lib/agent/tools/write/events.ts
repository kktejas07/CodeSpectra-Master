/**
 * Write tools for hackathons and codeathons. execute() calls the same
 * lib/services functions as /api/hackathons* and /api/codeathons* (problem /
 * judge rules, status transitions, XP, notifications, certificates).
 */
import { getMongoDb } from '@/lib/mongodb'
import { ToolInputError, type AgentCaller } from '@/lib/agent/contract'
import { canUseProblem } from '@/lib/hackathons/tenant-scope'
import { DEFAULT_FEATURES, type HackathonDoc } from '@/lib/db/qr-events'
import {
  createHackathon, updateHackathon, previewHackathonRelease, releaseHackathonResults,
} from '@/lib/services/hackathons'
import {
  createCodeathon, previewCodeathonRelease, releaseCodeathonResults, codeathonProblemFromLibrary,
} from '@/lib/services/codeathons'
import { generateCodingProblem, logGeneratedProblem, saveGeneratedProblem, shapeGeneratedProblem, verifyGeneratedProblem } from '@/lib/services/problems'
import { writeTool } from '../define'
import {
  argsObject, optDate, optEnum, optInt, optObject, optObjectArray, optString, optStringArray, reqDateArg, reqString, isEmail, type Raw,
} from '../args'
import { friendlyServiceError, serviceUser, unwrap } from '../scope'
import { codeathonLink, hackathonLink, loadCodeathon, loadHackathon } from '../loaders'
import { DRAFT_KEY, openDraft, sealDraft } from '../seal'
import { clip } from '../output'

type Doc = Record<string, any>
const MIN = 60_000

// ─── shared helpers ──────────────────────────────────────────────────────────

/** Library problems by slug or id that this caller may use (platform + own organisation). */
async function libraryProblems(caller: AgentCaller, refs: string[]): Promise<Doc[]> {
  if (!refs.length) return []
  const db = await getMongoDb()
  const found = (await db.collection('problems').find({ $or: [{ slug: { $in: refs } }, { id: { $in: refs } }] }, { projection: { _id: 0 } }).toArray()) as Doc[]
  const out: Doc[] = []
  for (const ref of refs) {
    const p = found.find((x) => x.slug === ref || x.id === ref)
    if (!p) throw new ToolInputError(`Problem "${ref}" not found. Use search_problems to find slugs.`)
    if (!canUseProblem(caller.role === 'superadmin' ? { role: 'superadmin' } : { role: 'tenant_admin', tenantId: caller.tenantId }, p)) {
      throw new ToolInputError(`Problem "${ref}" belongs to another organisation.`)
    }
    out.push(p)
  }
  return out
}

/** Judges by user id or email → user ids (tenant admins: own organisation only). */
async function resolveJudges(caller: AgentCaller, refs: string[]): Promise<Array<{ id: string; name: string; email: string }>> {
  if (!refs.length) return []
  const db = await getMongoDb()
  const emails = refs.filter((r) => isEmail(r.toLowerCase())).map((r) => r.toLowerCase())
  const ids = refs.filter((r) => !isEmail(r.toLowerCase()))
  const rows = await db.collection('user').find(
    { $or: [...(ids.length ? [{ id: { $in: ids } }, { _id: { $in: ids } }] : []), ...(emails.length ? [{ email: { $in: emails } }] : [])] } as never,
    { projection: { id: 1, _id: 1, name: 1, fullName: 1, email: 1, tenantId: 1, organizationId: 1 } },
  ).toArray() as Doc[]
  return refs.map((ref) => {
    const u = rows.find((x) => String(x.id || x._id) === ref || String(x.email || '').toLowerCase() === ref.toLowerCase())
    if (!u) throw new ToolInputError(`No user found for judge "${ref}".`)
    if (caller.role === 'tenant_admin' && u.tenantId !== caller.tenantId && u.organizationId !== caller.tenantId) {
      throw new ToolInputError(`Judge "${ref}" is not a member of your organisation.`)
    }
    return { id: String(u.id || u._id), name: String(u.fullName || u.name || ''), email: String(u.email || '') }
  })
}

interface RubricItem { name: string; weight: number }

function parseRubric(r: Raw): RubricItem[] | undefined {
  const list = optObjectArray(r, 'rubric', 10)
  if (!list) return undefined
  const items = list.map((x, i) => {
    try {
      const xr = argsObject(x, ['name', 'weight'])
      return { name: reqString(xr, 'name', { max: 80 }), weight: optInt(xr, 'weight', 1, 100) ?? 0 }
    } catch (e) { throw new ToolInputError(`rubric[${i}]: ${(e as Error).message}`) }
  })
  const total = items.reduce((s, x) => s + x.weight, 0)
  if (items.length && total !== 100) throw new ToolInputError(`Rubric weights must add up to 100 (they add up to ${total}).`)
  return items
}

interface ProblemRef { slug: string; points?: number }

function parseProblemRefs(r: Raw, key: string): ProblemRef[] | undefined {
  const list = optObjectArray(r, key, 20)
  if (!list) return undefined
  return list.map((x, i) => {
    try {
      const xr = argsObject(x, ['slug', 'points'])
      const points = optInt(xr, 'points', 1, 10000)
      return { slug: reqString(xr, 'slug', { max: 128 }), ...(points ? { points } : {}) }
    } catch (e) { throw new ToolInputError(`${key}[${i}]: ${(e as Error).message}`) }
  })
}

interface GenerateSpec { count: number; difficulty?: 'easy' | 'medium' | 'hard'; topics?: string[] }

function parseGenerate(r: Raw): GenerateSpec | undefined {
  const g = optObject(r, 'generate_problems')
  if (!g) return undefined
  const gr = argsObject(g, ['count', 'difficulty', 'topics'])
  const difficulty = optEnum(gr, 'difficulty', ['easy', 'medium', 'hard'] as const)
  const topics = optStringArray(gr, 'topics', { maxItems: 10, maxLen: 60 })
  return { count: optInt(gr, 'count', 1, 3) ?? 1, ...(difficulty ? { difficulty } : {}), ...(topics ? { topics } : {}) }
}

const taskOf = (p: Doc, points?: number) => ({
  problem_slug: String(p.slug),
  problem_title: String(p.title || p.slug),
  points: points ?? 100,
  difficulty: String(p.difficulty || 'medium'),
  required: true,
})

// ─── create_hackathon ────────────────────────────────────────────────────────

export interface CreateHackathonArgs {
  title: string
  description?: string
  starts_at: string
  duration_minutes: number
  team_size: number
  max_teams: number
  event_type?: 'hackathon' | 'speed_contest'
  leaderboard_visibility?: 'public' | 'private' | 'after_event'
  rubric?: RubricItem[]
  judges?: string[]
  problems?: ProblemRef[]
  generate_problems?: GenerateSpec
  [DRAFT_KEY]?: unknown
}

interface HackathonDraft { generated: Array<Record<string, unknown>> }

export const createHackathonTool = writeTool<CreateHackathonArgs>({
  name: 'create_hackathon',
  risk: 'create',
  description:
    'Create a hackathon as a DRAFT (not visible to participants until published): title, start time and duration, team size, ' +
    'leaderboard visibility, judging rubric, judges (user ids or emails from your organisation) and problems — picked from the library ' +
    '(search_problems) and/or up to 3 generated by AI. Preview shows the timeline and problems.',
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', maxLength: 120 },
      description: { type: 'string', maxLength: 20000 },
      starts_at: { type: 'string', description: 'ISO date/time.' },
      duration_minutes: { type: 'integer', minimum: 5, maximum: 10080 },
      ends_at: { type: 'string', description: 'Alternative to duration_minutes.' },
      team_size: { type: 'integer', minimum: 1, maximum: 20 },
      max_teams: { type: 'integer', minimum: 1, maximum: 1000 },
      event_type: { type: 'string', enum: ['hackathon', 'speed_contest'] },
      leaderboard_visibility: { type: 'string', enum: ['public', 'private', 'after_event'] },
      rubric: { type: 'array', maxItems: 10, items: { type: 'object', properties: { name: { type: 'string' }, weight: { type: 'integer' } }, required: ['name', 'weight'] }, description: 'Weights add up to 100.' },
      judges: { type: 'array', items: { type: 'string' }, maxItems: 50, description: 'User ids or emails.' },
      problems: { type: 'array', maxItems: 20, items: { type: 'object', properties: { slug: { type: 'string' }, points: { type: 'integer' } }, required: ['slug'] } },
      generate_problems: { type: 'object', properties: { count: { type: 'integer', minimum: 1, maximum: 3 }, difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] }, topics: { type: 'array', items: { type: 'string' } } }, required: ['count'] },
    },
    required: ['title', 'starts_at'],
  },
  parse(raw) {
    const r = argsObject(raw, ['title', 'description', 'starts_at', 'duration_minutes', 'ends_at', 'team_size', 'max_teams', 'event_type', 'leaderboard_visibility', 'rubric', 'judges', 'problems', 'generate_problems'])
    const starts = reqDateArg(r, 'starts_at')
    const ends = optDate(r, 'ends_at')
    let duration = optInt(r, 'duration_minutes', 5, 10080)
    if (ends) {
      const d = Math.round((new Date(ends).getTime() - new Date(starts).getTime()) / MIN)
      if (d < 5) throw new ToolInputError('`ends_at` must be at least 5 minutes after `starts_at`.')
      if (d > 10080) throw new ToolInputError('A hackathon can last at most 7 days.')
      duration = d
    }
    const a: CreateHackathonArgs = {
      title: reqString(r, 'title', { max: 120, min: 3 }),
      starts_at: starts,
      duration_minutes: duration ?? 24 * 60,
      team_size: optInt(r, 'team_size', 1, 20) ?? 4,
      max_teams: optInt(r, 'max_teams', 1, 1000) ?? 50,
    }
    const description = optString(r, 'description', { max: 20000 })
    if (description) a.description = description
    const et = optEnum(r, 'event_type', ['hackathon', 'speed_contest'] as const)
    if (et) a.event_type = et
    const lv = optEnum(r, 'leaderboard_visibility', ['public', 'private', 'after_event'] as const)
    if (lv) a.leaderboard_visibility = lv
    const rubric = parseRubric(r)
    if (rubric) a.rubric = rubric
    const judges = optStringArray(r, 'judges', { maxItems: 50, maxLen: 254 })
    if (judges) a.judges = judges
    const problems = parseProblemRefs(r, 'problems')
    if (problems) a.problems = problems
    const gen = parseGenerate(r)
    if (gen) a.generate_problems = gen
    return a
  },
  draftInputs: (a) => ({ title: a.title, generate_problems: a.generate_problems ?? null }),
  async propose(a, ctx) {
    if (ctx.caller.role === 'tenant_admin' && !ctx.caller.tenantId) throw new ToolInputError('Your account is not linked to an organisation.')
    const lib = await libraryProblems(ctx.caller, (a.problems ?? []).map((p) => p.slug))
    const judges = await resolveJudges(ctx.caller, a.judges ?? [])
    // Edit with the same generation inputs: keep the problems the admin already saw (AGT-002).
    const prior = await openDraft<HackathonDraft>('create_hackathon', ctx.caller, a[DRAFT_KEY])
    const generated: Array<Record<string, unknown>> = prior?.generated ? [...prior.generated] : []
    const testNotes: string[] = []
    for (let i = generated.length; i < (a.generate_problems?.count ?? 0); i++) {
      const g = await generateCodingProblem(ctx.caller.userId, { difficulty: a.generate_problems?.difficulty, topics: a.generate_problems?.topics, role: a.title })
      if (!g) throw new ToolInputError('The AI problem generator is unavailable right now. Pick library problems instead, or try again.')
      // AGT-025: hidden tests checked against a reference solution before anyone competes on them.
      const v = await verifyGeneratedProblem(g)
      if (v.verification.verified !== true) testNotes.push(`“${shapeGeneratedProblem(v.result).title}”: ${v.verification.note}`)
      else if (v.verification.dropped.length) testNotes.push(`“${shapeGeneratedProblem(v.result).title}”: ${v.verification.note}`)
      generated.push(v.result)
    }
    a[DRAFT_KEY] = await sealDraft('create_hackathon', ctx.caller, { generated } satisfies HackathonDraft)
    const ends = new Date(new Date(a.starts_at).getTime() + a.duration_minutes * MIN).toISOString()
    const warnings: string[] = []
    if (new Date(a.starts_at).getTime() < Date.now()) warnings.push('The start time is in the past.')
    if (!lib.length && !generated.length) warnings.push('No problems yet — add some before publishing.')
    if (!judges.length) warnings.push('No judges assigned yet.')
    warnings.push(...testNotes)
    return {
      title: `Create hackathon “${clip(a.title, 80)}” (draft)`,
      preview: {
        fields: { Title: a.title, Type: a.event_type ?? 'hackathon', 'Team size': `up to ${a.team_size}`, 'Max teams': a.max_teams, Leaderboard: a.leaderboard_visibility ?? 'public', Status: 'Draft' },
        timeline: [
          { label: 'Starts', at: a.starts_at },
          { label: 'Ends', at: ends },
          { label: 'Duration', value: `${Math.round(a.duration_minutes / 60 * 10) / 10} h` },
        ],
        problems: [
          ...lib.map((p, i) => ({ source: 'library', slug: p.slug, title: clip(p.title, 100), difficulty: p.difficulty, points: a.problems?.[i]?.points ?? 100 })),
          ...generated.map((g) => {
            const s = shapeGeneratedProblem(g)
            return { source: 'AI generated', title: s.title, difficulty: s.difficulty, tests: { sample: s.test_cases.filter((t) => t.is_sample).length, hidden: s.test_cases.filter((t) => !t.is_sample).length }, points: 100 }
          }),
        ],
        rubric: a.rubric ?? null,
        judges: judges.map((j) => ({ name: j.name, email: j.email })),
        warnings,
      },
    }
  },
  async execute(a, ctx) {
    const user = serviceUser(ctx.caller)
    const lib = await libraryProblems(ctx.caller, (a.problems ?? []).map((p) => p.slug))
    const judges = await resolveJudges(ctx.caller, a.judges ?? [])
    const draft = await openDraft<HackathonDraft>('create_hackathon', ctx.caller, a[DRAFT_KEY])
    let generated = draft?.generated ?? []
    if (!draft && a.generate_problems) {
      generated = []
      for (let i = 0; i < a.generate_problems.count; i++) {
        const g = await generateCodingProblem(ctx.caller.userId, { difficulty: a.generate_problems.difficulty, topics: a.generate_problems.topics, role: a.title })
        if (g) generated.push((await verifyGeneratedProblem(g)).result)
      }
    }
    const tasks = lib.map((p, i) => taskOf(p, a.problems?.[i]?.points))
    for (const g of generated) {
      const saved = await saveGeneratedProblem(user, g, { mode: 'hackathon' })
      await logGeneratedProblem(user.id, g, saved.id)
      tasks.push(taskOf({ slug: saved.slug, title: shapeGeneratedProblem(g).title, difficulty: shapeGeneratedProblem(g).difficulty }))
    }
    const body: Partial<HackathonDoc> = {
      name: a.title,
      description: a.description ?? '',
      starts_at: a.starts_at,
      timeout_minutes: a.duration_minutes,
      max_per_team: a.team_size,
      num_teams: a.max_teams,
      event_type: a.event_type ?? 'hackathon',
      status: 'draft',
      tasks: tasks as HackathonDoc['tasks'],
      features: {
        ...DEFAULT_FEATURES,
        ...(a.leaderboard_visibility ? { leaderboard_visibility: a.leaderboard_visibility } : {}),
        ...(a.rubric ? { judging_rubrics: true, rubric_criteria: a.rubric } : {}),
      },
    }
    const r = await createHackathon(user, body, { judges: judges.map((j) => j.id) })
    if (!r.ok) return { ok: false, message: friendlyServiceError(r) }
    return {
      ok: true,
      message: `Created hackathon “${a.title}” as a draft with ${tasks.length} problem${tasks.length === 1 ? '' : 's'}.`,
      link: hackathonLink(r.data.id),
      data: { hackathon_id: r.data.id, slug: r.data.slug },
    }
  },
})

// ─── update_hackathon ────────────────────────────────────────────────────────

export interface UpdateHackathonArgs {
  hackathon_id: string
  title?: string
  description?: string
  starts_at?: string
  duration_minutes?: number
  team_size?: number
  max_teams?: number
  event_type?: 'hackathon' | 'speed_contest'
  leaderboard_visibility?: 'public' | 'private' | 'after_event'
  rubric?: RubricItem[]
  problems?: ProblemRef[]
}

function hackathonPatch(cur: Doc, a: UpdateHackathonArgs, lib: Doc[]): Partial<HackathonDoc> {
  const body: Partial<HackathonDoc> = {}
  if (a.title) body.name = a.title
  if (a.description !== undefined) body.description = a.description
  if (a.starts_at) body.starts_at = a.starts_at
  if (a.duration_minutes) body.timeout_minutes = a.duration_minutes
  if (a.team_size) body.max_per_team = a.team_size
  if (a.max_teams) body.num_teams = a.max_teams
  if (a.event_type) body.event_type = a.event_type
  if (a.leaderboard_visibility || a.rubric) {
    // PATCH resets missing features to defaults — start from the event's current ones.
    body.features = {
      ...DEFAULT_FEATURES,
      ...(cur.features || {}),
      ...(a.leaderboard_visibility ? { leaderboard_visibility: a.leaderboard_visibility } : {}),
      ...(a.rubric ? { judging_rubrics: true, rubric_criteria: a.rubric } : {}),
    }
  }
  if (a.problems) body.tasks = lib.map((p, i) => taskOf(p, a.problems?.[i]?.points)) as HackathonDoc['tasks']
  return body
}

export const updateHackathonTool = writeTool<UpdateHackathonArgs>({
  name: 'update_hackathon',
  risk: 'update',
  description: 'Change a hackathon\'s title, description, schedule, team size, max teams, type, leaderboard visibility, rubric or problem list (replaces the list). Use publish_hackathon / assign_judges for those.',
  parameters: {
    type: 'object',
    properties: {
      hackathon_id: { type: 'string' },
      title: { type: 'string' }, description: { type: 'string' }, starts_at: { type: 'string' },
      duration_minutes: { type: 'integer', minimum: 5, maximum: 10080 }, team_size: { type: 'integer', minimum: 1, maximum: 20 },
      max_teams: { type: 'integer', minimum: 1, maximum: 1000 }, event_type: { type: 'string', enum: ['hackathon', 'speed_contest'] },
      leaderboard_visibility: { type: 'string', enum: ['public', 'private', 'after_event'] },
      rubric: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, weight: { type: 'integer' } } } },
      problems: { type: 'array', items: { type: 'object', properties: { slug: { type: 'string' }, points: { type: 'integer' } } } },
    },
    required: ['hackathon_id'],
  },
  parse(raw) {
    const r = argsObject(raw, ['hackathon_id', 'title', 'description', 'starts_at', 'duration_minutes', 'team_size', 'max_teams', 'event_type', 'leaderboard_visibility', 'rubric', 'problems'])
    const a: UpdateHackathonArgs = { hackathon_id: reqString(r, 'hackathon_id', { max: 128 }) }
    const set = <K extends keyof UpdateHackathonArgs>(k: K, v: UpdateHackathonArgs[K] | undefined) => { if (v !== undefined) a[k] = v }
    set('title', optString(r, 'title', { max: 120, min: 3 }))
    set('description', optString(r, 'description', { max: 20000 }))
    set('starts_at', optDate(r, 'starts_at'))
    set('duration_minutes', optInt(r, 'duration_minutes', 5, 10080))
    set('team_size', optInt(r, 'team_size', 1, 20))
    set('max_teams', optInt(r, 'max_teams', 1, 1000))
    set('event_type', optEnum(r, 'event_type', ['hackathon', 'speed_contest'] as const))
    set('leaderboard_visibility', optEnum(r, 'leaderboard_visibility', ['public', 'private', 'after_event'] as const))
    set('rubric', parseRubric(r))
    set('problems', parseProblemRefs(r, 'problems'))
    if (Object.keys(a).length === 1) throw new ToolInputError('Nothing to change.')
    return a
  },
  async propose(a, ctx) {
    const hk = await loadHackathon(ctx.caller, a.hackathon_id)
    if (hk.results_released) throw new ToolInputError('Results are released; this hackathon can no longer be edited here.')
    const lib = a.problems ? await libraryProblems(ctx.caller, a.problems.map((p) => p.slug)) : []
    const patch = hackathonPatch(hk, a, lib)
    const changes = Object.entries(patch).filter(([k]) => k !== 'features' && k !== 'tasks').map(([field, to]) => ({ field, from: hk[field] ?? null, to }))
    if (a.leaderboard_visibility) changes.push({ field: 'leaderboard_visibility', from: hk.features?.leaderboard_visibility ?? null, to: a.leaderboard_visibility })
    const warnings: string[] = []
    if (hk.status === 'live' && (a.problems || a.starts_at || a.duration_minutes)) warnings.push('The event is live — teams are working on it now.')
    return {
      title: `Update hackathon “${clip(hk.name, 80)}”`,
      preview: {
        changes,
        ...(a.rubric ? { rubric: a.rubric } : {}),
        ...(a.problems ? { problems: lib.map((p, i) => ({ slug: p.slug, title: clip(p.title, 100), points: a.problems?.[i]?.points ?? 100 })) } : {}),
        warnings,
      },
    }
  },
  async execute(a, ctx) {
    const hk = await loadHackathon(ctx.caller, a.hackathon_id)
    const lib = a.problems ? await libraryProblems(ctx.caller, a.problems.map((p) => p.slug)) : []
    const r = await updateHackathon(serviceUser(ctx.caller), String(hk.id), hackathonPatch(hk, a, lib))
    if (!r.ok) return { ok: false, message: friendlyServiceError(r) }
    return { ok: true, message: `Updated “${hk.name}”.`, link: hackathonLink(String(hk.id)), data: { hackathon_id: hk.id } }
  },
})

// ─── publish_hackathon ───────────────────────────────────────────────────────

export const publishHackathonTool = writeTool<{ hackathon_id: string }>({
  name: 'publish_hackathon',
  risk: 'publish',
  description: 'Publish a draft hackathon: registration opens and it becomes visible to participants.',
  parameters: { type: 'object', properties: { hackathon_id: { type: 'string' } }, required: ['hackathon_id'] },
  parse(raw) {
    return { hackathon_id: reqString(argsObject(raw, ['hackathon_id']), 'hackathon_id', { max: 128 }) }
  },
  async propose(a, ctx) {
    const hk = await loadHackathon(ctx.caller, a.hackathon_id)
    if (hk.status !== 'draft') throw new ToolInputError(`This hackathon is already ${hk.status}.`)
    const warnings: string[] = []
    if (!(hk.tasks || []).length) warnings.push('It has no problems yet.')
    if (!(hk.judges || []).length) warnings.push('No judges are assigned.')
    if (new Date(hk.ends_at).getTime() < Date.now()) warnings.push('Its end time has already passed.')
    return {
      title: `Publish hackathon “${clip(hk.name, 80)}”`,
      preview: {
        fields: { Starts: hk.starts_at, Ends: hk.ends_at, Problems: (hk.tasks || []).length, Judges: (hk.judges || []).length, 'Team size': hk.max_per_team },
        warnings,
      },
    }
  },
  async execute(a, ctx) {
    const hk = await loadHackathon(ctx.caller, a.hackathon_id)
    if (hk.status !== 'draft') return { ok: true, message: `“${hk.name}” is already ${hk.status}.`, link: hackathonLink(String(hk.id)) }
    const r = await updateHackathon(serviceUser(ctx.caller), String(hk.id), { status: 'open' })
    if (!r.ok) return { ok: false, message: friendlyServiceError(r) }
    return { ok: true, message: `Published “${hk.name}” — registration is open.`, link: hackathonLink(String(hk.id)), data: { hackathon_id: hk.id, status: r.data?.status } }
  },
})

// ─── assign_judges ───────────────────────────────────────────────────────────

export const assignJudgesTool = writeTool<{ hackathon_id: string; add?: string[]; remove?: string[] }>({
  name: 'assign_judges',
  risk: 'update',
  description: 'Add or remove hackathon judges (user ids or emails; company admins can only add members of their organisation). Judges see the event in their judging queue.',
  parameters: {
    type: 'object',
    properties: {
      hackathon_id: { type: 'string' },
      add: { type: 'array', items: { type: 'string' }, maxItems: 50 },
      remove: { type: 'array', items: { type: 'string' }, maxItems: 50 },
    },
    required: ['hackathon_id'],
  },
  parse(raw) {
    const r = argsObject(raw, ['hackathon_id', 'add', 'remove'])
    const add = optStringArray(r, 'add', { maxItems: 50, maxLen: 254 })
    const remove = optStringArray(r, 'remove', { maxItems: 50, maxLen: 254 })
    if (!add?.length && !remove?.length) throw new ToolInputError('Give judges to `add` and/or `remove`.')
    return { hackathon_id: reqString(r, 'hackathon_id', { max: 128 }), ...(add ? { add } : {}), ...(remove ? { remove } : {}) }
  },
  async propose(a, ctx) {
    const hk = await loadHackathon(ctx.caller, a.hackathon_id)
    const add = await resolveJudges(ctx.caller, a.add ?? [])
    const removeRefs = new Set((a.remove ?? []).map((x) => x.toLowerCase()))
    const current = await resolveJudges({ ...ctx.caller, role: 'superadmin' }, hk.judges || []).catch(() => [])
    const removing = current.filter((j) => removeRefs.has(j.id.toLowerCase()) || removeRefs.has(j.email.toLowerCase()))
    const next = [...new Set([...(hk.judges || []).filter((id: string) => !removing.some((j) => j.id === id)), ...add.map((j) => j.id)])]
    return {
      title: `Update judges for “${clip(hk.name, 80)}”`,
      preview: {
        adding: add.map((j) => ({ name: j.name, email: j.email })),
        removing: removing.map((j) => ({ name: j.name, email: j.email })),
        judges_after: next.length,
        notes: ['Judges are not emailed automatically; they see the event on their judging page.'],
      },
    }
  },
  async execute(a, ctx) {
    const hk = await loadHackathon(ctx.caller, a.hackathon_id)
    const add = await resolveJudges(ctx.caller, a.add ?? [])
    const removeRefs = new Set((a.remove ?? []).map((x) => x.toLowerCase()))
    const current = await resolveJudges({ ...ctx.caller, role: 'superadmin' }, hk.judges || []).catch(() => [])
    const removeIds = new Set(current.filter((j) => removeRefs.has(j.id.toLowerCase()) || removeRefs.has(j.email.toLowerCase())).map((j) => j.id))
    for (const ref of removeRefs) removeIds.add(ref)
    const judges = [...new Set([...(hk.judges || []).filter((id: string) => !removeIds.has(id) && !removeIds.has(id.toLowerCase())), ...add.map((j) => j.id)])]
    const r = await updateHackathon(serviceUser(ctx.caller), String(hk.id), { judges })
    if (!r.ok) return { ok: false, message: friendlyServiceError(r) }
    return { ok: true, message: `“${hk.name}” now has ${judges.length} judge${judges.length === 1 ? '' : 's'}.`, link: hackathonLink(String(hk.id)), data: { judges } }
  },
})

// ─── release_hackathon_results ───────────────────────────────────────────────

export const releaseHackathonResultsTool = writeTool<{ hackathon_id: string }>({
  name: 'release_hackathon_results',
  risk: 'publish',
  description: 'Release a hackathon\'s results: final judged scores, team ranks, XP, and notifications/emails to every team. Cannot be undone.',
  parameters: { type: 'object', properties: { hackathon_id: { type: 'string' } }, required: ['hackathon_id'] },
  parse(raw) {
    return { hackathon_id: reqString(argsObject(raw, ['hackathon_id']), 'hackathon_id', { max: 128 }) }
  },
  async propose(a, ctx) {
    const hk = await loadHackathon(ctx.caller, a.hackathon_id)
    const p = unwrap(await previewHackathonRelease(serviceUser(ctx.caller), String(hk.id)))
    if (p.already_released) throw new ToolInputError('Results are already released.')
    return {
      title: `Release results for “${clip(hk.name, 80)}”`,
      preview: {
        fields: { 'Submissions released': p.to_release, Teams: p.teams, 'Not scored yet': p.unscored, 'Event ended': p.ended ? 'Yes' : 'No' },
        warnings: p.reasons,
        notes: ['Every team member is notified in-app and by email. This cannot be undone.'],
      },
    }
  },
  async execute(a, ctx) {
    const hk = await loadHackathon(ctx.caller, a.hackathon_id)
    // The admin confirmed the preview (including its warnings).
    const r = await releaseHackathonResults(serviceUser(ctx.caller), String(hk.id), { force: true })
    if (!r.ok) return { ok: false, message: friendlyServiceError(r) }
    const d = r.data as Doc
    return {
      ok: true,
      message: `Released results: ${d.submissions_released} submissions, ${d.teams_affected} teams, ${d.emails_sent} notified.`,
      link: hackathonLink(String(hk.id)),
      data: { released_at: d.released_at, submissions_released: d.submissions_released, teams_affected: d.teams_affected, emails_sent: d.emails_sent },
    }
  },
})

// ─── create_codeathon ────────────────────────────────────────────────────────

export interface CreateCodeathonArgs {
  title: string
  description?: string
  starts_at: string
  ends_at: string
  difficulty?: 'Easy' | 'Medium' | 'Hard'
  topics?: string[]
  event_type?: 'individual' | 'team'
  team_size_min?: number
  team_size_max?: number
  max_participants?: number
  prize_pool?: string
  problem_visibility?: 'during_contest' | 'after_start' | 'immediate'
  problems?: ProblemRef[]
}

export const createCodeathonTool = writeTool<CreateCodeathonArgs>({
  name: 'create_codeathon',
  risk: 'create',
  description: 'Create a codeathon (status "upcoming") with dates, format (individual or team) and problems from the library (search_problems; each needs test cases). Problems stay hidden until the contest starts by default.',
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string' }, description: { type: 'string' }, starts_at: { type: 'string' }, ends_at: { type: 'string' },
      difficulty: { type: 'string', enum: ['Easy', 'Medium', 'Hard'] }, topics: { type: 'array', items: { type: 'string' } },
      event_type: { type: 'string', enum: ['individual', 'team'] }, team_size_min: { type: 'integer', minimum: 1, maximum: 10 },
      team_size_max: { type: 'integer', minimum: 1, maximum: 10 }, max_participants: { type: 'integer', minimum: 0, maximum: 100000 },
      prize_pool: { type: 'string' }, problem_visibility: { type: 'string', enum: ['during_contest', 'after_start', 'immediate'] },
      problems: { type: 'array', maxItems: 20, items: { type: 'object', properties: { slug: { type: 'string' }, points: { type: 'integer' } }, required: ['slug'] } },
    },
    required: ['title', 'starts_at', 'ends_at'],
  },
  parse(raw) {
    const r = argsObject(raw, ['title', 'description', 'starts_at', 'ends_at', 'difficulty', 'topics', 'event_type', 'team_size_min', 'team_size_max', 'max_participants', 'prize_pool', 'problem_visibility', 'problems'])
    const a: CreateCodeathonArgs = { title: reqString(r, 'title', { max: 120, min: 3 }), starts_at: reqDateArg(r, 'starts_at'), ends_at: reqDateArg(r, 'ends_at') }
    if (a.ends_at <= a.starts_at) throw new ToolInputError('`ends_at` must be after `starts_at`.')
    const set = <K extends keyof CreateCodeathonArgs>(k: K, v: CreateCodeathonArgs[K] | undefined) => { if (v !== undefined) a[k] = v }
    set('description', optString(r, 'description', { max: 20000 }))
    set('difficulty', optEnum(r, 'difficulty', ['Easy', 'Medium', 'Hard'] as const))
    set('topics', optStringArray(r, 'topics', { maxItems: 20, maxLen: 60 }))
    set('event_type', optEnum(r, 'event_type', ['individual', 'team'] as const))
    set('team_size_min', optInt(r, 'team_size_min', 1, 10))
    set('team_size_max', optInt(r, 'team_size_max', 1, 10))
    set('max_participants', optInt(r, 'max_participants', 0, 100000))
    set('prize_pool', optString(r, 'prize_pool', { max: 200 }))
    set('problem_visibility', optEnum(r, 'problem_visibility', ['during_contest', 'after_start', 'immediate'] as const))
    set('problems', parseProblemRefs(r, 'problems'))
    if ((a.team_size_min ?? 1) > (a.team_size_max ?? a.team_size_min ?? 1)) throw new ToolInputError('`team_size_min` cannot be larger than `team_size_max`.')
    return a
  },
  async propose(a, ctx) {
    const lib = await libraryProblems(ctx.caller, (a.problems ?? []).map((p) => p.slug))
    const mapped = lib.map((p, i) => codeathonProblemFromLibrary(p, a.problems?.[i]?.points))
    const bad = lib.filter((_, i) => !mapped[i]).map((p) => p.slug)
    if (bad.length) throw new ToolInputError(`These problems have no test cases to grade with: ${bad.join(', ')}.`)
    const warnings: string[] = []
    if (!lib.length) warnings.push('No problems yet — add some before the start.')
    if (new Date(a.starts_at).getTime() < Date.now()) warnings.push('The start time is in the past.')
    return {
      title: `Create codeathon “${clip(a.title, 80)}”`,
      preview: {
        fields: { Title: a.title, Format: a.event_type === 'team' ? `Teams of ${a.team_size_min ?? 1}–${a.team_size_max ?? a.team_size_min ?? 1}` : 'Individual', Starts: a.starts_at, Ends: a.ends_at, Status: 'Upcoming' },
        problems: mapped.map((p) => p && ({ title: p.title, difficulty: p.difficulty, points: p.points, tests: p.test_cases.length })),
        warnings,
      },
    }
  },
  async execute(a, ctx) {
    const lib = await libraryProblems(ctx.caller, (a.problems ?? []).map((p) => p.slug))
    const problems = lib.map((p, i) => codeathonProblemFromLibrary(p, a.problems?.[i]?.points)).filter(Boolean)
    const team = a.event_type === 'team'
    const r = await createCodeathon(serviceUser(ctx.caller), {
      title: a.title,
      description: a.description ?? '',
      difficulty: a.difficulty ?? 'Medium',
      topics: a.topics ?? [],
      maxParticipants: a.max_participants ?? 0,
      startDate: a.starts_at,
      endDate: a.ends_at,
      status: 'upcoming',
      prizePool: a.prize_pool ?? '',
      problems,
      event_type: team ? 'team' : 'individual',
      team_size_min: team ? a.team_size_min ?? 2 : 1,
      team_size_max: team ? a.team_size_max ?? a.team_size_min ?? 4 : 1,
      problem_visibility: a.problem_visibility ?? 'during_contest',
    })
    if (!r.ok) return { ok: false, message: friendlyServiceError(r) }
    return { ok: true, message: `Created codeathon “${a.title}” with ${problems.length} problem${problems.length === 1 ? '' : 's'}.`, link: codeathonLink(), data: { codeathon_id: r.data.id } }
  },
})

// ─── release_codeathon_results ───────────────────────────────────────────────

export const releaseCodeathonResultsTool = writeTool<{ codeathon_id: string }>({
  name: 'release_codeathon_results',
  risk: 'publish',
  description: 'Release a codeathon\'s final standings: freezes the leaderboard, issues certificates per the certificate policy, awards XP and notifies participants. Cannot be undone.',
  parameters: { type: 'object', properties: { codeathon_id: { type: 'string' } }, required: ['codeathon_id'] },
  parse(raw) {
    return { codeathon_id: reqString(argsObject(raw, ['codeathon_id']), 'codeathon_id', { max: 128 }) }
  },
  async propose(a, ctx) {
    const c = await loadCodeathon(ctx.caller, a.codeathon_id)
    const p = unwrap(await previewCodeathonRelease(serviceUser(ctx.caller), String(c.id))) as Doc
    if (p.released) throw new ToolInputError('Results are already released.')
    if (!p.participant_count) throw new ToolInputError('Nothing to release: nobody has a result yet.')
    return {
      title: `Release results for “${clip(c.title, 80)}”`,
      preview: {
        fields: { Participants: p.participant_count, Ranked: p.ranked_count, 'Still being graded': p.unscored ?? 0, Format: p.event_type },
        top: (p.standings || []).slice(0, 10).map((s: Doc) => ({ rank: s.rank, name: clip(s.name ?? s.display_name ?? s.team_name ?? s.user_id, 60), score: s.score ?? s.total ?? null })),
        certificate_policy: p.certificate_policy,
        warnings: p.warnings || [],
        notes: ['Participants are notified; certificates follow the policy shown. This cannot be undone.'],
      },
    }
  },
  async execute(a, ctx) {
    const c = await loadCodeathon(ctx.caller, a.codeathon_id)
    const r = await releaseCodeathonResults(serviceUser(ctx.caller), String(c.id), { force: true })
    if (!r.ok) return { ok: false, message: friendlyServiceError(r) }
    const d = r.data as Doc
    return { ok: true, message: `Released results for “${c.title}”.`, link: codeathonLink(), data: { released_at: d.released_at, certificates: d.certificates_issued ?? d.certificates ?? undefined } }
  },
})
