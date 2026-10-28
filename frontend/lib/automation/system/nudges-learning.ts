/**
 * Wave 15 learner-facing nudges (all default OFF — they message people):
 *   invite-ladder        72 h + 2 h test-invite reminders (24 h stays with /api/cron/exam-reminders)
 *   cert-renewal         14 / 1-day pro-cert renewal reminders (60 days stays with lib/pro-certs) + employer note
 *   cohort-at-risk       learners who missed 2 assignments or went quiet for 7 days + mentor list
 *   mentor-sessions      mentor/learner no-shows (built-in video joins) and the post-session rating ask
 *   learner-follow-ups   referral reward email with share link; unanswered talent-search invites
 * Every message goes through deliverNudge (once per key, stop check, shared cap,
 * unsubscribe / quiet hours / consent, run log).
 */
import { getMongoDb } from '@/lib/mongodb'
import { getAppOrigin } from '@/lib/app-origin'
import { scheduleJob } from '../jobs'
import { deliverNudge, tally, type NudgeOutcome } from '../nudges/deliver'
import { nudgeMail, nudgeNote, whenUtc, dayUtc, money } from '../nudges/text'
import { certRenewalStep, cohortRisk, inviteLadderStep, REPEAT_NO_SHOW_THRESHOLD, sessionOutcome, stepKey, talentInviteStep } from '../nudges/rules'
import type { SystemAutomation } from './types'

type Doc = Record<string, any>
const DAY = 86_400_000
/** Mentor-session joins are recorded from this release on (lib/mentors/sessions recordSessionJoin). */
const JOIN_TRACKING_SINCE = '2026-10-24T00:00:00.000Z'
const firstName = (s: unknown) => (typeof s === 'string' && s.trim() ? s.trim().split(/\s+/)[0].slice(0, 40) : null)

async function userIdForEmail(email: string): Promise<string | null> {
  const db = await getMongoDb()
  const u = await db.collection('user').findOne({ email: email.toLowerCase() }, { projection: { id: 1, _id: 1 } }).catch(() => null)
  return u ? String(u.id || u._id) : null
}

// ─── Test-invite ladder ─────────────────────────────────────────────────────

async function inviteHasSubmission(inv: Doc): Promise<boolean> {
  const db = await getMongoDb()
  const examId = inv.exam_id || null
  if (!examId) return false
  return !!(await db.collection('exam_submissions').findOne({ exam_id: examId, $or: [{ email: inv.email }, ...(inv.user_id ? [{ user_id: inv.user_id }] : [])] }, { projection: { _id: 1 } }))
}

/** Invites due a 72 h or 2 h reminder now (also used by the nudge signals sweep). */
export async function dueInviteReminders(now: Date): Promise<{ inv: Doc; step: 72 | 2; exam: Doc | null }[]> {
  const db = await getMongoDb()
  const rows = (await db.collection('candidate_invites').find({
    status: { $in: ['pending', 'active'] },
    expires_at: { $gt: now.toISOString(), $lte: new Date(now.getTime() + 72 * 3_600_000).toISOString() },
  }, { projection: { _id: 0, id: 1, email: 1, full_name: 1, user_id: 1, exam_id: 1, token: 1, tenant_id: 1, expires_at: 1, status: 1, reminder_steps: 1, reminded_at: 1 } }).limit(1000).toArray()) as Doc[]
  const out: { inv: Doc; step: 72 | 2; exam: Doc | null }[] = []
  for (const inv of rows) {
    const pre = inviteLadderStep(inv, now, false)
    if (!pre) continue
    const exam = inv.exam_id ? ((await db.collection('exams').findOne({ id: inv.exam_id }, { projection: { _id: 0, title: 1, published: 1 } })) as Doc | null) : null
    if (inv.exam_id && (!exam || !exam.published)) continue
    if (await inviteHasSubmission(inv)) continue
    out.push({ inv, step: pre, exam })
  }
  return out
}

