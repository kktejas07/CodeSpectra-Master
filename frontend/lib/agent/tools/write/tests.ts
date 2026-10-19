/**
 * Write tools for tests: create_test, update_test, publish_test.
 * propose() builds the draft (bank picks + AI questions, no writes) and seals
 * it; execute() saves it through lib/services/exams — the same functions
 * POST/PATCH /api/exams use (plan limits, tenant, sanitising, knowledge hooks).
 *
 * Parsed args keep the schema's keys (the runtime re-parses stored args).
 */
import { getMongoDb } from '@/lib/mongodb'
import { ToolInputError, type AgentCaller } from '@/lib/agent/contract'
import { bankToExamQuestion, questionBank, type BankQuestionDoc } from '@/lib/question-bank'
import { isQuestionType, type QuestionType } from '@/lib/question-types'
import { normalizeSections, MAX_SECTIONS, type ExamSection } from '@/lib/exam-sections'
import { examPassPercent } from '@/lib/exam-access'
import {
  buildExamQuestionList, checkAssessmentLimit, createExam, updateExam, screeningTypeOf, TYPE_POOL_BY_SCREENING,
} from '@/lib/services/exams'
import { writeTool } from '../define'
import {
  argsObject, optBool, optDate, optEnum, optIdArray, optInt, optObject, optObjectArray, optString,
  optStringArray, reqId, reqInt, reqString, type Raw,
} from '../args'
import { friendlyServiceError, serviceUser, unwrap } from '../scope'
import { loadExam, questionOutline, testLink } from '../loaders'
import { DRAFT_KEY, openDraft, sealDraft } from '../seal'
import { guard, uploadText } from '../uploads'
import { clip } from '../output'

type Doc = Record<string, any>

export const EXPERIENCE_BANDS = ['intern', 'entry', 'mid', 'senior', 'lead'] as const
export type Band = (typeof EXPERIENCE_BANDS)[number]
export const BAND_LABEL: Record<Band, string> = { intern: 'Intern', entry: '0–2 years', mid: '2–5 years', senior: '5–8 years', lead: '8+ years' }
export const BAND_LEVEL: Record<Band, string> = { intern: 'Beginner', entry: 'Beginner', mid: 'Intermediate', senior: 'Advanced', lead: 'Advanced' }
const DIFFICULTIES = ['easy', 'medium', 'hard', 'mixed'] as const
type Difficulty = (typeof DIFFICULTIES)[number]
const SCREENING = ['aptitude', 'technical', 'coding', 'mixed'] as const

function split(d: Difficulty | undefined, n: number) {
  if (!d || d === 'mixed') return undefined
  return { Easy: d === 'easy' ? n : 0, Medium: d === 'medium' ? n : 0, Hard: d === 'hard' ? n : 0 }
}

function parseTypes(r: Raw, key: string): QuestionType[] | undefined {
  const t = optStringArray(r, key, { maxItems: 20, maxLen: 40 })?.map((x) => x.toLowerCase())
  if (!t) return undefined
  const bad = t.find((x) => !isQuestionType(x))
  if (bad) throw new ToolInputError(`Unknown question type "${bad}" in \`${key}\`.`)
  return t as QuestionType[]
}

/** Drop undefined so stored args stay clean and re-parse identically. */
function compact<T extends Record<string, unknown>>(o: T): T {
  for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k]
  return o
}

export interface SectionSpec {
  title: string
  count: number
  types?: QuestionType[]
  difficulty?: Difficulty
  time_limit_minutes?: number
  instructions?: string
}

function parseSectionSpecs(r: Raw): SectionSpec[] | undefined {
  const list = optObjectArray(r, 'sections', MAX_SECTIONS)
  if (!list) return undefined
  if (list.length === 0) throw new ToolInputError('`sections` must have at least one section (or leave it out).')
  return list.map((s, i) => {
    try {
      const sr = argsObject(s, ['title', 'count', 'types', 'difficulty', 'time_limit_minutes', 'instructions'])
      return compact({
        title: reqString(sr, 'title', { max: 120 }),
        count: reqInt(sr, 'count', 1, 50),
        types: parseTypes(sr, 'types'),
        difficulty: optEnum(sr, 'difficulty', DIFFICULTIES),
        time_limit_minutes: optInt(sr, 'time_limit_minutes', 1, 600),
        instructions: optString(sr, 'instructions', { max: 2000 }),
      })
    } catch (e) {
      throw new ToolInputError(`sections[${i}]: ${(e as Error).message}`)
    }
  })
}

