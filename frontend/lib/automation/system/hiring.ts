/**
 * Hiring automations:
 *   AU-07  pipeline nudges — SLA warnings and idle-stage digests for recruiters
 *          (escalating to organisation admins), candidate reminders for
 *          pending offers and assessments
 *   A-003  24 h / 1 h reminders for standalone (non-ATS) interviews
 */
import { getMongoDb } from '@/lib/mongodb'
import { interviewSessions } from '@/lib/db/interviews'
import { sendAutomationEmail, tenantAdminUsers } from '../mailer'
import { claimOnce } from '../store'
import { configValue, getSystemSettings } from '../settings'
import { hiringNudgeFor, hoursLeftLabel, reminderWindow } from './rules'
import type { SystemAutomation } from './types'

type Doc = Record<string, unknown>

export async function runHiringNudges(now = new Date()): Promise<{ recruitersNotified: number; candidatesReminded: number }> {
  const db = await getMongoDb()
  const settings = await getSystemSettings()
  const idleDays = configValue(settings.config, 'hiring_idle_days')
  const jobs = (await db.collection('ats_jobs').find({ status: { $in: ['open', 'on_hold'] } }, { projection: { _id: 0, id: 1, tenant_id: 1, title: 1, pipeline: 1, recruiter_ids: 1, hiring_manager_ids: 1 } }).limit(2000).toArray()) as Doc[]
  const day = now.toISOString().slice(0, 10)
  let recruitersNotified = 0
  let candidatesReminded = 0
  for (const job of jobs) {
    const pipeline = (job.pipeline || []) as { id: string; name: string; type: string; sla_days?: number | null }[]
    const apps = (await db.collection('ats_applications').find({ tenant_id: job.tenant_id, job_id: job.id, status: 'active' }, { projection: { _id: 0, id: 1, candidate_id: 1, stage_id: 1, stage_entered_at: 1, results: 1, owner_id: 1 } }).limit(1000).toArray()) as Doc[]
    const counts = { sla_warning: 0, idle: 0, long_idle: 0 }
    for (const app of apps) {
      const stage = pipeline.find((s) => s.id === app.stage_id)
      if (!stage) continue
      const entered = String(app.stage_entered_at)
      const hasResult = ((app.results || []) as { stage_id?: string; at?: string }[]).some((r) => r.stage_id === stage.id && String(r.at || '') >= entered)
      const nudge = hiringNudgeFor(stage, entered, now, idleDays, hasResult)
      if (!nudge) continue
      const stageKey = `${String(app.id)}:${stage.id}:${entered}`
      if (nudge === 'sla_warning') counts.sla_warning++
      if (nudge === 'idle') {
        counts.idle++
        if ((now.getTime() - Date.parse(entered)) / 86_400_000 >= idleDays * 2) counts.long_idle++
      }
      if (nudge === 'offer_pending' || nudge === 'assessment_pending') {
        if (!(await claimOnce(`hiring-cand:${stageKey}:${nudge}`))) continue
        const cand = (await db.collection('ats_candidates').findOne({ id: app.candidate_id, tenant_id: job.tenant_id }, { projection: { email: 1, name: 1 } })) as Doc | null
        if (!cand?.email) continue
        // AUTO-035: an open test invite already gets its own reminder (/api/cron/exam-reminders, 24 h before
        // it closes) — one owner per reminder, so skip the nudge for candidates with an open invite.
        if (nudge === 'assessment_pending' && (await db.collection('candidate_invites').countDocuments({ email: { $in: [...new Set([String(cand.email), String(cand.email).toLowerCase()])] }, status: { $in: ['pending', 'active'] } }, { limit: 1 }))) continue
        const title = String(job.title || 'the role')
        await sendAutomationEmail({
          to: String(cand.email), category: 'hiring', onceKey: `hiring-cand-mail:${stageKey}:${nudge}`,
          subject: nudge === 'offer_pending' ? `Your offer for ${title} is waiting` : `Reminder: your assessment for ${title}`,
          heading: nudge === 'offer_pending' ? 'An offer is waiting for your answer' : 'Your assessment is still open',
          bodyText: nudge === 'offer_pending'
            ? `Hi ${String(cand.name || 'there')},\n\nYou have an offer for ${title}. Please open the offer email we sent and reply — the hiring team is waiting to hear from you.`
            : `Hi ${String(cand.name || 'there')},\n\nYou haven’t finished the assessment for ${title} yet. Use the link in your invitation email to take it before the deadline.`,
          reason: `You got this email because you applied for ${title}.`,
        })
        candidatesReminded++
      }
    }
    if (!counts.sla_warning && !counts.idle) continue
    const lines = [
      counts.sla_warning ? `${counts.sla_warning} candidate(s) will be auto-rejected tomorrow by the stage time limit` : '',
      counts.idle ? `${counts.idle} candidate(s) have had no progress for ${idleDays}+ days` : '',
    ].filter(Boolean)
    const recipients = new Set<string>([...(((job.recruiter_ids as string[]) || [])), ...(((job.hiring_manager_ids as string[]) || []))])
    if (counts.long_idle) for (const a of await tenantAdminUsers(String(job.tenant_id))) recipients.add(a.id)
    if (!recipients.size || !(await claimOnce(`hiring-digest:${String(job.id)}:${day}`))) continue
    const { notifyMany } = await import('@/lib/notifications')
    recruitersNotified += await notifyMany([...recipients], {
      type: 'hiring.nudge',
      title: `${String(job.title || 'A job')}: candidates waiting`,
      message: lines.join('. ') + '.',
      link: `/dashboard/hiring/jobs/${String(job.id)}`,
      icon: 'clock',
      skip_push: !counts.sla_warning,
    })
  }
  return { recruitersNotified, candidatesReminded }
}

