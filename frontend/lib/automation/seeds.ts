/**
 * Starter platform workflows (A-014). The original five seeds crashed on
 * their first step (unknown trigger nodes, collections outside the
 * allow-list, `{{ yesterday }}` never filled in). These replacements use the
 * v2 steps, run as-is in a test run, and are seeded paused. Existing
 * databases get their untouched copies of the old seeds upgraded in place.
 */
import type { WorkflowDoc } from '@/lib/db/leaderboard'
import type { StepDef } from './steps-catalog'

export interface SeedWorkflow {
  name: string
  description: string
  trigger: WorkflowDoc['trigger']
  cron_expression?: string
  event_type?: string
  event_filter?: WorkflowDoc['event_filter']
  steps: StepDef[]
  sample_payload: Record<string, unknown>
}

export const STARTER_WORKFLOWS: SeedWorkflow[] = [
  {
    name: 'Welcome New User',
    description: 'When someone signs up: an in-app welcome with a link to their first problem.',
    trigger: 'event',
    event_type: 'user.created',
    steps: [
      { id: 'welcome', type: 'notify.in_app', label: 'Welcome note', config: { user_id: '{{trigger.user_id}}', title: 'Welcome to CodeSpectra', message: 'Start with today’s practice problem — it takes ten minutes.', link: '/dashboard/arena' } },
      { id: 'note', type: 'log', label: 'Log', config: { message: 'Welcomed {{trigger.email}}' } },
    ],
    sample_payload: { user_id: 'u_sample', email: 'asha@example.com', name: 'Asha Rao', method: 'email', email_verified: false },
  },
  {
    name: 'Daily Digest',
    description: 'Every morning: counts yesterday’s practice submissions and writes a two-line summary into the run history.',
    trigger: 'schedule',
    cron_expression: '0 9 * * *',
    steps: [
      { id: 'activity', type: 'mongo.find', label: 'Submissions since yesterday', config: { collection: 'submissions', filter: { created_at: { $gte: '{{vars.yesterday}}' } }, mode: 'count' } },
      { id: 'digest', type: 'ai.complete', label: 'Summarise', config: { system: 'You summarise coding-practice activity in two short sentences.', prompt: 'Practice submissions in the last 24 hours: {{steps.activity.count}}.' } },
      { id: 'note', type: 'log', label: 'Save the digest', config: { message: '{{steps.digest}}' } },
    ],
    sample_payload: {},
  },
  {
    name: 'Exam Completion Handler',
    description: 'When a test is graded and the candidate scored 60% or more: award 50 XP and congratulate them.',
    trigger: 'event',
    event_type: 'exam.graded',
    steps: [
      {
        id: 'passed', type: 'condition', label: 'Scored 60%+?', config: { if: { all: [{ field: 'trigger.percent', op: 'gte', value: 60 }] } },
        then: [
          { id: 'xp', type: 'xp.award', label: 'Award 50 XP', config: { user_id: '{{trigger.user_id}}', amount: 50, note: 'Strong test result' } },
          { id: 'congrats', type: 'notify.in_app', label: 'Congratulate', config: { user_id: '{{trigger.user_id}}', title: 'Great result!', message: 'You scored {{trigger.percent}}% on {{trigger.exam_title}}.', link: '/dashboard/assessments' } },
        ],
        else: [],
      },
    ],
    sample_payload: { submission_id: 's_sample', exam_id: 'e_sample', exam_title: 'Backend engineer screen', user_id: 'u_sample', email: 'asha@example.com', score: 42, max_score: 50, percent: 84 },
  },
  {
    name: 'Hackathon Auto-Results',
    description: 'On demand: lists recently closed hackathons and drafts a results announcement for review.',
    trigger: 'manual',
    steps: [
      { id: 'closed', type: 'mongo.find', label: 'Recently closed hackathons', config: { collection: 'hackathons', filter: { status: 'closed', results_released: { $ne: true } }, limit: 10 } },
      { id: 'draft', type: 'ai.complete', label: 'Draft an announcement', config: { system: 'You write short, friendly results announcements for coding hackathons. Never invent winners.', prompt: 'These hackathons closed and still need results released: {{steps.closed | json}}. Draft a short note asking judges to finish scoring.' } },
      { id: 'note', type: 'log', label: 'Save the draft', config: { message: '{{steps.draft}}' } },
    ],
    sample_payload: {},
  },
  {
    name: 'Stale Account Cleanup',
    description: 'Every Sunday: counts accounts with no sign-in for 30 days (re-engagement emails are sent by the built-in automation).',
    trigger: 'schedule',
    cron_expression: '0 0 * * 0',
    steps: [
      { id: 'inactive', type: 'mongo.find', label: 'Inactive accounts', config: { collection: 'user', filter: { lastLoginAt: { $lt: '{{vars.thirtyDaysAgo}}' } }, mode: 'count' } },
      { id: 'note', type: 'log', label: 'Record the count', config: { message: '{{steps.inactive.count}} accounts inactive for 30+ days' } },
    ],
    sample_payload: {},
  },
]

export const OLD_SEED_NAMES = new Set(STARTER_WORKFLOWS.map((s) => s.name))
