/**
 * Scheduled copilot tasks ("every Monday send me new applicants") — built as a
 * workflow of the automations engine (lib/automation). Pure: this file only
 * turns the request into a cron expression + workflow steps; the tool saves
 * it through the engine's public pieces (validateDefinition, the workflows
 * collection) after the admin confirms. The workflow then runs on the engine's
 * scheduler: look up data → AI summary (fenced as data) → email / in-app note.
 */
import type { StepDef } from '@/lib/automation/steps-catalog'

export type ScheduleFrequency = 'daily' | 'weekly' | 'monthly'
export const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const
export type Weekday = (typeof WEEKDAYS)[number]

export const REPORT_SOURCES = {
  new_applicants: { label: 'New applicants', collection: 'ats_applications', filter: { created_at: { $gte: '{{since}}' } } },
  hiring_pipeline: { label: 'Active applications by stage', collection: 'ats_applications', filter: { status: 'active' } },
  upcoming_interviews: { label: 'Upcoming interviews', collection: 'ats_interviews', filter: { status: 'scheduled', scheduled_at: { $gte: '{{now}}' } } },
  test_submissions: { label: 'New test submissions', collection: 'exam_submissions', filter: { submitted_at: { $gte: '{{since}}' } } },
  pending_reviews: { label: 'Submissions waiting for review', collection: 'exam_submissions', filter: { has_pending_review: true } },
  hackathon_teams: { label: 'New hackathon teams', collection: 'hackathon_teams', filter: { created_at: { $gte: '{{since}}' } } },
  open_jobs: { label: 'Open jobs', collection: 'ats_jobs', filter: { status: 'open' } },
} as const
export type ReportSource = keyof typeof REPORT_SOURCES

/** "HH:MM" (24h, UTC) → [hour, minute] or null. */
export function parseTime(v: string): [number, number] | null {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(v.trim())
  return m ? [Number(m[1]), Number(m[2])] : null
}

/** 5-field cron in UTC. */
export function cronFor(freq: ScheduleFrequency, timeUtc: string, opts: { weekday?: Weekday; dayOfMonth?: number } = {}): string {
  const t = parseTime(timeUtc)
  if (!t) throw new Error('time must be HH:MM (24-hour, UTC)')
  const [h, m] = t
  if (freq === 'daily') return `${m} ${h} * * *`
  if (freq === 'weekly') return `${m} ${h} * * ${WEEKDAYS.indexOf(opts.weekday ?? 'monday')}`
  const dom = Math.max(1, Math.min(28, Math.floor(opts.dayOfMonth ?? 1)))
  return `${m} ${h} ${dom} * *`
}

const lookback = (freq: ScheduleFrequency) => (freq === 'daily' ? '{{yesterday}}' : freq === 'weekly' ? '{{sevenDaysAgo}}' : '{{thirtyDaysAgo}}')

function withSince<T>(v: T, since: string): T {
  return JSON.parse(JSON.stringify(v).replace(/\{\{since\}\}/g, since)) as T
}

export interface ScheduledTaskInput {
  title: string
  instructions: string
  sources: ReportSource[]
  frequency: ScheduleFrequency
  timeUtc: string
  weekday?: Weekday
  dayOfMonth?: number
  deliver: 'email' | 'in_app'
  recipient: { userId: string; email: string }
}