export async function runInviteLadder(now = new Date()): Promise<Record<string, number>> {
  const db = await getMongoDb()
  const outcomes: NudgeOutcome[] = []
  for (const { inv, step, exam } of await dueInviteReminders(now)) {
    const userId = typeof inv.user_id === 'string' && inv.user_id ? inv.user_id : await userIdForEmail(String(inv.email))
    const examTitle = String(exam?.title || 'your assessment').slice(0, 120)
    const id = step === 2 ? 'inviteLast' : 'inviteSoon'
    const params = { exam: examTitle, date: whenUtc(inv.expires_at) }
    const url = `${getAppOrigin()}/assessment/invite/${encodeURIComponent(String(inv.token || ''))}`
    const o = await deliverNudge({
      automationId: 'invite-ladder', key: `${String(inv.id)}:${stepKey(step)}`, now,
      to: { userId, email: String(inv.email) }, tenantId: inv.tenant_id || null, priority: step === 2 ? 'high' : 'normal',
      email: nudgeMail({ id, category: 'assessment', params, name: firstName(inv.full_name), cta: { url }, urgent: step === 2, dedupe: { kind: 'invite-ladder', ref: `${String(inv.id)}:${stepKey(step)}` } }),
      inApp: userId ? { type: 'assessment.reminder', ...nudgeNote('invite', step === 2 ? { title: 'lastTitle', message: 'lastMessage' } : { title: 'title', message: 'message' }, params), link: `/assessment/invite/${encodeURIComponent(String(inv.token || ''))}`, icon: 'clock', skip_push: step !== 2 } : null,
      whatsapp: step === 2,
      stillDue: async () => !(await inviteHasSubmission(inv)),
    })
    outcomes.push(o)
    if (o === 'sent') {
      await db.collection('candidate_invites').updateOne({ id: inv.id }, { $addToSet: { reminder_steps: stepKey(step) }, $inc: { reminder_count: 1 }, $set: { last_reminded_at: now.toISOString() } })
    }
  }
  return tally(outcomes)
}

// ─── Certificate renewal ────────────────────────────────────────────────────

export async function runCertRenewal(now = new Date()): Promise<Record<string, number>> {
  const { credentials } = await import('@/lib/pro-certs/db')
  const col = await credentials()
  const rows = (await col.find({ status: 'active', expires_at: { $gt: now.toISOString(), $lte: new Date(now.getTime() + 15 * DAY).toISOString() } }, { projection: { _id: 0 } }).limit(1000).toArray()) as unknown as Doc[]
  const db = await getMongoDb()
  const outcomes: NudgeOutcome[] = []
  let employers = 0
  for (const c of rows) {
    const step = certRenewalStep(c, now, false)
    if (!step) continue
    const u = (await db.collection('user').findOne({ id: c.user_id }, { projection: { email: 1, name: 1, fullName: 1 } })) as Doc | null
    const link = `/dashboard/certifications/proctored/${encodeURIComponent(String(c.program_slug))}`
    const params = { title: String(c.program_title).slice(0, 120), id: String(c.id), date: dayUtc(c.expires_at), days: step }
    const o = await deliverNudge({
      automationId: 'cert-renewal', key: `${String(c.id)}:${String(c.expires_at)}:${step}d`, now,
      to: { userId: String(c.user_id), email: typeof u?.email === 'string' ? u.email : null }, priority: step === 1 ? 'high' : 'normal',
      email: nudgeMail({ id: step === 1 ? 'certLast' : 'certRenew', category: 'engagement', params, name: firstName(u?.fullName || u?.name), cta: { url: link } }),
      inApp: { type: 'pro_cert.expiring', ...nudgeNote('cert', { title: 'title', message: 'message' }, params), link, icon: 'clock' },
      stillDue: async () => !!(await col.findOne({ id: c.id, status: 'active' }, { projection: { _id: 1 } })),
    })
    outcomes.push(o)
    if (o === 'sent') await col.updateOne({ id: c.id }, { $addToSet: { renewal_steps: stepKey(step * 24) } } as never)
    // Employers who found this learner in talent search (accepted invites = the learner shared their profile with them).
    if (o === 'sent' && step === 14) {
      const invs = (await db.collection('talent_invites').find({ learner_id: c.user_id, status: 'accepted' }, { projection: { _id: 0, recruiter_id: 1, tenant_id: 1, handle: 1 } }).sort({ responded_at: -1 }).limit(5).toArray()) as Doc[]
      for (const inv of invs) {
        const p = { handle: String(inv.handle || ''), title: params.title, date: params.date }
        const r = await deliverNudge({
          automationId: 'cert-renewal', key: `${String(c.id)}:${String(c.expires_at)}:employer:${String(inv.recruiter_id)}`, now, capExempt: true, tenantId: inv.tenant_id || null,
          to: { userId: String(inv.recruiter_id) },
          inApp: { type: 'talent.update', ...nudgeNote('certEmployer', { title: 'title', message: 'message' }, p), link: `/dashboard/hiring/talent`, icon: 'award', skip_push: true },
        })
        if (r === 'sent') employers++
      }
    }
  }
  return { ...tally(outcomes), employers }
}

