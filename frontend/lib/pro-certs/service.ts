/**
 * Proctored certifications — server logic.
 *
 * Buy → settle → attempt: an order is created at checkout; once the gateway
 * reports it paid (webhook, browser return or the sweep), exactly one attempt
 * is created for it (unique order_id). The attempt gets its own private,
 * invite-only exam drawn from the approved question bank (identity check +
 * integrity monitoring on), and the candidate takes it on the normal
 * assessment page with a personal invite token.
 *
 * Finalise: when the submission is fully graded, score vs pass mark and the
 * integrity trust score decide fail / review / issue (lib/pro-certs/pure.ts).
 * Reviewers clear or reject held attempts. Issuing writes a credential (public
 * id CSC-…) and a certification_attempts row, so the skill passport and the
 * existing certificate pages see it. The sweep (platform cron) finalises,
 * retries stuck steps and sends expiry reminders. Every step is idempotent.
 */
import 'server-only'
import { randomBytes, randomUUID } from 'node:crypto'
import { getMongoDb } from '@/lib/mongodb'
import { nowIso } from '@/lib/db/ids'
import { bankToExamQuestion, type BankQuestionDoc } from '@/lib/question-bank'
import { DEFAULT_DOMAINS, domainBankFilter } from '@/lib/question-bot/domains'
import { normalizeSections } from '@/lib/exam-sections'
import { attempts, credentials, exposure, isDup, orders, programs } from './db'
import {
  addMonths, attemptEligibility, credentialIdFrom, discountedPrice, credentialState, decideOutcome, isProCredentialId, priceFor,
  publicProgram, publishProblems, renewedExpiry, scorePercent, selectQuestions, sectionQuestionCount, type Eligibility, type PoolItem,
} from './pure'
import {
  PROGRAM_TEMPLATES, ProgramInputSchema, type AttemptDoc, type BlueprintSection, type CertCurrency, type CertOrderDoc,
  type CredentialDoc, type ProgramDoc, type ProgramInput, type ProgramStatus, type PublicProgram,
} from './types'

type Doc = Record<string, any>
const DAY = 86_400_000
/** Days a paid attempt stays open to start. */
const START_WINDOW_DAYS = 30
const POOL_LIMIT = 3000

export class ProCertError extends Error {
  constructor(public status: number, public code: string, message: string, public params?: Record<string, string | number>) { super(message) }
}

const strip = <T extends object>(d: T | null): T | null => {
  if (!d) return null
  const { _id, ...rest } = d as T & { _id?: unknown }
  void _id
  return rest as T
}

// ─── Programs (admin) ────────────────────────────────────────────────────────

export async function listPrograms(): Promise<ProgramDoc[]> {
  return (await (await programs()).find({}, { projection: { _id: 0 } }).sort({ updated_at: -1 }).limit(500).toArray()) as ProgramDoc[]
}

export async function getProgram(id: string): Promise<ProgramDoc | null> {
  return strip(await (await programs()).findOne({ id }, { projection: { _id: 0 } })) as ProgramDoc | null
}

export async function getProgramBySlug(slug: string): Promise<ProgramDoc | null> {
  if (!/^[a-z0-9-]{1,60}$/.test(slug)) return null
  return strip(await (await programs()).findOne({ slug }, { projection: { _id: 0 } })) as ProgramDoc | null
}

export function parseProgramInput(raw: unknown): { ok: true; value: ProgramInput } | { ok: false; error: string } {
  const r = ProgramInputSchema.safeParse(raw)
  if (r.success) return { ok: true, value: r.data }
  const first = r.error.issues[0]
  return { ok: false, error: `${first.path.join('.') || 'body'}: ${first.message}` }
}

export async function createProgram(input: ProgramInput, userId: string): Promise<ProgramDoc> {
  const now = nowIso()
  const doc: ProgramDoc = { ...input, id: randomUUID(), status: 'draft', version: 1, created_by: userId, created_at: now, updated_at: now, published_at: null }
  try {
    await (await programs()).insertOne({ ...doc })
  } catch (e) {
    if (isDup(e)) throw new ProCertError(409, 'pro_cert_slug_taken', 'That URL name is already used by another certification.')
    throw e
  }
  return doc
}

export async function createFromTemplate(slug: string, userId: string): Promise<ProgramDoc> {
  const t = PROGRAM_TEMPLATES.find((x) => x.slug === slug)
  if (!t) throw new ProCertError(404, 'pro_cert_not_found', 'Certification not found.')
  return createProgram({ ...t, price: { INR: null, USD: null } } as ProgramInput, userId)
}

export async function updateProgram(id: string, input: ProgramInput): Promise<ProgramDoc> {
  const col = await programs()
  const cur = await getProgram(id)
  if (!cur) throw new ProCertError(404, 'pro_cert_not_found', 'Certification not found.')
  if (cur.status === 'published' && input.slug !== cur.slug) throw new ProCertError(400, 'pro_cert_slug_locked', 'A published certification keeps its URL name.')
  if (cur.status === 'published' && publishProblems(input).length) throw new ProCertError(400, 'pro_cert_published_invalid', 'Fix the blueprint before saving a published certification.')
  try {
    await col.updateOne({ id }, { $set: { ...input, updated_at: nowIso() }, $inc: { version: 1 } })
  } catch (e) {
    if (isDup(e)) throw new ProCertError(409, 'pro_cert_slug_taken', 'That URL name is already used by another certification.')
    throw e
  }
  return (await getProgram(id)) as ProgramDoc
}

/** Approved, active bank questions per section and difficulty (what a draw can use). */
export async function coverage(p: Pick<ProgramDoc, 'blueprint'>): Promise<Array<{ section: string; need: Record<string, number>; have: Record<string, number> }>> {
  const out = []
  for (const s of p.blueprint.sections) {
    const rows = await poolFor(s, { countOnly: true })
    const have = { Easy: 0, Medium: 0, Hard: 0 } as Record<string, number>
    for (const r of rows) have[r.difficulty] = (have[r.difficulty] || 0) + 1
    out.push({ section: s.id, need: { ...s.difficulty }, have })
  }
  return out
}

