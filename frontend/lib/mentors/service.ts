/**
 * Mentor marketplace service: profile, availability, offerings (marketplace service products),
 * admin verification and the public directory data. Sessions (bookings) live in
 * lib/mentors/sessions.ts. All money, checkout, refunds and payouts are the marketplace's.
 */
import 'server-only'
import { newId, nowIso, productsCol, reviewsCol, bookingsCol, sellersCol, type ProductDoc, type SellerDoc } from '@/lib/marketplace/db'
import { MktError, getSettings } from '@/lib/marketplace/settings'
import { getSellerByUser, getSellerById, audit } from '@/lib/marketplace/sellers'
import { createProduct, getSellerProduct, removeProduct, submitProduct, updateProduct } from '@/lib/marketplace/listings'
import { mentorProfilesCol } from './db'
import {
  OfferingSchema, ProfileSchema, firstError, newProfileDefaults, nextMentorStatus, offeringProductPayload, offeringTypeOf,
  parseAvailability, quoteSession, aggregateRating, type MentorAction, type SessionQuote,
} from './pure'
import type { MentorProfile, MentorStatus, OfferingType, PublicMentor, PublicOffering } from './types'

const MENTOR_TAG = 'mentor'

export async function revalidateMentors(slug?: string | null): Promise<void> {
  const { revalidateMentorDirectory } = await import('./public-cache')
  await revalidateMentorDirectory(slug)
}

export async function getMentorByUser(userId: string): Promise<MentorProfile | null> {
  return (await mentorProfilesCol()).findOne({ user_id: userId }, { projection: { _id: 0 } })
}

export async function getMentorBySeller(sellerId: string): Promise<MentorProfile | null> {
  return (await mentorProfilesCol()).findOne({ seller_id: sellerId }, { projection: { _id: 0 } })
}

async function requireSeller(userId: string): Promise<SellerDoc> {
  const s = await getSellerByUser(userId)
  if (!s) throw new MktError(409, 'Apply to sell on the marketplace first — mentors are paid through a seller account.')
  if (s.status === 'suspended' || s.status === 'rejected') throw new MktError(403, 'Your seller account is not active.')
  return s
}

/** Create or update the caller's mentor profile. A new profile waits for admin verification. */
export async function saveProfile(userId: string, raw: unknown): Promise<MentorProfile> {
  const seller = await requireSeller(userId)
  const r = ProfileSchema.safeParse(raw)
  if (!r.success) throw new MktError(400, firstError(r.error))
  const v = r.data
  const col = await mentorProfilesCol()
  const now = nowIso()
  const before = await col.findOne({ user_id: userId }, { projection: { _id: 0 } })
  const fields = {
    headline: v.headline, bio: v.bio, skills: v.skills, companies: v.companies, experience_years: v.experience_years, languages: v.languages,
    linkedin_url: v.linkedin_url || null, avatar_url: v.avatar_url || seller.logo_url || null,
    display_name: seller.display_name, slug: seller.slug, updated_at: now,
  }
  if (before) {
    await col.updateOne({ id: before.id }, { $set: fields })
    if (before.status === 'verified') await revalidateMentors(before.slug)
    return { ...before, ...fields }
  }
  const doc: MentorProfile = { id: newId(), user_id: userId, seller_id: seller.id, ...fields, ...newProfileDefaults(), created_at: now }
  try {
    await col.insertOne(doc)
  } catch (e) {
    if ((e as { code?: number })?.code === 11000) throw new MktError(409, 'You already have a mentor profile.')
    throw e
  }
  const { notifyAdmins } = await import('@/lib/marketplace/seller-notify')
  await notifyAdmins('mentor.application', 'New mentor profile to verify', `${seller.display_name} wants to mentor (${v.skills.slice(0, 5).join(', ')}).`, '/dashboard/admin/mentors').catch(() => {})
  return doc
}

