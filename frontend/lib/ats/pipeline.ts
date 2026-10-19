/**
 * Pipeline + criteria defaults and validation. Pure (exam ownership and stage
 * counts are passed in), so the job routes and tests share the same rules.
 */
import type {
  AtsJob, BotChannel, JobStatus, MeetingProvider, PipelineStage, ScreeningCriteria, StageConfig, StageType,
} from './contract'

export const STAGE_TYPES: StageType[] = [
  'applied', 'screening', 'assessment', 'bot_screen', 'virtual_interview', 'f2f_interview',
  'client_review', 'offer', 'hired', 'rejected', 'custom',
]
export const TERMINAL_TYPES: StageType[] = ['hired', 'rejected']
const BOT_CHANNELS: BotChannel[] = ['whatsapp_chat', 'whatsapp_call', 'phone_call']
const PROVIDERS: MeetingProvider[] = ['livekit', 'zoom', 'google_meet', 'teams', 'manual']
export const MAX_STAGES = 20

export function defaultCriteria(skills: string[] = []): ScreeningCriteria {
  return {
    must_have_skills: skills.slice(0, 10),
    nice_to_have_skills: [],
    keywords: [],
    min_years: null,
    max_years: null,
    locations: [],
    relocation_ok: false,
    max_notice_days: null,
    education: [],
    max_expected_salary: null,
    pass_score: 50,
    use_ai_match: false,
    must_have_required: false,
  }
}

const DEFAULT_SCORECARD = {
  criteria: [
    { id: 'technical', label: 'Technical depth' },
    { id: 'problem_solving', label: 'Problem solving' },
    { id: 'communication', label: 'Communication' },
    { id: 'culture', label: 'Team fit' },
  ],
}

/**
 * Default pipeline: applied → screening → assessment → bot_screen →
 * virtual_interview → f2f_interview → client_review → offer → hired (+ rejected).
 * client_review is left out when the job has no client.
 */
export function defaultPipeline(opts: { examId?: string | null; hasClient?: boolean } = {}): PipelineStage[] {
  const s: PipelineStage[] = [
    { id: 's_applied', type: 'applied', name: 'Applied', advance: 'auto', on_fail: 'review', notify: { email: true } },
    { id: 's_screening', type: 'screening', name: 'Résumé screening', advance: 'auto', on_fail: 'review', config: { kind: 'screening' } },
    {
      id: 's_assessment', type: 'assessment', name: 'Assessment', advance: 'auto', on_fail: 'reject', sla_days: 10,
      notify: { email: true }, config: { kind: 'assessment', exam_id: opts.examId ?? null, pass_score: 60, deadline_days: 7 },
    },
    {
      id: 's_bot_screen', type: 'bot_screen', name: 'Phone screen', advance: 'approval', on_fail: 'review', sla_days: 7,
      config: {
        kind: 'bot_screen', channels: ['whatsapp_call', 'phone_call', 'whatsapp_chat'], language: 'en-IN', pass_score: 60, max_attempts: 3,
        questions: [
          { id: 'q_notice', text: 'What is your notice period in days?', type: 'number' },
          { id: 'q_relocate', text: 'Are you open to relocating for this role?', type: 'yes_no' },
          { id: 'q_expected', text: 'What is your expected annual salary?', type: 'number' },
        ],
      },
    },
    {
      id: 's_virtual_interview', type: 'virtual_interview', name: 'Video interview', advance: 'approval', on_fail: 'review', sla_days: 14,
      notify: { email: true },
      config: { kind: 'interview', mode: 'virtual', provider: 'livekit', duration_min: 45, panel_ids: [], scorecard: DEFAULT_SCORECARD, self_schedule: true, pass_rule: 'majority_yes' },
    },
    {
      id: 's_f2f_interview', type: 'f2f_interview', name: 'Onsite interview', advance: 'approval', on_fail: 'review', sla_days: 14,
      notify: { email: true },
      config: { kind: 'interview', mode: 'f2f', duration_min: 60, panel_ids: [], scorecard: DEFAULT_SCORECARD, location: null, pass_rule: 'majority_yes' },
    },
    ...(opts.hasClient
      ? [{ id: 's_client_review', type: 'client_review', name: 'Client review', advance: 'approval', on_fail: 'review', client_visible: true, notify: { client: true }, config: { kind: 'client_review' } } as PipelineStage]
      : []),
    { id: 's_offer', type: 'offer', name: 'Offer', advance: 'approval', on_fail: 'review', notify: { email: true }, config: { kind: 'offer', template: null } },
    { id: 's_hired', type: 'hired', name: 'Hired', advance: 'auto', on_fail: 'review', notify: { email: true } },
    { id: 's_rejected', type: 'rejected', name: 'Rejected', advance: 'auto', on_fail: 'reject', notify: { email: true } },
  ]
  return s
}

