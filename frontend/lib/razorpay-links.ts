/**
 * CORE-039: Razorpay for one-off purchases that use a redirect flow
 * (certification attempts, marketplace orders — mentor sessions and cohort
 * seats are marketplace orders). Uses Razorpay Payment Links on the same
 * credentials as plan billing (lib/razorpay-server.ts): a hosted payment page,
 * a GET callback to our return route and the `payment_link.*` webhook on the
 * existing /api/billing/webhook endpoint (signature-verified there).
 *
 * Paid state is ALWAYS read back from Razorpay (fetchPaymentLinkState) —
 * never from the callback query or the webhook body. Settlement on our side
 * is a conditional update, so the callback, the webhook and the sweeps may all
 * run for the same payment.
 *
 * reference_id (≤ 40 chars, unique per Razorpay account) is our own payment
 * ref: "MKT…" (marketplace) / "PCE…" (certifications), the same shapes as the
 * PhonePe transaction ids, so routing never collides with plan billing.
 */
import 'server-only'
import crypto from 'crypto'
import { getRazorpay, isRazorpayConfigured } from '@/lib/razorpay-server'
import { readServerSecrets } from '@/lib/server-secrets-cache'

export { isRazorpayConfigured }

export type LinkState =
  | { state: 'paid'; amount: number; currency: string; txn: string; intent: string | null }
  | { state: 'failed' | 'pending' | 'unknown' }

type LinkLike = {
  id?: unknown
  status?: unknown
  amount?: unknown
  amount_paid?: unknown
  currency?: unknown
  reference_id?: unknown
  payments?: unknown
}

/**
 * Pure: interpret a fetched Payment Link. `paid` needs status "paid", the
 * expected reference and at least one captured payment; the captured payment
 * id is returned as `intent` (it is what a refund needs).
 */
export function linkStateFrom(link: LinkLike | null | undefined, expectedRef: string): LinkState {
  if (!link || typeof link !== 'object') return { state: 'unknown' }
  if (expectedRef && String(link.reference_id || '') !== expectedRef) return { state: 'unknown' }
  const status = String(link.status || '')
  if (status === 'paid') {
    const pays = Array.isArray(link.payments) ? (link.payments as Array<Record<string, unknown>>) : []
    const captured = pays.find((p) => String(p?.status || '') === 'captured') ?? null
    if (!captured || !captured.payment_id) return { state: 'pending' }
    return {
      state: 'paid',
      amount: Number(link.amount_paid ?? captured.amount ?? 0),
      currency: String(link.currency || '').toUpperCase(),
      txn: String(captured.payment_id),
      intent: String(captured.payment_id),
    }
  }
  if (status === 'expired' || status === 'cancelled') return { state: 'failed' }
  if (status === 'created' || status === 'partially_paid') return { state: 'pending' }
  return { state: 'unknown' }
}

/**
 * Pure: Razorpay's Payment Link callback signature —
 * HMAC_SHA256(`${link_id}|${reference_id}|${status}|${payment_id}`, key_secret).
 */
export function paymentLinkCallbackSignature(
  q: { link_id: string; reference_id: string; status: string; payment_id: string },
  keySecret: string,
): string {
  return crypto.createHmac('sha256', keySecret).update(`${q.link_id}|${q.reference_id}|${q.status}|${q.payment_id}`).digest('hex')
}

/** Verify the callback query (defence in depth: settlement still re-reads the link). */
export async function verifyPaymentLinkCallback(params: URLSearchParams): Promise<boolean> {
  const q = {
    link_id: params.get('razorpay_payment_link_id') || '',
    reference_id: params.get('razorpay_payment_link_reference_id') || '',
    status: params.get('razorpay_payment_link_status') || '',
    payment_id: params.get('razorpay_payment_id') || '',
  }
  const sig = params.get('razorpay_signature') || ''
  if (!q.link_id || !sig) return false
  const s = await readServerSecrets().catch(() => ({} as Record<string, string | undefined>))
  const secret = (s as Record<string, string | undefined>).razorpay_key_secret || process.env.RAZORPAY_KEY_SECRET || ''
  if (!secret) return false
  const expected = paymentLinkCallbackSignature(q, secret)
  return expected.length === sig.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))
}

/** Create a hosted payment page. Amount in minor units. Returns the link id (our payment.ref) + URL. */
export async function createPaymentLink(p: {
  amount: number
  currency: string
  referenceId: string
  description: string
  email?: string | null
  callbackUrl: string
  /** unix seconds; Razorpay needs ≥ 15 minutes ahead */
  expireBy: number
  notes: Record<string, string>
}): Promise<{ id: string; url: string }> {
  const rp = await getRazorpay()
  const link = await rp.paymentLink.create({
    amount: p.amount,
    currency: p.currency,
    accept_partial: false,
    reference_id: p.referenceId.slice(0, 40),
    description: p.description.slice(0, 2048),
    customer: p.email ? { email: p.email } : {},
    notify: { sms: false, email: false },
    reminder_enable: false,
    callback_url: p.callbackUrl,
    callback_method: 'get',
    expire_by: Math.max(p.expireBy, Math.floor(Date.now() / 1000) + 16 * 60),
    notes: p.notes,
  } as never)
  const l = link as unknown as { id?: string; short_url?: string }
  if (!l.id || !l.short_url) throw new Error('Razorpay did not return a payment link')
  return { id: l.id, url: l.short_url }
}

export async function fetchPaymentLinkState(linkId: string, expectedRef: string): Promise<LinkState> {
  if (!/^plink_[A-Za-z0-9]{6,40}$/.test(linkId)) return { state: 'unknown' }
  const rp = await getRazorpay()
  return linkStateFrom((await rp.paymentLink.fetch(linkId)) as unknown as LinkLike, expectedRef)
}

/** Close an unpaid link so an old tab can't take money. Best effort. */
export async function cancelPaymentLink(linkId: string): Promise<boolean> {
  if (!/^plink_[A-Za-z0-9]{6,40}$/.test(linkId)) return false
  try {
    await (await getRazorpay()).paymentLink.cancel(linkId)
    return true
  } catch {
    return false
  }
}

/**
 * Refund a captured Razorpay payment. Callers claim the refund on their own
 * order first (idempotent), so a retry never refunds twice; `receipt` is our
 * refund ref for reconciliation.
 */
export async function refundRazorpayPayment(paymentId: string, amount: number, receipt: string, notes: Record<string, string>): Promise<{ ok: boolean; ref: string }> {
  if (!/^pay_[A-Za-z0-9]{6,40}$/.test(paymentId)) throw new Error('No Razorpay payment to refund')
  const rp = await getRazorpay()
  const r = (await rp.payments.refund(paymentId, { amount, receipt: receipt.slice(0, 40), notes } as never)) as unknown as { id?: string; status?: string }
  return { ok: r.status === 'processed' || r.status === 'pending' || r.status === 'created', ref: String(r.id || receipt) }
}
