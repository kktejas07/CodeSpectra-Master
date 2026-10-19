/**
 * Stored shapes for the buyer part: contract types + buyer-only bookkeeping fields.
 * (Extra fields are additive — the seller/admin part reads the contract fields only.)
 */
import type { Collection } from 'mongodb'
import type { Cart, CartLine, Currency, Order, OrderLine } from './contract'
import { cartsCol, ordersCol } from './db'

export interface OrderLineDoc extends OrderLine {
  slug?: string
  image?: string | null
  variant_name?: string | null
  /** unit_price × qty before discount */
  gross?: number
  discount?: number
  /** GST / sales tax on this line (+ its shipping) */
  tax?: number
  shipping_amount?: number
  /** service snapshot */
  service?: { duration_min: number; mode: 'virtual' | 'in_person'; provider?: string | null; timezone: string } | null
  /** digital snapshot */
  digital?: { file_ids: string[]; download_limit: number; license_note?: string } | null
  refunded_amount?: number
  /** id of the refund that holds this line (set atomically when a refund is claimed) */
  refund_lock?: string | null
  /** one-shot restock owed by a finished refund */
  restock_pending?: boolean
  fulfilment: OrderLine['fulfilment'] & {
    /** set atomically before the first download is served (blocks a racing buyer refund) */
    download_claimed?: boolean
  }
}

export interface OrderDoc extends Order {
  lines: OrderLineDoc[]
  contact_phone?: string | null
  /** buyer's IANA time zone at checkout (e-mail times) */
  buyer_tz?: string | null
  /** funded_by: who pays the discount (CORE-021); seller_id set for a seller's own coupon. */
  coupon?: { id: string; code: string; funded_by?: 'platform' | 'seller'; seller_id?: string | null } | null
  tax_bps?: number
  prices_include_tax?: boolean
  /** stock + slot holds made at checkout; released if unpaid after RESERVATION_MS */
  reservation?: { status: 'held' | 'committed' | 'released' | 'recommitting'; expires_at: string; items: { product_id: string; variant_id?: string | null; qty: number }[] }
  payment: Order['payment'] & {
    gateway_txn?: string | null
    intent?: string | null
    failure?: string | null
    refunded_total?: number
  }
  /** one-shot side effects already done after payment (idempotency markers) */
  post?: Record<string, string>
  /** what each claimed refund covers (so a resumed refund re-runs with exactly the same lines / amount) */
  refunds_meta?: Record<string, { amount: number; line_ids: string[] }>
  /** paid with a coupon use it could not redeem → refunded in full, not fulfilled */
  coupon_conflict?: boolean
  /** lines that could not be honoured after a late payment (refunded automatically) */
  unavailable_line_ids?: string[]
  cancelled_reason?: string | null
}

export interface CartDoc extends Cart {
  saved?: CartLine[]
  created_at?: string
}

export const RESERVATION_MS = 30 * 60_000

export async function orders(): Promise<Collection<OrderDoc>> {
  return (await ordersCol()) as unknown as Collection<OrderDoc>
}
export async function carts(): Promise<Collection<CartDoc>> {
  return (await cartsCol()) as unknown as Collection<CartDoc>
}

export function isCurrency(v: unknown): v is Currency {
  return v === 'INR' || v === 'USD'
}