// ─── Cohort at-risk learners ────────────────────────────────────────────────

const isoWeek = (now: Date) => {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - ((now.getUTCDay() + 6) % 7)))
  return d.toISOString().slice(0, 10)
}

/** At-risk learners per running cohort (also used by the nudge signals sweep). */
export async function cohortsAtRisk(now: Date): Promise<{ cohort: Doc; learners: { member: Doc; risk: ReturnType<typeof cohortRisk> }[] }[]> {
  const { cohortsCol, membersCol, assignmentsCol, submissionsCol, attendanceCol, sessionsCol } = await import('@/lib/cohorts/db')
  const cohorts = (await (await cohortsCol()).find({ status: 'running' }, { projection: { _id: 0, id: 1, title: 1, tenant_id: 1, starts_at: 1 } }).limit(500).toArray()) as unknown as Doc[]
  const weekAgo = now.getTime() - 7 * 86_400_000
  const out: { cohort: Doc; learners: { member: Doc; risk: ReturnType<typeof cohortRisk> }[] }[] = []
  for (const cohort of cohorts) {
    const assignments = (await (await assignmentsCol()).find({ cohort_id: cohort.id, published: true }, { projection: { _id: 0, id: 1, due_at: 1, late_hours: 1 } }).limit(500).toArray()) as unknown as Doc[]
    const pastDue = assignments.filter((a) => Date.parse(a.due_at) + (Number(a.late_hours) || 0) * 3_600_000 < now.getTime()).map((a) => ({ id: String(a.id) }))
    const members = (await (await membersCol()).find({ cohort_id: cohort.id, role: 'learner', status: 'active' }, { projection: { _id: 0 } }).limit(2000).toArray()) as unknown as Doc[]
    if (!members.length) continue
    // Was there anything to do this week (a live session or an assignment due)? (AUTO-096)
    const dueThisWeek = assignments.some((a) => { const t = Date.parse(a.due_at); return t >= weekAgo && t <= now.getTime() })
    const hadRecentWork = dueThisWeek || !!(await (await sessionsCol()).findOne({ cohort_id: cohort.id, starts_at: { $gte: new Date(weekAgo).toISOString(), $lte: now.toISOString() } } as never, { projection: { _id: 1 } }))
    const ids = members.map((m) => String(m.user_id))
    const subs = await (await submissionsCol()).aggregate<{ _id: string; assignments: string[]; last: string }>([
      { $match: { cohort_id: cohort.id, user_id: { $in: ids } } },
      { $group: { _id: '$user_id', assignments: { $addToSet: '$assignment_id' }, last: { $max: '$submitted_at' } } },
    ]).toArray()
    const att = await (await attendanceCol()).aggregate<{ _id: string; last: string }>([
      { $match: { cohort_id: cohort.id, user_id: { $in: ids }, status: { $in: ['present', 'late'] } } },
      { $group: { _id: '$user_id', last: { $max: '$at' } } },
    ]).toArray()
    const subBy = new Map(subs.map((s) => [s._id, s]))
    const attBy = new Map(att.map((a) => [a._id, a.last]))
    const learners: { member: Doc; risk: ReturnType<typeof cohortRisk> }[] = []
    for (const m of members) {
      const s = subBy.get(String(m.user_id))
      const lasts = [s?.last, attBy.get(String(m.user_id))].filter((x): x is string => typeof x === 'string').sort()
      const risk = cohortRisk({ pastDue, submittedIds: new Set(s?.assignments || []), lastActivityAt: lasts[lasts.length - 1] || null, joinedAt: String(m.joined_at), startsAt: cohort.starts_at ? String(cohort.starts_at) : null, hadRecentWork }, now)
      learners.push({ member: m, risk })
    }
    out.push({ cohort, learners })
  }
  return out
}

