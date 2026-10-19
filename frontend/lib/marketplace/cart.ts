/**
 * Cart (buyer part). Guests get an anonymous cart keyed by an httpOnly cookie; on the first
 * request after sign-in it is merged into the user's cart (same currency → merged, other
 * currency → "saved for later"). One currency per cart. Every read re-validates price, stock,
 * availability and service slots on the server.
 */
import 'server-only'
import type { CartLine, Currency, ItemKind } from './contract'
import type { ProductDoc, SellerDoc } from './db'
import { newId, nowIso } from './db'
import { carts, type CartDoc } from './order-doc'
import { loadSellableProducts } from './catalog'
import { isSlotAvailable } from './booking'
import { commissionFor } from './ledger'
import { getSettings } from './settings'
import { computeQuote, currencyDecision, type PriceLineInput, type Quote } from './pricing'

export const ANON_CART_COOKIE = 'cs_mkt_cart'
export const MAX_LINES = 50
export const MAX_QTY = 20

export interface CartRef { userId: string | null; anonId: string | null }

export class CartError extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message) }
}

export const lineKey = (l: Pick<CartLine, 'product_id' | 'variant_id' | 'service_slot'>) => `${l.product_id}:${l.variant_id || ''}:${l.service_slot || ''}`

export function maxQtyFor(kind: ItemKind): number {
  return kind === 'physical' ? MAX_QTY : 1
}

function refFilter(ref: CartRef) {
  if (ref.userId) return { user_id: ref.userId }
  if (ref.anonId) return { anon_id: ref.anonId, user_id: null }
  return null
}

export async function findCart(ref: CartRef): Promise<CartDoc | null> {
  const f = refFilter(ref)
  if (!f) return null
  return (await carts()).findOne(f as never, { projection: { _id: 0 } })
}

async function ensureCart(ref: CartRef, currency: Currency): Promise<CartDoc> {
  const existing = await findCart(ref)
  if (existing) return existing
  if (!ref.userId && !ref.anonId) throw new CartError(400, 'No cart')
  const doc: CartDoc = { id: newId(), user_id: ref.userId, anon_id: ref.userId ? null : ref.anonId, currency, lines: [], saved: [], updated_at: nowIso(), created_at: nowIso() }
  await (await carts()).insertOne(doc)
  return doc
}

async function save(cart: CartDoc): Promise<void> {
  await (await carts()).updateOne({ id: cart.id }, { $set: { currency: cart.currency, lines: cart.lines.slice(0, MAX_LINES), saved: (cart.saved || []).slice(0, MAX_LINES), updated_at: nowIso() } })
}

/** Merge the guest cart into the signed-in user's cart (idempotent: the guest cart is deleted). */
export async function mergeAnonCart(userId: string, anonId: string): Promise<void> {
  const col = await carts()
  const anon = await col.findOne({ anon_id: anonId, user_id: null } as never, { projection: { _id: 0 } })
  if (!anon) return
  const userCart = await findCart({ userId, anonId: null })
  if (!userCart) {
    await col.updateOne({ id: anon.id, user_id: null } as never, { $set: { user_id: userId, anon_id: null, updated_at: nowIso() } })
    return
  }
  const merged: CartDoc = { ...userCart, lines: [...userCart.lines], saved: [...(userCart.saved || [])] }
  const target = merged.lines.length ? merged.currency : anon.currency
  merged.currency = target
  for (const l of anon.lines) {
    if (anon.currency !== target) { pushUnique(merged.saved!, l); continue }
    const hit = merged.lines.find((x) => lineKey(x) === lineKey(l))
    if (hit) hit.qty = Math.min(MAX_QTY, Math.max(hit.qty, l.qty))
    else merged.lines.push(l)
  }
  for (const l of anon.saved || []) pushUnique(merged.saved!, l)
  await save(merged)
  await col.deleteOne({ id: anon.id })
}

function pushUnique(list: CartLine[], l: CartLine) {
  if (!list.some((x) => lineKey(x) === lineKey(l))) list.push(l)
}

export type CartAction =
  | { action: 'add'; product_id: string; variant_id?: string | null; qty?: number; service_slot?: string | null; switch_currency?: boolean }
  | { action: 'update'; key: string; qty: number }
  | { action: 'remove'; key: string }
  | { action: 'save_for_later'; key: string }
  | { action: 'move_to_cart'; key: string; switch_currency?: boolean }
  | { action: 'remove_saved'; key: string }
  | { action: 'clear' }

