/**
 * Mentor sessions = marketplace bookings (lib/marketplace/booking.ts) plus per-booking extras
 * (mentor_session_meta): rescheduling within the mentor's policy, a code-review attachment,
 * disputes (an admin-decided marketplace refund request of type "dispute") and the built-in
 * video room token. Access: the booking's buyer or the mentor (seller owner) only.
 */
import 'server-only'
import { nowIso, productsCol, type BookingDoc, type ProductDoc } from '@/lib/marketplace/db'
import { bookings, slotKey, serviceSpec, takenIntervals } from '@/lib/marketplace/booking'
import { isBookableSlot } from '@/lib/marketplace/slots'
import { orders, type OrderDoc, type OrderLineDoc } from '@/lib/marketplace/order-doc'
import { MktError, availableAtFor, getSettings } from '@/lib/marketplace/settings'
import { linePaid } from '@/lib/marketplace/pricing'
import { getSellerById } from '@/lib/marketplace/sellers'
import { sessionMetaCol } from './db'
import { getMentorBySeller } from './service'
import { isRepoLink, offeringTypeOf, rescheduleEligibility } from './pure'
import { DEFAULT_POLICY, type SessionMeta } from './types'

const ID = /^[A-Za-z0-9_-]{1,80}$/
const JOIN_EARLY_MS = 15 * 60_000
const JOIN_LATE_MS = 30 * 60_000

export type SessionRole = 'buyer' | 'mentor'

interface Loaded { booking: BookingDoc; role: SessionRole; product: ProductDoc | null; order: OrderDoc | null; line: OrderLineDoc | null; meta: SessionMeta | null }

async function load(userId: string, bookingId: string): Promise<Loaded> {
  if (!ID.test(bookingId)) throw new MktError(404, 'Session not found')
  const b = await (await bookings()).findOne({ id: bookingId }, { projection: { _id: 0 } })
  if (!b) throw new MktError(404, 'Session not found')
  let role: SessionRole | null = b.buyer_id === userId ? 'buyer' : null
  if (!role) {
    const s = await getSellerById(b.seller_id)
    if (s?.user_id === userId) role = 'mentor'
  }
  if (!role) throw new MktError(404, 'Session not found')
  const [product, order, meta] = await Promise.all([
    (await productsCol()).findOne({ id: b.product_id }, { projection: { _id: 0 } }),
    (await orders()).findOne({ id: b.order_id }, { projection: { _id: 0 } }),
    (await sessionMetaCol()).findOne({ booking_id: b.id }, { projection: { _id: 0 } }),
  ])
  const line = order?.lines.find((l) => l.id === b.line_id) ?? null
  return { booking: b, role, product, order, line, meta }
}

async function ensureMeta(b: BookingDoc, product: ProductDoc | null): Promise<void> {
  const now = nowIso()
  await (await sessionMetaCol()).updateOne(
    { booking_id: b.id },
    { $setOnInsert: { booking_id: b.id, order_id: b.order_id, line_id: b.line_id, seller_id: b.seller_id, buyer_id: b.buyer_id, offering_type: product ? offeringTypeOf(product) : null, reschedules: [], created_at: now }, $set: { updated_at: now } },
    { upsert: true },
  )
}

export interface SessionView {
  id: string
  role: SessionRole
  title: string
  offering_type: string | null
  status: BookingDoc['status']
  start: string
  end: string
  join_url: string | null
  built_in_video: boolean
  can_join: boolean
  order_id: string
  order_number: string | null
  mentor: { name: string; slug: string | null }
  attachment: SessionMeta['attachment'] | null
  reschedules_used: number
  policy: { reschedule_hours: number; max_reschedules: number }
  dispute_open: boolean
}