export async function setProgramStatus(id: string, status: ProgramStatus): Promise<ProgramDoc> {
  const p = await getProgram(id)
  if (!p) throw new ProCertError(404, 'pro_cert_not_found', 'Certification not found.')
  if (status === 'published') {
    const problems = publishProblems(p)
    if (problems.length) throw new ProCertError(400, 'pro_cert_publish_blocked', 'Fix the blueprint before publishing.', { problems: problems.join(', ') })
    const cov = await coverage(p)
    // Every section needs at least as many approved questions as one paper draws.
    const short = cov.filter((c) => (['Easy', 'Medium', 'Hard'] as const).reduce((n, d) => n + c.have[d], 0) < (['Easy', 'Medium', 'Hard'] as const).reduce((n, d) => n + c.need[d], 0))
    if (short.length) throw new ProCertError(400, 'pro_cert_pool_too_small', 'Not enough approved questions in the bank for this blueprint.', { sections: short.map((s) => s.section).join(', ') })
  }
  await (await programs()).updateOne({ id }, { $set: { status, updated_at: nowIso(), ...(status === 'published' ? { published_at: nowIso() } : {}) } })
  return (await getProgram(id)) as ProgramDoc
}

// ─── Public catalog ──────────────────────────────────────────────────────────

/** Uncached; lib/pro-certs/public-cache.ts wraps it. Throws on DB errors. */
export async function loadPublishedPrograms(): Promise<PublicProgram[]> {
  const rows = (await (await programs()).find({ status: 'published' }, { projection: { _id: 0 } }).sort({ title: 1 }).limit(200).toArray()) as ProgramDoc[]
  return rows.map(publicProgram)
}

// ─── Candidate view ──────────────────────────────────────────────────────────

export interface MyProgramState {
  program: PublicProgram
  eligibility: Eligibility
  attempts: Array<Pick<AttemptDoc, 'id' | 'status' | 'score_pct' | 'created_at' | 'decided_at' | 'submitted_at'> & { start_url: string | null; start_by: string | null }>
  credential: (Pick<CredentialDoc, 'id' | 'issued_at' | 'expires_at' | 'status'> & { state: string }) | null
  pending_order: Pick<CertOrderDoc, 'id' | 'status' | 'created_at'> | null
}

async function latestCredential(userId: string, programId: string): Promise<CredentialDoc | null> {
  return strip(await (await credentials()).findOne({ user_id: userId, program_id: programId, status: { $ne: 'revoked' } } as never, { sort: { issued_at: -1 }, projection: { _id: 0 } })) as CredentialDoc | null
}

export async function myProgramState(userId: string, slug: string): Promise<MyProgramState | null> {
  const p = await getProgramBySlug(slug)
  if (!p || p.status === 'draft') return null
  const [rows, cred, pending] = await Promise.all([
    (await attempts()).find({ user_id: userId, program_id: p.id }, { projection: { _id: 0 } }).sort({ created_at: -1 }).limit(50).toArray() as Promise<AttemptDoc[]>,
    latestCredential(userId, p.id),
    (await orders()).findOne({ user_id: userId, program_id: p.id, status: 'pending', created_at: { $gt: new Date(Date.now() - DAY).toISOString() } }, { sort: { created_at: -1 }, projection: { _id: 0, id: 1, status: 1, created_at: 1 } }),
  ])
  // Open attempts may be done by now: finalise on read (idempotent).
  for (const a of rows) if (a.status === 'ready' && a.exam_id) await finalizeAttempt(a).catch((e) => console.error('[pro-certs] finalize on read failed:', (e as Error)?.message))
  const fresh = (await (await attempts()).find({ user_id: userId, program_id: p.id }, { projection: { _id: 0 } }).sort({ created_at: -1 }).limit(50).toArray()) as AttemptDoc[]
  return {
    program: publicProgram(p),
    eligibility: attemptEligibility({ program: p, attempts: fresh, credential: cred }),
    attempts: fresh.map((a) => ({
      id: a.id, status: a.status, score_pct: a.score_pct, created_at: a.created_at, decided_at: a.decided_at, submitted_at: a.submitted_at,
      start_url: a.status === 'ready' && a.exam_id ? `/assessment/${a.exam_id}?inviteToken=${encodeURIComponent(a.invite_token)}` : null,
      start_by: a.status === 'ready' ? new Date(Date.parse(a.created_at) + START_WINDOW_DAYS * DAY).toISOString() : null,
    })),
    credential: cred ? { id: cred.id, issued_at: cred.issued_at, expires_at: cred.expires_at, status: cred.status, state: credentialState(cred) } : null,
    pending_order: pending ? { id: String(pending.id), status: pending.status as CertOrderDoc['status'], created_at: String(pending.created_at) } : null,
  }
}

export async function myCredentials(userId: string): Promise<Array<CredentialDoc & { state: string }>> {
  const rows = (await (await credentials()).find({ user_id: userId }, { projection: { _id: 0 } }).sort({ issued_at: -1 }).limit(100).toArray()) as CredentialDoc[]
  return rows.map((c) => ({ ...c, state: credentialState(c) }))
}

export async function myOpenAttempts(userId: string): Promise<Array<Pick<AttemptDoc, 'id' | 'program_slug' | 'status' | 'created_at'>>> {
  return (await (await attempts()).find({ user_id: userId, status: { $in: ['ready', 'in_review'] } }, { projection: { _id: 0, id: 1, program_slug: 1, status: 1, created_at: 1 } }).limit(20).toArray()) as never
}

// ─── Checkout ────────────────────────────────────────────────────────────────

/**
 * Plan member discount on certification attempts: the billing module's
 * `cert_discount_pct` entitlement (lib/entitlements hasEntitlement), the same
 * one the marketplace applies to certification products. 100% = free attempt.
 */
