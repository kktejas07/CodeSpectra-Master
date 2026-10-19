/**
 * Sellers: apply-to-sell, KYC + payout details (encrypted at rest, masked on
 * the way out), admin decisions with an audit trail, and the platform's own
 * seller record (CodeSpectra items, commission 0, managed by superadmins).
 *
 * Pure: validateApplication, validatePayout, nextSellerStatus, mask helpers,
 * sealSecret / openSecret (key passed in) — unit tested.
 */
import { decryptWithKey, encryptWithKey } from '@/lib/ats/interviews/tokens'
import type { Seller } from './contract'
import type { SellerDoc } from './db'
import { MktError } from './settings'

export const PLATFORM_SELLER_ID = 'platform'
export const PLATFORM_USER_ID = 'platform:codespectra'

export type PayoutMethod = 'bank' | 'upi' | 'stripe_connect'

export interface PayoutSecret { account_name?: string; account_no?: string; ifsc?: string; upi?: string; routing_no?: string }
export interface KycSecret { pan?: string; tax_id?: string; gstin?: string }

// ─── Masking / crypto (pure) ─────────────────────────────────────────────────

export const last4 = (v: string) => String(v || '').replace(/[^A-Za-z0-9]/g, '').slice(-4)
export const maskTail = (v: string | null | undefined, keep = 4) => {
  const s = String(v || '').replace(/\s+/g, '')
  if (!s) return ''
  return s.length <= keep ? '•'.repeat(s.length) : `${'•'.repeat(Math.min(8, s.length - keep))}${s.slice(-keep)}`
}
/**
 * GSTIN embeds the full PAN (chars 3–12), so list views / API responses show it
 * masked: the 2-digit state code + the last 4. Idempotent on masked input.
 * The ONE exception is the buyer's tax invoice, which by law (CGST Rule 46)
 * must carry the supplier's full GSTIN — see sellerInvoiceGstin().
 */
export const maskGstin = (v: string | null | undefined): string => {
  const s = String(v || '').replace(/\s+/g, '').toUpperCase()
  if (!s) return ''
  if (s.includes('•')) return s
  if (s.length < 7) return '•'.repeat(s.length)
  return `${s.slice(0, 2)}${'•'.repeat(s.length - 6)}${s.slice(-4)}`
}
export const maskUpi = (v: string) => {
  const [user, host] = String(v || '').split('@')
  if (!host) return maskTail(v)
  return `${user.slice(0, 2)}${'•'.repeat(Math.max(2, user.length - 2))}@${host}`
}

export function sealSecret(key: Uint8Array, value: unknown): string {
  return encryptWithKey(key, JSON.stringify(value))
}
export function openSecret<T>(key: Uint8Array, box: string | null | undefined): T | null {
  if (!box) return null
  const s = decryptWithKey(key, box)
  if (s === null) return null
  try { return JSON.parse(s) as T } catch { return null }
}

async function kycKey(): Promise<Uint8Array> {
  const env = (process.env.MARKETPLACE_ENCRYPTION_KEY || '').trim()
  if (env.length >= 32) return new Uint8Array((await import('node:crypto')).createHash('sha256').update(`mkt-kyc:${env}`).digest())
  const { deriveServerKey } = await import('@/lib/session')
  return deriveServerKey('marketplace-kyc')
}
export async function encryptSecret(value: unknown) { return sealSecret(await kycKey(), value) }
export async function decryptSecret<T>(box: string | null | undefined) { return openSecret<T>(await kycKey(), box) }

// ─── Validation (pure) ───────────────────────────────────────────────────────

