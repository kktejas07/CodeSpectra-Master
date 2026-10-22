/**
 * Live proctored hiring drives — server logic (routes call these). Access:
 *   owner        superadmin; the college's placement team (college drives);
 *                ATS admins / recruiters of the company (company drives)
 *   invigilator  an account the owner listed; sees and acts on their groups only
 *   candidate    on the roster; only ever reads / writes their own row
 * Every invigilator action is written to live_drive_actions (terminate also
 * to the admin audit log). Integrity signals reuse lib/integrity (kind 'drive').
 */
import 'server-only'
import type { AnyBulkWriteOperation } from 'mongodb'
import type { APIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { newId, nowIso } from '@/lib/db/ids'
import { logger } from '@/lib/logger'
import { getPattern } from '@/lib/company-tests/db'
import { attemptKey } from '@/lib/integrity/store'
import { EVENT_TYPES, needsCamera, type IntegrityEventType } from '@/lib/integrity/types'
import { buildPaper, loadPaper, paperQuestionIds, PaperError, publicPaper, scoreCandidate } from './paper'
import { actionsCol, candidatesCol, drivesCol, integrityEventsCol } from './store'
import {
  assignGroups, canActOn, cleanAnswerPatch, countByStatus, createDriveSchema, DEFAULT_RULES, deadlineMs, effectiveStatus,
  firstIssue, gridStatus, invigilatorsSchema, isReconnect, joinWindow, MAX_BROADCASTS, MAX_INBOX, MAX_ROSTER,
  reconnectAllowed, remainingMs, rosterSchema, shouldWriteHeartbeat, SUBMIT_GRACE_MS, systemVerdict, timeUp, updateDriveSchema,
  actionSchema, broadcastSchema, resultsSchema, sessionSchema,
  type DriveRole, type GridStatus, type InboxItem, type LiveCandidateDoc, type LiveDriveDoc,
} from './types'

export class LiveDriveError extends Error {
  constructor(message: string, public status = 400, public code?: string, public params?: Record<string, string | number>) { super(message) }
}

const err = (message: string, status = 400, code?: string, params?: Record<string, string | number>) => new LiveDriveError(message, status, code, params)
const CHUNK = 500
const SCORE_BATCH = 25

// ─── Access ─────────────────────────────────────────────────────────────────

async function canOwn(user: APIUser, owner: LiveDriveDoc['owner']): Promise<boolean> {
  if (user.role === 'superadmin') return true
  if (owner.kind === 'college') {
    const { collegesCol } = await import('@/lib/campus/store')
    const { campusRoleFor } = await import('@/lib/campus/access')
    const college = await (await collegesCol()).findOne({ tenant_id: owner.tenant_id }, { projection: { _id: 0, tenant_id: 1, staff: 1 } })
    return !!college && !!campusRoleFor(user, college)
  }
  const { resolveActorFor } = await import('@/lib/ats/access')
  const actor = await resolveActorFor(user, owner.tenant_id)
  return !!actor && actor.tenantId === owner.tenant_id && (actor.role === 'admin' || actor.role === 'recruiter')
}

export async function loadForStaff(user: APIUser, id: string): Promise<{ drive: LiveDriveDoc; role: DriveRole }> {
  const drive = await (await drivesCol()).findOne({ id }, { projection: { _id: 0 } })
  if (!drive) throw err('Live drive not found', 404, 'ld_not_found')
  if (await canOwn(user, drive.owner)) return { drive, role: 'owner' }
  if (drive.invigilators.some((i) => i.user_id === user.id)) return { drive, role: 'invigilator' }
  throw err('Live drive not found', 404, 'ld_not_found')
}

async function loadAsOwner(user: APIUser, id: string): Promise<LiveDriveDoc> {
  const { drive, role } = await loadForStaff(user, id)
  if (role !== 'owner') throw err('Only the drive organisers can do this.', 403, 'ld_owner_only')
  return drive
}

/** Organisations the user may run drives for (for the create form and the list). */
export async function ownerChoices(user: APIUser): Promise<Array<{ kind: 'college' | 'company'; tenant_id: string; name: string }>> {
  const out: Array<{ kind: 'college' | 'company'; tenant_id: string; name: string }> = []
  try {
    const { loadStaffContext } = await import('@/lib/campus/access')
    const ctx = await loadStaffContext(user, null)
    if (ctx) out.push({ kind: 'college', tenant_id: ctx.college.tenant_id, name: ctx.college.name })
  } catch (e) { logger.warn('[live-drives] campus lookup failed', (e as Error).message) }
  try {
    const { listMyMemberships } = await import('@/lib/ats/access')
    for (const m of await listMyMemberships(user)) {
      if ((m.role === 'admin' || m.role === 'recruiter') && !out.some((o) => o.kind === 'company' && o.tenant_id === m.tenant_id)) {
        out.push({ kind: 'company', tenant_id: m.tenant_id, name: m.tenant_name || m.tenant_id })
      }
    }
  } catch (e) { logger.warn('[live-drives] ats lookup failed', (e as Error).message) }
  return out
}

// ─── Drives ─────────────────────────────────────────────────────────────────

export function staffDriveView(d: LiveDriveDoc, role: DriveRole, now = Date.now()) {
  return { ...d, role, effective_status: effectiveStatus(d, now), server_now: new Date(now).toISOString() }
}

export async function listDrivesForStaff(user: APIUser) {
  const choices = await ownerChoices(user)
  const col = await drivesCol()
  const projection = { _id: 0, broadcasts: 0 } as const
  const owned = user.role === 'superadmin'
    ? await col.find({}, { projection }).sort({ 'schedule.start_at': -1 }).limit(100).toArray()
    : choices.length
      ? await col.find({ $or: choices.map((c) => ({ 'owner.kind': c.kind, 'owner.tenant_id': c.tenant_id })) }, { projection }).sort({ 'schedule.start_at': -1 }).limit(200).toArray()
      : []
  const ownedIds = new Set(owned.map((d) => d.id))
  const invigilating = (await col.find({ 'invigilators.user_id': user.id }, { projection }).sort({ 'schedule.start_at': -1 }).limit(100).toArray()).filter((d) => !ownedIds.has(d.id))
  const now = Date.now()
  return {
    choices,
    drives: [
      ...owned.map((d) => staffDriveView(d as LiveDriveDoc, 'owner', now)),
      ...invigilating.map((d) => staffDriveView(d as LiveDriveDoc, 'invigilator', now)),
    ],
  }
}

export async function createDrive(user: APIUser, raw: unknown): Promise<LiveDriveDoc> {
  const p = createDriveSchema.safeParse(raw)
  if (!p.success) throw err(firstIssue(p.error), 400, 'ld_invalid_input')
  const i = p.data
  let owner: LiveDriveDoc['owner']
  const links = { campus_drive_id: null as string | null, ats_job_id: null as string | null }
  if (i.owner_kind === 'college') {
    const { loadStaffContext } = await import('@/lib/campus/access')
    const ctx = await loadStaffContext(user, i.tenant_id ?? null)
    if (!ctx) throw err('You are not on a college placement team.', 403, 'campus_not_staff')
    owner = { kind: 'college', tenant_id: ctx.college.tenant_id, name: ctx.college.name }
    if (i.campus_drive_id) {
      const { drivesCol: campusDrives } = await import('@/lib/campus/store')
      const cd = await (await campusDrives()).findOne({ id: i.campus_drive_id, college_id: owner.tenant_id }, { projection: { _id: 0, id: 1 } })
      if (!cd) throw err('That placement drive is not in your college.', 400, 'ld_campus_drive_missing')
      links.campus_drive_id = cd.id
    }
  } else {
    const { resolveActorFor } = await import('@/lib/ats/access')
    const actor = await resolveActorFor(user, i.tenant_id)
    if (!actor || (actor.role !== 'admin' && actor.role !== 'recruiter')) throw err('Only hiring admins and recruiters can run a drive.', 403, 'ld_hiring_role')
    const db = await getMongoDb()
    const tenant = await db.collection('tenants').findOne({ id: actor.tenantId }, { projection: { _id: 0, name: 1 } })
    owner = { kind: 'company', tenant_id: actor.tenantId, name: String(tenant?.name || 'Company').slice(0, 160) }
    if (i.ats_job_id) {
      const { atsJobs } = await import('@/lib/ats/db')
      const job = await (await atsJobs()).findOne({ id: i.ats_job_id, tenant_id: actor.tenantId }, { projection: { _id: 0, id: 1 } })
      if (!job) throw err('That job is not in your organisation.', 400, 'ld_job_missing')
      links.ats_job_id = job.id
    }
  }
  const pattern = await getPattern(i.pattern_id)
  if (!pattern || !pattern.active) throw err('That company test is not available.', 409, 'campus_test_unavailable')
  const now = nowIso()
  const doc: LiveDriveDoc = {
    id: newId(), title: i.title, owner, links,
    test: { pattern_id: pattern.id, level: i.level, exam_name: pattern.examName, company_name: pattern.companyName },
    schedule: { ...i.schedule, start_at: new Date(i.schedule.start_at).toISOString() },
    rules: { ...DEFAULT_RULES, ...stripUndef(i.rules) },
    status: 'draft', invigilators: [], broadcasts: [], candidate_count: 0, paper_built_at: null,
    results: { scored_at: null, published_at: null, published_count: 0 },
    created_by: user.id, created_at: now, updated_at: now,
  }
  await (await drivesCol()).insertOne({ ...doc })
  return doc
}

function stripUndef<T extends object>(o: T | undefined): Partial<T> {
  return o ? (Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>) : {}
}

export async function updateDrive(user: APIUser, id: string, raw: unknown): Promise<LiveDriveDoc> {
  const drive = await loadAsOwner(user, id)
  const p = updateDriveSchema.safeParse(raw)
  if (!p.success) throw err(firstIssue(p.error), 400, 'ld_invalid_input')
  const i = p.data
  const now = Date.now()
  const eff = effectiveStatus(drive, now)
  const set: Record<string, unknown> = { updated_at: nowIso() }
  if (i.title) set.title = i.title
  if (i.rules) set.rules = { ...drive.rules, ...stripUndef(i.rules) }
  if (i.schedule) {
    if (eff === 'live' || eff === 'ended') throw err('The schedule cannot change once the drive has started.', 409, 'ld_schedule_locked')
    set.schedule = { ...i.schedule, start_at: new Date(i.schedule.start_at).toISOString() }
  }
  if (i.status && i.status !== drive.status) {
    if (i.status === 'scheduled') {
      const start = Date.parse(String((set.schedule as LiveDriveDoc['schedule'] | undefined)?.start_at ?? drive.schedule.start_at))
      if (start < now - 60_000) throw err('Pick a start time in the future first.', 400, 'ld_start_in_past')
      const paper = await buildPaper(drive.id, drive.test.pattern_id, drive.test.level)
      set.paper_built_at = paper.built_at
    } else if (i.status === 'draft') {
      const started = await (await candidatesCol()).countDocuments({ drive_id: id, state: { $ne: 'not_started' } })
      if (started > 0 || eff === 'live') throw err('Candidates have started; end the drive instead.', 409, 'ld_already_started')
    }
    set.status = i.status
  }
  const col = await drivesCol()
  await col.updateOne({ id }, { $set: set })
  await logAction(drive.id, null, user.id, 'drive_update', null, { fields: Object.keys(set).filter((k) => k !== 'updated_at') })
  return (await col.findOne({ id }, { projection: { _id: 0 } }))!
}

// ─── Roster + invigilators ──────────────────────────────────────────────────

interface Person { user_id: string; email: string; name: string }

async function usersByIds(ids: string[]): Promise<Person[]> {
  if (!ids.length) return []
  const db = await getMongoDb()
  const rows = await db.collection('user').find({ id: { $in: ids } }, { projection: { _id: 0, id: 1, email: 1, name: 1, fullName: 1 } }).toArray()
  return rows.map((u) => ({ user_id: String(u.id), email: String(u.email || '').toLowerCase(), name: String(u.fullName || u.name || u.email || 'Candidate').slice(0, 120) }))
}

async function usersByEmails(emails: string[]): Promise<{ found: Person[]; missing: string[] }> {
  const want = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))]
  if (!want.length) return { found: [], missing: [] }
  const db = await getMongoDb()
  const rows = await db.collection('user').find({ email: { $in: want } }, { projection: { _id: 0, id: 1, email: 1, name: 1, fullName: 1 } }).toArray()
  const found = rows.filter((u) => u.id).map((u) => ({ user_id: String(u.id), email: String(u.email).toLowerCase(), name: String(u.fullName || u.name || u.email).slice(0, 120) }))
  const have = new Set(found.map((f) => f.email))
  return { found, missing: want.filter((e) => !have.has(e)) }
}