async function memberDiscountPct(userId: string): Promise<number> {
  try {
    const { hasEntitlement } = await import('@/lib/entitlements')
    const d = await hasEntitlement({ id: userId, role: 'user' }, 'cert_discount_pct')
    return d.allowed ? Number(d.limit) : 0
  } catch {
    return 0
  }
}

export async function checkout(user: { id: string; email: string }, slug: string, currency: CertCurrency): Promise<{ redirect_url: string; order_id: string }> {
  const p = await getProgramBySlug(slug)
  if (!p || p.status !== 'published') throw new ProCertError(404, 'pro_cert_not_found', 'Certification not found.')
  // CORE-040: an earlier checkout for this program may have been paid in another tab —
  // settle it first (then eligibility sees its attempt), and close the payment page of
  // any still-unpaid one so a learner can't pay twice for one attempt.
  await replaceOpenCheckouts(user.id, p.id)
  const [rows, cred] = await Promise.all([
    (await attempts()).find({ user_id: user.id, program_id: p.id }, { projection: { _id: 0, status: 1, created_at: 1, decided_at: 1 } }).limit(100).toArray() as Promise<AttemptDoc[]>,
    latestCredential(user.id, p.id),
  ])
  const el = attemptEligibility({ program: p, attempts: rows, credential: cred })
  if (!el.ok) {
    const date = el.retry_at ? el.retry_at.slice(0, 10) : ''
    throw new ProCertError(409, `pro_cert_${el.reason}`, eligibilityMessage(el.reason, date), date ? { date } : undefined)
  }
  const listPrice = priceFor(p, currency)
  if (listPrice === null) throw new ProCertError(400, 'pro_cert_currency_unavailable', 'This certification is not sold in that currency.')
  const amount = discountedPrice(listPrice, await memberDiscountPct(user.id))
  const free = amount === 0
  const { pickGateway, startPayment } = await import('./payments')
  const gateway = free ? 'free' : await pickGateway(currency)
  if (!gateway) throw new ProCertError(503, 'pro_cert_payments_unavailable', "Payments aren't set up yet. Please try again later.")
  const now = nowIso()
  const order: CertOrderDoc = {
    id: randomUUID(), user_id: user.id, user_email: user.email, program_id: p.id, program_slug: p.slug, renews_credential_id: el.renewal,
    currency, amount, gateway, payment: { ref: null, intent: null, txn: null, paid_amount: null },
    status: 'pending', attempt_id: null, created_at: now, updated_at: now, paid_at: null,
  }
  await (await orders()).insertOne({ ...order })
  if (gateway === 'free') {
    await markPaid(order, { amount: 0, currency, txn: 'free', intent: null })
    return { redirect_url: `/dashboard/certifications/proctored/${encodeURIComponent(p.slug)}?payment=success`, order_id: order.id }
  }
  try {
    const { redirect_url, ref } = await startPayment(order, p.title)
    await (await orders()).updateOne({ id: order.id }, { $set: { 'payment.ref': ref, updated_at: nowIso() } })
    return { redirect_url, order_id: order.id }
  } catch (e) {
    await (await orders()).updateOne({ id: order.id, status: 'pending' }, { $set: { status: 'failed', updated_at: nowIso() } })
    console.error('[pro-certs] start payment failed:', (e as Error)?.message?.slice(0, 200))
    throw new ProCertError(502, 'pro_cert_payment_start_failed', "We couldn't start the payment. Please try again.")
  }
}

export function eligibilityMessage(reason: string, date = ''): string {
  switch (reason) {
    case 'open_attempt': return 'You already have an attempt in progress for this certification.'
    case 'cooldown': return `You can retake this certification from ${date}.`
    case 'yearly_limit': return `You have used all attempts allowed this year. The next one opens on ${date}.`
    case 'already_certified': return `You already hold this certification. Renewal opens on ${date}.`
    default: return 'This certification is not available right now.'
  }
}

/**
 * CORE-040: before a new checkout, settle the user's open checkouts for the
 * program (one may have been paid in another tab) and cancel the unpaid ones,
 * closing their payment pages. A late payment on a cancelled order is still
 * settled (settleOrder) and refunded if it would be a second attempt.
 */
async function replaceOpenCheckouts(userId: string, programId: string): Promise<void> {
  const col = await orders()
  const open = (await col.find(
    { user_id: userId, program_id: programId, status: 'pending', created_at: { $gt: new Date(Date.now() - 2 * DAY).toISOString() } },
    { projection: { _id: 0 } },
  ).limit(10).toArray()) as CertOrderDoc[]
  if (!open.length) return
  const { closePaymentPage } = await import('./payments')
  for (const o of open) {
    const st = o.payment.ref ? await settleOrder(o.id).catch(() => 'pending' as const) : 'pending'
    if (st !== 'pending') continue
    const c = await col.updateOne({ id: o.id, status: 'pending' }, { $set: { status: 'cancelled', updated_at: nowIso() } })
    if (c.modifiedCount === 1) await closePaymentPage(o)
  }
}

/** Pure: does a paid order duplicate an attempt that is already open for the program? */
export function duplicateAttemptFor(orderId: string, open: Array<Pick<AttemptDoc, 'id' | 'order_id' | 'status'>>): string | null {
  const other = open.find((a) => a.order_id !== orderId && (a.status === 'ready' || a.status === 'in_review'))
  return other ? other.id : null
}

