/**
 * Wave 15 hiring nudges (default OFF — they message candidates / staff):
 *   drive-reminders      live drives: 24 h / 1 h reminders with the system-check link; after the
 *                        drive, no-shows are marked and the owner can add them to another drive
 *   offer-follow-ups     ATS offer stage: candidate reminder at 2 days, recruiter escalation at 5,
 *                        "offer expired" at the deadline (flag + Slack / Teams post)
 *   bgv-chaser           vendor checks past their SLA: re-poll the vendor, tell recruiters; Monday list
 *                        of checks blocking joining dates
 *   employer-weekly-report  Monday 09:00 (each member's time zone): tests, pass rate, integrity flags,
 *                        pipeline movement, drives and talent-search invites per organisation
 */
import { getMongoDb } from '@/lib/mongodb'
import { getAppOrigin } from '@/lib/app-origin'
import { tenantAdminUsers } from '../mailer'
import { deliverNudge, tally, type NudgeOutcome } from '../nudges/deliver'
import { nudgeMail, nudgeNote, enLine, whenUtc } from '../nudges/text'
import {
  bgvDaysOverdue, driveClosedAt, dueLadderStep, DRIVE_REMINDER_HOURS, employerWeekEmpty, isDriveNoShow, offerDeadline, offerStep,
  passRate, stepKey, weeklyReportDue, type EmployerWeek,
} from '../nudges/rules'
import { getNudgeSettings } from '../nudges/settings'
import type { SystemAutomation } from './types'
import { isoWeekKey } from '@/lib/messaging/budget-rules'

type Doc = Record<string, any>
const DAY = 86_400_000
const firstName = (s: unknown) => (typeof s === 'string' && s.trim() ? s.trim().split(/\s+/)[0].slice(0, 40) : null)

// ─── Drives ─────────────────────────────────────────────────────────────────

export async function runDriveReminders(now = new Date()): Promise<Record<string, number>> {
  const db = await getMongoDb()
  const drives = db.collection('live_drives')
  const cands = db.collection('live_drive_candidates')
  const outcomes: NudgeOutcome[] = []
  let noShows = 0
  // Reminders: drives starting within 24 h.
  const upcoming = (await drives.find({ status: 'scheduled', 'schedule.start_at': { $gt: now.toISOString(), $lte: new Date(now.getTime() + 24 * 3_600_000).toISOString() } }, { projection: { _id: 0, id: 1, title: 1, owner: 1, schedule: 1 } }).limit(200).toArray()) as Doc[]
  for (const d of upcoming) {
    const rows = (await cands.find({ drive_id: d.id, state: 'not_started' }, { projection: { _id: 0, id: 1, user_id: 1, email: 1, name: 1, reminder_steps: 1 } }).limit(5000).toArray()) as Doc[]
    for (const c of rows) {
      const step = dueLadderStep(d.schedule.start_at, now, DRIVE_REMINDER_HOURS, (c.reminder_steps as string[]) || [])
      if (!step) continue
      const link = `/dashboard/drives/${encodeURIComponent(String(d.id))}`
      const params = { title: String(d.title).slice(0, 120), org: String(d.owner?.name || '').slice(0, 80), date: whenUtc(d.schedule.start_at), left: step === 1 ? '1 hour' : '24 hours' }
      const o = await deliverNudge({
        automationId: 'drive-reminders', key: `${String(c.id)}:${stepKey(step)}`, now, tenantId: d.owner?.tenant_id || null, priority: step === 1 ? 'high' : 'normal',
        to: { userId: String(c.user_id), email: c.email || null },
        email: nudgeMail({ id: step === 1 ? 'driveSoon' : 'driveTomorrow', category: 'hiring', params, name: firstName(c.name), cta: { url: link }, urgent: step === 1, dedupe: { kind: 'drive-reminder', ref: `${String(c.id)}:${stepKey(step)}` } }),
        inApp: { type: 'drive.reminder', ...nudgeNote('drive', { title: step === 1 ? 'soonTitle' : 'title', message: 'message' }, params), link, icon: 'clock' },
        whatsapp: true,
        stillDue: async () => !!(await cands.findOne({ id: c.id, state: 'not_started' }, { projection: { _id: 1 } })) && !!(await drives.findOne({ id: d.id, status: 'scheduled', 'schedule.start_at': d.schedule.start_at }, { projection: { _id: 1 } })),
      })
      outcomes.push(o)
      if (o === 'sent') await cands.updateOne({ id: c.id }, { $addToSet: { reminder_steps: stepKey(step) } })
    }
  }
  // No-shows: joining closed in the last 2 days.
  const recent = (await drives.find({ status: { $in: ['scheduled', 'ended'] }, 'schedule.start_at': { $gte: new Date(now.getTime() - 3 * DAY).toISOString(), $lte: now.toISOString() } }, { projection: { _id: 0, id: 1, title: 1, owner: 1, schedule: 1, created_by: 1, no_shows_marked_at: 1 } }).limit(200).toArray()) as Doc[]
  for (const d of recent) {
    if (d.no_shows_marked_at) continue
    const closed = driveClosedAt(d.schedule)
    if (!isDriveNoShow({ state: 'not_started' }, closed, now)) continue
    const claim = await drives.updateOne({ id: d.id, no_shows_marked_at: { $exists: false } }, { $set: { no_shows_marked_at: now.toISOString() } })
    if (!claim.modifiedCount) continue
    const r = await cands.updateMany({ drive_id: d.id, state: 'not_started', started_at: null }, { $set: { no_show: true, no_show_at: now.toISOString() } })
    if (!r.modifiedCount) continue
    noShows += r.modifiedCount
    const params = { title: String(d.title).slice(0, 120), count: r.modifiedCount }
    void import('../events').then(({ emit }) => emit('drive.no_show', { drive_id: d.id, title: d.title, no_shows: r.modifiedCount, starts_at: d.schedule.start_at }, { tenantId: d.owner?.tenant_id || null, idempotencyKey: `drive.no_show:${String(d.id)}` })).catch(() => {})
    if (d.created_by) {
      await deliverNudge({
        automationId: 'drive-reminders', key: `${String(d.id)}:no-shows`, now, capExempt: true, tenantId: d.owner?.tenant_id || null,
        to: { userId: String(d.created_by) },
        inApp: { type: 'drive.no_show', ...nudgeNote('driveNoShow', { title: 'title', message: 'message' }, params), link: `/dashboard/live-drives/${encodeURIComponent(String(d.id))}?no_shows=1`, icon: 'user-x' },
      })
    }
  }
  return { ...tally(outcomes), no_shows: noShows }
}

