/**
 * CodeSpectra marketplace — shared contract (buyer part + seller/admin part).
 *
 * Owner decisions (2026-10-19):
 *  - Multi-seller marketplace: CodeSpectra sells its own items AND approved third-party
 *    sellers list theirs; the platform keeps a commission on every sale.
 *  - Item kinds: digital (e-books, PDFs, courses — instant download), physical (books,
 *    merch — shipping, stock, tracking), services (mentoring, mock interviews — booked slots).
 *  - Payments reuse the existing gateways (PhonePe for INR, Stripe for USD/intl) — see
 *    lib/billing-plans.ts, app/api/payments/** and the Stripe/PhonePe webhook handlers.
 *
 * Rules: prices are integers in minor units (paise / cents). Server is the source of truth
 * for price, stock, commission and totals — never trust client amounts. Every money
 * movement is recorded in the ledger (append-only). Seller payouts only from settled funds
 * after the return/refund window. Buyers' addresses/emails visible to a seller only for
 * that seller's own orders that need fulfilment.
 */

export type ItemKind = 'digital' | 'physical' | 'service'
export type Currency = 'INR' | 'USD'

export interface Seller {
  id: string
  user_id: string // owner account
  /** CodeSpectra's own store is a seller with is_platform = true and commission 0 */
  is_platform: boolean
  display_name: string
  slug: string
  bio?: string
  logo_url?: string | null
  country: 'IN' | 'US' | string
  status: 'pending' | 'approved' | 'suspended' | 'rejected'
  /** null = platform default (marketplace_settings.default_commission_bps) */
  commission_bps: number | null
  /** Opted in to platform-wide coupons on their items (they pay the discount). Default false (CORE-021). */
  accepts_platform_coupons?: boolean
  kyc: { status: 'not_started' | 'submitted' | 'verified' | 'rejected'; pan_last4?: string; gstin?: string; tax_id_last4?: string; submitted_at?: string }
  payout: { method: 'bank' | 'upi' | 'stripe_connect' | null; account_ref?: string | null; verified: boolean }
  created_at: string
  updated_at: string
}

export interface ProductVariant { id: string; name: string; price: number; stock?: number | null; sku?: string }

export interface Product {
  id: string
  seller_id: string
  kind: ItemKind
  title: string
  slug: string
  description_md: string
  images: string[]
  category: string // e.g. 'books', 'courses', 'merch', 'mentoring', 'mock-interviews', 'templates'
  tags: string[]
  currency: Currency
  price: number // minor units
  compare_at_price?: number | null
  variants?: ProductVariant[] // physical (size/format) — price/stock per variant
  stock?: number | null // physical without variants; null = unlimited
  digital?: { file_ids: string[]; download_limit: number; license_note?: string } | null
  service?: { duration_min: number; mode: 'virtual' | 'in_person'; provider?: 'livekit' | 'zoom' | 'google_meet' | 'teams' | 'manual'; slots_source: 'weekly_rules'; weekly: { dow: number; start: string; end: string }[]; timezone: string; buffer_min?: number } | null
  shipping?: { weight_g?: number; ships_from: string; regions: string[]; fee: number; free_over?: number | null; dispatch_days: number } | null
  status: 'draft' | 'pending_review' | 'published' | 'rejected' | 'archived'
  rating?: { avg: number; count: number }
  created_at: string
  updated_at: string
}

export interface CartLine { product_id: string; variant_id?: string | null; qty: number; service_slot?: string | null /* ISO start */ }
export interface Cart { id: string; user_id: string | null; anon_id?: string | null; currency: Currency; lines: CartLine[]; updated_at: string }

export type OrderStatus = 'pending_payment' | 'paid' | 'partially_fulfilled' | 'fulfilled' | 'cancelled' | 'refunded' | 'partially_refunded'
export type FulfilmentStatus = 'unfulfilled' | 'processing' | 'shipped' | 'delivered' | 'delivered_digital' | 'booked' | 'completed' | 'cancelled' | 'returned'

