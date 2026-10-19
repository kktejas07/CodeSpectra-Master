/**
 * Workflow templates gallery (pure, client-safe). Installing a template
 * copies it into an inactive workflow the admin can edit and switch on.
 * Every template passes validateDefinition and runs end-to-end as a test
 * run against its sample payload (tests/automation-templates.test.ts).
 */
import { eventTypeDef } from './event-types'
import type { Condition } from './conditions'
import type { StepDef, TriggerKind } from './steps-catalog'

export interface WorkflowTemplate {
  id: string
  name: string
  description: string
  category: 'Billing' | 'Growth' | 'Assessments' | 'Hiring' | 'Events' | 'Marketplace' | 'Reports'
  /** Uses platform-only data (billing) — superadmins only. */
  platformOnly?: boolean
  trigger: TriggerKind
  cron_expression?: string
  event_type?: string
  event_filter?: Condition | null
  steps: StepDef[]
  /** What the admin must fill in before switching it on. */
  setup?: string
  sample_payload: Record<string, unknown>
}

const SLACK_PLACEHOLDER = 'https://hooks.slack.com/services/REPLACE/WITH/YOURS'

const sample = (type: string, extra: Record<string, unknown> = {}) => ({ ...(eventTypeDef(type)?.sample || {}), ...extra })

