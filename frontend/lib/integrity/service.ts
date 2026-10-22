/**
 * Integrity service (server only): settings, candidate event ingestion with
 * attempt-ownership checks, violation snapshots, reviewer reads and review
 * marks, retention. Routes and the agent tool call these same functions.
 *
 * Access:
 *  - candidates may only write to THEIR running attempt (exam: the server
 *    attempt clock in exam_drafts; contest: their entry while it is live),
 *    and only after consent was recorded for that attempt;
 *  - reviewers are staff of the test's / contest's organisation (superadmin,
 *    or tenant_admin of the same tenant — lib/exam-access isTenantStaff).
 */
import 'server-only'
import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import { getMongoDb } from '@/lib/mongodb'
import { isTenantStaff, getExamDraft, attemptTimeState } from '@/lib/exam-access'
import { rateLimitSlidingWindow } from '@/lib/in-memory-rate-limit'
import { putBlob, blobDownloadUrl, readBlob, deleteBlobsFor } from '@/lib/storage/blobs'
import { logger } from '@/lib/logger'
import { ok, fail, type ServiceResult } from '@/lib/services/result'
import {
  applySettingsPatch, candidateConfig, enabledSignals, isTargetKind, needsCamera, resolveSettings,
  REVIEW_STATUSES, SNAPSHOT_REASONS, EVENT_TYPES, TARGET_KINDS,
  type CandidateIntegrityConfig, type IntegritySettings, type ReviewStatus, type SignalId, type TargetKind,
} from './types'
import { cleanEventBatch } from './events'
import { computeTrustScore, type TrustResult } from './trust-score'
import { mergeCadence, type CadenceSummary } from './cadence'
import {
  attemptKey, attemptsCol, eventsCol, globalCol, ipHash, settingsCol, snapshotsCol, stripId,
  type AttemptDoc, type EventDoc, type GlobalDoc, type SnapshotDoc,
} from './store'

type Doc = Record<string, unknown>
export interface Who { id: string; role: string; tenantId?: string | null }

const DAY = 24 * 3600_000
const MAX_EVENTS_PER_ATTEMPT = 5000
const MAX_SNAPSHOTS_PER_ATTEMPT = 60
const MAX_SNAPSHOT_BYTES = 150 * 1024
const nowIso = () => new Date().toISOString()

export const DEFAULT_GLOBAL: GlobalDoc = { id: 'global', classifier_daily_cap: 50, monthly_cost_cap_usd: 2, cost_per_call_usd: 0.002 }

// ─── Targets ─────────────────────────────────────────────────────────────────

export interface Target {
  kind: TargetKind
  id: string
  tenant_id: string | null
  title: string
  doc: Doc
}

const ID_RE = /^[A-Za-z0-9_-]{1,128}$/

export async function loadTarget(kind: TargetKind, id: string): Promise<Target | null> {
  if (!isTargetKind(kind) || typeof id !== 'string' || !ID_RE.test(id)) return null
  if (kind === 'drive') {
    const { liveDriveTarget } = await import('@/lib/live-drives/service')
    return liveDriveTarget(id)
  }
  if (kind === 'exam') {
    const db = await getMongoDb()
    const exam = (await db.collection('exams').findOne({ id }, { projection: { _id: 0 } })) as Doc | null
    if (!exam) return null
    return { kind, id: String(exam.id), tenant_id: typeof exam.tenant_id === 'string' ? exam.tenant_id : null, title: String(exam.title || 'Test'), doc: exam }
  }
  const { findContest } = await import('@/lib/contests/service')
  const c = await findContest(id)
  if (!c) return null
  return { kind, id: c.id, tenant_id: c.tenant_id ?? null, title: c.title, doc: c as unknown as Doc }
}

export async function loadStaffTarget(user: Who | null | undefined, kind: string, id: string): Promise<ServiceResult<Target>> {
  if (!user) return fail(401, 'Sign in to continue.')
  if (!isTargetKind(kind)) return fail(400, 'Unknown kind')
  const t = await loadTarget(kind, id)
  if (!t) return fail(404, kind === 'exam' ? 'Test not found' : 'Contest not found')
  if (!isTenantStaff({ role: user.role as never, tenantId: user.tenantId ?? null }, { tenant_id: t.tenant_id })) return fail(403, 'Forbidden')
  return ok(t)
}

// ─── Settings ────────────────────────────────────────────────────────────────