// ─── Sanitising ──────────────────────────────────────────────────────────────

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const strList = (v: unknown, maxItems = 40, maxLen = 80): string[] =>
  Array.isArray(v)
    ? [...new Set(v.filter((x): x is string => typeof x === 'string').map((x) => x.trim().slice(0, maxLen)).filter(Boolean))].slice(0, maxItems)
    : typeof v === 'string'
      ? strList(v.split(','), maxItems, maxLen)
      : []
const numOrNull = (v: unknown, lo: number, hi: number): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : null
}
const bool = (v: unknown) => v === true || v === 'true'

export function sanitizeCriteria(raw: unknown, base: ScreeningCriteria = defaultCriteria()): ScreeningCriteria {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const has = (k: string) => k in r
  const weights: ScreeningCriteria['weights'] = {}
  if (r.weights && typeof r.weights === 'object') {
    for (const k of ['must', 'nice', 'keywords', 'years', 'location', 'notice', 'education', 'salary', 'ai'] as const) {
      const w = numOrNull((r.weights as Record<string, unknown>)[k], 0, 100)
      if (w !== null) weights[k] = w
    }
  }
  return {
    must_have_skills: has('must_have_skills') ? strList(r.must_have_skills) : base.must_have_skills,
    nice_to_have_skills: has('nice_to_have_skills') ? strList(r.nice_to_have_skills) : base.nice_to_have_skills,
    keywords: has('keywords') ? strList(r.keywords) : base.keywords,
    min_years: has('min_years') ? numOrNull(r.min_years, 0, 60) : base.min_years ?? null,
    max_years: has('max_years') ? numOrNull(r.max_years, 0, 60) : base.max_years ?? null,
    locations: has('locations') ? strList(r.locations, 30) : base.locations ?? [],
    relocation_ok: has('relocation_ok') ? bool(r.relocation_ok) : !!base.relocation_ok,
    max_notice_days: has('max_notice_days') ? numOrNull(r.max_notice_days, 0, 365) : base.max_notice_days ?? null,
    education: has('education') ? strList(r.education, 20) : base.education ?? [],
    max_expected_salary: has('max_expected_salary') ? numOrNull(r.max_expected_salary, 0, 1e10) : base.max_expected_salary ?? null,
    pass_score: has('pass_score') ? numOrNull(r.pass_score, 0, 100) ?? base.pass_score : base.pass_score,
    ...(Object.keys(weights).length ? { weights } : base.weights ? { weights: base.weights } : {}),
    use_ai_match: has('use_ai_match') ? bool(r.use_ai_match) : base.use_ai_match,
    must_have_required: has('must_have_required') ? bool(r.must_have_required) : base.must_have_required,
  }
}

