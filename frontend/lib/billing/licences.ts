/**
 * College / company licences (server). Rules in ./licence-rules.ts.
 *
 *   billing_licences       { id, org_id, org_name, org_kind, plan_key, seats, seats_used, currency,
 *                            seat_price_minor, status: pending|active|expired|cancelled, starts_at, ends_at,
 *                            email_domains[], auto_assign, order_ids[], source: checkout|manual, created_by, created_at }
 *   billing_licence_seats  { id, licence_id, org_id, email, user_id|null, status: assigned|revoked,
 *                            via: csv|domain|admin, assigned_at, assigned_by, revoked_at? }
 *
 * Seat counting is atomic: `seats_used` is only incremented while it is below
 * `seats`, and a (licence, email) pair can hold one assigned seat (unique index).
 */
import 'server-only'
import { getMongoDb } from '@/lib/mongodb'
import { newId, nowIso, type BillingOrderDoc } from '@/lib/db/billing'
import { domainMatches, emailDomain, LICENCE_PLAN_KEY, licenceAmount, licenceLive, normDomain, normEmail, planSeatAssignment, renewalEnd, seatsFree } from './licence-rules'
import { getBillingSettings } from './settings'

export interface LicenceDoc {
  id: string
  org_id: string
  org_name: string
  org_kind: 'college' | 'company'
  plan_key: string
  seats: number
  seats_used: number
  currency: 'INR' | 'USD'
  seat_price_minor: number
  status: 'pending' | 'active' | 'expired' | 'cancelled'
  starts_at: string | null
  ends_at: string | null
  email_domains: string[]
  auto_assign: boolean
  order_ids: string[]
  source: 'checkout' | 'manual'
  created_by: string
  created_at: string
  updated_at: string
}

export interface SeatDoc {
  id: string
  licence_id: string
  org_id: string
  email: string
  user_id: string | null
  status: 'assigned' | 'revoked'
  via: 'csv' | 'domain' | 'admin'
  assigned_at: string
  assigned_by: string
  revoked_at?: string
}

let ready: Promise<void> | null = null
export async function licencesCol() {
  const db = await getMongoDb()
  const l = db.collection<LicenceDoc>('billing_licences')
  const s = db.collection<SeatDoc>('billing_licence_seats')
  if (!ready) {
    ready = Promise.all([
      l.createIndex({ id: 1 }, { unique: true, name: 'billing_licences_id_unique' }),
      l.createIndex({ org_id: 1, status: 1 }, { name: 'billing_licences_org' }),
      l.createIndex({ email_domains: 1, status: 1 }, { name: 'billing_licences_domains' }),
      s.createIndex({ licence_id: 1, email: 1 }, { unique: true, name: 'billing_licence_seats_assigned_unique', partialFilterExpression: { status: 'assigned' } }),
      s.createIndex({ user_id: 1, status: 1 }, { name: 'billing_licence_seats_user' }),
      s.createIndex({ email: 1, status: 1 }, { name: 'billing_licence_seats_email' }),
    ]).then(() => undefined).catch((e) => {
      ready = null
      console.error('[licences] index setup failed:', (e as Error)?.message)
    })
  }
  await ready
  return { licences: l, seats: s }
}

const clean = <T extends object>(d: T | null): T | null => {
  if (!d) return null
  const { _id, ...rest } = d as T & { _id?: unknown }
  return rest as T
}

export async function orgInfo(orgId: string): Promise<{ name: string; kind: 'college' | 'company' } | null> {
  const db = await getMongoDb()
  const t = await db.collection('tenants').findOne({ id: orgId }, { projection: { _id: 0, name: 1, kind: 1 } })
  if (!t) return null
  return { name: String(t.name || ''), kind: t.kind === 'college' ? 'college' : 'company' }
}

export async function listOrgLicences(orgId: string): Promise<LicenceDoc[]> {
  const { licences } = await licencesCol()
  return licences.find({ org_id: orgId, status: { $ne: 'pending' } }, { projection: { _id: 0 } }).sort({ created_at: -1 }).limit(50).toArray()
}

export async function getLicence(id: string, orgId?: string | null): Promise<LicenceDoc | null> {
  const { licences } = await licencesCol()
  return clean(await licences.findOne({ id, ...(orgId ? { org_id: orgId } : {}) }))
}

/** A pending licence (new) or the existing one (renewal / seat change), priced from settings. */
export async function prepareLicencePurchase(input: { orgId: string; seats: number; currency: 'INR' | 'USD'; licenceId?: string; actorId: string }): Promise<
  { ok: true; licence: LicenceDoc; amount: number } | { ok: false; code: 'org_not_found' | 'licence_not_found' | 'min_seats' | 'seats_below_used' }
