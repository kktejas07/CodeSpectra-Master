/**
 * Recruiter talent search — server side (rules in lib/talent/core.ts).
 *
 * Collections:
 *   skill_passports.talent   opt-in state on the learner's passport (lib/passport/db.ts)
 *   talent_invites           recruiter → learner invites (test / job / interview)
 *   talent_invite_quota      {_id: "<tenant>:<YYYY-MM>", used} per-tenant monthly cap
 *   talent_reports           learner reports about a recruiter organisation
 *   talent_settings          {_id: 'global'} caps + on/off (superadmin)
 * Every search and invite is written to the admin audit log (admin_audit_logs).
 */
import 'server-only'
import type { Collection } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'
import { newId, nowIso } from '@/lib/db/ids'
import { rateLimitRedis } from '@/lib/upstash-rate-limit'
import { writeAuditLog } from '@/lib/db/misc'
import { auditAts } from '@/lib/ats/access'
import type { AtsActor, AtsJob } from '@/lib/ats/contract'
import { passports, getOrCreatePassport, type PassportDoc, type TalentProfileDoc } from '@/lib/passport/db'
import { revalidatePassport } from '@/lib/cache/passport'
import {
  CONSENT_VERSION, DEFAULT_TALENT_SETTINGS, INVITE_TARGET_LABELS, INVITE_TTL_DAYS, buildSearchFilter, canRespond, consentRegime,
  contactFor, monthKey, normalizeTalentSettings, rankResults, toTalentResult,
  type InviteStatus, type InviteTarget, type SendInviteInput, type TalentProfileInput, type TalentResult, type TalentSearchInput, type TalentSettings,
} from './core'

export class TalentError extends Error {
  /** `code` / `params`: error code for the UI's translation (lib/api-errors); inferred from the message when omitted. */
  constructor(message: string, public status: number, public retryAfterSec?: number, public code?: string, public params?: Record<string, string | number>) { super(message) }
}

export interface TalentInviteDoc {
  id: string
  tenant_id: string
  tenant_name: string
  recruiter_id: string
  recruiter_name: string
  learner_id: string
  handle: string
  target_type: InviteTarget
  target_id: string
  target_title: string
  message: string | null
  status: InviteStatus
  created_at: string
  expires_at: string
  responded_at?: string | null
  /** What accepting set up (assessment invite id / ATS application id) or why it failed. */
  fulfilment?: { ok: boolean; ref?: string | null; error?: string | null } | null
}

type Doc = Record<string, any>

let indexes: Promise<unknown> | null = null
async function col<T extends object>(name: string): Promise<Collection<T>> {
  const db = await getMongoDb()
  if (!indexes) {
    indexes = Promise.all([
      db.collection('talent_invites').createIndex({ id: 1 }, { unique: true }),
      db.collection('talent_invites').createIndex({ learner_id: 1, created_at: -1 }),
      db.collection('talent_invites').createIndex({ tenant_id: 1, created_at: -1 }),
      // One open invite per tenant + learner + target (double clicks, retries).
      db.collection('talent_invites').createIndex(
        { tenant_id: 1, learner_id: 1, target_type: 1, target_id: 1 },
        { unique: true, partialFilterExpression: { status: 'pending' } },
      ),
      db.collection('talent_reports').createIndex({ created_at: -1 }),
      db.collection('talent_reports').createIndex({ tenant_id: 1, created_at: -1 }),
    ]).catch((e) => {
      indexes = null
      console.error('[talent] index build failed:', (e as Error)?.message)
    })
  }
  await indexes
  return db.collection<T>(name)
}
export const talentInvites = () => col<TalentInviteDoc>('talent_invites')

// ─── Settings ───────────────────────────────────────────────────────────────

export async function getTalentSettings(): Promise<TalentSettings> {
  const db = await getMongoDb()
  const doc = await db.collection<{ _id: string }>('talent_settings').findOne({ _id: 'global' })
  return doc ? normalizeTalentSettings(doc) : { ...DEFAULT_TALENT_SETTINGS }
}

export async function saveTalentSettings(patch: Partial<TalentSettings>, actorId: string): Promise<TalentSettings> {
  const db = await getMongoDb()
  await db.collection<{ _id: string }>('talent_settings').updateOne({ _id: 'global' }, { $set: { ...patch, updated_at: nowIso(), updated_by: actorId } }, { upsert: true })
  return getTalentSettings()
}