export function parseCartAction(raw: unknown): CartAction | null {
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const str = (v: unknown, max = 200) => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : null)
  const id = (v: unknown) => (typeof v === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(v) ? v : null)
  const qty = (v: unknown) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= MAX_QTY ? (v as number) : null)
  switch (b.action) {
    case 'add': {
      const pid = id(b.product_id)
      if (!pid) return null
      const slot = b.service_slot == null ? null : str(b.service_slot, 40)
      if (slot && !Number.isFinite(Date.parse(slot))) return null
      return { action: 'add', product_id: pid, variant_id: b.variant_id == null ? null : id(b.variant_id), qty: qty(b.qty ?? 1) || 1, service_slot: slot ? new Date(slot).toISOString() : null, switch_currency: b.switch_currency === true }
    }
    case 'update': { const k = str(b.key), q = qty(b.qty); return k && q != null ? { action: 'update', key: k, qty: q } : null }
    case 'remove': case 'save_for_later': case 'remove_saved': { const k = str(b.key); return k ? { action: b.action, key: k } : null }
    case 'move_to_cart': { const k = str(b.key); return k ? { action: 'move_to_cart', key: k, switch_currency: b.switch_currency === true } : null }
    case 'clear': return { action: 'clear' }
    default: return null
  }
}

/** Apply a cart action (server-validated). Throws CartError with a plain-language message. */
export async function applyCartAction(ref: CartRef, a: CartAction): Promise<void> {
  if (a.action === 'add' || a.action === 'move_to_cart') {
    let line: CartLine
    let cart: CartDoc
    if (a.action === 'add') {
      const found = (await loadSellableProducts([a.product_id])).get(a.product_id)
      if (!found) throw new CartError(404, 'This item is no longer available.')
      const p = found.product
      cart = await ensureCart(ref, p.currency)
      line = { product_id: p.id, variant_id: a.variant_id ?? null, qty: Math.min(a.qty ?? 1, maxQtyFor(p.kind)), service_slot: a.service_slot ?? null }
      checkLineShape(p, line)
      if (p.kind === 'service' && line.service_slot && !(await isSlotAvailable(p, line.service_slot))) {
        throw new CartError(409, 'That time is no longer available. Pick another slot.', 'slot_unavailable')
      }
      switchOrAdopt(cart, p.currency, a.switch_currency)
    } else {
      cart = (await findCart(ref)) ?? (() => { throw new CartError(404, 'Cart not found') })()
      const saved = (cart.saved || []).find((x) => lineKey(x) === a.key)
      if (!saved) throw new CartError(404, 'Item not found')
      const found = (await loadSellableProducts([saved.product_id])).get(saved.product_id)
      if (!found) throw new CartError(404, 'This item is no longer available.')
      switchOrAdopt(cart, found.product.currency, a.switch_currency)
      cart.saved = (cart.saved || []).filter((x) => lineKey(x) !== a.key)
      line = saved
    }
    const hit = cart.lines.find((x) => lineKey(x) === lineKey(line))
    if (hit) hit.qty = Math.min(MAX_QTY, hit.qty + line.qty)
    else {
      if (cart.lines.length >= MAX_LINES) throw new CartError(400, 'Your cart is full.')
      // One slot per service in the cart: replace a previous pick of the same service.
      cart.lines = cart.lines.filter((x) => !(x.product_id === line.product_id && x.service_slot && line.service_slot))
      cart.lines.push(line)
    }
    await save(cart)
    return
  }
  const cart = await findCart(ref)
  if (!cart) return
  if (a.action === 'clear') cart.lines = []
  if (a.action === 'remove') cart.lines = cart.lines.filter((x) => lineKey(x) !== a.key)
  if (a.action === 'remove_saved') cart.saved = (cart.saved || []).filter((x) => lineKey(x) !== a.key)
  if (a.action === 'update') {
    if (a.qty === 0) cart.lines = cart.lines.filter((x) => lineKey(x) !== a.key)
    else cart.lines = cart.lines.map((x) => (lineKey(x) === a.key ? { ...x, qty: a.qty } : x))
  }
  if (a.action === 'save_for_later') {
    const l = cart.lines.find((x) => lineKey(x) === a.key)
    if (l) { cart.lines = cart.lines.filter((x) => x !== l); cart.saved = cart.saved || []; pushUnique(cart.saved, l) }
  }
  await save(cart)
}

function switchOrAdopt(cart: CartDoc, currency: Currency, allowSwitch?: boolean) {
  const d = currencyDecision(cart, currency)
  if (d === 'ok') return
  if (d === 'adopt') { cart.currency = currency; return }
  if (!allowSwitch) {
    throw new CartError(409, `Your cart is in ${cart.currency}. Switch the cart to ${currency}? Items in ${cart.currency} move to "Saved for later".`, 'currency_switch_required')
  }
  cart.saved = cart.saved || []
  for (const l of cart.lines) pushUnique(cart.saved, l)
  cart.lines = []
  cart.currency = currency
}

function checkLineShape(p: ProductDoc, line: CartLine) {
  if (p.variants?.length) {
    if (!line.variant_id || !p.variants.some((v) => v.id === line.variant_id)) throw new CartError(400, 'Choose an option first.')
  } else line.variant_id = null
  if (p.kind === 'service') {
    if (!line.service_slot) throw new CartError(400, 'Pick a time for this session first.')
  } else line.service_slot = null
}

// ─── Validation + pricing view ───────────────────────────────────────────────

export interface CartViewLine {
  key: string
  product_id: string
  variant_id: string | null
  variant_name: string | null
  service_slot: string | null
  qty: number
  max_qty: number
  title: string
  slug: string
  image: string | null
  kind: ItemKind
  currency: Currency
  unit_price: number
  seller: { name: string; slug: string }
  issues: string[]
}

