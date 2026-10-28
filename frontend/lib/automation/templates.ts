/**
 * Workflow templates gallery (pure, client-safe). Installing a template
 * copies it into an inactive workflow the admin can edit and switch on.
 * Every template passes validateDefinition and runs end-to-end as a test
 * run against its sample payload (tests/automation-templates.test.ts).
 *
 * Templates vs built-in automations (AUTO-020): a template that sends the
 * same message as a built-in says so (`replaces`). Their emails share a
 * de-duplication key (`dedupe_kind` / `dedupe_ref` on the email step, the
 * same kind + ref the built-in uses), so a customer never gets both, and
 * switching a platform copy on switches the built-in off.
 */
import { eventTypeDef, isPlatformOnlyEvent } from './event-types'
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
  /** Built-in automation (lib/automation/system) that sends the same messages. */
  replaces?: string
}

/** Organisation admins can't use templates on platform-only data or platform-wide events (AUTO-001). */
export function templateAvailableTo(t: Pick<WorkflowTemplate, 'platformOnly' | 'trigger' | 'event_type'>, platform: boolean): boolean {
  if (platform) return true
  if (t.platformOnly) return false
  return !(t.trigger === 'event' && isPlatformOnlyEvent(t.event_type))
}

const SLACK_PLACEHOLDER = 'https://hooks.slack.com/services/REPLACE/WITH/YOURS'

const sample = (type: string, extra: Record<string, unknown> = {}) => ({ ...(eventTypeDef(type)?.sample || {}), ...extra })

