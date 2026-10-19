/**
 * Platform event catalog (client-safe, no I/O).
 *
 * Every business event the automation bus understands, with the payload
 * fields a workflow can use as {{trigger.<field>}} and a sample payload for
 * test runs. Other features emit through lib/automation/events.ts:
 *
 *   import { emit } from '@/lib/automation/events'
 *   void emit('marketplace.order.paid', { order_id, buyer_id, total_minor, currency }, { tenantId })
 *
 * Adding an event: add it here (type, label, fields, sample) — the builder's
 * trigger picker and variable picker read this list.
 */

export interface EventField {
  key: string
  label: string
  type: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object'
}

export interface EventTypeDef {
  type: string
  label: string
  group: 'Accounts' | 'Assessments' | 'Billing' | 'Hiring' | 'Events' | 'Marketplace' | 'Content'
  description: string
  fields: EventField[]
  sample: Record<string, unknown>
}

const f = (key: string, label: string, type: EventField['type'] = 'string'): EventField => ({ key, label, type })

export const EVENT_TYPES: readonly EventTypeDef[] = [
  {
    type: 'user.created', label: 'User signed up', group: 'Accounts',
    description: 'A new account was created (email or Google/GitHub sign-up).',
    fields: [f('user_id', 'User id'), f('email', 'Email'), f('name', 'Name'), f('method', 'Sign-up method'), f('email_verified', 'Email verified', 'boolean'), f('created_at', 'Created at', 'date')],
    sample: { user_id: 'u_sample', email: 'asha@example.com', name: 'Asha Rao', method: 'email', email_verified: false, created_at: '2026-01-05T09:00:00.000Z' },
  },
  {
    type: 'user.inactive', label: 'User inactive', group: 'Accounts',
    description: 'A user has not signed in for 7, 14 or 30 days.',
    fields: [f('user_id', 'User id'), f('email', 'Email'), f('name', 'Name'), f('days', 'Days inactive', 'number'), f('last_login_at', 'Last sign-in', 'date')],
    sample: { user_id: 'u_sample', email: 'asha@example.com', name: 'Asha Rao', days: 14, last_login_at: '2025-12-20T09:00:00.000Z' },
  },
  {
    type: 'exam.submitted', label: 'Test submitted', group: 'Assessments',
    description: 'A candidate submitted a test (or it was finalised after the time ran out).',
    fields: [f('submission_id', 'Submission id'), f('exam_id', 'Test id'), f('exam_title', 'Test title'), f('user_id', 'Candidate user id'), f('email', 'Candidate email'), f('score', 'Score', 'number'), f('max_score', 'Max score', 'number'), f('has_pending_review', 'Needs grading', 'boolean'), f('auto_submitted', 'Auto-submitted', 'boolean'), f('late_submit', 'Late', 'boolean')],
    sample: { submission_id: 's_sample', exam_id: 'e_sample', exam_title: 'Backend engineer screen', user_id: 'u_sample', email: 'asha@example.com', score: 30, max_score: 50, has_pending_review: true, auto_submitted: false, late_submit: false },
  },
  {
    type: 'exam.graded', label: 'Test graded', group: 'Assessments',
    description: 'Every answer in a submission has a grade (objective, coding tests or AI).',
    fields: [f('submission_id', 'Submission id'), f('exam_id', 'Test id'), f('exam_title', 'Test title'), f('user_id', 'Candidate user id'), f('email', 'Candidate email'), f('score', 'Score', 'number'), f('max_score', 'Max score', 'number'), f('percent', 'Percent', 'number'), f('graded_by', 'Graded by')],
    sample: { submission_id: 's_sample', exam_id: 'e_sample', exam_title: 'Backend engineer screen', user_id: 'u_sample', email: 'asha@example.com', score: 42, max_score: 50, percent: 84, graded_by: 'auto' },
  },
  {
    type: 'score.released', label: 'Results released', group: 'Assessments',
    description: 'An organiser released a candidate’s score.',
    fields: [f('submission_id', 'Submission id'), f('exam_id', 'Test id'), f('exam_title', 'Test title'), f('user_id', 'Candidate user id'), f('email', 'Candidate email'), f('score', 'Score', 'number'), f('max_score', 'Max score', 'number'), f('percent', 'Percent', 'number'), f('results_url', 'Results link')],
    sample: { submission_id: 's_sample', exam_id: 'e_sample', exam_title: 'Backend engineer screen', user_id: 'u_sample', email: 'asha@example.com', score: 42, max_score: 50, percent: 84, results_url: 'https://codespectra.ai/dashboard/assessments/e_sample' },
  },
  {
    type: 'attempt.abandoned', label: 'Attempt finalised after time ran out', group: 'Assessments',
    description: 'A candidate left a test; the saved answers were submitted for them.',
    fields: [f('submission_id', 'Submission id'), f('exam_id', 'Test id'), f('exam_title', 'Test title'), f('user_id', 'Candidate user id'), f('email', 'Candidate email'), f('answered', 'Questions answered', 'number')],
    sample: { submission_id: 's_sample', exam_id: 'e_sample', exam_title: 'Backend engineer screen', user_id: 'u_sample', email: 'asha@example.com', answered: 7 },
  },
  {
    type: 'payment.succeeded', label: 'Payment succeeded', group: 'Billing',
    description: 'A plan or pack payment went through (any gateway).',
    fields: [f('order_id', 'Order id'), f('user_id', 'User id'), f('plan_id', 'Plan id'), f('plan_name', 'Plan name'), f('amount_minor', 'Amount (minor units)', 'number'), f('currency', 'Currency'), f('provider', 'Gateway')],
    sample: { order_id: 'o_sample', user_id: 'u_sample', plan_id: 'pro', plan_name: 'Pro', amount_minor: 49900, currency: 'INR', provider: 'phonepe' },
  },
  {
    type: 'payment.failed', label: 'Payment failed', group: 'Billing',
    description: 'A checkout or renewal payment failed.',
    fields: [f('order_id', 'Order id'), f('user_id', 'User id'), f('subscription_id', 'Subscription id'), f('plan_id', 'Plan id'), f('amount_minor', 'Amount (minor units)', 'number'), f('currency', 'Currency'), f('provider', 'Gateway'), f('kind', 'checkout or renewal'), f('grace_ends_at', 'Access ends', 'date')],
    sample: { order_id: 'o_sample', user_id: 'u_sample', subscription_id: 'sub_sample', plan_id: 'pro', amount_minor: 49900, currency: 'INR', provider: 'stripe', kind: 'renewal', grace_ends_at: '2026-01-12T09:00:00.000Z' },
  },
  {
    type: 'subscription.expiring', label: 'Plan ending soon', group: 'Billing',
    description: 'A prepaid plan (or one with auto-renew off) ends in 7, 3 or 1 days.',
    fields: [f('subscription_id', 'Subscription id'), f('user_id', 'User id'), f('email', 'Email'), f('plan_id', 'Plan id'), f('ends_at', 'Ends at', 'date'), f('days_left', 'Days left', 'number'), f('renew_url', 'Renew link')],
    sample: { subscription_id: 'sub_sample', user_id: 'u_sample', email: 'asha@example.com', plan_id: 'pro', ends_at: '2026-01-12T09:00:00.000Z', days_left: 3, renew_url: 'https://codespectra.ai/dashboard/billing' },
  },
  {
    type: 'subscription.expired', label: 'Plan ended', group: 'Billing',
    description: 'A plan’s paid period ended.',
    fields: [f('subscription_id', 'Subscription id'), f('user_id', 'User id'), f('email', 'Email'), f('plan_id', 'Plan id'), f('ended_at', 'Ended at', 'date')],
    sample: { subscription_id: 'sub_sample', user_id: 'u_sample', email: 'asha@example.com', plan_id: 'pro', ended_at: '2026-01-12T09:00:00.000Z' },
  },
  {
    type: 'candidate.applied', label: 'Candidate applied', group: 'Hiring',
    description: 'A new application was created for a job (apply page, import, referral…).',
    fields: [f('application_id', 'Application id'), f('job_id', 'Job id'), f('job_title', 'Job title'), f('candidate_id', 'Candidate id'), f('candidate_name', 'Candidate name'), f('candidate_email', 'Candidate email'), f('source', 'Source'), f('stage_id', 'Stage id'), f('match_score', 'Match score', 'number')],
    sample: { application_id: 'a_sample', job_id: 'j_sample', job_title: 'Backend engineer', candidate_id: 'c_sample', candidate_name: 'Asha Rao', candidate_email: 'asha@example.com', source: 'apply_page', stage_id: 's_screening', match_score: 78 },
  },
  {
    type: 'candidate.stage_changed', label: 'Candidate moved stage', group: 'Hiring',
    description: 'An application moved to another pipeline stage.',
    fields: [f('application_id', 'Application id'), f('job_id', 'Job id'), f('job_title', 'Job title'), f('candidate_id', 'Candidate id'), f('from_stage', 'From stage id'), f('to_stage', 'To stage id'), f('to_stage_name', 'To stage name'), f('to_stage_type', 'To stage type'), f('status', 'Status'), f('by', 'Moved by'), f('reason', 'Reason')],
    sample: { application_id: 'a_sample', job_id: 'j_sample', job_title: 'Backend engineer', candidate_id: 'c_sample', from_stage: 's_screening', to_stage: 's_interview', to_stage_name: 'Technical interview', to_stage_type: 'virtual_interview', status: 'active', by: 'system', reason: '' },
  },
  {
    type: 'interview.scheduled', label: 'Interview scheduled', group: 'Hiring',
    description: 'A hiring or standalone interview was booked or rescheduled.',
    fields: [f('interview_id', 'Interview id'), f('kind', 'hiring or standalone'), f('title', 'Title'), f('candidate_name', 'Candidate name'), f('candidate_email', 'Candidate email'), f('scheduled_at', 'Starts at', 'date'), f('duration_min', 'Duration (minutes)', 'number'), f('join_url', 'Join link')],
    sample: { interview_id: 'i_sample', kind: 'hiring', title: 'Technical interview', candidate_name: 'Asha Rao', candidate_email: 'asha@example.com', scheduled_at: '2026-01-10T10:00:00.000Z', duration_min: 45, join_url: 'https://codespectra.ai/interview/join' },
  },
  {
    type: 'interview.completed', label: 'Interview completed', group: 'Hiring',
    description: 'An interview finished and its result was recorded.',
    fields: [f('interview_id', 'Interview id'), f('kind', 'hiring or standalone'), f('application_id', 'Application id'), f('outcome', 'Outcome'), f('summary', 'Summary')],
    sample: { interview_id: 'i_sample', kind: 'hiring', application_id: 'a_sample', outcome: 'pass', summary: 'Strong on systems design.' },
  },
  {
    type: 'bgv.completed', label: 'Background check finished', group: 'Hiring',
    description: 'A background verification closed as clear or failed.',
    fields: [f('case_id', 'Case id'), f('application_id', 'Application id'), f('candidate_name', 'Candidate name'), f('job_title', 'Job title'), f('status', 'Result')],
    sample: { case_id: 'b_sample', application_id: 'a_sample', candidate_name: 'Asha Rao', job_title: 'Backend engineer', status: 'clear' },
  },
  {
    type: 'hackathon.registered', label: 'Registered for a hackathon or codeathon', group: 'Events',
    description: 'Someone created or joined a team, or registered for a codeathon.',
    fields: [f('event_id', 'Event id'), f('event_kind', 'hackathon or codeathon'), f('event_name', 'Event name'), f('user_id', 'User id'), f('team_name', 'Team'), f('starts_at', 'Starts at', 'date')],
    sample: { event_id: 'h_sample', event_kind: 'hackathon', event_name: 'Frostbyte 2026', user_id: 'u_sample', team_name: 'Null pointers', starts_at: '2026-01-15T04:30:00.000Z' },
  },
  {
    type: 'hackathon.starting', label: 'Hackathon starting or closing soon', group: 'Events',
    description: 'An event starts in 24h / 1h, or submissions close in 24h / 1h.',
    fields: [f('event_id', 'Event id'), f('event_kind', 'hackathon or codeathon'), f('event_name', 'Event name'), f('phase', 'start or submission_close'), f('hours_left', 'Hours left', 'number'), f('at', 'When', 'date'), f('url', 'Event link'), f('participants', 'Participants', 'number')],
    sample: { event_id: 'h_sample', event_kind: 'hackathon', event_name: 'Frostbyte 2026', phase: 'start', hours_left: 24, at: '2026-01-15T04:30:00.000Z', url: 'https://codespectra.ai/hackathons/frostbyte', participants: 120 },
  },
  {
    type: 'certificate.issued', label: 'Certificate issued', group: 'Assessments',
    description: 'A verifiable certificate was issued to a user.',
    fields: [f('user_id', 'User id'), f('title', 'Certificate title'), f('verify_url', 'Verify link'), f('linkedin_url', 'Add to LinkedIn link'), f('issued_at', 'Issued at', 'date')],
    sample: { user_id: 'u_sample', title: 'Backend engineer screen', verify_url: 'https://codespectra.ai/cert/verify/abc', linkedin_url: 'https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME', issued_at: '2026-01-05T09:00:00.000Z' },
  },
  {
    type: 'marketplace.checkout.created', label: 'Marketplace checkout started', group: 'Marketplace',
    description: 'A buyer started checkout (used to follow up on abandoned carts).',
    fields: [f('order_id', 'Order id'), f('buyer_id', 'Buyer user id'), f('buyer_email', 'Buyer email'), f('total_minor', 'Total (minor units)', 'number'), f('currency', 'Currency'), f('resume_url', 'Resume checkout link (same site)')],
    sample: { order_id: 'm_sample', buyer_id: 'u_sample', buyer_email: 'asha@example.com', total_minor: 129900, currency: 'INR', resume_url: '/marketplace/checkout/m_sample' },
  },
  {
    type: 'marketplace.order.paid', label: 'Marketplace order paid', group: 'Marketplace',
    description: 'A marketplace order was paid.',
    fields: [f('order_id', 'Order id'), f('buyer_id', 'Buyer user id'), f('buyer_email', 'Buyer email'), f('seller_id', 'Seller id'), f('total_minor', 'Total (minor units)', 'number'), f('currency', 'Currency')],
    sample: { order_id: 'm_sample', buyer_id: 'u_sample', buyer_email: 'asha@example.com', seller_id: 'sel_sample', total_minor: 129900, currency: 'INR' },
  },
  {
    type: 'marketplace.order.shipped', label: 'Marketplace order shipped', group: 'Marketplace',
    description: 'A seller marked an order as shipped or delivered.',
    fields: [f('order_id', 'Order id'), f('buyer_id', 'Buyer user id'), f('buyer_email', 'Buyer email'), f('tracking_url', 'Tracking link'), f('carrier', 'Carrier')],
    sample: { order_id: 'm_sample', buyer_id: 'u_sample', buyer_email: 'asha@example.com', tracking_url: 'https://track.example.com/123', carrier: 'Delhivery' },
  },
  {
    type: 'learn.post.published', label: 'Knowledge post published', group: 'Content',
    description: 'A new post went live on the learn blog.',
    fields: [f('post_id', 'Post id'), f('title', 'Title'), f('url', 'Link'), f('summary', 'Summary'), f('tags', 'Tags', 'array')],
    sample: { post_id: 'p_sample', title: 'How hash maps really work', url: 'https://codespectra.ai/learn/hash-maps', summary: 'Buckets, probing and load factors in plain words.', tags: ['dsa'] },
  },
  {
    type: 'events_feed.new_event', label: 'New event in the events feed', group: 'Content',
    description: 'A new hackathon or coding event was added to the public events feed.',
    fields: [f('event_id', 'Event id'), f('title', 'Title'), f('url', 'Link'), f('starts_at', 'Starts at', 'date'), f('mode', 'Online or offline'), f('city', 'City'), f('source', 'Source')],
    sample: { event_id: 'ev_sample', title: 'Hyderabad AI hack night', url: 'https://codespectra.ai/events/ev_sample', starts_at: '2026-02-01T12:30:00.000Z', mode: 'offline', city: 'Hyderabad', source: 'partner' },
  },
] as const

export type AutomationEventType = (typeof EVENT_TYPES)[number]['type']

const BY_TYPE = new Map(EVENT_TYPES.map((e) => [e.type, e]))

export function eventTypeDef(type: string): EventTypeDef | undefined {
  return BY_TYPE.get(type)
}

export function isKnownEventType(type: unknown): type is string {
  return typeof type === 'string' && BY_TYPE.has(type)
}