const PAN = /^[A-Z]{5}[0-9]{4}[A-Z]$/
const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/
const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/
const UPI = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$/
const URLISH = /^(https:\/\/|\/)[^\s<>"']{1,500}$/

const str = (v: unknown, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

export function validatePayout(country: string, raw: unknown, opts: { stripeConfigured: boolean }):
  { ok: true; method: PayoutMethod; secret: PayoutSecret; account_ref: string } | { ok: false; errors: string[] } {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const method = str(p.method, 20) as PayoutMethod
  const errors: string[] = []
  if (method === 'stripe_connect') {
    if (country !== 'US') errors.push('Stripe payouts are available for US sellers.')
    if (!opts.stripeConfigured) errors.push('Stripe payouts are not set up on this platform yet — add bank details instead.')
    return errors.length ? { ok: false, errors } : { ok: true, method, secret: {}, account_ref: 'Stripe (connect when approved)' }
  }
  if (method === 'upi') {
    if (country !== 'IN') errors.push('UPI payouts are available for sellers in India.')
    const upi = str(p.upi, 300)
    if (!UPI.test(upi)) errors.push('Enter a valid UPI ID, like name@bank.')
    return errors.length ? { ok: false, errors } : { ok: true, method, secret: { upi }, account_ref: `UPI ${maskUpi(upi)}` }
  }
  if (method === 'bank') {
    const account_name = str(p.account_name, 120)
    const account_no = str(p.account_no, 40).replace(/\s+/g, '')
    if (account_name.length < 2) errors.push('Enter the account holder name.')
    if (country === 'IN') {
      const ifsc = str(p.ifsc, 20).toUpperCase()
      if (!/^[0-9]{9,18}$/.test(account_no)) errors.push('Account number must be 9–18 digits.')
      if (!IFSC.test(ifsc)) errors.push('Enter a valid IFSC code (e.g. HDFC0001234).')
      return errors.length ? { ok: false, errors } : { ok: true, method, secret: { account_name, account_no, ifsc }, account_ref: `${ifsc} ${maskTail(account_no)}` }
    }
    const routing_no = str(p.routing_no, 20).replace(/\s+/g, '')
    if (!/^[0-9]{4,17}$/.test(account_no)) errors.push('Account number must be 4–17 digits.')
    if (!/^[0-9]{9}$/.test(routing_no)) errors.push('Routing number must be 9 digits.')
    return errors.length ? { ok: false, errors } : { ok: true, method, secret: { account_name, account_no, routing_no }, account_ref: `Routing ${maskTail(routing_no)} · ${maskTail(account_no)}` }
  }
  return { ok: false, errors: ['Choose a payout method.'] }
}

export interface ApplicationValue {
  display_name: string
  bio: string
  logo_url: string | null
  country: 'IN' | 'US'
  contact_email: string
  phone: string | null
  whatsapp_opt_in: boolean
  kyc_public: Seller['kyc']
  kyc_secret: KycSecret
  w9_acknowledged: boolean
  payout_method: PayoutMethod
  payout_secret: PayoutSecret
  account_ref: string
}

export function validateApplication(raw: unknown, opts: { stripeConfigured: boolean; fallbackEmail?: string }):
  { ok: true; value: ApplicationValue } | { ok: false; errors: string[] } {
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>
  const errors: string[] = []
  const display_name = str(b.display_name, 80)
  if (display_name.length < 2) errors.push('Store name must be at least 2 characters.')
  const bio = str(b.bio, 2000)
  const logo_url = str(b.logo_url, 500) || null
  if (logo_url && !URLISH.test(logo_url)) errors.push('Logo must be an https:// link.')
  const country = str(b.country, 2).toUpperCase()
  if (country !== 'IN' && country !== 'US') errors.push('Selling is open to sellers in India and the US for now.')
  const contact_email = str(b.contact_email, 200) || opts.fallbackEmail || ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact_email)) errors.push('Enter a contact email.')
  const phone = str(b.phone, 20).replace(/[^\d+]/g, '') || null
  if (phone && !/^\+?\d{8,15}$/.test(phone)) errors.push('Enter a valid phone number with country code.')
  const whatsapp_opt_in = b.whatsapp_opt_in === true && !!phone
  const k = (b.kyc && typeof b.kyc === 'object' ? b.kyc : {}) as Record<string, unknown>
  const kyc_public: Seller['kyc'] = { status: 'submitted', submitted_at: new Date().toISOString() }
  const kyc_secret: KycSecret = {}
  let w9_acknowledged = false
  if (country === 'IN') {
    const pan = str(k.pan, 20).toUpperCase().replace(/\s+/g, '')
    if (!PAN.test(pan)) errors.push('Enter a valid PAN (e.g. ABCDE1234F).')
    else { kyc_secret.pan = pan; kyc_public.pan_last4 = last4(pan) }
    const gstin = str(k.gstin, 20).toUpperCase().replace(/\s+/g, '')
    if (gstin) {
      if (!GSTIN.test(gstin)) errors.push('GSTIN looks wrong — check it or leave it blank.')
      else if (PAN.test(pan) && gstin.slice(2, 12) !== pan) errors.push("GSTIN doesn't match the PAN.")
      else { kyc_secret.gstin = gstin; kyc_public.gstin = maskGstin(gstin) }
    }
  } else if (country === 'US') {
    const tax = str(k.tax_id, 20).replace(/[^0-9]/g, '')
    if (!/^[0-9]{9}$/.test(tax)) errors.push('Enter your 9-digit SSN or EIN.')
    else { kyc_secret.tax_id = tax; kyc_public.tax_id_last4 = last4(tax) }
    w9_acknowledged = k.w9_acknowledged === true
    if (!w9_acknowledged) errors.push('Confirm the W-9 certification.')
  }
  if (b.accept_terms !== true) errors.push('Accept the seller terms to continue.')
  const pay = validatePayout(country, b.payout, opts)
  if (!pay.ok) errors.push(...pay.errors)
  if (errors.length || !pay.ok) return { ok: false, errors }
  return {
    ok: true,
    value: {
      display_name, bio, logo_url, country: country as 'IN' | 'US', contact_email, phone, whatsapp_opt_in,
      kyc_public, kyc_secret, w9_acknowledged, payout_method: pay.method, payout_secret: pay.secret, account_ref: pay.account_ref,
    },
  }
}

