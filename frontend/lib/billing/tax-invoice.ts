/**
 * Tax invoices (server): the buyer's billing profile (name, GSTIN, place of
 * supply), sequential invoice numbers per financial year, and the GST
 * snapshot stored on a paid order. Collections:
 *   billing_profiles  { owner: 'user:<id>' | 'org:<tenantId>', name, gstin, state_code, country, address }
 *   billing_counters  { _id: 'invoice:<FY>', seq }
 */
import 'server-only'
import { z } from 'zod'
import { getMongoDb } from '@/lib/mongodb'
import { billingOrders, type BillingOrderDoc } from '@/lib/db/billing'
import { financialYear, formatInvoiceNumber, gstBreakdown, isStateCode, isValidGstin, type TaxBreakdown } from './gst'
import { getBillingSettings } from './settings'

export interface BillingProfile {
  owner: string
  name: string
  gstin: string | null
  state_code: string | null
  country: string
  address: string
  updated_at?: string
}

export const billingProfileSchema = z.object({
  name: z.string().trim().max(160).default(''),
  gstin: z.string().trim().toUpperCase().max(15).optional().nullable().refine((v) => !v || isValidGstin(v), { message: 'gstin_invalid' }),
  state_code: z.string().optional().nullable().refine((v) => !v || isStateCode(v), { message: 'state_invalid' }),
  country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).default('IN'),
  address: z.string().trim().max(400).default(''),
}).strict()

export async function profilesCol() {
  return (await getMongoDb()).collection<BillingProfile>('billing_profiles')
}

export async function getBillingProfile(owner: string): Promise<BillingProfile | null> {
  return (await profilesCol()).findOne({ owner }, { projection: { _id: 0 } })
}

export async function saveBillingProfile(owner: string, input: z.infer<typeof billingProfileSchema>): Promise<BillingProfile> {
  const gstin = input.gstin ? input.gstin : null
  const doc: BillingProfile = {
    owner,
    name: input.name,
    gstin,
    // A GSTIN fixes the place of supply.
    state_code: gstin ? gstin.slice(0, 2) : input.state_code || null,
    country: gstin ? 'IN' : input.country,
    address: input.address,
    updated_at: new Date().toISOString(),
  }
  await (await profilesCol()).updateOne({ owner }, { $set: doc }, { upsert: true })
  return doc
}

export interface InvoiceTaxSnapshot {
  invoice_number: string
  invoice_fy: string
  invoice_date: string
  buyer: { name: string; gstin: string | null; state_code: string | null; country: string; address: string }
  supplier: { legal_name: string; gstin: string; state_code: string; address: string; sac_code: string; lut_reference: string }
  tax: TaxBreakdown
}

let indexReady: Promise<void> | null = null
function ensureIndexes(): Promise<void> {
  if (!indexReady) {
    indexReady = (async () => {
      await (await profilesCol()).createIndex({ owner: 1 }, { unique: true, name: 'billing_profiles_owner_unique' })
      await (await billingOrders()).createIndex(
        { invoice_number: 1 },
        { unique: true, name: 'billing_orders_invoice_number_unique', partialFilterExpression: { invoice_number: { $gt: '' } } },
      )
    })().catch((e) => {
      indexReady = null
      console.error('[tax-invoice] index setup failed:', (e as Error)?.message)
    })
  }
  return indexReady
}

/** Billing profile owner for an order: the organisation for licence orders, else the buyer. */
export function profileOwnerFor(order: Pick<BillingOrderDoc, 'user_id' | 'plan_kind'> & { org_id?: string | null }): string {
  return order.plan_kind === 'licence' && order.org_id ? `org:${order.org_id}` : `user:${order.user_id}`
}

/**
 * Give a paid order its invoice number + tax snapshot, once. Numbers come from
 * one atomic counter per financial year (of the order's payment date), so they
 * are sequential. Zero-amount orders get no tax invoice.
 */
export async function assignInvoice(order: BillingOrderDoc & { org_id?: string | null }): Promise<string | null> {
  if (!order.amount_paise || order.amount_paise <= 0) return null
  if ((order as { invoice_number?: string }).invoice_number) return (order as { invoice_number?: string }).invoice_number!
  await ensureIndexes()
  const orders = await billingOrders()
  const fresh = (await orders.findOne({ id: order.id }, { projection: { _id: 0, invoice_number: 1, status: 1 } })) as { invoice_number?: string; status?: string } | null
  if (!fresh || (fresh.status !== 'paid' && fresh.status !== 'refunded')) return null
  if (fresh.invoice_number) return fresh.invoice_number

  const settings = await getBillingSettings()
  const profile = await getBillingProfile(profileOwnerFor(order))
  const date = new Date().toISOString()
  const fy = financialYear(date)
  const db = await getMongoDb()
  const counter = await db.collection<{ _id: string; seq: number }>('billing_counters').findOneAndUpdate(
    { _id: `invoice:${fy}` },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' },
  )
  const number = formatInvoiceNumber(settings.invoice_prefix, fy, counter?.seq ?? 1)
  const buyer = {
    name: profile?.name || '',
    gstin: profile?.gstin ?? null,
    state_code: profile?.state_code ?? null,
    country: profile?.country || (order.currency === 'INR' ? 'IN' : ''),
    address: profile?.address || '',
  }
  const snapshot: InvoiceTaxSnapshot = {
    invoice_number: number,
    invoice_fy: fy,
    invoice_date: date,
    buyer,
    supplier: settings.supplier,
    tax: gstBreakdown({
      amount: order.amount_paise,
      currency: order.currency,
      supplierState: settings.supplier.state_code,
      buyerGstin: buyer.gstin,
      buyerState: buyer.state_code,
      buyerCountry: buyer.country || null,
      rateBps: settings.gst_rate_bps,
      inclusive: settings.prices_include_gst,
    }),
  }
  const r = await orders.updateOne(
    { id: order.id, invoice_number: { $exists: false } } as never,
    { $set: { invoice_number: number, invoice_tax: snapshot, updated_at: date } as never },
  )
  if (r.modifiedCount === 0) {
    // Someone else numbered it between our read and write; our counter value is
    // left unused (logged so the gap can be explained in the GST return).
    console.warn('[tax-invoice] invoice number left unused after a race', { number })
    const again = (await orders.findOne({ id: order.id }, { projection: { invoice_number: 1 } })) as { invoice_number?: string } | null
    return again?.invoice_number ?? null
  }
  return number
}