export async function runCohortAtRisk(now = new Date()): Promise<Record<string, number>> {
  const { membersCol } = await import('@/lib/cohorts/db')
  const mcol = await membersCol()
  const week = isoWeek(now)
  const outcomes: NudgeOutcome[] = []
  let staff = 0
  for (const { cohort, learners } of await cohortsAtRisk(now)) {
    const atRisk = learners.filter((l) => l.risk.at_risk)
    // Flag for the cohort page (and anything reading members); cleared when they catch up.
    for (const l of learners) {
      if (l.risk.at_risk) await mcol.updateOne({ id: l.member.id }, { $set: { at_risk: { since: l.member.at_risk?.since || now.toISOString(), reasons: l.risk.reasons, missed: l.risk.missed, days_inactive: l.risk.days_inactive, checked_at: now.toISOString() } } } as never)
      else if (l.member.at_risk) await mcol.updateOne({ id: l.member.id }, { $unset: { at_risk: '' } } as never)
    }
    const title = String(cohort.title).slice(0, 120)
    const link = `/dashboard/cohorts/${encodeURIComponent(String(cohort.id))}`
    for (const { member, risk } of atRisk) {
      const params = { cohort: title, count: risk.missed, days: risk.days_inactive }
      outcomes.push(await deliverNudge({
        automationId: 'cohort-at-risk', key: `${String(cohort.id)}:${String(member.user_id)}:${week}`, now, tenantId: cohort.tenant_id || null,
        to: { userId: String(member.user_id), email: member.email || null },
        email: nudgeMail({ id: 'cohortRisk', category: 'engagement', params, name: firstName(member.name), bodyKey: risk.reasons.includes('missed_assignments') ? 'auto.nudge.cohortRisk.bodyMissed' : 'auto.nudge.cohortRisk.body', cta: { url: link }, dedupe: { kind: 'cohort-at-risk', ref: `${String(cohort.id)}:${String(member.user_id)}:${week}` } }),
        inApp: { type: 'cohort.reminder', ...nudgeNote('cohort', { title: 'title', message: 'message' }, params), link, icon: 'alert-circle', skip_push: true },
      }))
    }
    if (!atRisk.length) continue
    const mentors = (await mcol.find({ cohort_id: cohort.id, role: { $in: ['mentor', 'ta'] }, status: 'active' }, { projection: { _id: 0, user_id: 1, email: 1, name: 1 } }).limit(20).toArray()) as unknown as Doc[]
    const list = atRisk.slice(0, 25).map(({ member, risk }) => `• ${String(member.name || 'Learner').slice(0, 60)} — ${risk.reasons.includes('missed_assignments') ? `${risk.missed} missed` : ''}${risk.reasons.length === 2 ? ', ' : ''}${risk.reasons.includes('inactive') ? `${risk.days_inactive} days quiet` : ''}`).join('\n')
    for (const s of mentors) {
      const params = { cohort: title, count: atRisk.length, list }
      const r = await deliverNudge({
        automationId: 'cohort-at-risk', key: `${String(cohort.id)}:staff:${String(s.user_id)}:${week}`, now, capExempt: true, tenantId: cohort.tenant_id || null,
        to: { userId: String(s.user_id), email: s.email || null },
        email: nudgeMail({ id: 'cohortStaff', category: 'transactional', params, name: firstName(s.name), cta: { url: link } }),
        inApp: { type: 'cohort.staff', ...nudgeNote('cohortStaff', { title: 'title', message: 'message' }, params), link: link, icon: 'users', skip_push: true },
      })
      if (r === 'sent') staff++
    }
  }
  return { ...tally(outcomes), mentors_told: staff }
}

