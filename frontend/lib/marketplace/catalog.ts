/**
 * Storefront reads (buyer part): published products from approved sellers only, with the
 * server-only bits (digital file ids, seller secrets) stripped.
 */
import 'server-only'
import type { Filter } from 'mongodb'
import type { Currency, ItemKind, Product, Seller } from './contract'
import { productsCol, reviewsCol, sellersCol, type ProductDoc, type SellerDoc } from './db'

export const STORE_CATEGORIES: { id: string; label: string; kind?: ItemKind }[] = [
  { id: 'books', label: 'Books', kind: 'physical' },
  { id: 'courses', label: 'Courses', kind: 'digital' },
  { id: 'ebooks', label: 'E-books & PDFs', kind: 'digital' },
  { id: 'merch', label: 'Merch', kind: 'physical' },
  { id: 'mentoring', label: 'Mentoring', kind: 'service' },
  { id: 'mock-interviews', label: 'Mock interviews', kind: 'service' },
  { id: 'templates', label: 'Templates', kind: 'digital' },
]
export const KIND_LABELS: Record<ItemKind, string> = { digital: 'Digital', physical: 'Physical', service: 'Service' }
export const categoryLabel = (id: string) => STORE_CATEGORIES.find((c) => c.id === id)?.label ?? (id ? id[0].toUpperCase() + id.slice(1).replace(/-/g, ' ') : 'Other')

export type PublicSeller = Pick<Seller, 'id' | 'display_name' | 'slug' | 'bio' | 'logo_url' | 'country' | 'is_platform' | 'created_at'>

export type PublicProduct = Omit<Product, 'digital'> & {
  digital: { files: number; download_limit: number; license_note?: string } | null
}

export interface ProductCard {
  id: string
  slug: string
  title: string
  kind: ItemKind
  category: string
  image: string | null
  currency: Currency
  price: number
  compare_at_price?: number | null
  rating?: { avg: number; count: number }
  seller: { name: string; slug: string; is_platform: boolean } | null
  in_stock: boolean
}

export function toPublicSeller(s: SellerDoc): PublicSeller {
  return { id: s.id, display_name: s.display_name, slug: s.slug, bio: s.bio, logo_url: s.logo_url ?? null, country: s.country, is_platform: s.is_platform, created_at: s.created_at }
}

export function toPublicProduct(p: ProductDoc): PublicProduct {
  const { digital, ...rest } = p
  const clean = { ...rest } as Record<string, unknown>
  for (const k of ['_id', 'review_note', 'submitted_at', 'low_stock_threshold', 'low_stock_notified_at']) delete clean[k]
  return { ...(clean as Omit<Product, 'digital'>), digital: digital ? { files: digital.file_ids?.length ?? 0, download_limit: digital.download_limit, license_note: digital.license_note } : null }
}

export function inStock(p: Pick<Product, 'kind' | 'stock' | 'variants'>): boolean {
  if (p.kind !== 'physical') return true
  if (p.variants?.length) return p.variants.some((v) => v.stock == null || v.stock > 0)
  return p.stock == null || p.stock > 0
}

let sellerCache: { at: number; map: Map<string, SellerDoc> } | null = null
/** Approved sellers by id (30 s cache — the storefront is read-heavy). */
export async function approvedSellers(): Promise<Map<string, SellerDoc>> {
  if (sellerCache && Date.now() - sellerCache.at < 30_000) return sellerCache.map
  const rows = await (await sellersCol()).find({ status: 'approved' }, { projection: { _id: 0, kyc_secret: 0, payout_secret: 0 } }).limit(5000).toArray()
  sellerCache = { at: Date.now(), map: new Map(rows.map((s) => [s.id, s])) }
  return sellerCache.map
}