// ─── Learner: opt-in profile ────────────────────────────────────────────────

export interface TalentProfileView {
  discoverable: boolean
  consented_at: string | null
  regime: string
  city: string | null
  country: string | null
  graduation_year: number | null
  availability: string | null
  blocked: Array<{ tenant_id: string; name: string }>
}

async function tenantNames(ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map()
  const db = await getMongoDb()
  const rows = await db.collection('tenants').find({ id: { $in: ids } }, { projection: { _id: 0, id: 1, name: 1 } }).toArray()
  return new Map(rows.map((r) => [String(r.id), String(r.name || 'Organisation')]))
}

export async function talentProfileView(p: PassportDoc, countryHint: string | null): Promise<TalentProfileView> {
  const t: TalentProfileDoc = p.talent || { discoverable: false }
  const blocked = t.blocked_tenants || []
  const names = await tenantNames(blocked)
  return {
    discoverable: !!t.discoverable,
    consented_at: t.consent?.at ?? null,
    regime: t.consent?.regime ?? consentRegime(t.country || countryHint),
    city: t.city ?? null,
    country: t.country ?? null,
    graduation_year: t.graduation_year ?? null,
    availability: t.availability ?? null,
    blocked: blocked.map((id) => ({ tenant_id: id, name: names.get(id) || 'Organisation' })),
  }
}

/** Opt in (needs consent: true), update details, or withdraw (discoverable: false). */
export async function updateTalentProfile(userId: string, input: TalentProfileInput, countryHint: string | null): Promise<PassportDoc> {
  const p = await getOrCreatePassport(userId)
  const now = nowIso()
  const $set: Record<string, unknown> = { updated_at: now }
  const $push: Record<string, unknown> = {}
  const country = input.country !== undefined ? input.country : p.talent?.country ?? null
  if (input.city !== undefined) $set['talent.city'] = input.city || null
  if (input.country !== undefined) $set['talent.country'] = input.country || null
  if (input.graduation_year !== undefined) $set['talent.graduation_year'] = input.graduation_year
  if (input.availability !== undefined) $set['talent.availability'] = input.availability
  const wasOn = !!p.talent?.discoverable
  if (input.discoverable && !wasOn) {
    if (input.consent !== true) throw new TalentError('Tick the consent box to become discoverable.', 400)
    if (p.visibility === 'private') throw new TalentError('Share your passport (link-only or public) before turning on discovery — recruiters see the shared view.', 400)
    const regime = consentRegime(country || countryHint)
    $set['talent.discoverable'] = true
    $set['talent.consent'] = { at: now, version: CONSENT_VERSION, regime, country: country || countryHint || null }
    $set['talent.withdrawn_at'] = null
    $push.consent_log = { $each: [{ at: now, action: 'granted', version: CONSENT_VERSION, regime }], $slice: -20 }
  } else if (!input.discoverable && wasOn) {
    // Withdrawal takes effect at once: search requires talent.consent.at.
    $set['talent.discoverable'] = false
    $set['talent.consent'] = null
    $set['talent.withdrawn_at'] = now
    $push.consent_log = { $each: [{ at: now, action: 'withdrawn', version: CONSENT_VERSION }], $slice: -20 }
  }
  const c = await passports()
  await c.updateOne({ user_id: userId }, { $set, ...(Object.keys($push).length ? { $push } : {}) } as never)
  const after = await c.findOne({ user_id: userId }, { projection: { _id: 0 } })
  if (!after) throw new TalentError('Passport not found', 404)
  return after
}

// ─── Recruiter: search ──────────────────────────────────────────────────────

async function limitOrThrow(key: string, max: number, windowMs: number, msg: string) {
  const rl = await rateLimitRedis(key, max, windowMs)
  if (!rl.ok) throw new TalentError(msg, 429, rl.retryAfterSec)
}