/** CORE-040: a second payment for one attempt — no attempt, refund it (once), admin sees `refund.ok === false`. */
async function settleDuplicate(order: CertOrderDoc, attemptId: string): Promise<void> {
  const col = await orders()
  const now = nowIso()
  const claim = await col.updateOne(
    { id: order.id, status: 'paid', attempt_id: null, refund: null } as never,
    { $set: { duplicate: { attempt_id: attemptId, at: now }, refund: { ok: false, ref: null, at: now, error: 'in_progress' }, updated_at: now } },
  )
  if (claim.modifiedCount !== 1) return
  try {
    const { refundOrder } = await import('./payments')
    const r = await refundOrder({ ...order, status: 'paid' })
    await col.updateOne({ id: order.id }, { $set: { refund: { ok: r.ok, ref: r.ref, at: nowIso(), ...(r.ok ? {} : { error: 'gateway_declined' }) }, ...(r.ok ? { status: 'refunded' } : {}), updated_at: nowIso() } })
    if (!r.ok) console.error('[pro-certs] duplicate payment refund declined — needs an admin', { order: order.id })
  } catch (e) {
    await col.updateOne({ id: order.id }, { $set: { refund: { ok: false, ref: null, at: nowIso(), error: String((e as Error)?.message || 'refund_failed').slice(0, 160) }, updated_at: nowIso() } })
    console.error('[pro-certs] duplicate payment refund failed — needs an admin', { order: order.id })
  }
}

// ─── Settlement ──────────────────────────────────────────────────────────────

async function markPaid(order: CertOrderDoc, paid: { amount: number; currency: string; txn: string; intent: string | null }): Promise<void> {
  const now = nowIso()
  await (await orders()).updateOne(
    // A replaced ('cancelled') order paid from an old tab is still a real payment.
    { id: order.id, status: { $in: ['pending', 'cancelled'] } },
    { $set: { status: 'paid', paid_at: now, updated_at: now, 'payment.paid_amount': paid.amount, 'payment.txn': paid.txn, 'payment.intent': paid.intent } },
  )
  const fresh = (await (await orders()).findOne({ id: order.id }, { projection: { _id: 0 } })) as CertOrderDoc | null
  if (!fresh || fresh.status !== 'paid' || fresh.duplicate) return
  if (fresh.attempt_id) return
  // CORE-040: an attempt from another order is already open → this payment is a duplicate.
  // ponytail: two orders settling in the same instant can both pass this check; the
  // checkout-side replace makes that need two payment pages paid within milliseconds.
  const open = (await (await attempts()).find({ user_id: fresh.user_id, program_id: fresh.program_id, status: { $in: ['ready', 'in_review'] } }, { projection: { _id: 0, id: 1, order_id: 1, status: 1 } }).limit(10).toArray()) as AttemptDoc[]
  const dup = duplicateAttemptFor(fresh.id, open)
  if (dup) { await settleDuplicate(fresh, dup); return }
  await createAttemptForOrder(fresh)
}

/** Read the gateway and settle. Returns the order status after settling. */
export async function settleOrder(orderId: string): Promise<CertOrderDoc['status'] | 'unknown'> {
  const order = (await (await orders()).findOne({ id: orderId }, { projection: { _id: 0 } })) as CertOrderDoc | null
  if (!order) return 'unknown'
  if (order.status === 'paid') {
    if (!order.attempt_id && !order.duplicate) await markPaid(order, { amount: order.payment.paid_amount ?? order.amount, currency: order.currency, txn: order.payment.txn || '', intent: order.payment.intent })
    return 'paid'
  }
  if (order.status !== 'pending' && order.status !== 'cancelled') return order.status
  const { fetchGatewayState } = await import('./payments')
  const st = await fetchGatewayState(order)
  if (st.state === 'paid') {
    // Amount and currency must match what we asked for (never trust a partial / other-currency payment).
    if (st.amount < order.amount || st.currency.toUpperCase() !== order.currency) {
      console.error('[pro-certs] amount/currency mismatch — not settling', { order: order.id })
      return 'pending'
    }
    await markPaid(order, st)
    return 'paid'
  }
  if (st.state === 'failed') {
    if (order.status === 'cancelled') return 'cancelled'
    await (await orders()).updateOne({ id: order.id, status: 'pending' }, { $set: { status: 'failed', updated_at: nowIso() } })
    return 'failed'
  }
  return order.status === 'cancelled' ? 'cancelled' : 'pending'
}

export async function settleByRef(ref: string): Promise<CertOrderDoc['status'] | 'unknown'> {
  const o = await (await orders()).findOne({ 'payment.ref': ref } as never, { projection: { _id: 0, id: 1 } })
  return o ? settleOrder(String(o.id)) : 'unknown'
}

export async function orderSlug(orderId: string, userId?: string): Promise<string | null> {
  const o = await (await orders()).findOne({ id: orderId, ...(userId ? { user_id: userId } : {}) }, { projection: { _id: 0, program_slug: 1 } })
  return o ? String(o.program_slug) : null
}

// ─── Attempt + exam ──────────────────────────────────────────────────────────

async function poolFor(s: BlueprintSection, opts: { countOnly?: boolean } = {}): Promise<Array<{ id: string; difficulty: 'Easy' | 'Medium' | 'Hard' }>> {
  const db = await getMongoDb()
  const doms = s.domains.map((id) => DEFAULT_DOMAINS.find((d) => d.id === id) ?? { id, kind: 'skill' as const })
  const domainOr = doms.map((d) => domainBankFilter(d as never))
  const match: Doc = {
    is_active: true,
    review_status: { $ne: 'draft' },
    type: { $in: s.types },
    difficulty: { $in: ['Easy', 'Medium', 'Hard'] },
    $or: domainOr.flatMap((f) => ('$or' in f ? (f.$or as Doc[]) : [f])),
  }
  if (s.subjects.length) match.subject = { $in: s.subjects }
  void opts
  return (await db.collection('question_bank').find(match, { projection: { _id: 0, id: 1, difficulty: 1 } }).limit(POOL_LIMIT).toArray()) as never
}