export interface CartView {
  id: string | null
  currency: Currency
  lines: CartViewLine[]
  saved: CartViewLine[]
  quote: Quote | null
  needs_shipping: boolean
  ok: boolean
  count: number
}

export interface ResolvedLine { line: CartLine; product: ProductDoc; seller: SellerDoc; unit_price: number; view: CartViewLine }

/** Resolve + validate lines against the live catalog (no writes). */
export async function resolveLines(lines: CartLine[], currency: Currency, opts: { checkSlots?: boolean } = {}): Promise<ResolvedLine[]> {
  const products = await loadSellableProducts(lines.map((l) => l.product_id))
  const out: ResolvedLine[] = []
  for (const line of lines) {
    const found = products.get(line.product_id)
    const issues: string[] = []
    if (!found) {
      out.push({ line, product: null as never, seller: null as never, unit_price: 0, view: { key: lineKey(line), product_id: line.product_id, variant_id: line.variant_id ?? null, variant_name: null, service_slot: line.service_slot ?? null, qty: line.qty, max_qty: 0, title: 'Item no longer available', slug: '', image: null, kind: 'digital', currency, unit_price: 0, seller: { name: '', slug: '' }, issues: ['unavailable'] } })
      continue
    }
    const { product: p, seller: s } = found
    const variant = line.variant_id ? p.variants?.find((v) => v.id === line.variant_id) : null
    if (line.variant_id && !variant) issues.push('unavailable')
    const unit = variant ? variant.price : p.price
    const stock = variant ? variant.stock : p.stock
    const max = p.kind === 'physical' ? Math.min(MAX_QTY, stock == null ? MAX_QTY : Math.max(0, stock)) : 1
    if (p.currency !== currency) issues.push('currency')
    if (p.kind === 'physical' && max === 0) issues.push('out_of_stock')
    else if (line.qty > max) issues.push('qty_reduced')
    if (p.kind === 'service') {
      if (!line.service_slot) issues.push('slot_missing')
      else if (opts.checkSlots !== false && !(await isSlotAvailable(p, line.service_slot))) issues.push('slot_unavailable')
    }
    out.push({
      line, product: p, seller: s, unit_price: unit,
      view: {
        key: lineKey(line), product_id: p.id, variant_id: line.variant_id ?? null, variant_name: variant?.name ?? null,
        service_slot: line.service_slot ?? null, qty: Math.min(line.qty, Math.max(1, max)), max_qty: max,
        title: p.title, slug: p.slug, image: p.images?.[0] ?? null, kind: p.kind, currency: p.currency, unit_price: unit,
        seller: { name: s.display_name, slug: s.slug }, issues,
      },
    })
  }
  return out
}

export function priceInputs(resolved: ResolvedLine[], settings: Awaited<ReturnType<typeof getSettings>>): PriceLineInput[] {
  return resolved.map((r) => ({
    key: r.view.key,
    seller_id: r.product.seller_id,
    kind: r.product.kind,
    unit_price: r.unit_price,
    qty: r.view.qty,
    commission_bps: commissionFor(r.product, r.seller, settings),
    shipping: r.product.kind === 'physical' && r.product.shipping ? { fee: r.product.shipping.fee, free_over: r.product.shipping.free_over ?? null } : null,
  }))
}

export async function cartView(ref: CartRef): Promise<CartView> {
  const cart = await findCart(ref)
  if (!cart) return { id: null, currency: 'INR', lines: [], saved: [], quote: null, needs_shipping: false, ok: false, count: 0 }
  const [resolved, saved, settings] = await Promise.all([
    resolveLines(cart.lines, cart.currency),
    resolveLines(cart.saved || [], cart.currency, { checkSlots: false }),
    getSettings(),
  ])
  const good = resolved.filter((r) => r.product && !r.view.issues.some((i) => i !== 'qty_reduced'))
  const quote = good.length ? computeQuote(priceInputs(good, settings), { currency: cart.currency, settings }) : null
  return {
    id: cart.id,
    currency: cart.currency,
    lines: resolved.map((r) => r.view),
    saved: saved.map((r) => ({ ...r.view, issues: r.view.issues.filter((i) => i !== 'currency') })),
    quote,
    needs_shipping: good.some((r) => r.product.kind === 'physical'),
    ok: resolved.length > 0 && resolved.every((r) => r.product && !r.view.issues.some((i) => i !== 'qty_reduced')),
    count: cart.lines.reduce((a, l) => a + l.qty, 0),
  }
}

/** Remove purchased lines from the cart after a successful checkout. */
export async function removeLinesAfterOrder(userId: string, keys: string[]): Promise<void> {
  const col = await carts()
  const cart = await col.findOne({ user_id: userId }, { projection: { _id: 0 } })
  if (!cart) return
  await col.updateOne({ id: cart.id }, { $set: { lines: cart.lines.filter((l) => !keys.includes(lineKey(l))), updated_at: nowIso() } })
}
