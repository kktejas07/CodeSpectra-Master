/**
 * Marketplace collections with lazily built indexes (shared by the buyer part and the
 * seller/admin part — see lib/marketplace/contract.ts "Ownership").
 *
 *  mkt_sellers       Seller (+ encrypted KYC / payout secrets, never returned raw)
 *  mkt_products      Product
 *  mkt_carts         Cart
 *  mkt_orders        Order
 *  mkt_ledger        LedgerEntry, append-only; `idem_key` unique makes every money write idempotent
 *  mkt_payouts       Payout
 *  mkt_settings      single doc { _id: 'global' } — MarketplaceSettings
 *  mkt_reviews       product reviews (buyer writes; seller reads)
 *  mkt_files         digital-product files (encrypted bytes when object storage isn't configured)
 *  mkt_refunds       refund / return requests (buyer opens; admin decides)
 *  mkt_bookings      service bookings (buyer part) — unique per (product, slot start)
 *  mkt_audit         KYC / moderation / payout audit trail (admin actions)
 */
import type { Binary, Collection, Document } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'
import type { Cart, Currency, LedgerEntry, MarketplaceSettings, Order, Payout, Product, Seller } from './contract'

export { newId, nowIso } from '@/lib/db/ids'

/** Stored seller: contract fields + server-only secrets (strip with publicSeller in sellers.ts). */
export interface SellerDoc extends Seller {
  contact_email?: string
  phone?: string | null
  whatsapp_opt_in?: boolean
  /** AES-GCM box (encryptSensitive) of { pan?, tax_id? } */
  kyc_secret?: string | null
  /** AES-GCM box of { account_no?, ifsc?, account_name?, upi?, routing_no? } */
  payout_secret?: string | null
  /** Stripe Connect Express account id (acct_…) — not a secret, but server-only */
  stripe_account_id?: string | null
  w9_acknowledged?: boolean
  terms_accepted_at?: string | null
  terms_commission_bps?: number | null
  review_note?: string | null
  reviewed_by?: string | null
}

export interface ProductDoc extends Product {
  review_note?: string | null
  submitted_at?: string | null
  low_stock_threshold?: number | null
  low_stock_notified_at?: string | null
}

export interface LedgerDoc extends LedgerEntry {
  /** unique: e.g. `sale:<order>:<line>`, `refund:<order>:<line>:<n>`, `payout:<payout>` */
  idem_key: string
  payout_id?: string | null
  kind?: Product['kind'] | null
}

export interface PayoutDoc extends Payout {
  approved_by?: string | null
  approved_at?: string | null
  failure_reason?: string | null
  note?: string | null
  /** method details snapshot (masked) shown to admins */
  destination_masked?: string | null
  /** true while requested/approved/paying — unique per (seller, currency): one open payout at a time */
  open?: boolean
  stripe_transfer_id?: string | null
  /** Payout details as they were at request time (sealed secret never leaves the server) */
  destination?: { method: 'bank' | 'upi' | 'stripe_connect'; account_ref: string | null; verified: boolean; secret: string | null; stripe_account_id: string | null } | null
  paying_at?: string | null
  paying_by?: string | null
}

export interface SettingsDoc extends MarketplaceSettings {
  _id: 'global'
  updated_at: string
  updated_by?: string | null
}

export interface ReviewDoc {
  id: string
  product_id: string
  seller_id: string
  order_id: string
  user_id: string
  rating: number // 1..5
  title?: string
  body?: string
  status: 'published' | 'hidden'
  created_at: string
}

export interface FileDoc {
  id: string
  seller_id: string
  product_id?: string | null
  name: string
  mime: string
  size: number
  storage: 's3' | 'db'
  /** AES-GCM box when storage = 'db' */
  data?: Binary | Buffer | null
  scanned: boolean
  /** "deleted" by the seller but bought by someone: kept for buyers' downloads, hidden from the seller */
  archived_at?: string | null
  created_at: string
}

export interface RefundRequestDoc {
  id: string
  order_id: string
  buyer_id: string
  seller_id: string
  line_ids: string[]
  currency: Currency
  amount: number // minor units requested
  reason: string
  type: 'refund' | 'return' | 'dispute'
  status: 'open' | 'approved' | 'rejected' | 'refunded'
  decided_by?: string | null
  decided_at?: string | null
  note?: string | null
  created_at: string
  updated_at: string
}

export interface BookingDoc {
  id: string
  product_id: string
  seller_id: string
  order_id: string
  line_id: string
  buyer_id: string
  start: string
  end: string
  status: 'held' | 'booked' | 'completed' | 'cancelled'
  join_url?: string | null
  meeting_id?: string | null
  created_at: string
  updated_at: string
}

export interface AuditDoc {
  id: string
  actor_id: string
  action: string
  target: { type: 'seller' | 'product' | 'payout' | 'order' | 'refund' | 'settings'; id: string }
  note?: string | null
  created_at: string
}

const ready = new Map<string, Promise<unknown> | null>()

function lazy<T extends Document>(name: string, build: (c: Collection<T>) => Promise<unknown>) {
  return async (): Promise<Collection<T>> => {
    const col = (await getMongoDb()).collection<T>(name)
    if (!ready.get(name)) {
      ready.set(name, build(col).catch((e) => {
        ready.set(name, null)
        console.error(`[marketplace] ${name} index build failed`, e)
      }))
    }
    await ready.get(name)
    return col
  }
}

export const sellersCol = lazy<SellerDoc>('mkt_sellers', (c) => Promise.all([
  c.createIndex({ id: 1 }, { unique: true, name: 'mkt_sellers_id' }),
  c.createIndex({ user_id: 1 }, { unique: true, name: 'mkt_sellers_user' }),
  c.createIndex({ slug: 1 }, { unique: true, name: 'mkt_sellers_slug' }),
  c.createIndex({ status: 1, created_at: -1 }, { name: 'mkt_sellers_status' }),
  c.createIndex({ is_platform: 1 }, { name: 'mkt_sellers_platform' }),
]))

