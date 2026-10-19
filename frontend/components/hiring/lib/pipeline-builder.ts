/**
 * Pipeline builder state: stage list reducer, per-type default config,
 * templates and validation. Pure — unit tested in tests/hiring-ui.test.ts.
 */
import type { PipelineStage, ScreeningCriteria, StageConfig, StageType } from '@/lib/ats/contract'
import { STAGE_TYPE_LABELS } from './labels'

/** Stage types a recruiter can add (applied / hired / rejected are fixed ends). */
export const ADDABLE_STAGE_TYPES: StageType[] = [
  'screening',
  'assessment',
  'bot_screen',
  'virtual_interview',
  'f2f_interview',
  'client_review',
  'offer',
  'custom',
]

/** Stages that must stay in place: `applied` first, `hired` then `rejected` last. */
export const FIXED_TYPES: ReadonlySet<StageType> = new Set(['applied', 'hired', 'rejected'])

export function defaultConfigFor(type: StageType): StageConfig | undefined {
  switch (type) {
    case 'screening': return { kind: 'screening' }
    case 'assessment': return { kind: 'assessment', exam_id: null, pass_score: 60, deadline_days: 3 }
    case 'bot_screen':
      return {
        kind: 'bot_screen',
        channels: ['whatsapp_chat', 'whatsapp_call', 'phone_call'],
        language: 'en-IN',
        pass_score: 60,
        max_attempts: 2,
        questions: [
          { id: 'q_notice', text: 'What is your notice period in days?', type: 'number', knockout: { max: 90 } },
          { id: 'q_relocate', text: 'Are you open to working from our office location?', type: 'yes_no' },
        ],
      }
    case 'virtual_interview':
    case 'f2f_interview':
      return {
        kind: 'interview',
        mode: type === 'virtual_interview' ? 'virtual' : 'f2f',
        provider: type === 'virtual_interview' ? 'livekit' : undefined,
        duration_min: type === 'virtual_interview' ? 45 : 60,
        panel_ids: [],
        scorecard: {
          criteria: [
            { id: 'c_skills', label: 'Technical skills' },
            { id: 'c_problem', label: 'Problem solving' },
            { id: 'c_comms', label: 'Communication' },
          ],
        },
        location: type === 'f2f_interview' ? '' : null,
        self_schedule: type === 'virtual_interview',
        pass_rule: 'majority_yes',
        pass_score: 3.5,
      }
    case 'client_review': return { kind: 'client_review' }
    case 'offer': return { kind: 'offer', template: null }
    case 'custom': return { kind: 'custom' }
    default: return undefined
  }
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24) || 'stage'
}

/** Stable id unique within the list, e.g. "s_assessment", "s_assessment_2". */
export function stageIdFor(type: StageType, existing: readonly { id: string }[]): string {
  const base = `s_${slug(type)}`
  const ids = new Set(existing.map((s) => s.id))
  if (!ids.has(base)) return base
  let i = 2
  while (ids.has(`${base}_${i}`)) i++
  return `${base}_${i}`
}

export function makeStage(type: StageType, existing: readonly PipelineStage[], name?: string): PipelineStage {
  const terminal = type === 'hired' || type === 'rejected'
  return {
    id: stageIdFor(type, existing),
    type,
    name: name || STAGE_TYPE_LABELS[type],
    advance: type === 'applied' || type === 'screening' ? 'auto' : 'approval',
    on_fail: type === 'screening' ? 'review' : 'reject',
    client_visible: type === 'client_review' || type === 'offer' || type === 'hired',
    sla_days: terminal ? null : type === 'applied' ? null : 7,
    notify: { email: !terminal || type === 'hired', whatsapp: false, client: type === 'client_review' },
    config: defaultConfigFor(type),
  }
}

export function buildPipeline(types: StageType[], names: Partial<Record<number, string>> = {}): PipelineStage[] {
  const out: PipelineStage[] = []
  types.forEach((t, i) => out.push(makeStage(t, out, names[i])))
  return out
}

export type TemplateId = 'tech' | 'campus' | 'staffing'

export const PIPELINE_TEMPLATES: { id: TemplateId; name: string; description: string; build: () => PipelineStage[] }[] = [
  {
    id: 'tech',
    name: 'Tech hiring',
    description: 'Screening, a coding test, a bot screen, then video and on-site interviews.',
    build: () => buildPipeline(['applied', 'screening', 'assessment', 'bot_screen', 'virtual_interview', 'f2f_interview', 'offer', 'hired', 'rejected']),
  },
  {
    id: 'campus',
    name: 'Campus',
    description: 'High volume: auto-screen and test, one video interview, then the offer.',
    build: () => {
      const p = buildPipeline(['applied', 'screening', 'assessment', 'virtual_interview', 'offer', 'hired', 'rejected'])
      return p.map((s) => (s.type === 'screening' || s.type === 'assessment' ? { ...s, advance: 'auto' as const, on_fail: 'reject' as const } : s))
    },
  },
  {
    id: 'staffing',
    name: 'Staffing (client review)',
    description: 'Screen and bot-call, interview, then your client reviews before the offer.',
    build: () => buildPipeline(['applied', 'screening', 'bot_screen', 'virtual_interview', 'client_review', 'offer', 'hired', 'rejected']),
  },
]