> {
  const org = await orgInfo(input.orgId)
  if (!org) return { ok: false, code: 'org_not_found' }
  const settings = await getBillingSettings()
  if (input.seats < settings.licence_min_seats) return { ok: false, code: 'min_seats' }
  const price = settings.licence_seat_price_minor[input.currency]
  const { licences } = await licencesCol()
  const ts = nowIso()
  let licence: LicenceDoc | null
  if (input.licenceId) {
    licence = await getLicence(input.licenceId, input.orgId)
    if (!licence) return { ok: false, code: 'licence_not_found' }
    if (input.seats < licence.seats_used) return { ok: false, code: 'seats_below_used' }
  } else {
    licence = {
      id: newId(), org_id: input.orgId, org_name: org.name, org_kind: org.kind, plan_key: LICENCE_PLAN_KEY,
      seats: input.seats, seats_used: 0, currency: input.currency, seat_price_minor: price, status: 'pending',
      starts_at: null, ends_at: null, email_domains: [], auto_assign: false, order_ids: [], source: 'checkout',
      created_by: input.actorId, created_at: ts, updated_at: ts,
    }
    await licences.insertOne({ ...licence })
  }
  return { ok: true, licence, amount: licenceAmount(input.seats, price) }
}

/** Paid licence order → activate or renew (a year from the later of now and the current end). Once per order. */
export async function activateLicenceOrder(order: BillingOrderDoc): Promise<void> {
  if (!order.licence_id) return
  const { licences } = await licencesCol()
  const lic = await licences.findOne({ id: order.licence_id })
  if (!lic || lic.order_ids?.includes(order.id)) return
  const { stillLive, end } = renewalEnd(lic.status === 'active' ? lic.ends_at : null)
  const ts = nowIso()
  await licences.updateOne(
    { id: lic.id, order_ids: { $ne: order.id } },
    {
      $set: {
        status: 'active',
        seats: Math.max(order.licence_seats || lic.seats, lic.seats_used),
        ends_at: end,
        ...(stillLive ? {} : { starts_at: ts }),
        updated_at: ts,
      },
      $addToSet: { order_ids: order.id },
    },
  )
}

/** Superadmin: a licence paid offline (bank transfer / PO). */
export async function issueManualLicence(input: { orgId: string; seats: number; currency: 'INR' | 'USD'; endsAt: string; actorId: string }): Promise<LicenceDoc | null> {
  const org = await orgInfo(input.orgId)
  if (!org) return null
  const settings = await getBillingSettings()
  const ts = nowIso()
  const doc: LicenceDoc = {
    id: newId(), org_id: input.orgId, org_name: org.name, org_kind: org.kind, plan_key: LICENCE_PLAN_KEY,
    seats: input.seats, seats_used: 0, currency: input.currency, seat_price_minor: settings.licence_seat_price_minor[input.currency],
    status: 'active', starts_at: ts, ends_at: input.endsAt, email_domains: [], auto_assign: false, order_ids: [], source: 'manual',
    created_by: input.actorId, created_at: ts, updated_at: ts,
  }
  const { licences } = await licencesCol()
  await licences.insertOne({ ...doc })
  return doc
}

export async function updateLicenceSettings(licenceId: string, orgId: string | null, patch: { email_domains?: string[]; auto_assign?: boolean }): Promise<LicenceDoc | null> {
  const $set: Record<string, unknown> = { updated_at: nowIso() }
  if (patch.email_domains) $set.email_domains = [...new Set(patch.email_domains.map(normDomain).filter((d): d is string => !!d))].slice(0, 10)
  if (patch.auto_assign !== undefined) $set.auto_assign = patch.auto_assign
  const { licences } = await licencesCol()
  await licences.updateOne({ id: licenceId, ...(orgId ? { org_id: orgId } : {}) }, { $set })
  return getLicence(licenceId, orgId)
}

async function userIdForEmail(email: string): Promise<string | null> {
  const u = await (await getMongoDb()).collection('user').findOne({ email }, { projection: { id: 1, _id: 1 } })
  return u ? String(u.id || u._id) : null
}

/** Take one seat atomically (false = licence full or not live). */
async function claimSeatCount(licenceId: string): Promise<boolean> {
  const { licences } = await licencesCol()
  const r = await licences.updateOne(
    { id: licenceId, status: 'active', ends_at: { $gt: nowIso() }, $expr: { $lt: ['$seats_used', '$seats'] } } as never,
    { $inc: { seats_used: 1 } },
  )
  return r.modifiedCount > 0
}

async function releaseSeatCount(licenceId: string): Promise<void> {
  const { licences } = await licencesCol()
  await licences.updateOne({ id: licenceId, seats_used: { $gt: 0 } }, { $inc: { seats_used: -1 } })
}

