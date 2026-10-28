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
 *
 * Tenancy (AUTO-001): emit() attaches the organisation of the user / buyer in
 * the payload when the caller doesn't pass one, so organisation workflows see
 * their members' events. Events with `scope: 'platform'` (the public blog and
 * events feed) belong to no organisation: they are hidden from organisation
 * trigger pickers and organisation workflows can't use them.
 *
 * Product analytics (lib/analytics) can become triggers later through the
 * reserved `analytics.<name>` namespace (see lib/automation/emit.ts).
 */

export interface EventField {
  key: string
  label: string
  type: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object'
}

export interface EventTypeDef {
  type: string
  label: string
  group: 'Accounts' | 'Assessments' | 'Billing' | 'Hiring' | 'Events' | 'Marketplace' | 'Content' | 'Learning'
  description: string
  fields: EventField[]
  sample: Record<string, unknown>
  /** 'platform' = not tied to an organisation (platform workflows only). Default 'tenant'. */
  scope?: 'tenant' | 'platform'
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
    description: 'A hiring or standalone interview was booked or moved to a new time (a move emits it again; waiting runs for the old time are cancelled).',
    fields: [f('interview_id', 'Interview id'), f('kind', 'hiring or standalone'), f('title', 'Title'), f('candidate_name', 'Candidate name'), f('candidate_email', 'Candidate email'), f('scheduled_at', 'Starts at', 'date'), f('duration_min', 'Duration (minutes)', 'number'), f('join_url', 'Join link'), f('rescheduled', 'Moved from another time', 'boolean')],
    sample: { interview_id: 'i_sample', kind: 'hiring', title: 'Technical interview', candidate_name: 'Asha Rao', candidate_email: 'asha@example.com', scheduled_at: '2026-01-10T10:00:00.000Z', duration_min: 45, join_url: 'https://codespectra.ai/interview/join', rescheduled: false },
  },
  {
    type: 'interview.cancelled', label: 'Interview cancelled', group: 'Hiring',
    description: 'A hiring or standalone interview was cancelled (or a standalone one deleted); waiting runs for it are cancelled.',
    fields: [f('interview_id', 'Interview id'), f('kind', 'hiring or standalone'), f('title', 'Title'), f('candidate_name', 'Candidate name'), f('candidate_email', 'Candidate email'), f('scheduled_at', 'Was due at', 'date')],
    sample: { interview_id: 'i_sample', kind: 'standalone', title: 'Technical interview', candidate_name: 'Asha Rao', candidate_email: 'asha@example.com', scheduled_at: '2026-01-10T10:00:00.000Z' },
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
    type: 'learn.post.published', label: 'Knowledge post published', group: 'Content', scope: 'platform',
    description: 'A new post went live on the learn blog.',
    fields: [f('post_id', 'Post id'), f('title', 'Title'), f('url', 'Link'), f('summary', 'Summary'), f('tags', 'Tags', 'array')],
    sample: { post_id: 'p_sample', title: 'How hash maps really work', url: 'https://codespectra.ai/learn/hash-maps', summary: 'Buckets, probing and load factors in plain words.', tags: ['dsa'] },
  },
  {
    type: 'events_feed.new_event', label: 'New event in the events feed', group: 'Content', scope: 'platform',
    description: 'A new hackathon or coding event was added to the public events feed.',
    fields: [f('event_id', 'Event id'), f('title', 'Title'), f('url', 'Link'), f('starts_at', 'Starts at', 'date'), f('mode', 'Online or offline'), f('city', 'City'), f('source', 'Source')],
    sample: { event_id: 'ev_sample', title: 'Hyderabad AI hack night', url: 'https://codespectra.ai/events/ev_sample', starts_at: '2026-02-01T12:30:00.000Z', mode: 'offline', city: 'Hyderabad', source: 'partner' },
  },
  // ── AUTO-088: events from the newer features (emitted with idempotency keys at their write points). ──
  {
    type: 'subscription.started', label: 'Plan started', group: 'Billing',
    description: 'A paid plan started: a new subscription, a switch to another plan or a re-activation (not a same-plan renewal).',
    fields: [f('user_id', 'User id'), f('subscription_id', 'Subscription id'), f('plan_id', 'Plan id'), f('plan_name', 'Plan name'), f('ends_at', 'Paid until', 'date'), f('trial', 'Trial', 'boolean'), f('previous_plan_id', 'Previous plan id')],
    sample: { user_id: 'u_sample', subscription_id: 'sub_sample', plan_id: 'pro', plan_name: 'Pro', ends_at: '2026-02-05T09:00:00.000Z', trial: false, previous_plan_id: null },
  },
  {
    type: 'subscription.cancelled', label: 'Plan cancelled', group: 'Billing',
    description: 'A user cancelled their plan; it stays active until the end of the paid period.',
    fields: [f('user_id', 'User id'), f('subscription_id', 'Subscription id'), f('plan_id', 'Plan id'), f('access_until', 'Access until', 'date'), f('cancelled_at', 'Cancelled at', 'date')],
    sample: { user_id: 'u_sample', subscription_id: 'sub_sample', plan_id: 'pro', access_until: '2026-02-05T09:00:00.000Z', cancelled_at: '2026-01-20T09:00:00.000Z' },
  },
  {
    type: 'referral.rewarded', label: 'Referral reward granted', group: 'Billing',
    description: 'A referrer earned a reward (credit or a free month) for a friend who joined a paid plan.',
    fields: [f('user_id', 'Referrer user id'), f('reward_id', 'Reward id'), f('kind', 'credit or month'), f('amount_minor', 'Credit (minor units)', 'number'), f('currency', 'Currency')],
    sample: { user_id: 'u_sample', reward_id: 'rr_sample', kind: 'credit', amount_minor: 50000, currency: 'INR' },
  },
  {
    type: 'licence.expiring', label: 'Organisation licence ending soon', group: 'Billing',
    description: 'An organisation seat licence ends within 14 days (once per licence and end date).',
    fields: [f('licence_id', 'Licence id'), f('org_id', 'Organisation id'), f('org_name', 'Organisation'), f('org_kind', 'college or company'), f('plan_key', 'Plan'), f('seats', 'Seats', 'number'), f('seats_used', 'Seats used', 'number'), f('ends_at', 'Ends at', 'date'), f('days_left', 'Days left', 'number')],
    sample: { licence_id: 'lic_sample', org_id: 't_sample', org_name: 'Sample College', org_kind: 'college', plan_key: 'campus', seats: 200, seats_used: 150, ends_at: '2026-02-01T00:00:00.000Z', days_left: 14 },
  },
  {
    type: 'mentor.booking.created', label: 'Mentor session booked', group: 'Marketplace',
    description: 'A paid mentor / service session was booked (one event per booking).',
    fields: [f('booking_id', 'Booking id'), f('order_id', 'Order id'), f('product_id', 'Session id'), f('title', 'Session'), f('seller_id', 'Mentor (seller) id'), f('buyer_id', 'Learner user id'), f('starts_at', 'Starts at', 'date'), f('ends_at', 'Ends at', 'date'), f('join_url', 'Join link')],
    sample: { booking_id: 'b_sample', order_id: 'o_sample', product_id: 'p_sample', title: '45-minute mock interview', seller_id: 'sel_sample', buyer_id: 'u_sample', starts_at: '2026-01-10T10:00:00.000Z', ends_at: '2026-01-10T10:45:00.000Z', join_url: 'https://meet.example.com/abc' },
  },
  {
    type: 'drive.scheduled', label: 'Drive scheduled', group: 'Hiring',
    description: 'A live proctored drive was scheduled, or a campus placement drive opened for applications.',
    fields: [f('drive_id', 'Drive id'), f('kind', 'live or campus'), f('title', 'Title'), f('owner_kind', 'college or company'), f('owner_name', 'Run by'), f('starts_at', 'Starts at', 'date'), f('candidates', 'Candidates', 'number'), f('company_name', 'Company')],
    sample: { drive_id: 'd_sample', kind: 'live', title: 'Campus hiring drive', owner_kind: 'company', owner_name: 'Acme', starts_at: '2026-01-15T04:30:00.000Z', candidates: 120, company_name: 'Acme' },
  },
  {
    type: 'offer.sent', label: 'Offer sent', group: 'Hiring',
    description: 'A placement offer was recorded for a student.',
    fields: [f('offer_id', 'Offer id'), f('kind', 'Kind'), f('user_id', 'Student user id'), f('company_name', 'Company'), f('role_title', 'Role'), f('ctc_minor', 'CTC (minor units)', 'number'), f('currency', 'Currency'), f('joining_date', 'Joining date'), f('drive_id', 'Drive id')],
    sample: { offer_id: 'of_sample', kind: 'campus', user_id: 'u_sample', company_name: 'Acme', role_title: 'Software engineer', ctc_minor: 120000000, currency: 'INR', joining_date: '2026-07-01', drive_id: 'd_sample' },
  },
  {
    type: 'offer.accepted', label: 'Offer accepted', group: 'Hiring',
    description: 'A placement offer was marked accepted.',
    fields: [f('offer_id', 'Offer id'), f('kind', 'Kind'), f('user_id', 'Student user id'), f('company_name', 'Company'), f('role_title', 'Role'), f('ctc_minor', 'CTC (minor units)', 'number'), f('currency', 'Currency'), f('joining_date', 'Joining date'), f('drive_id', 'Drive id')],
    sample: { offer_id: 'of_sample', kind: 'campus', user_id: 'u_sample', company_name: 'Acme', role_title: 'Software engineer', ctc_minor: 120000000, currency: 'INR', joining_date: '2026-07-01', drive_id: 'd_sample' },
  },
  {
    type: 'bgv.started', label: 'Background check started', group: 'Hiring',
    description: 'A background verification case was opened and the candidate invited.',
    fields: [f('case_id', 'Case id'), f('application_id', 'Application id'), f('candidate_name', 'Candidate name'), f('candidate_email', 'Candidate email'), f('job_title', 'Job'), f('region', 'Region')],
    sample: { case_id: 'bgv_sample', application_id: 'a_sample', candidate_name: 'Asha Rao', candidate_email: 'asha@example.com', job_title: 'Backend engineer', region: 'IN' },
  },
  {
    type: 'talent.invite.sent', label: 'Talent-search invite sent', group: 'Hiring',
    description: 'A recruiter invited a learner found in talent search to a job or test.',
    fields: [f('invite_id', 'Invite id'), f('learner_id', 'Learner user id'), f('handle', 'Passport handle'), f('recruiter_id', 'Recruiter id'), f('target_type', 'Invited to'), f('target_id', 'Target id'), f('target_title', 'Target'), f('expires_at', 'Expires at', 'date')],
    sample: { invite_id: 'ti_sample', learner_id: 'u_sample', handle: 'asha', recruiter_id: 'u_rec', target_type: 'job', target_id: 'j_sample', target_title: 'Backend engineer', expires_at: '2026-01-20T09:00:00.000Z' },
  },
  {
    type: 'pro_cert.passed', label: 'Proctored certification passed', group: 'Assessments',
    description: 'A learner passed a proctored certification and the credential was issued (or renewed).',
    fields: [f('user_id', 'User id'), f('credential_id', 'Credential id'), f('program_id', 'Program id'), f('program_slug', 'Program slug'), f('program_title', 'Program'), f('level', 'Level'), f('score_pct', 'Score %', 'number'), f('expires_at', 'Valid until', 'date'), f('verify_url', 'Verify link'), f('renewal', 'Renewal', 'boolean')],
    sample: { user_id: 'u_sample', credential_id: 'CS-ABCD-1234', program_id: 'pc_sample', program_slug: 'backend-pro', program_title: 'Backend professional', level: 'professional', score_pct: 82, expires_at: '2028-01-05T09:00:00.000Z', verify_url: '/verify/CS-ABCD-1234', renewal: false },
  },
  {
    type: 'cohort.completed', label: 'Cohort completed', group: 'Learning',
    description: 'A learner completed a cohort course and received its certificate.',
    fields: [f('user_id', 'User id'), f('cohort_id', 'Cohort id'), f('cohort_title', 'Cohort'), f('certificate_id', 'Certificate id'), f('score_pct', 'Assignment score %', 'number'), f('completed_at', 'Completed at', 'date')],
    sample: { user_id: 'u_sample', cohort_id: 'co_sample', cohort_title: 'DSA bootcamp — January', certificate_id: 'cc_sample', score_pct: 78, completed_at: '2026-02-01T09:00:00.000Z' },
  },
  {
    type: 'study_plan.created', label: 'Study plan created', group: 'Learning',
    description: 'A learner created or rebuilt their study plan.',
    fields: [f('user_id', 'User id'), f('plan_id', 'Plan id'), f('target_kind', 'Goal type'), f('target_label', 'Goal'), f('days', 'Days', 'number'), f('hours_per_week', 'Hours per week', 'number'), f('rebuilt', 'Rebuilt', 'boolean')],
    sample: { user_id: 'u_sample', plan_id: 'sp_sample', target_kind: 'company', target_label: 'TCS NQT', days: 30, hours_per_week: 6, rebuilt: false },
  },
  {
    type: 'wa_practice.enrolled', label: 'WhatsApp practice turned on', group: 'Learning',
    description: 'A learner confirmed WhatsApp daily practice (double opt-in complete). No phone number is included.',
    fields: [f('user_id', 'User id'), f('enrollment_id', 'Enrolment id'), f('domain', 'Subject'), f('level', 'Level'), f('send_hour', 'Local send hour', 'number'), f('timezone', 'Time zone')],
    sample: { user_id: 'u_sample', enrollment_id: 'wp_sample', domain: 'dsa', level: 'Medium', send_hour: 19, timezone: 'Asia/Kolkata' },
  },
  {
    type: 'community.thread.created', label: 'Community thread posted', group: 'Learning',
    description: 'A learner started a visible community thread.',
    fields: [f('user_id', 'Author user id'), f('thread_id', 'Thread id'), f('title', 'Title'), f('kind', 'Kind'), f('category_id', 'Category id'), f('problem_id', 'Problem id'), f('tags', 'Tags', 'array'), f('url', 'Link')],
    sample: { user_id: 'u_sample', thread_id: 't_sample', title: 'Two-pointer vs hashing for two-sum?', kind: 'question', category_id: 'cat_sample', problem_id: null, tags: ['arrays'], url: '/community/t/t_sample' },
  },
  // Wave 15 agent loops (lib/agent-loops).
  {
    type: 'agent_loop.run_finished', label: 'Agent loop finished a run', group: 'Content', scope: 'platform',
    description: 'A scheduled agent loop (content QA, SEO gaps, community moderator, analytics insights, social pack) finished a run.',
    fields: [f('loop', 'Loop'), f('run_id', 'Run id'), f('trigger', 'Schedule or manual'), f('findings', 'Findings', 'number'), f('new_findings', 'New findings', 'number')],
    sample: { loop: 'content-qa', run_id: 'alr_sample', trigger: 'schedule', findings: 4, new_findings: 2 },
  },
  {
    type: 'social.pack_ready', label: 'Daily social pack ready', group: 'Content', scope: 'platform',
    description: 'Today’s ready-to-post pack is in the Social studio (nothing is posted automatically).',
    fields: [f('day', 'Day'), f('items', 'Items', 'number'), f('url', 'Link')],
    sample: { day: '2026-10-23', items: 3, url: '/dashboard/admin/social?tab=pack' },
  },
  // Wave 15 hiring agents (lib/agent/hiring-loops).
  {
    type: 'hiring_agent.proposals', label: 'Hiring agent drafted proposals', group: 'Hiring',
    description: 'A hiring agent (sourcer, interview scheduler, assessment author, integrity reviewer) drafted proposals for an admin to confirm, or auto-sent steps the organisation allowed.',
    fields: [f('agent', 'Agent'), f('run_id', 'Run id'), f('proposals', 'Proposals waiting', 'number'), f('auto_sent', 'Auto-sent', 'number'), f('conversation_id', 'Copilot conversation id')],
    sample: { agent: 'sourcer', run_id: 'run_sample', proposals: 3, auto_sent: 0, conversation_id: 'conv_sample' },
  },
  // Wave 15 nudges (lib/automation/system/nudges-*.ts; emitted by "Nudge signals" / the follow-up automations).
  {
    type: 'assessment.invite.expiring', label: 'Test invite closing soon', group: 'Assessments',
    description: 'A test invite with no submission yet closes in 72 or 2 hours (once per invite and step).',
    fields: [f('invite_id', 'Invite id'), f('exam_id', 'Test id'), f('exam_title', 'Test title'), f('email', 'Candidate email'), f('name', 'Candidate name'), f('user_id', 'Candidate user id'), f('hours_left', 'Hours left', 'number'), f('expires_at', 'Closes at', 'date')],
    sample: { invite_id: 'inv_sample', exam_id: 'e_sample', exam_title: 'Backend engineer screen', email: 'asha@example.com', name: 'Asha Rao', user_id: 'u_sample', hours_left: 72, expires_at: '2026-01-10T09:00:00.000Z' },
  },
  {
    type: 'offer.pending', label: 'Offer waiting for an answer', group: 'Hiring',
    description: 'A candidate has been in an offer stage for 2 days (step candidate_2d) or 5 days (step recruiter_5d) without moving.',
    fields: [f('application_id', 'Application id'), f('job_id', 'Job id'), f('job_title', 'Job'), f('candidate_id', 'Candidate id'), f('step', 'Step'), f('days_waiting', 'Days waiting', 'number'), f('stage_entered_at', 'In the offer stage since', 'date'), f('expires_at', 'Offer deadline', 'date')],
    sample: { application_id: 'a_sample', job_id: 'j_sample', job_title: 'Backend engineer', candidate_id: 'c_sample', step: 'candidate_2d', days_waiting: 2, stage_entered_at: '2026-01-08T09:00:00.000Z', expires_at: '2026-01-15T09:00:00.000Z' },
  },
  {
    type: 'offer.expired', label: 'Offer expired', group: 'Hiring',
    description: 'An offer reached its deadline without an answer and was flagged expired (offer follow-ups automation).',
    fields: [f('application_id', 'Application id'), f('job_id', 'Job id'), f('job_title', 'Job'), f('candidate_id', 'Candidate id'), f('expires_at', 'Deadline', 'date')],
    sample: { application_id: 'a_sample', job_id: 'j_sample', job_title: 'Backend engineer', candidate_id: 'c_sample', expires_at: '2026-01-15T09:00:00.000Z' },
  },
  {
    type: 'bgv.overdue', label: 'Background check overdue at the vendor', group: 'Hiring',
    description: 'A vendor check is past its expected time (vendor SLA under Admin → Automations → Nudge limits).',
    fields: [f('case_id', 'Case id'), f('application_id', 'Application id'), f('candidate_name', 'Candidate name'), f('job_title', 'Job'), f('vendor', 'Vendor'), f('check', 'Check'), f('days_overdue', 'Days overdue', 'number')],
    sample: { case_id: 'bgv_sample', application_id: 'a_sample', candidate_name: 'Asha Rao', job_title: 'Backend engineer', vendor: 'idfy', check: 'employment', days_overdue: 2 },
  },
  {
    type: 'drive.no_show', label: 'Drive no-shows', group: 'Hiring',
    description: 'A live drive closed for joining and some rostered candidates never started (once per drive).',
    fields: [f('drive_id', 'Drive id'), f('title', 'Drive'), f('no_shows', 'No-shows', 'number'), f('starts_at', 'Started at', 'date')],
    sample: { drive_id: 'd_sample', title: 'Campus hiring drive', no_shows: 12, starts_at: '2026-01-15T04:30:00.000Z' },
  },
  {
    type: 'cohort.member_at_risk', label: 'Cohort learner at risk', group: 'Learning',
    description: 'A cohort learner missed two assignments or has been quiet for 7 days (at most once a week per learner).',
    fields: [f('cohort_id', 'Cohort id'), f('cohort_title', 'Cohort'), f('user_id', 'Learner user id'), f('email', 'Learner email'), f('name', 'Learner name'), f('reasons', 'Reasons', 'array'), f('missed_assignments', 'Missed assignments', 'number'), f('days_inactive', 'Days inactive', 'number'), f('week', 'Week (Monday)')],
    sample: { cohort_id: 'co_sample', cohort_title: 'DSA bootcamp — January', user_id: 'u_sample', email: 'asha@example.com', name: 'Asha Rao', reasons: ['missed_assignments'], missed_assignments: 2, days_inactive: 3, week: '2026-01-12' },
  },
  {
    type: 'talent.invite.pending', label: 'Talent-search invite unanswered', group: 'Hiring',
    description: 'A learner has not answered a talent-search invite after 3 days (step day3) or it expires within a day (step last_day).',
    fields: [f('invite_id', 'Invite id'), f('learner_id', 'Learner user id'), f('target_type', 'Invited to'), f('target_title', 'Target'), f('step', 'Step'), f('expires_at', 'Expires at', 'date')],
    sample: { invite_id: 'ti_sample', learner_id: 'u_sample', target_type: 'job', target_title: 'Backend engineer', step: 'day3', expires_at: '2026-01-20T09:00:00.000Z' },
  },
  // Wave 15 assistants (lib/assistants).
  {
    type: 'support.ticket_created', label: 'Support ticket from the help assistant', group: 'Accounts', scope: 'platform',
    description: 'A learner or company user turned a help-assistant answer into a support ticket.',
    fields: [f('ticket_id', 'Ticket id'), f('category', 'Category'), f('source', 'Source')],
    sample: { ticket_id: 'tk_sample', category: 'billing', source: 'assistant' },
  },
  {
    type: 'placement.report_ready', label: 'Weekly placement report ready', group: 'Learning',
    description: 'The placement assistant built a college\'s weekly report (once per college and ISO week).',
    fields: [f('college_id', 'College organisation id'), f('week', 'ISO week'), f('students', 'Students', 'number'), f('active', 'Students practising', 'number'), f('to_nudge', 'Students to nudge', 'number')],
    sample: { college_id: 't_sample', week: '2026-W43', students: 420, active: 260, to_nudge: 35 },
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

/** Events with no organisation: platform workflows only (AUTO-001). */
export function isPlatformOnlyEvent(type: string | null | undefined): boolean {
  return !!type && BY_TYPE.get(type)?.scope === 'platform'
}

/** Events an organisation (platform = false) or platform (true) workflow may trigger on. */
export function eventTypesFor(platform: boolean): EventTypeDef[] {
  return EVENT_TYPES.filter((e) => platform || e.scope !== 'platform')
}

/** Reserved namespace for product-analytics events (lib/automation/emit.ts). */
export const ANALYTICS_EVENT_PREFIX = 'analytics.'
const ANALYTICS_RE = /^analytics\.[a-z0-9][a-z0-9_.-]{0,62}$/

export function isAnalyticsEventType(type: unknown): type is string {
  return typeof type === 'string' && ANALYTICS_RE.test(type)
}

/** Catalog events plus `analytics.<name>`: what the bus accepts and a trigger may name. */
export function isEmittableEventType(type: unknown): type is string {
  return isKnownEventType(type) || isAnalyticsEventType(type)
}