// ─── Offers ─────────────────────────────────────────────────────────────────

/** Applications sitting in an offer stage that need a follow-up step now. */
export async function dueOfferFollowUps(now: Date): Promise<{ app: Doc; job: Doc; step: 'candidate_2d' | 'recruiter_5d' | 'expired'; deadline: string | null }[]> {
  const db = await getMongoDb()
  const { offer_expiry_days } = await getNudgeSettings()
  const jobs = (await db.collection('ats_jobs').find({ status: { $in: ['open', 'on_hold'] } }, { projection: { _id: 0, id: 1, tenant_id: 1, title: 1, pipeline: 1, recruiter_ids: 1, hiring_manager_ids: 1 } }).limit(2000).toArray()) as Doc[]
  const out: { app: Doc; job: Doc; step: 'candidate_2d' | 'recruiter_5d' | 'expired'; deadline: string | null }[] = []
  for (const job of jobs) {
    const offerStages = ((job.pipeline || []) as Doc[]).filter((s) => s.type === 'offer').map((s) => String(s.id))
    if (!offerStages.length) continue
    const apps = (await db.collection('ats_applications').find({ tenant_id: job.tenant_id, job_id: job.id, status: 'active', stage_id: { $in: offerStages } }, { projection: { _id: 0, id: 1, candidate_id: 1, stage_id: 1, stage_entered_at: 1, offer_expires_at: 1, offer_followups: 1 } }).limit(1000).toArray()) as Doc[]
    for (const app of apps) {
      const entry = `${String(app.stage_id)}:${String(app.stage_entered_at)}`
      const sent = ((app.offer_followups as string[]) || []).filter((s) => s.startsWith(`${entry}:`)).map((s) => s.slice(entry.length + 1))
      const deadline = offerDeadline(String(app.stage_entered_at), app.offer_expires_at, offer_expiry_days)
      const step = offerStep(String(app.stage_entered_at), now, deadline, sent)
      if (step) out.push({ app, job, step, deadline })
    }
  }
  return out
}

