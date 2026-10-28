/**
 * Seller product listings: validation per kind (pure, unit tested) and CRUD.
 *
 * Status flow: draft → (submit) → pending_review → published | rejected
 * (straight to published when settings.require_product_review is off).
 * Editing a published listing: price / stock / variant stock changes apply
 * at once; content changes go back to review when review is required.
 */
import type { Currency, ItemKind, Product, ProductVariant } from './contract'
import type { ProductDoc, SellerDoc } from './db'
import { CATEGORIES, MktError } from './settings'

export const MAX_PRICE = 100_000_000 // minor units
export const PROVIDERS = ['livekit', 'zoom', 'google_meet', 'teams', 'manual'] as const

type Editable = Pick<Product, 'kind' | 'title' | 'description_md' | 'images' | 'category' | 'tags' | 'currency' | 'price' | 'compare_at_price' | 'variants' | 'stock' | 'digital' | 'service' | 'shipping'> & { low_stock_threshold?: number | null }

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const intOr = (v: unknown, d: number | null = null): number | null => {
  if (v === null || v === undefined || v === '') return d
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^-?\d+$/.test(v.trim()) ? Number(v) : NaN
  return Number.isFinite(n) ? n : NaN
}
const isInt = (n: number | null, min: number, max: number) => typeof n === 'number' && Number.isInteger(n) && n >= min && n <= max
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
const IMG = /^(https:\/\/|\/)[^\s<>"']{1,1000}$/

export function validTimezone(tz: string): boolean {
  if (!tz) return false
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true } catch { return false }
}

/**
 * Pure: validate a product payload. `strict` = ready to submit (stricter
 * completeness checks). `ownFileIds` = the seller's uploaded file ids.
 */