export async function importRoster(user: APIUser, id: string, raw: unknown) {
  const drive = await loadAsOwner(user, id)
  if (drive.status === 'ended') throw err('This drive has ended.', 409, 'ld_ended')
  const p = rosterSchema.safeParse(raw)
  if (!p.success) throw err(firstIssue(p.error), 400, 'ld_invalid_input')
  let people: Person[] = []
  let missing: string[] = []
  let source: LiveCandidateDoc['source'] = 'manual'
  if (p.data.source === 'campus') {
    if (!drive.links.campus_drive_id) throw err('Link a placement drive first.', 400, 'ld_no_campus_link')
    const { applicationsCol } = await import('@/lib/campus/store')
    const apps = await (await applicationsCol()).find({ drive_id: drive.links.campus_drive_id, college_id: drive.owner.tenant_id, status: { $in: ['applied', 'shortlisted', 'in_process'] } }, { projection: { _id: 0, user_id: 1 } }).limit(MAX_ROSTER).toArray()
    people = await usersByIds(apps.map((a) => a.user_id).filter(Boolean))
    source = 'campus'
  } else if (p.data.source === 'ats') {
    if (!drive.links.ats_job_id) throw err('Link a job first.', 400, 'ld_no_job_link')
    const { atsApplications, atsCandidates } = await import('@/lib/ats/db')
    const apps = await (await atsApplications()).find({ tenant_id: drive.owner.tenant_id, job_id: drive.links.ats_job_id, status: 'active' } as never, { projection: { _id: 0, candidate_id: 1 } }).limit(MAX_ROSTER).toArray()
    const cands = await (await atsCandidates()).find({ tenant_id: drive.owner.tenant_id, id: { $in: apps.map((a) => a.candidate_id) }, user_id: { $type: 'string' } } as never, { projection: { _id: 0, user_id: 1 } }).toArray()
    people = await usersByIds(cands.map((c) => String(c.user_id)))
    source = 'ats'
  } else {
    const r = await usersByEmails(p.data.emails ?? [])
    people = r.found
    missing = r.missing
  }
  const col = await candidatesCol()
  const existing = await col.countDocuments({ drive_id: id })
  if (existing + people.length > MAX_ROSTER) people = people.slice(0, Math.max(0, MAX_ROSTER - existing))
  let added = 0
  const now = nowIso()
  for (let i = 0; i < people.length; i += CHUNK) {
    const ops: AnyBulkWriteOperation<LiveCandidateDoc>[] = people.slice(i, i + CHUNK).map((u) => ({
      updateOne: {
        filter: { drive_id: id, user_id: u.user_id },
        update: { $setOnInsert: newCandidate(id, u, source, now) },
        upsert: true,
      },
    }))
    const r = await col.bulkWrite(ops, { ordered: false })
    added += r.upsertedCount
  }
  await reassignGroups(drive)
  await logAction(id, null, user.id, 'roster_import', null, { source: p.data.source, added, missing: missing.length })
  return { added, already: people.length - added, missing: missing.slice(0, 50), missing_count: missing.length, total: await col.countDocuments({ drive_id: id }) }
}