export type SellerAction = 'approve' | 'reject' | 'suspend' | 'reinstate'

export function nextSellerStatus(current: Seller['status'], action: SellerAction): Seller['status'] | null {
  switch (action) {
    case 'approve': return current === 'pending' || current === 'rejected' ? 'approved' : null
    case 'reject': return current === 'pending' ? 'rejected' : null
    case 'suspend': return current === 'approved' ? 'suspended' : null
    case 'reinstate': return current === 'suspended' ? 'approved' : null
  }
  return null
}

export function slugify(s: string): string {
  return String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'store'
}

/** Seller as the client may see it (secrets stripped). */
export function publicSeller(d: SellerDoc): Seller & { contact_email?: string; phone?: string | null; whatsapp_opt_in?: boolean; w9_acknowledged?: boolean; terms_accepted_at?: string | null; stripe_connected?: boolean; review_note?: string | null } {
  const { kyc_secret: _k, payout_secret: _p, stripe_account_id, reviewed_by: _r, _id: _i, ...rest } = d as SellerDoc & { _id?: unknown }
  const kyc = rest.kyc?.gstin ? { ...rest.kyc, gstin: maskGstin(rest.kyc.gstin) } : rest.kyc
  return { ...rest, kyc, stripe_connected: !!stripe_account_id }
}

// ─── DB ──────────────────────────────────────────────────────────────────────

async function stripeConfigured(): Promise<boolean> {
  const { getStripeSecretKey } = await import('@/lib/stripe-client')
  return !!(await getStripeSecretKey().catch(() => null))
}
export { stripeConfigured }

async function uniqueSlug(base: string, selfId?: string): Promise<string> {
  const { sellersCol } = await import('./db')
  const col = await sellersCol()
  let slug = slugify(base)
  for (let i = 2; i < 50; i++) {
    const hit = await col.findOne({ slug }, { projection: { id: 1 } })
    if (!hit || hit.id === selfId) return slug
    slug = `${slugify(base).slice(0, 54)}-${i}`
  }
  return `${slugify(base).slice(0, 50)}-${Date.now().toString(36)}`
}

export async function getSellerById(id: string): Promise<SellerDoc | null> {
  const { sellersCol } = await import('./db')
  return (await sellersCol()).findOne({ id }, { projection: { _id: 0 } })
}

export async function getSellerByUser(userId: string): Promise<SellerDoc | null> {
  const { sellersCol } = await import('./db')
  return (await sellersCol()).findOne({ user_id: userId }, { projection: { _id: 0 } })
}

/** CodeSpectra's own store (idempotent upsert). */
export async function ensurePlatformSeller(): Promise<SellerDoc> {
  const { sellersCol, nowIso } = await import('./db')
  const col = await sellersCol()
  const now = nowIso()
  await col.updateOne(
    { id: PLATFORM_SELLER_ID },
    { $setOnInsert: {
      id: PLATFORM_SELLER_ID, user_id: PLATFORM_USER_ID, is_platform: true, display_name: 'CodeSpectra', slug: 'codespectra',
      bio: 'Official books, courses and services from CodeSpectra.', logo_url: '/icon.svg', country: 'IN', status: 'approved',
      commission_bps: 0, kyc: { status: 'verified' }, payout: { method: null, account_ref: null, verified: true },
      created_at: now, updated_at: now,
    } },
    { upsert: true },
  ).catch((e) => { if ((e as { code?: number })?.code !== 11000) throw e })
  return (await col.findOne({ id: PLATFORM_SELLER_ID }, { projection: { _id: 0 } })) as SellerDoc
}