export function validateProduct(raw: unknown, opts: { strict?: boolean; kind?: ItemKind; ownFileIds?: string[]; newId?: () => string } = {}):
  { ok: true; value: Editable } | { ok: false; errors: string[] } {
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>
  const errors: string[] = []
  const kind = (opts.kind ?? str(b.kind, 10)) as ItemKind
  if (!['digital', 'physical', 'service'].includes(kind)) return { ok: false, errors: ['Choose a product type: digital, physical or service.'] }
  const title = str(b.title, 140)
  if (title.length < 3) errors.push('Title must be at least 3 characters.')
  const description_md = str(b.description_md, 20_000)
  if (opts.strict && description_md.length < 20) errors.push('Add a description of at least 20 characters.')
  const images = (Array.isArray(b.images) ? b.images : []).map((u: unknown) => str(u, 1000)).filter(Boolean)
  if (images.length > 8) errors.push('Up to 8 images.')
  if (images.some((u: string) => !IMG.test(u))) errors.push('Images must be https:// links.')
  const category = str(b.category, 40).toLowerCase()
  if (!(CATEGORIES as readonly string[]).includes(category)) errors.push('Choose a category.')
  const tags = [...new Set((Array.isArray(b.tags) ? b.tags : String(b.tags || '').split(',')).map((t: unknown) => str(t, 30).toLowerCase()).filter(Boolean))].slice(0, 10) as string[]
  const currency = str(b.currency, 3).toUpperCase() as Currency
  if (currency !== 'INR' && currency !== 'USD') errors.push('Currency must be INR or USD.')
  let price = intOr(b.price) as number
  if (!isInt(price, 0, MAX_PRICE)) errors.push('Price must be a whole amount in minor units (paise / cents).')
  const compare_at_price = intOr(b.compare_at_price)
  if (compare_at_price !== null && (!isInt(compare_at_price, 1, MAX_PRICE) || compare_at_price <= price)) errors.push('Compare-at price must be higher than the price.')

  const v: Editable = { kind, title, description_md, images, category, tags, currency, price, compare_at_price, variants: undefined, stock: null, digital: null, service: null, shipping: null }

  if (kind === 'digital') {
    const d = (b.digital && typeof b.digital === 'object' ? b.digital : {}) as Record<string, any>
    const file_ids = [...new Set((Array.isArray(d.file_ids) ? d.file_ids : []).map((x: unknown) => str(x, 64)).filter(Boolean))] as string[]
    if (file_ids.length > 20) errors.push('Up to 20 files per product.')
    if (opts.ownFileIds && file_ids.some((f) => !opts.ownFileIds!.includes(f))) errors.push('One of the files was not found — upload it again.')
    if (opts.strict && !file_ids.length) errors.push('Upload at least one file for a digital product.')
    const download_limit = intOr(d.download_limit, 5) as number
    if (!isInt(download_limit, 1, 50)) errors.push('Download limit must be 1–50.')
    v.digital = { file_ids, download_limit, license_note: str(d.license_note, 1000) || undefined }
  }

  if (kind === 'physical') {
    const raws = Array.isArray(b.variants) ? b.variants : []
    if (raws.length > 50) errors.push('Up to 50 variants.')
    const variants: ProductVariant[] = []
    const seen = new Set<string>()
    for (const r of raws.slice(0, 50)) {
      const name = str(r?.name, 60)
      const vp = intOr(r?.price, price) as number
      const st = intOr(r?.stock)
      if (!name) { errors.push('Every variant needs a name.'); continue }
      if (seen.has(name.toLowerCase())) { errors.push(`Variant "${name}" is listed twice.`); continue }
      seen.add(name.toLowerCase())
      if (!isInt(vp, 0, MAX_PRICE)) errors.push(`Variant "${name}" needs a valid price.`)
      if (st !== null && !isInt(st, 0, 1_000_000)) errors.push(`Variant "${name}" stock must be 0 or more.`)
      const id = str(r?.id, 64) || (opts.newId ? opts.newId() : `v${variants.length + 1}`)
      variants.push({ id, name, price: vp, stock: st, sku: str(r?.sku, 40) || undefined })
    }
    if (variants.length) {
      v.variants = variants
      price = Math.min(...variants.map((x) => x.price))
      v.price = price
    }
    const stock = intOr(b.stock)
    if (stock !== null && !isInt(stock, 0, 1_000_000)) errors.push('Stock must be 0 or more (leave blank for unlimited).')
    v.stock = variants.length ? null : stock
    const lst = intOr(b.low_stock_threshold)
    if (lst !== null && !isInt(lst, 0, 100_000)) errors.push('Low-stock alert must be 0 or more.')
    v.low_stock_threshold = lst
    const s = (b.shipping && typeof b.shipping === 'object' ? b.shipping : null) as Record<string, any> | null
    if (!s) errors.push('Add shipping details.')
    else {
      const ships_from = str(s.ships_from, 2).toUpperCase()
      if (!/^[A-Z]{2}$/.test(ships_from)) errors.push('Ships-from must be a 2-letter country code.')
      const regions = [...new Set((Array.isArray(s.regions) ? s.regions : String(s.regions || '').split(',')).map((r: unknown) => str(r, 5).toUpperCase()).filter(Boolean))] as string[]
      if (!regions.length || regions.some((r) => r !== 'WORLD' && !/^[A-Z]{2}$/.test(r))) errors.push('Shipping regions must be 2-letter country codes (or WORLD).')
      const fee = intOr(s.fee, 0) as number
      if (!isInt(fee, 0, MAX_PRICE)) errors.push('Shipping fee must be 0 or more.')
      const free_over = intOr(s.free_over)
      if (free_over !== null && !isInt(free_over, 1, MAX_PRICE)) errors.push('Free-shipping threshold must be more than 0.')
      const dispatch_days = intOr(s.dispatch_days, 2) as number
      if (!isInt(dispatch_days, 0, 30)) errors.push('Dispatch time must be 0–30 days.')
      const weight_g = intOr(s.weight_g)
      if (weight_g !== null && !isInt(weight_g, 1, 100_000)) errors.push('Weight must be in grams.')
      v.shipping = { ships_from, regions, fee, free_over, dispatch_days, weight_g: weight_g ?? undefined }
    }
  }

  if (kind === 'service') {
    const s = (b.service && typeof b.service === 'object' ? b.service : {}) as Record<string, any>
    const duration_min = intOr(s.duration_min, 60) as number
    if (!isInt(duration_min, 15, 480)) errors.push('Session length must be 15–480 minutes.')
    const mode = s.mode === 'in_person' ? 'in_person' : 'virtual'
    const provider = (PROVIDERS as readonly string[]).includes(s.provider) ? s.provider : 'manual'
    const timezone = str(s.timezone, 64)
    if (!validTimezone(timezone)) errors.push('Choose a valid time zone.')
    const buffer_min = intOr(s.buffer_min, 0) as number
    if (!isInt(buffer_min, 0, 120)) errors.push('Buffer must be 0–120 minutes.')
    const max_per_day = intOr(s.max_per_day, 0) as number
    if (!isInt(max_per_day, 0, 24)) errors.push('Sessions per day must be 0–24 (0 = no limit).')
    const weekly: { dow: number; start: string; end: string }[] = []
    for (const r of (Array.isArray(s.weekly) ? s.weekly : []).slice(0, 50)) {
      const dow = intOr(r?.dow) as number
      const start = str(r?.start, 5)
      const end = str(r?.end, 5)
      if (!isInt(dow, 0, 6) || !HHMM.test(start) || !HHMM.test(end) || start >= end) { errors.push('Each availability window needs a day and a start time before the end time.'); continue }
      weekly.push({ dow, start, end })
    }
    if ((Array.isArray(s.weekly) ? s.weekly.length : 0) > 50) errors.push('Up to 50 availability windows.')
    if (opts.strict && !weekly.length) errors.push('Add at least one weekly availability window.')
    v.service = { duration_min, mode, provider, slots_source: 'weekly_rules', weekly, timezone, buffer_min, ...(max_per_day > 0 ? { max_per_day } : {}) }
  }

  return errors.length ? { ok: false, errors: [...new Set(errors)] } : { ok: true, value: v }
}