export const productsCol = lazy<ProductDoc>('mkt_products', (c) => Promise.all([
  c.createIndex({ id: 1 }, { unique: true, name: 'mkt_products_id' }),
  c.createIndex({ slug: 1 }, { unique: true, name: 'mkt_products_slug' }),
  c.createIndex({ seller_id: 1, updated_at: -1 }, { name: 'mkt_products_seller' }),
  c.createIndex({ status: 1, kind: 1, category: 1, created_at: -1 }, { name: 'mkt_products_browse' }),
  c.createIndex({ title: 'text', description_md: 'text', tags: 'text' }, { name: 'mkt_products_text' }),
]))

export const cartsCol = lazy<Cart>('mkt_carts', (c) => Promise.all([
  c.createIndex({ id: 1 }, { unique: true, name: 'mkt_carts_id' }),
  c.createIndex({ user_id: 1 }, { name: 'mkt_carts_user', sparse: true }),
  c.createIndex({ anon_id: 1 }, { name: 'mkt_carts_anon', sparse: true }),
  c.createIndex({ updated_at: 1 }, { name: 'mkt_carts_updated' }),
]))

export const ordersCol = lazy<Order>('mkt_orders', (c) => Promise.all([
  c.createIndex({ id: 1 }, { unique: true, name: 'mkt_orders_id' }),
  c.createIndex({ number: 1 }, { unique: true, name: 'mkt_orders_number' }),
  c.createIndex({ buyer_id: 1, created_at: -1 }, { name: 'mkt_orders_buyer' }),
  c.createIndex({ 'lines.seller_id': 1, created_at: -1 }, { name: 'mkt_orders_seller' }),
  c.createIndex({ status: 1, created_at: -1 }, { name: 'mkt_orders_status' }),
  c.createIndex({ 'payment.ref': 1 }, { name: 'mkt_orders_payment_ref', sparse: true }),
]))

export const ledgerCol = lazy<LedgerDoc>('mkt_ledger', (c) => Promise.all([
  c.createIndex({ id: 1 }, { unique: true, name: 'mkt_ledger_id' }),
  c.createIndex({ idem_key: 1 }, { unique: true, name: 'mkt_ledger_idem' }),
  c.createIndex({ seller_id: 1, currency: 1, available_at: 1 }, { name: 'mkt_ledger_balance' }),
  c.createIndex({ order_id: 1, line_id: 1 }, { name: 'mkt_ledger_order', sparse: true }),
  c.createIndex({ type: 1, created_at: -1 }, { name: 'mkt_ledger_type' }),
]))

export const payoutsCol = lazy<PayoutDoc>('mkt_payouts', (c) => Promise.all([
  c.createIndex({ id: 1 }, { unique: true, name: 'mkt_payouts_id' }),
  c.createIndex({ seller_id: 1, requested_at: -1 }, { name: 'mkt_payouts_seller' }),
  c.createIndex({ status: 1, requested_at: 1 }, { name: 'mkt_payouts_status' }),
  c.createIndex({ seller_id: 1, currency: 1 }, { unique: true, name: 'mkt_payouts_one_open', partialFilterExpression: { open: true } }),
]))

export const settingsCol = lazy<SettingsDoc>('mkt_settings', async () => undefined)

export const reviewsCol = lazy<ReviewDoc>('mkt_reviews', (c) => Promise.all([
  c.createIndex({ id: 1 }, { unique: true, name: 'mkt_reviews_id' }),
  c.createIndex({ product_id: 1, user_id: 1 }, { unique: true, name: 'mkt_reviews_once' }),
  c.createIndex({ seller_id: 1, created_at: -1 }, { name: 'mkt_reviews_seller' }),
]))

export const filesCol = lazy<FileDoc>('mkt_files', (c) => Promise.all([
  c.createIndex({ id: 1 }, { unique: true, name: 'mkt_files_id' }),
  c.createIndex({ seller_id: 1, product_id: 1 }, { name: 'mkt_files_seller' }),
]))

export const refundsCol = lazy<RefundRequestDoc>('mkt_refunds', (c) => Promise.all([
  c.createIndex({ id: 1 }, { unique: true, name: 'mkt_refunds_id' }),
  c.createIndex({ status: 1, created_at: -1 }, { name: 'mkt_refunds_status' }),
  c.createIndex({ seller_id: 1, created_at: -1 }, { name: 'mkt_refunds_seller' }),
  c.createIndex({ order_id: 1 }, { name: 'mkt_refunds_order' }),
]))

export const bookingsCol = lazy<BookingDoc>('mkt_bookings', (c) => Promise.all([
  c.createIndex({ id: 1 }, { unique: true, name: 'mkt_bookings_id' }),
  // ponytail: not unique (cancelled rows keep their slot); booking.ts guards double-booking.
  c.createIndex({ product_id: 1, start: 1 }, { name: 'mkt_bookings_slot' }),
  c.createIndex({ seller_id: 1, start: 1 }, { name: 'mkt_bookings_seller' }),
  c.createIndex({ buyer_id: 1, start: -1 }, { name: 'mkt_bookings_buyer' }),
]))

export const auditCol = lazy<AuditDoc>('mkt_audit', (c) => Promise.all([
  c.createIndex({ 'target.type': 1, 'target.id': 1, created_at: -1 }, { name: 'mkt_audit_target' }),
  c.createIndex({ created_at: -1 }, { name: 'mkt_audit_time' }),
]))

export function __resetMarketplaceIndexes() {
  ready.clear()
}