export async function applyToSell(user: { id: string; email: string }, raw: unknown): Promise<SellerDoc> {
  const v = validateApplication(raw, { stripeConfigured: await stripeConfigured(), fallbackEmail: user.email })
  if (!v.ok) throw new MktError(400, v.errors.join(' '))
  const { getSettings } = await import('./settings')
  const { sellersCol, newId, nowIso } = await import('./db')
  const col = await sellersCol()
  const existing = await col.findOne({ user_id: user.id }, { projection: { _id: 0 } })
  if (existing && existing.status !== 'rejected' && existing.status !== 'pending') {
    throw new MktError(409, existing.status === 'approved' ? 'You are already an approved seller.' : 'Your seller account is suspended — contact support.')
  }
  const settings = await getSettings()
  const now = nowIso()
  const a = v.value
  const doc: SellerDoc = {
    id: existing?.id ?? newId(),
    user_id: user.id,
    is_platform: false,
    display_name: a.display_name,
    slug: await uniqueSlug(a.display_name, existing?.id),
    bio: a.bio,
    logo_url: a.logo_url,
    country: a.country,
    status: 'pending',
    commission_bps: existing?.commission_bps ?? null,
    kyc: a.kyc_public,
    payout: { method: a.payout_method, account_ref: a.account_ref, verified: false },
    contact_email: a.contact_email,
    phone: a.phone,
    whatsapp_opt_in: a.whatsapp_opt_in,
    kyc_secret: await encryptSecret(a.kyc_secret),
    payout_secret: a.payout_method === 'stripe_connect' ? null : await encryptSecret(a.payout_secret),
    stripe_account_id: existing?.stripe_account_id ?? null,
    w9_acknowledged: a.w9_acknowledged,
    terms_accepted_at: now,
    terms_commission_bps: existing?.commission_bps ?? settings.default_commission_bps,
    review_note: null,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  }
  await col.replaceOne({ user_id: user.id }, doc, { upsert: true })
  await audit(user.id, existing ? 'seller.reapplied' : 'seller.applied', doc.id)
  const { notifyAdmins } = await import('./seller-notify')
  await notifyAdmins('mkt.seller_application', 'New seller application', `${a.display_name} (${a.country}) applied to sell.`, '/dashboard/admin/marketplace?tab=sellers').catch(() => {})
  return doc
}

/** Profile / contact / payout changes by the seller. Payout changes need admin re-verification. */
export async function updateSellerProfile(seller: SellerDoc, raw: unknown): Promise<SellerDoc> {
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>
  const { sellersCol, nowIso } = await import('./db')
  const set: Partial<SellerDoc> = { updated_at: nowIso() }
  if (b.display_name !== undefined) {
    const n = str(b.display_name, 80)
    if (n.length < 2) throw new MktError(400, 'Store name must be at least 2 characters.')
    set.display_name = n
  }
  if (b.bio !== undefined) set.bio = str(b.bio, 2000)
  if (b.logo_url !== undefined) {
    const u = str(b.logo_url, 500) || null
    if (u && !URLISH.test(u)) throw new MktError(400, 'Logo must be an https:// link.')
    set.logo_url = u
  }
  if (b.phone !== undefined) {
    const phone = str(b.phone, 20).replace(/[^\d+]/g, '') || null
    if (phone && !/^\+?\d{8,15}$/.test(phone)) throw new MktError(400, 'Enter a valid phone number with country code.')
    set.phone = phone
  }
  if (b.whatsapp_opt_in !== undefined) set.whatsapp_opt_in = b.whatsapp_opt_in === true && !!(set.phone ?? seller.phone)
  if (b.contact_email !== undefined) {
    const e = str(b.contact_email, 200)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new MktError(400, 'Enter a valid contact email.')
    set.contact_email = e
  }
  if (b.payout !== undefined && !seller.is_platform) {
    await assertNoOpenPayout(seller.id)
    const pay = validatePayout(seller.country, b.payout, { stripeConfigured: await stripeConfigured() })
    if (!pay.ok) throw new MktError(400, pay.errors.join(' '))
    set.payout = { method: pay.method, account_ref: pay.method === 'stripe_connect' && seller.stripe_account_id ? 'Stripe account' : pay.account_ref, verified: false }
    set.payout_secret = pay.method === 'stripe_connect' ? null : await encryptSecret(pay.secret)
    await audit(seller.user_id, 'seller.payout_changed', seller.id)
  }
  await (await sellersCol()).updateOne({ id: seller.id }, { $set: set })
  return { ...seller, ...set }
}