async function bankQuestions(ids: string[]): Promise<Doc[]> {
  if (!ids.length) return []
  const col = await questionBank()
  const docs = await col.find({ id: { $in: ids }, is_active: { $ne: false } }).toArray()
  const byId = new Map(docs.map((d) => [d.id, d]))
  const missing = ids.filter((id) => !byId.has(id))
  if (missing.length) throw new ToolInputError(`Question${missing.length > 1 ? 's' : ''} not found in the bank: ${missing.slice(0, 5).join(', ')}.`)
  return ids.map((id) => bankToExamQuestion(byId.get(id) as BankQuestionDoc))
}

// ─── create_test ─────────────────────────────────────────────────────────────

export interface CreateTestArgs {
  title: string
  role?: string
  experience_band?: Band
  duration_minutes: number
  skills: string[]
  screening_type: (typeof SCREENING)[number]
  question_count: number
  difficulty?: Difficulty
  sections?: SectionSpec[]
  question_ids?: string[]
  job_description?: string
  job_description_upload_id?: string
  pass_mark?: number
  access_type?: 'invite_only' | 'open'
  starts_at?: string
  ends_at?: string
  proctoring_mode?: 'standard' | 'strict'
  allow_retake?: boolean
  max_attempts?: number
  [DRAFT_KEY]?: unknown
}

export interface TestDraft {
  questionList: Doc[]
  sections: ExamSection[] | null
  warnings: string[]
}

async function jobDescription(caller: AgentCaller, a: CreateTestArgs): Promise<{ text?: string; warning?: string }> {
  const note = 'contains text that looks like instructions; it was used only as data.'
  if (a.job_description_upload_id) {
    const u = await uploadText(caller, a.job_description_upload_id)
    return { text: u.text, warning: u.flagged ? `The uploaded job description ${note}` : undefined }
  }
  if (a.job_description) {
    return { text: a.job_description, warning: guard(a.job_description).flagged ? `The job description ${note}` : undefined }
  }
  return {}
}

/** Bank picks + AI top-up, per section. No writes. */
export async function buildTestDraft(caller: AgentCaller, a: CreateTestArgs): Promise<TestDraft> {
  const warnings: string[] = []
  const jd = await jobDescription(caller, a)
  if (jd.warning) warnings.push(jd.warning)
  const level = a.experience_band ? BAND_LEVEL[a.experience_band] : 'Intermediate'
  const base = {
    techStack: a.skills.length ? a.skills : ['General'],
    level,
    subject: a.role || a.title,
    duration: a.duration_minutes,
    context: jd.text,
  }
  const picked = await bankQuestions(a.question_ids ?? [])

  if (!a.sections) {
    const want = Math.max(0, a.question_count - picked.length)
    const generated = want > 0
      ? await buildExamQuestionList({ ...base, count: want, allowedTypes: TYPE_POOL_BY_SCREENING[a.screening_type], difficultySplit: split(a.difficulty, want) })
      : []
    if (generated.length < want) warnings.push(`Only ${generated.length} of ${want} questions could be found or generated.`)
    return { questionList: [...picked, ...(generated as unknown as Doc[])], sections: null, warnings }
  }

  const questionList: Doc[] = [...picked]
  const sections: Doc[] = []
  if (picked.length) sections.push({ id: 'sec_selected', title: 'Selected questions', time_limit_minutes: null, question_ids: picked.map((q) => q.id) })
  for (const [i, s] of a.sections.entries()) {
    const qs = await buildExamQuestionList({
      ...base,
      count: s.count,
      allowedTypes: s.types ?? TYPE_POOL_BY_SCREENING[a.screening_type],
      difficultySplit: split(s.difficulty, s.count),
    })
    if (qs.length < s.count) warnings.push(`Section “${s.title}”: only ${qs.length} of ${s.count} questions could be found or generated.`)
    questionList.push(...(qs as unknown as Doc[]))
    sections.push({
      id: `sec_${i + 1}`,
      title: s.title,
      ...(s.instructions ? { instructions: s.instructions } : {}),
      time_limit_minutes: s.time_limit_minutes ?? null,
      question_ids: qs.map((q) => q.id),
    })
  }
  return { questionList, sections: normalizeSections(sections, questionList.map((q) => String(q.id))), warnings }
}