export type PipelineAction =
  | { type: 'set'; stages: PipelineStage[] }
  | { type: 'add'; stageType: StageType; at?: number }
  | { type: 'remove'; id: string }
  | { type: 'move'; id: string; to: number }
  | { type: 'shift'; id: string; delta: -1 | 1 }
  | { type: 'update'; id: string; patch: Partial<PipelineStage> }
  | { type: 'config'; id: string; patch: Partial<Record<string, unknown>> }

/** Index range a movable stage may occupy (between the fixed ends). */
export function movableRange(stages: readonly PipelineStage[]): [number, number] {
  let lo = 0
  while (lo < stages.length && stages[lo].type === 'applied') lo++
  let hi = stages.length - 1
  while (hi >= 0 && (stages[hi].type === 'hired' || stages[hi].type === 'rejected')) hi--
  return [lo, hi]
}

export function pipelineReducer(state: PipelineStage[], action: PipelineAction): PipelineStage[] {
  switch (action.type) {
    case 'set':
      return action.stages
    case 'add': {
      if (FIXED_TYPES.has(action.stageType)) return state
      const stage = makeStage(action.stageType, state)
      const [, hi] = movableRange(state)
      const at = action.at == null ? hi + 1 : clamp(action.at, movableRange(state)[0], hi + 1)
      const next = state.slice()
      next.splice(at, 0, stage)
      return next
    }
    case 'remove': {
      const s = state.find((x) => x.id === action.id)
      if (!s || FIXED_TYPES.has(s.type)) return state
      return state.filter((x) => x.id !== action.id)
    }
    case 'shift': {
      const i = state.findIndex((x) => x.id === action.id)
      if (i < 0) return state
      return pipelineReducer(state, { type: 'move', id: action.id, to: i + action.delta })
    }
    case 'move': {
      const i = state.findIndex((x) => x.id === action.id)
      if (i < 0 || FIXED_TYPES.has(state[i].type)) return state
      const [lo, hi] = movableRange(state)
      const to = clamp(action.to, lo, hi)
      if (to === i) return state
      const next = state.slice()
      const [s] = next.splice(i, 1)
      next.splice(to, 0, s)
      return next
    }
    case 'update':
      return state.map((s) => (s.id === action.id ? { ...s, ...action.patch, id: s.id, type: s.type } : s))
    case 'config':
      return state.map((s) =>
        s.id === action.id && s.config ? { ...s, config: { ...s.config, ...action.patch } as StageConfig } : s,
      )
    default:
      return state
  }
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n))
}

/** Problems that block saving, in plain words. Empty = OK. */
export function validatePipeline(stages: readonly PipelineStage[]): string[] {
  const errs: string[] = []
  if (!stages.some((s) => s.type === 'applied')) errs.push('The pipeline needs an "Applied" stage.')
  if (!stages.some((s) => s.type === 'hired')) errs.push('The pipeline needs a "Hired" stage.')
  if (!stages.some((s) => s.type === 'rejected')) errs.push('The pipeline needs a "Rejected" stage.')
  for (const s of stages) {
    if (!s.name.trim()) errs.push('Every stage needs a name.')
    const c = s.config
    if (c?.kind === 'assessment' && !c.exam_id) errs.push(`"${s.name}": pick a test.`)
    if (c?.kind === 'bot_screen') {
      if (c.channels.length === 0) errs.push(`"${s.name}": choose at least one channel.`)
      if (c.questions.length === 0) errs.push(`"${s.name}": add at least one question.`)
      if (c.questions.some((q) => !q.text.trim())) errs.push(`"${s.name}": a question is empty.`)
      if (c.questions.some((q) => q.type === 'choice' && (q.options?.filter((o) => o.trim()).length ?? 0) < 2))
        errs.push(`"${s.name}": choice questions need at least two options.`)
    }
    if (c?.kind === 'interview') {
      if (c.duration_min < 10) errs.push(`"${s.name}": interviews should be at least 10 minutes.`)
      if (c.scorecard.criteria.length === 0) errs.push(`"${s.name}": add at least one scorecard criterion.`)
      if (c.mode === 'f2f' && !c.location?.trim()) errs.push(`"${s.name}": add the interview location.`)
    }
  }
  return [...new Set(errs)]
}

export const DEFAULT_WEIGHTS: Required<NonNullable<ScreeningCriteria['weights']>> = {
  must: 35,
  nice: 10,
  keywords: 10,
  years: 15,
  location: 10,
  notice: 5,
  education: 5,
  salary: 5,
  ai: 5,
}

export function defaultCriteria(): ScreeningCriteria {
  return {
    must_have_skills: [],
    nice_to_have_skills: [],
    keywords: [],
    min_years: null,
    max_years: null,
    locations: [],
    relocation_ok: true,
    max_notice_days: null,
    education: [],
    max_expected_salary: null,
    pass_score: 60,
    weights: { ...DEFAULT_WEIGHTS },
    use_ai_match: false,
    must_have_required: false,
  }
}