/** Steps + trigger of the workflow that carries out a scheduled copilot task. */
export function buildScheduledWorkflow(input: ScheduledTaskInput): { trigger: 'schedule'; cron_expression: string; steps: StepDef[]; description: string } {
  const since = lookback(input.frequency)
  const lookups: StepDef[] = input.sources.slice(0, 4).map((src) => ({
    id: `data_${src}`,
    type: 'mongo.find',
    label: REPORT_SOURCES[src].label,
    config: { collection: REPORT_SOURCES[src].collection, filter: withSince(REPORT_SOURCES[src].filter, since), mode: 'list', limit: 50 },
  }))
  const dataBlock = input.sources.slice(0, 4).map((src) => `${REPORT_SOURCES[src].label}: {{steps.data_${src} | json}}`).join('\n')
  const summary: StepDef = {
    id: 'summary',
    type: 'ai.complete',
    label: 'Write the summary',
    config: {
      system: 'You write short, factual summaries for a hiring / assessment platform admin. Use only the records given. Use plain text with short bullet points. If there is nothing, say so in one line.',
      prompt: `Task from the admin: ${input.instructions.slice(0, 1000)}\n\nRecords (JSON):\n${dataBlock}`,
      modelRole: 'fast',
    },
  }
  const deliver: StepDef = input.deliver === 'email'
    ? { id: 'deliver', type: 'email.send', label: 'Email it to you', config: { to: input.recipient.email, subject: input.title.slice(0, 120), body: '{{steps.summary}}', cta_label: 'Open CodeSpectra', cta_url: '/dashboard/admin/agent', category: 'transactional' } }
    : { id: 'deliver', type: 'notify.in_app', label: 'Notify you in the app', config: { user_id: input.recipient.userId, title: input.title.slice(0, 120), message: '{{steps.summary | truncate:900}}', link: '/dashboard/admin/agent' } }
  const when = input.frequency === 'daily' ? `every day at ${input.timeUtc} UTC` : input.frequency === 'weekly' ? `every ${input.weekday ?? 'monday'} at ${input.timeUtc} UTC` : `on day ${input.dayOfMonth ?? 1} of each month at ${input.timeUtc} UTC`
  return {
    trigger: 'schedule',
    cron_expression: cronFor(input.frequency, input.timeUtc, { weekday: input.weekday, dayOfMonth: input.dayOfMonth }),
    steps: [...lookups, summary, deliver],
    description: `Scheduled by the AI copilot: ${when}. ${input.instructions.slice(0, 300)}`,
  }
}

// ─── Run-time authorisation (W4-08) ─────────────────────────────────────────

export const COPILOT_SCHEDULE_TEMPLATE = 'copilot-scheduled-task'

export type CreatorCheck =
  | { ok: true; email: string }
  | { ok: false; reason: 'creator_missing' | 'creator_inactive' | 'creator_not_admin' }

/**
 * Pure: may the creator's scheduled report still run for this workflow?
 * `resolved` is lib/auth-account resolveAccount(profile, { tenantActive }).
 * Platform workflows (tenant null) need a superadmin; tenant workflows need a
 * superadmin or an active tenant_admin of that same tenant.
 */
export function creatorStillAuthorised(
  resolved: { ok: true; role: string; tenantId: string | null } | { ok: false; reason: 'missing' | 'inactive' },
  workflowTenantId: string | null | undefined,
  email: string | null | undefined,
): CreatorCheck {
  if (!resolved.ok) return { ok: false, reason: resolved.reason === 'missing' ? 'creator_missing' : 'creator_inactive' }
  const wfTenant = workflowTenantId || null
  if (resolved.role === 'superadmin') return { ok: true, email: String(email || '') }
  if (resolved.role === 'tenant_admin' && wfTenant && resolved.tenantId === wfTenant) return { ok: true, email: String(email || '') }
  return { ok: false, reason: 'creator_not_admin' }
}

/** Pure: point the delivery step at the creator's current address / id. */
export function retargetDelivery<T extends { id?: string; type: string; config?: Record<string, unknown> }>(steps: T[], recipient: { userId: string; email: string }): T[] {
  return steps.map((s) => {
    if (s.id !== 'deliver') return s
    if (s.type === 'email.send') return { ...s, config: { ...(s.config || {}), to: recipient.email } }
    if (s.type === 'notify.in_app') return { ...s, config: { ...(s.config || {}), user_id: recipient.userId } }
    return s
  })
}