/** Payout details are frozen while a payout is open (it is paid to the details snapshotted at request). */
export async function assertNoOpenPayout(sellerId: string): Promise<void> {
  const { payoutsCol } = await import('./db')
  const open = await (await payoutsCol()).findOne({ seller_id: sellerId, open: true }, { projection: { _id: 0, id: 1 } })
  if (open) throw new MktError(409, 'You have a payout in progress. You can change your payout details once it is paid, failed or cancelled.')
}

export async function decideSeller(actorId: string, id: string, action: SellerAction, note?: string | null): Promise<SellerDoc> {
  const s = await getSellerById(id)
  if (!s || s.is_platform) throw new MktError(404, 'Seller not found')
  const next = nextSellerStatus(s.status, action)
  if (!next) throw new MktError(409, `Can't ${action} a seller who is ${s.status}.`)
  const { sellersCol, nowIso } = await import('./db')
  const set: Record<string, unknown> = { status: next, updated_at: nowIso(), reviewed_by: actorId, review_note: str(note, 1000) || null }
  if (action === 'approve') {
    set['kyc.status'] = 'verified'
    if (s.payout.method === 'bank' || s.payout.method === 'upi') set['payout.verified'] = true
  }
  if (action === 'reject') set['kyc.status'] = 'rejected'
  // Optimistic: only from the status we validated against.
  const r = await (await sellersCol()).updateOne({ id, status: s.status }, { $set: set })
  if (!r.modifiedCount) throw new MktError(409, 'This seller was just updated — reload and try again.')
  await audit(actorId, `seller.${action}`, id, note)
  if (action === 'suspend' || action === 'reinstate' || action === 'approve') {
    // Their published products leave / re-enter the public catalogue (and the copilot index).
    const { productsCol } = await import('./db')
    const ids = (await (await productsCol()).find({ seller_id: id, status: 'published' }, { projection: { _id: 0, id: 1 } }).limit(5000).toArray()).map((p) => p.id)
    const { knowledgeOnMarketplaceProduct } = await import('@/lib/rag/hooks')
    knowledgeOnMarketplaceProduct(ids)
  }
  const updated = (await getSellerById(id)) as SellerDoc
  const { notifySeller } = await import('./seller-notify')
  const msg: Record<SellerAction, [string, string]> = {
    approve: ['Your seller account is approved', 'You can now list products and start selling on CodeSpectra.'],
    reject: ['Your seller application was not approved', note ? `Reason: ${str(note, 300)}` : 'You can update your details and apply again.'],
    suspend: ['Your seller account is suspended', note ? `Reason: ${str(note, 300)}` : 'Contact support for details.'],
    reinstate: ['Your seller account is active again', 'Your listings can be sold again.'],
  }
  await notifySeller(updated, 'mkt.seller_status', msg[action][0], msg[action][1], action === 'reject' ? '/dashboard/seller/apply' : '/dashboard/seller').catch(() => {})
  return updated
}

export async function setSellerCommission(actorId: string, id: string, bps: number | null): Promise<void> {
  if (bps !== null && !(Number.isInteger(bps) && bps >= 0 && bps <= 10_000)) throw new MktError(400, 'Commission must be between 0% and 100%.')
  const s = await getSellerById(id)
  if (!s || s.is_platform) throw new MktError(404, 'Seller not found')
  const { sellersCol, nowIso } = await import('./db')
  await (await sellersCol()).updateOne({ id }, { $set: { commission_bps: bps, updated_at: nowIso() } })
  await audit(actorId, 'seller.commission', id, bps === null ? 'platform default' : `${bps / 100}%`)
}