/** Pure: does this edit change listing content (needs re-review) vs. price/stock only? */
export function contentChanged(before: Editable, after: Editable): boolean {
  const pick = (p: Editable) => JSON.stringify([p.title, p.description_md, p.images, p.category, p.tags, p.currency, p.digital?.file_ids, p.digital?.license_note, p.service, p.shipping?.regions, p.variants?.map((v) => v.name)])
  return pick(before) !== pick(after)
}

/**
 * Pure: give edited variants stable server-side ids — an id the product already has, else the id of
 * the existing variant with the same name, else a new one. Client-sent unknown ids are never trusted
 * (order lines and stock reservations reference variant ids; a regenerated id would make giveBack a
 * silent no-op).
 */
export function stabilizeVariantIds(before: ProductVariant[] | null | undefined, incoming: ProductVariant[] | null | undefined, newId: () => string): ProductVariant[] | undefined {
  if (!incoming) return undefined
  const byId = new Map((before || []).map((v) => [v.id, v]))
  const byName = new Map((before || []).map((v) => [v.name.trim().toLowerCase(), v]))
  const used = new Set<string>()
  return incoming.map((v) => {
    let id = v.id && byId.has(v.id) && !used.has(v.id) ? v.id : ''
    if (!id) {
      const same = byName.get(v.name.trim().toLowerCase())
      if (same && !used.has(same.id)) id = same.id
    }
    if (!id) id = newId()
    used.add(id)
    return { ...v, id }
  })
}

type StockShape = { stock?: number | null; variants?: ProductVariant[] | null }

/**
 * Pure: the stock counts the seller's form was showing (`stock_seen`, per-variant `stock_seen`,
 * sent back by the editor), else the counts read when the save started.
 */
export function stockSeen(raw: unknown, before: StockShape): StockShape {
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>
  const n = (v: unknown): number | null | undefined => (v === null ? null : typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : undefined)
  const rawVariants = Array.isArray(b.variants) ? (b.variants as Record<string, unknown>[]) : []
  return {
    stock: 'stock_seen' in b && n(b.stock_seen) !== undefined ? n(b.stock_seen) : before.stock,
    variants: (before.variants || []).map((v) => {
      const r = rawVariants.find((x) => x && x.id === v.id && 'stock_seen' in x)
      const seen = r ? n(r.stock_seen) : undefined
      return seen === undefined ? v : { ...v, stock: seen }
    }),
  }
}

/**
 * Pure: the stock values to write for a seller edit, as DELTAS on what is in the database now.
 * `seen` = the product as read when the edit started, `requested` = the form, `current` = a fresh read.
 * A count the seller changed moves by (requested − seen) from the current count (reservations made
 * meanwhile are kept); switching between counted and unlimited is absolute. `guard` = filter
 * conditions that the current counts are still what we planned from (compare-and-set).
 */