export async function searchTalent(actor: AtsActor, q: TalentSearchInput, req?: Request): Promise<{ total: number; page: number; results: TalentResult[] }> {
  const settings = await getTalentSettings()
  if (!settings.enabled) throw new TalentError('Talent search is turned off on this platform.', 403)
  await limitOrThrow(`talent-search:${actor.userId}`, settings.searches_per_hour_per_user, 3_600_000, 'Too many searches. Try again later.')
  const filter = buildSearchFilter(q, actor.tenantId)
  const rows = await (await passports()).find(filter as never, {
    // Summary fields only — no user id, consent record or block list leave the server.
    projection: { _id: 0, handle: 1, display_name: 1, skills_index: 1, computed_at: 1, 'talent.city': 1, 'talent.country': 1, 'talent.graduation_year': 1, 'talent.availability': 1 },
  }).sort({ computed_at: -1 }).limit(500).toArray()
  const ranked = rankResults(rows.map((r) => toTalentResult(r as Doc, q.skills)))
  const page = ranked.slice((q.page - 1) * q.limit, q.page * q.limit)
  // Audit: the query (skills/filters), never the people returned.
  const detail = JSON.stringify({ skills: q.skills, min_level: q.min_level, country: q.country ?? null, years: [q.graduation_year_min ?? null, q.graduation_year_max ?? null], availability: q.availability ?? null, results: ranked.length })
  void auditAts(actor, 'talent.search', 'talent_search', actor.tenantId, detail, req).catch(() => {})
  return { total: ranked.length, page: q.page, results: page }
}

/** One discoverable passport (recruiter view): same fields as a search row. */
export async function talentByHandle(actor: AtsActor, handle: string): Promise<TalentResult | null> {
  const filter = buildSearchFilter({ skills: [], min_level: 'beginner', page: 1, limit: 1 }, actor.tenantId)
  const row = await (await passports()).findOne({ $and: [filter, { handle }] } as never, {
    projection: { _id: 0, handle: 1, display_name: 1, skills_index: 1, computed_at: 1, 'talent.city': 1, 'talent.country': 1, 'talent.graduation_year': 1, 'talent.availability': 1 },
  })
  return row ? toTalentResult(row as Doc, []) : null
}

// ─── Recruiter: invites ─────────────────────────────────────────────────────

async function reserveQuota(tenantId: string, limit: number): Promise<string> {
  const db = await getMongoDb()
  const q = db.collection<{ _id: string; used: number; tenant_id: string; month: string }>('talent_invite_quota')
  const key = `${tenantId}:${monthKey()}`
  try {
    await q.updateOne({ _id: key }, { $setOnInsert: { used: 0, tenant_id: tenantId, month: monthKey() } }, { upsert: true })
  } catch (e) {
    if ((e as { code?: number })?.code !== 11000) throw e
  }
  const r = await q.updateOne({ _id: key, used: { $lt: limit } }, { $inc: { used: 1 } })
  if (r.matchedCount !== 1) throw new TalentError(`Your organisation has used all ${limit} talent invites for this month.`, 402, undefined, 'talent_invite_quota', { limit })
  return key
}
async function releaseQuota(key: string) {
  const db = await getMongoDb()
  await db.collection<{ _id: string; used: number }>('talent_invite_quota').updateOne({ _id: key, used: { $gt: 0 } }, { $inc: { used: -1 } }).catch(() => {})
}

export async function quotaState(tenantId: string): Promise<{ used: number; limit: number; month: string }> {
  const [settings, db] = await Promise.all([getTalentSettings(), getMongoDb()])
  const doc = await db.collection<{ _id: string; used: number }>('talent_invite_quota').findOne({ _id: `${tenantId}:${monthKey()}` })
  return { used: Number(doc?.used || 0), limit: settings.monthly_invites_per_tenant, month: monthKey() }
}

async function resolveTarget(actor: AtsActor, type: InviteTarget, id: string): Promise<string> {
  if (type === 'test') {
    const db = await getMongoDb()
    const exam = await db.collection('exams').findOne({ id, tenant_id: actor.tenantId, status: 'available' }, { projection: { _id: 0, title: 1 } })
    if (!exam) throw new TalentError('Pick one of your organisation’s published tests.', 404)
    return String(exam.title || 'Assessment').slice(0, 200)
  }
  const { loadJob } = await import('@/lib/ats/http')
  let job: AtsJob
  try {
    job = await loadJob(actor, id)
  } catch {
    throw new TalentError('Pick one of your open jobs.', 404)
  }
  if (job.status !== 'open') throw new TalentError('That job is not open.', 409)
  return String(job.title || 'Job').slice(0, 200)
}