/** Create (once) the attempt for a paid order and build its exam. */
export async function createAttemptForOrder(order: CertOrderDoc): Promise<AttemptDoc | null> {
  const p = await getProgram(order.program_id)
  if (!p) return null
  const col = await attempts()
  const now = nowIso()
  const attempt: AttemptDoc = {
    id: randomUUID(), user_id: order.user_id, program_id: p.id, program_slug: p.slug, program_version: p.version, order_id: order.id,
    renews_credential_id: order.renews_credential_id, exam_id: '', invite_token: randomBytes(24).toString('base64url'), bank_question_ids: [],
    status: 'ready', score_pct: null, trust_score: null, flags: [], review: { status: null, by: null, at: null, note: '' },
    credential_id: null, submitted_at: null, decided_at: null, created_at: now, updated_at: now,
  }
  try {
    await col.insertOne({ ...attempt })
  } catch (e) {
    if (!isDup(e)) throw e
  }
  const saved = (await col.findOne({ order_id: order.id }, { projection: { _id: 0 } })) as AttemptDoc
  await (await orders()).updateOne({ id: order.id }, { $set: { attempt_id: saved.id, updated_at: nowIso() } })
  if (!saved.exam_id) await buildExam(saved, p)
  return (await col.findOne({ id: saved.id }, { projection: { _id: 0 } })) as AttemptDoc
}

async function buildExam(a: AttemptDoc, p: ProgramDoc): Promise<void> {
  const db = await getMongoDb()
  const prior = (await (await attempts()).find({ user_id: a.user_id, program_id: p.id, id: { $ne: a.id } }, { projection: { _id: 0, bank_question_ids: 1 } }).limit(50).toArray()) as AttemptDoc[]
  const seen = new Set(prior.flatMap((x) => x.bank_question_ids || []))
  const chosen: string[] = []
  const sectionIds: Array<{ s: BlueprintSection; ids: string[] }> = []
  for (const s of p.blueprint.sections) {
    const pool = (await poolFor(s)).filter((q) => !chosen.includes(q.id))
    const exp = await (await exposure()).find({ program_id: p.id, question_id: { $in: pool.map((q) => q.id) } }, { projection: { _id: 0, question_id: 1, count: 1 } }).toArray()
    const counts = new Map(exp.map((e) => [e.question_id, e.count]))
    const items: PoolItem[] = pool.map((q) => ({ id: q.id, difficulty: q.difficulty, exposure: counts.get(q.id) ?? 0 }))
    const r = selectQuestions(items, s.difficulty, { seed: `${a.id}:${s.id}`, seen })
    if (r.missing > 0) console.error('[pro-certs] pool short', { program: p.slug, section: s.id, missing: r.missing })
    chosen.push(...r.ids)
    sectionIds.push({ s, ids: r.ids })
  }
  const bank = (await db.collection('question_bank').find({ id: { $in: chosen } }, { projection: { _id: 0 } }).toArray()) as unknown as BankQuestionDoc[]
  const byId = new Map(bank.map((b) => [b.id, b]))
  const questionList: Doc[] = []
  const sections: Doc[] = []
  for (const { s, ids } of sectionIds) {
    const qs = ids.map((id) => byId.get(id)).filter((b): b is BankQuestionDoc => !!b).map((b): Doc => ({ ...bankToExamQuestion(b), bank_id: b.id }))
    questionList.push(...qs)
    sections.push({ id: s.id, title: s.name, time_limit_minutes: s.minutes, lock_after_leave: false, question_ids: qs.map((q) => String(q.id)) })
  }
  if (!questionList.length) throw new Error(`No approved questions for ${p.slug}`)
  const now = nowIso()
  const examId = randomUUID()
  const exam = {
    id: examId,
    title: `${p.title} — certification attempt`,
    subject: p.skills[0] || '',
    level: p.level,
    duration: p.blueprint.duration_min,
    starts_at: null,
    ends_at: null,
    require_token_links: false,
    require_id_verification: true,
    require_face_capture: true,
    no_camera_policy: 'block',
    allow_retake: false,
    max_attempts: 1,
    passing_score: p.blueprint.pass_percent,
    issue_certificates: false,
    auto_release_scores: false,
    proctoring_mode: p.proctoring.strict_extension ? 'strict' : 'standard',
    kind: 'standard',
    questions: questionList.length,
    questionList,
    sections: sections.length > 1 ? normalizeSections(sections, questionList.map((q) => String(q.id))) : undefined,
    access_type: 'invite_only',
    published: true,
    attempts: 0,
    avgScore: 0,
    created_by: 'system:pro-certs',
    tenant_id: null,
    pro_cert: { attempt_id: a.id, program_id: p.id },
    createdAt: now,
    updatedAt: now,
  }
  if (!exam.sections) delete (exam as Doc).sections
  await db.collection('exams').insertOne(exam)
  const email = String((await db.collection('user').findOne({ id: a.user_id }, { projection: { email: 1 } }))?.email || '').toLowerCase()
  await db.collection('candidate_invites').insertOne({
    id: randomUUID(), token: a.invite_token, user_id: a.user_id, email, full_name: email.split('@')[0],
    target_url: `/assessment/${examId}`, assigned_assessments: [], allowed_languages: [], invited_by: 'system:pro-certs',
    status: 'pending', expires_at: new Date(Date.now() + START_WINDOW_DAYS * DAY).toISOString(),
    created_at: now, updated_at: now, exam_id: examId, exam_ids: [examId], delivery_status: 'sent',
  })
  // Proctoring is mandatory: integrity monitoring on with every signal and violation snapshots.
  const { resolveSettings } = await import('@/lib/integrity/types')
  const base = resolveSettings(null)
  await db.collection('integrity_settings').updateOne(
    { target_kind: 'exam', target_id: examId },
    { $set: { ...base, enabled: true, snapshots_on_violation: true, signals: Object.fromEntries(Object.keys(base.signals).map((k) => [k, true])), tenant_id: null, updated_by: 'system:pro-certs', updated_at: now }, $setOnInsert: { target_kind: 'exam', target_id: examId } },
    { upsert: true },
  )
  await (await attempts()).updateOne({ id: a.id, exam_id: '' }, { $set: { exam_id: examId, bank_question_ids: chosen, updated_at: nowIso() } })
  const ex = await exposure()
  await ex.bulkWrite(chosen.map((qid) => ({ updateOne: { filter: { program_id: p.id, question_id: qid }, update: { $inc: { count: 1 }, $set: { last_at: now } }, upsert: true } })), { ordered: false })
}