export function planStockWrite(seen: StockShape, requested: StockShape, current: StockShape): { stock: number | null; variants?: ProductVariant[]; guard: Record<string, unknown>[] } {
  const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
  const move = (seenV: number | null | undefined, reqV: number | null | undefined, curV: number | null | undefined): number | null => {
    if (!num(reqV)) return null
    if (num(seenV) && num(curV)) return Math.max(0, curV + (reqV - seenV))
    return reqV
  }
  const guard: Record<string, unknown>[] = [{ stock: num(current.stock) ? current.stock : null }]
  const stock = requested.variants?.length ? null : move(seen.stock, requested.stock, current.stock)
  let variants: ProductVariant[] | undefined
  if (requested.variants) {
    const seenBy = new Map((seen.variants || []).map((v) => [v.id, v]))
    const curBy = new Map((current.variants || []).map((v) => [v.id, v]))
    variants = requested.variants.map((v) => {
      const cur = curBy.get(v.id)
      if (cur) guard.push({ variants: { $elemMatch: { id: v.id, stock: num(cur.stock) ? cur.stock : null } } })
      return { ...v, stock: move(seenBy.get(v.id)?.stock, v.stock, cur?.stock) }
    })
  }
  return { stock, variants, guard }
}

// ─── DB ──────────────────────────────────────────────────────────────────────

function requireActive(seller: SellerDoc) {
  if (seller.status !== 'approved') throw new MktError(403, 'Your seller account must be approved to manage listings.')
}

async function ownFileIds(sellerId: string): Promise<string[]> {
  const { filesCol } = await import('./db')
  return (await (await filesCol()).find({ seller_id: sellerId }, { projection: { id: 1 } }).toArray()).map((f) => f.id)
}

async function uniqueProductSlug(title: string, selfId?: string): Promise<string> {
  const { productsCol } = await import('./db')
  const { slugify } = await import('./sellers')
  const col = await productsCol()
  const base = slugify(title)
  let slug = base
  for (let i = 2; i < 50; i++) {
    const hit = await col.findOne({ slug }, { projection: { id: 1 } })
    if (!hit || hit.id === selfId) return slug
    slug = `${base.slice(0, 54)}-${i}`
  }
  return `${base.slice(0, 50)}-${Date.now().toString(36)}`
}

export async function listSellerProducts(sellerId: string, status?: string | null): Promise<ProductDoc[]> {
  const { productsCol } = await import('./db')
  const q: Record<string, unknown> = { seller_id: sellerId }
  if (status) q.status = status
  return (await productsCol()).find(q, { projection: { _id: 0 } }).sort({ updated_at: -1 }).limit(500).toArray()
}

export async function getSellerProduct(sellerId: string, id: string): Promise<ProductDoc> {
  const { productsCol } = await import('./db')
  const p = await (await productsCol()).findOne({ id, seller_id: sellerId }, { projection: { _id: 0 } })
  if (!p) throw new MktError(404, 'Product not found')
  return p
}

/** Copilot index: the loader keeps only published products of approved sellers. */
function reindex(ids: string | string[]) {
  void import('@/lib/rag/hooks').then((m) => m.knowledgeOnMarketplaceProduct(ids)).catch(() => {})
}

export async function createProduct(seller: SellerDoc, raw: unknown): Promise<ProductDoc> {
  requireActive(seller)
  const { productsCol, newId, nowIso } = await import('./db')
  const v = validateProduct(raw, { ownFileIds: await ownFileIds(seller.id), newId })
  if (!v.ok) throw new MktError(400, v.errors.join(' '))
  const now = nowIso()
  v.value.variants = stabilizeVariantIds([], v.value.variants, newId)
  const doc: ProductDoc = { ...v.value, id: newId(), seller_id: seller.id, slug: await uniqueProductSlug(v.value.title), status: 'draft', created_at: now, updated_at: now }
  await (await productsCol()).insertOne(doc)
  await linkFiles(seller.id, doc.id, doc.digital?.file_ids ?? [])
  return doc
}