export async function sendTalentInvite(actor: AtsActor, input: SendInviteInput, req?: Request): Promise<TalentInviteDoc> {
  const settings = await getTalentSettings()
  if (!settings.enabled) throw new TalentError('Talent search is turned off on this platform.', 403)
  await limitOrThrow(`talent-invite:${actor.userId}`, settings.invites_per_day_per_user, 86_400_000, 'You sent a lot of invites today. Try again tomorrow.')
  const filter = buildSearchFilter({ skills: [], min_level: 'beginner', page: 1, limit: 1 }, actor.tenantId)
  const p = await (await passports()).findOne({ $and: [filter, { handle: input.handle }] } as never, { projection: { _id: 0, user_id: 1, handle: 1 } })
  if (!p) throw new TalentError('This learner is not available for invites.', 404)
  const targetTitle = await resolveTarget(actor, input.target_type, input.target_id)
  const db = await getMongoDb()
  const tenant = await db.collection('tenants').findOne({ id: actor.tenantId }, { projection: { _id: 0, name: 1 } })
  const quotaKey = await reserveQuota(actor.tenantId, settings.monthly_invites_per_tenant)
  const now = new Date()
  const doc: TalentInviteDoc = {
    id: newId(),
    tenant_id: actor.tenantId,
    tenant_name: String(tenant?.name || 'An organisation').slice(0, 120),
    recruiter_id: actor.userId,
    recruiter_name: String(actor.name || 'Recruiter').slice(0, 120),
    learner_id: String(p.user_id),
    handle: String(p.handle),
    target_type: input.target_type,
    target_id: input.target_id,
    target_title: targetTitle,
    message: input.message || null,
    status: 'pending',
    created_at: now.toISOString(),
    expires_at: new Date(now.getTime() + INVITE_TTL_DAYS * 86_400_000).toISOString(),
  }
  try {
    await (await talentInvites()).insertOne(doc)
  } catch (e) {
    await releaseQuota(quotaKey)
    if ((e as { code?: number })?.code === 11000) throw new TalentError('You already invited this learner to that. Wait for their answer.', 409)
    throw e
  }
  void auditAts(actor, 'talent.invite', 'talent_invite', doc.id, `${doc.target_type}:${doc.target_id} → ${doc.handle}`, req).catch(() => {})
  void import('@/lib/notifications').then(({ notify }) => notify({
    user_id: doc.learner_id,
    type: 'talent.invite',
    title: `${doc.tenant_name} invited you`,
    message: `${INVITE_TARGET_LABELS[doc.target_type]}: ${doc.target_title}. Your contact details stay private unless you accept.`,
    title_i18n: { key: 'talent.invite.title', params: { org: doc.tenant_name } },
    message_i18n: { key: 'talent.invite.message', params: { target: { t: `talent.target.${doc.target_type}` }, title: doc.target_title } },
    link: '/dashboard/passport#invites',
    icon: 'briefcase',
    send_email: true,
  })).catch(() => {})
  return doc
}

export interface TenantInviteRow extends Omit<TalentInviteDoc, 'learner_id'> {
  learner_name: string
  contact: { email: string | null; phone: string | null } | null
}

async function learnerContact(userId: string): Promise<{ email: string | null; phone: string | null; name: string }> {
  const db = await getMongoDb()
  const [u, ext] = await Promise.all([
    db.collection('user').findOne({ $or: [{ id: userId }, { _id: userId }] } as never, { projection: { email: 1, name: 1, fullName: 1 } }),
    db.collection('user_extended_profiles').findOne({ userId }, { projection: { _id: 0, phone: 1, 'basic.phone': 1 } }),
  ])
  return {
    email: u?.email ? String(u.email).toLowerCase() : null,
    phone: String(ext?.phone || ext?.basic?.phone || '') || null,
    name: String(u?.fullName || u?.name || 'Learner'),
  }
}

/** The tenant's sent invites; contact details only on accepted ones. */
export async function listTenantInvites(actor: AtsActor, limit = 100): Promise<TenantInviteRow[]> {
  const rows = await (await talentInvites()).find({ tenant_id: actor.tenantId }, { projection: { _id: 0 } }).sort({ created_at: -1 }).limit(Math.min(200, limit)).toArray()
  const handles = [...new Set(rows.map((r) => r.handle))]
  const names = new Map((await (await passports()).find({ handle: { $in: handles } }, { projection: { _id: 0, handle: 1, display_name: 1 } }).toArray()).map((p) => [p.handle, p.display_name]))
  const out: TenantInviteRow[] = []
  for (const r of rows) {
    const status: InviteStatus = r.status === 'pending' && Date.parse(r.expires_at) < Date.now() ? 'expired' : r.status
    const { learner_id, ...rest } = r
    out.push({
      ...rest,
      status,
      learner_name: names.get(r.handle) || 'Learner',
      contact: status === 'accepted' ? contactFor({ status }, await learnerContact(learner_id)) : null,
    })
  }
  return out
}