function sanitizeConfig(type: StageType, raw: unknown, errors: string[], label: string): StageConfig | undefined {
  const c = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  switch (type) {
    case 'screening':
      return { kind: 'screening' }
    case 'assessment': {
      const exam = str(c.exam_id, 128) || null
      const pass = numOrNull(c.pass_score, 0, 100)
      return { kind: 'assessment', exam_id: exam, pass_score: pass ?? 60, ...(numOrNull(c.deadline_days, 1, 60) !== null ? { deadline_days: numOrNull(c.deadline_days, 1, 60)! } : {}) }
    }
    case 'bot_screen': {
      const channels = strList(c.channels, 3).filter((x): x is BotChannel => (BOT_CHANNELS as string[]).includes(x))
      if (!channels.length) errors.push(`${label}: choose at least one screening channel`)
      const qs = Array.isArray(c.questions) ? c.questions.slice(0, 30) : []
      const questions = qs
        .filter((q): q is Record<string, unknown> => !!q && typeof q === 'object')
        .map((q, i) => {
          const type = (['open', 'yes_no', 'number', 'choice'] as const).find((t) => t === q.type) ?? 'open'
          const ko = q.knockout && typeof q.knockout === 'object' ? (q.knockout as Record<string, unknown>) : null
          return {
            id: str(q.id, 40) || `q_${i + 1}`,
            text: str(q.text, 500),
            type,
            ...(type === 'choice' ? { options: strList(q.options, 10, 120) } : {}),
            ...(ko ? {
              knockout: {
                ...('equals' in ko && ['string', 'number', 'boolean'].includes(typeof ko.equals) ? { equals: ko.equals } : {}),
                ...(numOrNull(ko.min, -1e12, 1e12) !== null ? { min: numOrNull(ko.min, -1e12, 1e12)! } : {}),
                ...(numOrNull(ko.max, -1e12, 1e12) !== null ? { max: numOrNull(ko.max, -1e12, 1e12)! } : {}),
              },
            } : {}),
          }
        })
        .filter((q) => q.text)
      if (!questions.length) errors.push(`${label}: add at least one screening question`)
      return {
        kind: 'bot_screen', channels, questions,
        ...(str(c.language, 12) ? { language: str(c.language, 12) } : {}),
        pass_score: numOrNull(c.pass_score, 0, 100) ?? 60,
        ...(numOrNull(c.max_attempts, 1, 5) !== null ? { max_attempts: numOrNull(c.max_attempts, 1, 5)! } : {}),
      }
    }
    case 'virtual_interview':
    case 'f2f_interview': {
      const mode = type === 'virtual_interview' ? 'virtual' : 'f2f'
      const provider = (PROVIDERS as string[]).includes(String(c.provider)) ? (c.provider as MeetingProvider) : 'livekit'
      const sc = (c.scorecard && typeof c.scorecard === 'object' ? c.scorecard : DEFAULT_SCORECARD) as { criteria?: unknown }
      const criteria = (Array.isArray(sc.criteria) ? sc.criteria : [])
        .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
        .slice(0, 12)
        .map((x, i) => ({ id: str(x.id, 40) || `c_${i + 1}`, label: str(x.label, 80), ...(str(x.description, 300) ? { description: str(x.description, 300) } : {}) }))
        .filter((x) => x.label)
      const rule = (['all_yes', 'majority_yes', 'avg_score'] as const).find((r) => r === c.pass_rule) ?? 'majority_yes'
      return {
        kind: 'interview', mode,
        ...(mode === 'virtual' ? { provider } : {}),
        duration_min: numOrNull(c.duration_min, 10, 480) ?? 45,
        panel_ids: strList(c.panel_ids, 10, 128),
        scorecard: { criteria: criteria.length ? criteria : DEFAULT_SCORECARD.criteria },
        ...(mode === 'f2f' ? { location: str(c.location, 300) || null } : {}),
        ...(c.self_schedule !== undefined ? { self_schedule: bool(c.self_schedule) } : {}),
        pass_rule: rule,
        ...(rule === 'avg_score' ? { pass_score: numOrNull(c.pass_score, 1, 5) ?? 3 } : {}),
        // interviews part: book on built-in video when the chosen provider isn't connected
        ...(mode === 'virtual' && c.fallback_to_livekit !== undefined ? { fallback_to_livekit: bool(c.fallback_to_livekit) } : {}),
      } as StageConfig
    }
    case 'client_review':
      return { kind: 'client_review' }
    case 'offer':
      return { kind: 'offer', template: str(c.template, 5000) || null }
    case 'custom':
      return { kind: 'custom' }
    default:
      return undefined
  }
}

