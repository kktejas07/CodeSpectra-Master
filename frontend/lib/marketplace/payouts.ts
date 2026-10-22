/**
 * Seller payouts: request → admin approve → paid (manual bank/UPI with a
 * reference, or a Stripe Connect transfer) | failed / cancelled.
 *
 * Guardrails: one open payout per (seller, currency) (unique partial index);
 * amount ≥ settings.min_payout and ≤ available; the ledger debit is written at
 * request time (funds reserved) and reversed on failure / cancel, so the same
 * money can never be paid twice. A post-insert re-check undoes the request if
 * a concurrent refund pushed available below zero.
 */
import type { Currency, Payout } from './contract'
import type { PayoutDoc, SellerDoc } from './db'
import { MktError } from './settings'

export type PayoutAction = 'approve' | 'paid' | 'failed' | 'cancel'

/**
 * `paying` = a Stripe transfer is in flight (entered by compare-and-set from `approved` right before
 * transfers.create). Nothing can fail / cancel a paying payout: it ends as `paid`, or — only when
 * Stripe definitively refuses — `failed`, both via settleStripePayout / reconcilePayout.
 */
const NEXT: Record<PayoutAction, { from: Payout['status'][]; to: Payout['status'] }> = {
  approve: { from: ['requested'], to: 'approved' },
  paid: { from: ['approved'], to: 'paid' },
  failed: { from: ['requested', 'approved'], to: 'failed' },
  cancel: { from: ['requested'], to: 'cancelled' },
}

/** Pure: target status, or null when the transition isn't allowed. */
export function nextPayoutStatus(current: Payout['status'], action: PayoutAction): Payout['status'] | null {
  const t = NEXT[action]
  return t && t.from.includes(current) ? t.to : null
}

/** Pure: why a payout request is not allowed (null = ok). */
export function payoutBlocker(p: {
  seller: Pick<SellerDoc, 'status' | 'payout'>
  amount: number
  available: number
  min: number
}): string | null {
  if (p.seller.status !== 'approved') return 'Your seller account must be approved to request payouts.'
  if (!p.seller.payout?.method) return 'Add a payout method in settings first.'
  if (!p.seller.payout.verified) return 'Your payout details are awaiting verification.'
  if (!Number.isInteger(p.amount) || p.amount <= 0) return 'Enter a payout amount.'
  if (p.amount < p.min) return 'The amount is below the minimum payout.'
  if (p.amount > p.available) return 'The amount is more than your available balance.'
  return null
}

/** Pure: payout details snapshot taken when the payout is requested (what gets paid). */
export function destinationSnapshot(seller: Pick<SellerDoc, 'payout' | 'payout_secret' | 'stripe_account_id'>): NonNullable<PayoutDoc['destination']> {
  return {
    method: seller.payout.method as PayoutDoc['method'],
    account_ref: seller.payout.account_ref ?? null,
    verified: !!seller.payout.verified,
    secret: seller.payout_secret ?? null,
    stripe_account_id: seller.payout.method === 'stripe_connect' ? seller.stripe_account_id ?? null : null,
  }
}

/**
 * Pure: why this payout can't be approved / paid to its destination (null = ok). The snapshot must
 * have been verified and still be exactly the seller's current, verified details (payout edits are
 * blocked while a payout is open, so a mismatch means a concurrent change slipped in).
 */
export function destinationBlocker(p: Pick<PayoutDoc, 'method' | 'destination'>, seller: Pick<SellerDoc, 'payout' | 'payout_secret' | 'stripe_account_id'>): string | null {
  if (!seller.payout?.verified) return "The seller's payout details are not verified."
  const d = p.destination
  if (!d) return null // legacy payout (before snapshots): current verified details
  if (!d.verified) return 'The payout details were not verified when this payout was requested — cancel it and ask the seller to request again.'
  const now = destinationSnapshot(seller)
  if (d.method !== now.method || d.secret !== now.secret || (d.method === 'stripe_connect' && d.stripe_account_id !== now.stripe_account_id)) {
    return 'The seller changed their payout details after requesting — mark this payout failed and ask them to request again.'
  }
  return null
}

