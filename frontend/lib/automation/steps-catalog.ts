/**
 * Workflow step catalog + definition validation (pure, client-safe).
 *
 * The builder renders a form per step type from `STEP_TYPES[].fields`; the
 * API validates every saved workflow with `validateDefinition` so a broken
 * definition never reaches the engine.
 */
import { conditionProblems, type Condition } from './conditions'
import { isAnalyticsEventType, isKnownEventType, isPlatformOnlyEvent } from './event-types'

export type FieldKind = 'text' | 'textarea' | 'number' | 'select' | 'json' | 'condition' | 'boolean' | 'list'

export interface StepField {
  key: string
  label: string
  kind: FieldKind
  help?: string
  placeholder?: string
  options?: { value: string; label: string }[]
  required?: boolean
  /** Supports {{variables}} (the builder shows the variable picker). */
  vars?: boolean
}

export type StepGroup = 'Messages' | 'Hiring' | 'Rewards' | 'Data' | 'AI' | 'Logic' | 'Integrations'

export interface StepTypeDef {
  type: string
  label: string
  group: StepGroup
  description: string
  fields: StepField[]
  /** Superadmin (platform) workflows only. */
  platformOnly?: boolean
  /** Has a side effect outside the run (simulated in test runs). */
  sideEffect: boolean
  /** Holds nested steps. */
  container?: 'branch' | 'loop'
}

const t = (key: string, label: string, extra: Partial<StepField> = {}): StepField => ({ key, label, kind: 'text', vars: true, ...extra })

export const READ_COLLECTIONS = [
  'user', 'exams', 'exam_submissions', 'ats_applications', 'ats_candidates', 'ats_jobs', 'ats_interviews',
  'hackathons', 'hackathon_teams', 'codeathons', 'codeathon_registrations', 'certification_attempts',
  'billing_subscriptions', 'billing_orders', 'automation_events', 'problems', 'submissions', 'xp_events',
  'ai_chat_sessions', 'ai_code_reviews', 'github_webhook_events', 'interviews', 'mkt_orders',
] as const

/** Old names still accepted in saved workflows → the real collection (AUTO-030: standalone interviews live in `interviews`). */
export const READ_COLLECTION_ALIASES: Readonly<Record<string, string>> = { interview_sessions: 'interviews' }

/** Retries a side-effect step gets when the admin leaves the field empty (builder and engine agree, AUTO-010). */
export const DEFAULT_STEP_RETRIES = 2

export const UPDATE_COLLECTIONS = ['ats_applications', 'ats_candidates', 'user', 'exams'] as const