/** Shape-check + normalise a pipeline from a request body. */
export function sanitizePipeline(raw: unknown): { stages: PipelineStage[]; errors: string[] } {
  const errors: string[] = []
  if (!Array.isArray(raw)) return { stages: [], errors: ['Pipeline must be a list of stages'] }
  if (raw.length > MAX_STAGES) errors.push(`A pipeline can have up to ${MAX_STAGES} stages`)
  const stages: PipelineStage[] = []
  raw.slice(0, MAX_STAGES).forEach((r, i) => {
    const s = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>
    const label = `Stage ${i + 1}`
    const type = STAGE_TYPES.find((t) => t === s.type)
    if (!type) { errors.push(`${label}: unknown stage type`); return }
    const id = str(s.id, 40)
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) errors.push(`${label}: id must be letters, numbers, - or _`)
    const name = str(s.name, 60)
    if (!name) errors.push(`${label}: give the stage a name`)
    const notify = s.notify && typeof s.notify === 'object' ? (s.notify as Record<string, unknown>) : null
    const stage: PipelineStage = {
      id,
      type,
      name: name || type,
      advance: s.advance === 'approval' ? 'approval' : 'auto',
      on_fail: s.on_fail === 'hold' ? 'hold' : s.on_fail === 'review' ? 'review' : 'reject',
      ...(s.client_visible !== undefined ? { client_visible: bool(s.client_visible) } : {}),
      sla_days: numOrNull(s.sla_days, 1, 365),
      ...(notify ? { notify: { email: bool(notify.email), whatsapp: bool(notify.whatsapp), client: bool(notify.client) } } : {}),
    }
    const config = sanitizeConfig(type, s.config, errors, `${label} (${stage.name})`)
    if (config) stage.config = config
    stages.push(stage)
  })
  return { stages, errors }
}

/**
 * Structural rules: unique ids; exactly one applied (first), hired and
 * rejected; assessments point at an exam of this tenant (required to open).
 */
export function validatePipeline(
  stages: PipelineStage[],
  opts: { tenantExamIds: ReadonlySet<string>; requireRunnable: boolean },
): string[] {
  const errors: string[] = []
  const ids = new Set<string>()
  for (const s of stages) {
    if (ids.has(s.id)) errors.push(`Stage id "${s.id}" is used twice`)
    ids.add(s.id)
  }
  for (const t of ['applied', 'hired', 'rejected'] as const) {
    const n = stages.filter((s) => s.type === t).length
    if (n === 0) errors.push(`The pipeline needs a "${t}" stage`)
    if (n > 1) errors.push(`The pipeline can only have one "${t}" stage`)
  }
  if (stages.length && stages[0].type !== 'applied') errors.push('The first stage must be "applied"')
  for (const s of stages) {
    if (s.type !== 'assessment') continue
    const examId = s.config?.kind === 'assessment' ? s.config.exam_id : null
    if (examId && !opts.tenantExamIds.has(examId)) errors.push(`${s.name}: that assessment isn't in your organisation`)
    if (!examId && opts.requireRunnable) errors.push(`${s.name}: choose an assessment before opening the job`)
  }
  return errors
}

/**
 * Removing a stage that still has candidates needs a target for them:
 * `moves[removedId] = targetId` (target must exist in the new pipeline).
 */
