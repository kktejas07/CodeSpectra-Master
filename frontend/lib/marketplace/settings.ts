/**
 * Marketplace settings (single doc in mkt_settings) + the hold-window rule.
 * Pure parts (validateSettings, availableAtFor) are unit tested.
 */
import type { ItemKind, MarketplaceSettings } from './contract'

/** User-facing error with an HTTP status (seller/admin part). */
export class MktError extends Error {
  /** `code` / `params`: stable error code for the UI's translation (lib/api-errors); inferred from the message when omitted. */
  constructor(public status: number, message: string, public code?: string, public params?: Record<string, string | number>) {
    super(message)
  }
}

export const MAX_BPS = 10_000

export const DEFAULT_SETTINGS: MarketplaceSettings = {
  default_commission_bps: 1500,
  category_commission_bps: {},
  hold_days: { digital: 7, physical: 14, service: 3 },
  min_payout: { INR: 100_000, USD: 2_500 }, // ₹1,000 / $25
  tax: { in_gst_bps: 1800, us_sales_tax_bps: 0, prices_include_tax: true },
  require_product_review: true,
}

/** Physical sales before delivery: hold = transit allowance + return window (re-scheduled on delivery). */
export const PHYSICAL_TRANSIT_DAYS = 21
/** Services with no known session time yet: held this long (re-timed when the seller marks it done). */
export const SERVICE_UNSCHEDULED_DAYS = 30

export const CATEGORIES = ['books', 'courses', 'ebooks', 'templates', 'merch', 'mentoring', 'mock-interviews', 'other'] as const

const DAY = 86_400_000

/**
 * When a sale's funds settle (become available for payout).
 *  digital  → sale + hold.digital
 *  physical → delivered ? delivered + hold.physical : sale + transit + hold.physical
 *  service  → (completed ?? session end ?? sale + unscheduled allowance) + hold.service
 */
export function availableAtFor(
  kind: ItemKind,
  settings: Pick<MarketplaceSettings, 'hold_days'>,
  at: { sale: Date | string; delivered?: Date | string | null; completed?: Date | string | null; session_end?: Date | string | null },
): string {
  const t = (v: Date | string) => new Date(v).getTime()
  const days = Math.max(0, settings.hold_days[kind] ?? 0) * DAY
  let base = t(at.sale)
  if (kind === 'physical') base = at.delivered ? t(at.delivered) : base + PHYSICAL_TRANSIT_DAYS * DAY
  if (kind === 'service') base = at.completed ? t(at.completed) : at.session_end ? Math.max(base, t(at.session_end)) : base + SERVICE_UNSCHEDULED_DAYS * DAY
  return new Date(base + days).toISOString()
}

const int = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) ? v : typeof v === 'string' && /^-?\d+$/.test(v.trim()) ? Number(v) : NaN)
const bpsOk = (n: number) => Number.isInteger(n) && n >= 0 && n <= MAX_BPS

/** Pure: validate an admin settings payload (full object). */
export function validateSettings(input: unknown): { ok: true; value: MarketplaceSettings } | { ok: false; errors: string[] } {
  const b = (input && typeof input === 'object' ? input : {}) as Record<string, any>
  const errors: string[] = []
  const def = int(b.default_commission_bps)
  if (!bpsOk(def)) errors.push('Default commission must be between 0% and 100%.')
  const cats: Record<string, number> = {}
  for (const [k, v] of Object.entries((b.category_commission_bps && typeof b.category_commission_bps === 'object') ? b.category_commission_bps : {})) {
    const key = String(k).trim().toLowerCase()
    if (!/^[a-z0-9-]{1,40}$/.test(key)) { errors.push(`Category "${key}" isn't a valid category key.`); continue }
    const n = int(v)
    if (!bpsOk(n)) errors.push(`Commission for ${key} must be between 0% and 100%.`)
    else cats[key] = n
  }
  const hold = { digital: int(b.hold_days?.digital), physical: int(b.hold_days?.physical), service: int(b.hold_days?.service) }
  for (const [k, n] of Object.entries(hold)) if (!(n >= 0 && n <= 120)) errors.push(`Hold days for ${k} must be 0–120.`)
  const min = { INR: int(b.min_payout?.INR), USD: int(b.min_payout?.USD) }
  for (const [k, n] of Object.entries(min)) if (!(n >= 0 && n <= 100_000_000)) errors.push(`Minimum payout (${k}) must be a whole amount in minor units.`)
  const tax = { in_gst_bps: int(b.tax?.in_gst_bps), us_sales_tax_bps: int(b.tax?.us_sales_tax_bps), prices_include_tax: b.tax?.prices_include_tax !== false }
  if (!bpsOk(tax.in_gst_bps) || tax.in_gst_bps > 5000) errors.push('GST rate must be between 0% and 50%.')
  if (!bpsOk(tax.us_sales_tax_bps) || tax.us_sales_tax_bps > 5000) errors.push('US sales tax must be between 0% and 50%.')
  if (errors.length) return { ok: false, errors }
  return {
    ok: true,
    value: {
      default_commission_bps: def,
      category_commission_bps: cats,
      hold_days: hold,
      min_payout: min,
      tax,
      require_product_review: b.require_product_review !== false,
    },
  }
}

let cache: { at: number; value: MarketplaceSettings } | null = null

export async function getSettings(): Promise<MarketplaceSettings> {
  if (cache && Date.now() - cache.at < 30_000) return cache.value
  const { settingsCol } = await import('./db')
  const doc = await (await settingsCol()).findOne({ _id: 'global' }, { projection: { _id: 0, updated_at: 0, updated_by: 0 } })
  const value: MarketplaceSettings = doc
    ? { ...DEFAULT_SETTINGS, ...doc, hold_days: { ...DEFAULT_SETTINGS.hold_days, ...doc.hold_days }, min_payout: { ...DEFAULT_SETTINGS.min_payout, ...doc.min_payout }, tax: { ...DEFAULT_SETTINGS.tax, ...doc.tax } }
    : DEFAULT_SETTINGS
  cache = { at: Date.now(), value }
  return value
}

export async function saveSettings(value: MarketplaceSettings, actorId: string): Promise<MarketplaceSettings> {
  const { settingsCol, auditCol, newId, nowIso } = await import('./db')
  await (await settingsCol()).updateOne({ _id: 'global' }, { $set: { ...value, updated_at: nowIso(), updated_by: actorId } }, { upsert: true })
  await (await auditCol()).insertOne({ id: newId(), actor_id: actorId, action: 'settings.updated', target: { type: 'settings', id: 'global' }, created_at: nowIso() })
  cache = null
  return value
}

export function __resetSettingsCache() {
  cache = null
}