function createBody(caller: AgentCaller, a: CreateTestArgs, n: number): Record<string, unknown> {
  return {
    title: a.title,
    subject: a.role || '',
    level: a.experience_band ? BAND_LEVEL[a.experience_band] : 'Intermediate',
    techStack: a.skills.length ? a.skills : ['General'],
    duration: a.duration_minutes,
    screening_type: a.screening_type,
    questions: n,
    ...(a.pass_mark !== undefined ? { passing_score: a.pass_mark } : {}),
    access_type: a.access_type ?? 'invite_only',
    starts_at: a.starts_at ?? null,
    ends_at: a.ends_at ?? null,
    proctoring_mode: a.proctoring_mode ?? 'standard',
    allow_retake: a.allow_retake === true,
    ...(a.max_attempts ? { max_attempts: a.max_attempts } : {}),
    published: false,
    // Superadmin acting for an organisation: the session's tenant, never the model's.
    ...(caller.role === 'superadmin' && caller.tenantId ? { tenant_id: caller.tenantId } : {}),
  }
}

export const createTestTool = writeTool<CreateTestArgs>({
  name: 'create_test',
  risk: 'create',
  description:
    'Draft a new test (assessment), created UNPUBLISHED. Give a title and role, an experience band, duration and either a question count or sections. ' +
    'Can build from a job description (pasted text or an uploaded document id): questions are picked from the question bank and topped up with the AI generator. ' +
    'Respects the plan\'s assessments-per-month limit. The admin sees every question grouped by section before anything is saved.',
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', maxLength: 200, description: 'e.g. "Backend engineer, 2–4 years".' },
      role: { type: 'string', maxLength: 120 },
      experience_band: { type: 'string', enum: [...EXPERIENCE_BANDS] },
      duration_minutes: { type: 'integer', minimum: 5, maximum: 600, description: 'Default 60.' },
      skills: { type: 'array', items: { type: 'string' }, maxItems: 20, description: 'Skills / topics to assess.' },
      screening_type: { type: 'string', enum: [...SCREENING] },
      question_count: { type: 'integer', minimum: 1, maximum: 100, description: 'When not using sections. Default 10.' },
      difficulty: { type: 'string', enum: [...DIFFICULTIES] },
      sections: {
        type: 'array', maxItems: MAX_SECTIONS, description: 'Optional question mix by section.',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            count: { type: 'integer', minimum: 1, maximum: 50 },
            types: { type: 'array', items: { type: 'string' }, description: 'Question types, e.g. mcq, coding, sql.' },
            difficulty: { type: 'string', enum: [...DIFFICULTIES] },
            time_limit_minutes: { type: 'integer', minimum: 1, maximum: 600 },
            instructions: { type: 'string' },
          },
          required: ['title', 'count'],
        },
      },
      question_ids: { type: 'array', items: { type: 'string' }, maxItems: 100, description: 'Question bank ids to include (from search_question_bank).' },
      job_description: { type: 'string', maxLength: 20000, description: 'Pasted job description text.' },
      job_description_upload_id: { type: 'string', description: 'Id of an uploaded job description.' },
      pass_mark: { type: 'integer', minimum: 0, maximum: 100 },
      access_type: { type: 'string', enum: ['invite_only', 'open'] },
      starts_at: { type: 'string' },
      ends_at: { type: 'string' },
      proctoring_mode: { type: 'string', enum: ['standard', 'strict'] },
      allow_retake: { type: 'boolean' },
      max_attempts: { type: 'integer', minimum: 1, maximum: 20 },
    },
    required: ['title'],
  },
  parse(raw) {
    const r = argsObject(raw, [
      'title', 'role', 'experience_band', 'duration_minutes', 'skills', 'screening_type', 'question_count', 'difficulty', 'sections',
      'question_ids', 'job_description', 'job_description_upload_id', 'pass_mark', 'access_type', 'starts_at', 'ends_at',
      'proctoring_mode', 'allow_retake', 'max_attempts',
    ])
    const a: CreateTestArgs = compact({
      title: reqString(r, 'title', { max: 200, min: 3 }),
      role: optString(r, 'role', { max: 120 }),
      experience_band: optEnum(r, 'experience_band', EXPERIENCE_BANDS),
      duration_minutes: optInt(r, 'duration_minutes', 5, 600) ?? 60,
      skills: optStringArray(r, 'skills', { maxItems: 20, maxLen: 60 }) ?? [],
      screening_type: screeningTypeOf(optEnum(r, 'screening_type', SCREENING)),
      question_count: optInt(r, 'question_count', 1, 100) ?? 10,
      difficulty: optEnum(r, 'difficulty', DIFFICULTIES),
      sections: parseSectionSpecs(r),
      question_ids: optIdArray(r, 'question_ids', 100),
      job_description: optString(r, 'job_description', { max: 20000 }),
      job_description_upload_id: optString(r, 'job_description_upload_id', { max: 128 }),
      pass_mark: optInt(r, 'pass_mark', 0, 100),
      access_type: optEnum(r, 'access_type', ['invite_only', 'open'] as const),
      starts_at: optDate(r, 'starts_at'),
      ends_at: optDate(r, 'ends_at'),
      proctoring_mode: optEnum(r, 'proctoring_mode', ['standard', 'strict'] as const),
      allow_retake: optBool(r, 'allow_retake'),
      max_attempts: optInt(r, 'max_attempts', 1, 20),
    })
    if (a.job_description && a.job_description_upload_id) throw new ToolInputError('Give either `job_description` or `job_description_upload_id`, not both.')
    if (a.starts_at && a.ends_at && a.ends_at <= a.starts_at) throw new ToolInputError('`ends_at` must be after `starts_at`.')
    const total = a.sections ? a.sections.reduce((s, x) => s + x.count, 0) + (a.question_ids?.length ?? 0) : a.question_count
    if (total > 100) throw new ToolInputError('A test can have at most 100 questions.')
    return a
  },
  draftInputs: (a) => ({
    title: a.title, role: a.role, experience_band: a.experience_band, skills: a.skills, screening_type: a.screening_type,
    question_count: a.question_count, difficulty: a.difficulty, sections: a.sections, question_ids: a.question_ids,
    job_description: a.job_description, job_description_upload_id: a.job_description_upload_id,
  }),
  async propose(a, ctx) {
    // Plan limit first — a friendly stop before any AI work.
    unwrap(await checkAssessmentLimit(serviceUser(ctx.caller)))
    // Edit that only changed settings: keep the questions the admin already reviewed (AGT-002).
    const draft = (await openDraft<TestDraft>('create_test', ctx.caller, a[DRAFT_KEY])) ?? await buildTestDraft(ctx.caller, a)
    if (draft.questionList.length === 0) {
      throw new ToolInputError("I couldn't find or generate questions for this test. Try other skills or question types, or pick questions with search_question_bank.")
    }
    // Attach the sealed draft so confirm saves exactly what the admin saw.
    a[DRAFT_KEY] = await sealDraft('create_test', ctx.caller, draft)
    const outline = questionOutline({ questionList: draft.questionList, sections: draft.sections ?? undefined }, { promptChars: 140 })
    const points = draft.questionList.reduce((s, q) => s + (Number(q.score) || 0), 0)
    const n = draft.questionList.length
    return {
      title: `Create test “${clip(a.title, 80)}” with ${n} question${n === 1 ? '' : 's'}`,
      preview: {
        fields: {
          Title: a.title,
          Role: a.role || '—',
          Experience: a.experience_band ? BAND_LABEL[a.experience_band] : '—',
          Duration: `${a.duration_minutes} min`,
          'Pass mark': `${a.pass_mark ?? 60}%`,
          Access: (a.access_type ?? 'invite_only') === 'open' ? 'Open' : 'Invite only',
          Status: 'Unpublished draft',
        },
        totals: { questions: n, points, sections: draft.sections?.length ?? 0 },
        sections: outline,
        warnings: draft.warnings,
      },
    }
  },
  async execute(a, ctx) {
    const sealed = await openDraft<TestDraft>('create_test', ctx.caller, a[DRAFT_KEY])
    const draft = sealed ?? (await buildTestDraft(ctx.caller, a))
    if (draft.questionList.length === 0) return { ok: false, message: "I couldn't find or generate questions for this test." }
    const r = await createExam(serviceUser(ctx.caller), createBody(ctx.caller, a, draft.questionList.length), {
      questionList: draft.questionList,
      ...(draft.sections ? { sections: draft.sections } : {}),
    })
    if (!r.ok) return { ok: false, message: friendlyServiceError(r) }
    const id = String(r.data.id)
    return {
      ok: true,
      message: `Created “${a.title}” (unpublished) with ${draft.questionList.length} questions.`,
      link: testLink(id),
      data: { test_id: id, questions: draft.questionList.length },
    }
  },
})