export const STEP_TYPES: readonly StepTypeDef[] = [
  {
    type: 'email.send', label: 'Send email', group: 'Messages', sideEffect: true,
    description: 'Email one address. Every email carries an unsubscribe link and respects bounces and opt-outs.',
    fields: [
      t('to', 'To', { required: true, placeholder: '{{trigger.email}}' }),
      t('subject', 'Subject', { required: true }),
      t('body', 'Message', { kind: 'textarea', required: true, help: 'Plain text. Blank lines start a new paragraph.' }),
      t('cta_label', 'Button label', { placeholder: 'View results' }),
      t('cta_url', 'Button link', { placeholder: '{{trigger.results_url}}' }),
      { key: 'category', label: 'Kind of email', kind: 'select', options: [
        { value: 'transactional', label: 'Service message (results, reminders, billing)' },
        { value: 'engagement', label: 'Engagement (tips, re-engagement) — honours unsubscribes' },
      ] },
    ],
  },
  {
    type: 'whatsapp.send', label: 'Send WhatsApp template', group: 'Messages', sideEffect: true,
    description: 'Send an approved Meta WhatsApp template. Only to people who agreed to WhatsApp messages.',
    fields: [
      t('user_id', 'User id', { placeholder: '{{trigger.user_id}}', help: 'A platform user (consent is checked).' }),
      t('candidate_id', 'Or hiring candidate id', { placeholder: '{{trigger.candidate_id}}' }),
      t('template', 'Template name', { required: true, vars: false, placeholder: 'payment_reminder' }),
      t('language', 'Template language', { vars: false, placeholder: 'en' }),
      t('params', 'Template values (one per line)', { kind: 'textarea' }),
    ],
  },
  {
    type: 'notify.in_app', label: 'In-app notification', group: 'Messages', sideEffect: true,
    description: 'Show a notification in the user’s bell (and push, if they allow it).',
    fields: [t('user_id', 'User id', { required: true, placeholder: '{{trigger.user_id}}' }), t('title', 'Title', { required: true }), t('message', 'Message', { kind: 'textarea' }), t('link', 'Link (path)', { placeholder: '/dashboard' })],
  },
  {
    type: 'slack.post', label: 'Post to Slack', group: 'Integrations', sideEffect: true,
    description: 'Post a message through a Slack incoming webhook.',
    fields: [t('webhook_url', 'Incoming webhook URL', { required: true, vars: false, placeholder: 'https://hooks.slack.com/services/…' }), t('text', 'Message', { kind: 'textarea', required: true })],
  },
  {
    type: 'teams.post', label: 'Post to Microsoft Teams', group: 'Integrations', sideEffect: true,
    description: 'Post a message through a Teams incoming webhook / workflow URL.',
    fields: [t('webhook_url', 'Incoming webhook URL', { required: true, vars: false }), t('title', 'Title'), t('text', 'Message', { kind: 'textarea', required: true })],
  },
  {
    type: 'webhook.send', label: 'Send signed webhook', group: 'Integrations', sideEffect: true,
    description: 'POST JSON to another system, signed with this workflow’s secret (X-CodeSpectra-Signature).',
    fields: [t('url', 'URL (https)', { required: true }), { key: 'body', label: 'JSON body', kind: 'json', vars: true, help: 'Leave empty to send the trigger data.' }],
  },
  {
    type: 'http.request', label: 'HTTP request', group: 'Integrations', sideEffect: true, platformOnly: true,
    description: 'Call any public URL (private networks are blocked).',
    fields: [t('url', 'URL', { required: true }), { key: 'method', label: 'Method', kind: 'select', options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => ({ value: m, label: m })) }, { key: 'headers', label: 'Headers (JSON)', kind: 'json' }, { key: 'body', label: 'Body (JSON or text)', kind: 'json', vars: true }],
  },
  {
    type: 'ats.move_stage', label: 'Move candidate to stage', group: 'Hiring', sideEffect: true,
    description: 'Move a hiring application to another stage of its job’s pipeline.',
    fields: [t('application_id', 'Application id', { required: true, placeholder: '{{trigger.application_id}}' }), t('stage', 'Stage id or name', { required: true }), t('reason', 'Reason')],
  },
  {
    type: 'ats.reject', label: 'Reject candidate', group: 'Hiring', sideEffect: true,
    description: 'Move the application to the job’s rejected stage with a reason.',
    fields: [t('application_id', 'Application id', { required: true, placeholder: '{{trigger.application_id}}' }), t('reason', 'Reason', { required: true })],
  },
  {
    type: 'ats.add_tag', label: 'Tag candidate', group: 'Hiring', sideEffect: true,
    description: 'Add a tag to a candidate.',
    fields: [t('candidate_id', 'Candidate id', { required: true, placeholder: '{{trigger.candidate_id}}' }), t('tag', 'Tag', { required: true })],
  },
  {
    type: 'ats.assign_owner', label: 'Assign owner', group: 'Hiring', sideEffect: true,
    description: 'Make a hiring-team member the owner of an application.',
    fields: [t('application_id', 'Application id', { required: true, placeholder: '{{trigger.application_id}}' }), t('owner_user_id', 'Owner user id', { required: true })],
  },
  {
    type: 'xp.award', label: 'Award XP', group: 'Rewards', sideEffect: true,
    description: 'Give a user XP (max 500 per step). Awarded once per run.',
    fields: [t('user_id', 'User id', { required: true, placeholder: '{{trigger.user_id}}' }), t('amount', 'XP', { kind: 'number', required: true }), t('note', 'Note')],
  },
  {
    type: 'certificate.issue', label: 'Issue certificate', group: 'Rewards', sideEffect: true,
    description: 'Issue a verifiable certificate (once per user and title).',
    fields: [t('user_id', 'User id', { required: true, placeholder: '{{trigger.user_id}}' }), t('title', 'Certificate title', { required: true }), t('level', 'Level', { placeholder: 'Completion' })],
  },
  {
    type: 'record.update', label: 'Update record', group: 'Data', sideEffect: true,
    description: 'Set allow-listed fields on one record (by id).',
    fields: [
      { key: 'collection', label: 'Collection', kind: 'select', required: true, options: UPDATE_COLLECTIONS.map((c) => ({ value: c, label: c })) },
      t('id', 'Record id', { required: true }),
      { key: 'set', label: 'Fields to set (JSON)', kind: 'json', vars: true, required: true, help: 'Allowed: owner_id, priority, tags, custom.* (per collection).' },
    ],
  },
  {
    type: 'mongo.find', label: 'Look up records', group: 'Data', sideEffect: false,
    description: 'Read up to 50 records (or count them). Your organisation’s data only.',
    fields: [
      { key: 'collection', label: 'Collection', kind: 'select', required: true, options: READ_COLLECTIONS.map((c) => ({ value: c, label: c })) },
      { key: 'filter', label: 'Filter (JSON)', kind: 'json', vars: true },
      { key: 'mode', label: 'Return', kind: 'select', options: [{ value: 'list', label: 'Records' }, { value: 'count', label: 'Count only' }, { value: 'first', label: 'First record' }] },
      { key: 'limit', label: 'Limit', kind: 'number' },
    ],
  },
  {
    type: 'ai.complete', label: 'AI step', group: 'AI', sideEffect: false,
    description: 'Ask the platform AI model. Data from the trigger is passed as data, never as instructions.',
    fields: [t('system', 'Instructions', { kind: 'textarea', vars: false }), t('prompt', 'Prompt', { kind: 'textarea', required: true }), { key: 'modelRole', label: 'Model', kind: 'select', options: [{ value: 'fast', label: 'Fast' }, { value: 'reasoning', label: 'Reasoning' }] }],
  },
  {
    type: 'condition', label: 'If / else', group: 'Logic', sideEffect: false, container: 'branch',
    description: 'Run the “then” steps when the condition matches, otherwise the “else” steps.',
    fields: [{ key: 'if', label: 'Condition', kind: 'condition', required: true }],
  },
  {
    type: 'filter', label: 'Continue only if', group: 'Logic', sideEffect: false,
    description: 'Stop the run here (successfully) unless the condition matches.',
    fields: [{ key: 'if', label: 'Condition', kind: 'condition', required: true }],
  },
  {
    type: 'delay', label: 'Wait', group: 'Logic', sideEffect: false,
    description: 'Pause for minutes, hours or days — or until a date. Survives restarts.',
    fields: [
      { key: 'amount', label: 'Wait for', kind: 'number' },
      { key: 'unit', label: 'Unit', kind: 'select', options: [{ value: 'minutes', label: 'Minutes' }, { value: 'hours', label: 'Hours' }, { value: 'days', label: 'Days' }] },
      t('until', 'Or wait until (date/time)', { placeholder: '{{trigger.scheduled_at}}' }),
      { key: 'offset_minutes', label: 'Offset from that time (minutes, negative = before)', kind: 'number' },
    ],
  },
  {
    type: 'for_each', label: 'For each', group: 'Logic', sideEffect: false, container: 'loop',
    description: 'Run the inner steps once per item of a list (max 100). Use {{item}} and {{index}}.',
    fields: [t('items', 'List', { required: true, placeholder: '{{steps.lookup}}', help: 'A step’s result is {{steps.<step id>}} — e.g. the records a “Look up records” step found.' })],
  },
  {
    type: 'log', label: 'Log a note', group: 'Logic', sideEffect: false,
    description: 'Write a note to the run history.',
    fields: [t('message', 'Message', { kind: 'textarea' })],
  },
]

