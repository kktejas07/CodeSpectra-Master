/**
 * schema.org JSON-LD builders (pure, client-safe) + a required-field checker
 * used by tests and the admin SEO health panel. Rendered server-side with
 * <JsonLd> (components/seo/json-ld.tsx).
 *
 * Rules: never invent facts — a builder returns null when a field Google
 * requires is missing (e.g. an Event without a start date), and optional
 * fields are dropped rather than guessed.
 */
import { absoluteUrl, SITE_DESCRIPTION, SITE_NAME } from './site'
import { ogImagePath } from './metadata'

export type JsonLdObject = Record<string, unknown>

const CTX = 'https://schema.org'

/** Drop undefined / null / empty-string / empty-array values (shallow + nested objects). */
export function compact<T extends JsonLdObject>(o: T): T {
  const out: JsonLdObject = {}
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined || v === null || v === '') continue
    if (Array.isArray(v)) {
      const arr = v.filter((x) => x !== undefined && x !== null && x !== '').map((x) => (isPlain(x) ? compact(x as JsonLdObject) : x))
      if (arr.length) out[k] = arr
      continue
    }
    out[k] = isPlain(v) ? compact(v as JsonLdObject) : v
  }
  return out as T
}
const isPlain = (v: unknown) => !!v && typeof v === 'object' && !Array.isArray(v)

export const orgId = (site: string) => `${site}/#organization`
export const websiteId = (site: string) => `${site}/#website`

// ---------------------------------------------------------------------------
// Organisation / site
// ---------------------------------------------------------------------------

/** "Hyderabad, Telangana, IN" → PostalAddress. Last part is treated as the country code when 2 letters. */
export function parseLocationLine(line: string): JsonLdObject | null {
  const parts = line.split(',').map((s) => s.trim()).filter(Boolean)
  if (!parts.length) return null
  const last = parts[parts.length - 1]
  const country = /^[A-Za-z]{2}$/.test(last) ? last.toUpperCase() : undefined
  const rest = country ? parts.slice(0, -1) : parts
  return compact({ '@type': 'PostalAddress', addressLocality: rest[0], addressRegion: rest[1], addressCountry: country })
}

export function organizationJsonLd(args: {
  site: string
  name?: string
  legalName?: string
  logoUrl?: string
  sameAs?: string[]
  email?: string
  locations?: string[]
  foundingYear?: string
  description?: string
}): JsonLdObject {
  const { site } = args
  const addresses = (args.locations || []).map(parseLocationLine).filter(Boolean)
  return compact({
    '@context': CTX,
    '@type': 'Organization',
    '@id': orgId(site),
    name: args.name || SITE_NAME,
    legalName: args.legalName && args.legalName !== (args.name || SITE_NAME) ? args.legalName : undefined,
    url: site,
    logo: { '@type': 'ImageObject', url: absoluteUrl(args.logoUrl || '/logo.png', site), width: 512, height: 512 },
    description: args.description || SITE_DESCRIPTION,
    sameAs: args.sameAs,
    email: args.email,
    foundingDate: args.foundingYear,
    address: addresses.length === 1 ? addresses[0] : addresses.length ? addresses : undefined,
    contactPoint: args.email ? { '@type': 'ContactPoint', contactType: 'customer support', email: args.email, availableLanguage: ['en'] } : undefined,
  })
}

export function websiteJsonLd(site: string): JsonLdObject {
  return {
    '@context': CTX,
    '@type': 'WebSite',
    '@id': websiteId(site),
    name: SITE_NAME,
    url: site,
    inLanguage: 'en',
    publisher: { '@id': orgId(site) },
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${site}/learn?q={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  }
}

export interface Crumb { name: string; path: string }

export function breadcrumbJsonLd(items: Crumb[], site: string): JsonLdObject | null {
  const list = items.filter((c) => c.name && c.path)
  if (!list.length) return null
  return {
    '@context': CTX,
    '@type': 'BreadcrumbList',
    itemListElement: list.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: absoluteUrl(c.path, site) })),
  }
}