// ─── update_test ─────────────────────────────────────────────────────────────

/** Agent setting name → exam field. */
export const SETTING_FIELDS = {
  title: 'title', role: 'subject', description: 'description', duration_minutes: 'duration', pass_mark: 'passing_score',
  starts_at: 'starts_at', ends_at: 'ends_at', access_type: 'access_type', allow_retake: 'allow_retake', max_attempts: 'max_attempts',
  proctoring_mode: 'proctoring_mode', issue_certificates: 'issue_certificates', require_id_verification: 'require_id_verification',
  require_face_capture: 'require_face_capture', no_camera_policy: 'no_camera_policy', experience_band: 'level',
} as const
type SettingKey = keyof typeof SETTING_FIELDS
const BOOL_SETTINGS = ['allow_retake', 'issue_certificates', 'require_id_verification', 'require_face_capture']
const INT_SETTINGS = ['duration_minutes', 'pass_mark', 'max_attempts']

export interface UpdateTestArgs {
  test_id: string
  settings?: Partial<Record<SettingKey, unknown>>
  sections?: Array<Record<string, unknown>>
  add_question_ids?: string[]
  generate_questions?: { count: number; types?: QuestionType[]; topics?: string[]; difficulty?: Difficulty; section_title?: string }
  remove_question_ids?: string[]
  [DRAFT_KEY]?: unknown
}