function newCandidate(driveId: string, u: Person, source: LiveCandidateDoc['source'], now: string): LiveCandidateDoc {
  return {
    id: newId(), drive_id: driveId, user_id: u.user_id, email: u.email, name: u.name, group_no: 0, invigilator_id: null, source,
    state: 'not_started', system_check: null, started_at: null, submitted_at: null, auto_submitted: false,
    extra_ms: 0, paused_ms: 0, paused_at: null, last_seen_at: null, rejoin_allowed_at: null, disconnects: 0,
    answers: {}, answered_count: 0, save_seq: 0, saved_at: null, flag_count: 0, flagged: null, terminated: null,
    inbox: [], result: null, scored_at: null, published: false, created_at: now, updated_at: now,
  }
}

export async function removeCandidate(user: APIUser, id: string, cid: string) {
  await loadAsOwner(user, id)
  const r = await (await candidatesCol()).deleteOne({ drive_id: id, id: cid, state: 'not_started' })
  if (!r.deletedCount) throw err('Only candidates who have not started can be removed.', 409, 'ld_remove_started')
  await (await drivesCol()).updateOne({ id }, { $inc: { candidate_count: -1 } })
  await logAction(id, cid, user.id, 'roster_remove', null, {})
}

async function reassignGroups(drive: LiveDriveDoc): Promise<void> {
  const col = await candidatesCol()
  const rows = await col.find({ drive_id: drive.id }, { projection: { _id: 0, id: 1, group_no: 1, invigilator_id: 1 } }).sort({ created_at: 1, id: 1 }).limit(MAX_ROSTER).toArray()
  const plan = assignGroups(rows.map((r) => r.id), drive.invigilators.map((i) => i.user_id), drive.rules.group_size)
  const ops: AnyBulkWriteOperation<LiveCandidateDoc>[] = []
  for (const r of rows) {
    const a = plan.get(r.id)!
    if (a.group_no !== r.group_no || a.invigilator_id !== r.invigilator_id) ops.push({ updateOne: { filter: { id: r.id }, update: { $set: a } } })
  }
  for (let i = 0; i < ops.length; i += CHUNK) await col.bulkWrite(ops.slice(i, i + CHUNK), { ordered: false })
  await (await drivesCol()).updateOne({ id: drive.id }, { $set: { candidate_count: rows.length } })
}

export async function setInvigilators(user: APIUser, id: string, raw: unknown) {
  const drive = await loadAsOwner(user, id)
  const p = invigilatorsSchema.safeParse(raw)
  if (!p.success) throw err(firstIssue(p.error), 400, 'ld_invalid_input')
  const { found, missing } = await usersByEmails(p.data.emails)
  const invigilators = found.map((f) => ({ user_id: f.user_id, email: f.email, name: f.name }))
  const rules = { ...drive.rules, ...(p.data.group_size ? { group_size: p.data.group_size } : {}) }
  await (await drivesCol()).updateOne({ id }, { $set: { invigilators, rules, updated_at: nowIso() } })
  await reassignGroups({ ...drive, invigilators, rules })
  await logAction(id, null, user.id, 'invigilators_set', null, { count: invigilators.length, group_size: rules.group_size })
  return { invigilators, missing }
}

// ─── Control room ───────────────────────────────────────────────────────────

/** Integrity event types that count as incidents (not consent / session / typing samples). */
export const INCIDENT_TYPES = (Object.keys(EVENT_TYPES) as IntegrityEventType[]).filter((t) => EVENT_TYPES[t] !== null && t !== 'typing_summary')

const ROW_FIELDS = {
  _id: 0, id: 1, user_id: 1, name: 1, email: 1, group_no: 1, invigilator_id: 1, state: 1, started_at: 1, submitted_at: 1,
  extra_ms: 1, paused_ms: 1, paused_at: 1, last_seen_at: 1, flag_count: 1, flagged: 1, answered_count: 1, disconnects: 1, system_check: 1,
} as const

