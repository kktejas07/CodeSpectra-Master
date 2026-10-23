/**
 * One registry of every scheduled background job (AUTO-042). The Automations
 * health view, the Cron jobs page and the stale-heartbeat alert all read it,
 * so a job added here is monitored everywhere. `id` is the cron_runs
 * heartbeat id; `everyMinutes` its normal cadence (a heartbeat older than
 * ~3x that, min 15 min, is stale). Pure, client-safe.
 *
 * Built-in system automations (lib/automation/system/registry.ts) are added
 * at runtime as `auto:<id>` with their own cadence.
 */

export interface RegisteredJob {
  id: string
  label: string
  group: 'Scheduler' | 'Hiring' | 'Platform' | 'Content' | 'Marketplace' | 'Cron routes'
  everyMinutes: number
  /** Only runs when a feature is switched on / configured: a missing heartbeat is not an alert. */
  optional?: boolean
}

export const SCHEDULED_JOBS: readonly RegisteredJob[] = [
  { id: 'scheduler-loop', label: 'Workflow scheduler tick', group: 'Scheduler', everyMinutes: 1 },
  { id: 'automations', label: 'Automation queues (events, runs, jobs)', group: 'Scheduler', everyMinutes: 1 },
  { id: 'ats-interviews', label: 'Hiring interview reminders and scorecards', group: 'Hiring', everyMinutes: 1 },
  { id: 'ats-hr-forms', label: 'HR compensation forms', group: 'Hiring', everyMinutes: 1 },
  { id: 'ats-bgv', label: 'Background verification', group: 'Hiring', everyMinutes: 5 },
  { id: 'ats-screening', label: 'Bot screening', group: 'Hiring', everyMinutes: 1 },
  { id: 'ats-sla', label: 'Stage SLAs and assessment deadlines', group: 'Hiring', everyMinutes: 1440 },
  { id: 'mkt-buyer', label: 'Marketplace checkout release and bookings', group: 'Marketplace', everyMinutes: 1 },
  { id: 'exam-auto-close', label: 'Exam auto-close', group: 'Platform', everyMinutes: 1 },
  { id: 'quiet-hours-flush', label: 'Quiet-hours notification flush', group: 'Platform', everyMinutes: 1 },
  { id: 'trial-expiry', label: 'Trial expiry', group: 'Platform', everyMinutes: 1440 },
  { id: 'grace-expiry', label: 'Payment grace expiry', group: 'Platform', everyMinutes: 1440 },
  { id: 'identity-media-purge', label: 'Identity photo retention', group: 'Platform', everyMinutes: 1440 },
  { id: 'interview-sim-retention', label: 'Mock-interview recording retention', group: 'Platform', everyMinutes: 1440 },
  { id: 'learn', label: 'Learn hub (publish + drafts)', group: 'Content', everyMinutes: 1 },
  { id: 'learn-digest', label: 'Learn weekly digest', group: 'Content', everyMinutes: 10080, optional: true },
  { id: 'events-feed', label: 'Events feed', group: 'Content', everyMinutes: 1 },
  { id: 'analytics', label: 'Analytics rollups', group: 'Content', everyMinutes: 15 },
  { id: 'seo-indexnow', label: 'IndexNow submissions', group: 'Content', everyMinutes: 10, optional: true },
  { id: 'question-bot', label: 'Question bank bot (nightly drafts)', group: 'Content', everyMinutes: 1440, optional: true },
  { id: 'integrity', label: 'Test integrity (similar code, snapshot retention)', group: 'Content', everyMinutes: 5 },
  { id: 'assessment-invites', label: 'Bulk assessment invite emails', group: 'Platform', everyMinutes: 1 },
  { id: 'events-feed-digest', label: 'Events feed weekly digest', group: 'Content', everyMinutes: 10080, optional: true },
  { id: 'status-check', label: 'Status check', group: 'Cron routes', everyMinutes: 5 },
  { id: 'exam-reminders', label: 'Exam invite reminders', group: 'Cron routes', everyMinutes: 60 },
  { id: 'daily-digest', label: 'Daily digest', group: 'Cron routes', everyMinutes: 1440 },
  { id: 'weekly-digest', label: 'Weekly digest', group: 'Cron routes', everyMinutes: 10080 },
  { id: 'ebooks-daily', label: 'Daily ebook draft', group: 'Cron routes', everyMinutes: 1440, optional: true },
  { id: 'signals-ingest', label: 'Signals ingest', group: 'Cron routes', everyMinutes: 360, optional: true },
  { id: 'security-scan', label: 'Security scan', group: 'Cron routes', everyMinutes: 10080 },
  // AUTO-083: jobs added in later waves (all record heartbeats via runLeasedJob / withCronHeartbeat).
  { id: 'news-digest', label: 'Tech news daily digest', group: 'Content', everyMinutes: 1440, optional: true },
  { id: 'content-digest', label: 'Daily digest page (events, news, Learn, contests)', group: 'Content', everyMinutes: 1440, optional: true },
  { id: 'study-plans', label: 'Study plans (weekly build + reminders)', group: 'Content', everyMinutes: 60 },
  { id: 'wa-practice', label: 'WhatsApp daily practice', group: 'Content', everyMinutes: 60 },
  { id: 'guardian-reports', label: 'Guardian weekly reports', group: 'Content', everyMinutes: 60 },
  { id: 'knowledge', label: 'Knowledge index (queue, nightly sweep, vector sync, copilot eval)', group: 'Content', everyMinutes: 1 },
  { id: 'razorpay-cancel-sweep', label: 'Razorpay cancellations at period end', group: 'Platform', everyMinutes: 1440 },
  { id: 'referral-rewards', label: 'Referral rewards', group: 'Platform', everyMinutes: 1440 },
  { id: 'licence-expiry', label: 'Organisation licence expiry', group: 'Platform', everyMinutes: 1440 },
  { id: 'ai-usage-rollup', label: 'AI spend daily rollup', group: 'Platform', everyMinutes: 1440 },
  { id: 'pro-cert-sweep', label: 'Proctored certifications (finalise, payments, expiry reminders)', group: 'Platform', everyMinutes: 5 },
  { id: 'lti-grade-retry', label: 'LMS grade passback retries', group: 'Platform', everyMinutes: 5 },
  { id: 'company-tests-refresh', label: 'Company test weekly refresh', group: 'Content', everyMinutes: 10080, optional: true },
  { id: 'hiring-analytics-digest', label: 'Hiring analytics weekly digest', group: 'Hiring', everyMinutes: 10080 },
  // Wave 15 agent loops (lib/agent-loops/registry.ts): switchable in Admin → Agent loops.
  { id: 'agent-loop:content-qa', label: 'Agent loop: content QA', group: 'Content', everyMinutes: 10080, optional: true },
  { id: 'agent-loop:seo-gap', label: 'Agent loop: SEO / content gaps', group: 'Content', everyMinutes: 10080, optional: true },
  { id: 'agent-loop:community-mod', label: 'Agent loop: community moderator', group: 'Content', everyMinutes: 30, optional: true },
  { id: 'agent-loop:analytics-insight', label: 'Agent loop: analytics insights', group: 'Platform', everyMinutes: 10080, optional: true },
  { id: 'agent-loop:social-pack', label: 'Agent loop: daily social pack', group: 'Content', everyMinutes: 1440, optional: true },
  // Wave 15 assistants (lib/assistants/tick.ts): each switched on / off in Admin → Assistants.
  { id: 'assistant-revenue', label: 'Revenue and renewal agent (daily proposals)', group: 'Platform', everyMinutes: 1440, optional: true },
  { id: 'assistant-onboarding', label: 'Org onboarding checklist and nudges', group: 'Platform', everyMinutes: 1440, optional: true },
  { id: 'assistant-placement-report', label: 'Weekly placement report', group: 'Content', everyMinutes: 10080, optional: true },
  { id: 'assistant-mentor-followup', label: 'Mentor session follow-ups', group: 'Marketplace', everyMinutes: 60, optional: true },
  // Only hit by an external scheduler on serverless hosts; the in-process loop covers everything else.
  { id: 'tick', label: 'External cron tick (/api/cron/tick)', group: 'Cron routes', everyMinutes: 1, optional: true },
  // Hiring agents (lib/agent/hiring-loops/tick.ts): checked on these cadences; per-org work only when switched on.
  { id: 'hiring-agent-sourcer', label: 'Hiring agent: sourcer (nightly invite shortlists)', group: 'Hiring', everyMinutes: 60 },
  { id: 'hiring-agent-scheduler', label: 'Hiring agent: interview scheduler', group: 'Hiring', everyMinutes: 60 },
  { id: 'hiring-agent-author', label: 'Hiring agent: assessment author queue', group: 'Hiring', everyMinutes: 15 },
  { id: 'hiring-agent-integrity', label: 'Hiring agent: integrity review queue', group: 'Hiring', everyMinutes: 60 },
]

