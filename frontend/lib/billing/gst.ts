/**
 * India GST + invoice numbering rules (pure).
 *
 *  - Invoice numbers run sequentially per Indian financial year (1 Apr – 31 Mar):
 *    `<PREFIX>/<FY>/<seq 6 digits>`, e.g. CS/2627/000042 for FY 2026-27 (≤16 chars for GSTR-1).
 *  - Tax: 18 % on INR invoices. Place of supply = the buyer's state (from their
 *    GSTIN when given, else the state they chose); same state as the supplier →
 *    CGST 9 % + SGST 9 %, otherwise IGST 18 %. USD / overseas buyers: export of
 *    services, zero-rated (no GST charged; LUT reference shown when configured).
 *  - Prices are GST-inclusive (what the pricing page shows is what is paid).
 */

/** GST state codes (first two digits of a GSTIN). */
export const GST_STATES: Record<string, string> = {
  '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand',
  '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim',
  '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya',
  '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh',
  '24': 'Gujarat', '26': 'Dadra and Nagar Haveli and Daman and Diu', '27': 'Maharashtra', '29': 'Karnataka',
  '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands', '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh', '97': 'Other Territory',
}

export function isStateCode(v: unknown): v is string {
  return typeof v === 'string' && v in GST_STATES
}

/** Financial year label for a date in India (UTC+5:30), e.g. 2026-10-23 → "2026-27". */
export function financialYear(date: Date | string): string {
  const d = new Date((typeof date === 'string' ? Date.parse(date) : date.getTime()) + 330 * 60_000)
  const y = d.getUTCFullYear()
  const start = d.getUTCMonth() >= 3 ? y : y - 1
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`
}

/** GST allows at most 16 characters: `<prefix ≤4>/<YYyy>/<6 digits>`, e.g. CS/2627/000042 for FY 2026-27. */
export function formatInvoiceNumber(prefix: string, fy: string, seq: number): string {
  const p = (prefix || 'CS').replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 4) || 'CS'
  const short = /^\d{4}-\d{2}$/.test(fy) ? `${fy.slice(2, 4)}${fy.slice(5, 7)}` : fy.replace(/\D/g, '').slice(-4)
  return `${p}/${short}/${String(Math.max(1, Math.floor(seq))).padStart(6, '0')}`
}

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/
const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/** GSTIN format + state code + check digit (mod-36 Luhn variant). */
export function isValidGstin(raw: unknown): boolean {
  if (typeof raw !== 'string') return false
  const g = raw.trim().toUpperCase()
  if (!GSTIN_RE.test(g) || !isStateCode(g.slice(0, 2))) return false
  let sum = 0
  for (let i = 0; i < 14; i++) {
    const v = CHARS.indexOf(g[i]) * (i % 2 === 0 ? 1 : 2)
    sum += Math.floor(v / 36) + (v % 36)
  }
  return CHARS[(36 - (sum % 36)) % 36] === g[14]
}

export function normalizeGstin(raw: unknown): string | null {
  return typeof raw === 'string' && isValidGstin(raw) ? raw.trim().toUpperCase() : null
}

export interface TaxInput {
  /** Charged total in minor units. */
  amount: number
  currency: string
  /** Supplier's GST state code. */
  supplierState: string
  /** Buyer's GSTIN (B2B), if any. */
  buyerGstin?: string | null
  /** Buyer's state code when they have no GSTIN. */
  buyerState?: string | null
  /** Buyer outside India (USD invoices, or an INR buyer abroad). */
  buyerCountry?: string | null
  rateBps?: number
  inclusive?: boolean
}

export interface TaxBreakdown {
  kind: 'intra_state' | 'inter_state' | 'export' | 'none'
  placeOfSupply: string | null
  taxable: number
  cgst: number
  sgst: number
  igst: number
  total: number
  rateBps: number
}

/** Split a charged amount into taxable value + GST heads (integer minor units, sums exactly). */
export function gstBreakdown(t: TaxInput): TaxBreakdown {
  const rate = t.rateBps ?? 1800
  const amount = Math.max(0, Math.round(t.amount))
  const overseas = t.currency.toUpperCase() !== 'INR' || (!!t.buyerCountry && t.buyerCountry.toUpperCase() !== 'IN')
  if (overseas) return { kind: 'export', placeOfSupply: null, taxable: amount, cgst: 0, sgst: 0, igst: 0, total: amount, rateBps: 0 }
  const gstin = normalizeGstin(t.buyerGstin)
  const pos = gstin ? gstin.slice(0, 2) : isStateCode(t.buyerState) ? t.buyerState : t.supplierState
  const inclusive = t.inclusive !== false
  const taxable = inclusive ? Math.round((amount * 10_000) / (10_000 + rate)) : amount
  const tax = inclusive ? amount - taxable : Math.round((amount * rate) / 10_000)
  const total = taxable + tax
  if (pos === t.supplierState) {
    const cgst = Math.floor(tax / 2)
    return { kind: 'intra_state', placeOfSupply: pos, taxable, cgst, sgst: tax - cgst, igst: 0, total, rateBps: rate }
  }
  return { kind: 'inter_state', placeOfSupply: pos, taxable, cgst: 0, sgst: 0, igst: tax, total, rateBps: rate }
}
