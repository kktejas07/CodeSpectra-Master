/**
 * Public catalogue content for the copilot:
 *  - marketplace products: published, from an approved seller (what the
 *    storefront shows); never files, stock, seller KYC or payout details.
 *  - external events (events feed): published (not hidden / archived).
 * Both are public. Anything else loads as null, so the source is removed.
 */
import type { Db } from 'mongodb'
import type { ExtractedSource } from '../types'
import { fields, isoDate, str, strList, type Doc } from './util'

const money = (minor: unknown, currency: unknown) =>
  Number.isInteger(minor) ? `${((minor as number) / 100).toFixed(2)} ${str(currency, 3)}` : ''

/** Pure. `seller` is the approved seller (null → not public). */
export function marketplaceProductSource(p: Doc, seller: Doc | null): ExtractedSource | null {
  const id = str(p.id, 200)
  if (!id || p.status !== 'published' || !seller || seller.status !== 'approved') return null
  const service = (p.service && typeof p.service === 'object' ? p.service : null) as Doc | null
  const shipping = (p.shipping && typeof p.shipping === 'object' ? p.shipping : null) as Doc | null
  const kindLabel: Record<string, string> = { physical: 'physical product (shipped)', digital: 'digital download', service: 'bookable service / session' }
  const text = [
    fields([
      ['Type', kindLabel[str(p.kind, 20)] ?? str(p.kind, 20)], ['Category', p.category], ['Sold by', seller.display_name],
      ['Price', money(p.price, p.currency)], ['Tags', strList(p.tags, 20, 40)],
      ['Session length (minutes)', service?.duration_min], ['Session mode', service?.mode === 'in_person' ? 'in person' : service ? 'online' : ''],
      ['Ships to', shipping ? strList(shipping.regions, 20, 20) : []], ['Dispatch (days)', shipping?.dispatch_days],
      ['Rating', p.rating && typeof p.rating === 'object' && Number((p.rating as Doc).count) > 0 ? `${Number((p.rating as Doc).avg).toFixed(1)} from ${Number((p.rating as Doc).count)} reviews` : ''],
    ]),
    str(p.description_md, 8000),
  ].filter(Boolean).join('\n\n')
  return {
    type: 'marketplace_product',
    source_id: id,
    tenant_id: null,
    visibility: 'public',
    title: str(p.title, 200) || 'Marketplace product',
    url: `/marketplace/p/${encodeURIComponent(str(p.slug, 200) || id)}`,
    text,
    metadata: { kind: str(p.kind, 20), seller_id: str(p.seller_id, 200) },
  }
}

/** Pure. */
export function externalEventSource(e: Doc): ExtractedSource | null {
  const id = str(e.id, 200)
  if (!id || e.status !== 'published') return null
  const loc = (e.location && typeof e.location === 'object' ? e.location : {}) as Doc
  const prize = (e.prize && typeof e.prize === 'object' ? e.prize : null) as Doc | null
  const text = [
    fields([
      ['Kind', e.kind], ['Mode', e.mode], ['Organiser', e.organiser],
      ['City', loc.city], ['Country', loc.country],
      ['Starts', isoDate(e.starts_at)], ['Ends', isoDate(e.ends_at)], ['Registration closes', isoDate(e.registration_deadline)],
      ['Prizes', prize ? str(prize.text, 200) : ''], ['Themes', strList(e.themes, 10, 40)],
    ]),
    str(e.description_summary, 2000),
  ].filter(Boolean).join('\n\n')
  return {
    type: 'external_event',
    source_id: id,
    tenant_id: null,
    visibility: 'public',
    title: str(e.title, 200) || 'Event',
    url: `/events/${encodeURIComponent(id)}`,
    text,
    metadata: { source: str(e.source, 60) },
  }
}

export async function loadMarketplaceProduct(db: Db, id: string): Promise<ExtractedSource | null> {
  const p = await db.collection('mkt_products').findOne({ id }, { projection: { _id: 0, digital: 0, variants: 0, stock: 0 } })
  if (!p) return null
  const seller = await db.collection('mkt_sellers').findOne({ id: p.seller_id }, { projection: { _id: 0, id: 1, status: 1, display_name: 1 } })
  return marketplaceProductSource(p as Doc, seller as Doc | null)
}

export async function listMarketplaceProductIds(db: Db, limit: number): Promise<string[]> {
  const sellers = await db.collection('mkt_sellers').find({ status: 'approved' }, { projection: { _id: 0, id: 1 } }).limit(5000).toArray()
  const rows = await db.collection('mkt_products').find({ status: 'published', seller_id: { $in: sellers.map((s) => s.id) } }, { projection: { _id: 0, id: 1 } }).limit(limit).toArray()
  return rows.map((r) => str(r.id, 200)).filter(Boolean)
}

export async function loadExternalEvent(db: Db, id: string): Promise<ExtractedSource | null> {
  const e = await db.collection('events_feed').findOne({ id }, { projection: { _id: 0 } })
  return e ? externalEventSource(e as Doc) : null
}

export async function listExternalEventIds(db: Db, limit: number): Promise<string[]> {
  const rows = await db.collection('events_feed').find({ status: 'published' }, { projection: { _id: 0, id: 1 } }).limit(limit).toArray()
  return rows.map((r) => str(r.id, 200)).filter(Boolean)
}