/** Full KYC + payout details for an admin — every reveal is audited. */
export async function revealKyc(actorId: string, id: string): Promise<{ kyc: KycSecret | null; payout: PayoutSecret | null; history: { action: string; actor_id: string; note?: string | null; created_at: string }[] }> {
  const s = await getSellerById(id)
  if (!s || s.is_platform) throw new MktError(404, 'Seller not found')
  await audit(actorId, 'seller.kyc_viewed', id)
  const { auditCol } = await import('./db')
  const history = await (await auditCol()).find({ 'target.type': 'seller', 'target.id': id }, { projection: { _id: 0, action: 1, actor_id: 1, note: 1, created_at: 1 } }).sort({ created_at: -1 }).limit(50).toArray()
  const kyc = await decryptSecret<KycSecret>(s.kyc_secret)
  // Legacy records kept the GSTIN in the public kyc block (unmasked).
  const legacyGstin = s.kyc?.gstin && !s.kyc.gstin.includes('•') ? s.kyc.gstin : undefined
  const fullKyc = legacyGstin && !kyc?.gstin ? { ...(kyc ?? {}), gstin: legacyGstin } : kyc
  return { kyc: fullKyc, payout: await decryptSecret<PayoutSecret>(s.payout_secret), history }
}

/**
 * The seller's full GSTIN for a buyer TAX INVOICE only (a GST invoice must show the supplier's
 * complete GSTIN; it is a public business registration number). Never use it in list views or
 * other API responses — those use maskGstin. PAN is never shown in full anywhere.
 */
export async function sellerInvoiceGstin(s: Pick<SellerDoc, 'kyc' | 'kyc_secret'>): Promise<string | null> {
  const secret = await decryptSecret<KycSecret>(s.kyc_secret ?? null).catch(() => null)
  const full = secret?.gstin || (s.kyc?.gstin && !s.kyc.gstin.includes('•') ? s.kyc.gstin : '')
  const g = String(full || '').replace(/\s+/g, '').toUpperCase()
  return GSTIN.test(g) ? g : null
}

export async function audit(actorId: string, action: string, sellerOrTargetId: string, note?: string | null, type: 'seller' | 'product' | 'payout' | 'order' | 'refund' | 'settings' = 'seller') {
  const { auditCol, newId, nowIso } = await import('./db')
  await (await auditCol()).insertOne({ id: newId(), actor_id: actorId, action, target: { type, id: sellerOrTargetId }, note: note ? str(note, 1000) : null, created_at: nowIso() }).catch((e) => console.error('[marketplace] audit failed', (e as Error)?.message))
}

// ─── Stripe Connect Express ──────────────────────────────────────────────────

/** Onboarding link for a US seller (creates the Express account once). */
export async function stripeOnboardingLink(seller: SellerDoc, origin: string): Promise<string> {
  if (seller.country !== 'US') throw new MktError(400, 'Stripe payouts are available for US sellers.')
  if (!(await stripeConfigured())) throw new MktError(400, 'Stripe is not configured on this platform.')
  const { getStripeClient } = await import('@/lib/stripe-client')
  const stripe = await getStripeClient()
  let acct = seller.stripe_account_id
  if (!acct) {
    await assertNoOpenPayout(seller.id)
    const a = await stripe.accounts.create(
      { type: 'express', country: 'US', email: seller.contact_email || undefined, capabilities: { transfers: { requested: true } }, metadata: { seller_id: seller.id } },
      { idempotencyKey: `mkt-acct-${seller.id}` },
    )
    acct = a.id
    const { sellersCol, nowIso } = await import('./db')
    await (await sellersCol()).updateOne({ id: seller.id }, { $set: { stripe_account_id: acct, 'payout.method': 'stripe_connect', 'payout.account_ref': 'Stripe account', updated_at: nowIso() } })
  }
  const link = await stripe.accountLinks.create({
    account: acct,
    refresh_url: `${origin}/dashboard/seller?tab=settings&stripe=refresh`,
    return_url: `${origin}/dashboard/seller?tab=settings&stripe=return`,
    type: 'account_onboarding',
  })
  return link.url
}

/** Refresh payout.verified from Stripe (payouts_enabled). */
export async function refreshStripeStatus(seller: SellerDoc): Promise<boolean> {
  if (!seller.stripe_account_id) return false
  const { getStripeClient } = await import('@/lib/stripe-client')
  const a = await (await getStripeClient()).accounts.retrieve(seller.stripe_account_id)
  const ok = !!(a.payouts_enabled && a.details_submitted)
  const { sellersCol, nowIso } = await import('./db')
  await (await sellersCol()).updateOne({ id: seller.id }, { $set: { 'payout.verified': ok, updated_at: nowIso() } })
  return ok
}