export async function getSettings(kind: TargetKind, targetId: string): Promise<IntegritySettings> {
  const doc = await (await settingsCol()).findOne({ target_kind: kind, target_id: targetId }, { projection: { _id: 0 } })
  return resolveSettings(doc)
}

export async function saveSettings(user: Who, t: Target, raw: unknown): Promise<ServiceResult<IntegritySettings>> {
  const current = await getSettings(t.kind, t.id)
  const r = applySettingsPatch(current, raw)
  if (!r.ok) return fail(400, r.error)
  await (await settingsCol()).updateOne(
    { target_kind: t.kind, target_id: t.id },
    { $set: { ...r.settings, tenant_id: t.tenant_id, updated_by: user.id, updated_at: nowIso() }, $setOnInsert: { target_kind: t.kind, target_id: t.id } },
    { upsert: true },
  )
  return ok(r.settings)
}

export async function getGlobal(): Promise<GlobalDoc> {
  const g = await (await globalCol()).findOne({ id: 'global' }, { projection: { _id: 0 } })
  return { ...DEFAULT_GLOBAL, ...(g ?? {}), id: 'global' }
}

const GlobalPatch = z.object({
  classifier_daily_cap: z.coerce.number().int().min(0).max(5000).optional(),
  monthly_cost_cap_usd: z.coerce.number().min(0).max(1000).optional(),
  cost_per_call_usd: z.coerce.number().min(0).max(1).optional(),
}).strict()

export async function saveGlobal(user: Who, raw: unknown): Promise<ServiceResult<GlobalDoc>> {
  if (user.role !== 'superadmin') return fail(403, 'Only platform admins can change the AI caps.')
  const p = GlobalPatch.safeParse(raw)
  if (!p.success) return fail(400, p.error.issues[0]?.message || 'Invalid caps')
  const set = Object.fromEntries(Object.entries(p.data).filter(([, v]) => v !== undefined))
  await (await globalCol()).updateOne({ id: 'global' }, { $set: { ...set, updated_at: nowIso(), updated_by: user.id } }, { upsert: true })
  return ok(await getGlobal())
}

// ─── Candidate attempts ──────────────────────────────────────────────────────

interface CandidateAttempt {
  key: string
  attemptNo: number
  /** Epoch range events may fall in. */
  window: { from: number; to: number }
}

/** The caller's running attempt, or why there is none. */
async function runningAttempt(user: Who, t: Target, now = Date.now()): Promise<ServiceResult<CandidateAttempt>> {
  if (t.kind === 'drive') {
    const { liveDriveAttemptWindow } = await import('@/lib/live-drives/service')
    const w = await liveDriveAttemptWindow(t.id, user.id, now)
    if (!w.ok) return fail(409, w.error)
    return ok({ key: attemptKey('drive', t.id, user.id, 1), attemptNo: 1, window: w.window })
  }
  if (t.kind === 'exam') {
    if (!t.doc.published) return fail(404, 'Test not found')
    const db = await getMongoDb()
    const raw = await getExamDraft(db, t.id, user.id)
    // CAD tasks start through /cad-submission/start (cad_started_at / cad_started_attempt), not ./start.
    const draft = raw && Number(raw.cad_started_attempt) > (Number(raw.attempt_no) || 0) && typeof raw.cad_started_at === 'string'
      ? { ...raw, attempt_no: Number(raw.cad_started_attempt), attempt_started_at: raw.cad_started_at }
      : raw
    const attemptNo = Number(draft?.attempt_no) || 0
    if (!draft || !attemptNo) return fail(409, 'Start the test first.')
    const state = attemptTimeState(t.doc, draft, attemptNo, now)
    if (state.status === 'not_started') return fail(409, 'Start the test first.')
    // A just-submitted attempt may still flush its last batch for a minute.
    const submittedAt = typeof draft.submitted_at === 'string' ? Date.parse(draft.submitted_at) : NaN
    const started = Date.parse(state.startedAt)
    if (!Number.isNaN(submittedAt) && submittedAt >= started && now - submittedAt > 60_000) return fail(409, 'This attempt is finished.')
    if (state.status === 'expired') return fail(409, 'This attempt is finished.')
    return ok({ key: attemptKey('exam', t.id, user.id, attemptNo), attemptNo, window: { from: started - 60_000, to: now + 5_000 } })
  }
  const c = t.doc as { id: string; status?: string; schedule?: { starts_at?: string; ends_at?: string } }
  const starts = Date.parse(String(c.schedule?.starts_at || ''))
  const ends = Date.parse(String(c.schedule?.ends_at || ''))
  if (c.status !== 'published' || Number.isNaN(starts) || Number.isNaN(ends)) return fail(409, 'This contest is not running.')
  if (now < starts - 60_000 || now > ends + 2 * 60_000) return fail(409, 'This contest is not running.')
  const { entriesCol } = await import('@/lib/contests/store')
  const entry = await (await entriesCol()).findOne({ contest_id: c.id, member_ids: user.id }, { projection: { _id: 0, id: 1 } })
  if (!entry) return fail(403, 'Join the contest first.')
  return ok({ key: attemptKey('contest', t.id, user.id, 1), attemptNo: 1, window: { from: starts - 60_000, to: now + 5_000 } })
}