/** Pure: is a Stripe error a definitive refusal (no money moved), as opposed to a timeout / 5xx / network error? */
export function stripeErrorIsDefinitive(e: unknown): boolean {
  const t = (e as { type?: string })?.type || ''
  const status = (e as { statusCode?: number })?.statusCode
  if (t === 'StripeConnectionError' || t === 'StripeAPIError' || t === 'StripeRateLimitError' || t === 'StripeIdempotencyError') return false
  if (typeof status === 'number' && status >= 500) return false
  return t === 'StripeInvalidRequestError' || t === 'StripeCardError' || t === 'StripePermissionError' || t === 'StripeAuthenticationError'
}

const isDup = (e: unknown) => (e as { code?: number })?.code === 11000

export async function listPayouts(filter: { sellerId?: string; status?: string | null }, limit = 100): Promise<PayoutDoc[]> {
  const { payoutsCol } = await import('./db')
  const q: Record<string, unknown> = {}
  if (filter.sellerId) q.seller_id = filter.sellerId
  if (filter.status) q.status = filter.status
  return (await payoutsCol()).find(q, { projection: { _id: 0, destination: 0 } }).sort({ requested_at: -1 }).limit(Math.min(500, limit)).toArray()
}

export async function requestPayout(seller: SellerDoc, currency: Currency, amount?: number | null): Promise<PayoutDoc> {
  if (seller.is_platform) throw new MktError(400, "The platform store doesn't take payouts.")
  if (currency !== 'INR' && currency !== 'USD') throw new MktError(400, 'Choose INR or USD.')
  const { availableFor, insertEntries } = await import('./ledger')
  const { getSettings } = await import('./settings')
  const { payoutsCol, newId, nowIso } = await import('./db')
  const available = await availableFor(seller.id, currency)
  const amt = amount == null ? available : amount
  const block = payoutBlocker({ seller, amount: amt, available, min: (await getSettings()).min_payout[currency] })
  if (block) throw new MktError(400, block)
  const now = nowIso()
  const doc: PayoutDoc = {
    id: newId(), seller_id: seller.id, currency, amount: amt, method: seller.payout.method as PayoutDoc['method'],
    status: 'requested', ref: null, requested_at: now, paid_at: null, destination_masked: seller.payout.account_ref ?? null, open: true,
    destination: destinationSnapshot(seller),
  }
  const col = await payoutsCol()
  try {
    await col.insertOne(doc)
  } catch (e) {
    if (isDup(e)) throw new MktError(409, 'You already have a payout in progress for this currency.')
    throw e
  }
  await insertEntries([{ idem_key: `payout:${doc.id}`, payout_id: doc.id, seller_id: seller.id, currency, type: 'payout', amount: -amt, available_at: now, note: 'Payout requested' }])
  // A refund may have landed between the balance read and the debit.
  if ((await availableFor(seller.id, currency)) < 0) {
    await closeWithReversal(doc, 'cancelled', 'system', 'Balance changed — request again.')
    throw new MktError(409, 'Your available balance changed — request the payout again.')
  }
  const { notifyAdmins } = await import('./seller-notify')
  await notifyAdmins('mkt.payout_requested', 'Payout requested', `${seller.display_name} requested a ${currency} payout.`, '/dashboard/admin/marketplace?tab=payouts').catch(() => {})
  return doc
}

async function closeWithReversal(p: PayoutDoc, status: 'failed' | 'cancelled', actorId: string, reason: string | null) {
  const { payoutsCol, nowIso } = await import('./db')
  const { insertEntries } = await import('./ledger')
  const r = await (await payoutsCol()).updateOne({ id: p.id, status: p.status }, { $set: { status, failure_reason: reason, approved_by: actorId === 'system' ? p.approved_by ?? null : actorId }, $unset: { open: '' } })
  if (!r.modifiedCount) throw new MktError(409, 'This payout was just updated — reload and try again.')
  await insertEntries([{ idem_key: `payout_reversal:${p.id}`, payout_id: p.id, seller_id: p.seller_id, currency: p.currency, type: 'adjustment', amount: p.amount, available_at: nowIso(), note: status === 'failed' ? 'Payout failed — returned to balance' : 'Payout cancelled — returned to balance' }])
}

