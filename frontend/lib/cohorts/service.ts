/**
 * Cohort courses — server side. Every function takes the signed-in caller and
 * checks access itself (routes only parse input):
 *  - organisation admins / superadmins create and run cohorts of their tenant,
 *  - mentors and TAs (cohort staff) run sessions, assignments and grading,
 *  - learners enrol (free, licence seat, plan entitlement or a paid marketplace
 *    order), join sessions (attendance), submit work and see their progress.
 */
import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import type { APIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { newId, nowIso } from '@/lib/db/ids'
import { getAppOrigin } from '@/lib/app-origin'
import { fail } from '@/lib/community/http'
import { communityT } from '@/lib/community/i18n-server'
import { assignmentsCol, attendanceCol, certificatesCol, cohortsCol, membersCol, sessionsCol, submissionsCol } from './db'
import {
  AssignmentInputSchema, CohortInputSchema, COHORT_COMPLETION_XP, DEFAULT_ACCESS, DEFAULT_COMPLETION,
  autogradeResult, canJoin, cleanRubricScores, decideEnrolment, deadlineState, expandWeekly, finalScore,
  firstIssue, joinAttendance, learnerAssignment, learnerProgress, needsTaGrade, normaliseAssignment,
} from './pure'
import type { AssignmentDoc, AttendanceStatus, CohortDoc, CohortMemberDoc, CohortSessionDoc, MemberRole, SubmissionDoc } from './types'
import { SESSION_PROVIDERS, STAFF_ROLES } from './types'
import type { MeetingProvider } from '@/lib/ats/contract'

type Doc = Record<string, unknown>
const MAX_ATTEMPTS = 10
export const FILE_MAX_BYTES = 10 * 1048576

// ─── Access ──────────────────────────────────────────────────────────────────

export function isCohortAdmin(user: Pick<APIUser, 'role' | 'tenantId'>, c: Pick<CohortDoc, 'tenant_id'>): boolean {
  if (user.role === 'superadmin') return true
  return user.role === 'tenant_admin' && !!user.tenantId && c.tenant_id === user.tenantId
}

async function loadCohort(id: string): Promise<CohortDoc> {
  const c = await (await cohortsCol()).findOne({ id }, { projection: { _id: 0 } })
  if (!c) throw fail('Cohort not found', 404, 'cohort_not_found')
  return c
}

async function membership(cohortId: string, userId: string): Promise<CohortMemberDoc | null> {
  return (await membersCol()).findOne({ cohort_id: cohortId, user_id: userId, status: { $ne: 'dropped' } }, { projection: { _id: 0 } })
}

/** Admin of the cohort's organisation, or one of its mentors / TAs. */
async function staffGate(user: APIUser, cohortId: string): Promise<{ cohort: CohortDoc; admin: boolean; role: MemberRole | null }> {
  const cohort = await loadCohort(cohortId)
  const admin = isCohortAdmin(user, cohort)
  const m = await membership(cohortId, user.id)
  if (!admin && !(m && m.role !== 'learner')) throw fail('Only the cohort’s mentors, TAs and admins can do this.', 403, 'cohort_staff_only')
  return { cohort, admin, role: m?.role ?? null }
}

function visibleTo(user: Pick<APIUser, 'role' | 'tenantId'>, c: Pick<CohortDoc, 'tenant_id' | 'status'>): boolean {
  if (isCohortAdmin(user, c)) return true
  if (c.status === 'draft' || c.status === 'archived') return false
  return !c.tenant_id || c.tenant_id === user.tenantId || c.tenant_id === 'platform'
}

// ─── Cohorts ─────────────────────────────────────────────────────────────────

function publicCohort(c: CohortDoc) {
  const { created_by: _c, ...rest } = c
  return rest
}

export async function listCohorts(user: APIUser) {
  const [all, mine] = await Promise.all([
    (await cohortsCol()).find({ status: { $in: ['open', 'running', 'completed', ...(user.role === 'user' ? [] : ['draft'])] as CohortDoc['status'][] } }, { projection: { _id: 0 } }).sort({ starts_at: -1 }).limit(200).toArray(),
    (await membersCol()).find({ user_id: user.id, status: { $ne: 'dropped' } }, { projection: { _id: 0, cohort_id: 1, role: 1, status: 1 } }).limit(200).toArray(),
  ])
  const roles = new Map(mine.map((m) => [m.cohort_id, m]))
  return all
    .filter((c) => visibleTo(user, c) || roles.has(c.id))
    .map((c) => ({ ...publicCohort(c), my_role: roles.get(c.id)?.role ?? null, my_status: roles.get(c.id)?.status ?? null, can_manage: isCohortAdmin(user, c) }))
}

export async function createCohort(user: APIUser, raw: unknown): Promise<CohortDoc> {
  if (user.role !== 'superadmin' && !(user.role === 'tenant_admin' && user.tenantId)) throw fail('Only organisation admins can create cohorts.', 403, 'cohort_admin_only')
  const r = CohortInputSchema.safeParse(raw)
  if (!r.success) throw fail(firstIssue(r.error), 400, 'cohort_invalid', { detail: firstIssue(r.error) })
  const i = r.data
  if (i.course_id) {
    const course = await (await getMongoDb()).collection('courses').findOne({ id: i.course_id }, { projection: { _id: 0, id: 1 } })
    if (!course) throw fail('That course does not exist.', 400, 'cohort_course_missing')
  }
  const now = nowIso()
  const doc: CohortDoc = {
    id: `coh_${randomBytes(9).toString('hex')}`,
    course_id: i.course_id ?? null,
    title: i.title,
    summary: i.summary ?? '',
    skills: i.skills ?? [],
    tenant_id: user.role === 'superadmin' ? null : user.tenantId!,
    starts_at: i.starts_at,
    ends_at: i.ends_at,
    timezone: i.timezone,
    capacity: i.capacity,
    enrolled_count: 0,
    status: i.status ?? 'draft',
    access: { ...DEFAULT_ACCESS, ...(i.access || {}) },
    schedule: { weekly: [], provider: 'livekit', manual_url: null, title_prefix: i.title, ...(i.schedule || {}) },
    completion: { ...DEFAULT_COMPLETION, ...(i.completion || {}) },
    created_by: user.id,
    created_at: now,
    updated_at: now,
  }
  await assertPaidProduct(doc)
  await (await cohortsCol()).insertOne(doc)
  return doc
}

async function assertPaidProduct(c: Pick<CohortDoc, 'access'>) {
  const pid = c.access.marketplace_product_id
  if (!pid) return
  const { productsCol } = await import('@/lib/marketplace/db')
  const p = await (await productsCol()).findOne({ id: pid }, { projection: { _id: 0, id: 1 } })
  if (!p) throw fail('That marketplace product does not exist.', 400, 'cohort_product_missing')
}

export async function updateCohort(user: APIUser, id: string, raw: unknown): Promise<CohortDoc> {
  const cohort = await loadCohort(id)
  if (!isCohortAdmin(user, cohort)) throw fail('Only organisation admins can edit cohorts.', 403, 'cohort_admin_only')
  const merged = { ...publicCohort(cohort), ...(raw && typeof raw === 'object' ? raw : {}) } as Doc
  for (const k of ['id', 'tenant_id', 'enrolled_count', 'created_at', 'updated_at']) delete merged[k]
  const r = CohortInputSchema.safeParse(merged)
  if (!r.success) throw fail(firstIssue(r.error), 400, 'cohort_invalid', { detail: firstIssue(r.error) })
  const i = r.data
  if (i.capacity < cohort.enrolled_count) throw fail('Capacity can’t go below the number of enrolled learners.', 400, 'cohort_capacity_below')
  const next: Partial<CohortDoc> = {
    course_id: i.course_id ?? null, title: i.title, summary: i.summary ?? '', skills: i.skills ?? [],
    starts_at: i.starts_at, ends_at: i.ends_at, timezone: i.timezone, capacity: i.capacity, status: i.status ?? cohort.status,
    access: { ...cohort.access, ...(i.access || {}) }, schedule: { ...cohort.schedule, ...(i.schedule || {}) },
    completion: { ...cohort.completion, ...(i.completion || {}) }, updated_at: nowIso(),
  }
  await assertPaidProduct(next as CohortDoc)
  const after = await (await cohortsCol()).findOneAndUpdate({ id }, { $set: next }, { returnDocument: 'after', projection: { _id: 0 } })
  if (next.status === 'completed' && cohort.status !== 'completed') void issueCertificates(user, id).catch((e) => console.error('[cohorts] certificates failed', (e as Error)?.message))
  return after as CohortDoc
}

/** Cohort page: overview, staff, sessions and — for members — assignments and progress. */
export async function cohortView(user: APIUser, id: string) {
  const cohort = await loadCohort(id)
  const me = await membership(id, user.id)
  if (!visibleTo(user, cohort) && !me) throw fail('Cohort not found', 404, 'cohort_not_found')
  const admin = isCohortAdmin(user, cohort)
  const staff = admin || (!!me && me.role !== 'learner')
  const db = await getMongoDb()
  const [team, sessions, assignments, course] = await Promise.all([
    (await membersCol()).find({ cohort_id: id, role: { $in: [...STAFF_ROLES] }, status: 'active' }, { projection: { _id: 0, user_id: 1, name: 1, role: 1, mentor_slug: 1 } }).limit(50).toArray(),
    (await sessionsCol()).find({ cohort_id: id }, { projection: { _id: 0 } }).sort({ starts_at: 1 }).limit(200).toArray(),
    (await assignmentsCol()).find({ cohort_id: id, ...(staff ? {} : { published: true }) }, { projection: { _id: 0 } }).sort({ due_at: 1 }).limit(100).toArray(),
    cohort.course_id ? db.collection('courses').findOne({ id: cohort.course_id }, { projection: { _id: 0, id: 1, title: 1, image: 1, level: 1 } }) : null,
  ])
  const member = !!me
  const now = Date.now()
  // The cohort's private forum category (members + staff), created on first visit.
  if (member || staff) void import('@/lib/community/service').then((m) => m.ensureCohortCategory(id, cohort.title)).catch(() => {})
  const out = {
    cohort: publicCohort(cohort),
    course,
    staff: team,
    my: me ? { role: me.role, status: me.status, certificate_id: me.certificate_id, joined_at: me.joined_at } : null,
    can_manage: admin,
    is_staff: staff,
    sessions: sessions.map((s) => ({ ...s, join_url: member || staff ? s.join_url : null, can_join: (member || staff) && canJoin(s, now) })),
    assignments: staff ? assignments : member ? assignments.map(learnerAssignment) : assignments.map((a) => ({ id: a.id, title: a.title, kind: a.kind, due_at: a.due_at })),
    progress: null as ReturnType<typeof learnerProgress> | null,
    submissions: [] as Array<Pick<SubmissionDoc, 'id' | 'assignment_id' | 'attempt' | 'submitted_at' | 'late' | 'status' | 'final_pct' | 'autograde'> & { feedback: string | null }>,
  }
  if (me?.role === 'learner') {
    out.progress = await progressFor(cohort, user.id, sessions, assignments)
    const subs = await (await submissionsCol()).find({ cohort_id: id, user_id: user.id }, { projection: { _id: 0, id: 1, assignment_id: 1, attempt: 1, submitted_at: 1, late: 1, status: 1, final_pct: 1, autograde: 1, grade: 1 } }).sort({ submitted_at: -1 }).limit(300).toArray()
    out.submissions = subs.map((s) => ({
      id: s.id, assignment_id: s.assignment_id, attempt: s.attempt, submitted_at: s.submitted_at, late: s.late, status: s.status, final_pct: s.final_pct,
      // Hidden test errors never reach the learner.
      autograde: s.autograde ? { ...s.autograde, cases: s.autograde.cases.map((c) => (c.hidden ? { passed: c.passed, hidden: true } : c)) } : null,
      feedback: s.grade?.feedback ?? null,
    }))
  }
  return out
}

async function progressFor(cohort: CohortDoc, userId: string, sessions?: CohortSessionDoc[], assignments?: AssignmentDoc[]) {
  const [ss, as, att, subs] = await Promise.all([
    sessions ?? (await sessionsCol()).find({ cohort_id: cohort.id }, { projection: { _id: 0 } }).limit(200).toArray(),
    assignments ?? (await assignmentsCol()).find({ cohort_id: cohort.id }, { projection: { _id: 0 } }).limit(100).toArray(),
    (await attendanceCol()).find({ cohort_id: cohort.id, user_id: userId }, { projection: { _id: 0, session_id: 1, status: 1 } }).limit(500).toArray(),
    (await submissionsCol()).find({ cohort_id: cohort.id, user_id: userId, final_pct: { $type: 'number' } } as never, { projection: { _id: 0, assignment_id: 1, final_pct: 1 } }).limit(1000).toArray(),
  ])
  const scores: Record<string, number> = {}
  for (const s of subs) scores[s.assignment_id] = Math.max(scores[s.assignment_id] ?? 0, s.final_pct as number)
  return learnerProgress({ rule: cohort.completion, sessions: ss, attendance: att, assignments: as, scores })
}

// ─── Enrolment ───────────────────────────────────────────────────────────────

async function paidOrderFor(userId: string, productId: string | null): Promise<string | null> {
  if (!productId) return null
  const { orders } = await import('@/lib/marketplace/order-doc')
  const o = await (await orders()).findOne(
    { buyer_id: userId, status: { $in: ['paid', 'partially_fulfilled', 'fulfilled', 'partially_refunded'] }, lines: { $elemMatch: { product_id: productId, 'fulfilment.status': { $nin: ['cancelled', 'returned'] } } } },
    { projection: { _id: 0, id: 1 } },
  )
  if (!o) return null
  // One seat per order: an order already used for this product elsewhere doesn't count twice.
  const used = await (await membersCol()).countDocuments({ order_id: o.id, user_id: { $ne: userId } }, { limit: 1 })
  return used ? null : o.id
}

export async function enrol(user: APIUser, id: string) {
  const cohort = await loadCohort(id)
  if (!visibleTo(user, cohort)) throw fail('Cohort not found', 404, 'cohort_not_found')
  const existing = await (await membersCol()).findOne({ cohort_id: id, user_id: user.id }, { projection: { _id: 0 } })
  if (existing && existing.status !== 'dropped') return { enrolled: true, source: existing.source }
  const [ent, lic, order] = await Promise.all([
    cohort.access.entitlement ? import('@/lib/entitlements').then(({ hasEntitlement }) => hasEntitlement(user, 'cohort_courses')).then((d) => d.allowed).catch(() => false) : false,
    cohort.access.licence_org_ids.length ? import('@/lib/billing/licences').then(({ licenceSeatFor }) => licenceSeatFor(user.id, user.email)).catch(() => null) : null,
    paidOrderFor(user.id, cohort.access.marketplace_product_id),
  ])
  const d = decideEnrolment(cohort, { entitled: ent, licenceOrgId: lic?.org_id ?? null, paidOrderId: order })
  if (!d.ok) {
    if (d.reason === 'payment_required') {
      const { productsCol } = await import('@/lib/marketplace/db')
      const p = d.product_id ? await (await productsCol()).findOne({ id: d.product_id }, { projection: { _id: 0, slug: 1 } }) : null
      return { enrolled: false, payment_required: true, product_slug: (p as { slug?: string } | null)?.slug ?? null }
    }
    if (d.reason === 'full') throw fail('This cohort is full.', 409, 'cohort_full')
    if (d.reason === 'closed') throw fail('Enrolment for this cohort is closed.', 409, 'cohort_closed')
    throw fail('This cohort is only open to invited learners.', 403, 'cohort_not_allowed')
  }
  // Seat first (atomic capacity check), then the member row; roll the seat back on a race.
  const seat = await (await cohortsCol()).findOneAndUpdate({ id, $expr: { $lt: ['$enrolled_count', '$capacity'] } }, { $inc: { enrolled_count: 1 } }, { returnDocument: 'after' })
  if (!seat) throw fail('This cohort is full.', 409, 'cohort_full')
  const now = nowIso()
  try {
    await (await membersCol()).updateOne(
      { cohort_id: id, user_id: user.id },
      { $set: { status: 'active', role: 'learner', source: d.source, order_id: d.source === 'order' ? order : null, joined_at: now, email: user.email, name: user.name || user.email.split('@')[0] }, $setOnInsert: { id: newId(), cohort_id: id, user_id: user.id, mentor_slug: null, completed_at: null, certificate_id: null } },
      { upsert: true },
    )
  } catch (e) {
    await (await cohortsCol()).updateOne({ id }, { $inc: { enrolled_count: -1 } })
    throw e
  }
  return { enrolled: true, source: d.source }
}

export async function leave(user: APIUser, id: string) {
  const r = await (await membersCol()).findOneAndUpdate({ cohort_id: id, user_id: user.id, role: 'learner', status: 'active' }, { $set: { status: 'dropped' } })
  if (r) await (await cohortsCol()).updateOne({ id, enrolled_count: { $gt: 0 } }, { $inc: { enrolled_count: -1 } })
  return { left: !!r }
}

/** Add a mentor / TA by email or mentor-marketplace slug (organisation admin). */
export async function addStaff(user: APIUser, id: string, raw: Doc) {
  const cohort = await loadCohort(id)
  if (!isCohortAdmin(user, cohort)) throw fail('Only organisation admins can manage cohort staff.', 403, 'cohort_admin_only')
  const role = raw.role === 'mentor' ? 'mentor' : raw.role === 'ta' ? 'ta' : null
  if (!role) throw fail('Pick mentor or TA.', 400, 'cohort_staff_role')
  const db = await getMongoDb()
  let userId: string | null = null
  let slug: string | null = null
  if (typeof raw.mentor_slug === 'string' && raw.mentor_slug.trim()) {
    const { mentorProfilesCol } = await import('@/lib/mentors/db')
    const m = await (await mentorProfilesCol()).findOne({ slug: raw.mentor_slug.trim().toLowerCase().slice(0, 80), status: 'verified' }, { projection: { _id: 0, user_id: 1, slug: 1 } })
    if (!m) throw fail('No verified mentor with that profile link.', 404, 'cohort_mentor_missing')
    userId = m.user_id
    slug = m.slug
  } else if (typeof raw.email === 'string') {
    const email = raw.email.trim().toLowerCase().slice(0, 200)
    const u = await db.collection('user').findOne({ email }, { projection: { _id: 1, id: 1 } })
    if (!u) throw fail('No account with that email. Ask them to sign up first.', 404, 'cohort_user_missing')
    userId = String(u.id || u._id)
  }
  if (!userId) throw fail('Enter an email or a mentor profile link.', 400, 'cohort_staff_who')
  const u = await db.collection('user').findOne({ $or: [{ id: userId }, { _id: userId as never }] }, { projection: { email: 1, name: 1 } })
  await (await membersCol()).updateOne(
    { cohort_id: id, user_id: userId },
    { $set: { role, status: 'active', mentor_slug: slug, source: 'staff', email: String(u?.email || ''), name: String(u?.name || u?.email || 'Mentor') }, $setOnInsert: { id: newId(), cohort_id: id, user_id: userId, order_id: null, joined_at: nowIso(), completed_at: null, certificate_id: null } },
    { upsert: true },
  )
  return { ok: true }
}

export async function removeStaff(user: APIUser, id: string, userId: string) {
  const cohort = await loadCohort(id)
  if (!isCohortAdmin(user, cohort)) throw fail('Only organisation admins can manage cohort staff.', 403, 'cohort_admin_only')
  await (await membersCol()).deleteOne({ cohort_id: id, user_id: userId, role: { $in: [...STAFF_ROLES] } })
  return { ok: true }
}

export async function roster(user: APIUser, id: string) {
  await staffGate(user, id)
  return (await membersCol()).find({ cohort_id: id, status: { $ne: 'dropped' } }, { projection: { _id: 0 } }).sort({ role: 1, name: 1 }).limit(5000).toArray()
}

// ─── Sessions ────────────────────────────────────────────────────────────────

const sessionId = (cohortId: string, startsAt: string) => `cs_${createHash('sha256').update(`${cohortId}:${startsAt}`).digest('hex').slice(0, 24)}`

async function createMeeting(cohort: CohortDoc, s: Pick<CohortSessionDoc, 'id' | 'title' | 'starts_at' | 'duration_min' | 'provider'>, attendees: { email: string; name?: string }[]): Promise<{ join_url: string | null; meeting_id: string | null }> {
  if (s.provider === 'livekit') return { join_url: null, meeting_id: null }
  if (s.provider === 'manual') return { join_url: cohort.schedule.manual_url, meeting_id: null }
  const tenant = cohort.tenant_id || 'platform'
  const { isConnected, providerContext } = await import('@/lib/ats/interviews/integrations')
  if (!(await isConnected(tenant, s.provider))) throw fail('Connect this meeting provider in Hiring settings → Integrations first, or use the built-in video.', 409, 'cohort_provider_not_connected')
  const { getMeetingProvider } = await import('@/lib/ats/interviews/providers')
  const r = await getMeetingProvider(s.provider).createMeeting(providerContext(tenant, s.provider), {
    interviewId: s.id, title: s.title, description: cohort.summary.slice(0, 1000), start: s.starts_at, durationMin: s.duration_min, timeZone: cohort.timezone,
    // Google / Microsoft send their own calendar invites to these attendees.
    attendees: attendees.slice(0, 250),
  })
  return { join_url: r.join_url, meeting_id: r.meeting_id }
}

async function learnerContacts(cohortId: string) {
  return (await membersCol()).find({ cohort_id: cohortId, status: 'active' }, { projection: { _id: 0, user_id: 1, email: 1, name: 1, role: 1 } }).limit(5000).toArray()
}

/** Email the cohort about new sessions, with the calendar (.ics) link, in each recipient's language. */
async function inviteToSessions(cohort: CohortDoc, sessions: CohortSessionDoc[]) {
  if (!sessions.length) return
  const people = await learnerContacts(cohort.id)
  const { sendAutomationEmail } = await import('@/lib/automation/mailer')
  const { localeForRecipient } = await import('@/lib/i18n/recipient')
  const { formatInZone } = await import('@/lib/ats/interviews/tz')
  const origin = getAppOrigin()
  const when = sessions.slice(0, 10).map((s) => `• ${s.title} — ${formatInZone(s.starts_at, cohort.timezone)}`).join('\n')
  for (const p of people) {
    if (!p.email) continue
    const locale = await localeForRecipient({ userId: p.user_id, email: p.email }).catch(() => 'en' as const)
    const t = await communityT(locale)
    await sendAutomationEmail({
      to: p.email, userId: p.user_id, category: 'events',
      onceKey: `cohort-invite:${cohort.id}:${sessions.map((s) => s.id).join(',').slice(0, 300)}:${p.user_id}`,
      subject: t('mailSessionsSubject', { title: cohort.title }),
      heading: t('mailSessionsHeading', { count: sessions.length }),
      bodyText: `${t('mailSessionsBody', { title: cohort.title })}\n\n${when}\n\n${t('mailSessionsCalendar')}: ${origin}/api/cohorts/${cohort.id}/calendar`,
      cta: { label: t('mailOpenCohort'), url: `${origin}/dashboard/cohorts/${cohort.id}` },
      reason: t('mailReasonCohort', { title: cohort.title }),
    }).catch(() => {})
  }
}

/** Create the weekly sessions (idempotent: same time → same session). */
export async function generateSessions(user: APIUser, id: string) {
  const { cohort } = await staffGate(user, id)
  const times = expandWeekly(cohort, cohort.schedule.weekly)
  if (!times.length) throw fail('Add weekly session times to the schedule first.', 400, 'cohort_no_schedule')
  const col = await sessionsCol()
  const existing = new Set((await col.find({ cohort_id: id }, { projection: { _id: 0, id: 1 } }).toArray()).map((s) => s.id))
  const people = await learnerContacts(id)
  const created: CohortSessionDoc[] = []
  let n = existing.size
  for (const t of times) {
    const sid = sessionId(id, t.starts_at)
    if (existing.has(sid)) continue
    n++
    const now = nowIso()
    const s: CohortSessionDoc = {
      id: sid, cohort_id: id, title: `${cohort.schedule.title_prefix || cohort.title} · ${n}`, starts_at: t.starts_at, duration_min: t.duration_min,
      provider: cohort.schedule.provider, join_url: null, meeting_id: null, status: 'scheduled', recording_url: null, created_at: now, updated_at: now,
    }
    Object.assign(s, await createMeeting(cohort, s, people.map((p) => ({ email: p.email, name: p.name }))))
    await col.updateOne({ id: sid }, { $setOnInsert: s }, { upsert: true })
    created.push(s)
  }
  void inviteToSessions(cohort, created).catch(() => {})
  return { created: created.length }
}

export async function addSession(user: APIUser, id: string, raw: Doc) {
  const { cohort } = await staffGate(user, id)
  const startsAt = typeof raw.starts_at === 'string' && Number.isFinite(Date.parse(raw.starts_at)) ? new Date(raw.starts_at).toISOString() : null
  const duration = Math.round(Number(raw.duration_min))
  if (!startsAt) throw fail('Pick a start time.', 400, 'cohort_session_time')
  if (!(duration >= 15 && duration <= 240)) throw fail('Sessions run 15 to 240 minutes.', 400, 'cohort_session_duration')
  const provider = (SESSION_PROVIDERS as readonly string[]).includes(String(raw.provider)) ? (raw.provider as MeetingProvider) : cohort.schedule.provider
  const title = String(raw.title || '').replace(/\s+/g, ' ').trim().slice(0, 140) || cohort.title
  const now = nowIso()
  const s: CohortSessionDoc = { id: sessionId(id, startsAt), cohort_id: id, title, starts_at: startsAt, duration_min: duration, provider, join_url: null, meeting_id: null, status: 'scheduled', recording_url: null, created_at: now, updated_at: now }
  if (provider === 'manual') {
    const u = typeof raw.join_url === 'string' ? raw.join_url.trim() : ''
    if (!/^https:\/\/[^\s<>"']{4,500}$/i.test(u)) throw fail('Paste the https:// meeting link.', 400, 'cohort_session_link')
    s.join_url = u
  } else {
    Object.assign(s, await createMeeting(cohort, s, (await learnerContacts(id)).map((p) => ({ email: p.email, name: p.name }))))
  }
  const r = await (await sessionsCol()).updateOne({ id: s.id }, { $setOnInsert: s }, { upsert: true })
  if (!r.upsertedCount) throw fail('There is already a session at that time.', 409, 'cohort_session_exists')
  void inviteToSessions(cohort, [s]).catch(() => {})
  return s
}

export async function updateSession(user: APIUser, id: string, sid: string, raw: Doc) {
  await staffGate(user, id)
  const set: Partial<CohortSessionDoc> = { updated_at: nowIso() }
  if (raw.status === 'cancelled' || raw.status === 'scheduled') set.status = raw.status
  if (typeof raw.recording_url === 'string') {
    const u = raw.recording_url.trim()
    if (u && !/^https:\/\/[^\s<>"']{4,500}$/i.test(u)) throw fail('Use an https:// link.', 400, 'cohort_session_link')
    set.recording_url = u || null
  }
  const r = await (await sessionsCol()).findOneAndUpdate({ id: sid, cohort_id: id }, { $set: set }, { returnDocument: 'after', projection: { _id: 0 } })
  if (!r) throw fail('Session not found', 404, 'cohort_session_missing')
  return r
}

/** Learner or staff joins: attendance is recorded from the join (never downgraded). */
export async function joinSession(user: APIUser, id: string, sid: string) {
  const cohort = await loadCohort(id)
  const me = await membership(id, user.id)
  const admin = isCohortAdmin(user, cohort)
  if (!me && !admin) throw fail('Enrol in the cohort to join its sessions.', 403, 'cohort_members_only')
  const s = await (await sessionsCol()).findOne({ id: sid, cohort_id: id }, { projection: { _id: 0 } })
  if (!s) throw fail('Session not found', 404, 'cohort_session_missing')
  const now = Date.now()
  if (!canJoin(s, now)) throw fail('The room opens 15 minutes before the session starts.', 409, 'cohort_session_not_open')
  if (me?.role === 'learner') {
    const status = joinAttendance(s.starts_at, now)
    const col = await attendanceCol()
    await col.updateOne({ session_id: sid, user_id: user.id }, { $setOnInsert: { id: newId(), cohort_id: id, session_id: sid, user_id: user.id, status, source: 'join', at: new Date(now).toISOString() } }, { upsert: true })
    // An absent mark set before the learner arrived turns into late.
    await col.updateOne({ session_id: sid, user_id: user.id, status: 'absent' }, { $set: { status: 'late', source: 'join', at: new Date(now).toISOString() } })
  }
  if (s.provider !== 'livekit') {
    if (!s.join_url) throw fail('The meeting link isn’t ready yet. Ask your mentor.', 409, 'cohort_session_no_link')
    return { join_url: s.join_url }
  }
  const { livekitConfig, mintLivekitToken, LIVEKIT_NOT_CONFIGURED } = await import('@/lib/ats/interviews/livekit')
  const cfg = await livekitConfig()
  if (!cfg) throw fail(LIVEKIT_NOT_CONFIGURED, 503, 'cohort_video_off')
  const ttl = Math.max(600, Math.ceil((Date.parse(s.starts_at) + s.duration_min * 60_000 + 30 * 60_000 - now) / 1000))
  const role = admin && !me ? 'staff' : me!.role
  const token = await mintLivekitToken(cfg, `cohort-${sid}`, `${role}:${user.id}`, (user.name || user.email.split('@')[0]).slice(0, 100), Math.min(ttl, 5 * 3600))
  return { token, url: cfg.url, title: s.title }
}

export async function sessionAttendance(user: APIUser, id: string, sid: string) {
  await staffGate(user, id)
  const [learners, rows] = await Promise.all([
    (await membersCol()).find({ cohort_id: id, role: 'learner', status: { $ne: 'dropped' } }, { projection: { _id: 0, user_id: 1, name: 1, email: 1 } }).limit(5000).toArray(),
    (await attendanceCol()).find({ session_id: sid }, { projection: { _id: 0, user_id: 1, status: 1, source: 1 } }).limit(5000).toArray(),
  ])
  const by = new Map(rows.map((r) => [r.user_id, r]))
  return learners.map((l) => ({ ...l, status: by.get(l.user_id)?.status ?? null, source: by.get(l.user_id)?.source ?? null }))
}

export async function setAttendance(user: APIUser, id: string, sid: string, raw: unknown) {
  await staffGate(user, id)
  const s = await (await sessionsCol()).findOne({ id: sid, cohort_id: id }, { projection: { _id: 0, id: 1 } })
  if (!s) throw fail('Session not found', 404, 'cohort_session_missing')
  const entries = Array.isArray(raw) ? raw.slice(0, 5000) : []
  const ok = new Set<AttendanceStatus>(['present', 'late', 'absent', 'excused'])
  const learners = new Set((await (await membersCol()).find({ cohort_id: id, role: 'learner' }, { projection: { _id: 0, user_id: 1 } }).toArray()).map((m) => m.user_id))
  const col = await attendanceCol()
  let n = 0
  for (const e of entries as Doc[]) {
    const uid = String(e?.user_id || '')
    const status = e?.status as AttendanceStatus
    if (!learners.has(uid) || !ok.has(status)) continue
    await col.updateOne({ session_id: sid, user_id: uid }, { $set: { status, source: 'staff', at: nowIso() }, $setOnInsert: { id: newId(), cohort_id: id, session_id: sid, user_id: uid } }, { upsert: true })
    n++
  }
  return { updated: n }
}

/** All scheduled sessions of a cohort as an .ics calendar (members and staff). */
export async function cohortCalendar(user: APIUser, id: string): Promise<string> {
  const cohort = await loadCohort(id)
  if (!(await membership(id, user.id)) && !isCohortAdmin(user, cohort)) throw fail('Enrol in the cohort to join its sessions.', 403, 'cohort_members_only')
  const sessions = await (await sessionsCol()).find({ cohort_id: id, status: 'scheduled' }, { projection: { _id: 0 } }).sort({ starts_at: 1 }).limit(200).toArray()
  const { buildIcs } = await import('@/lib/calendar/ics')
  const url = `${getAppOrigin()}/dashboard/cohorts/${id}`
  return buildIcs(sessions.map((s) => ({ title: s.title, start: s.starts_at, end: new Date(Date.parse(s.starts_at) + s.duration_min * 60_000).toISOString(), url, location: s.join_url || url, description: cohort.title, uid: `${s.id}@codespectra.ai` })), cohort.title)
}

// ─── Assignments ─────────────────────────────────────────────────────────────

export async function saveAssignment(user: APIUser, id: string, raw: unknown, assignmentId?: string) {
  await staffGate(user, id)
  const r = AssignmentInputSchema.safeParse(raw)
  if (!r.success) throw fail(firstIssue(r.error), 400, 'cohort_invalid', { detail: firstIssue(r.error) })
  let norm
  try { norm = normaliseAssignment(r.data) } catch (e) { throw fail((e as Error).message, 400, 'cohort_invalid', { detail: (e as Error).message }) }
  const col = await assignmentsCol()
  const now = nowIso()
  if (assignmentId) {
    const after = await col.findOneAndUpdate({ id: assignmentId, cohort_id: id }, { $set: { ...norm, updated_at: now } }, { returnDocument: 'after', projection: { _id: 0 } })
    if (!after) throw fail('Assignment not found', 404, 'cohort_assignment_missing')
    return after
  }
  const doc: AssignmentDoc = { id: `as_${randomBytes(9).toString('hex')}`, cohort_id: id, ...norm, created_by: user.id, created_at: now, updated_at: now }
  await col.insertOne(doc)
  return doc
}

async function submitGate(user: APIUser, id: string, aid: string, kind: 'code' | 'file') {
  const me = await membership(id, user.id)
  if (!me || me.role !== 'learner' || me.status !== 'active') throw fail('Enrol in the cohort to submit work.', 403, 'cohort_members_only')
  const a = await (await assignmentsCol()).findOne({ id: aid, cohort_id: id, published: true }, { projection: { _id: 0 } })
  if (!a) throw fail('Assignment not found', 404, 'cohort_assignment_missing')
  if (a.kind !== kind) throw fail('This assignment takes a different kind of submission.', 400, 'cohort_wrong_kind')
  const state = deadlineState(a, Date.now())
  if (state === 'closed') throw fail('The deadline for this assignment has passed.', 409, 'cohort_deadline_passed')
  const attempts = await (await submissionsCol()).countDocuments({ assignment_id: aid, user_id: user.id })
  if (attempts >= MAX_ATTEMPTS) throw fail('You have used every attempt for this assignment.', 409, 'cohort_attempts_used', { max: MAX_ATTEMPTS })
  return { a, late: state === 'late', attempt: attempts + 1 }
}

/** Code submission: run the assignment's tests in the shared sandbox (Piston). */
export async function submitCode(user: APIUser, id: string, aid: string, raw: Doc) {
  const { a, late, attempt } = await submitGate(user, id, aid, 'code')
  const code = typeof raw.code === 'string' ? raw.code : ''
  if (!code.trim()) throw fail('Write some code first.', 400, 'cohort_empty_code')
  if (code.length > 50_000) throw fail('Code must be under 50,000 characters.', 413, 'cohort_code_too_long')
  const language = a.language || 'python'
  const { runCodeathonCode, outputsMatch } = await import('@/lib/codeathon-run')
  const cases: { passed: boolean; hidden: boolean; error?: string }[] = []
  for (const t of a.tests) {
    const r = await runCodeathonCode(code, language, t.input)
    const passed = r.exitCode === 0 && outputsMatch(r.output, t.output)
    cases.push({ passed, hidden: !!t.hidden, ...(passed ? {} : { error: (r.error || '').slice(0, 300) }) })
  }
  const autograde = a.tests.length ? autogradeResult(cases) : null
  const sub: SubmissionDoc = {
    id: newId(), assignment_id: aid, cohort_id: id, user_id: user.id, user_name: user.name || user.email.split('@')[0], attempt, kind: 'code', code, language, file: null,
    submitted_at: nowIso(), late, autograde, status: 'submitted', grade: null, final_pct: null,
  }
  sub.final_pct = finalScore(a, sub)
  if (sub.final_pct !== null && !needsTaGrade(a, sub)) sub.status = 'graded'
  await (await submissionsCol()).insertOne(sub)
  if (sub.status === 'graded') void maybeComplete(id, user.id)
  return { id: sub.id, autograde: sub.autograde ? { ...sub.autograde, cases: sub.autograde.cases.map((c) => (c.hidden ? { passed: c.passed, hidden: true } : c)) } : null, final_pct: sub.final_pct, late, status: sub.status }
}

const FILE_KIND_TYPES: Record<string, string> = { pdf: 'application/pdf', zip: 'application/zip', text: 'text/plain' }

/** File submission: magic bytes, size and malware scan, then lib/storage. */
export async function submitFile(user: APIUser, id: string, aid: string, file: { name: string; bytes: Buffer }) {
  const { a, late, attempt } = await submitGate(user, id, aid, 'file')
  if (file.bytes.length <= 0) throw fail('This file is empty.', 400, 'file_empty')
  if (file.bytes.length > FILE_MAX_BYTES) throw fail('Files must be under 10 MB.', 413, 'cohort_file_too_big', { mb: 10 })
  const name = (String(file.name || 'file').split(/[\\/]/).pop() || 'file').replace(/[\u0000-\u001f"<>|:*?]/g, '_').slice(0, 200)
  const { uploadKindForName } = await import('@/lib/question-extensions')
  const kind = uploadKindForName(name, a.file_types as never)
  if (!kind) throw fail('This file type is not allowed for this assignment.', 400, 'cohort_file_type')
  const { sniffAnswerFile } = await import('@/lib/upload-sniff')
  if (!sniffAnswerFile(new Uint8Array(file.bytes), kind as never)) throw fail('The file content does not match its type. Save it again in the right format and retry.', 400, 'file_content_mismatch')
  const { scanBuffer } = await import('@/lib/storage/scan')
  const scan = await scanBuffer(file.bytes, name)
  if (scan === 'infected') throw fail('The security scanner rejected this file.', 400, 'scanner_rejected')
  const cohort = await loadCohort(id)
  const contentType = FILE_KIND_TYPES[kind] || 'application/octet-stream'
  const { putBlob } = await import('@/lib/storage/blobs')
  const blob = await putBlob({ feature: 'cohort', tenantId: cohort.tenant_id, bytes: file.bytes, contentType })
  const sub: SubmissionDoc = {
    id: newId(), assignment_id: aid, cohort_id: id, user_id: user.id, user_name: user.name || user.email.split('@')[0], attempt, kind: 'file', code: null, language: null,
    file: { id: newId(), name, size: file.bytes.length, type: kind, scan, content_type: contentType, ...blob },
    submitted_at: nowIso(), late, autograde: null, status: 'submitted', grade: null, final_pct: null,
  }
  await (await submissionsCol()).insertOne(sub)
  return { id: sub.id, late, status: sub.status }
}

/** Short-lived download for the learner who uploaded it or the cohort's staff. */
export async function submissionFile(user: APIUser, subId: string): Promise<{ url: string } | { bytes: Buffer; name: string; type: string }> {
  const s = await (await submissionsCol()).findOne({ id: subId }, { projection: { _id: 0 } })
  if (!s?.file) throw fail('File not found', 404, 'cohort_file_missing')
  if (s.user_id !== user.id) await staffGate(user, s.cohort_id)
  const ref = { storage: s.file.storage, s3_key: s.file.s3_key, data: s.file.data } as import('@/lib/storage/blobs').BlobRef
  const { blobDownloadUrl, readBlob } = await import('@/lib/storage/blobs')
  const url = await blobDownloadUrl(ref, s.file.name, s.file.content_type)
  if (url) return { url }
  const bytes = await readBlob(ref)
  if (!bytes) throw fail('File not found', 404, 'cohort_file_missing')
  return { bytes, name: s.file.name, type: s.file.content_type }
}

/** TA grading queue: latest attempt per learner that still needs a rubric grade, oldest first. */
export async function gradingQueue(user: APIUser) {
  const staffOf = (await (await membersCol()).find({ user_id: user.id, role: { $in: [...STAFF_ROLES] }, status: 'active' }, { projection: { _id: 0, cohort_id: 1 } }).limit(200).toArray()).map((m) => m.cohort_id)
  const adminOf = user.role === 'superadmin'
    ? null
    : user.role === 'tenant_admin' && user.tenantId ? (await (await cohortsCol()).find({ tenant_id: user.tenantId }, { projection: { _id: 0, id: 1 } }).limit(500).toArray()).map((c) => c.id) : []
  const scope = adminOf === null ? {} : { cohort_id: { $in: [...new Set([...staffOf, ...adminOf])] } }
  const subs = await (await submissionsCol()).find({ ...scope, status: 'submitted' }, { projection: { _id: 0, code: 0, 'file.data': 0 } }).sort({ submitted_at: 1 }).limit(500).toArray()
  const latest = new Map<string, SubmissionDoc>()
  for (const s of subs) {
    const k = `${s.assignment_id}:${s.user_id}`
    const cur = latest.get(k)
    if (!cur || s.attempt > cur.attempt) latest.set(k, s)
  }
  const list = [...latest.values()]
  const [as, cs] = await Promise.all([
    (await assignmentsCol()).find({ id: { $in: [...new Set(list.map((s) => s.assignment_id))] } }, { projection: { _id: 0, id: 1, title: 1, rubric: 1, kind: 1, due_at: 1, max_points: 1, autograde_weight_pct: 1, late_penalty_pct: 1 } }).toArray(),
    (await cohortsCol()).find({ id: { $in: [...new Set(list.map((s) => s.cohort_id))] } }, { projection: { _id: 0, id: 1, title: 1 } }).toArray(),
  ])
  const aMap = new Map(as.map((a) => [a.id, a]))
  const cMap = new Map(cs.map((c) => [c.id, c]))
  return list.filter((s) => aMap.has(s.assignment_id)).map((s) => ({ ...s, assignment: aMap.get(s.assignment_id)!, cohort_title: cMap.get(s.cohort_id)?.title ?? '' }))
}

export async function submissionForGrading(user: APIUser, subId: string) {
  const s = await (await submissionsCol()).findOne({ id: subId }, { projection: { _id: 0, 'file.data': 0 } })
  if (!s) throw fail('Submission not found', 404, 'cohort_submission_missing')
  await staffGate(user, s.cohort_id)
  const a = await (await assignmentsCol()).findOne({ id: s.assignment_id }, { projection: { _id: 0 } })
  return { submission: s, assignment: a }
}

export async function gradeSubmission(user: APIUser, subId: string, raw: Doc) {
  const s = await (await submissionsCol()).findOne({ id: subId }, { projection: { _id: 0 } })
  if (!s) throw fail('Submission not found', 404, 'cohort_submission_missing')
  await staffGate(user, s.cohort_id)
  const a = await (await assignmentsCol()).findOne({ id: s.assignment_id }, { projection: { _id: 0 } })
  if (!a) throw fail('Assignment not found', 404, 'cohort_assignment_missing')
  const r = cleanRubricScores(a.rubric, raw.rubric)
  if (!r.ok) throw fail(r.error, 400, 'cohort_rubric_invalid', { detail: r.error })
  const feedback = typeof raw.feedback === 'string' ? raw.feedback.replace(/\r\n/g, '\n').trim().slice(0, 5000) : ''
  const grade = { rubric: r.scores, points: r.points, max_points: r.max, feedback, graded_by: user.id, graded_at: nowIso() }
  const final_pct = finalScore(a, { autograde: s.autograde, grade, late: s.late })
  await (await submissionsCol()).updateOne({ id: subId }, { $set: { grade, final_pct, status: 'graded' } })
  const { notifyLocalized } = await import('@/lib/community/i18n-server')
  void notifyLocalized(s.user_id, { type: 'cohort.graded', titleKey: 'notifyGradedTitle', messageKey: 'notifyGradedMessage', params: { title: a.title, score: final_pct ?? 0 }, link: `/dashboard/cohorts/${s.cohort_id}`, icon: 'check-circle' })
  void maybeComplete(s.cohort_id, s.user_id)
  return { final_pct }
}

// ─── Completion ──────────────────────────────────────────────────────────────

/** Issue the certificate once a learner meets the completion rule after the cohort's last session. */
async function maybeComplete(cohortId: string, userId: string) {
  try {
    const cohort = await loadCohort(cohortId)
    if (cohort.status !== 'completed' && Date.parse(cohort.ends_at) > Date.now()) return
    await certifyLearner(cohort, userId)
  } catch (e) {
    console.error('[cohorts] completion check failed', (e as Error)?.message)
  }
}

async function certifyLearner(cohort: CohortDoc, userId: string): Promise<boolean> {
  const m = await membership(cohort.id, userId)
  if (!m || m.role !== 'learner' || m.certificate_id) return false
  const p = await progressFor(cohort, userId)
  if (!p.eligible) return false
  const cert = {
    id: newId(), cohort_id: cohort.id, user_id: userId, title: cohort.title, skills: cohort.skills, score: p.assignment_pct,
    verify_token: randomBytes(16).toString('hex'), issued_at: nowIso(),
  }
  const r = await (await certificatesCol()).updateOne({ cohort_id: cohort.id, user_id: userId }, { $setOnInsert: cert }, { upsert: true })
  if (!r.upsertedCount) return false
  await (await membersCol()).updateOne({ cohort_id: cohort.id, user_id: userId }, { $set: { status: 'completed', completed_at: cert.issued_at, certificate_id: cert.id } })
  const { awardXpWithLevelUp } = await import('@/lib/xp-service')
  await awardXpWithLevelUp({ userId, amount: COHORT_COMPLETION_XP, reason: 'cohort_completed', submissionId: `cohort:${cohort.id}`, metadata: { cohort_id: cohort.id }, quiet: true }).catch(() => {})
  const { notifyLocalized } = await import('@/lib/community/i18n-server')
  await notifyLocalized(userId, { type: 'certificate.issued', titleKey: 'notifyCertTitle', messageKey: 'notifyCertMessage', params: { title: cohort.title }, link: '/dashboard/passport', icon: 'award', email: true })
  // The skill passport reads `cohort_certificates` (lib/passport/db loadEvidence).
  const { passports } = await import('@/lib/passport/db')
  const pp = await (await passports()).findOne({ user_id: userId }, { projection: { _id: 0, handle: 1 } }).catch(() => null)
  if (pp?.handle) await import('@/lib/cache/passport').then(({ revalidatePassport }) => revalidatePassport(pp.handle)).catch(() => {})
  return true
}

export async function issueCertificates(user: APIUser, id: string) {
  const cohort = await loadCohort(id)
  if (!isCohortAdmin(user, cohort)) {
    const m = await membership(id, user.id)
    if (!m || m.role !== 'mentor') throw fail('Only the cohort’s mentors and admins can issue certificates.', 403, 'cohort_cert_staff')
  }
  const learners = await (await membersCol()).find({ cohort_id: id, role: 'learner', status: 'active' }, { projection: { _id: 0, user_id: 1 } }).limit(5000).toArray()
  let issued = 0
  for (const l of learners) if (await certifyLearner(cohort, l.user_id)) issued++
  return { issued, checked: learners.length }
}