function parseSettings(raw: Raw | undefined): UpdateTestArgs['settings'] {
  if (!raw) return undefined
  const r = argsObject(raw, Object.keys(SETTING_FIELDS))
  const out = compact({
    title: optString(r, 'title', { max: 200, min: 3 }),
    role: optString(r, 'role', { max: 120 }),
    description: optString(r, 'description', { max: 4000 }),
    duration_minutes: optInt(r, 'duration_minutes', 5, 600),
    pass_mark: optInt(r, 'pass_mark', 0, 100),
    starts_at: optDate(r, 'starts_at'),
    ends_at: optDate(r, 'ends_at'),
    access_type: optEnum(r, 'access_type', ['invite_only', 'open'] as const),
    allow_retake: optBool(r, 'allow_retake'),
    max_attempts: optInt(r, 'max_attempts', 1, 20),
    proctoring_mode: optEnum(r, 'proctoring_mode', ['standard', 'strict'] as const),
    issue_certificates: optBool(r, 'issue_certificates'),
    require_id_verification: optBool(r, 'require_id_verification'),
    require_face_capture: optBool(r, 'require_face_capture'),
    no_camera_policy: optEnum(r, 'no_camera_policy', ['block', 'allow_flag'] as const),
    experience_band: optEnum(r, 'experience_band', EXPERIENCE_BANDS),
  } as Record<string, unknown>)
  return Object.keys(out).length ? out : undefined
}