// ─── Finalise ────────────────────────────────────────────────────────────────

async function trustFor(examId: string, userId: string): Promise<number | null> {
  const db = await getMongoDb()
  const ia = await db.collection('integrity_attempts').findOne({ target_kind: 'exam', target_id: examId, user_id: userId }, { sort: { last_at: -1 }, projection: { _id: 0, id: 1, consented_at: 1 } })
  if (!ia || !ia.consented_at) return null
  const events = await db.collection('integrity_events').find({ attempt_id: ia.id, type: { $ne: 'typing_summary' } }, { projection: { _id: 0, type: 1, at: 1, data: 1 } }).limit(5000).toArray()
  const { computeTrustScore } = await import('@/lib/integrity/trust-score')
  return computeTrustScore(events.map((e) => ({ type: String(e.type), at: Number(e.at), data: e.data as Doc }))).score
}

/** Decide a submitted attempt (idempotent: only `ready` attempts with a fully graded submission). */
export async function finalizeAttempt(a: AttemptDoc): Promise<AttemptDoc['status']> {
  if (a.status !== 'ready' || !a.exam_id) return a.status
  const db = await getMongoDb()
  const sub = await db.collection('exam_submissions').findOne({ exam_id: a.exam_id, user_id: a.user_id }, { sort: { created_at: -1 }, projection: { _id: 0, score: 1, max_score: 1, has_pending_review: 1, submitted_at: 1, identity_check: 1 } })
  if (!sub) {
    // Never started within the window: the attempt lapses (counts as an attempt).
    if (Date.now() > Date.parse(a.created_at) + (START_WINDOW_DAYS + 1) * DAY) {
      const draft = await db.collection('exam_drafts').findOne({ exam_id: a.exam_id, user_id: a.user_id }, { projection: { _id: 1 } })
      if (!draft) {
        await (await attempts()).updateOne({ id: a.id, status: 'ready' }, { $set: { status: 'failed', flags: ['not_taken'], decided_at: nowIso(), updated_at: nowIso() } })
        return 'failed'
      }
    }
    return 'ready'
  }
  if (sub.has_pending_review) return 'ready'
  const p = await getProgram(a.program_id)
  if (!p) return 'ready'
  const scorePct = scorePercent(sub.score, sub.max_score)
  const trust = await trustFor(a.exam_id, a.user_id)
  const outcome = decideOutcome({ scorePct, passPercent: p.blueprint.pass_percent, trust, minTrust: p.proctoring.min_trust, review: p.proctoring.review, identityFlagged: (sub.identity_check as Doc | null)?.needs_manual_review === true })
  const status = outcome.decision === 'failed' ? 'failed' : outcome.decision === 'review' ? 'in_review' : 'passed'
  const now = nowIso()
  const r = await (await attempts()).updateOne(
    { id: a.id, status: 'ready' },
    { $set: { status, score_pct: scorePct, trust_score: trust, flags: outcome.flags, submitted_at: String(sub.submitted_at || now), decided_at: status === 'in_review' ? null : now, updated_at: now, ...(status === 'in_review' ? { 'review.status': 'pending' } : {}) } },
  )
  if (r.modifiedCount !== 1) return a.status
  const fresh = (await (await attempts()).findOne({ id: a.id }, { projection: { _id: 0 } })) as AttemptDoc
  if (status === 'passed') await issueCredential(fresh, p)
  else {
    const { notifyAttemptOutcome } = await import('./notify')
    await notifyAttemptOutcome(fresh, p, status).catch(() => null)
  }
  return status
}

// ─── Review ──────────────────────────────────────────────────────────────────

export interface ReviewRow extends Pick<AttemptDoc, 'id' | 'program_id' | 'program_slug' | 'score_pct' | 'trust_score' | 'flags' | 'exam_id' | 'submitted_at' | 'created_at' | 'status' | 'review'> {
  name: string
  email: string
  program_title: string
  pass_percent: number
  min_trust: number
}

export async function reviewQueue(status: 'in_review' | 'decided' = 'in_review'): Promise<ReviewRow[]> {
  const filter = status === 'in_review' ? { status: 'in_review' } : { 'review.status': { $in: ['approved', 'rejected'] } }
  const rows = (await (await attempts()).find(filter as never, { projection: { _id: 0, bank_question_ids: 0, invite_token: 0 } }).sort(status === 'in_review' ? { submitted_at: 1 } : { decided_at: -1 }).limit(200).toArray()) as AttemptDoc[]
  if (!rows.length) return []
  const db = await getMongoDb()
  const [users, progs] = await Promise.all([
    db.collection('user').find({ id: { $in: [...new Set(rows.map((r) => r.user_id))] } }, { projection: { _id: 0, id: 1, fullName: 1, name: 1, email: 1 } }).toArray(),
    (await programs()).find({ id: { $in: [...new Set(rows.map((r) => r.program_id))] } }, { projection: { _id: 0, id: 1, title: 1, blueprint: 1, proctoring: 1 } }).toArray(),
  ])
  const u = new Map(users.map((x) => [String(x.id), x]))
  const pr = new Map(progs.map((x) => [x.id, x]))
  return rows.map((r) => ({
    id: r.id, program_id: r.program_id, program_slug: r.program_slug, score_pct: r.score_pct, trust_score: r.trust_score, flags: r.flags,
    exam_id: r.exam_id, submitted_at: r.submitted_at, created_at: r.created_at, status: r.status, review: r.review,
    name: String(u.get(r.user_id)?.fullName || u.get(r.user_id)?.name || 'Candidate'), email: String(u.get(r.user_id)?.email || ''),
    program_title: String(pr.get(r.program_id)?.title || r.program_slug),
    pass_percent: Number(pr.get(r.program_id)?.blueprint?.pass_percent ?? 0), min_trust: Number(pr.get(r.program_id)?.proctoring?.min_trust ?? 0),
  }))
}