export async function cancelPayout(seller: SellerDoc, id: string): Promise<void> {
  const { payoutsCol } = await import('./db')
  const p = await (await payoutsCol()).findOne({ id, seller_id: seller.id }, { projection: { _id: 0 } })
  if (!p) throw new MktError(404, 'Payout not found')
  if (!nextPayoutStatus(p.status, 'cancel')) throw new MktError(409, 'Only requested payouts can be cancelled.')
  await closeWithReversal(p, 'cancelled', seller.user_id, null)
}

/** Admin action. `paid` needs a reference for manual methods; Stripe Connect transfers itself. */
export async function decidePayout(actorId: string, id: string, action: Exclude<PayoutAction, 'cancel'>, opts: { ref?: string | null; reason?: string | null } = {}): Promise<PayoutDoc> {
  const { payoutsCol, nowIso } = await import('./db')
  const col = await payoutsCol()
  const p = await col.findOne({ id }, { projection: { _id: 0 } })
  if (!p) throw new MktError(404, 'Payout not found')
  if (p.status === 'paying') throw new MktError(409, 'A Stripe transfer for this payout is in progress — use Reconcile to check it.')
  const to = nextPayoutStatus(p.status, action)
  if (!to) throw new MktError(409, `Can't mark a ${p.status} payout as ${action}.`)
  const { getSellerById, audit } = await import('./sellers')
  const seller = await getSellerById(p.seller_id)
  if (!seller) throw new MktError(404, 'Seller not found')

  if (action === 'failed') {
    await closeWithReversal(p, 'failed', actorId, String(opts.reason || '').slice(0, 500) || 'Marked failed')
    await audit(actorId, 'payout.failed', p.id, opts.reason, 'payout')
    const { notifySeller } = await import('./seller-notify')
    await notifySeller(seller, 'mkt.payout_failed', 'Payout failed', 'Your payout could not be completed and the amount is back in your balance. Check your payout details.', '/dashboard/seller?tab=payouts',
      { title: { key: 'mkt.seller.payoutFailed.title' }, message: { key: 'mkt.seller.payoutFailed.message' } })
    return { ...p, status: 'failed' }
  }

  const block = destinationBlocker(p, seller)
  if (block) throw new MktError(409, block)

  if (action === 'approve') {
    const r = await col.updateOne({ id, status: 'requested' }, { $set: { status: 'approved', approved_by: actorId, approved_at: nowIso() } })
    if (!r.modifiedCount) throw new MktError(409, 'This payout was just updated — reload and try again.')
    await audit(actorId, 'payout.approved', p.id, null, 'payout')
    return { ...p, status: 'approved' }
  }

  // paid
  if (p.method === 'stripe_connect') return payViaStripe(actorId, p, seller)
  const ref = String(opts.ref || '').trim().slice(0, 120)
  if (ref.length < 3) throw new MktError(400, 'Enter the bank / UPI transaction reference.')
  const r = await col.updateOne({ id, status: 'approved' }, { $set: { status: 'paid', ref, paid_at: nowIso(), stripe_transfer_id: null }, $unset: { open: '' } })
  if (!r.modifiedCount) throw new MktError(409, 'This payout was just updated — reload and try again.')
  return afterPaid(actorId, p, seller, ref)
}

async function afterPaid(actorId: string, p: PayoutDoc, seller: SellerDoc, ref: string): Promise<PayoutDoc> {
  const { audit } = await import('./sellers')
  await audit(actorId, 'payout.paid', p.id, ref, 'payout')
  const { notifySeller } = await import('./seller-notify')
  await notifySeller(seller, 'mkt.payout_paid', 'Payout sent', `Your ${p.currency} payout has been sent (reference ${ref}).`, '/dashboard/seller?tab=payouts',
    { title: { key: 'mkt.seller.payoutPaid.title' }, message: { key: 'mkt.seller.payoutPaid.message', params: { currency: p.currency, ref } } })
  const { nowIso } = await import('./db')
  return { ...p, status: 'paid', ref, paid_at: nowIso(), open: undefined }
}

const transferKey = (payoutId: string) => `mkt-payout-${payoutId}`