/** Minutes after which a heartbeat counts as stale. */
export function staleAfterMinutes(everyMinutes: number): number {
  return Math.max(15, everyMinutes * 3)
}

export interface JobHealthRow extends RegisteredJob {
  last_run_at: string | null
  last_status: 'ok' | 'error' | null
  last_error: string | null
  runs: number
  failures: number
  state: 'ok' | 'failing' | 'stale' | 'never'
}

/** Pure: health of each job from its heartbeat row. */
export function jobHealth(
  jobs: readonly RegisteredJob[],
  beats: Record<string, { last_run_at?: string; last_status?: 'ok' | 'error'; last_error?: string | null; runs?: number; failures?: number } | undefined>,
  now: Date,
): JobHealthRow[] {
  return jobs.map((j) => {
    const b = beats[j.id]
    const last = b?.last_run_at ?? null
    const age = last ? (now.getTime() - Date.parse(last)) / 60_000 : Infinity
    const state: JobHealthRow['state'] = !last ? 'never' : age > staleAfterMinutes(j.everyMinutes) ? 'stale' : b?.last_status === 'error' ? 'failing' : 'ok'
    return { ...j, last_run_at: last, last_status: b?.last_status ?? null, last_error: b?.last_error ?? null, runs: b?.runs ?? 0, failures: b?.failures ?? 0, state }
  })
}

/** The heartbeats the ops alert watches: every non-optional job, with its cadence. */
export function expectedHeartbeats(extra: readonly RegisteredJob[] = []): Record<string, number> {
  const out: Record<string, number> = {}
  for (const j of [...SCHEDULED_JOBS, ...extra]) if (!j.optional) out[j.id] = j.everyMinutes
  return out
}