/** WebPage with speakable selectors (voice assistants read the answer-first summary). */
export function webPageJsonLd(args: { site: string; path: string; name: string; description: string; speakable?: string[]; type?: string; dateModified?: string }): JsonLdObject {
  return compact({
    '@context': CTX,
    '@type': args.type || 'WebPage',
    '@id': `${absoluteUrl(args.path, args.site)}#webpage`,
    url: absoluteUrl(args.path, args.site),
    name: args.name,
    description: args.description,
    isPartOf: { '@id': websiteId(args.site) },
    publisher: { '@id': orgId(args.site) },
    inLanguage: 'en',
    dateModified: args.dateModified,
    speakable: args.speakable?.length ? { '@type': 'SpeakableSpecification', cssSelector: args.speakable } : undefined,
  })
}

// ---------------------------------------------------------------------------
// Product (the platform) / FAQ / HowTo / Course
// ---------------------------------------------------------------------------

export interface PlanOffer { name: string; price: number; currency: string | null; description?: string; url?: string }

export function softwareApplicationJsonLd(args: { site: string; plans?: PlanOffer[]; description?: string }): JsonLdObject {
  const offers = (args.plans || [])
    .filter((p) => Number.isFinite(p.price) && p.price >= 0 && p.currency)
    .map((p) => compact({
      '@type': 'Offer',
      name: p.name,
      price: p.price.toFixed(2),
      priceCurrency: p.currency,
      description: p.description,
      url: absoluteUrl(p.url || '/pricing', args.site),
      category: p.price === 0 ? 'free' : 'subscription',
    }))
  return compact({
    '@context': CTX,
    '@type': 'SoftwareApplication',
    '@id': `${args.site}/#software`,
    name: SITE_NAME,
    applicationCategory: 'BusinessApplication',
    applicationSubCategory: 'Skills assessment and technical hiring',
    operatingSystem: 'Web browser',
    url: args.site,
    description: args.description || SITE_DESCRIPTION,
    publisher: { '@id': orgId(args.site) },
    offers: offers.length ? offers : { '@type': 'Offer', price: '0', priceCurrency: 'USD', category: 'free', url: absoluteUrl('/pricing', args.site) },
  })
}

export interface QA { q: string; a: string }

export function faqJsonLd(items: QA[]): JsonLdObject | null {
  const list = items.filter((x) => x.q?.trim() && x.a?.trim())
  if (!list.length) return null
  return {
    '@context': CTX,
    '@type': 'FAQPage',
    mainEntity: list.map((x) => ({ '@type': 'Question', name: x.q.trim(), acceptedAnswer: { '@type': 'Answer', text: x.a.trim() } })),
  }
}

export function howToJsonLd(args: { name: string; description?: string; steps: { name: string; text: string }[]; url?: string; site: string }): JsonLdObject | null {
  const steps = args.steps.filter((s) => s.name && s.text)
  if (steps.length < 2) return null
  return compact({
    '@context': CTX,
    '@type': 'HowTo',
    name: args.name,
    description: args.description,
    url: args.url ? absoluteUrl(args.url, args.site) : undefined,
    step: steps.map((s, i) => ({ '@type': 'HowToStep', position: i + 1, name: s.name, text: s.text })),
  })
}

export function courseJsonLd(args: { site: string; name: string; description: string; path: string; price?: number | null; currency?: string | null; image?: string | null }): JsonLdObject {
  return compact({
    '@context': CTX,
    '@type': 'Course',
    name: args.name,
    description: args.description,
    url: absoluteUrl(args.path, args.site),
    image: args.image || undefined,
    provider: { '@type': 'Organization', name: SITE_NAME, sameAs: args.site },
    offers: args.price != null && args.currency
      ? { '@type': 'Offer', category: args.price === 0 ? 'Free' : 'Paid', price: args.price.toFixed(2), priceCurrency: args.currency }
      : undefined,
    hasCourseInstance: { '@type': 'CourseInstance', courseMode: 'Online' },
  })
}

// ---------------------------------------------------------------------------
// Articles (Learn, Blog)
// ---------------------------------------------------------------------------