/** Settings as exam fields (for updateExam). */
export function settingsToFields(settings: UpdateTestArgs['settings']): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(settings ?? {})) {
    if (v === undefined) continue
    out[SETTING_FIELDS[k as SettingKey]] = k === 'experience_band' ? BAND_LEVEL[v as Band] : v
  }
  return out
}

interface UpdateDraft { added: Doc[]; base: string | null }

async function questionsToAdd(exam: Doc, a: UpdateTestArgs): Promise<Doc[]> {
  const picked = await bankQuestions(a.add_question_ids ?? [])
  const g = a.generate_questions
  if (!g) return picked
  const gen = await buildExamQuestionList({
    count: g.count,
    allowedTypes: g.types ?? TYPE_POOL_BY_SCREENING[screeningTypeOf(exam.screening_type)],
    techStack: g.topics?.length ? g.topics : (exam.techStack || ['General']),
    level: exam.level,
    subject: exam.subject || exam.title,
    duration: exam.duration,
    difficultySplit: split(g.difficulty, g.count),
  })
  return [...picked, ...(gen as unknown as Doc[])]
}

/** The test's questions + sections after the change (pure). */
export function applyQuestionChanges(
  exam: Doc,
  added: Doc[],
  remove: string[],
  sectionsArg: Array<Record<string, unknown>> | undefined,
  addToSection: string | undefined,
): { questionList: Doc[]; sections: ExamSection[] | undefined; changed: boolean } {
  const current = (Array.isArray(exam.questionList) ? exam.questionList : []) as Doc[]
  const removeSet = new Set(remove)
  const questionList = [...current.filter((q) => !removeSet.has(String(q.id))), ...added]
  const ids = questionList.map((q) => String(q.id))
  const changed = removeSet.size > 0 || added.length > 0
  let sections: ExamSection[] | undefined
  if (sectionsArg) sections = normalizeSections(sectionsArg, ids)
  else if (Array.isArray(exam.sections) && exam.sections.length && changed) sections = normalizeSections(exam.sections, ids)
  if (added.length && addToSection) {
    sections = sections ?? []
    const target = sections.find((s) => s.title.toLowerCase() === addToSection.toLowerCase())
    if (target) target.question_ids.push(...added.map((q) => String(q.id)))
    else sections.push({ id: `sec_${sections.length + 1}`, title: addToSection, time_limit_minutes: null, lock_after_leave: false, question_ids: added.map((q) => String(q.id)) })
    sections = normalizeSections(sections, ids)
  }
  return { questionList, sections, changed }
}