export async function getSession(userId: string, bookingId: string, now = Date.now()): Promise<SessionView> {
  const { booking: b, role, product, order, line, meta } = await load(userId, bookingId)
  const mentor = await getMentorBySeller(b.seller_id)
  const seller = mentor ? null : await getSellerById(b.seller_id)
  const start = Date.parse(b.start), end = Date.parse(b.end)
  const builtIn = (line?.service?.provider || product?.service?.provider) === 'livekit'
  return {
    id: b.id, role, title: line?.title || product?.title || 'Session', offering_type: meta?.offering_type ?? (product ? offeringTypeOf(product) : null),
    status: b.status, start: b.start, end: b.end, join_url: b.join_url ?? null, built_in_video: builtIn,
    can_join: b.status === 'booked' && now >= start - JOIN_EARLY_MS && now <= end + JOIN_LATE_MS,
    order_id: b.order_id, order_number: role === 'buyer' ? order?.number ?? null : order?.number ?? null,
    mentor: { name: mentor?.display_name || seller?.display_name || 'Mentor', slug: mentor?.slug ?? null },
    attachment: meta?.attachment ?? null, reschedules_used: meta?.reschedules?.length ?? 0,
    policy: mentor?.policy ?? DEFAULT_POLICY, dispute_open: !!meta?.dispute_id,
  }
}

/** The mentor's sessions (upcoming first) with attachment flags. */
export async function listMentorSessions(sellerId: string, upcoming = true, now = Date.now()) {
  const q: Record<string, unknown> = { seller_id: sellerId, status: { $in: ['booked', 'completed'] } }
  if (upcoming) q.end = { $gte: new Date(now - 86_400_000).toISOString() }
  const rows = await (await bookings()).find(q as never, { projection: { _id: 0, active_slot: 0 } }).sort({ start: upcoming ? 1 : -1 }).limit(100).toArray()
  const [metas, prods] = await Promise.all([
    (await sessionMetaCol()).find({ booking_id: { $in: rows.map((r) => r.id) } }, { projection: { _id: 0 } }).toArray(),
    (await productsCol()).find({ id: { $in: [...new Set(rows.map((r) => r.product_id))] } }, { projection: { _id: 0, id: 1, title: 1, tags: 1, category: 1 } }).toArray(),
  ])
  const mm = new Map(metas.map((m) => [m.booking_id, m]))
  const pm = new Map(prods.map((p) => [p.id, p]))
  return rows.map((r) => ({
    id: r.id, start: r.start, end: r.end, status: r.status, order_id: r.order_id, title: pm.get(r.product_id)?.title || 'Session',
    offering_type: pm.get(r.product_id) ? offeringTypeOf(pm.get(r.product_id)!) : null,
    has_attachment: !!mm.get(r.id)?.attachment, rescheduled: (mm.get(r.id)?.reschedules?.length ?? 0) > 0, dispute_open: !!mm.get(r.id)?.dispute_id,
  }))
}

// ─── Reschedule ──────────────────────────────────────────────────────────────

async function sellerTenant(userId: string): Promise<string | null> {
  const { getMongoDb } = await import('@/lib/mongodb')
  const u = await (await getMongoDb()).collection('user').findOne({ $or: [{ id: userId }, { _id: userId as never }] }, { projection: { tenantId: 1, organizationId: 1 } })
  const t = u?.tenantId ?? u?.organizationId
  return typeof t === 'string' && t ? t : null
}