// ─── Mentor sessions: no-shows + rating ask ─────────────────────────────────

export async function runMentorSessions(now = new Date()): Promise<Record<string, number>> {
  const [{ bookings }, { sessionMetaCol }, { productsCol, reviewsCol }, { getSellerById }] = await Promise.all([
    import('@/lib/marketplace/booking'), import('@/lib/mentors/db'), import('@/lib/marketplace/db'), import('@/lib/marketplace/sellers'),
  ])
  const rows = (await (await bookings()).find({ status: { $in: ['booked', 'completed'] }, end: { $lte: new Date(now.getTime() - 15 * 60_000).toISOString(), $gte: new Date(now.getTime() - 7 * DAY).toISOString() } }, { projection: { _id: 0 } }).limit(1000).toArray()) as unknown as Doc[]
  const meta = await sessionMetaCol()
  const db = await getMongoDb()
  const outcomes: NudgeOutcome[] = []
  let flagged = 0
  // Joins are only recorded when a LiveKit token is minted: without LiveKit nobody could
  // join, so never report a no-show (AUTO-107).
  const { livekitConfig } = await import('@/lib/ats/interviews/livekit')
  const livekitOn = !!(await livekitConfig().catch(() => null))
  for (const b of rows) {
    const m = (await meta.findOne({ booking_id: b.id }, { projection: { _id: 0 } })) as Doc | null
    if (m?.dispute_id) continue
    const product = (await (await productsCol()).findOne({ id: b.product_id }, { projection: { _id: 0, title: 1, service: 1 } })) as Doc | null
    // The booked line's provider first, like the session page (lib/mentors/sessions getSession).
    const order = (await db.collection('mkt_orders').findOne({ id: b.order_id }, { projection: { _id: 0, lines: 1 } })) as Doc | null
    const line = ((order?.lines as Doc[] | undefined) || []).find((l) => l.id === b.line_id) as Doc | undefined
    const provider = line?.service?.provider || product?.service?.provider
    // Joins are recorded since JOIN_TRACKING_SINCE; older sessions only get the rating ask.
    const builtIn = livekitOn && provider === 'livekit' && String(b.start) >= JOIN_TRACKING_SINCE
    const reviewed = !!(await (await reviewsCol()).findOne({ product_id: b.product_id, user_id: b.buyer_id }, { projection: { _id: 1 } }))
    const joinRows = builtIn ? ((await db.collection('mentor_session_joins').find({ booking_id: b.id }, { projection: { _id: 0, role: 1, at: 1 } }).toArray()) as Doc[]) : []
    const joins = { buyer: joinRows.find((j) => j.role === 'buyer')?.at ?? null, mentor: joinRows.find((j) => j.role === 'mentor')?.at ?? null }
    const outcome = sessionOutcome(b as never, joins, builtIn, now, reviewed)
    if (outcome === 'wait' || outcome === 'done') continue
    const seller = await getSellerById(String(b.seller_id))
    const mentorUser = seller?.user_id ? String(seller.user_id) : null
    const mentorName = String((seller as Doc | null)?.display_name || 'your mentor').slice(0, 60)
    const buyer = (await db.collection('user').findOne({ id: b.buyer_id }, { projection: { email: 1, name: 1, fullName: 1 } })) as Doc | null
    const title = String(product?.title || 'your session').slice(0, 120)
    const sessionLink = `/dashboard/sessions/${encodeURIComponent(String(b.id))}`
    const params = { title, mentor: mentorName }
    if (outcome === 'feedback') {
      outcomes.push(await deliverNudge({
        automationId: 'mentor-sessions', key: `${String(b.id)}:feedback`, now, to: { userId: String(b.buyer_id), email: buyer?.email || null },
        // Same topic as the mentor-match assistant's follow-up: one "how was it?" per session (AUTO-097).
        topic: 'mentor-feedback', object: String(b.id),
        email: nudgeMail({ id: 'sessionFeedback', category: 'engagement', params, name: firstName(buyer?.fullName || buyer?.name), cta: { url: `/dashboard/orders/${encodeURIComponent(String(b.order_id))}` } }),
        inApp: { type: 'mentor.feedback', ...nudgeNote('feedback', { title: 'title', message: 'message' }, params), link: `/dashboard/orders/${encodeURIComponent(String(b.order_id))}`, icon: 'star', skip_push: true },
        stillDue: async () => !(await (await reviewsCol()).findOne({ product_id: b.product_id, user_id: b.buyer_id }, { projection: { _id: 1 } })),
      }))
      continue
    }
    // No-show: record it once on the session, tell both sides, flag repeat mentor no-shows.
    const first = await meta.updateOne({ booking_id: b.id, no_show: { $exists: false } } as never, { $set: { no_show: { kind: outcome, at: now.toISOString() }, updated_at: now.toISOString() }, $setOnInsert: { booking_id: b.id, order_id: b.order_id, line_id: b.line_id, seller_id: b.seller_id, buyer_id: b.buyer_id, reschedules: [], created_at: now.toISOString() } } as never, { upsert: true }).catch(() => ({ modifiedCount: 0, upsertedCount: 0 }))
    if (!first.modifiedCount && !first.upsertedCount) continue
    const mentorMissed = outcome === 'no_show_mentor' || outcome === 'no_show_both'
    outcomes.push(await deliverNudge({
      // About a paid booking (how to reschedule / get help): transactional, never held by the cap (AUTO-110).
      // The no-show is recorded once above, so a capped notice would never be retried.
      automationId: 'mentor-sessions', key: `${String(b.id)}:noshow:buyer`, now, priority: 'high', class: 'transactional', to: { userId: String(b.buyer_id), email: buyer?.email || null },
      email: nudgeMail({ id: mentorMissed ? 'mentorNoShow' : 'learnerNoShow', category: 'transactional', params, name: firstName(buyer?.fullName || buyer?.name), cta: { url: sessionLink } }),
      inApp: { type: 'mentor.no_show', ...nudgeNote('session', { title: 'noShowTitle', message: mentorMissed ? 'mentorMissedLearner' : 'learnerMissedLearner' }, params), link: sessionLink, icon: 'alert-circle' },
    }))
    if (mentorUser) {
      await deliverNudge({
        automationId: 'mentor-sessions', key: `${String(b.id)}:noshow:mentor`, now, capExempt: true, to: { userId: mentorUser },
        inApp: { type: 'mentor.no_show', ...nudgeNote('session', { title: 'noShowTitle', message: mentorMissed ? 'mentorMissedMentor' : 'learnerMissedMentor' }, params), link: `/dashboard/mentor`, icon: 'alert-circle' },
      })
    }
    if (mentorMissed) {
      const recent = await meta.countDocuments({ seller_id: b.seller_id, 'no_show.kind': { $in: ['no_show_mentor', 'no_show_both'] }, 'no_show.at': { $gte: new Date(now.getTime() - 90 * DAY).toISOString() } } as never)
      if (recent >= REPEAT_NO_SHOW_THRESHOLD) {
        const { sendAdminAlert } = await import('../alerts')
        await sendAdminAlert({ key: `mentor-no-show:${String(b.seller_id)}`, title: 'Mentor missed several sessions', detail: `A mentor (seller ${String(b.seller_id)}) missed ${recent} sessions in the last 90 days. Review them under Admin → Mentors.`, severity: 'warning', link: '/dashboard/admin/mentors', windowMinutes: 7 * 24 * 60 }).catch(() => false)
        flagged++
      }
    }
  }
  return { ...tally(outcomes), mentors_flagged: flagged }
}