export const WORKFLOW_TEMPLATES: readonly WorkflowTemplate[] = [
  {
    id: 'payment-dunning',
    name: 'Payment dunning',
    category: 'Billing',
    platformOnly: true,
    description: 'When a renewal fails: email right away, again after 3 days and a last notice after 7 days (with WhatsApp, if they agreed) — stopping as soon as they pay.',
    trigger: 'event',
    event_type: 'payment.failed',
    event_filter: { all: [{ field: 'trigger.kind', op: 'eq', value: 'renewal' }] },
    steps: [
      { id: 'user', type: 'mongo.find', label: 'Find the account', config: { collection: 'user', filter: { id: '{{trigger.user_id}}' }, mode: 'first' } },
      { id: 'email_day0', type: 'email.send', label: 'Payment failed email', config: { to: '{{steps.user.email}}', subject: 'Your CodeSpectra payment didn’t go through', body: 'We couldn’t renew your plan. Update your card by {{trigger.grace_ends_at | date}} to keep access.', cta_label: 'Update payment method', cta_url: '/dashboard/billing', category: 'transactional' } },
      { id: 'wait_3d', type: 'delay', label: 'Wait 3 days', config: { amount: 3, unit: 'days' } },
      { id: 'sub_3d', type: 'mongo.find', label: 'Still unpaid?', config: { collection: 'billing_subscriptions', filter: { id: '{{trigger.subscription_id}}' }, mode: 'first' } },
      {
        id: 'still_due_3d', type: 'condition', label: 'Still past due', config: { if: { all: [{ field: 'steps.sub_3d.past_due', op: 'is_true' }] } },
        then: [
          { id: 'email_day3', type: 'email.send', label: 'Reminder email', config: { to: '{{steps.user.email}}', subject: 'Reminder: update your payment method', body: 'Your plan is still waiting for payment. Access ends on {{trigger.grace_ends_at | date}}.', cta_label: 'Update payment method', cta_url: '/dashboard/billing', category: 'transactional' } },
          { id: 'wait_4d', type: 'delay', label: 'Wait 4 more days', config: { amount: 4, unit: 'days' } },
          { id: 'sub_7d', type: 'mongo.find', label: 'Still unpaid?', config: { collection: 'billing_subscriptions', filter: { id: '{{trigger.subscription_id}}' }, mode: 'first' } },
          {
            id: 'still_due_7d', type: 'condition', label: 'Still past due', config: { if: { all: [{ field: 'steps.sub_7d.past_due', op: 'is_true' }] } },
            then: [
              { id: 'email_day7', type: 'email.send', label: 'Last notice', config: { to: '{{steps.user.email}}', subject: 'Last notice: your plan ends soon', body: 'This is the last reminder — update your card today to keep your plan.', cta_label: 'Update payment method', cta_url: '/dashboard/billing', category: 'transactional' } },
              { id: 'wa_day7', type: 'whatsapp.send', label: 'WhatsApp (if they agreed)', config: { user_id: '{{trigger.user_id}}', template: 'payment_reminder', params: '{{steps.user.name}}' } },
            ],
            else: [],
          },
        ],
        else: [{ id: 'paid_note', type: 'log', label: 'Paid — stop', config: { message: 'Payment recovered; no more reminders.' } }],
      },
    ],
    setup: 'Create and get approval for a WhatsApp template called payment_reminder (or change the name).',
    sample_payload: sample('payment.failed'),
  },
  {
    id: 'plan-expiry',
    name: 'Plan expiry reminders',
    category: 'Billing',
    description: 'Email 7, 3 and 1 day before a prepaid plan ends, with a renew link; WhatsApp on the last day.',
    trigger: 'event',
    event_type: 'subscription.expiring',
    steps: [
      { id: 'email', type: 'email.send', label: 'Renewal reminder', config: { to: '{{trigger.email}}', subject: 'Your plan ends in {{trigger.days_left}} day(s)', body: 'Your CodeSpectra plan ends on {{trigger.ends_at | date}}. Renew now so nothing stops.', cta_label: 'Renew plan', cta_url: '{{trigger.renew_url}}', category: 'transactional' } },
      { id: 'last_day', type: 'condition', label: 'Last day?', config: { if: { all: [{ field: 'trigger.days_left', op: 'lte', value: 1 }] } }, then: [{ id: 'wa', type: 'whatsapp.send', label: 'WhatsApp reminder', config: { user_id: '{{trigger.user_id}}', template: 'plan_expiring', params: '{{trigger.days_left}}' } }], else: [] },
    ],
    setup: 'Approve a WhatsApp template called plan_expiring, or delete the WhatsApp step.',
    sample_payload: sample('subscription.expiring', { days_left: 1 }),
  },
  {
    id: 'abandoned-signup',
    name: 'Abandoned sign-up',
    category: 'Growth',
    description: 'A day after sign-up, remind people who haven’t verified their email yet.',
    trigger: 'event',
    event_type: 'user.created',
    event_filter: { all: [{ field: 'trigger.email_verified', op: 'is_false' }] },
    steps: [
      { id: 'wait', type: 'delay', label: 'Wait 24 hours', config: { amount: 24, unit: 'hours' } },
      { id: 'user', type: 'mongo.find', label: 'Check the account', config: { collection: 'user', filter: { id: '{{trigger.user_id}}' }, mode: 'first' } },
      { id: 'unverified', type: 'filter', label: 'Still unverified', config: { if: { all: [{ field: 'steps.user.emailVerified', op: 'is_false' }] } } },
      { id: 'email', type: 'email.send', label: 'Verify reminder', config: { to: '{{trigger.email}}', subject: 'One step left: verify your email', body: 'Hi {{trigger.name | default: \'there\'}},\n\nConfirm your email to unlock tests, events and your certificates.', cta_label: 'Sign in to verify', cta_url: '/login', category: 'engagement' } },
    ],
    sample_payload: sample('user.created'),
  },
  {
    id: 're-engagement',
    name: 'Re-engagement and streak saver',
    category: 'Growth',
    description: 'Invite inactive users back with today’s challenge; after 30 days also leave an in-app note.',
    trigger: 'event',
    event_type: 'user.inactive',
    steps: [
      { id: 'email', type: 'email.send', label: 'Come back email', config: { to: '{{trigger.email}}', subject: 'Today’s coding challenge is waiting', body: 'Hi {{trigger.name | default: \'there\'}}, it’s been {{trigger.days}} days. A 10-minute problem keeps your skills sharp.', cta_label: 'Solve today’s challenge', cta_url: '/dashboard/arena', category: 'engagement' } },
      { id: 'long_gone', type: 'condition', label: '30+ days?', config: { if: { all: [{ field: 'trigger.days', op: 'gte', value: 30 }] } }, then: [{ id: 'note', type: 'notify.in_app', label: 'Welcome back note', config: { user_id: '{{trigger.user_id}}', title: 'Welcome back', message: 'Pick up where you left off — new problems and events were added.', link: '/dashboard' } }], else: [] },
    ],
    sample_payload: sample('user.inactive', { days: 30 }),
  },
  {
    id: 'results-ready',
    name: 'Results-ready email',
    category: 'Assessments',
    description: 'Send a personal note with the score when results are released (adds to the built-in notice).',
    trigger: 'event',
    event_type: 'score.released',
    steps: [
      { id: 'email', type: 'email.send', label: 'Results email', config: { to: '{{trigger.email}}', subject: 'Your results for {{trigger.exam_title}}', body: 'You scored {{trigger.percent}}%. Open your results to see the breakdown and next steps.', cta_label: 'View results', cta_url: '{{trigger.results_url}}', category: 'transactional' } },
    ],
    sample_payload: sample('score.released'),
  },
  {
    id: 'hiring-stage-nudge',
    name: 'Hiring stage nudges',
    category: 'Hiring',
    description: 'If a candidate is still in the same stage 3 days later, post a nudge to your hiring channel.',
    trigger: 'event',
    event_type: 'candidate.stage_changed',
    event_filter: { all: [{ field: 'trigger.to_stage_type', op: 'not_in', value: 'hired,rejected' }] },
    steps: [
      { id: 'wait', type: 'delay', label: 'Wait 3 days', config: { amount: 3, unit: 'days' } },
      { id: 'app', type: 'mongo.find', label: 'Where is the candidate now?', config: { collection: 'ats_applications', filter: { id: '{{trigger.application_id}}' }, mode: 'first' } },
      { id: 'stuck', type: 'filter', label: 'Still in that stage', config: { if: { all: [{ field: 'steps.app.stage_id', op: 'eq', value: '{{trigger.to_stage}}' }, { field: 'steps.app.status', op: 'eq', value: 'active' }] } } },
      { id: 'tag', type: 'ats.add_tag', label: 'Tag as waiting', config: { candidate_id: '{{trigger.candidate_id}}', tag: 'needs-follow-up' } },
      { id: 'slack', type: 'slack.post', label: 'Nudge the team', config: { webhook_url: SLACK_PLACEHOLDER, text: '{{trigger.job_title}}: a candidate has been in “{{trigger.to_stage_name}}” for 3 days. Please review.' } },
    ],
    setup: 'Paste your Slack incoming-webhook URL into the last step.',
    sample_payload: sample('candidate.stage_changed'),
  },
  {
    id: 'interview-reminders',
    name: 'Interview reminders',
    category: 'Hiring',
    description: 'Remind the candidate 24 hours and 1 hour before the interview.',
    trigger: 'event',
    event_type: 'interview.scheduled',
    steps: [
      { id: 'wait_24h', type: 'delay', label: 'Until 24 h before', config: { until: '{{trigger.scheduled_at}}', offset_minutes: -1440 } },
      { id: 'email_24h', type: 'email.send', label: '24 h reminder', config: { to: '{{trigger.candidate_email}}', subject: 'Tomorrow: {{trigger.title}}', body: 'Your interview starts on {{trigger.scheduled_at | date}} ({{trigger.duration_min}} minutes).', cta_label: 'Join details', cta_url: '{{trigger.join_url}}', category: 'transactional' } },
      { id: 'wait_1h', type: 'delay', label: 'Until 1 h before', config: { until: '{{trigger.scheduled_at}}', offset_minutes: -60 } },
      { id: 'email_1h', type: 'email.send', label: '1 h reminder', config: { to: '{{trigger.candidate_email}}', subject: 'Starting in 1 hour: {{trigger.title}}', body: 'Check your camera and microphone, and join a few minutes early.', cta_label: 'Join', cta_url: '{{trigger.join_url}}', category: 'transactional' } },
    ],
    sample_payload: sample('interview.scheduled', { scheduled_at: new Date(Date.UTC(2030, 0, 10, 10)).toISOString() }),
  },
  {
    id: 'hackathon-reminders',
    name: 'Hackathon reminders',
    category: 'Events',
    description: 'Announce in your community channel when an event is a day or an hour away, or submissions are closing.',
    trigger: 'event',
    event_type: 'hackathon.starting',
    steps: [
      { id: 'starting', type: 'condition', label: 'Starting or closing?', config: { if: { all: [{ field: 'trigger.phase', op: 'eq', value: 'start' }] } },
        then: [{ id: 'slack_start', type: 'slack.post', label: 'Starting soon', config: { webhook_url: SLACK_PLACEHOLDER, text: '{{trigger.event_name}} starts in {{trigger.hours_left}}h — {{trigger.participants}} registered. {{trigger.url}}' } }],
        else: [{ id: 'slack_close', type: 'slack.post', label: 'Closing soon', config: { webhook_url: SLACK_PLACEHOLDER, text: 'Submissions for {{trigger.event_name}} close in {{trigger.hours_left}}h. {{trigger.url}}' } }],
      },
    ],
    setup: 'Paste your Slack incoming-webhook URL into both Slack steps. Participants already get email reminders from the built-in automation.',
    sample_payload: sample('hackathon.starting'),
  },
  {
    id: 'abandoned-checkout',
    name: 'Abandoned checkout',
    category: 'Marketplace',
    platformOnly: true,
    description: 'An hour after a marketplace checkout starts, email a resume link if the order still isn’t paid.',
    trigger: 'event',
    event_type: 'marketplace.checkout.created',
    steps: [
      { id: 'wait', type: 'delay', label: 'Wait 1 hour', config: { amount: 1, unit: 'hours' } },
      { id: 'paid', type: 'mongo.find', label: 'Was it paid?', config: { collection: 'automation_events', filter: { type: 'marketplace.order.paid', 'payload.order_id': '{{trigger.order_id}}' }, mode: 'count' } },
      { id: 'unpaid', type: 'filter', label: 'Still unpaid', config: { if: { all: [{ field: 'steps.paid.count', op: 'eq', value: 0 }] } } },
      { id: 'email', type: 'email.send', label: 'Resume checkout email', config: { to: '{{trigger.buyer_email}}', subject: 'You left something in your cart', body: 'Your order is saved. Pick up where you left off — it only takes a minute.', cta_label: 'Resume checkout', cta_url: '{{trigger.resume_url}}', category: 'engagement' } },
    ],
    sample_payload: sample('marketplace.checkout.created'),
  },
  {
    id: 'weekly-admin-report',
    name: 'Weekly admin report',
    category: 'Reports',
    description: 'Every Monday 09:00 UTC: count last week’s test submissions and new applications, summarise with AI and email it.',
    trigger: 'schedule',
    cron_expression: '0 9 * * 1',
    steps: [
      { id: 'tests', type: 'mongo.find', label: 'Test submissions (7 days)', config: { collection: 'exam_submissions', filter: { created_at: { $gte: '{{vars.sevenDaysAgo}}' } }, mode: 'count' } },
      { id: 'apps', type: 'mongo.find', label: 'New applications (7 days)', config: { collection: 'ats_applications', filter: { created_at: { $gte: '{{vars.sevenDaysAgo}}' } }, mode: 'count' } },
      { id: 'summary', type: 'ai.complete', label: 'Write the summary', config: { system: 'You write short, plain weekly reports for a hiring and assessment team. Three sentences, no hype.', prompt: 'Test submissions this week: {{steps.tests.count}}. New job applications: {{steps.apps.count}}. Write the summary.' } },
      { id: 'email', type: 'email.send', label: 'Email the report', config: { to: 'admin@example.com', subject: 'Weekly report — {{vars.today}}', body: 'Test submissions: {{steps.tests.count}}\nNew applications: {{steps.apps.count}}\n\n{{steps.summary}}', category: 'transactional' } },
    ],
    setup: 'Change the recipient in the last step.',
    sample_payload: {},
  },
  {
    id: 'new-event-alert',
    name: 'New event alert',
    category: 'Events',
    description: 'Post new in-person events from the events feed to your community channel.',
    trigger: 'event',
    event_type: 'events_feed.new_event',
    event_filter: { all: [{ field: 'trigger.mode', op: 'eq', value: 'offline' }] },
    steps: [
      { id: 'slack', type: 'slack.post', label: 'Post the event', config: { webhook_url: SLACK_PLACEHOLDER, text: 'New event: {{trigger.title}} — {{trigger.city}}, {{trigger.starts_at | date}}. {{trigger.url}}' } },
    ],
    setup: 'Paste your Slack incoming-webhook URL; change the filter to your city if you like.',
    sample_payload: sample('events_feed.new_event'),
  },
  {
    id: 'certificate-follow-up',
    name: 'Certificate follow-up',
    category: 'Assessments',
    description: 'A day after a certificate is issued, send an “add it to LinkedIn” email and award 25 XP.',
    trigger: 'event',
    event_type: 'certificate.issued',
    steps: [
      { id: 'wait', type: 'delay', label: 'Wait 1 day', config: { amount: 1, unit: 'days' } },
      { id: 'user', type: 'mongo.find', label: 'Find the holder', config: { collection: 'user', filter: { id: '{{trigger.user_id}}' }, mode: 'first' } },
      { id: 'has_email', type: 'filter', label: 'Has an email', config: { if: { all: [{ field: 'steps.user.email', op: 'not_empty' }] } } },
      { id: 'email', type: 'email.send', label: 'Share on LinkedIn', config: { to: '{{steps.user.email}}', subject: 'Show off your “{{trigger.title}}” certificate', body: 'Congratulations again! Add the certificate to your LinkedIn profile so recruiters can verify it in one click.', cta_label: 'Add to LinkedIn', cta_url: '{{trigger.linkedin_url}}', category: 'engagement' } },
      { id: 'xp', type: 'xp.award', label: 'Award 25 XP', config: { user_id: '{{trigger.user_id}}', amount: 25, note: 'Certificate follow-up' } },
    ],
    sample_payload: sample('certificate.issued'),
  },
]

export function templateById(id: string): WorkflowTemplate | undefined {
  return WORKFLOW_TEMPLATES.find((t) => t.id === id)
}
