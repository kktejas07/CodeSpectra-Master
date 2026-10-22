/**
 * Account credit ledger (referral rewards). `billing_credits` rows:
 *   { id, user_id, currency, amount (+ grant / − debit, minor units), kind, ref, created_at }
 * `ref` is unique per kind (reward id for grants, order id for debits), so a
 * replayed grant or a re-activated order never books twice.
 */
import 'server-only'
import { getMongoDb } from '@/lib/mongodb'
import { newId, nowIso, type BillingOrderDoc } from '@/lib/db/billing'

interface CreditRow { id: string; user_id: string; currency: string; amount: number; kind: 'referral_reward' | 'order_debit' | 'admin_adjust'; ref: string; created_at: string }

let ready: Promise<void> | null = null
async function col() {
  const c = (await getMongoDb()).collection<CreditRow>('billing_credits')
  if (!ready) {
    ready = Promise.all([
      c.createIndex({ kind: 1, ref: 1 }, { unique: true }),
      c.createIndex({ user_id: 1, currency: 1 }),
    ]).then(() => undefined).catch((e) => {
      ready = null
      console.error('[credits] index setup failed:', (e as Error)?.message)
    })
  }
  await ready
  return c
}

export async function availableCredit(userId: string, currency: string): Promise<number> {
  const rows = await (await col()).aggregate<{ total: number }>([
    { $match: { user_id: userId, currency: currency.toUpperCase() } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]).toArray()
  return Math.max(0, Math.floor(rows[0]?.total ?? 0))
}

async function insertOnce(row: Omit<CreditRow, 'id' | 'created_at'>): Promise<boolean> {
  try {
    await (await col()).insertOne({ ...row, id: newId(), created_at: nowIso() })
    return true
  } catch (e) {
    if ((e as { code?: number })?.code === 11000) return false
    throw e
  }
}

export function grantCredit(userId: string, currency: string, amount: number, ref: string): Promise<boolean> {
  if (!Number.isInteger(amount) || amount <= 0) return Promise.resolve(false)
  return insertOnce({ user_id: userId, currency: currency.toUpperCase(), amount, kind: 'referral_reward', ref })
}

/** Book the credit a paid order used (once per order). */
export function debitCreditForOrder(order: Pick<BillingOrderDoc, 'id' | 'user_id' | 'currency' | 'credit_applied'>): Promise<boolean> {
  const amount = Math.floor(order.credit_applied || 0)
  if (amount <= 0) return Promise.resolve(false)
  return insertOnce({ user_id: order.user_id, currency: order.currency.toUpperCase(), amount: -amount, kind: 'order_debit', ref: order.id })
}