async function mentorOffers(sellerId: string): Promise<ProductDoc[]> {
  return (await productsCol()).find({ seller_id: sellerId, kind: 'service', tags: MENTOR_TAG, status: { $ne: 'archived' } }, { projection: { _id: 0 } }).sort({ created_at: 1 }).limit(50).toArray()
}

/**
 * Save availability + policy and copy the slot rules onto every offering. The rules are
 * validated here (same limits as lib/marketplace/listings.ts) and written straight to the
 * products: time windows are not listing content, so they never send an offering back to review.
 */
export async function saveAvailability(userId: string, raw: unknown): Promise<MentorProfile> {
  const me = await getMentorByUser(userId)
  if (!me) throw new MktError(404, 'Create your mentor profile first.')
  const p = parseAvailability(raw)
  if (!p.ok) throw new MktError(400, p.error)
  const policy = { ...me.policy, ...p.policy }
  const now = nowIso()
  await (await mentorProfilesCol()).updateOne({ id: me.id }, { $set: { availability: p.availability, policy, updated_at: now } })
  const a = p.availability
  await (await productsCol()).updateMany(
    { seller_id: me.seller_id, kind: 'service', tags: MENTOR_TAG },
    { $set: { 'service.weekly': a.weekly, 'service.timezone': a.timezone, 'service.buffer_min': a.buffer_min, 'service.max_per_day': a.max_per_day, updated_at: now } },
  )
  await revalidateMentors(me.slug)
  return { ...me, availability: a, policy }
}

export interface StudioOffering {
  id: string
  slug: string
  type: OfferingType | null
  title: string
  description_md: string
  duration_min: number
  currency: 'INR' | 'USD'
  price: number
  provider: string
  status: ProductDoc['status']
  review_note?: string | null
  quote: SessionQuote | null
}

export async function studioView(userId: string) {
  const [seller, me] = await Promise.all([getSellerByUser(userId), getMentorByUser(userId)])
  if (!seller || !me) return { seller: seller ? { status: seller.status, display_name: seller.display_name, slug: seller.slug } : null, profile: me, offerings: [] as StudioOffering[] }
  const [offers, settings] = await Promise.all([mentorOffers(seller.id), getSettings()])
  return {
    seller: { status: seller.status, display_name: seller.display_name, slug: seller.slug },
    profile: me,
    offerings: offers.map((o): StudioOffering => {
      const type = offeringTypeOf(o)
      return {
        id: o.id, slug: o.slug, type, title: o.title, description_md: o.description_md, duration_min: o.service?.duration_min ?? 60,
        currency: o.currency, price: o.price, provider: o.service?.provider || 'livekit', status: o.status, review_note: o.review_note ?? null,
        quote: type ? quoteSession(o.price, o.currency, type, seller, settings) : null,
      }
    }),
  }
}

/** Preview of what the buyer pays and the mentor earns (no write). */
export async function previewQuote(userId: string, raw: unknown): Promise<SessionQuote> {
  const seller = await requireSeller(userId)
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const price = Number(b.price)
  if (!Number.isSafeInteger(price) || price < 0) throw new MktError(400, 'Price must be a whole amount in minor units.')
  const currency = b.currency === 'USD' ? 'USD' : 'INR'
  const type = (typeof b.type === 'string' ? b.type : 'career_guidance') as OfferingType
  if (!OfferingSchema.shape.type.safeParse(type).success) throw new MktError(400, 'Unknown offering type.')
  return quoteSession(price, currency, type, seller, await getSettings())
}

export async function createOffering(userId: string, raw: unknown): Promise<ProductDoc> {
  const seller = await requireSeller(userId)
  const me = await getMentorByUser(userId)
  if (!me) throw new MktError(404, 'Create your mentor profile first.')
  if (!me.availability.weekly.length) throw new MktError(400, 'Set your weekly availability before adding a session type.')
  const r = OfferingSchema.safeParse(raw)
  if (!r.success) throw new MktError(400, firstError(r.error))
  if ((await mentorOffers(seller.id)).length >= 12) throw new MktError(409, 'Up to 12 session types per mentor.')
  const doc = await createProduct(seller, offeringProductPayload(r.data, me.availability, seller.display_name))
  // Straight into review (or published when review is off); a failed submit leaves a draft the mentor can fix.
  const submitted = await submitProduct(seller, doc.id).catch(() => doc)
  await revalidateMentors(me.slug)
  return submitted
}