export async function runOfferFollowUps(now = new Date()): Promise<Record<string, number>> {
  const db = await getMongoDb()
  const outcomes: NudgeOutcome[] = []
  let expired = 0
  for (const { app, job, step, deadline } of await dueOfferFollowUps(now)) {
    const entry = `${String(app.stage_id)}:${String(app.stage_entered_at)}`
    const stillInOffer = async () => !!(await db.collection('ats_applications').findOne({ id: app.id, tenant_id: job.tenant_id, status: 'active', stage_id: app.stage_id, stage_entered_at: app.stage_entered_at }, { projection: { _id: 1 } }))
    const cand = (await db.collection('ats_candidates').findOne({ id: app.candidate_id, tenant_id: job.tenant_id }, { projection: { _id: 0, email: 1, name: 1, user_id: 1 } })) as Doc | null
    const jobTitle = String(job.title || 'the role').slice(0, 120)
    const candidate = String(cand?.name || 'The candidate').slice(0, 80)
    const params = { job: jobTitle, candidate, date: whenUtc(deadline) }
    const staff = [...new Set<string>([...((job.recruiter_ids as string[]) || []), ...((job.hiring_manager_ids as string[]) || [])])]
    const link = `/dashboard/hiring/candidates/${encodeURIComponent(String(app.candidate_id))}?app=${encodeURIComponent(String(app.id))}`
    let ok = false
    if (step === 'candidate_2d') {
      if (!cand?.email) continue
      const o = await deliverNudge({
        automationId: 'offer-follow-ups', key: `${String(app.id)}:${entry}:candidate`, now, tenantId: job.tenant_id,
        to: { userId: typeof cand.user_id === 'string' ? cand.user_id : null, email: String(cand.email) },
        email: nudgeMail({ id: deadline ? 'offerWaiting' : 'offerWaitingNoDate', category: 'hiring', params, name: firstName(cand.name), dedupe: { kind: 'offer-followup', ref: `${String(app.id)}:${String(app.stage_entered_at)}:candidate` } }),
        stillDue: stillInOffer,
      })
      outcomes.push(o)
      ok = o === 'sent' || o === 'skipped'
    } else {
      if (step === 'expired') {
        if (!(await stillInOffer())) continue
        await db.collection('ats_applications').updateOne({ id: app.id, tenant_id: job.tenant_id }, { $set: { offer_expired_at: now.toISOString() } })
        expired++
        const { sendChatMessage } = await import('@/lib/integrations/chat-send')
        await sendChatMessage(String(job.tenant_id), { event: 'application', title: enLine('auto.nudge.offerExpired.chat', { job: jobTitle, candidate }), lines: deadline ? [{ label: 'Deadline', value: whenUtc(deadline) }] : [], url: `${getAppOrigin()}${link}` }).catch(() => null)
        void import('../events').then(({ emit }) => emit('offer.expired', { application_id: app.id, job_id: job.id, job_title: jobTitle, candidate_id: app.candidate_id, expires_at: deadline }, { tenantId: String(job.tenant_id), idempotencyKey: `offer.expired:${String(app.id)}:${entry}` })).catch(() => {})
      }
      for (const uid of staff.length ? staff : (await tenantAdminUsers(String(job.tenant_id))).map((a) => a.id)) {
        const o = await deliverNudge({
          automationId: 'offer-follow-ups', key: `${String(app.id)}:${entry}:${step}:${uid}`, now, capExempt: true, tenantId: job.tenant_id,
          to: { userId: uid },
          inApp: { type: 'hiring.nudge', ...nudgeNote('offer', step === 'expired' ? { title: 'expiredTitle', message: 'expiredMessage' } : { title: 'escalateTitle', message: 'escalateMessage' }, params), link, icon: step === 'expired' ? 'alert-circle' : 'clock' },
          stillDue: step === 'expired' ? undefined : stillInOffer,
        })
        outcomes.push(o)
      }
      ok = true
    }
    if (ok) await db.collection('ats_applications').updateOne({ id: app.id, tenant_id: job.tenant_id }, { $addToSet: { offer_followups: `${entry}:${step}` } })
  }
  return { ...tally(outcomes), expired }
}

// ─── Background-check chaser ────────────────────────────────────────────────

export async function overdueBgvChecks(now: Date): Promise<{ c: Doc; check: Doc; days: number }[]> {
  const { bgv_sla_days } = await getNudgeSettings()
  const db = await getMongoDb()
  const cases = (await db.collection('ats_bgv_cases').find({ status: { $in: ['in_progress', 'submitted', 'verifying'] }, vendor_ordered_at: { $type: 'string' }, purged_at: { $in: [null, undefined] } } as never, { projection: { _id: 0, id: 1, tenant_id: 1, job_id: 1, application_id: 1, candidate_id: 1, candidate_name: 1, job_title: 1, vendor: 1, vendor_ordered_at: 1, checks: 1 } }).limit(2000).toArray()) as Doc[]
  const out: { c: Doc; check: Doc; days: number }[] = []
  for (const c of cases) for (const check of (c.checks as Doc[]) || []) {
    const days = bgvDaysOverdue(check, c.vendor_ordered_at, now, bgv_sla_days)
    if (days > 0) out.push({ c, check, days })
  }
  return out
}