// ─── Referral reward + talent-invite follow-ups ─────────────────────────────

async function referralRewardMail(p: Doc, job?: { created_at?: string }): Promise<unknown> {
  const uid = String(p.user_id || '')
  if (!uid) return { skipped: true }
  // Queued while the automation was off: drop it instead of sending a months-old email (AUTO-092).
  const { followUpTooOld } = await import('../nudges/rules')
  if (followUpTooOld(job?.created_at, new Date())) return { skipped: 'too_old' }
  const db = await getMongoDb()
  const u = (await db.collection('user').findOne({ id: uid }, { projection: { email: 1, name: 1, fullName: 1 } })) as Doc | null
  const link = '/dashboard/referrals'
  const params = { amount: p.kind === 'credit' && Number(p.amount_minor) > 0 ? money(Number(p.amount_minor), String(p.currency || 'INR')) : '', link: `${getAppOrigin()}${link}` }
  return deliverNudge({
    automationId: 'learner-follow-ups', key: `referral:${String(p.reward_id || '')}`, to: { userId: uid, email: u?.email || null },
    // The bell note already comes from lib/billing/referrals; this is the email with the share link.
    email: nudgeMail({ id: 'referralReward', category: 'engagement', params, name: firstName(u?.fullName || u?.name), bodyKey: p.kind === 'credit' ? 'auto.nudge.referralReward.body' : 'auto.nudge.referralReward.bodyMonth', extra: [{ key: 'auto.nudge.referralReward.share', params }], cta: { url: link } }),
  })
}

