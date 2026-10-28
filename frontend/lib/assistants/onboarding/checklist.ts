/**
 * Org onboarding checklist (pure, tested in tests/assistants-onboarding.test.ts).
 * The server counts a few things about the organisation (./service.ts); this
 * turns them into ordered steps with a "done" flag, the next step, a link to
 * the page that does it and a copilot prompt that drafts the step as a
 * proposal. Nothing here writes.
 */

export type OrgKind = 'company' | 'college'

export interface OrgState {
  kind: OrgKind
  created_at: string | null
  /** Members (excluding nobody) + pending invitations. */
  members: number
  pending_invites: number
  tests: number
  published_tests: number
  candidate_invites: number
  jobs: number
  /** College profile: departments and batches set up (campus_colleges). */
  college_profile: boolean
  college_staff: number
  students: number
  drives: number
  integrations: number
  /** Branding: organisation name + slug set (and a careers page for companies). */
  profile_named: boolean
  careers_page: boolean
}

export const STEP_IDS = ['profile', 'team', 'students', 'first_test', 'first_invite', 'first_job', 'first_drive', 'integration'] as const
export type StepId = (typeof STEP_IDS)[number]

export interface ChecklistStep {
  id: StepId
  done: boolean
  href: string
  /** English copilot prompt (the copilot answers in the admin's language). */
  copilot: string | null
}

export interface Checklist {
  kind: OrgKind
  steps: ChecklistStep[]
  done: number
  total: number
  percent: number
  next: StepId | null
  complete: boolean
}

const STEPS: Record<OrgKind, StepId[]> = {
  company: ['profile', 'team', 'first_test', 'first_invite', 'first_job', 'integration'],
  college: ['profile', 'team', 'students', 'first_drive', 'first_test', 'integration'],
}

function stepDone(id: StepId, s: OrgState): boolean {
  switch (id) {
    case 'profile': return s.kind === 'college' ? s.college_profile : s.profile_named && s.careers_page
    case 'team': return s.members > 1 || s.pending_invites > 0 || s.college_staff > 0
    case 'students': return s.students > 0
    case 'first_test': return s.published_tests > 0 || s.tests > 0
    case 'first_invite': return s.candidate_invites > 0
    case 'first_job': return s.jobs > 0
    case 'first_drive': return s.drives > 0
    case 'integration': return s.integrations > 0
  }
}

const HREF: Record<StepId, Record<OrgKind, string>> = {
  profile: { company: '/dashboard/hiring/settings', college: '/dashboard/placement' },
  team: { company: '/dashboard/admin/team', college: '/dashboard/admin/team' },
  students: { company: '/dashboard/placement', college: '/dashboard/placement' },
  first_test: { company: '/dashboard/admin/assessments', college: '/dashboard/admin/assessments' },
  first_invite: { company: '/dashboard/admin/assessments', college: '/dashboard/admin/assessments' },
  first_job: { company: '/dashboard/hiring/jobs', college: '/dashboard/hiring/jobs' },
  first_drive: { company: '/dashboard/placement', college: '/dashboard/placement' },
  integration: { company: '/dashboard/admin/connected-apps', college: '/dashboard/admin/connected-apps' },
}

/** Steps the copilot can draft as a proposal (the rest are done on their page). */
const COPILOT: Partial<Record<StepId, Record<OrgKind, string>>> = {
  first_test: {
    company: 'Draft my first assessment: a 45-minute test for a junior backend developer with a few MCQs and two coding questions. Show me the proposal before saving.',
    college: 'Draft a 60-minute aptitude and coding practice test for our final-year students. Show me the proposal before saving.',
  },
  first_invite: {
    company: 'Help me invite candidates to my latest test. Ask me for the emails, then draft the invite proposal.',
    college: 'Help me invite students to our latest test. Ask me for the emails, then draft the invite proposal.',
  },
  first_job: {
    company: 'Draft my first job opening for a software engineer (2–4 years). Ask me for anything you need, then show me the proposal.',
    college: 'Draft a job opening for our placement cell. Ask me for the details first.',
  },
  first_drive: {
    college: 'Show my placement drives and batch readiness, and tell me what to set up for the first drive.',
    company: 'Show my placement drives.',
  },
}

/** The checklist for an organisation's current state. Pure. */
export function computeChecklist(s: OrgState): Checklist {
  const steps = STEPS[s.kind].map((id): ChecklistStep => ({ id, done: stepDone(id, s), href: HREF[id][s.kind], copilot: COPILOT[id]?.[s.kind] ?? null }))
  const done = steps.filter((x) => x.done).length
  const next = steps.find((x) => !x.done)?.id ?? null
  return { kind: s.kind, steps, done, total: steps.length, percent: Math.round((done / steps.length) * 100), next, complete: next === null }
}

/** Organisations younger than this get the daily check (and nudges when switched on). */
export const ONBOARDING_WINDOW_DAYS = 60

/**
 * Should the loop nudge this org's admin about `next` now? Only inside the
 * onboarding window, when not dismissed and a step is still open. The cooldown
 * per (org, step) is enforced by the caller's idempotency mark. Pure.
 */
export function nudgeDue(c: Pick<Checklist, 'next' | 'complete'>, i: { created_at: string | null; dismissed: boolean; now: Date }): boolean {
  if (c.complete || !c.next || i.dismissed) return false
  const created = i.created_at ? Date.parse(i.created_at) : NaN
  if (!Number.isFinite(created)) return false
  const age = (i.now.getTime() - created) / 86_400_000
  // Give a brand-new org a day before the first nudge.
  return age >= 1 && age <= ONBOARDING_WINDOW_DAYS
}