function rowView(c: LiveCandidateDoc, drive: LiveDriveDoc, now: number) {
  return {
    id: c.id, name: c.name, email: c.email, group_no: c.group_no, invigilator_id: c.invigilator_id,
    status: gridStatus(c, drive.rules, now), state: c.state, answered: c.answered_count || 0, flags: c.flag_count || 0,
    flagged_reason: c.flagged?.reason ?? null, remaining_ms: remainingMs(c, drive.schedule.duration_min, now),
    last_seen_at: c.last_seen_at ? new Date(c.last_seen_at).toISOString() : null, disconnects: c.disconnects || 0,
    check_passed: c.system_check?.passed ?? null,
  }
}

export async function controlRoom(user: APIUser, id: string, q: { since?: number; group?: number | null; status?: string | null; search?: string | null; page?: number }) {
  const { drive, role } = await loadForStaff(user, id)
  const now = Date.now()
  const filter: Record<string, unknown> = { drive_id: id }
  if (role === 'invigilator') filter.invigilator_id = user.id
  if (q.group && q.group > 0) filter.group_no = q.group
  const rows = (await (await candidatesCol()).find(filter, { projection: ROW_FIELDS }).sort({ group_no: 1, name: 1 }).limit(MAX_ROSTER).toArray()) as LiveCandidateDoc[]
  const views = rows.map((c) => rowView(c, drive, now))
  const counts = countByStatus(views.map((v) => v.status))
  const needle = (q.search || '').trim().toLowerCase().slice(0, 80)
  const shown = views.filter((v) => (!q.status || v.status === q.status) && (!needle || v.name.toLowerCase().includes(needle) || v.email.includes(needle)))
  const pageSize = 100
  const page = Math.max(1, Math.min(100, q.page || 1))
  // Flags stream since the client's cursor (received time, epoch ms).
  const since = new Date(Math.max(0, q.since || now - 10 * 60_000))
  const scope = role === 'invigilator' ? { user_id: { $in: rows.map((r) => r.user_id) } } : {}
  const events = await (await integrityEventsCol()).find(
    { target_kind: 'drive', target_id: id, received_at: { $gt: since }, type: { $in: INCIDENT_TYPES }, ...scope },
    { projection: { _id: 0, user_id: 1, type: 1, at: 1, received_at: 1, snapshot_id: 1 } },
  ).sort({ received_at: 1 }).limit(100).toArray()
  const byUser = new Map(rows.map((r) => [r.user_id, r]))
  const flags = events.map((e) => {
    const c = byUser.get(e.user_id)
    return { candidate_id: c?.id ?? null, name: c?.name ?? '', group_no: c?.group_no ?? 0, type: e.type, at: e.at, received_at: e.received_at.getTime() }
  })
  const groups = role === 'owner'
    ? [...new Set(views.map((v) => v.group_no))].sort((a, b) => a - b).map((g) => ({ group_no: g, invigilator: drive.invigilators.find((i) => i.user_id === views.find((v) => v.group_no === g)?.invigilator_id)?.name ?? null }))
    : [...new Set(views.map((v) => v.group_no))].sort((a, b) => a - b).map((g) => ({ group_no: g, invigilator: null }))
  return {
    drive: staffDriveView(drive, role, now),
    counts, total: views.length, groups,
    rows: shown.slice((page - 1) * pageSize, page * pageSize), matching: shown.length, page, page_size: pageSize,
    flags, cursor: events.length ? events[events.length - 1].received_at.getTime() : since.getTime(),
  }
}

async function loadCandidateForStaff(user: APIUser, id: string, cid: string) {
  const { drive, role } = await loadForStaff(user, id)
  const c = await (await candidatesCol()).findOne({ drive_id: id, id: cid }, { projection: { _id: 0 } })
  if (!c || !canActOn(role, user.id, c)) throw err('Candidate not found', 404, 'ld_candidate_not_found')
  return { drive, role, c }
}

export async function candidateDetail(user: APIUser, id: string, cid: string) {
  const { drive, c } = await loadCandidateForStaff(user, id, cid)
  const key = attemptKey('drive', id, c.user_id, 1)
  const db = await getMongoDb()
  const [events, actions, snap] = await Promise.all([
    db.collection('integrity_events').find({ attempt_id: key }, { projection: { _id: 0, type: 1, at: 1, q: 1, snapshot_id: 1 } }).sort({ at: -1 }).limit(200).toArray(),
    (await actionsCol()).find({ drive_id: id, candidate_id: cid }, { projection: { _id: 0 } }).sort({ at: -1 }).limit(50).toArray(),
    db.collection('integrity_snapshots').find({ attempt_id: key }, { projection: { _id: 0, id: 1, at: 1, reason: 1 } }).sort({ at: -1 }).limit(1).toArray(),
  ])
  const now = Date.now()
  const timeline = [
    ...events.map((e) => ({ kind: 'signal' as const, type: String(e.type), at: Number(e.at) })),
    ...actions.map((a) => ({ kind: 'action' as const, type: a.action, at: Date.parse(a.at), reason: a.reason })),
    ...(c.started_at ? [{ kind: 'state' as const, type: 'started', at: Date.parse(c.started_at) }] : []),
    ...(c.submitted_at ? [{ kind: 'state' as const, type: c.auto_submitted ? 'auto_submitted' : 'submitted', at: Date.parse(c.submitted_at) }] : []),
  ].sort((a, b) => b.at - a.at).slice(0, 250)
  return {
    candidate: { ...rowView(c, drive, now), inbox: c.inbox, terminated: c.terminated, flagged: c.flagged, system_check: c.system_check, started_at: c.started_at, submitted_at: c.submitted_at, extra_ms: c.extra_ms, result: c.result },
    timeline,
    latest_snapshot: snap[0] ? { id: String(snap[0].id), at: Number(snap[0].at), reason: String(snap[0].reason) } : null,
  }
}

/** Staff read of one snapshot of this candidate (presigned URL or bytes). */
export async function candidateSnapshot(user: APIUser, id: string, cid: string, snapId: string): Promise<{ url: string } | { bytes: Buffer }> {
  if (!/^isnap_[0-9a-f]{24}$/.test(snapId)) throw err('Snapshot not available', 404, 'ld_snapshot_missing')
  const { c } = await loadCandidateForStaff(user, id, cid)
  const db = await getMongoDb()
  const s = await db.collection('integrity_snapshots').findOne({ id: snapId, attempt_id: attemptKey('drive', id, c.user_id, 1) }, { projection: { _id: 0 } })
  if (!s) throw err('Snapshot not available', 404, 'ld_snapshot_missing')
  const { blobDownloadUrl, readBlob } = await import('@/lib/storage/blobs')
  const ref = s as never
  const url = await blobDownloadUrl(ref, `${snapId}.jpg`, 'image/jpeg')
  if (url) return { url }
  const bytes = await readBlob(ref)
  if (!bytes) throw err('Snapshot not available', 404, 'ld_snapshot_missing')
  return { bytes }
}