/** Recruiter withdraws a pending invite. */
export async function withdrawInvite(actor: AtsActor, id: string, req?: Request): Promise<void> {
  const r = await (await talentInvites()).updateOne({ id, tenant_id: actor.tenantId, status: 'pending' }, { $set: { status: 'withdrawn', responded_at: nowIso() } })
  if (!r.matchedCount) throw new TalentError('Invite not found or already answered.', 404)
  void auditAts(actor, 'talent.invite_withdraw', 'talent_invite', id, undefined, req).catch(() => {})
}

// ─── Learner: invites ───────────────────────────────────────────────────────

export type LearnerInviteRow = Omit<TalentInviteDoc, 'learner_id' | 'recruiter_id'>

export async function listLearnerInvites(userId: string): Promise<LearnerInviteRow[]> {
  const rows = await (await talentInvites()).find({ learner_id: userId }, { projection: { _id: 0, learner_id: 0, recruiter_id: 0 } }).sort({ created_at: -1 }).limit(100).toArray()
  return rows.map((r) => ({ ...r, status: r.status === 'pending' && Date.parse(r.expires_at) < Date.now() ? 'expired' : r.status })) as LearnerInviteRow[]
}

/** Set up what the learner accepted: a test invite or an ATS application. Never throws. */
async function fulfil(inv: TalentInviteDoc, contact: { email: string | null; phone: string | null; name: string }): Promise<NonNullable<TalentInviteDoc['fulfilment']>> {
  try {
    if (!contact.email) return { ok: false, error: 'No email on the learner account' }
    if (inv.target_type === 'test') {
      const db = await getMongoDb()
      const exam = await db.collection('exams').findOne({ id: inv.target_id, tenant_id: inv.tenant_id }, { projection: { _id: 0, id: 1, title: 1, tenant_id: 1 } })
      if (!exam) return { ok: false, error: 'The test is no longer available' }
      const { createBulkInvites, sendQueuedInvites } = await import('@/lib/services/bulk-invites')
      const r = await createBulkInvites(db, {
        exam: { id: String(exam.id), title: exam.title, tenant_id: exam.tenant_id },
        actor: { id: inv.recruiter_id, role: 'tenant_admin', tenantId: inv.tenant_id },
        candidates: [{ email: contact.email, name: contact.name }],
        message: inv.message,
      })
      if (!r.ok) return { ok: false, error: r.error }
      void sendQueuedInvites(db, { limit: 5, batchId: r.batch_id }).catch(() => {})
      return { ok: true, ref: r.created[0]?.id ?? null }
    }
    const [{ atsJobs }, { upsertCandidate, createApplication }] = await Promise.all([import('@/lib/ats/db'), import('@/lib/ats/intake')])
    const job = (await (await atsJobs()).findOne({ id: inv.target_id, tenant_id: inv.tenant_id }, { projection: { _id: 0 } })) as AtsJob | null
    if (!job) return { ok: false, error: 'The job is no longer available' }
    const { candidate } = await upsertCandidate(inv.tenant_id, { name: contact.name, email: contact.email, phone: contact.phone, user_id: inv.learner_id, source: 'talent_pool', tags: ['talent-search'] })
    const { application } = await createApplication(job, candidate, 'talent_pool')
    return { ok: true, ref: application.id }
  } catch (e) {
    console.error('[talent] fulfil failed:', inv.id, (e as Error)?.message)
    return { ok: false, error: 'Could not set this up automatically; the recruiter will follow up.' }
  }
}