/**
 * A-003 / AUTO-030: 24 h and 1 h reminders for standalone interviews. They live
 * in the `interviews` collection (lib/db/interviews.ts interviewSessions()) —
 * the sweep used to read a collection nobody writes to and never sent.
 */
export async function runStandaloneInterviewReminders(now = new Date()): Promise<{ reminders: number }> {
  const db = await getMongoDb()
  const rows = (await (await interviewSessions()).find({
    status: 'scheduled',
    scheduled_at: { $gt: now.toISOString(), $lte: new Date(now.getTime() + 24 * 3_600_000).toISOString() },
  }, { projection: { _id: 0, id: 1, title: 1, role: 1, scheduled_at: 1, duration_minutes: 1, interviewer_id: 1, candidate_id: 1 } }).limit(500).toArray()) as unknown as Doc[]
  let reminders = 0
  const { notify } = await import('@/lib/notifications')
  for (const iv of rows) {
    const win = reminderWindow(String(iv.scheduled_at), now)
    if (!win || !(await claimOnce(`iv-standalone:${String(iv.id)}:${String(iv.scheduled_at)}:${win}`))) continue
    const when = new Date(String(iv.scheduled_at)).toUTCString().replace(':00 GMT', ' UTC')
    const left = hoursLeftLabel(String(iv.scheduled_at), now)
    const link = `/dashboard/interviews/${String(iv.id)}/live`
    for (const [uid, who] of [[iv.candidate_id, 'candidate'], [iv.interviewer_id, 'interviewer']] as const) {
      if (typeof uid !== 'string' || !uid) continue
      await notify({ user_id: uid, type: 'interview.reminder', title: `Interview in ${left}: ${String(iv.title || '')}`.trim(), message: `Starts ${when}.`, title_i18n: { key: 'interview.reminder.title', params: { left, title: String(iv.title || '') } }, message_i18n: { key: 'interview.reminder.message', params: { when } }, link, icon: 'clock' })
      const u = (await db.collection('user').findOne({ id: uid }, { projection: { email: 1, name: 1, fullName: 1 } })) as Doc | null
      if (!u?.email) continue
      await sendAutomationEmail({
        to: String(u.email), userId: uid, category: 'hiring', urgent: win === '1h', onceKey: `iv-standalone-mail:${String(iv.id)}:${String(iv.scheduled_at)}:${win}:${who}`,
        // Same key as the "Interview reminders" template: never two reminders (AUTO-020 / AUTO-021).
        dedupe: { kind: 'interview-reminder', ref: `${String(iv.id)}:${String(iv.scheduled_at)}:${win}` },
        subject: `Reminder: interview in ${left}`,
        heading: `Your interview starts in ${left}`,
        bodyText: `${String(iv.title || 'Interview')}${iv.role ? ` — ${String(iv.role)}` : ''}\nStarts: ${when}\nDuration: ${Number(iv.duration_minutes) || 60} minutes${who === 'candidate' ? '\n\nJoin a few minutes early and check your camera and microphone.' : ''}`,
        cta: { label: 'Open interview', url: link },
        reason: 'You got this email because you have an interview scheduled on CodeSpectra.',
      })
      reminders++
    }
  }
  return { reminders }
}

export const HIRING_AUTOMATIONS: SystemAutomation[] = [
  {
    id: 'hiring-nudges',
    title: 'Hiring pipeline nudges',
    description: 'Daily: warns recruiters a day before a stage time limit auto-rejects someone, sends a digest of candidates idle for too long (escalating to organisation admins), and reminds candidates about unanswered offers and unfinished assessments.',
    group: 'Hiring',
    refs: ['AU-07'],
    cadence: { kind: 'daily', hourUtc: 5 },
    run: async (now) => runHiringNudges(now),
  },
  {
    id: 'interview-reminders',
    title: 'Interview reminders (standalone interviews)',
    description: 'Emails and in-app reminders to the candidate and the interviewer 24 hours and 1 hour before a live interview booked outside the hiring pipeline (hiring-pipeline interviews already have their own).',
    group: 'Hiring',
    refs: ['A-003'],
    cadence: { kind: 'interval', minutes: 5 },
    run: async (now) => runStandaloneInterviewReminders(now),
  },
]