/** What the candidate's page needs (signals for the consent screen + whether consent is on file). */
export async function candidateIntegrity(user: Who, kind: string, id: string): Promise<ServiceResult<CandidateIntegrityConfig>> {
  if (!isTargetKind(kind)) return fail(400, 'Unknown kind')
  const t = await loadTarget(kind, id)
  if (!t) return fail(404, 'Not found')
  const settings = await getSettings(t.kind, t.id)
  if (!settings.enabled) return ok(candidateConfig(settings, false))
  const attempt = await runningAttempt(user, t)
  let consented = false
  if (attempt.ok) {
    const a = await (await attemptsCol()).findOne({ id: attempt.data.key }, { projection: { _id: 0, consented_at: 1 } })
    consented = !!a?.consented_at
  }
  return ok(candidateConfig(settings, consented))
}

const BatchBody = z.object({
  target_kind: z.enum(TARGET_KINDS),
  target_id: z.string().regex(ID_RE),
  events: z.array(z.unknown()).max(200),
})

export interface IngestResult { accepted: number; dropped: number; need_consent: boolean }

export async function ingestEvents(user: Who, raw: unknown, ip: string): Promise<ServiceResult<IngestResult>> {
  const body = BatchBody.safeParse(raw)
  if (!body.success) return fail(400, 'Invalid batch')
  const rl = rateLimitSlidingWindow(`integrity-events:${user.id}`, 120, 10 * 60_000)
  if (!rl.ok) return fail(429, 'Too many events')
  const t = await loadTarget(body.data.target_kind, body.data.target_id)
  if (!t) return fail(404, 'Not found')
  const settings = await getSettings(t.kind, t.id)
  if (!settings.enabled) return fail(409, 'Integrity monitoring is off for this test.')
  const attempt = await runningAttempt(user, t)
  if (!attempt.ok) return attempt
  const { key, attemptNo, window } = attempt.data
  const enabled = new Set<SignalId>(enabledSignals(settings))
  const { events, dropped } = cleanEventBatch(body.data.events, enabled, window)

  const now = new Date()
  const purgeAt = new Date(now.getTime() + settings.event_retention_days * DAY)
  const attempts = await attemptsCol()
  const consentNow = events.some((e) => e.type === 'consent_given')
  const before = await attempts.findOneAndUpdate(
    { id: key },
    {
      $setOnInsert: {
        id: key, target_kind: t.kind, target_id: t.id, tenant_id: t.tenant_id, user_id: user.id, attempt_no: attemptNo,
        first_at: now.toISOString(), counts: {}, snapshot_count: 0, last_ip_hash: null,
        review: { status: 'unreviewed', note: '', by: null, at: null },
        consented_at: consentNow ? now.toISOString() : null,
      },
      $set: { last_at: now.toISOString(), purge_at: purgeAt },
    },
    { upsert: true, returnDocument: 'before', projection: { _id: 0, consented_at: 1, last_ip_hash: 1, counts: 1 } },
  )
  let consented = !!before?.consented_at || consentNow
  if (before && !before.consented_at && consentNow) {
    await attempts.updateOne({ id: key, consented_at: null }, { $set: { consented_at: now.toISOString() } })
    consented = true
  }
  const total = Object.values(before?.counts ?? {}).reduce((a, b) => a + (Number(b) || 0), 0)
  if (total >= MAX_EVENTS_PER_ATTEMPT) return ok({ accepted: 0, dropped: events.length + dropped, need_consent: !consented })

  // Nothing but consent / session markers until consent is on file.
  const kept = consented ? events : events.filter((e) => EVENT_TYPES[e.type] === null)
  const docs: EventDoc[] = kept.map((e) => ({
    attempt_id: key, target_kind: t.kind, target_id: t.id, user_id: user.id,
    type: e.type, at: e.at, q: e.q, data: e.data, snapshot_id: null, received_at: now, purge_at: purgeAt,
  }))
  // Network address change, seen by the server (never trusts the browser for this).
  const h = ipHash(key, ip)
  if (consented && enabled.has('network') && h && before?.last_ip_hash && before.last_ip_hash !== h) {
    docs.push({ attempt_id: key, target_kind: t.kind, target_id: t.id, user_id: user.id, type: 'network_change', at: now.getTime(), q: null, data: {}, snapshot_id: null, received_at: now, purge_at: purgeAt })
  }
  if (docs.length) await (await eventsCol()).insertMany(docs, { ordered: false })
  const inc: Record<string, number> = {}
  for (const d of docs) inc[`counts.${d.type}`] = (inc[`counts.${d.type}`] ?? 0) + 1
  await attempts.updateOne({ id: key }, { ...(Object.keys(inc).length ? { $inc: inc } : {}), $set: { ...(h ? { last_ip_hash: h } : {}) } })
  if (t.kind === 'drive') {
    // Live drive control room: count incidents on the candidate row (grid status + flags stream).
    const incidents = docs.filter((d) => EVENT_TYPES[d.type as keyof typeof EVENT_TYPES] && d.type !== 'typing_summary').length
    if (incidents) void import('@/lib/live-drives/service').then((m) => m.countIntegrityIncidents(t.id, user.id, incidents)).catch(() => {})
  }
  return ok({ accepted: docs.length, dropped: dropped + (events.length - kept.length), need_consent: !consented })
}