const BY_TYPE = new Map(STEP_TYPES.map((s) => [s.type, s]))
export function stepTypeDef(type: string): StepTypeDef | undefined {
  return BY_TYPE.get(type)
}

// ─── Definition types ───────────────────────────────────────────────────────

export interface StepDef {
  id: string
  type: string
  label?: string
  config?: Record<string, unknown>
  /** if/else branches (type 'condition'). */
  then?: StepDef[]
  else?: StepDef[]
  /** loop body (type 'for_each'). */
  steps?: StepDef[]
}

export type TriggerKind = 'manual' | 'schedule' | 'webhook' | 'event'

export interface WorkflowDefinitionInput {
  name?: unknown
  description?: unknown
  trigger?: unknown
  cron_expression?: unknown
  event_type?: unknown
  event_filter?: unknown
  steps?: unknown
  is_active?: unknown
  sample_payload?: unknown
}

export const MAX_STEPS = 60
export const MAX_DEPTH = 4

const STEP_ID = /^[A-Za-z][A-Za-z0-9_]{0,39}$/

function* walk(steps: StepDef[], depth = 0): Generator<{ step: StepDef; depth: number }> {
  for (const s of steps) {
    yield { step: s, depth }
    for (const k of ['then', 'else', 'steps'] as const) if (Array.isArray(s[k])) yield* walk(s[k]!, depth + 1)
  }
}