/** approved → paying (compare-and-set) → Stripe transfer → paid. Ambiguous errors leave it paying for reconcile. */
async function payViaStripe(actorId: string, p: PayoutDoc, seller: SellerDoc): Promise<PayoutDoc> {
  const { payoutsCol, nowIso } = await import('./db')
  const col = await payoutsCol()
  const dest = p.destination?.stripe_account_id ?? seller.stripe_account_id
  if (!dest || !seller.payout.verified) throw new MktError(400, "The seller's Stripe account isn't ready for payouts.")
  const cas = await col.updateOne({ id: p.id, status: 'approved' }, { $set: { status: 'paying', paying_at: nowIso(), paying_by: actorId } })
  if (!cas.modifiedCount) throw new MktError(409, 'This payout was just updated — reload and try again.')
  return settleStripePayout(actorId, { ...p, status: 'paying' }, seller, dest)
}

async function settleStripePayout(actorId: string, p: PayoutDoc, seller: SellerDoc, dest: string): Promise<PayoutDoc> {
  const { payoutsCol, nowIso } = await import('./db')
  const { audit } = await import('./sellers')
  const col = await payoutsCol()
  const { getStripeClient } = await import('@/lib/stripe-client')
  const stripe = await getStripeClient()
  let transferId: string | null = null
  try {
    // Already sent by an earlier attempt? (the transfer_group is ours alone)
    const existing = await stripe.transfers.list({ transfer_group: `payout_${p.id}`, limit: 1 })
    transferId = existing.data[0]?.id ?? null
    if (!transferId) {
      const t = await stripe.transfers.create(
        { amount: p.amount, currency: p.currency.toLowerCase(), destination: dest, transfer_group: `payout_${p.id}`, metadata: { payout_id: p.id, seller_id: p.seller_id } },
        { idempotencyKey: transferKey(p.id) },
      )
      transferId = t.id
    }
  } catch (e) {
    const msg = (e as Error)?.message?.slice(0, 200) || 'Stripe transfer failed'
    if (stripeErrorIsDefinitive(e)) {
      await closeWithReversal(p, 'failed', actorId, msg) // from 'paying' — Stripe refused, no money moved
      await audit(actorId, 'payout.failed', p.id, msg, 'payout')
      throw new MktError(502, `Stripe refused the transfer — the amount was returned to the seller's balance. ${msg}`)
    }
    await col.updateOne({ id: p.id, status: 'paying' }, { $set: { failure_reason: `Transfer status unknown: ${msg}` } })
    await audit(actorId, 'payout.transfer_unknown', p.id, msg, 'payout')
    throw new MktError(502, "Stripe didn't confirm the transfer. It stays in progress — use Reconcile in a minute to check it (it will never be sent twice).")
  }
  const r = await col.updateOne({ id: p.id, status: 'paying' }, { $set: { status: 'paid', ref: transferId, paid_at: nowIso(), stripe_transfer_id: transferId, failure_reason: null }, $unset: { open: '' } })
  if (!r.modifiedCount) {
    const cur = await col.findOne({ id: p.id }, { projection: { _id: 0 } })
    if (cur?.status === 'paid') return cur
    throw new MktError(409, 'This payout was just updated — reload and try again.')
  }
  return afterPaid(actorId, p, seller, transferId!)
}

/** Admin: resolve a payout stuck in `paying` (timeout / crash) by its Stripe transfer group + idempotency key. */
export async function reconcilePayout(actorId: string, id: string): Promise<PayoutDoc> {
  const { payoutsCol } = await import('./db')
  const p = await (await payoutsCol()).findOne({ id }, { projection: { _id: 0 } })
  if (!p) throw new MktError(404, 'Payout not found')
  if (p.status !== 'paying') throw new MktError(409, 'Only payouts with a transfer in progress need reconciling.')
  const { getSellerById } = await import('./sellers')
  const seller = await getSellerById(p.seller_id)
  if (!seller) throw new MktError(404, 'Seller not found')
  const dest = p.destination?.stripe_account_id ?? seller.stripe_account_id
  if (!dest) throw new MktError(400, "The seller's Stripe account isn't set.")
  return settleStripePayout(actorId, p, seller, dest)
}