export function articleJsonLd(args: {
  site: string
  type?: 'TechArticle' | 'BlogPosting' | 'Article'
  path: string
  headline: string
  description: string
  datePublished?: string | null
  dateModified?: string | null
  image?: string | null
  section?: string
  keywords?: string[]
  authorName?: string
  authorUrl?: string
  citations?: string[]
  proficiencyLevel?: string
  wordCount?: number
  speakable?: string[]
}): JsonLdObject {
  const url = absoluteUrl(args.path, args.site)
  return compact({
    '@context': CTX,
    '@type': args.type || 'Article',
    headline: args.headline.slice(0, 110),
    description: args.description,
    url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    image: args.image ? [absoluteUrl(args.image, args.site)] : undefined,
    datePublished: args.datePublished || undefined,
    dateModified: args.dateModified || args.datePublished || undefined,
    articleSection: args.section,
    keywords: args.keywords?.length ? args.keywords.join(', ') : undefined,
    inLanguage: 'en',
    wordCount: args.wordCount,
    proficiencyLevel: args.proficiencyLevel,
    author: args.authorName
      ? { '@type': 'Person', name: args.authorName, url: args.authorUrl }
      : { '@type': 'Organization', '@id': orgId(args.site), name: `${SITE_NAME} editorial team`, url: absoluteUrl('/editorial-policy', args.site) },
    publisher: {
      '@type': 'Organization',
      '@id': orgId(args.site),
      name: SITE_NAME,
      logo: { '@type': 'ImageObject', url: absoluteUrl('/logo.png', args.site), width: 512, height: 512 },
    },
    citation: args.citations?.length ? args.citations : undefined,
    isPartOf: { '@id': websiteId(args.site) },
    speakable: args.speakable?.length ? { '@type': 'SpeakableSpecification', cssSelector: args.speakable } : undefined,
  })
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export interface EventInput {
  name: string
  description: string
  startsAt: string | null
  endsAt?: string | null
  mode: 'online' | 'in_person' | 'hybrid'
  url: string
  /** Page on our site (used for location url / offers url of internal events). */
  pageUrl: string
  city?: string | null
  country?: string | null
  venue?: string | null
  organiser?: string | null
  organiserUrl?: string | null
  image?: string | null
  cancelled?: boolean
  /** Registration is free (our own events / hackathons). */
  free?: boolean
  registrationDeadline?: string | null
}

const ATTENDANCE = {
  online: 'https://schema.org/OnlineEventAttendanceMode',
  in_person: 'https://schema.org/OfflineEventAttendanceMode',
  hybrid: 'https://schema.org/MixedEventAttendanceMode',
} as const

/** Event JSON-LD, or null when there is no start date (Google requires startDate). */
export function eventJsonLd(ev: EventInput, site: string): JsonLdObject | null {
  if (!ev.startsAt || Number.isNaN(Date.parse(ev.startsAt))) return null
  const virtual = { '@type': 'VirtualLocation', url: ev.url || ev.pageUrl }
  const place = compact({
    '@type': 'Place',
    name: ev.venue || [ev.city, ev.country].filter(Boolean).join(', ') || undefined,
    address: compact({ '@type': 'PostalAddress', addressLocality: ev.city || undefined, addressCountry: ev.country || undefined }),
  })
  const hasPlace = !!(ev.city || ev.country || ev.venue)
  const location = ev.mode === 'online' ? virtual : ev.mode === 'hybrid' ? (hasPlace ? [virtual, place] : virtual) : hasPlace ? place : virtual
  return compact({
    '@context': CTX,
    '@type': 'Event',
    name: ev.name,
    description: ev.description,
    startDate: ev.startsAt,
    endDate: ev.endsAt || undefined,
    eventStatus: ev.cancelled ? 'https://schema.org/EventCancelled' : 'https://schema.org/EventScheduled',
    eventAttendanceMode: ATTENDANCE[ev.mode] || ATTENDANCE.online,
    location,
    image: ev.image ? [absoluteUrl(ev.image, site)] : [absoluteUrl(ogImagePath({ title: ev.name.slice(0, 100), kind: 'event' }), site)],
    url: absoluteUrl(ev.pageUrl, site),
    organizer: ev.organiser ? compact({ '@type': 'Organization', name: ev.organiser, url: ev.organiserUrl || undefined }) : { '@id': orgId(site) },
    offers: ev.free
      ? compact({ '@type': 'Offer', price: '0', priceCurrency: 'USD', availability: 'https://schema.org/InStock', url: absoluteUrl(ev.pageUrl, site), validThrough: ev.registrationDeadline || undefined })
      : undefined,
  })
}

// ---------------------------------------------------------------------------
// Marketplace product
// ---------------------------------------------------------------------------

export function productJsonLd(args: {
  site: string
  path: string
  kind: 'digital' | 'physical' | 'service'
  name: string
  description: string
  sku: string
  images?: string[]
  priceMinor: number
  currency: string
  inStock: boolean
  sellerName: string
  sellerPath?: string
  category?: string
  rating?: { avg: number; count: number } | null
  shipping?: { dispatchDays: number; shipsFromCountry?: string | null; freeOverMinor?: number | null } | null
  isCourse?: boolean
}): JsonLdObject {
  const url = absoluteUrl(args.path, args.site)
  const offer = compact({
    '@type': 'Offer',
    url,
    price: (args.priceMinor / 100).toFixed(2),
    priceCurrency: args.currency,
    availability: args.inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
    itemCondition: args.kind === 'physical' ? 'https://schema.org/NewCondition' : undefined,
    seller: compact({ '@type': 'Organization', name: args.sellerName, url: args.sellerPath ? absoluteUrl(args.sellerPath, args.site) : undefined }),
    shippingDetails: args.kind === 'physical' && args.shipping
      ? compact({
          '@type': 'OfferShippingDetails',
          shippingDestination: args.shipping.shipsFromCountry ? { '@type': 'DefinedRegion', addressCountry: args.shipping.shipsFromCountry } : undefined,
          deliveryTime: { '@type': 'ShippingDeliveryTime', handlingTime: { '@type': 'QuantitativeValue', minValue: 0, maxValue: args.shipping.dispatchDays, unitCode: 'DAY' } },
        })
      : undefined,
  })
  // Google supports review snippets on Product, not on Service.
  const rating = args.kind !== 'service' && args.rating?.count
    ? { '@type': 'AggregateRating', ratingValue: Number(args.rating.avg.toFixed(2)), reviewCount: args.rating.count, bestRating: 5, worstRating: 1 }
    : undefined
  if (args.kind === 'service') {
    return compact({
      '@context': CTX,
      '@type': 'Service',
      name: args.name,
      description: args.description,
      url,
      image: args.images,
      provider: { '@type': 'Organization', name: args.sellerName },
      serviceType: args.category,
      offers: offer,
    })
  }
  return compact({
    '@context': CTX,
    '@type': args.isCourse ? ['Product', 'Course'] : 'Product',
    name: args.name,
    description: args.description,
    sku: args.sku,
    url,
    image: args.images,
    category: args.category,
    brand: { '@type': 'Brand', name: args.sellerName },
    ...(args.isCourse ? { provider: { '@type': 'Organization', name: args.sellerName } } : {}),
    offers: offer,
    aggregateRating: rating,
  })
}

// ---------------------------------------------------------------------------
// Jobs (Google for Jobs)
// ---------------------------------------------------------------------------

export interface JobInput {
  id: string
  title: string
  company: string | null
  location: string | null
  job_type: string | null
  experience_level?: string | null
  description: string | null
  requirements?: string | null
  benefits?: string | null
  skills?: string[]
  salary: { min: number; max: number; currency: string } | null
  created_at: string
  updated_at?: string | null
  valid_through?: string | null
  is_active: boolean
}

export function employmentType(jobType: string | null | undefined): string[] {
  const t = (jobType || '').toLowerCase()
  const out: string[] = []
  if (/full/.test(t)) out.push('FULL_TIME')
  if (/part/.test(t)) out.push('PART_TIME')
  if (/contract|freelance/.test(t)) out.push('CONTRACTOR')
  if (/intern/.test(t)) out.push('INTERN')
  if (/temp/.test(t)) out.push('TEMPORARY')
  return out.length ? out : ['OTHER']
}

const IN_CITIES = /\b(hyderabad|bengaluru|bangalore|chennai|pune|mumbai|delhi|new delhi|noida|gurgaon|gurugram|kolkata|ahmedabad|kochi|jaipur|coimbatore|vizag|visakhapatnam|indore|chandigarh|trivandrum|thiruvananthapuram|mysuru|mysore)\b/i
const US_STATE = /,\s*(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\b/
const COUNTRIES: [RegExp, string][] = [
  [/\bindia\b/i, 'IN'], [/\b(united states|usa|u\.s\.a?\.?)\b/i, 'US'], [/\b(united kingdom|uk|england)\b/i, 'GB'],
  [/\bcanada\b/i, 'CA'], [/\bgermany\b/i, 'DE'], [/\bsingapore\b/i, 'SG'], [/\b(uae|united arab emirates|dubai)\b/i, 'AE'],
  [/\baustralia\b/i, 'AU'], [/\bireland\b/i, 'IE'], [/\bnetherlands\b/i, 'NL'],
]

export interface ParsedJobLocation { remote: boolean; city: string | null; region: string | null; countries: string[] }

/** Best-effort, never guesses a country it can't see in the text. */
export function parseJobLocation(raw: string | null | undefined, jobType?: string | null): ParsedJobLocation {
  const s = (raw || '').trim()
  const remote = /\bremote\b|work from home|\bwfh\b|anywhere/i.test(`${s} ${jobType || ''}`)
  const countries = new Set<string>()
  for (const [re, cc] of COUNTRIES) if (re.test(s)) countries.add(cc)
  if (IN_CITIES.test(s)) countries.add('IN')
  const st = s.match(US_STATE)
  if (st) countries.add('US')
  const cleaned = s.replace(/\(.*?\)/g, ' ').replace(/\bremote\b|hybrid|on-?site/gi, ' ').split(/[/|;]/)[0]
  const parts = cleaned.split(',').map((x) => x.trim()).filter(Boolean)
  const city = parts[0] && !COUNTRIES.some(([re]) => re.test(parts[0])) ? parts[0] : null
  const region = st ? st[1] : parts.length > 2 ? parts[1] : null
  return { remote, city, region, countries: [...countries] }
}

const DAY = 86_400_000

/** Explicit valid_through, else 90 days after the last update; active posts roll 30 days ahead so Google keeps them. */
export function jobValidThrough(job: Pick<JobInput, 'valid_through' | 'created_at' | 'updated_at'>, now = new Date()): string {
  if (job.valid_through && !Number.isNaN(Date.parse(job.valid_through))) return new Date(job.valid_through).toISOString()
  const base = Date.parse(job.updated_at || job.created_at) || now.getTime()
  const end = Math.max(base + 90 * DAY, now.getTime() + 30 * DAY)
  return new Date(end).toISOString()
}

function jobDescriptionHtml(job: JobInput): string {
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const block = (title: string, body?: string | null) => (body?.trim() ? `<h3>${title}</h3><p>${esc(body.trim()).replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>')}</p>` : '')
  const skills = job.skills?.length ? `<h3>Skills</h3><ul>${job.skills.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : ''
  return [block('About the role', job.description), block('Requirements', job.requirements), block('Benefits', job.benefits), skills].join('') || esc(job.title)
}

export function jobPostingJsonLd(job: JobInput, site: string, now = new Date()): JsonLdObject {
  const loc = parseJobLocation(job.location, job.job_type)
  const physical = !loc.remote || loc.city
  const jobLocation = physical && (loc.city || loc.countries.length)
    ? {
        '@type': 'Place',
        address: compact({ '@type': 'PostalAddress', addressLocality: loc.city || undefined, addressRegion: loc.region || undefined, addressCountry: loc.countries[0] }),
      }
    : undefined
  const salary = job.salary && Number(job.salary.min) > 0 && job.salary.currency
    ? {
        '@type': 'MonetaryAmount',
        currency: job.salary.currency,
        value: compact({
          '@type': 'QuantitativeValue',
          minValue: Number(job.salary.min),
          maxValue: Number(job.salary.max) >= Number(job.salary.min) ? Number(job.salary.max) : undefined,
          unitText: 'YEAR',
        }),
      }
    : undefined
  return compact({
    '@context': CTX,
    '@type': 'JobPosting',
    title: job.title,
    description: jobDescriptionHtml(job),
    identifier: { '@type': 'PropertyValue', name: job.company || SITE_NAME, value: job.id },
    datePosted: new Date(job.created_at).toISOString(),
    validThrough: jobValidThrough(job, now),
    employmentType: employmentType(job.job_type),
    hiringOrganization: { '@type': 'Organization', name: job.company || SITE_NAME, ...(job.company ? {} : { sameAs: site, logo: absoluteUrl('/logo.png', site) }) },
    jobLocation,
    jobLocationType: loc.remote ? 'TELECOMMUTE' : undefined,
    // Only countries named in the posting — never assumed (the health panel flags remote posts without one).
    applicantLocationRequirements: loc.remote && loc.countries.length
      ? loc.countries.map((c) => ({ '@type': 'Country', name: c }))
      : undefined,
    baseSalary: salary,
    experienceRequirements: job.experience_level || undefined,
    skills: job.skills?.length ? job.skills.join(', ') : undefined,
    directApply: true,
    url: absoluteUrl(`/jobs/${encodeURIComponent(job.id)}`, site),
  })
}

// ---------------------------------------------------------------------------
// Validation (tests + admin health panel)
// ---------------------------------------------------------------------------

function get(o: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, k) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[k] : undefined), o)
}
const present = (v: unknown) => !(v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0))

/** Google-required (or rich-result-blocking) fields per type. */
export const REQUIRED_FIELDS: Record<string, string[]> = {
  Organization: ['name', 'url', 'logo'],
  WebSite: ['name', 'url'],
  BreadcrumbList: ['itemListElement'],
  FAQPage: ['mainEntity'],
  Article: ['headline', 'author', 'datePublished', 'image'],
  TechArticle: ['headline', 'author', 'datePublished', 'image'],
  BlogPosting: ['headline', 'author', 'datePublished', 'image'],
  Event: ['name', 'startDate', 'location'],
  Product: ['name', 'offers'],
  Service: ['name'],
  JobPosting: ['title', 'description', 'datePosted', 'validThrough', 'employmentType', 'hiringOrganization.name'],
  SoftwareApplication: ['name', 'offers', 'applicationCategory'],
  Course: ['name', 'description', 'provider'],
  HowTo: ['name', 'step'],
  WebPage: ['name', 'url'],
}

/** Returns the missing required fields ([] = valid). */
export function validateJsonLd(obj: JsonLdObject | null | undefined): string[] {
  if (!obj) return ['(missing)']
  const types = ([] as unknown[]).concat(obj['@type'] ?? []).map(String)
  if (!types.length) return ['@type']
  if (obj['@context'] !== CTX) return ['@context']
  const missing = new Set<string>()
  for (const t of types) for (const f of REQUIRED_FIELDS[t] || []) if (!present(get(obj, f))) missing.add(f)
  if (types.includes('JobPosting')) {
    const hasPlace = present(get(obj, 'jobLocation.address.addressCountry'))
    const remote = obj.jobLocationType === 'TELECOMMUTE' && present(obj.applicantLocationRequirements)
    if (!hasPlace && !remote) missing.add('jobLocation.address.addressCountry|applicantLocationRequirements')
  }
  if (types.includes('FAQPage')) {
    const qs = (obj.mainEntity as JsonLdObject[] | undefined) || []
    if (qs.some((q) => !present(q.name) || !present(get(q, 'acceptedAnswer.text')))) missing.add('mainEntity[].acceptedAnswer.text')
  }
  if (types.includes('BreadcrumbList')) {
    const items = (obj.itemListElement as JsonLdObject[] | undefined) || []
    if (items.some((i, idx) => i.position !== idx + 1 || !present(i.name) || !present(i.item))) missing.add('itemListElement[].position|name|item')
  }
  if (types.includes('Product') && present(obj.offers)) {
    const offers = ([] as unknown[]).concat(obj.offers)
    if (offers.some((o) => !present(get(o, 'price')) || !present(get(o, 'priceCurrency')))) missing.add('offers.price|priceCurrency')
  }
  return [...missing]
}