export async function rescheduleSession(userId: string, bookingId: string, newStartRaw: unknown, now = Date.now()): Promise<SessionView> {
  const { booking: b, role, product, order, line, meta } = await load(userId, bookingId)
  if (role !== 'buyer') throw new MktError(403, 'Only the learner who booked can reschedule. Mentors can cancel from the seller dashboard (full refund).')
  if (!product || !order || !line) throw new MktError(409, 'This session cannot be rescheduled.')
  const newStart = typeof newStartRaw === 'string' && Number.isFinite(Date.parse(newStartRaw)) ? new Date(newStartRaw).toISOString() : ''
  const mentor = await getMentorBySeller(b.seller_id)
  const policy = mentor?.policy ?? DEFAULT_POLICY
  const check = rescheduleEligibility(b, meta?.reschedules?.length ?? 0, policy, newStart, now)
  if (!check.ok) throw new MktError(409, check.reason)
  const spec = serviceSpec(product)
  if (!spec) throw new MktError(409, 'This session type has no availability right now.')
  const t = Date.parse(newStart)
  // The learner's own current booking does not block the new time.
  const taken = (await takenIntervals(b.seller_id, new Date(t - 86_400_000).toISOString(), new Date(t + 86_400_000).toISOString()))
    .filter((x) => !(x.start === b.start && x.end === b.end))
  if (!isBookableSlot(spec, newStart, { nowMs: now, taken })) throw new MktError(409, 'That time is no longer available. Pick another slot.')
  const newEnd = new Date(t + spec.duration_min * 60_000).toISOString()
  const col = await bookings()
  try {
    const r = await col.updateOne(
      { id: b.id, status: 'booked', start: b.start } as never,
      // AUTO-081: unset (not null) so the 24-hour reminder sweep picks the new time up.
      { $set: { start: newStart, end: newEnd, active_slot: slotKey(product.id, newStart), updated_at: nowIso() }, $unset: { reminder_sent_at: '' } },
    )
    if (!r.modifiedCount) throw new MktError(409, 'This session changed while you were rescheduling. Reload and try again.')
  } catch (e) {
    if ((e as { code?: number })?.code === 11000) throw new MktError(409, 'Someone just booked that time. Pick another slot.')
    throw e
  }
  await (await orders()).updateOne(
    { id: order.id, 'lines.id': line.id } as never,
    { $set: { 'lines.$.fulfilment.booking.start': newStart, 'lines.$.fulfilment.booking.end': newEnd, updated_at: nowIso() } } as never,
  )
  await ensureMeta(b, product)
  await (await sessionMetaCol()).updateOne({ booking_id: b.id }, { $push: { reschedules: { from: b.start, to: newStart, at: nowIso(), by: userId } }, $set: { updated_at: nowIso() } })
  // Funds settle after the (new) session end + the service hold.
  const settings = await getSettings()
  const { rescheduleLineHold } = await import('@/lib/marketplace/ledger')
  await rescheduleLineHold(order.id, line.id, availableAtFor('service', settings, { sale: order.payment.paid_at || order.created_at, session_end: newEnd })).catch(() => {})
  // External meeting providers: move the meeting; the built-in room keeps its link.
  const provider = line.service?.provider
  if (b.meeting_id && provider && ['zoom', 'google_meet', 'teams'].includes(provider)) {
    try {
      const seller = await getSellerById(b.seller_id)
      const tenantId = seller ? await sellerTenant(seller.user_id) : null
      if (tenantId) {
        const { getMeetingProvider } = await import('@/lib/ats/interviews/providers')
        const { providerContext } = await import('@/lib/ats/interviews/integrations')
        const p = provider as 'zoom' | 'google_meet' | 'teams'
        await getMeetingProvider(p).updateMeeting(providerContext(tenantId, p), b.meeting_id, {
          interviewId: b.id, title: line.title, description: `CodeSpectra marketplace order ${order.number}`, start: newStart,
          durationMin: spec.duration_min, timeZone: spec.timezone, attendees: [{ email: order.buyer_email }],
        })
      }
    } catch (e) {
      console.error('[mentors] meeting update failed — mentor will share a new link', { booking: b.id, provider, err: (e as Error)?.message })
    }
  }
  const { onSessionRescheduled } = await import('./notify')
  await onSessionRescheduled(order, { ...line, fulfilment: { ...line.fulfilment, booking: { ...(line.fulfilment.booking || { start: newStart, end: newEnd }), start: newStart, end: newEnd } } }, b.start).catch(() => {})
  return getSession(userId, bookingId, now)
}

/** Times the learner may move to (14 days from `fromMs`); the current booking does not block them. */
export async function rescheduleSlots(userId: string, bookingId: string, fromMs: number, now = Date.now()): Promise<string[]> {
  const { booking: b, role, product } = await load(userId, bookingId)
  if (role !== 'buyer' || b.status !== 'booked' || !product) return []
  const spec = serviceSpec(product)
  if (!spec) return []
  const from = Math.max(now, fromMs)
  const to = from + 14 * 86_400_000
  const taken = (await takenIntervals(b.seller_id, new Date(from - 86_400_000).toISOString(), new Date(to + 86_400_000).toISOString()))
    .filter((x) => !(x.start === b.start && x.end === b.end))
  const { generateSlots } = await import('@/lib/marketplace/slots')
  return generateSlots(spec, { fromMs: from, toMs: to, nowMs: now, taken, max: 300 }).filter((s) => s !== b.start)
}

// ─── Code-review attachment ──────────────────────────────────────────────────