export async function updateOffering(userId: string, productId: string, raw: unknown): Promise<ProductDoc> {
  const seller = await requireSeller(userId)
  const me = await getMentorByUser(userId)
  if (!me) throw new MktError(404, 'Create your mentor profile first.')
  const before = await getSellerProduct(seller.id, productId)
  if (!before.tags?.includes(MENTOR_TAG)) throw new MktError(404, 'Session type not found')
  const r = OfferingSchema.safeParse(raw)
  if (!r.success) throw new MktError(400, firstError(r.error))
  const payload = { ...offeringProductPayload(r.data, me.availability, seller.display_name), title: r.data.title || before.title }
  const saved = await updateProduct(seller, productId, payload)
  if (saved.status === 'draft') await submitProduct(seller, productId).catch(() => undefined)
  await revalidateMentors(me.slug)
  return saved
}

export async function archiveOffering(userId: string, productId: string): Promise<'deleted' | 'archived'> {
  const seller = await requireSeller(userId)
  const p = await getSellerProduct(seller.id, productId)
  if (!p.tags?.includes(MENTOR_TAG)) throw new MktError(404, 'Session type not found')
  const r = await removeProduct(seller, productId)
  const me = await getMentorBySeller(seller.id)
  await revalidateMentors(me?.slug)
  return r
}