export async function respondToInvite(userId: string, id: string, action: 'accept' | 'decline'): Promise<LearnerInviteRow> {
  const c = await talentInvites()
  const inv = await c.findOne({ id, learner_id: userId }, { projection: { _id: 0 } })
  if (!inv) throw new TalentError('Invite not found', 404)
  const ok = canRespond(inv, userId)
  if (!ok.ok) throw new TalentError(ok.error, ok.status)
  const status: InviteStatus = action === 'accept' ? 'accepted' : 'declined'
  const r = await c.updateOne({ id, learner_id: userId, status: 'pending' }, { $set: { status, responded_at: nowIso() } })
  if (!r.matchedCount) throw new TalentError('You already answered this invite.', 409)
  let fulfilment: TalentInviteDoc['fulfilment'] = null
  if (status === 'accepted') {
    fulfilment = await fulfil(inv, await learnerContact(userId))
    await c.updateOne({ id }, { $set: { fulfilment } })
  }
  await writeAuditLog({ action: `talent.invite_${status}`, outcome: 'success', actor: userId, actorIp: '', resource: id, resourceType: 'talent_invite', severity: 'info', user_id: userId, tenant_id: inv.tenant_id })
  void import('@/lib/notifications').then(({ notify }) => notify({
    user_id: inv.recruiter_id,
    type: `talent.invite_${status}`,
    title: status === 'accepted' ? 'Invite accepted' : 'Invite declined',
    message: status === 'accepted'
      ? `A learner accepted your invite (${inv.target_title}). Their contact details are now in Talent search → Sent invites.`
      : `A learner declined your invite (${inv.target_title}).`,
    title_i18n: { key: status === 'accepted' ? 'talent.accepted.title' : 'talent.declined.title' },
    message_i18n: { key: status === 'accepted' ? 'talent.accepted.message' : 'talent.declined.message', params: { title: inv.target_title } },
    link: '/dashboard/hiring/talent?tab=invites',
    icon: status === 'accepted' ? 'check' : 'x',
  })).catch(() => {})
  const { learner_id: _l, recruiter_id: _r, ...rest } = { ...inv, status, fulfilment }
  return rest
}

// ─── Learner: block / report ────────────────────────────────────────────────

export async function blockOrReport(userId: string, input: { tenant_id: string; block: boolean; report: boolean; reason?: string; details?: string; invite_id?: string }): Promise<void> {
  const p = await getOrCreatePassport(userId)
  const known = await (await talentInvites()).findOne({ learner_id: userId, tenant_id: input.tenant_id }, { projection: { _id: 0, id: 1 } })
  // Only organisations that actually contacted you can be blocked/reported (no tenant-id probing).
  if (!known && !(p.talent?.blocked_tenants || []).includes(input.tenant_id)) throw new TalentError('Organisation not found', 404)
  const c = await passports()
  if (input.block) {
    await c.updateOne({ user_id: userId }, { $addToSet: { 'talent.blocked_tenants': input.tenant_id }, $set: { updated_at: nowIso() } } as never)
    await (await talentInvites()).updateMany({ learner_id: userId, tenant_id: input.tenant_id, status: 'pending' }, { $set: { status: 'declined', responded_at: nowIso() } })
  } else {
    await c.updateOne({ user_id: userId }, { $pull: { 'talent.blocked_tenants': input.tenant_id }, $set: { updated_at: nowIso() } } as never)
  }
  if (input.report) {
    const db = await getMongoDb()
    const report = { id: newId(), tenant_id: input.tenant_id, reporter_id: userId, invite_id: input.invite_id ?? null, reason: input.reason ?? 'other', details: input.details ?? null, status: 'open', created_at: nowIso() }
    await (await col('talent_reports')).insertOne(report as never)
    await writeAuditLog({ action: 'talent.report', outcome: 'success', actor: userId, actorIp: '', resource: input.tenant_id, resourceType: 'tenant', severity: 'warning', detail: report.reason, user_id: userId, tenant_id: input.tenant_id })
    const admins = await db.collection('user').find({ role: 'superadmin' }, { projection: { id: 1, _id: 1 } }).limit(10).toArray()
    const { notify } = await import('@/lib/notifications')
    for (const a of admins) {
      void notify({ user_id: String(a.id || a._id), type: 'talent.report', title: 'Recruiter reported', message: `A learner reported an organisation (${report.reason}).`, link: '/dashboard/admin/talent', icon: 'flag' }).catch(() => {})
    }
  }
  await revalidatePassport(p.handle)
}

export async function listReports(limit = 100): Promise<Doc[]> {
  const rows = await (await col<Doc>('talent_reports')).find({}, { projection: { _id: 0, reporter_id: 0 } }).sort({ created_at: -1 }).limit(Math.min(500, limit)).toArray()
  const names = await tenantNames([...new Set(rows.map((r) => String(r.tenant_id)))])
  return rows.map((r) => ({ ...r, tenant_name: names.get(String(r.tenant_id)) || null }))
}