export function countSteps(steps: StepDef[]): number {
  let n = 0
  for (const _ of walk(steps)) n++
  return n
}

/** Normalise raw JSON into StepDef[] (drops unknown keys). */
export function normalizeSteps(raw: unknown, depth = 0): StepDef[] {
  if (!Array.isArray(raw) || depth > MAX_DEPTH) return []
  return raw.slice(0, MAX_STEPS).filter((s) => s && typeof s === 'object').map((s) => {
    const o = s as Record<string, unknown>
    const step: StepDef = {
      id: String(o.id ?? '').slice(0, 40),
      type: String(o.type ?? '').slice(0, 40),
      ...(typeof o.label === 'string' ? { label: o.label.slice(0, 120) } : {}),
      config: o.config && typeof o.config === 'object' && !Array.isArray(o.config) ? (o.config as Record<string, unknown>) : {},
    }
    if (step.type === 'condition') {
      step.then = normalizeSteps(o.then, depth + 1)
      step.else = normalizeSteps(o.else, depth + 1)
    }
    if (step.type === 'for_each') step.steps = normalizeSteps(o.steps, depth + 1)
    return step
  })
}

const CRON_RE = /^(\S+\s+){4}\S+$/
const CRON_FIELDS: readonly { name: string; min: number; max: number }[] = [
  { name: 'minute', min: 0, max: 59 },
  { name: 'hour', min: 0, max: 23 },
  { name: 'day of month', min: 1, max: 31 },
  { name: 'month', min: 1, max: 12 },
  { name: 'day of week', min: 0, max: 7 },
]

/** Pure: does one cron field select at least one valid value (same syntax as lib/scheduler isDue)? */
function cronFieldOk(token: string, min: number, max: number): boolean {
  let any = false
  for (const piece of token.split(',')) {
    const m = /^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/.exec(piece.trim())
    if (!m) return false
    if (m[2] !== undefined && Number(m[2]) < 1) return false
    let lo = min
    let hi = max
    if (m[1] !== '*') {
      const [a, b] = m[1].split('-')
      lo = Number(a)
      hi = b === undefined ? lo : Number(b)
    }
    if (lo < min || hi > max || lo > hi) return false
    any = true
  }
  return any
}

/** Problems with a 5-field cron expression (AUTO-013: "every day at 9" must not save as a schedule that never runs). */
export function cronProblems(expr: unknown): string[] {
  const s = typeof expr === 'string' ? expr.trim() : ''
  if (!CRON_RE.test(s)) return ['Schedule needs a 5-part cron expression (minute hour day month weekday)']
  const parts = s.split(/\s+/)
  return CRON_FIELDS.flatMap((f, i) => (cronFieldOk(parts[i], f.min, f.max) ? [] : [`Schedule: the ${f.name} field "${parts[i]}" is not valid (${f.min}–${f.max}, *, ranges a-b, lists a,b or steps */n)`]))
}