export async function setListed(userId: string, listed: boolean): Promise<void> {
  const me = await getMentorByUser(userId)
  if (!me) throw new MktError(404, 'Create your mentor profile first.')
  await (await mentorProfilesCol()).updateOne({ id: me.id }, { $set: { listed, updated_at: nowIso() } })
  await revalidateMentors(me.slug)
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export async function listMentorsAdmin(status?: string | null) {
  const q: Record<string, unknown> = {}
  if (status && ['pending', 'verified', 'rejected', 'suspended'].includes(status)) q.status = status
  const rows = await (await mentorProfilesCol()).find(q, { projection: { _id: 0 } }).sort({ created_at: -1 }).limit(300).toArray()
  const sellers = await (await sellersCol()).find({ id: { $in: rows.map((r) => r.seller_id) } }, { projection: { _id: 0, id: 1, status: 1, kyc: 1, display_name: 1 } }).toArray()
  const sm = new Map(sellers.map((s) => [s.id, s]))
  return rows.map((r) => ({ ...r, seller_status: sm.get(r.seller_id)?.status ?? 'missing', kyc_status: sm.get(r.seller_id)?.kyc?.status ?? 'not_started' }))
}

export async function decideMentor(actorId: string, id: string, action: MentorAction, note?: string | null): Promise<MentorProfile> {
  const col = await mentorProfilesCol()
  const m = await col.findOne({ id }, { projection: { _id: 0 } })
  if (!m) throw new MktError(404, 'Mentor not found')
  const next = nextMentorStatus(m.status, action)
  if (!next) throw new MktError(409, `A ${m.status} mentor cannot be ${action === 'verify' ? 'verified' : `${action}ed`}.`)
  const cleanNote = typeof note === 'string' ? note.trim().slice(0, 1000) : null
  const r = await col.updateOne({ id, status: m.status }, { $set: { status: next as MentorStatus, review_note: cleanNote, reviewed_by: actorId, reviewed_at: nowIso(), updated_at: nowIso() } })
  if (!r.modifiedCount) throw new MktError(409, 'This mentor was just updated. Reload and try again.')
  await audit(actorId, `mentor.${action}`, m.seller_id, cleanNote, 'seller')
  const seller = await getSellerById(m.seller_id)
  if (seller) {
    const { notifySeller } = await import('@/lib/marketplace/seller-notify')
    const msg = next === 'verified' ? 'Your mentor profile is verified. Learners can now find and book you on /mentors.'
      : next === 'rejected' ? `Your mentor profile was not approved.${cleanNote ? ` Note: ${cleanNote}` : ''}`
        : `Your mentor profile is suspended.${cleanNote ? ` Note: ${cleanNote}` : ''}`
    await notifySeller(seller, 'mentor.status', 'Mentor profile update', msg, '/dashboard/mentor').catch(() => {})
  }
  await revalidateMentors(m.slug)
  return { ...m, status: next }
}

// ─── Public directory (read through lib/mentors/public-cache.ts) ─────────────

function toOffering(p: ProductDoc): PublicOffering | null {
  const type = offeringTypeOf(p)
  if (!type || !p.service) return null
  return {
    product_id: p.id, slug: p.slug, type, title: p.title, description_md: p.description_md.slice(0, 5000), duration_min: p.service.duration_min,
    currency: p.currency, price: p.price, ...(p.rating ? { rating: p.rating } : {}), mode: p.service.mode, timezone: p.service.timezone,
  }
}

/** Every listable mentor (verified, listed, approved seller, ≥1 published offering). Throws on DB error. */
export async function loadDirectory(now = Date.now()): Promise<PublicMentor[]> {
  const profiles = await (await mentorProfilesCol()).find({ status: 'verified', listed: true }, { projection: { _id: 0 } }).limit(2000).toArray()
  if (!profiles.length) return []
  const sellerIds = profiles.map((p) => p.seller_id)
  const [sellers, products, ratings, done] = await Promise.all([
    (await sellersCol()).find({ id: { $in: sellerIds }, status: 'approved' }, { projection: { _id: 0, id: 1 } }).toArray(),
    (await productsCol()).find({ seller_id: { $in: sellerIds }, kind: 'service', tags: MENTOR_TAG, status: 'published' }, { projection: { _id: 0 } }).limit(10_000).toArray(),
    (await reviewsCol()).aggregate<{ _id: string; ratings: number[] }>([{ $match: { seller_id: { $in: sellerIds }, status: 'published' } }, { $group: { _id: '$seller_id', ratings: { $push: '$rating' } } }]).toArray(),
    (await bookingsCol()).aggregate<{ _id: string; n: number }>([{ $match: { seller_id: { $in: sellerIds }, status: { $in: ['booked', 'completed'] }, end: { $lt: new Date(now).toISOString() } } }, { $group: { _id: '$seller_id', n: { $sum: 1 } } }]).toArray(),
  ])
  const approved = new Set(sellers.map((s) => s.id))
  const rm = new Map(ratings.map((r) => [r._id, aggregateRating(r.ratings.map((rating) => ({ rating })))]))
  const dm = new Map(done.map((d) => [d._id, d.n]))
  const out: PublicMentor[] = []
  for (const m of profiles) {
    if (!approved.has(m.seller_id)) continue
    const offerings = products.filter((p) => p.seller_id === m.seller_id).map(toOffering).filter((o): o is PublicOffering => !!o)
    if (!offerings.length) continue
    const from: PublicMentor['from_price'] = {}
    for (const o of offerings) if (from[o.currency] === undefined || o.price < (from[o.currency] as number)) from[o.currency] = o.price
    out.push({
      slug: m.slug, display_name: m.display_name, headline: m.headline, bio: m.bio, skills: m.skills, companies: m.companies,
      experience_years: m.experience_years, languages: m.languages, linkedin_url: m.linkedin_url ?? null, avatar_url: m.avatar_url ?? null,
      rating: rm.get(m.seller_id) ?? { avg: 0, count: 0 }, sessions_completed: dm.get(m.seller_id) ?? 0, offerings, from_price: from, timezone: m.availability.timezone,
    })
  }
  return out
}