export const updateTestTool = writeTool<UpdateTestArgs>({
  name: 'update_test',
  risk: 'update',
  description:
    'Change a test: settings (title, duration, pass mark, dates, access, retakes, proctoring, identity checks), sections, ' +
    'add questions (bank ids or AI-generated), or remove questions by id (see get_test). Shows a before/after preview.',
  parameters: {
    type: 'object',
    properties: {
      test_id: { type: 'string' },
      settings: {
        type: 'object',
        properties: Object.fromEntries(Object.keys(SETTING_FIELDS).map((k) => [k, {
          type: BOOL_SETTINGS.includes(k) ? 'boolean' : INT_SETTINGS.includes(k) ? 'integer' : 'string',
        }])) as Record<string, { type: 'boolean' | 'integer' | 'string' }>,
      },
      sections: {
        type: 'array', maxItems: MAX_SECTIONS, description: 'Replace all sections.',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' }, title: { type: 'string' }, question_ids: { type: 'array', items: { type: 'string' } },
            time_limit_minutes: { type: 'integer' }, lock_after_leave: { type: 'boolean' }, instructions: { type: 'string' },
          },
          required: ['title'],
        },
      },
      add_question_ids: { type: 'array', items: { type: 'string' }, maxItems: 50 },
      generate_questions: {
        type: 'object',
        properties: {
          count: { type: 'integer', minimum: 1, maximum: 30 }, types: { type: 'array', items: { type: 'string' } },
          topics: { type: 'array', items: { type: 'string' } }, difficulty: { type: 'string', enum: [...DIFFICULTIES] },
          section_title: { type: 'string', description: 'Put the new questions in this section (created if missing).' },
        },
        required: ['count'],
      },
      remove_question_ids: { type: 'array', items: { type: 'string' }, maxItems: 100 },
    },
    required: ['test_id'],
  },
  parse(raw) {
    const r = argsObject(raw, ['test_id', 'settings', 'sections', 'add_question_ids', 'generate_questions', 'remove_question_ids'])
    const g = optObject(r, 'generate_questions')
    let generate: UpdateTestArgs['generate_questions']
    if (g) {
      const gr = argsObject(g, ['count', 'types', 'topics', 'difficulty', 'section_title'])
      generate = compact({
        count: reqInt(gr, 'count', 1, 30),
        types: parseTypes(gr, 'types'),
        topics: optStringArray(gr, 'topics', { maxItems: 20, maxLen: 60 }),
        difficulty: optEnum(gr, 'difficulty', DIFFICULTIES),
        section_title: optString(gr, 'section_title', { max: 120 }),
      })
    }
    const sections = optObjectArray(r, 'sections', MAX_SECTIONS)
    sections?.forEach((s, i) => {
      try {
        argsObject(s, ['id', 'title', 'question_ids', 'time_limit_minutes', 'lock_after_leave', 'instructions'])
        reqString(s, 'title', { max: 120 })
        optIdArray(s, 'question_ids', 500)
        optInt(s, 'time_limit_minutes', 1, 600)
      } catch (e) { throw new ToolInputError(`sections[${i}]: ${(e as Error).message}`) }
    })
    const a: UpdateTestArgs = compact({
      test_id: reqId(r, 'test_id'),
      settings: parseSettings(optObject(r, 'settings')),
      sections,
      add_question_ids: optIdArray(r, 'add_question_ids', 50),
      generate_questions: generate,
      remove_question_ids: optIdArray(r, 'remove_question_ids', 100),
    })
    if (!a.settings && !a.sections && !a.add_question_ids?.length && !a.generate_questions && !a.remove_question_ids?.length) {
      throw new ToolInputError('Nothing to change: give settings, sections, questions to add or questions to remove.')
    }
    return a
  },
  draftInputs: (a) => ({ test_id: a.test_id, add_question_ids: a.add_question_ids, generate_questions: a.generate_questions ?? null }),
  async propose(a, ctx) {
    const exam = await loadExam(ctx.caller, a.test_id)
    const current = (exam.questionList || []) as Doc[]
    const remove = a.remove_question_ids ?? []
    const unknown = remove.filter((id) => !current.some((q) => String(q.id) === id))
    if (unknown.length) throw new ToolInputError(`Not on this test: ${unknown.slice(0, 5).join(', ')}. Use get_test to see question ids.`)
    const prior = await openDraft<UpdateDraft>('update_test', ctx.caller, a[DRAFT_KEY])
    const added = prior && prior.base === (exam.updatedAt ?? null) ? prior.added : await questionsToAdd(exam, a)
    if (a.generate_questions && added.length === (a.add_question_ids?.length ?? 0)) {
      throw new ToolInputError("I couldn't generate the extra questions. Try other topics or types.")
    }
    a[DRAFT_KEY] = await sealDraft('update_test', ctx.caller, { added, base: exam.updatedAt ?? null } satisfies UpdateDraft)
    const next = applyQuestionChanges(exam, added, remove, a.sections, a.generate_questions?.section_title)
    const db = await getMongoDb()
    const attempts = await db.collection('exam_submissions').countDocuments({ exam_id: a.test_id })
    const fields = settingsToFields(a.settings)
    const warnings: string[] = []
    if (attempts > 0 && next.changed) warnings.push(`${attempts} candidate${attempts === 1 ? ' has' : 's have'} already submitted; changing questions affects comparisons between candidates.`)
    if (exam.published && next.changed) warnings.push('This test is published — candidates who open it next get the new questions.')
    if (next.questionList.length === 0) warnings.push('The test would have no questions left.')
    return {
      title: `Update test “${clip(exam.title, 80)}”`,
      preview: {
        changes: Object.entries(fields).map(([field, to]) => ({ field, from: exam[field] ?? null, to })),
        added: added.map((q) => ({ id: q.id, type: q.type, title: clip(q.title, 100), points: Number(q.score) || 0, difficulty: q.difficulty ?? null })),
        removed: current.filter((q) => remove.includes(String(q.id))).map((q) => ({ id: q.id, title: clip(q.title, 100) })),
        totals: { questions_before: current.length, questions_after: next.questionList.length },
        ...(a.sections || next.changed ? { sections: questionOutline({ questionList: next.questionList, sections: next.sections ?? exam.sections }) } : {}),
        warnings,
      },
    }
  },
  async execute(a, ctx) {
    const exam = await loadExam(ctx.caller, a.test_id)
    const draft = await openDraft<UpdateDraft>('update_test', ctx.caller, a[DRAFT_KEY])
    if (draft && draft.base !== (exam.updatedAt ?? null)) {
      return { ok: false, message: 'The test changed since this draft was prepared. Ask me to prepare the update again.' }
    }
    const added = draft ? draft.added : await questionsToAdd(exam, a)
    const next = applyQuestionChanges(exam, added, a.remove_question_ids ?? [], a.sections, a.generate_questions?.section_title)
    const body: Record<string, unknown> = settingsToFields(a.settings)
    if (next.changed) { body.questionList = next.questionList; body.questions = next.questionList.length }
    if (next.sections !== undefined) body.sections = next.sections
    const r = await updateExam(serviceUser(ctx.caller), a.test_id, body)
    if (!r.ok) return { ok: false, message: friendlyServiceError(r) }
    return { ok: true, message: `Updated “${exam.title}”.`, link: testLink(a.test_id), data: { test_id: a.test_id, questions: next.questionList.length } }
  },
})