export async function attachToSession(userId: string, bookingId: string, raw: unknown): Promise<SessionView> {
  const { booking: b, role, product, meta } = await load(userId, bookingId)
  if (role !== 'buyer') throw new MktError(403, 'Only the learner who booked can attach work.')
  const type = meta?.offering_type ?? (product ? offeringTypeOf(product) : null)
  if (type !== 'code_review') throw new MktError(409, 'Attachments are for code review sessions.')
  if (b.status !== 'booked') throw new MktError(409, 'This session is no longer open for attachments.')
  const body = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  let attachment: SessionMeta['attachment']
  const at = nowIso()
  if (typeof body.submission_id === 'string' && ID.test(body.submission_id)) {
    const { getMongoDb } = await import('@/lib/mongodb')
    const db = await getMongoDb()
    const sub = await db.collection('submissions').findOne({ id: body.submission_id, user_id: userId }, { projection: { _id: 0, id: 1, problem_id: 1, language: 1 } })
    if (!sub) throw new MktError(404, 'Submission not found — pick one of your own practice submissions.')
    const prob = await db.collection('problems').findOne({ id: sub.problem_id }, { projection: { _id: 0, title: 1 } })
    attachment = { kind: 'submission', submission_id: String(sub.id), problem_title: typeof prob?.title === 'string' ? prob.title.slice(0, 140) : undefined, language: typeof sub.language === 'string' ? sub.language : undefined, attached_at: at }
  } else if (typeof body.url === 'string' && isRepoLink(body.url.trim())) {
    attachment = { kind: 'link', url: body.url.trim(), attached_at: at }
  } else {
    throw new MktError(400, 'Choose one of your submissions or paste a GitHub, GitLab or Bitbucket https link.')
  }
  await ensureMeta(b, product)
  await (await sessionMetaCol()).updateOne({ booking_id: b.id }, { $set: { attachment, updated_at: at } })
  return getSession(userId, bookingId)
}

/** The attached submission's code — the buyer or the mentor of that booking only. */
export async function sessionAttachmentCode(userId: string, bookingId: string): Promise<{ language: string | null; problem_title: string | null; source_code: string }> {
  const { booking: b, meta } = await load(userId, bookingId)
  if (meta?.attachment?.kind !== 'submission') throw new MktError(404, 'No submission is attached to this session.')
  if (b.status === 'cancelled' || b.status === 'held') throw new MktError(409, 'This session is not active.')
  const { getMongoDb } = await import('@/lib/mongodb')
  const sub = await (await getMongoDb()).collection('submissions').findOne({ id: meta.attachment.submission_id, user_id: b.buyer_id }, { projection: { _id: 0, source_code: 1, language: 1 } })
  if (!sub) throw new MktError(404, 'The attached submission no longer exists.')
  return { language: typeof sub.language === 'string' ? sub.language : null, problem_title: meta.attachment.problem_title ?? null, source_code: String(sub.source_code || '').slice(0, 100_000) }
}

/** Learner's recent practice submissions to choose from. */
export async function attachableSubmissions(userId: string) {
  const { getMongoDb } = await import('@/lib/mongodb')
  const db = await getMongoDb()
  const subs = await db.collection('submissions').find({ user_id: userId }, { projection: { _id: 0, id: 1, problem_id: 1, language: 1, status: 1, created_at: 1 } }).sort({ created_at: -1 }).limit(30).toArray()
  const probs = await db.collection('problems').find({ id: { $in: [...new Set(subs.map((s) => s.problem_id))] } }, { projection: { _id: 0, id: 1, title: 1 } }).toArray()
  const pm = new Map(probs.map((p) => [p.id, p.title]))
  return subs.map((s) => ({ id: String(s.id), title: String(pm.get(s.problem_id) || 'Practice problem'), language: s.language, status: s.status, created_at: s.created_at }))
}

// ─── Disputes ────────────────────────────────────────────────────────────────