const SnapshotBody = z.object({
  target_kind: z.enum(TARGET_KINDS),
  target_id: z.string().regex(ID_RE),
  reason: z.string().max(32),
  at: z.number().finite().optional(),
  image: z.string().max(Math.ceil(MAX_SNAPSHOT_BYTES * 1.4) + 64),
})

export async function storeSnapshot(user: Who, raw: unknown): Promise<ServiceResult<{ id: string }>> {
  const body = SnapshotBody.safeParse(raw)
  if (!body.success) return fail(400, 'Invalid snapshot')
  if (!(SNAPSHOT_REASONS as string[]).includes(body.data.reason)) return fail(400, 'Invalid snapshot reason')
  const rl = rateLimitSlidingWindow(`integrity-snap:${user.id}`, 30, 10 * 60_000)
  if (!rl.ok) return fail(429, 'Too many snapshots')
  const t = await loadTarget(body.data.target_kind, body.data.target_id)
  if (!t) return fail(404, 'Not found')
  const settings = await getSettings(t.kind, t.id)
  if (!settings.enabled || !settings.snapshots_on_violation || !needsCamera(settings)) return fail(409, 'Snapshots are off for this test.')
  const attempt = await runningAttempt(user, t)
  if (!attempt.ok) return attempt
  const a = await (await attemptsCol()).findOne({ id: attempt.data.key }, { projection: { _id: 0, consented_at: 1, snapshot_count: 1 } })
  if (!a?.consented_at) return fail(409, 'Consent first.')
  if ((a.snapshot_count ?? 0) >= MAX_SNAPSHOTS_PER_ATTEMPT) return fail(429, 'Snapshot limit reached for this attempt.')

  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(body.data.image)
  if (!m) return fail(400, 'Snapshots must be JPEG images.')
  const bytes = Buffer.from(m[1], 'base64')
  // ponytail: no virus scan — a server-validated JPEG from the candidate's own camera,
  // only ever served back as image/jpeg with nosniff to staff. Magic bytes + size cap instead.
  if (bytes.length < 200 || bytes.length > MAX_SNAPSHOT_BYTES || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return fail(400, 'Invalid image.')

  const { window } = attempt.data
  const at = typeof body.data.at === 'number' && body.data.at >= window.from && body.data.at <= window.to ? Math.round(body.data.at) : Date.now()
  const stored = await putBlob({ feature: 'integrity', tenantId: t.tenant_id, bytes, contentType: 'image/jpeg' })
  const now = new Date()
  const doc: SnapshotDoc = {
    id: `isnap_${randomBytes(12).toString('hex')}`,
    attempt_id: attempt.data.key, target_kind: t.kind, target_id: t.id, tenant_id: t.tenant_id, user_id: user.id,
    reason: body.data.reason, at, size: bytes.length,
    ...(stored.storage === 's3' ? { storage: 's3' as const, s3_key: stored.s3_key } : { storage: 'db' as const, data: stored.data }),
    created_at: now, purge_at: new Date(now.getTime() + settings.snapshot_retention_days * DAY),
  }
  await (await snapshotsCol()).insertOne(doc)
  await (await attemptsCol()).updateOne({ id: attempt.data.key }, { $inc: { snapshot_count: 1 } })
  return ok({ id: doc.id })
}

// ─── Reviewer reads ──────────────────────────────────────────────────────────

export interface AttemptRow {
  id: string
  user_id: string
  name: string
  email: string
  attempt_no: number
  consented: boolean
  first_at: string
  last_at: string
  snapshot_count: number
  review: AttemptDoc['review']
  trust: Pick<TrustResult, 'score' | 'band' | 'incidents' | 'by_type'>
}

async function userNames(ids: string[]): Promise<Map<string, { name: string; email: string }>> {
  if (!ids.length) return new Map()
  const db = await getMongoDb()
  const rows = await db.collection('user').find({ id: { $in: ids } }, { projection: { _id: 0, id: 1, fullName: 1, name: 1, email: 1 } }).toArray()
  return new Map(rows.map((u) => [String(u.id), { name: String(u.fullName || u.name || u.email || 'Candidate'), email: String(u.email || '') }]))
}
export { userNames as integrityUserNames }

const NON_SCORING = ['typing_summary']

/** Every attempt of a test / contest with its trust score (lowest first). */
export async function listAttempts(t: Target, opts: { limit?: number } = {}): Promise<AttemptRow[]> {
  const attempts = await (await attemptsCol()).find({ target_kind: t.kind, target_id: t.id }, { projection: { _id: 0, last_ip_hash: 0 } })
    .sort({ last_at: -1 }).limit(Math.min(1000, opts.limit ?? 500)).toArray()
  if (!attempts.length) return []
  const events = await (await eventsCol()).find(
    { attempt_id: { $in: attempts.map((a) => a.id) }, type: { $nin: NON_SCORING } },
    { projection: { _id: 0, attempt_id: 1, type: 1, at: 1, data: 1 } },
  ).limit(50_000).toArray()
  const byAttempt = new Map<string, EventDoc[]>()
  for (const e of events) { const l = byAttempt.get(e.attempt_id); if (l) l.push(e as EventDoc); else byAttempt.set(e.attempt_id, [e as EventDoc]) }
  const names = await userNames([...new Set(attempts.map((a) => a.user_id))])
  return attempts.map((a) => {
    const trust = computeTrustScore((byAttempt.get(a.id) ?? []).map((e) => ({ type: e.type, at: e.at, data: e.data })))
    const n = names.get(a.user_id)
    return {
      id: a.id, user_id: a.user_id, name: n?.name || 'Candidate', email: n?.email || '', attempt_no: a.attempt_no,
      consented: !!a.consented_at, first_at: a.first_at, last_at: a.last_at, snapshot_count: a.snapshot_count ?? 0,
      review: a.review ?? { status: 'unreviewed', note: '', by: null, at: null },
      trust: { score: trust.score, band: trust.band, incidents: trust.incidents, by_type: trust.by_type },
    }
  }).sort((x, y) => x.trust.score - y.trust.score)
}

export interface AttemptDetail {
  attempt: AttemptRow
  trust: TrustResult
  snapshots: Array<{ id: string; reason: string; at: number }>
  typing: Array<{ q: string; summary: CadenceSummary }>
}

/** One attempt's timeline (snapshots linked to the nearest same-type event). */
export async function attemptDetail(t: Target, attemptId: string): Promise<ServiceResult<AttemptDetail>> {
  if (!/^ia_[0-9a-f]{32}$/.test(attemptId)) return fail(400, 'Invalid attempt')
  const a = await (await attemptsCol()).findOne({ id: attemptId, target_kind: t.kind, target_id: t.id }, { projection: { _id: 0, last_ip_hash: 0 } })
  if (!a) return fail(404, 'Attempt not found')
  const [events, snaps] = await Promise.all([
    (await eventsCol()).find({ attempt_id: attemptId }, { projection: { _id: 0 } }).sort({ at: 1 }).limit(5000).toArray(),
    (await snapshotsCol()).find({ attempt_id: attemptId }, { projection: { _id: 0, id: 1, reason: 1, at: 1 } }).sort({ at: 1 }).limit(MAX_SNAPSHOTS_PER_ATTEMPT).toArray(),
  ])
  const scoring = events.filter((e) => !NON_SCORING.includes(e.type))
  // Link each snapshot to the closest event of its reason (± 30 s).
  const linked = new Map<number, string>()
  for (const s of snaps) {
    let best = -1, dist = 30_001
    scoring.forEach((e, i) => { const d = Math.abs(e.at - s.at); if (e.type === s.reason && d < dist && !linked.has(i)) { best = i; dist = d } })
    if (best >= 0) linked.set(best, s.id)
  }
  const trust = computeTrustScore(scoring.map((e, i) => ({ type: e.type, at: e.at, data: e.data, q: e.q, snapshot_id: linked.get(i) ?? null })))
  const typingByQ = new Map<string, Partial<CadenceSummary>[]>()
  for (const e of events) if (e.type === 'typing_summary') { const q = e.q || '_'; const l = typingByQ.get(q) ?? []; l.push(e.data as Partial<CadenceSummary>); typingByQ.set(q, l) }
  const n = (await userNames([a.user_id])).get(a.user_id)
  return ok({
    attempt: {
      id: a.id, user_id: a.user_id, name: n?.name || 'Candidate', email: n?.email || '', attempt_no: a.attempt_no, consented: !!a.consented_at,
      first_at: a.first_at, last_at: a.last_at, snapshot_count: a.snapshot_count ?? 0, review: a.review,
      trust: { score: trust.score, band: trust.band, incidents: trust.incidents, by_type: trust.by_type },
    },
    trust,
    snapshots: snaps.map((s) => ({ id: s.id, reason: s.reason, at: s.at })),
    typing: [...typingByQ].map(([q, list]) => ({ q, summary: mergeCadence(list) })),
  })
}

const ReviewBody = z.object({ status: z.enum(REVIEW_STATUSES as [ReviewStatus, ...ReviewStatus[]]), note: z.string().max(2000).optional() }).strict()

export async function setAttemptReview(user: Who, t: Target, attemptId: string, raw: unknown): Promise<ServiceResult<AttemptDoc['review']>> {
  if (!/^ia_[0-9a-f]{32}$/.test(attemptId)) return fail(400, 'Invalid attempt')
  const b = ReviewBody.safeParse(raw)
  if (!b.success) return fail(400, 'Choose reviewed, cleared or flagged.')
  const review = { status: b.data.status, note: (b.data.note ?? '').trim(), by: user.id, at: nowIso() }
  const r = await (await attemptsCol()).updateOne({ id: attemptId, target_kind: t.kind, target_id: t.id }, { $set: { review } })
  if (!r.matchedCount) return fail(404, 'Attempt not found')
  return ok(review)
}

/** A snapshot for staff: a short presigned URL (S3) or the bytes (Mongo). */
export async function snapshotForStaff(user: Who, snapshotId: string): Promise<ServiceResult<{ url: string } | { bytes: Buffer }>> {
  if (!/^isnap_[0-9a-f]{24}$/.test(snapshotId)) return fail(400, 'Invalid snapshot')
  const s = await (await snapshotsCol()).findOne({ id: snapshotId }, { projection: { _id: 0 } })
  if (!s) return fail(404, 'Snapshot not found')
  const t = await loadStaffTarget(user, s.target_kind, s.target_id)
  if (!t.ok) return t
  const url = await blobDownloadUrl(s, `${snapshotId}.jpg`, 'image/jpeg')
  if (url) return ok({ url })
  const bytes = await readBlob(s)
  if (!bytes) return fail(404, 'Snapshot not found')
  return ok({ bytes })
}

// ─── Retention ───────────────────────────────────────────────────────────────

/** Delete expired snapshots (bytes first, then rows). Events and attempts expire by TTL. */
export async function purgeExpiredSnapshots(now = new Date(), limit = 500): Promise<number> {
  const col = await snapshotsCol()
  const ids = (await col.find({ purge_at: { $lte: now } }, { projection: { _id: 0, id: 1 } }).limit(limit).toArray()).map((s) => s.id)
  if (!ids.length) return 0
  const failed = await deleteBlobsFor(col, { id: { $in: ids } })
  if (failed) logger.warn(`[integrity] ${failed} snapshot object(s) could not be deleted; retrying next sweep`)
  const r = await col.deleteMany({ id: { $in: ids }, ...(failed ? { storage: { $ne: 's3' } } : {}) })
  return r.deletedCount ?? 0
}

export { stripId }