export async function decideReview(attemptId: string, reviewerId: string, approve: boolean, note: string): Promise<AttemptDoc> {
  const col = await attempts()
  const now = nowIso()
  const r = await col.updateOne(
    { id: attemptId, status: 'in_review' },
    { $set: { status: approve ? 'passed' : 'rejected', review: { status: approve ? 'approved' : 'rejected', by: reviewerId, at: now, note: note.slice(0, 2000) }, decided_at: now, updated_at: now } },
  )
  const a = (await col.findOne({ id: attemptId }, { projection: { _id: 0 } })) as AttemptDoc | null
  if (!a) throw new ProCertError(404, 'pro_cert_attempt_not_found', 'Attempt not found.')
  if (r.modifiedCount !== 1) throw new ProCertError(409, 'pro_cert_already_decided', 'This attempt was already decided.')
  const p = await getProgram(a.program_id)
  if (p && approve) await issueCredential(a, p)
  else if (p) {
    const { notifyAttemptOutcome } = await import('./notify')
    await notifyAttemptOutcome(a, p, 'rejected').catch(() => null)
  }
  return a
}

// ─── Credentials ─────────────────────────────────────────────────────────────

export async function issueCredential(a: AttemptDoc, p: ProgramDoc): Promise<CredentialDoc> {
  const col = await credentials()
  const existing = (await col.findOne({ attempt_id: a.id }, { projection: { _id: 0 } })) as CredentialDoc | null
  if (existing) return existing
  const db = await getMongoDb()
  const user = await db.collection('user').findOne({ id: a.user_id }, { projection: { _id: 0, fullName: 1, name: 1, email: 1 } })
  const holder = String(user?.fullName || user?.name || 'CodeSpectra learner').slice(0, 120)
  const issuedAt = nowIso()
  const prev = a.renews_credential_id ? ((await col.findOne({ id: a.renews_credential_id, user_id: a.user_id }, { projection: { _id: 0 } })) as CredentialDoc | null) : null
  const expiresAt = prev && prev.status === 'active' ? renewedExpiry(prev.expires_at, issuedAt, p.validity_months) : addMonths(issuedAt, p.validity_months)
  const id = credentialIdFrom(randomBytes(20))
  const rowId = randomUUID()
  const doc: CredentialDoc = {
    id, user_id: a.user_id, holder_name: holder, program_id: p.id, program_slug: p.slug, program_title: p.title, level: p.level, skills: p.skills,
    attempt_id: a.id, score_pct: a.score_pct ?? 0, issued_at: issuedAt, expires_at: expiresAt, status: 'active',
    renewed_from: prev?.id ?? null, renewed_by: null, revoked_at: null, revoke_reason: null, certificate_row_id: rowId, reminder_sent_at: null,
  }
  try {
    await col.insertOne({ ...doc })
  } catch (e) {
    if (isDup(e)) return (await col.findOne({ attempt_id: a.id }, { projection: { _id: 0 } })) as CredentialDoc
    throw e
  }
  // Shared certificate row: /cert/verify/<token>, certificate downloads and the skill passport (lib/passport/evidence-map.ts).
  const { certificationAttempts, ensureIssuedCertificateIndex, newAttemptToken } = await import('@/lib/db/certifications')
  await ensureIssuedCertificateIndex()
  await (await certificationAttempts()).updateOne(
    { issue_key: `pcert:${a.id}` },
    {
      $setOnInsert: {
        id: rowId, user_id: a.user_id, certification_id: `pcert:${p.slug}`, verify_token: newAttemptToken(), started_at: a.created_at, submitted_at: issuedAt,
        score: a.score_pct ?? 0, passed: true, snapshot: { name: holder, email: String(user?.email || '') },
        cert_snapshot: { title: p.title, level: p.level, source: 'CodeSpectra proctored certification', skills: p.skills } as never,
        score_label: `${Math.round(a.score_pct ?? 0)}% · proctored`, issue_key: `pcert:${a.id}`,
        expires_at: expiresAt, proctored: true, trust_score: a.trust_score, credential_id: id,
      } as never,
    },
    { upsert: true },
  )
  if (prev && prev.status === 'active') {
    await col.updateOne({ id: prev.id, status: 'active' }, { $set: { status: 'renewed', renewed_by: id } })
    await (await certificationAttempts()).updateOne({ issue_key: `pcert:${prev.attempt_id}` }, { $set: { superseded_by: id } as never })
  }
  await (await attempts()).updateOne({ id: a.id }, { $set: { credential_id: id, updated_at: nowIso() } })
  const { revalidatePassportForUser } = await import('./notify')
  await revalidatePassportForUser(a.user_id)
  const { notifyCredentialIssued } = await import('./notify')
  await notifyCredentialIssued(doc).catch(() => null)
  // AUTO-089 / AUTO-088: the certificate follow-up (LinkedIn email, XP) and workflows see proctored credentials.
  void import('@/lib/automation/events').then(async ({ emit }) => {
    const verify = `/verify/${encodeURIComponent(id)}`
    await emit('certificate.issued', { user_id: a.user_id, title: p.title, verify_url: verify, issued_at: issuedAt }, { idempotencyKey: `certificate.issued:pcert:${id}` })
    await emit('pro_cert.passed', {
      user_id: a.user_id, credential_id: id, program_id: p.id, program_slug: p.slug, program_title: p.title, level: p.level,
      score_pct: a.score_pct ?? 0, expires_at: expiresAt, verify_url: verify, renewal: !!prev,
    }, { idempotencyKey: `pro_cert.passed:${id}` })
  }).catch((e) => console.error('[automation] emit failed:', e))
  return doc
}