function card(p: ProductDoc, sellers: Map<string, SellerDoc>): ProductCard {
  const s = sellers.get(p.seller_id)
  const minVariant = p.variants?.length ? Math.min(...p.variants.map((v) => v.price)) : null
  return {
    id: p.id, slug: p.slug, title: p.title, kind: p.kind, category: p.category,
    image: p.images?.[0] ?? null, currency: p.currency, price: minVariant ?? p.price,
    compare_at_price: p.compare_at_price ?? null, rating: p.rating,
    seller: s ? { name: s.display_name, slug: s.slug, is_platform: s.is_platform } : null,
    in_stock: inStock(p),
  }
}

export type SortKey = 'relevance' | 'newest' | 'price_asc' | 'price_desc' | 'rating'
export interface BrowseQuery {
  q?: string
  kind?: ItemKind | null
  category?: string | null
  currency?: Currency | null
  min?: number | null // minor units
  max?: number | null
  rating?: number | null
  seller?: string | null // slug
  sort?: SortKey
  page?: number
  perPage?: number
}

/** Parse storefront search params (untrusted) into a BrowseQuery. Prices arrive in major units. */
export function parseBrowseParams(sp: Record<string, string | string[] | undefined>): BrowseQuery {
  const one = (k: string) => { const v = sp[k]; return (Array.isArray(v) ? v[0] : v)?.trim() || '' }
  const money = (k: string) => { const n = Number(one(k)); return one(k) && Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null }
  const kind = one('kind')
  const sort = one('sort') as SortKey
  const cur = one('currency')
  const rating = Number(one('rating'))
  return {
    q: one('q').slice(0, 100),
    kind: kind === 'digital' || kind === 'physical' || kind === 'service' ? kind : null,
    category: /^[a-z0-9-]{1,40}$/.test(one('category')) ? one('category') : null,
    currency: cur === 'INR' || cur === 'USD' ? cur : null,
    min: money('min'),
    max: money('max'),
    rating: rating >= 1 && rating <= 5 ? Math.floor(rating) : null,
    seller: /^[a-z0-9-]{1,80}$/.test(one('seller')) ? one('seller') : null,
    sort: ['relevance', 'newest', 'price_asc', 'price_desc', 'rating'].includes(sort) ? sort : 'relevance',
    page: Math.max(1, Math.min(100, Math.floor(Number(one('page')) || 1))),
  }
}

export async function browseProducts(q: BrowseQuery): Promise<{ items: ProductCard[]; total: number; page: number; pages: number }> {
  const sellers = await approvedSellers()
  const filter: Filter<ProductDoc> = { status: 'published', seller_id: { $in: [...sellers.keys()] } }
  if (q.seller) {
    const s = [...sellers.values()].find((x) => x.slug === q.seller)
    filter.seller_id = s ? s.id : '__none__'
  }
  if (q.kind) filter.kind = q.kind
  if (q.category) filter.category = q.category
  if (q.currency) filter.currency = q.currency
  if (q.min != null || q.max != null) filter.price = { ...(q.min != null ? { $gte: q.min } : {}), ...(q.max != null ? { $lte: q.max } : {}) }
  if (q.rating) filter['rating.avg'] = { $gte: q.rating }
  if (q.q) filter.$text = { $search: q.q }
  const sort: Record<string, 1 | -1 | { $meta: 'textScore' }> =
    q.sort === 'price_asc' ? { price: 1 } :
    q.sort === 'price_desc' ? { price: -1 } :
    q.sort === 'rating' ? { 'rating.avg': -1, 'rating.count': -1 } :
    q.sort === 'relevance' && q.q ? { score: { $meta: 'textScore' } } : { created_at: -1 }
  const per = q.perPage ?? 24
  const page = q.page ?? 1
  const col = await productsCol()
  const [rows, total] = await Promise.all([
    col.find(filter, { projection: { _id: 0, 'digital.file_ids': 0, ...(q.q ? { score: { $meta: 'textScore' } } : {}) } })
      .sort(sort as never).skip((page - 1) * per).limit(per).toArray(),
    col.countDocuments(filter),
  ])
  return { items: rows.map((p) => card(p, sellers)), total, page, pages: Math.max(1, Math.ceil(total / per)) }
}