async function logAction(driveId: string, candidateId: string | null, actorId: string, action: string, reason: string | null, params: Record<string, unknown>) {
  await (await actionsCol()).insertOne({ id: newId(), drive_id: driveId, candidate_id: candidateId, actor_id: actorId, action, reason, params, at: nowIso() })
    .catch((e) => logger.error('[live-drives] action log failed', (e as Error).message))
}

const inboxPush = (item: InboxItem) => ({ inbox: { $each: [item], $slice: -MAX_INBOX } })

export async function candidateAction(user: APIUser, id: string, cid: string, raw: unknown) {
  const { drive, c } = await loadCandidateForStaff(user, id, cid)
  const p = actionSchema.safeParse(raw)
  if (!p.success) throw err(firstIssue(p.error), 400, 'ld_invalid_input')
  const a = p.data
  const now = new Date()
  const iso = now.toISOString()
  const col = await candidatesCol()
  let res
  switch (a.action) {
    case 'warn':
      res = await col.updateOne({ id: cid }, { $push: inboxPush({ id: newId(), kind: 'warning', text: a.message, at: iso }) as never, $set: { updated_at: iso } })
      break
    case 'add_time':
      if (c.state !== 'in_progress' && c.state !== 'paused' && c.state !== 'not_started') throw err('This candidate has already finished.', 409, 'ld_candidate_finished')
      res = await col.updateOne({ id: cid, state: { $in: ['not_started', 'in_progress', 'paused'] } }, {
        $inc: { extra_ms: a.minutes * 60_000 },
        $push: inboxPush({ id: newId(), kind: 'notice', text: `+${a.minutes} min`, at: iso }) as never,
        $set: { updated_at: iso },
      })
      break
    case 'pause':
      res = await col.updateOne({ id: cid, state: 'in_progress' }, { $set: { state: 'paused', paused_at: iso, updated_at: iso } })
      if (!res.modifiedCount) throw err('Only a candidate who is writing can be paused.', 409, 'ld_not_running')
      break
    case 'resume': {
      if (c.state !== 'paused' || !c.paused_at) throw err('This candidate is not paused.', 409, 'ld_not_paused')
      const pausedFor = Math.max(0, now.getTime() - Date.parse(c.paused_at))
      res = await col.updateOne({ id: cid, state: 'paused', paused_at: c.paused_at }, { $set: { state: 'in_progress', paused_at: null, updated_at: iso, last_seen_at: now }, $inc: { paused_ms: pausedFor } })
      break
    }
    case 'terminate':
      res = await col.updateOne({ id: cid, state: { $in: ['not_started', 'in_progress', 'paused'] } }, {
        $set: { state: 'terminated', terminated: { by: user.id, reason: a.reason, at: iso }, submitted_at: iso, paused_at: null, updated_at: iso },
      })
      if (!res.modifiedCount) throw err('This candidate has already finished.', 409, 'ld_candidate_finished')
      void import('@/lib/db/misc').then((m) => m.writeAuditLog({
        action: 'live_drive.terminate', outcome: 'success', actor: user.id, actorIp: '', resource: `${id}:${cid}`, resourceType: 'live_drive_candidate', severity: 'warning', detail: a.reason.slice(0, 300),
      } as never)).catch(() => {})
      break
    case 'flag':
      res = await col.updateOne({ id: cid }, { $set: { flagged: { by: user.id, reason: a.reason, at: iso }, updated_at: iso } })
      break
    case 'unflag':
      res = await col.updateOne({ id: cid }, { $set: { flagged: null, updated_at: iso } })
      break
    case 'allow_rejoin':
      res = await col.updateOne({ id: cid }, { $set: { rejoin_allowed_at: iso, updated_at: iso } })
      break
  }
  void res
  const reason = 'reason' in a ? a.reason ?? null : 'message' in a ? a.message : null
  await logAction(id, cid, user.id, a.action, reason, a.action === 'add_time' ? { minutes: a.minutes } : {})
  const fresh = (await col.findOne({ id: cid }, { projection: { _id: 0 } }))!
  return rowView(fresh, drive, Date.now())
}

export async function broadcast(user: APIUser, id: string, raw: unknown) {
  await loadAsOwner(user, id)
  const p = broadcastSchema.safeParse(raw)
  if (!p.success) throw err(firstIssue(p.error), 400, 'ld_invalid_input')
  const b = { id: newId(), text: p.data.message, at: nowIso(), by: user.id }
  await (await drivesCol()).updateOne({ id }, { $push: { broadcasts: { $each: [b], $slice: -MAX_BROADCASTS } } as never, $set: { updated_at: b.at } })
  await logAction(id, null, user.id, 'broadcast', p.data.message, {})
  return b
}

// ─── Results ────────────────────────────────────────────────────────────────

/** Close the clocks that ran out (and, once the drive has ended, everyone still writing). Batched. */
async function finalizeExpired(drive: LiveDriveDoc, now: number): Promise<number> {
  const col = await candidatesCol()
  const running = (await col.find({ drive_id: drive.id, state: { $in: ['in_progress', 'paused'] } }, { projection: { _id: 0, id: 1, state: 1, started_at: 1, extra_ms: 1, paused_ms: 1, paused_at: 1 } }).limit(MAX_ROSTER).toArray()) as LiveCandidateDoc[]
  const ended = drive.status === 'ended'
  const ops: AnyBulkWriteOperation<LiveCandidateDoc>[] = []
  for (const c of running) {
    if (!ended && !timeUp(c, drive.schedule.duration_min, now)) continue
    const deadline = deadlineMs(c, drive.schedule.duration_min, now) ?? now
    ops.push({ updateOne: { filter: { id: c.id, state: c.state }, update: { $set: { state: 'submitted', auto_submitted: true, paused_at: null, submitted_at: new Date(Math.min(now, deadline)).toISOString(), updated_at: new Date(now).toISOString() } } } })
  }
  for (let i = 0; i < ops.length; i += CHUNK) await col.bulkWrite(ops.slice(i, i + CHUNK), { ordered: false })
  return ops.length
}