export const WORKFLOW_TEMPLATES: readonly WorkflowTemplate[] = [
  {
    id: 'payment-dunning',
    name: 'Payment dunning',
    category: 'Billing',
    platformOnly: true,
    replaces: 'dunning',
    description: 'When a renewal fails: email right away, again after 3 days and a last notice after 7 days (with WhatsApp, if they agreed) — stopping as soon as they pay.',
    trigger: 'event',
    event_type: 'payment.failed',
    event_filter: { all: [{ field: 'trigger.kind', op: 'eq', value: 'renewal' }] },
    steps: [
      { id: 'user', type: 'mongo.find', label: 'Find the account', config: { collection: 'user', filter: { id: '{{trigger.user_id}}' }, mode: 'first' } },
      { id: 'email_day0', type: 'email.send', label: 'Payment failed email', config: { to: '{{steps.user.email}}', subject: 'Your CodeSpectra payment didn’t go through', body: 'We couldn’t renew your plan. Update your card by {{trigger.grace_ends_at | date}} to keep access.', cta_label: 'Update payment method', cta_url: '/dashboard/billing', category: 'transactional', dedupe_kind: 'dunning', dedupe_ref: '{{trigger.subscription_id}}:{{trigger.grace_ends_at}}:day0' } },
      { id: 'wait_3d', type: 'delay', label: 'Wait 3 days', config: { amount: 3, unit: 'days' } },
      { id: 'sub_3d', type: 'mongo.find', label: 'Still unpaid?', config: { collection: 'billing_subscriptions', filter: { id: '{{trigger.subscription_id}}' }, mode: 'first' } },
      {
        id: 'still_due_3d', type: 'condition', label: 'Still past due', config: { if: { all: [{ field: 'steps.sub_3d.past_due', op: 'is_true' }] } },
        then: [
          { id: 'email_day3', type: 'email.send', label: 'Reminder email', config: { to: '{{steps.user.email}}', subject: 'Reminder: update your payment method', body: 'Your plan is still waiting for payment. Access ends on {{trigger.grace_ends_at | date}}.', cta_label: 'Update payment method', cta_url: '/dashboard/billing', category: 'transactional', dedupe_kind: 'dunning', dedupe_ref: '{{trigger.subscription_id}}:{{trigger.grace_ends_at}}:day3' } },
          { id: 'wait_4d', type: 'delay', label: 'Wait 4 more days', config: { amount: 4, unit: 'days' } },
          { id: 'sub_7d', type: 'mongo.find', label: 'Still unpaid?', config: { collection: 'billing_subscriptions', filter: { id: '{{trigger.subscription_id}}' }, mode: 'first' } },
          {
            id: 'still_due_7d', type: 'condition', label: 'Still past due', config: { if: { all: [{ field: 'steps.sub_7d.past_due', op: 'is_true' }] } },
            then: [
              { id: 'email_day7', type: 'email.send', label: 'Last notice', config: { to: '{{steps.user.email}}', subject: 'Last notice: your plan ends soon', body: 'This is the last reminder — update your card today to keep your plan.', cta_label: 'Update payment method', cta_url: '/dashboard/billing', category: 'transactional', dedupe_kind: 'dunning', dedupe_ref: '{{trigger.subscription_id}}:{{trigger.grace_ends_at}}:day7' } },
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
    replaces: 'plan-expiry',
    description: 'Email 7, 3 and 1 day before a prepaid plan ends, with a renew link; WhatsApp on the last day.',
    trigger: 'event',
    event_type: 'subscription.expiring',
    steps: [
      { id: 'email', type: 'email.send', label: 'Renewal reminder', config: { to: '{{trigger.email}}', subject: 'Your plan ends in {{trigger.days_left}} day(s)', body: 'Your CodeSpectra plan ends on {{trigger.ends_at | date}}. Renew now so nothing stops.', cta_label: 'Renew plan', cta_url: '{{trigger.renew_url}}', category: 'transactional', dedupe_kind: 'plan-expiry', dedupe_ref: '{{trigger.subscription_id}}:{{trigger.ends_at}}:{{trigger.days_left}}' } },
      { id: 'last_day', type: 'condition', label: 'Last day?', config: { if: { all: [{ field: 'trigger.days_left', op: 'lte', value: 1 }] } }, then: [{ id: 'wa', type: 'whatsapp.send', label: 'WhatsApp reminder', config: { user_id: '{{trigger.user_id}}', template: 'plan_expiring', params: '{{trigger.days_left}}' } }], else: [] },
    ],
    setup: 'Approve a WhatsApp template called plan_expiring, or delete the WhatsApp step.',
    sample_payload: sample('subscription.expiring', { days_left: 1 }),
  },
  {
    id: 'abandoned-signup',
    name: 'Abandoned sign-up',
    category: 'Growth',
    replaces: 'onboarding',
    description: 'A day after sign-up, remind people who haven’t verified their email yet.',
    trigger: 'event',
    event_type: 'user.created',
    event_filter: { all: [{ field: 'trigger.email_verified', op: 'is_false' }] },
    steps: [
      { id: 'wait', type: 'delay', label: 'Wait 24 hours', config: { amount: 24, unit: 'hours' } },
      { id: 'user', type: 'mongo.find', label: 'Check the account', config: { collection: 'user', filter: { id: '{{trigger.user_id}}' }, mode: 'first' } },
      { id: 'unverified', type: 'filter', label: 'Still unverified', config: { if: { all: [{ field: 'steps.user.emailVerified', op: 'is_false' }] } } },
      { id: 'email', type: 'email.send', label: 'Verify reminder', config: { to: '{{trigger.email}}', subject: 'One step left: verify your email', body: 'Hi {{trigger.name | default: \'there\'}},\n\nConfirm your email to unlock tests, events and your certificates.', cta_label: 'Sign in to verify', cta_url: '/login', category: 'engagement', dedupe_kind: 'onboard-verify', dedupe_ref: '{{trigger.user_id}}' } },
    ],
    sample_payload: sample('user.created'),
  },
  {
    id: 're-engagement',
    name: 'Re-engagement and streak saver',
    category: 'Growth',
    replaces: 're-engagement',
    description: 'Invite inactive users back with today’s challenge; after 30 days also leave an in-app note.',
    trigger: 'event',
    event_type: 'user.inactive',
    steps: [
      { id: 'email', type: 'email.send', label: 'Come back email', config: { to: '{{trigger.email}}', subject: 'Today’s coding challenge is waiting', body: 'Hi {{trigger.name | default: \'there\'}}, it’s been {{trigger.days}} days. A 10-minute problem keeps your skills sharp.', cta_label: 'Solve today’s challenge', cta_url: '/dashboard/arena', category: 'engagement', dedupe_kind: 're-engagement', dedupe_ref: '{{trigger.user_id}}:{{trigger.days}}:{{trigger.last_login_at}}' } },
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
    replaces: 'interview-reminders',
    description: 'Remind the candidate 24 hours and 1 hour before a standalone interview. Moved or cancelled interviews stop their reminders (hiring-pipeline interviews already get reminders from the hiring module).',
    trigger: 'event',
    event_type: 'interview.scheduled',
    // AUTO-021: hiring-pipeline interviews have their own 24 h / 1 h reminders.
    event_filter: { all: [{ field: 'trigger.kind', op: 'eq', value: 'standalone' }, { field: 'trigger.candidate_email', op: 'not_empty' }] },
    steps: [
      {
        id: 'far_enough', type: 'condition', label: 'More than 24 h away?', config: { if: { all: [{ field: 'trigger.scheduled_at', op: 'after', value: '{{vars.inOneDay}}' }] } },
        then: [
          { id: 'wait_24h', type: 'delay', label: 'Until 24 h before', config: { until: '{{trigger.scheduled_at}}', offset_minutes: -1440 } },
          { id: 'check_24h', type: 'mongo.find', label: 'Still on at that time?', config: { collection: 'interviews', filter: { id: '{{trigger.interview_id}}' }, mode: 'first' } },
          { id: 'on_24h', type: 'condition', label: 'Not moved or cancelled', config: { if: { all: [{ field: 'steps.check_24h.status', op: 'eq', value: 'scheduled' }, { field: 'steps.check_24h.scheduled_at', op: 'eq', value: '{{trigger.scheduled_at}}' }] } },
            then: [{ id: 'email_24h', type: 'email.send', label: '24 h reminder', config: { to: '{{trigger.candidate_email}}', subject: 'Tomorrow: {{trigger.title}}', body: 'Your interview starts on {{trigger.scheduled_at | date}} ({{trigger.duration_min}} minutes).', cta_label: 'Join details', cta_url: '{{trigger.join_url}}', category: 'transactional', dedupe_kind: 'interview-reminder', dedupe_ref: '{{trigger.interview_id}}:{{trigger.scheduled_at}}:24h' } }],
            else: [],
          },
        ],
        else: [],
      },
      { id: 'wait_1h', type: 'delay', label: 'Until 1 h before', config: { until: '{{trigger.scheduled_at}}', offset_minutes: -60 } },
      { id: 'check_1h', type: 'mongo.find', label: 'Still on?', config: { collection: 'interviews', filter: { id: '{{trigger.interview_id}}' }, mode: 'first' } },
      { id: 'on_1h', type: 'filter', label: 'Not moved or cancelled', config: { if: { all: [{ field: 'steps.check_1h.status', op: 'eq', value: 'scheduled' }, { field: 'steps.check_1h.scheduled_at', op: 'eq', value: '{{trigger.scheduled_at}}' }] } } },
      { id: 'email_1h', type: 'email.send', label: '1 h reminder', config: { to: '{{trigger.candidate_email}}', subject: 'Starting in 1 hour: {{trigger.title}}', body: 'Check your camera and microphone, and join a few minutes early.', cta_label: 'Join', cta_url: '{{trigger.join_url}}', category: 'transactional', dedupe_kind: 'interview-reminder', dedupe_ref: '{{trigger.interview_id}}:{{trigger.scheduled_at}}:1h' } },
    ],
    sample_payload: sample('interview.scheduled', { kind: 'standalone', scheduled_at: new Date(Date.UTC(2030, 0, 10, 10)).toISOString() }),
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
    replaces: 'abandoned-checkout',
    description: 'An hour after a marketplace checkout starts, email a resume link if the order still isn’t paid.',
    trigger: 'event',
    event_type: 'marketplace.checkout.created',
    steps: [
      { id: 'wait', type: 'delay', label: 'Wait 1 hour', config: { amount: 1, unit: 'hours' } },
      // AUTO-033: only while the order is still unpaid (not cancelled, replaced by a new checkout or paid).
      { id: 'order', type: 'mongo.find', label: 'Is the order still open?', config: { collection: 'mkt_orders', filter: { id: '{{trigger.order_id}}' }, mode: 'first' } },
      { id: 'unpaid', type: 'filter', label: 'Still waiting for payment', config: { if: { all: [{ field: 'steps.order.status', op: 'eq', value: 'pending_payment' }] } } },
      { id: 'email', type: 'email.send', label: 'Resume checkout email', config: { to: '{{trigger.buyer_email}}', subject: 'Your cart is waiting', body: 'You started a checkout but didn’t finish. Items aren’t held for long — pick up where you left off while they’re still available.', cta_label: 'Back to checkout', cta_url: '{{trigger.resume_url}}', category: 'engagement', dedupe_kind: 'checkout', dedupe_ref: '{{trigger.order_id}}' } },
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
    // events_feed.new_event is platform-wide (no organisation), see AUTO-001.
    platformOnly: true,
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
    replaces: 'certificate-follow-up',
    description: 'A day after a certificate is issued, send an “add it to LinkedIn” email and award 25 XP.',
    trigger: 'event',
    event_type: 'certificate.issued',
    steps: [
      { id: 'wait', type: 'delay', label: 'Wait 1 day', config: { amount: 1, unit: 'days' } },
      { id: 'user', type: 'mongo.find', label: 'Find the holder', config: { collection: 'user', filter: { id: '{{trigger.user_id}}' }, mode: 'first' } },
      { id: 'has_email', type: 'filter', label: 'Has an email', config: { if: { all: [{ field: 'steps.user.email', op: 'not_empty' }] } } },
      { id: 'email', type: 'email.send', label: 'Share on LinkedIn', config: { to: '{{steps.user.email}}', subject: 'Show off your “{{trigger.title}}” certificate', body: 'Congratulations again! Add the certificate to your LinkedIn profile so recruiters can verify it in one click.', cta_label: 'Add to LinkedIn', cta_url: '{{trigger.linkedin_url}}', category: 'engagement', dedupe_kind: 'cert-follow', dedupe_ref: '{{trigger.verify_url}}' } },
      { id: 'xp', type: 'xp.award', label: 'Award 25 XP', config: { user_id: '{{trigger.user_id}}', amount: 25, note: 'Certificate follow-up' } },
    ],
    sample_payload: sample('certificate.issued'),
  },
  // ─── Wave 15 nudges (organisation-safe; the events come from "Nudge signals") ───
  {
    id: 'invite-ladder',
    name: 'Test-invite reminder ladder',
    category: 'Assessments',
    replaces: 'invite-ladder',
    description: 'Remind candidates 3 days and 2 hours before a test invite closes (only while they haven’t submitted). The 24-hour reminder is built in.',
    trigger: 'event',
    event_type: 'assessment.invite.expiring',
    steps: [
      {
        id: 'last_chance', type: 'condition', label: 'Last 2 hours?', config: { if: { all: [{ field: 'trigger.hours_left', op: 'lte', value: 2 }] } },
        then: [{ id: 'email_last', type: 'email.send', label: 'Last-chance email', config: { to: '{{trigger.email}}', subject: 'Last chance: {{trigger.exam_title}} closes soon', body: 'Hi {{trigger.name | default: \'there\'}},\n\nYour invitation to {{trigger.exam_title}} closes at {{trigger.expires_at | date}}. Use the link in your invitation email to take it now.', category: 'transactional', dedupe_kind: 'invite-ladder', dedupe_ref: '{{trigger.invite_id}}:{{trigger.hours_left}}h' } }],
        else: [{ id: 'email_soon', type: 'email.send', label: '3-day reminder', config: { to: '{{trigger.email}}', subject: 'Your {{trigger.exam_title}} invitation closes in 3 days', body: 'Hi {{trigger.name | default: \'there\'}},\n\nYour invitation to {{trigger.exam_title}} closes on {{trigger.expires_at | date}}. Set aside some quiet time and finish it before then.', category: 'transactional', dedupe_kind: 'invite-ladder', dedupe_ref: '{{trigger.invite_id}}:{{trigger.hours_left}}h' } }],
      },
    ],
    sample_payload: sample('assessment.invite.expiring'),
  },
  {
    id: 'offer-follow-ups',
    name: 'Offer follow-ups',
    category: 'Hiring',
    replaces: 'offer-follow-ups',
    description: 'Two days into an offer stage, remind the candidate; at five days, post a nudge to your hiring channel.',
    trigger: 'event',
    event_type: 'offer.pending',
    steps: [
      {
        id: 'escalate', type: 'condition', label: 'Five days waiting?', config: { if: { all: [{ field: 'trigger.step', op: 'eq', value: 'recruiter_5d' }] } },
        then: [{ id: 'slack', type: 'slack.post', label: 'Nudge the team', config: { webhook_url: SLACK_PLACEHOLDER, text: '{{trigger.job_title}}: an offer has been waiting {{trigger.days_waiting}} days for an answer. Please follow up.' } }],
        else: [
          { id: 'cand', type: 'mongo.find', label: 'Find the candidate', config: { collection: 'ats_candidates', filter: { id: '{{trigger.candidate_id}}' }, mode: 'first' } },
          { id: 'has_email', type: 'filter', label: 'Has an email', config: { if: { all: [{ field: 'steps.cand.email', op: 'not_empty' }] } } },
          { id: 'email', type: 'email.send', label: 'Candidate reminder', config: { to: '{{steps.cand.email}}', subject: 'Your offer for {{trigger.job_title}} is waiting', body: 'Hi {{steps.cand.name | default: \'there\'}},\n\nYou have an offer for {{trigger.job_title}}. Please reply to the hiring team — they are waiting to hear from you.', category: 'transactional', dedupe_kind: 'offer-followup', dedupe_ref: '{{trigger.application_id}}:{{trigger.stage_entered_at}}:candidate' } },
        ],
      },
    ],
    setup: 'Paste your Slack incoming-webhook URL into the Slack step.',
    sample_payload: sample('offer.pending'),
  },
  {
    id: 'offer-expired-alert',
    name: 'Offer expired alert',
    category: 'Hiring',
    description: 'Post to your hiring channel when an offer passes its deadline without an answer.',
    trigger: 'event',
    event_type: 'offer.expired',
    steps: [
      { id: 'slack', type: 'slack.post', label: 'Post to the team', config: { webhook_url: SLACK_PLACEHOLDER, text: 'Offer expired: {{trigger.job_title}} — no answer by {{trigger.expires_at | date}}.' } },
    ],
    setup: 'Paste your Slack incoming-webhook URL.',
    sample_payload: sample('offer.expired'),
  },
  {
    id: 'drive-no-show-follow-up',
    name: 'Drive no-show follow-up',
    category: 'Hiring',
    description: 'After a live drive, post how many candidates didn’t join so someone offers them another slot.',
    trigger: 'event',
    event_type: 'drive.no_show',
    steps: [
      { id: 'slack', type: 'slack.post', label: 'Post the no-shows', config: { webhook_url: SLACK_PLACEHOLDER, text: '{{trigger.title}}: {{trigger.no_shows}} candidate(s) didn’t join. Add them to another drive from the drive page.' } },
    ],
    setup: 'Paste your Slack incoming-webhook URL.',
    sample_payload: sample('drive.no_show'),
  },
  {
    id: 'bgv-overdue-alert',
    name: 'Background check overdue',
    category: 'Hiring',
    description: 'Tell your hiring channel when a vendor check runs past its expected time.',
    trigger: 'event',
    event_type: 'bgv.overdue',
    steps: [
      { id: 'slack', type: 'slack.post', label: 'Post the delay', config: { webhook_url: SLACK_PLACEHOLDER, text: '{{trigger.candidate_name}} ({{trigger.job_title}}): the {{trigger.check}} check at {{trigger.vendor}} is {{trigger.days_overdue}} day(s) late.' } },
    ],
    setup: 'Paste your Slack incoming-webhook URL.',
    sample_payload: sample('bgv.overdue'),
  },
  {
    id: 'cohort-at-risk',
    name: 'Cohort at-risk nudge',
    category: 'Growth',
    replaces: 'cohort-at-risk',
    description: 'Email a cohort learner who missed two assignments or went quiet for a week (at most once a week).',
    trigger: 'event',
    event_type: 'cohort.member_at_risk',
    steps: [
      { id: 'email', type: 'email.send', label: 'Catch-up email', config: { to: '{{trigger.email}}', subject: 'You’re falling behind in {{trigger.cohort_title}}', body: 'Hi {{trigger.name | default: \'there\'}},\n\nCatch up on {{trigger.cohort_title}} this week to stay on course for your certificate. Your mentor can help.', cta_label: 'Open the cohort', cta_url: '/dashboard/cohorts/{{trigger.cohort_id}}', category: 'engagement', dedupe_kind: 'cohort-at-risk', dedupe_ref: '{{trigger.cohort_id}}:{{trigger.user_id}}:{{trigger.week}}' } },
    ],
    sample_payload: sample('cohort.member_at_risk'),
  },
  {
    id: 'talent-invite-follow-up',
    name: 'Talent-invite follow-up',
    category: 'Hiring',
    description: 'Tell your hiring channel when a talent-search invite is unanswered after 3 days or about to expire, so someone follows up. (Learners get their own reminder from the platform.)',
    trigger: 'event',
    event_type: 'talent.invite.pending',
    steps: [
      { id: 'slack', type: 'slack.post', label: 'Post the waiting invite', config: { webhook_url: SLACK_PLACEHOLDER, text: 'Talent-search invite for {{trigger.target_title}} is still unanswered (expires {{trigger.expires_at | date}}).' } },
    ],
    setup: 'Paste your Slack incoming-webhook URL.',
    sample_payload: sample('talent.invite.pending'),
  },
  {
    id: 'licence-renewal-alert',
    name: 'Licence renewal alert',
    category: 'Billing',
    replaces: 'renewal-nudges',
    description: 'Post to your admin channel when the organisation’s seat licence is two weeks from ending, with seat usage.',
    trigger: 'event',
    event_type: 'licence.expiring',
    steps: [
      { id: 'slack', type: 'slack.post', label: 'Post the renewal reminder', config: { webhook_url: SLACK_PLACEHOLDER, text: '{{trigger.org_name}}: the licence ends on {{trigger.ends_at | date}} ({{trigger.seats_used}} of {{trigger.seats}} seats in use). Renew under Admin → Licences.' } },
    ],
    setup: 'Paste your Slack incoming-webhook URL.',
    sample_payload: sample('licence.expiring'),
  },
]

export function templateById(id: string): WorkflowTemplate | undefined {
  return WORKFLOW_TEMPLATES.find((t) => t.id === id)
}