/** Talent invites due a follow-up (also used by the nudge signals sweep). */
export async function dueTalentInvites(now: Date): Promise<{ inv: Doc; step: 'day3' | 'last_day' }[]> {
  const db = await getMongoDb()
  const rows = (await db.collection('talent_invites').find({ status: 'pending', expires_at: { $gt: now.toISOString() }, created_at: { $lte: new Date(now.getTime() - 2 * DAY).toISOString() } }, { projection: { _id: 0 } }).limit(2000).toArray()) as Doc[]
  const out: { inv: Doc; step: 'day3' | 'last_day' }[] = []
  for (const inv of rows) {
    const step = talentInviteStep(inv as never, now, (inv.reminder_steps as string[]) || [])
    if (step) out.push({ inv, step })
  }
  return out
}

export async function runTalentFollowUps(now = new Date()): Promise<Record<string, number>> {
  const db = await getMongoDb()
  const outcomes: NudgeOutcome[] = []
  for (const { inv, step } of await dueTalentInvites(now)) {
    const u = (await db.collection('user').findOne({ id: inv.learner_id }, { projection: { email: 1, name: 1, fullName: 1 } })) as Doc | null
    const params = { org: String(inv.tenant_name || 'An organisation').slice(0, 80), target: String(inv.target_title || '').slice(0, 120) }
    const o = await deliverNudge({
      automationId: 'learner-follow-ups', key: `talent:${String(inv.id)}:${step}`, now, priority: step === 'last_day' ? 'high' : 'normal', tenantId: inv.tenant_id || null,
      to: { userId: String(inv.learner_id), email: u?.email || null },
      email: nudgeMail({ id: 'talentInvite', category: 'hiring', params, name: firstName(u?.fullName || u?.name), bodyKey: step === 'last_day' ? 'auto.nudge.talentInvite.bodyLast' : 'auto.nudge.talentInvite.body', cta: { url: '/dashboard/passport#invites' }, dedupe: { kind: 'talent-invite-reminder', ref: `${String(inv.id)}:${step}` } }),
      inApp: { type: 'talent.invite', ...nudgeNote('talent', { title: 'title', message: 'message' }, params), link: '/dashboard/passport#invites', icon: 'briefcase', skip_push: step !== 'last_day' },
      stillDue: async () => !!(await db.collection('talent_invites').findOne({ id: inv.id, status: 'pending' }, { projection: { _id: 1 } })),
    })
    outcomes.push(o)
    if (o === 'sent') await db.collection('talent_invites').updateOne({ id: inv.id }, { $addToSet: { reminder_steps: step } })
  }
  return tally(outcomes)
}