export async function openDispute(userId: string, bookingId: string, reasonRaw: unknown, now = Date.now()): Promise<SessionView> {
  const { booking: b, role, product, order, line, meta } = await load(userId, bookingId)
  if (role !== 'buyer') throw new MktError(403, 'Only the learner who booked can open a dispute.')
  if (!order || !line) throw new MktError(409, 'This session cannot be disputed.')
  const reason = typeof reasonRaw === 'string' ? reasonRaw.replace(/\s+/g, ' ').trim().slice(0, 1000) : ''
  if (reason.length < 20) throw new MktError(400, 'Tell us what went wrong (at least 20 characters).')
  if (meta?.dispute_id) throw new MktError(409, 'A dispute for this session is already open.')
  if (now < Date.parse(b.start)) throw new MktError(409, 'The session has not started yet — cancel or reschedule it instead.')
  const settings = await getSettings()
  if (now > Date.parse(b.end) + Math.max(1, settings.hold_days.service) * 86_400_000) throw new MktError(409, 'The dispute window for this session has closed.')
  const amount = Math.max(0, linePaid(line) - (line.refunded_amount ?? 0))
  if (amount <= 0) throw new MktError(409, 'This session has already been refunded.')
  const { openRefundRequest } = await import('@/lib/marketplace/fulfilment')
  await openRefundRequest({ order, sellerId: b.seller_id, lineIds: [line.id], amount, reason: `Mentor session dispute: ${reason}`, type: 'dispute', openedBy: userId })
  const { refundsCol } = await import('@/lib/marketplace/db')
  const req = await (await refundsCol()).findOne({ order_id: order.id, line_ids: [line.id], status: 'open' }, { projection: { _id: 0, id: 1 } })
  await ensureMeta(b, product)
  await (await sessionMetaCol()).updateOne({ booking_id: b.id }, { $set: { dispute_id: req?.id ?? 'open', updated_at: nowIso() } })
  // Hold the mentor's funds while the dispute is open: settle far in the future; the admin decision refunds or re-times it.
  const { rescheduleLineHold } = await import('@/lib/marketplace/ledger')
  await rescheduleLineHold(order.id, line.id, new Date(now + 60 * 86_400_000).toISOString()).catch(() => {})
  return getSession(userId, bookingId, now)
}

// ─── Built-in video ──────────────────────────────────────────────────────────

export const sessionRoomName = (bookingId: string) => `mkt-session-${bookingId}`

/** First join per side (collection mentor_session_joins, unique booking + role). Never throws. */
async function recordSessionJoin(bookingId: string, role: SessionRole, now: number): Promise<void> {
  try {
    const { getMongoDb } = await import('@/lib/mongodb')
    const c = (await getMongoDb()).collection('mentor_session_joins')
    await c.createIndex({ booking_id: 1, role: 1 }, { unique: true, name: 'msj_booking_role' }).catch(() => {})
    await c.updateOne({ booking_id: bookingId, role }, { $setOnInsert: { booking_id: bookingId, role, at: new Date(now).toISOString() } }, { upsert: true })
  } catch { /* best-effort */ }
}

export async function sessionVideoToken(user: { id: string; name?: string | null; email?: string | null }, bookingId: string, now = Date.now()): Promise<{ token: string; url: string; title: string } | { error: string; status: number }> {
  const v = await getSession(user.id, bookingId, now)
  if (!v.built_in_video) return { error: 'This session uses an external meeting link.', status: 409 }
  if (!v.can_join) return { error: 'The room opens 15 minutes before the session starts.', status: 409 }
  const { livekitConfig, mintLivekitToken, LIVEKIT_NOT_CONFIGURED } = await import('@/lib/ats/interviews/livekit')
  const cfg = await livekitConfig()
  if (!cfg) return { error: LIVEKIT_NOT_CONFIGURED, status: 503 }
  const ttl = Math.max(600, Math.ceil((Date.parse(v.end) + JOIN_LATE_MS - now) / 1000))
  // Identity is the signed-in account and its role in this booking — never from the request body.
  const token = await mintLivekitToken(cfg, sessionRoomName(v.id), `${v.role}:${user.id}`, (user.name || (v.role === 'mentor' ? v.mentor.name : 'Learner')).slice(0, 100), Math.min(ttl, 4 * 3600))
  // W15-AUTO-09: first join per side, so the no-show follow-up knows who came (lib/automation/system/nudges-learning).
  void recordSessionJoin(v.id, v.role, now)
  return { token, url: cfg.url, title: v.title }
}