export function planStageMoves(
  oldStages: PipelineStage[],
  newStages: PipelineStage[],
  countsByStage: Record<string, number>,
  moves: Record<string, string> = {},
): { moves: { from: string; to: string }[]; errors: string[] } {
  const keep = new Set(newStages.map((s) => s.id))
  const out: { from: string; to: string }[] = []
  const errors: string[] = []
  for (const s of oldStages) {
    if (keep.has(s.id)) continue
    const n = countsByStage[s.id] || 0
    if (n === 0) continue
    const to = moves[s.id]
    if (!to) errors.push(`"${s.name}" has ${n} candidate${n === 1 ? '' : 's'} — choose a stage to move them to`)
    else if (!keep.has(to)) errors.push(`"${s.name}": the target stage doesn't exist`)
    else out.push({ from: s.id, to })
  }
  return { moves: out, errors }
}

/** Next stage on pass: the following stage in order, never the rejected one. */
export function nextStageOf(stages: PipelineStage[], stageId: string): PipelineStage | null {
  const i = stages.findIndex((s) => s.id === stageId)
  if (i < 0) return null
  if (TERMINAL_TYPES.includes(stages[i].type)) return null
  for (const s of stages.slice(i + 1)) if (s.type !== 'rejected') return s
  return null
}

// ─── Status lifecycle ────────────────────────────────────────────────────────

const TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  draft: ['open', 'closed'],
  open: ['on_hold', 'closed', 'filled'],
  on_hold: ['open', 'closed'],
  closed: ['open'],
  filled: ['open', 'closed'],
}

export function canTransition(from: JobStatus, to: JobStatus): boolean {
  return from === to || TRANSITIONS[from]?.includes(to) === true
}

export const JOB_STATUSES: JobStatus[] = ['draft', 'open', 'on_hold', 'closed', 'filled']

/** Editable job fields from a request body (status/pipeline handled separately). */
export function sanitizeJobFields(raw: Record<string, unknown>): Partial<AtsJob> {
  const out: Partial<AtsJob> = {}
  const has = (k: string) => k in raw
  if (has('title')) out.title = str(raw.title, 160)
  if (has('department')) out.department = str(raw.department, 120) || null
  if (has('location')) out.location = str(raw.location, 160) || null
  if (has('work_mode')) out.work_mode = (['onsite', 'hybrid', 'remote'] as const).find((m) => m === raw.work_mode) ?? null
  if (has('employment_type')) out.employment_type = (['full_time', 'part_time', 'contract', 'internship'] as const).find((m) => m === raw.employment_type) ?? null
  if (has('experience_min')) out.experience_min = numOrNull(raw.experience_min, 0, 60)
  if (has('experience_max')) out.experience_max = numOrNull(raw.experience_max, 0, 60)
  if (has('salary')) {
    const s = raw.salary && typeof raw.salary === 'object' ? (raw.salary as Record<string, unknown>) : null
    out.salary = s
      ? {
          ...(numOrNull(s.min, 0, 1e10) !== null ? { min: numOrNull(s.min, 0, 1e10)! } : {}),
          ...(numOrNull(s.max, 0, 1e10) !== null ? { max: numOrNull(s.max, 0, 1e10)! } : {}),
          ...(/^[A-Z]{3}$/.test(String(s.currency || '')) ? { currency: String(s.currency) } : {}),
          ...((['year', 'month', 'hour'] as const).find((p) => p === s.period) ? { period: s.period as 'year' | 'month' | 'hour' } : {}),
        }
      : null
  }
  if (has('openings')) out.openings = Math.round(numOrNull(raw.openings, 0, 10_000) ?? 1)
  if (has('description')) out.description = str(raw.description, 20_000)
  if (has('requirements')) out.requirements = str(raw.requirements, 10_000) || null
  if (has('skills')) out.skills = strList(raw.skills, 40)
  if (has('is_public')) out.is_public = bool(raw.is_public)
  if (has('recruiter_ids')) out.recruiter_ids = strList(raw.recruiter_ids, 20, 128)
  if (has('hiring_manager_ids')) out.hiring_manager_ids = strList(raw.hiring_manager_ids, 20, 128)
  return out
}