export async function revokeCredential(id: string, by: string, reason: string): Promise<CredentialDoc> {
  if (!isProCredentialId(id)) throw new ProCertError(404, 'pro_cert_credential_not_found', 'Credential not found.')
  const col = await credentials()
  const now = nowIso()
  await col.updateOne({ id, status: { $ne: 'revoked' } }, { $set: { status: 'revoked', revoked_at: now, revoke_reason: reason.slice(0, 500) } })
  const c = (await col.findOne({ id }, { projection: { _id: 0 } })) as CredentialDoc | null
  if (!c) throw new ProCertError(404, 'pro_cert_credential_not_found', 'Credential not found.')
  const { certificationAttempts } = await import('@/lib/db/certifications')
  await (await certificationAttempts()).updateOne({ issue_key: `pcert:${c.attempt_id}` }, { $set: { revoked_at: now, revoked_by: by, revoke_reason: reason.slice(0, 500) } })
  const { revalidatePassportForUser } = await import('./notify')
  await revalidatePassportForUser(c.user_id)
  return c
}

export interface PublicCredentialView {
  id: string
  holder_name: string
  title: string
  level: string
  skills: string[]
  issued_at: string
  expires_at: string
  state: 'valid' | 'expired' | 'revoked' | 'renewed'
  renewed_by: string | null
  program_slug: string
}

export async function verifyProCredential(id: string): Promise<PublicCredentialView | null> {
  if (!isProCredentialId(id)) return null
  const c = (await (await credentials()).findOne({ id }, { projection: { _id: 0 } })) as CredentialDoc | null
  if (!c) return null
  return {
    id: c.id, holder_name: c.holder_name, title: c.program_title, level: c.level, skills: c.skills,
    issued_at: c.issued_at, expires_at: c.expires_at, state: credentialState(c), renewed_by: c.renewed_by, program_slug: c.program_slug,
  }
}

// ─── Sweep (platform cron, every 5 minutes) ──────────────────────────────────

export async function runProCertSweep(now = new Date()): Promise<{ finalized: number; rebuilt: number; settled: number; reminded: number }> {
  const out = { finalized: 0, rebuilt: 0, settled: 0, reminded: 0 }
  const db = await getMongoDb()
  const col = await attempts()
  // 1. Attempts whose exam was never built (a crash between steps).
  const unbuilt = (await col.find({ status: 'ready', exam_id: '', created_at: { $lt: new Date(now.getTime() - 60_000).toISOString() } }, { projection: { _id: 0 } }).limit(20).toArray()) as AttemptDoc[]
  for (const a of unbuilt) {
    const p = await getProgram(a.program_id)
    if (p) await buildExam(a, p).then(() => out.rebuilt++).catch((e) => console.error('[pro-certs] rebuild failed:', (e as Error)?.message))
  }
  // 2. Ready attempts with a submission (or past the start window).
  const ready = (await col.find({ status: 'ready', exam_id: { $ne: '' } }, { projection: { _id: 0 } }).sort({ updated_at: 1 }).limit(300).toArray()) as AttemptDoc[]
  if (ready.length) {
    const submitted = new Set((await db.collection('exam_submissions').find({ exam_id: { $in: ready.map((a) => a.exam_id) } }, { projection: { _id: 0, exam_id: 1 } }).toArray()).map((s) => String(s.exam_id)))
    for (const a of ready) {
      const lapsed = now.getTime() > Date.parse(a.created_at) + (START_WINDOW_DAYS + 1) * DAY
      if (!submitted.has(a.exam_id) && !lapsed) continue
      const st = await finalizeAttempt(a).catch((e) => { console.error('[pro-certs] finalize failed:', (e as Error)?.message); return 'ready' as const })
      if (st !== 'ready') out.finalized++
    }
  }
  // 3. Pending orders the webhook never confirmed (10 min – 2 days old).
  const pend = (await (await orders()).find({ status: { $in: ['pending', 'cancelled'] }, 'payment.ref': { $ne: null }, created_at: { $lt: new Date(now.getTime() - 10 * 60_000).toISOString(), $gt: new Date(now.getTime() - 2 * DAY).toISOString() } }, { projection: { _id: 0, id: 1 } }).limit(50).toArray())
  for (const o of pend) if ((await settleOrder(String(o.id)).catch(() => 'pending')) === 'paid') out.settled++
  // 4. Paid orders without an attempt.
  // (markPaid re-checks for an already-open attempt — CORE-040 — so a duplicate payment is refunded, not turned into a second attempt.)
  const orphan = (await (await orders()).find({ status: 'paid', attempt_id: null, duplicate: null } as never, { projection: { _id: 0 } }).limit(20).toArray()) as CertOrderDoc[]
  for (const o of orphan) await markPaid(o, { amount: o.payment.paid_amount ?? o.amount, currency: o.currency, txn: o.payment.txn || '', intent: o.payment.intent }).catch((e) => console.error('[pro-certs] attempt for paid order failed:', (e as Error)?.message))
  // 5. Expiry reminders (60 days before), once per credential.
  const soon = (await (await credentials()).find({ status: 'active', reminder_sent_at: null, expires_at: { $lt: new Date(now.getTime() + 60 * DAY).toISOString(), $gt: now.toISOString() } }, { projection: { _id: 0 } }).limit(100).toArray()) as CredentialDoc[]
  if (soon.length) {
    const { notifyExpirySoon } = await import('./notify')
    for (const c of soon) {
      const claimed = await (await credentials()).updateOne({ id: c.id, reminder_sent_at: null }, { $set: { reminder_sent_at: now.toISOString() } })
      if (claimed.modifiedCount === 1) { await notifyExpirySoon(c).catch(() => null); out.reminded++ }
    }
  }
  return out
}

export { sectionQuestionCount }