export async function getProductBySlug(slug: string): Promise<{ product: PublicProduct; seller: PublicSeller; raw: ProductDoc; sellerDoc: SellerDoc } | null> {
  if (!/^[a-z0-9-]{1,120}$/i.test(slug)) return null
  const p = await (await productsCol()).findOne({ slug, status: 'published' }, { projection: { _id: 0 } })
  if (!p) return null
  const s = (await approvedSellers()).get(p.seller_id)
  if (!s) return null
  return { product: toPublicProduct(p), seller: toPublicSeller(s), raw: p, sellerDoc: s }
}

/** Server-side product lookup for cart/checkout (published + approved seller), full doc. */
export async function loadSellableProducts(ids: string[]): Promise<Map<string, { product: ProductDoc; seller: SellerDoc }>> {
  const uniq = [...new Set(ids)].slice(0, 100)
  const out = new Map<string, { product: ProductDoc; seller: SellerDoc }>()
  if (!uniq.length) return out
  const rows = await (await productsCol()).find({ id: { $in: uniq }, status: 'published' }, { projection: { _id: 0 } }).toArray()
  const sellerIds = [...new Set(rows.map((r) => r.seller_id))]
  const sellers = await (await sellersCol()).find({ id: { $in: sellerIds }, status: 'approved' }, { projection: { _id: 0, kyc_secret: 0, payout_secret: 0 } }).toArray()
  const sm = new Map(sellers.map((s) => [s.id, s]))
  for (const p of rows) { const s = sm.get(p.seller_id); if (s) out.set(p.id, { product: p, seller: s }) }
  return out
}

export async function getSellerBySlug(slug: string): Promise<PublicSeller | null> {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return null
  const s = [...(await approvedSellers()).values()].find((x) => x.slug === slug)
  return s ? toPublicSeller(s) : null
}

export async function relatedProducts(p: Pick<ProductDoc, 'id' | 'category' | 'seller_id'>, limit = 4): Promise<ProductCard[]> {
  const sellers = await approvedSellers()
  const rows = await (await productsCol())
    .find({ status: 'published', id: { $ne: p.id }, seller_id: { $in: [...sellers.keys()] }, $or: [{ category: p.category }, { seller_id: p.seller_id }] }, { projection: { _id: 0, 'digital.file_ids': 0 } })
    .sort({ 'rating.avg': -1, created_at: -1 }).limit(limit).toArray()
  return rows.map((r) => card(r, sellers))
}

export interface PublicReview { id: string; rating: number; title?: string; body?: string; author: string; created_at: string }

export async function productReviews(productId: string, limit = 20): Promise<PublicReview[]> {
  const rows = await (await reviewsCol()).find({ product_id: productId, status: 'published' }, { projection: { _id: 0 } }).sort({ created_at: -1 }).limit(limit).toArray()
  if (!rows.length) return []
  const { getMongoDb } = await import('@/lib/mongodb')
  const users = await (await getMongoDb()).collection('user')
    .find({ $or: [{ id: { $in: rows.map((r) => r.user_id) } }, { _id: { $in: rows.map((r) => r.user_id) } }] } as never, { projection: { _id: 1, id: 1, name: 1, fullName: 1 } }).toArray()
  const names = new Map(users.map((u) => [String(u.id || u._id), String(u.fullName || u.name || '').trim()]))
  // First name + initial only — no full names or emails on public pages.
  const short = (n: string) => { const [a, b] = n.split(/\s+/); return a ? `${a}${b ? ` ${b[0]}.` : ''}` : 'Verified buyer' }
  return rows.map((r) => ({ id: r.id, rating: r.rating, title: r.title, body: r.body, author: short(names.get(r.user_id) || ''), created_at: r.created_at }))
}