export async function results(user: APIUser, id: string, raw: unknown) {
  const drive = await loadAsOwner(user, id)
  const p = resultsSchema.safeParse(raw)
  if (!p.success) throw err(firstIssue(p.error), 400, 'ld_invalid_input')
  const now = Date.now()
  const col = await candidatesCol()
  await finalizeExpired(drive, now)
  if (p.data.action === 'score') {
    const paper = await loadPaper(id, drive.paper_built_at)
    if (!paper) throw err('The question paper is not ready yet.', 409, 'ld_paper_unavailable')
    const batch = (await col.find({ drive_id: id, state: 'submitted', scored_at: null }, { projection: { _id: 0, id: 1, answers: 1 } }).limit(SCORE_BATCH).toArray()) as LiveCandidateDoc[]
    const ops: AnyBulkWriteOperation<LiveCandidateDoc>[] = []
    for (const c of batch) {
      const result = await scoreCandidate(paper, drive.rules, c)
      ops.push({ updateOne: { filter: { id: c.id, scored_at: null }, update: { $set: { result, scored_at: nowIso() } } } })
    }
    if (ops.length) await col.bulkWrite(ops, { ordered: false })
    const remaining = await col.countDocuments({ drive_id: id, state: 'submitted', scored_at: null })
    if (!remaining) await (await drivesCol()).updateOne({ id }, { $set: { 'results.scored_at': nowIso() } })
    return { scored: ops.length, remaining, summary: await resultSummary(id) }
  }
  // publish
  const running = await col.countDocuments({ drive_id: id, state: { $in: ['in_progress', 'paused'] } })
  if (running) throw err('Some candidates are still writing. End the drive or wait for their time to run out.', 409, 'ld_still_running', { count: running })
  const unscored = await col.countDocuments({ drive_id: id, state: 'submitted', scored_at: null })
  if (unscored) throw err('Score every submission before publishing.', 409, 'ld_unscored', { count: unscored })
  const passers = (await col.find({ drive_id: id, state: 'submitted', 'result.passed': true }, { projection: { _id: 0, user_id: 1, result: 1 } }).limit(MAX_ROSTER).toArray())
  const passIds = passers.map((x) => x.user_id)
  let moved = 0
  if (drive.links.campus_drive_id) {
    const { applicationsCol } = await import('@/lib/campus/store')
    const apps = await applicationsCol()
    const ts = nowIso()
    const r = await apps.updateMany({ drive_id: drive.links.campus_drive_id, college_id: drive.owner.tenant_id, user_id: { $in: passIds }, status: { $in: ['applied', 'in_process'] } }, { $set: { status: 'shortlisted', updated_at: ts } })
    moved += r.modifiedCount
    if (p.data.reject_others) {
      const all = (await col.find({ drive_id: id }, { projection: { _id: 0, user_id: 1 } }).limit(MAX_ROSTER).toArray()).map((x) => x.user_id)
      const pass = new Set(passIds)
      await apps.updateMany({ drive_id: drive.links.campus_drive_id, college_id: drive.owner.tenant_id, user_id: { $in: all.filter((u) => !pass.has(u)) }, status: { $in: ['applied', 'in_process'] } }, { $set: { status: 'rejected', updated_at: ts } })
    }
  }
  if (drive.links.ats_job_id && p.data.stage_id && drive.owner.kind === 'company') {
    moved += await moveAtsPassers(user, drive, passIds, p.data.stage_id)
  }
  await col.updateMany({ drive_id: id, state: { $in: ['submitted', 'terminated'] } }, { $set: { published: true } })
  await (await drivesCol()).updateOne({ id }, { $set: { 'results.published_at': nowIso(), 'results.published_count': passIds.length, status: 'ended' } })
  await logAction(id, null, user.id, 'results_publish', null, { passed: passIds.length, moved })
  void notifyResults(drive).catch((e) => logger.error('[live-drives] results notify failed', (e as Error).message))
  return { passed: passIds.length, moved, summary: await resultSummary(id) }
}

async function moveAtsPassers(user: APIUser, drive: LiveDriveDoc, userIds: string[], stageId: string): Promise<number> {
  const { resolveActorFor } = await import('@/lib/ats/access')
  const actor = await resolveActorFor(user, drive.owner.tenant_id)
  if (!actor || actor.tenantId !== drive.owner.tenant_id) throw err('You are not on this company’s hiring team.', 403, 'ld_hiring_role')
  const { atsApplications, atsCandidates, atsJobs } = await import('@/lib/ats/db')
  const job = await (await atsJobs()).findOne({ id: drive.links.ats_job_id!, tenant_id: actor.tenantId }, { projection: { _id: 0, pipeline: 1 } })
  if (!job?.pipeline?.some((s) => s.id === stageId)) throw err('Pick a stage of the job’s pipeline.', 400, 'ld_bad_stage')
  const cands = await (await atsCandidates()).find({ tenant_id: actor.tenantId, user_id: { $in: userIds } } as never, { projection: { _id: 0, id: 1 } }).toArray()
  const apps = await (await atsApplications()).find({ tenant_id: actor.tenantId, job_id: drive.links.ats_job_id!, candidate_id: { $in: cands.map((c) => c.id) }, status: 'active' } as never, { projection: { _id: 0, id: 1, stage_id: 1 } }).limit(MAX_ROSTER).toArray()
  const { moveApplication } = await import('@/lib/ats/engine')
  let moved = 0
  for (const a of apps) {
    if (a.stage_id === stageId) continue
    try {
      await moveApplication(actor, a.id, stageId, { reason: `Cleared live drive: ${drive.title}`.slice(0, 200) })
      moved++
    } catch (e) {
      logger.warn('[live-drives] ats move failed', (e as Error).message)
    }
  }
  return moved
}

async function notifyResults(drive: LiveDriveDoc) {
  const rows = await (await candidatesCol()).find({ drive_id: drive.id, published: true }, { projection: { _id: 0, user_id: 1 } }).limit(MAX_ROSTER).toArray()
  const { notifyMany } = await import('@/lib/notifications')
  await notifyMany(rows.map((r) => r.user_id), {
    type: 'assessment.results_released',
    title: `Results are out: ${drive.title}`,
    title_i18n: { key: 'liveDrive.results.title', params: { title: drive.title } },
    message_i18n: { key: 'liveDrive.results.message' },
    link: `/dashboard/drives/${drive.id}`,
  })
}

export async function resultSummary(id: string) {
  const rows = await (await candidatesCol()).aggregate<{ _id: string; n: number; passed: number; avg: number | null }>([
    { $match: { drive_id: id } },
    { $group: { _id: '$state', n: { $sum: 1 }, passed: { $sum: { $cond: [{ $eq: ['$result.passed', true] }, 1, 0] } }, avg: { $avg: '$result.percent' } } },
  ]).toArray()
  const by = Object.fromEntries(rows.map((r) => [r._id, r]))
  const sub = by.submitted
  return {
    submitted: sub?.n ?? 0, passed: sub?.passed ?? 0, average_percent: sub?.avg != null ? Math.round(sub.avg * 10) / 10 : null,
    terminated: by.terminated?.n ?? 0, not_started: by.not_started?.n ?? 0, running: (by.in_progress?.n ?? 0) + (by.paused?.n ?? 0),
  }
}