async function insertSeat(lic: LicenceDoc, email: string, via: SeatDoc['via'], actor: string, userId?: string | null): Promise<boolean> {
  if (!(await claimSeatCount(lic.id))) return false
  const { seats } = await licencesCol()
  try {
    await seats.insertOne({
      id: newId(), licence_id: lic.id, org_id: lic.org_id, email, user_id: userId ?? (await userIdForEmail(email)),
      status: 'assigned', via, assigned_at: nowIso(), assigned_by: actor,
    })
    return true
  } catch (e) {
    await releaseSeatCount(lic.id)
    if ((e as { code?: number })?.code === 11000) return false
    throw e
  }
}

export interface AssignResult { assigned: string[]; skipped: string[]; overLimit: string[] }

export async function assignSeats(licenceId: string, orgId: string | null, emails: string[], actorId: string): Promise<AssignResult | null> {
  const lic = await getLicence(licenceId, orgId)
  if (!lic || !licenceLive(lic)) return null
  const { seats } = await licencesCol()
  const existing = new Set((await seats.find({ licence_id: lic.id, status: 'assigned', email: { $in: emails } }, { projection: { email: 1 } }).toArray()).map((s) => s.email))
  const planned = planSeatAssignment(emails, existing, seatsFree(lic))
  const assigned: string[] = []
  const overLimit = [...planned.overLimit]
  for (const e of planned.assign) {
    if (await insertSeat(lic, e, 'csv', actorId)) assigned.push(e)
    else overLimit.push(e)
  }
  return { assigned, skipped: planned.skipped, overLimit }
}

export async function revokeSeat(licenceId: string, orgId: string | null, email: string): Promise<boolean> {
  const e = normEmail(email)
  if (!e) return false
  const { seats } = await licencesCol()
  const lic = await getLicence(licenceId, orgId)
  if (!lic) return false
  const r = await seats.updateOne({ licence_id: lic.id, email: e, status: 'assigned' }, { $set: { status: 'revoked', revoked_at: nowIso() } })
  if (r.modifiedCount) await releaseSeatCount(lic.id)
  return r.modifiedCount > 0
}

export async function listSeats(licenceId: string, orgId: string | null, opts: { status?: 'assigned' | 'revoked'; limit?: number } = {}): Promise<SeatDoc[]> {
  const { seats } = await licencesCol()
  return seats
    .find({ licence_id: licenceId, ...(orgId ? { org_id: orgId } : {}), status: opts.status ?? 'assigned' }, { projection: { _id: 0 } })
    .sort({ assigned_at: -1 })
    .limit(Math.min(opts.limit ?? 500, 5000))
    .toArray()
}

/**
 * The live licence giving this person a seat, if any. Links a seat assigned
 * by email to the account, and claims a seat for an auto-assign domain.
 */
export async function licenceSeatFor(userId: string, email: string | null | undefined): Promise<LicenceDoc | null> {
  const { licences, seats } = await licencesCol()
  const e = normEmail(email)
  const rows = await seats.find({ status: 'assigned', $or: [{ user_id: userId }, ...(e ? [{ email: e }] : [])] }, { projection: { _id: 0 } }).limit(10).toArray()
  for (const s of rows) {
    const lic = await licences.findOne({ id: s.licence_id }, { projection: { _id: 0 } })
    if (licenceLive(lic)) {
      if (!s.user_id) await seats.updateOne({ id: s.id, user_id: null }, { $set: { user_id: userId } })
      return lic
    }
  }
  if (!e) return null
  const domain = emailDomain(e)
  const parts = domain.split('.')
  const candidates = parts.map((_, i) => parts.slice(i).join('.')).filter((d) => d.includes('.'))
  const auto = await licences.find({ status: 'active', auto_assign: true, email_domains: { $in: candidates }, ends_at: { $gt: nowIso() } }, { projection: { _id: 0 } }).limit(5).toArray()
  for (const lic of auto) {
    if (!domainMatches(e, lic.email_domains) || seatsFree(lic) <= 0) continue
    if (await insertSeat(lic, e, 'domain', 'system:domain', userId)) return lic
  }
  return null
}

/** Usage numbers for the org dashboard. */
export async function seatUsage(licenceId: string): Promise<{ assigned: number; joined: number; byDomain: number }> {
  const { seats } = await licencesCol()
  const [assigned, joined, byDomain] = await Promise.all([
    seats.countDocuments({ licence_id: licenceId, status: 'assigned' }),
    seats.countDocuments({ licence_id: licenceId, status: 'assigned', user_id: { $ne: null } }),
    seats.countDocuments({ licence_id: licenceId, status: 'assigned', via: 'domain' }),
  ])
  return { assigned, joined, byDomain }
}

/** Daily: mark ended licences expired (entitlements already stop at ends_at). */
export async function expireLicences(now = new Date()): Promise<number> {
  const { licences } = await licencesCol()
  const r = await licences.updateMany({ status: 'active', ends_at: { $lte: now.toISOString() } }, { $set: { status: 'expired', updated_at: now.toISOString() } })
  return r.modifiedCount
}