/**
 * Validate a v2 workflow definition. `platform` = superadmin (global) workflow.
 * Returns a list of problems (empty = valid).
 */
export function validateDefinition(def: { trigger: string; cron_expression?: string | null; event_type?: string | null; event_filter?: unknown; steps: StepDef[] }, opts: { platform: boolean }): string[] {
  const errs: string[] = []
  if (!['manual', 'schedule', 'webhook', 'event'].includes(def.trigger)) errs.push('Pick a trigger')
  if (def.trigger === 'schedule') errs.push(...cronProblems(def.cron_expression))
  if (def.trigger === 'event') {
    const analytics = isAnalyticsEventType(def.event_type)
    if (!isKnownEventType(def.event_type) && !(analytics && opts.platform)) errs.push('Pick the event that starts this workflow')
    // AUTO-001: platform events (blog, events feed) belong to no organisation — they would never start an organisation workflow.
    else if (!opts.platform && isPlatformOnlyEvent(def.event_type)) errs.push('That event is platform-wide and never reaches organisation workflows — pick another event')
    errs.push(...conditionProblems(def.event_filter).map((p) => `Trigger filter: ${p}`))
  }
  const total = countSteps(def.steps)
  if (total === 0) errs.push('Add at least one step')
  if (total > MAX_STEPS) errs.push(`Too many steps (max ${MAX_STEPS})`)
  const ids = new Set<string>()
  for (const { step, depth } of walk(def.steps)) {
    if (depth > MAX_DEPTH) {
      errs.push('Steps are nested too deeply')
      break
    }
    const name = step.label || step.type
    if (!STEP_ID.test(step.id)) errs.push(`Step "${name}" has an invalid id (letters, digits, _)`)
    else if (ids.has(step.id)) errs.push(`Step id "${step.id}" is used twice`)
    ids.add(step.id)
    if (step.type.startsWith('trigger.')) continue
    const td = stepTypeDef(step.type)
    if (!td) {
      errs.push(`Unknown step type "${step.type}"`)
      continue
    }
    if (td.platformOnly && !opts.platform) errs.push(`"${td.label}" is only available in platform workflows`)
    const cfg = step.config || {}
    for (const fd of td.fields) {
      if (!fd.required) continue
      const v = cfg[fd.key]
      if (v === undefined || v === null || (typeof v === 'string' && !v.trim())) errs.push(`"${name}": ${fd.label} is required`)
    }
    if (step.type === 'condition' || step.type === 'filter') errs.push(...conditionProblems(cfg.if).map((p) => `"${name}": ${p}`))
    if (step.type === 'delay') {
      const amount = Number(cfg.amount)
      if (!cfg.until && !(Number.isFinite(amount) && amount > 0)) errs.push(`"${name}": set how long to wait`)
      if (Number.isFinite(amount) && amount > 0) {
        const unit = String(cfg.unit || 'minutes')
        const ms = amount * (unit === 'days' ? 86_400_000 : unit === 'hours' ? 3_600_000 : 60_000)
        if (ms > 90 * 86_400_000) errs.push(`"${name}": waits are limited to 90 days`)
      }
    }
    for (const k of ['retries', 'timeout_ms']) {
      if (cfg[k] !== undefined && !Number.isFinite(Number(cfg[k]))) errs.push(`"${name}": ${k} must be a number`)
    }
  }
  return errs
}

/** Next free step id for the builder ("email_2"…). */
export function nextStepId(steps: StepDef[], type: string): string {
  const base = type.replace(/[^a-z]+/gi, '_').replace(/^_+|_+$/g, '').toLowerCase().slice(0, 20) || 'step'
  const used = new Set<string>()
  for (const { step } of walk(steps)) used.add(step.id)
  for (let i = 1; i < 1000; i++) {
    const id = `${base}_${i}`
    if (!used.has(id)) return id
  }
  return `${base}_${Date.now()}`
}

export type { Condition }