/** Results table for the organiser (CSV-friendly rows). */
export async function resultRows(user: APIUser, id: string) {
  await loadAsOwner(user, id)
  const rows = await (await candidatesCol()).find({ drive_id: id }, { projection: { _id: 0, id: 1, name: 1, email: 1, state: 1, result: 1, flag_count: 1, flagged: 1, group_no: 1 } }).sort({ 'result.percent': -1, name: 1 }).limit(MAX_ROSTER).toArray()
  return rows.map((r) => ({ id: r.id, name: r.name, email: r.email, group_no: r.group_no, state: r.state, percent: r.result?.percent ?? null, passed: r.result?.passed ?? null, flags: r.flag_count || 0, flagged: !!r.flagged }))
}

// ─── Candidate session ──────────────────────────────────────────────────────

async function loadAsCandidate(user: APIUser, id: string) {
  const drive = await (await drivesCol()).findOne({ id }, { projection: { _id: 0 } })
  if (!drive || drive.status === 'draft') throw err('Live drive not found', 404, 'ld_not_found')
  const col = await candidatesCol()
  let c = await col.findOne({ drive_id: id, user_id: user.id }, { projection: { _id: 0 } })
  if (!c) throw err('You are not on this drive’s candidate list.', 404, 'ld_not_on_roster')
  const now = Date.now()
  // Lazy close: the clock ran out while the candidate was away.
  if ((c.state === 'in_progress' && timeUp(c, drive.schedule.duration_min, now)) || (drive.status === 'ended' && (c.state === 'in_progress' || c.state === 'paused'))) {
    const deadline = deadlineMs(c, drive.schedule.duration_min, now) ?? now
    await col.updateOne({ id: c.id, state: c.state }, { $set: { state: 'submitted', auto_submitted: true, paused_at: null, submitted_at: new Date(Math.min(now, deadline)).toISOString(), updated_at: nowIso() } })
    c = (await col.findOne({ id: c.id }, { projection: { _id: 0 } }))!
  }
  return { drive, c, col }
}

async function cameraNeeded(drive: LiveDriveDoc): Promise<boolean> {
  if (drive.rules.require_camera) return true
  const { getSettings } = await import('@/lib/integrity/service')
  return needsCamera(await getSettings('drive', drive.id))
}

function candidateView(drive: LiveDriveDoc, c: LiveCandidateDoc, now: number, since: number, withAnswers = false, camera = false) {
  const deadline = deadlineMs(c, drive.schedule.duration_min, now)
  return {
    drive: {
      id: drive.id, title: drive.title, organiser: drive.owner.name, exam_name: drive.test.exam_name, company_name: drive.test.company_name,
      schedule: drive.schedule, status: effectiveStatus(drive, now), join: joinWindow(drive, now),
      rules: { autosave_sec: drive.rules.autosave_sec, heartbeat_sec: drive.rules.heartbeat_sec, reconnect_window_min: drive.rules.reconnect_window_min, min_mbps: drive.rules.min_mbps, require_camera: camera },
    },
    server_now: new Date(now).toISOString(),
    me: {
      state: c.state, system_check: c.system_check, started_at: c.started_at, submitted_at: c.submitted_at, auto_submitted: c.auto_submitted,
      deadline: deadline !== null ? new Date(deadline).toISOString() : null, remaining_ms: remainingMs(c, drive.schedule.duration_min, now),
      paused: c.state === 'paused', locked: !reconnectAllowed(c, drive.rules, now), answered: c.answered_count || 0, save_seq: c.save_seq || 0,
      terminated_reason: c.terminated?.reason ?? null,
      result: c.published && c.result ? { percent: c.result.percent, passed: c.result.passed } : null,
      ...(withAnswers ? { answers: c.answers } : {}),
    },
    inbox: (c.inbox || []).filter((m) => Date.parse(m.at) > since),
    broadcasts: (drive.broadcasts || []).filter((b) => Date.parse(b.at) > since).map((b) => ({ id: b.id, text: b.text, at: b.at })),
  }
}

export async function sessionState(user: APIUser, id: string, opts: { since?: number; answers?: boolean } = {}) {
  const { drive, c } = await loadAsCandidate(user, id)
  return candidateView(drive, c, Date.now(), opts.since ?? 0, !!opts.answers, await cameraNeeded(drive))
}

export async function candidatePaper(user: APIUser, id: string) {
  const { drive, c } = await loadAsCandidate(user, id)
  if (c.state !== 'in_progress' && c.state !== 'paused') throw err('Start the drive test first.', 409, 'ld_start_first')
  if (!reconnectAllowed(c, drive.rules, Date.now())) throw err('You were away too long. Ask the invigilator to let you back in.', 409, 'ld_locked_out')
  try {
    return { sections: await publicPaper(drive, user.id) }
  } catch (e) {
    if (e instanceof PaperError) throw err(e.message, e.status, e.code)
    throw e
  }
}