export async function runBgvChaser(now = new Date()): Promise<Record<string, number>> {
  const db = await getMongoDb()
  const { getVendor } = await import('@/lib/ats/bgv/vendors')
  const overdue = await overdueBgvChecks(now)
  const outcomes: NudgeOutcome[] = []
  let repolled = 0
  const jobStaff = new Map<string, string[]>()
  const staffOf = async (tenantId: string, jobId: string) => {
    const k = `${tenantId}:${jobId}`
    if (!jobStaff.has(k)) {
      const j = (await db.collection('ats_jobs').findOne({ id: jobId, tenant_id: tenantId }, { projection: { _id: 0, recruiter_ids: 1 } })) as Doc | null
      let ids = ((j?.recruiter_ids as string[]) || []).filter(Boolean)
      if (!ids.length) ids = (await db.collection('ats_members').find({ tenant_id: tenantId, status: 'active', role: { $in: ['admin', 'recruiter'] }, user_id: { $type: 'string' } }, { projection: { user_id: 1 } }).limit(20).toArray()).map((r) => String(r.user_id))
      jobStaff.set(k, ids)
    }
    return jobStaff.get(k)!
  }
  for (const { c, check, days } of overdue) {
    const vendor = getVendor(c.vendor)
    // Chase the vendor: polling vendors (IDfy, AuthBridge) get a fresh status read on the next BGV sweep.
    if (vendor.poll) {
      const r = await db.collection('ats_bgv_cases').updateOne({ id: c.id, tenant_id: c.tenant_id, chased_at: { $not: { $gte: new Date(now.getTime() - DAY).toISOString() } } } as never, { $set: { vendor_polled_at: null, chased_at: now.toISOString() } })
      if (r.modifiedCount) repolled++
    }
    const params = { candidate: String(c.candidate_name || 'A candidate').slice(0, 80), check: String(check.type).replace(/_/g, ' '), vendor: String(vendor.label || c.vendor), days }
    for (const uid of await staffOf(String(c.tenant_id), String(c.job_id))) {
      outcomes.push(await deliverNudge({
        automationId: 'bgv-chaser', key: `${String(c.id)}:${String(check.type)}:${String(c.vendor_ordered_at)}:${uid}`, now, capExempt: true, tenantId: c.tenant_id,
        to: { userId: uid },
        inApp: { type: 'ats.bgv', ...nudgeNote('bgv', { title: 'title', message: 'message' }, params), link: `/dashboard/hiring/candidates/${encodeURIComponent(String(c.candidate_id))}?app=${encodeURIComponent(String(c.application_id))}`, icon: 'shield-alert', skip_push: true },
      }))
    }
    void import('../events').then(({ emit }) => emit('bgv.overdue', { case_id: c.id, application_id: c.application_id, candidate_name: params.candidate, job_title: c.job_title, vendor: params.vendor, check: check.type, days_overdue: days }, { tenantId: String(c.tenant_id), idempotencyKey: `bgv.overdue:${String(c.id)}:${String(check.type)}:${String(c.vendor_ordered_at)}` })).catch(() => {})
  }
  // Monday: one list per organisation of checks blocking joining dates.
  let lists = 0
  if (now.getUTCDay() === 1) {
    const byTenant = new Map<string, typeof overdue>()
    for (const o of overdue) byTenant.set(String(o.c.tenant_id), [...(byTenant.get(String(o.c.tenant_id)) || []), o])
    const week = now.toISOString().slice(0, 10)
    for (const [tenantId, rows] of byTenant) {
      const list = rows.slice(0, 30).map((r) => `• ${String(r.c.candidate_name || '').slice(0, 60)} (${String(r.c.job_title || '').slice(0, 60)}): ${String(r.check.type).replace(/_/g, ' ')} — ${r.days} days late`).join('\n')
      const staff = new Set<string>()
      for (const r of rows) for (const id of await staffOf(tenantId, String(r.c.job_id))) staff.add(id)
      for (const uid of staff) {
        const u = (await db.collection('user').findOne({ id: uid }, { projection: { email: 1, name: 1, fullName: 1 } })) as Doc | null
        const o = await deliverNudge({
          automationId: 'bgv-chaser', key: `weekly:${tenantId}:${week}:${uid}`, now, capExempt: true, tenantId,
          to: { userId: uid, email: u?.email || null },
          email: nudgeMail({ id: 'bgvWeekly', category: 'hiring', params: { count: rows.length, list }, name: firstName(u?.fullName || u?.name), cta: { url: '/dashboard/hiring' } }),
        })
        if (o === 'sent') lists++
      }
    }
  }
  return { ...tally(outcomes), overdue: overdue.length, vendor_repolls: repolled, weekly_lists: lists }
}