export const LEARNING_NUDGE_AUTOMATIONS: SystemAutomation[] = [
  {
    id: 'invite-ladder',
    title: 'Test-invite reminder ladder',
    description: 'Adds a 3-day nudge and a 2-hour “last chance” (email, plus WhatsApp for people who agreed) to the 24-hour invite reminder. Stops as soon as the candidate submits; the results page shows how often each invite was reminded.',
    group: 'Assessments',
    refs: ['W15-AUTO-01'],
    defaultOn: false,
    cadence: { kind: 'interval', minutes: 15 },
    run: async (now) => runInviteLadder(now),
  },
  {
    id: 'cert-renewal',
    title: 'Certification renewal reminders',
    description: 'Turns the single 60-day expiry notice for proctored certifications into a sequence: again 14 days and 1 day before, with a renew link. Employers who found the learner in talent search get a note at 14 days. Stops when the credential is renewed.',
    group: 'Engagement',
    refs: ['W15-AUTO-05'],
    defaultOn: false,
    cadence: { kind: 'daily', hourUtc: 6, minuteUtc: 30 },
    run: async (now) => runCertRenewal(now),
  },
  {
    id: 'cohort-at-risk',
    title: 'Cohort at-risk learners',
    description: 'Daily: learners who missed two assignments or have been quiet for 7 days get one nudge a week, and the cohort mentors get the list with a link to message them. The flag clears when they catch up.',
    group: 'Engagement',
    refs: ['W15-AUTO-13'],
    defaultOn: false,
    cadence: { kind: 'daily', hourUtc: 7 },
    run: async (now) => runCohortAtRisk(now),
  },
  {
    id: 'mentor-sessions',
    title: 'Mentor no-shows and session ratings',
    description: '15 minutes after a built-in video session, tells both sides if someone didn’t join (with the reschedule / refund path) and flags mentors who miss two sessions in 90 days; 2 hours after other sessions, asks the learner for a rating.',
    group: 'Engagement',
    refs: ['W15-AUTO-09'],
    defaultOn: false,
    cadence: { kind: 'interval', minutes: 15 },
    run: async (now) => runMentorSessions(now),
  },
  {
    id: 'learner-follow-ups',
    title: 'Referral reward and talent-invite follow-ups',
    description: 'Emails referrers their share link when a reward lands, and reminds learners of unanswered employer invites from talent search after 3 days and on the last day.',
    group: 'Engagement',
    refs: ['W15-AUTO-14'],
    defaultOn: false,
    cadence: { kind: 'daily', hourUtc: 8 },
    run: async (now) => runTalentFollowUps(now),
    events: [{ type: 'referral.rewarded', handle: async (ev) => { if (ev.payload.reward_id) await scheduleJob('referral_reward_mail', `referral-mail:${String(ev.payload.reward_id)}`, new Date(Date.now() + 5 * 60_000), ev.payload, { tenantId: ev.tenant_id }) } }],
    jobs: [{ type: 'referral_reward_mail', handler: referralRewardMail }],
  },
]