export interface OrderLine {
  id: string
  product_id: string
  seller_id: string
  kind: ItemKind
  title: string // snapshot
  variant_id?: string | null
  qty: number
  unit_price: number
  line_total: number
  commission_bps: number // snapshot at purchase
  commission_amount: number
  seller_earnings: number
  /** Platform-funded coupon share (ex-tax): commission_amount + seller_earnings = line_total + platform_funded (CORE-021). */
  platform_funded?: number
  fulfilment: { status: FulfilmentStatus; carrier?: string; tracking_no?: string; tracking_url?: string; shipped_at?: string; delivered_at?: string; booking?: { start: string; end: string; join_url?: string; meeting_id?: string } | null; downloads_used?: number }
}

export interface Order {
  id: string
  number: string // human friendly, e.g. CS-2026-000123
  buyer_id: string
  buyer_email: string
  currency: Currency
  lines: OrderLine[]
  subtotal: number
  shipping_total: number
  tax_total: number // GST (IN) / sales tax (US) — computed server side, simple configurable rules
  discount_total: number
  grand_total: number
  shipping_address?: { name: string; line1: string; line2?: string; city: string; state: string; postal_code: string; country: string; phone: string } | null
  payment: { gateway: 'phonepe' | 'stripe'; ref?: string; status: 'pending' | 'succeeded' | 'failed' | 'refunded' | 'partially_refunded'; paid_at?: string }
  status: OrderStatus
  created_at: string
  updated_at: string
}

/** Append-only money ledger. Seller balance = sum(credit) - sum(debit) per seller & currency. */
export interface LedgerEntry {
  id: string
  order_id?: string | null
  line_id?: string | null
  seller_id: string | null // null = platform
  currency: Currency
  type: 'sale' | 'commission' | 'refund' | 'payout' | 'adjustment' | 'shipping'
  amount: number // signed minor units, credit > 0
  available_at: string // funds held until the return/refund window ends
  created_at: string
  note?: string
}

export interface Payout {
  id: string
  seller_id: string
  currency: Currency
  amount: number
  method: 'bank' | 'upi' | 'stripe_connect'
  /** paying = a Stripe Connect transfer is in flight (see lib/marketplace/payouts.ts) */
  status: 'requested' | 'approved' | 'paying' | 'paid' | 'failed' | 'cancelled'
  ref?: string | null
  requested_at: string
  paid_at?: string | null
}

export interface MarketplaceSettings {
  default_commission_bps: number // e.g. 1500 = 15%
  category_commission_bps?: Record<string, number>
  hold_days: { digital: number; physical: number; service: number } // refund window before funds settle
  min_payout: { INR: number; USD: number }
  tax: { in_gst_bps: number; us_sales_tax_bps: number; prices_include_tax: boolean }
  require_product_review: boolean
}

// Ownership:
//  BUYER part  → lib/marketplace/{catalog,cart,checkout,orders,digital,booking}.ts,
//                app/api/marketplace/{products,cart,checkout,orders,downloads,webhooks}/**,
//                app/(public) storefront pages app/marketplace/**, app/dashboard/orders/**
//  SELLER/ADMIN part → lib/marketplace/{sellers,listings,fulfilment,ledger,payouts,settings,moderation}.ts,
//                app/api/marketplace/{seller,admin}/**, app/dashboard/seller/**, app/dashboard/admin/marketplace/**
//  Shared → lib/marketplace/db.ts (collections + lazy indexes) — created by the SELLER part;
//           the buyer part imports it (stub only if absent, marked TEMP STUB).
//  Money functions the buyer part calls (owned by SELLER part, in ledger.ts):
//    recordSale(order: Order): Promise<void>        // on payment success: sale + commission entries per line
//    recordRefund(order: Order, lineIds: string[], amount: number): Promise<void>
//    commissionFor(product: Product, seller: Seller, settings: MarketplaceSettings): number  // bps