// ─── Weekly employer report ─────────────────────────────────────────────────

export async function employerWeek(tenantId: string, now: Date): Promise<EmployerWeek> {
  const db = await getMongoDb()
  const from = new Date(now.getTime() - 7 * DAY).toISOString()
  const exams = (await db.collection('exams').find({ tenant_id: tenantId }, { projection: { _id: 0, id: 1 } }).limit(5000).toArray()).map((e) => String(e.id))
  const { PROCTOR_INFO_EVENT_TYPES } = await import('@/lib/exam-access')
  const [sent, subs, flags, moves, hires, drives, talent] = await Promise.all([
    db.collection('candidate_invites').countDocuments({ tenant_id: tenantId, created_at: { $gte: from } }),
    exams.length ? db.collection('exam_submissions').find({ exam_id: { $in: exams }, submitted_at: { $gte: from } }, { projection: { _id: 0, passed: 1 } }).limit(20_000).toArray() : Promise.resolve([]),
    exams.length ? db.collection('proctor_events').countDocuments({ session_kind: 'exam', session_id: { $in: exams }, event_type: { $nin: [...PROCTOR_INFO_EVENT_TYPES] }, created_at: { $gte: from } }) : Promise.resolve(0),
    db.collection('ats_applications').countDocuments({ tenant_id: tenantId, stage_entered_at: { $gte: from } }),
    db.collection('ats_applications').countDocuments({ tenant_id: tenantId, status: 'hired', updated_at: { $gte: from } }),
    db.collection('live_drives').find({ 'owner.tenant_id': tenantId, 'schedule.start_at': { $gte: from, $lte: now.toISOString() } }, { projection: { _id: 0, candidate_count: 1 } }).limit(500).toArray(),
    db.collection('talent_invites').countDocuments({ tenant_id: tenantId, status: 'accepted', responded_at: { $gte: from } }),
  ])
  return {
    tests_sent: sent, tests_completed: subs.length, pass_rate: passRate(subs.map((s) => ({ score: s.passed === true ? 1 : 0, max: 1, pass: 100 }))),
    integrity_flags: flags, stage_moves: moves, hires, drives: drives.length, drive_candidates: drives.reduce((a, d) => a + (Number(d.candidate_count) || 0), 0), talent_accepted: talent,
  }
}