export async function sessionOp(user: APIUser, id: string, raw: unknown) {
  const p = sessionSchema.safeParse(raw)
  if (!p.success) throw err('Invalid request', 400, 'invalid_request')
  const op = p.data
  const { drive, c, col } = await loadAsCandidate(user, id)
  const now = Date.now()
  const nowDate = new Date(now)
  const iso = nowDate.toISOString()
  const since = 'since' in op && typeof op.since === 'number' ? op.since : now
  const camera = await cameraNeeded(drive)
  const view = async (withAnswers = false) => candidateView(drive, (await col.findOne({ id: c.id }, { projection: { _id: 0 } }))!, Date.now(), since, withAnswers, camera)

  if (op.op === 'check') {
    if (c.state !== 'not_started') return view()
    const v = systemVerdict(op, { camera, min_mbps: drive.rules.min_mbps })
    await col.updateOne({ id: c.id }, { $set: { system_check: { camera: op.camera, mic: op.mic, mbps: op.mbps, browser_ok: op.browser_ok, ...v, at: iso }, last_seen_at: nowDate, updated_at: iso } })
    return view()
  }

  if (op.op === 'start') {
    if (c.state !== 'not_started') return view(true)
    const w = joinWindow(drive, now)
    if (w !== 'open') throw err(w === 'lobby' || w === 'too_early' ? 'The test has not started yet.' : 'Entry to this drive has closed.', 409, w === 'lobby' || w === 'too_early' ? 'ld_not_started' : 'ld_entry_closed')
    if (!c.system_check?.passed) throw err('Finish the system check first.', 409, 'ld_check_first')
    const r = await col.updateOne({ id: c.id, state: 'not_started' }, { $set: { state: 'in_progress', started_at: iso, last_seen_at: nowDate, updated_at: iso } })
    if (!r.modifiedCount && c.state === 'not_started') throw err('Could not start the test. Try again.', 409, 'ld_start_failed')
    return view(true)
  }

  if (c.state === 'terminated' || c.state === 'submitted' || c.state === 'not_started') return view()
  if (!reconnectAllowed(c, drive.rules, now)) throw err('You were away too long. Ask the invigilator to let you back in.', 409, 'ld_locked_out')

  const reconnect = isReconnect(c.last_seen_at, drive.rules.heartbeat_sec, now)
  const seen: Record<string, unknown> = { last_seen_at: nowDate }
  const inc: Record<string, number> = reconnect ? { disconnects: 1 } : {}

  if (op.op === 'heartbeat') {
    if (shouldWriteHeartbeat(c.last_seen_at, now) || reconnect) await col.updateOne({ id: c.id }, { $set: seen, ...(reconnect ? { $inc: inc } : {}) })
    return view()
  }

  // save / submit: answers patch (validated against the paper)
  const paper = await loadPaper(id, drive.paper_built_at)
  if (!paper) throw err('The question paper is not ready yet.', 409, 'ld_paper_unavailable')
  const patch = cleanAnswerPatch(op.answers ?? {}, paperQuestionIds(paper))
  const deadline = deadlineMs(c, drive.schedule.duration_min, now) ?? now
  const late = now > deadline + SUBMIT_GRACE_MS
  if (c.state === 'paused' && op.op === 'save') throw err('Your test is paused by the invigilator.', 409, 'ld_paused')
  const merge = !late && Object.keys(patch).length > 0
  const seq = op.seq ?? (c.save_seq || 0) + 1
  const answersStage = merge
    ? [{ $set: { answers: { $mergeObjects: [{ $ifNull: ['$answers', {}] }, { $literal: patch }] } } },
      { $set: { answered_count: { $size: { $filter: { input: { $objectToArray: '$answers' }, cond: { $ne: [{ $trim: { input: { $toString: '$$this.v' } } }, ''] } } } } } }]
    : []
  if (op.op === 'save') {
    if (late) {
      await col.updateOne({ id: c.id, state: 'in_progress' }, { $set: { state: 'submitted', auto_submitted: true, submitted_at: new Date(deadline).toISOString(), updated_at: iso } })
      return view()
    }
    // Out-of-order saves (older seq) are ignored; one atomic write merges answers + heartbeat.
    await col.updateOne({ id: c.id, state: 'in_progress', save_seq: { $lt: seq } }, [
      ...answersStage,
      { $set: { save_seq: seq, saved_at: iso, last_seen_at: nowDate, updated_at: iso, ...(reconnect ? { disconnects: { $add: [{ $ifNull: ['$disconnects', 0] }, 1] } } : {}) } },
    ])
    return view()
  }
  // submit
  await col.updateOne({ id: c.id, state: { $in: ['in_progress', 'paused'] } }, [
    ...answersStage,
    { $set: { state: 'submitted', auto_submitted: late, paused_at: null, submitted_at: late ? new Date(deadline).toISOString() : iso, save_seq: Math.max(seq, c.save_seq || 0), saved_at: iso, last_seen_at: nowDate, updated_at: iso } },
  ])
  return view()
}

/** Drives the signed-in user is a candidate in. */
export async function myDrives(user: APIUser) {
  const rows = await (await candidatesCol()).find({ user_id: user.id }, { projection: { _id: 0, drive_id: 1, state: 1, published: 1, result: 1 } }).sort({ created_at: -1 }).limit(50).toArray()
  if (!rows.length) return []
  const drives = await (await drivesCol()).find({ id: { $in: rows.map((r) => r.drive_id) }, status: { $ne: 'draft' } }, { projection: { _id: 0, id: 1, title: 1, owner: 1, test: 1, schedule: 1, status: 1 } }).toArray()
  const by = new Map(drives.map((d) => [d.id, d]))
  const now = Date.now()
  return rows.filter((r) => by.has(r.drive_id)).map((r) => {
    const d = by.get(r.drive_id)! as LiveDriveDoc
    return {
      id: d.id, title: d.title, organiser: d.owner.name, exam_name: d.test.exam_name, start_at: d.schedule.start_at, duration_min: d.schedule.duration_min,
      status: effectiveStatus(d, now), join: joinWindow(d, now), state: r.state,
      result: r.published && r.result ? { percent: r.result.percent, passed: r.result.passed } : null,
    }
  })
}

// ─── lib/integrity hooks (kind 'drive') ─────────────────────────────────────

export async function liveDriveTarget(id: string) {
  const d = await (await drivesCol()).findOne({ id }, { projection: { _id: 0, id: 1, title: 1, owner: 1, schedule: 1, status: 1 } })
  if (!d) return null
  const end = Date.parse(d.schedule.start_at) + (d.schedule.late_join_min + d.schedule.duration_min) * 60_000
  // `schedule.ends_at` lets lib/integrity treat the drive like a timed event.
  return { kind: 'drive' as const, id: d.id, tenant_id: d.owner.tenant_id, title: d.title, doc: { ...d, schedule: { ...d.schedule, ends_at: new Date(end).toISOString() } } as Record<string, unknown> }
}

/** The candidate's running attempt window for integrity events, or why there is none. */
export async function liveDriveAttemptWindow(id: string, userId: string, now = Date.now()): Promise<{ ok: true; window: { from: number; to: number } } | { ok: false; error: string }> {
  const c = await (await candidatesCol()).findOne({ drive_id: id, user_id: userId }, { projection: { _id: 0, state: 1, started_at: 1, submitted_at: 1, system_check: 1 } })
  if (!c) return { ok: false, error: 'You are not on this drive.' }
  if (c.state === 'not_started') {
    // Consent is given in the lobby, before the start.
    if (!c.system_check) return { ok: false, error: 'Start the test first.' }
    return { ok: true, window: { from: now - 60 * 60_000, to: now + 5_000 } }
  }
  const started = Date.parse(c.started_at || '')
  const submitted = Date.parse(c.submitted_at || '')
  if ((c.state === 'submitted' || c.state === 'terminated') && (Number.isNaN(submitted) || now - submitted > 60_000)) return { ok: false, error: 'This attempt is finished.' }
  return { ok: true, window: { from: (Number.isNaN(started) ? now : started) - 60 * 60_000, to: now + 5_000 } }
}

export async function countIntegrityIncidents(driveId: string, userId: string, n: number): Promise<void> {
  await (await candidatesCol()).updateOne({ drive_id: driveId, user_id: userId }, { $inc: { flag_count: n } })
}

export type { GridStatus }
