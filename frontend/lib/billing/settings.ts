/**
 * Billing settings (admin-editable in Admin → Billing → Settings).
 * Stored as one document in `billing_settings` (_id 'default').
 */
import 'server-only'
import { z } from 'zod'
import { getMongoDb } from '@/lib/mongodb'
import { isValidGstin, isStateCode } from './gst'
import { DEFAULT_REFERRAL_REWARD, type ReferralRewardSettings } from './referral-reward'

export interface BillingSettings {
  supplier: { legal_name: string; gstin: string; state_code: string; address: string; sac_code: string; lut_reference: string }
  invoice_prefix: string
  gst_rate_bps: number
  /** Razorpay subscriptions for INR monthly / yearly plans (autopay). Off = prepaid one-time orders. */
  razorpay_autopay: boolean
  /** Per-seat yearly licence price, minor units. */
  licence_seat_price_minor: { INR: number; USD: number }
  licence_min_seats: number
  referral_reward: ReferralRewardSettings
}

export const DEFAULT_BILLING_SETTINGS: BillingSettings = {
  supplier: { legal_name: 'CodeSpectra', gstin: '', state_code: '36', address: '', sac_code: '999293', lut_reference: '' },
  invoice_prefix: 'CS',
  gst_rate_bps: 1800,
  razorpay_autopay: true,
  licence_seat_price_minor: { INR: 299900, USD: 4900 },
  licence_min_seats: 10,
  referral_reward: DEFAULT_REFERRAL_REWARD,
}

const minor = z.coerce.number().int().min(0).max(100_000_000)
export const billingSettingsPatch = z.object({
  supplier: z.object({
    legal_name: z.string().trim().min(1).max(160),
    gstin: z.string().trim().toUpperCase().max(15).refine((v) => v === '' || isValidGstin(v), 'Enter a valid GSTIN'),
    state_code: z.string().refine(isStateCode, 'Choose a state'),
    address: z.string().trim().max(400),
    sac_code: z.string().trim().regex(/^\d{4,8}$/, 'SAC code is 4–8 digits'),
    lut_reference: z.string().trim().max(60),
  }).partial().optional(),
  invoice_prefix: z.string().trim().regex(/^[A-Za-z0-9-]{1,4}$/, 'Prefix: up to 4 letters or digits').optional(),
  gst_rate_bps: z.coerce.number().int().min(0).max(2800).optional(),
  razorpay_autopay: z.boolean().optional(),
  licence_seat_price_minor: z.object({ INR: minor, USD: minor }).partial().optional(),
  licence_min_seats: z.coerce.number().int().min(1).max(10_000).optional(),
  referral_reward: z.object({
    kind: z.enum(['free_month', 'credit']),
    credit_minor: z.object({ INR: minor, USD: minor }).partial(),
    yearly_cap: z.coerce.number().int().min(0).max(100),
  }).partial().optional(),
}).strict()

export function mergeBillingSettings(raw: unknown): BillingSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<BillingSettings>
  const d = DEFAULT_BILLING_SETTINGS
  return {
    ...d,
    ...r,
    supplier: { ...d.supplier, ...(r.supplier || {}) },
    licence_seat_price_minor: { ...d.licence_seat_price_minor, ...(r.licence_seat_price_minor || {}) },
    referral_reward: {
      ...d.referral_reward,
      ...(r.referral_reward || {}),
      credit_minor: { ...d.referral_reward.credit_minor, ...(r.referral_reward?.credit_minor || {}) },
    },
  }
}

let cache: { at: number; value: BillingSettings } | null = null

export async function getBillingSettings(opts: { fresh?: boolean } = {}): Promise<BillingSettings> {
  if (!opts.fresh && cache && Date.now() - cache.at < 60_000) return cache.value
  const doc = await (await getMongoDb()).collection('billing_settings').findOne({ _id: 'default' as never })
  const value = mergeBillingSettings(doc?.value)
  cache = { at: Date.now(), value }
  return value
}

export async function saveBillingSettings(patch: z.infer<typeof billingSettingsPatch>, actorId: string): Promise<BillingSettings> {
  const current = await getBillingSettings({ fresh: true })
  const next = mergeBillingSettings({
    ...current,
    ...patch,
    supplier: { ...current.supplier, ...(patch.supplier || {}) },
    licence_seat_price_minor: { ...current.licence_seat_price_minor, ...(patch.licence_seat_price_minor || {}) },
    referral_reward: { ...current.referral_reward, ...(patch.referral_reward || {}), credit_minor: { ...current.referral_reward.credit_minor, ...(patch.referral_reward?.credit_minor || {}) } },
  })
  await (await getMongoDb()).collection('billing_settings').updateOne(
    { _id: 'default' as never },
    { $set: { value: next, updated_at: new Date().toISOString(), updated_by: actorId } },
    { upsert: true },
  )
  cache = null
  return next
}