// ─── publish_test ────────────────────────────────────────────────────────────

export const publishTestTool = writeTool<{ test_id: string }>({
  name: 'publish_test',
  risk: 'publish',
  description: 'Publish a draft test so invited candidates (or anyone, for open tests) can take it.',
  parameters: { type: 'object', properties: { test_id: { type: 'string' } }, required: ['test_id'] },
  parse(raw) {
    return { test_id: reqId(argsObject(raw, ['test_id']), 'test_id') }
  },
  async propose(a, ctx) {
    const exam = await loadExam(ctx.caller, a.test_id)
    if (exam.published) throw new ToolInputError('This test is already published.')
    const n = Array.isArray(exam.questionList) ? exam.questionList.length : 0
    if (n === 0 && exam.kind !== 'cad') throw new ToolInputError('This test has no questions yet — add some before publishing.')
    const warnings: string[] = []
    if (exam.ends_at && new Date(exam.ends_at).getTime() < Date.now()) warnings.push('The test window has already ended.')
    if (exam.access_type === 'open') warnings.push('Open access: anyone with the link can take it.')
    return {
      title: `Publish test “${clip(exam.title, 80)}”`,
      preview: {
        fields: {
          Questions: n,
          Duration: `${exam.duration ?? 60} min`,
          'Pass mark': `${examPassPercent(exam)}%`,
          Access: exam.access_type === 'open' ? 'Open' : 'Invite only',
          Window: exam.starts_at || exam.ends_at ? `${exam.starts_at || 'now'} → ${exam.ends_at || 'no end'}` : 'Always open',
        },
        warnings,
      },
    }
  },
  async execute(a, ctx) {
    const exam = await loadExam(ctx.caller, a.test_id)
    if (exam.published) return { ok: true, message: `“${exam.title}” is already published.`, link: testLink(a.test_id), data: { test_id: a.test_id } }
    const r = await updateExam(serviceUser(ctx.caller), a.test_id, { published: true })
    if (!r.ok) return { ok: false, message: friendlyServiceError(r) }
    return { ok: true, message: `Published “${exam.title}”.`, link: testLink(a.test_id), data: { test_id: a.test_id } }
  },
})