export async function updateProduct(seller: SellerDoc, id: string, raw: unknown): Promise<ProductDoc> {
  requireActive(seller)
  const before = await getSellerProduct(seller.id, id)
  if (before.status === 'archived') throw new MktError(409, 'Restore this product before editing it.')
  const { productsCol, newId, nowIso } = await import('./db')
  const { getSettings } = await import('./settings')
  const v = validateProduct(raw, { kind: before.kind, ownFileIds: await ownFileIds(seller.id), newId, strict: before.status === 'published' })
  if (!v.ok) throw new MktError(400, v.errors.join(' '))
  let status = before.status
  if (before.status === 'published' && (await getSettings()).require_product_review && !seller.is_platform && contentChanged(before, v.value)) status = 'pending_review'
  if (before.status === 'rejected') status = 'draft'
  v.value.variants = stabilizeVariantIds(before.variants, v.value.variants, newId)
  const set: Partial<ProductDoc> = { ...v.value, status, updated_at: nowIso() }
  if (status === 'pending_review' && before.status !== 'pending_review') set.submitted_at = nowIso()
  if (v.value.title !== before.title && before.status === 'draft') set.slug = await uniqueProductSlug(v.value.title, id)
  // Stock is written as deltas against a fresh read, compare-and-set on the counts we planned
  // from, so checkout reservations ($inc in stock.ts) racing this save are never overwritten.
  const col = await productsCol()
  let saved = false
  for (let attempt = 0; attempt < 5 && !saved; attempt++) {
    const current = await col.findOne({ id, seller_id: seller.id }, { projection: { _id: 0, stock: 1, variants: 1 } })
    if (!current) throw new MktError(404, 'Product not found')
    const plan = planStockWrite(stockSeen(raw, before), v.value, current)
    set.stock = plan.stock
    set.variants = plan.variants
    const r = await col.updateOne({ id, seller_id: seller.id, $and: plan.guard } as never, { $set: set })
    saved = r.matchedCount === 1
  }
  if (!saved) throw new MktError(409, 'Stock changed while you were saving (orders are coming in). Please try again.')
  await linkFiles(seller.id, id, v.value.digital?.file_ids ?? [])
  const after = { ...before, ...set } as ProductDoc
  if (before.status === 'published') reindex(id)
  if (after.kind === 'physical') {
    const { checkLowStock, isLowStock } = await import('./seller-notify')
    if (!isLowStock(after)) await (await productsCol()).updateOne({ id }, { $set: { low_stock_notified_at: null } })
    else await checkLowStock([id])
  }
  return after
}

export async function submitProduct(seller: SellerDoc, id: string): Promise<ProductDoc> {
  requireActive(seller)
  const p = await getSellerProduct(seller.id, id)
  if (!['draft', 'rejected'].includes(p.status)) throw new MktError(409, `This product is already ${p.status.replace('_', ' ')}.`)
  const v = validateProduct(p, { kind: p.kind, strict: true, ownFileIds: await ownFileIds(seller.id) })
  if (!v.ok) throw new MktError(400, v.errors.join(' '))
  const { getSettings } = await import('./settings')
  const { productsCol, nowIso } = await import('./db')
  const direct = seller.is_platform || !(await getSettings()).require_product_review
  const status: Product['status'] = direct ? 'published' : 'pending_review'
  await (await productsCol()).updateOne({ id, seller_id: seller.id, status: p.status }, { $set: { status, submitted_at: nowIso(), updated_at: nowIso(), review_note: null } })
  if (status === 'published') reindex(id)
  return { ...p, status }
}

/** Drafts are deleted (with their files); anything that may have been sold is archived instead. */
export async function removeProduct(seller: SellerDoc, id: string): Promise<'deleted' | 'archived'> {
  const p = await getSellerProduct(seller.id, id)
  const { productsCol, nowIso } = await import('./db')
  if (p.status === 'draft' || p.status === 'rejected') {
    const { ordersCol } = await import('./db')
    const sold = await (await ordersCol()).findOne({ 'lines.product_id': id }, { projection: { _id: 1 } })
    if (!sold) {
      await (await productsCol()).deleteOne({ id, seller_id: seller.id })
      const { deleteSellerFiles } = await import('./seller-files')
      await deleteSellerFiles(seller.id, p.digital?.file_ids ?? []).catch((e) => console.error('[marketplace] file delete failed', (e as Error)?.message))
      reindex(id)
      return 'deleted'
    }
  }
  await (await productsCol()).updateOne({ id, seller_id: seller.id }, { $set: { status: 'archived', updated_at: nowIso() } })
  reindex(id)
  return 'archived'
}

export async function restoreProduct(seller: SellerDoc, id: string): Promise<ProductDoc> {
  requireActive(seller)
  const p = await getSellerProduct(seller.id, id)
  if (p.status !== 'archived') throw new MktError(409, 'Only archived products can be restored.')
  const { productsCol, nowIso } = await import('./db')
  await (await productsCol()).updateOne({ id, seller_id: seller.id }, { $set: { status: 'draft', updated_at: nowIso() } })
  return { ...p, status: 'draft' }
}

async function linkFiles(sellerId: string, productId: string, fileIds: string[]) {
  if (!fileIds.length) return
  const { filesCol } = await import('./db')
  await (await filesCol()).updateMany({ seller_id: sellerId, id: { $in: fileIds } }, { $set: { product_id: productId } })
}