export async function runEmployerWeeklyReport(now = new Date()): Promise<Record<string, number>> {
  const db = await getMongoDb()
  const members = (await db.collection('ats_members').find({ status: 'active', role: { $in: ['admin', 'recruiter'] }, user_id: { $type: 'string' } }, { projection: { _id: 0, tenant_id: 1, user_id: 1 } }).limit(20_000).toArray()) as Doc[]
  const pairs = new Map<string, { tenantId: string; userId: string }>()
  for (const m of members) pairs.set(`${String(m.tenant_id)}:${String(m.user_id)}`, { tenantId: String(m.tenant_id), userId: String(m.user_id) })
  const tenants = [...new Set(members.map((m) => String(m.tenant_id)))]
  for (const t of tenants) for (const a of await tenantAdminUsers(t)) pairs.set(`${t}:${a.id}`, { tenantId: t, userId: a.id })
  const tz = new Map((await db.collection('notification_preferences').find({ user_id: { $in: [...new Set([...pairs.values()].map((p) => p.userId))] }, type: 'quiet_hours' }, { projection: { user_id: 1, timeZone: 1 } }).toArray()).map((r) => [String(r.user_id), typeof r.timeZone === 'string' ? r.timeZone : 'UTC']))
  const weekCache = new Map<string, EmployerWeek>()
  const names = new Map<string, string>()
  const outcomes: NudgeOutcome[] = []
  for (const { tenantId, userId } of pairs.values()) {
    const week = weeklyReportDue(now, tz.get(userId) || 'UTC')
    if (!week) continue
    if (!weekCache.has(tenantId)) weekCache.set(tenantId, await employerWeek(tenantId, now))
    const w = weekCache.get(tenantId)!
    if (employerWeekEmpty(w)) continue
    if (!names.has(tenantId)) names.set(tenantId, String((await db.collection('tenants').findOne({ id: tenantId }, { projection: { name: 1 } }))?.name || 'Your organisation').slice(0, 80))
    const u = (await db.collection('user').findOne({ id: userId }, { projection: { email: 1, name: 1, fullName: 1 } })) as Doc | null
    if (!u?.email) continue
    const org = names.get(tenantId)!
    const lines = [
      { key: 'auto.nudge.weekly.tests', params: { sent: w.tests_sent, done: w.tests_completed } },
      ...(w.pass_rate !== null ? [{ key: 'auto.nudge.weekly.passRate', params: { rate: w.pass_rate } }] : []),
      { key: 'auto.nudge.weekly.flags', params: { flags: w.integrity_flags } },
      { key: 'auto.nudge.weekly.pipeline', params: { moves: w.stage_moves, hires: w.hires } },
      ...(w.drives ? [{ key: 'auto.nudge.weekly.drives', params: { drives: w.drives, candidates: w.drive_candidates } }] : []),
      { key: 'auto.nudge.weekly.talent', params: { accepted: w.talent_accepted } },
    ]
    outcomes.push(await deliverNudge({
      automationId: 'employer-weekly-report', key: `${tenantId}:${userId}:${week}`, now, capExempt: true, tenantId,
      // One Monday hiring report per person: shared with the opt-in hiring-analytics digest (AUTO-100).
      topic: 'weekly-hiring-report', object: `${tenantId}:${isoWeekKey(new Date(`${week}T12:00:00Z`))}`,
      to: { userId, email: String(u.email) },
      email: nudgeMail({ id: 'weekly', category: 'reports', params: { org }, name: firstName(u.fullName || u.name), extra: lines, cta: { url: '/dashboard/hiring/analytics' } }),
    }))
  }
  return { ...tally(outcomes), organisations: weekCache.size }
}

export const HIRING_NUDGE_AUTOMATIONS: SystemAutomation[] = [
  {
    id: 'drive-reminders',
    title: 'Drive-day reminders and no-shows',
    description: 'Reminds registered candidates 24 hours and 1 hour before a live drive (email, in-app, WhatsApp for people who agreed) with the system-check link. After joining closes, marks no-shows and tells the drive owner, who can add them to another drive in one click.',
    group: 'Hiring',
    refs: ['W15-AUTO-06'],
    defaultOn: false,
    cadence: { kind: 'interval', minutes: 15 },
    run: async (now) => runDriveReminders(now),
  },
  {
    id: 'offer-follow-ups',
    title: 'Offer follow-ups and expiry',
    description: 'For candidates in an offer stage: a reminder after 2 days, an escalation to the recruiters after 5, and at the deadline (stage setting or the default under Nudge limits) the offer is flagged expired and posted to the organisation’s Slack / Teams. Replaces the 3-day offer reminder of “Hiring pipeline nudges” while on.',
    group: 'Hiring',
    refs: ['W15-AUTO-07'],
    defaultOn: false,
    cadence: { kind: 'daily', hourUtc: 5, minuteUtc: 15 },
    run: async (now) => runOfferFollowUps(now),
    emits: ['offer.expired'],
  },
  {
    id: 'bgv-chaser',
    title: 'Background-check vendor chaser',
    description: 'Daily: vendor checks past their expected time (Nudge limits → vendor SLA) get a fresh status read from IDfy / AuthBridge and the recruiters are told; on Mondays each organisation gets the list of checks blocking joining dates.',
    group: 'Hiring',
    refs: ['W15-AUTO-08'],
    defaultOn: false,
    cadence: { kind: 'daily', hourUtc: 6 },
    run: async (now) => runBgvChaser(now),
  },
  {
    id: 'employer-weekly-report',
    title: 'Weekly employer report',
    description: 'Every Monday at 09:00 in each member’s time zone: tests sent and completed, pass rate, integrity flags, pipeline movement, drives and talent-search invites accepted for their organisation. Members can unsubscribe from weekly reports; empty weeks send nothing.',
    group: 'Hiring',
    refs: ['W15-AUTO-10'],
    defaultOn: false,
    cadence: { kind: 'interval', minutes: 60 },
    run: async (now) => runEmployerWeeklyReport(now),
  },
]
