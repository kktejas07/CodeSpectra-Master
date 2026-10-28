import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BadgeCheck, CalendarClock, Download, Package, Truck } from 'lucide-react'
import { PublicPageWrapper } from '@/app/public-layout'
import { buildMetadata } from '@/lib/seo/metadata'
import { breadcrumbJsonLd, productJsonLd } from '@/lib/seo/jsonld'
import { getSiteOrigin } from '@/lib/seo/settings'
import { JsonLd } from '@/components/seo/json-ld'
import { categoryLabel, getProductBySlug, productReviews, relatedProducts, type PublicProduct } from '@/lib/marketplace/catalog'
import { formatMinor } from '@/lib/marketplace/pricing'
import { BuyBox } from '@/components/marketplace/buy-box'
import { Description, Gallery, ReviewForm, ShareButtons } from '@/components/marketplace/product-extras'
import { ProductCard, Stars } from '@/components/marketplace/product-card'
import { CartDrawerButton } from '@/components/marketplace/cart-drawer'
import { cardLabels } from '@/app/marketplace/marketplace-view'
import type { Locale } from '@/lib/i18n/config'
import { formatDate } from '@/lib/i18n/format'
import { localizedPath } from '@/lib/i18n/public-paths'
import { publicT, type PublicTranslator } from '@/lib/i18n/public-server'

// One product for every language (English: ./page.tsx, hi / te: app/[lang]/marketplace/p/[slug]).
// SEO-047: the chrome follows the page language; the listing stays as the
// seller wrote it, so /hi and /te canonicalise to the English URL.

const plain = (md: string) => md.replace(/[#*_`>[\]()!-]/g, ' ').replace(/\s+/g, ' ').trim()

const catName = (t: PublicTranslator, id: string) => t.dyn(`hubs.storeCat:${id}`, categoryLabel(id))

export async function productMetadata(slug: string, locale: Locale): Promise<Metadata> {
  const t = publicT(locale)
  const found = await getProductBySlug(slug).catch(() => null)
  if (!found) return { title: t('hubs.dtItemNotFound'), robots: { index: false } }
  const p = found.product
  return buildMetadata({
    title: p.title,
    description: plain(p.description_md) || t('hubs.dtProductDesc', { title: p.title }),
    path: `/marketplace/p/${p.slug}`,
    locale,
    kind: 'product',
    image: p.images?.[0] || undefined,
    ogSubtitle: `${formatMinor(p.price, p.currency)} · ${catName(t, p.category)} · ${t('hubs.dtBy', { seller: found.seller.display_name })}`,
  })
}

function deliveryText(p: PublicProduct, t: PublicTranslator): string {
  if (p.kind === 'digital') return t('hubs.dtDeliveryDigital')
  if (p.kind === 'service') return p.service ? t('hubs.dtDeliveryService', { minutes: p.service.duration_min, mode: t(p.service.mode === 'virtual' ? 'hubs.dtModeOnline' : 'hubs.dtModeInPerson') }) : t('hubs.dtDeliveryBook')
  const s = p.shipping
  if (!s) return t('hubs.dtDeliveryShips')
  const from = new Date(Date.now() + s.dispatch_days * 86_400_000)
  const to = new Date(from.getTime() + (p.currency === 'INR' ? 5 : 7) * 86_400_000)
  const f = (d: Date) => (t.locale === 'en' ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(d) : formatDate(t.locale, d, { day: 'numeric', month: 'short' }))
  const line = t('hubs.dtDeliveryPhysical', { count: s.dispatch_days, from: s.ships_from, start: f(from), end: f(to) })
  return s.free_over ? `${line} ${t('hubs.dtFreeShipping', { amount: formatMinor(s.free_over, p.currency) })}` : line
}

export async function ProductView({ slug, locale }: { slug: string; locale: Locale }) {
  const t = publicT(locale)
  const lp = (x: string) => localizedPath(x, locale)
  const [byBefore, byAfter] = t('hubs.dtBy', { seller: '\u0000' }).split('\u0000')
  const found = await getProductBySlug(slug)
  if (!found) notFound()
  const { product: p, seller, raw } = found
  const [reviews, related] = await Promise.all([productReviews(p.id).catch(() => []), relatedProducts(raw).catch(() => [])])
  const site = await getSiteOrigin()
  const KindIcon = p.kind === 'digital' ? Download : p.kind === 'service' ? CalendarClock : Truck
  const inStock = p.kind !== 'physical' || (p.variants?.length ? p.variants.some((v) => v.stock == null || v.stock > 0) : p.stock == null || p.stock > 0)
  const path = `/marketplace/p/${p.slug}`
  const jsonLd = [
    productJsonLd({
      site,
      path,
      kind: p.kind,
      name: p.title,
      description: plain(p.description_md).slice(0, 500),
      sku: p.variants?.[0]?.sku || p.id,
      images: p.images,
      priceMinor: p.price,
      currency: p.currency,
      inStock,
      sellerName: seller.display_name,
      sellerPath: `/marketplace/s/${seller.slug}`,
      category: catName(t, p.category),
      rating: p.rating ?? null,
      shipping: p.shipping ? { dispatchDays: p.shipping.dispatch_days, shipsFromCountry: p.shipping.ships_from } : null,
      isCourse: p.category === 'courses',
    }),
    breadcrumbJsonLd([
      { name: t('marketing.crumbHome'), path: lp('/') },
      { name: t('hubs.dtMarketplace'), path: lp('/marketplace') },
      { name: catName(t, p.category), path: `${lp('/marketplace')}?category=${encodeURIComponent(p.category)}` },
      { name: p.title, path: lp(path) },
    ], site),
  ]
  return (
    <PublicPageWrapper>
      <JsonLd data={jsonLd} />
      <div className="mx-auto w-full min-w-0 max-w-[1200px] px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <div className="mb-6 flex items-center justify-between gap-4">
          <nav aria-label={t('hubs.dtBreadcrumb')} className="min-w-0 text-sm text-cs-ink-soft">
            <ol className="flex flex-wrap items-center gap-1.5">
              <li><Link href={lp('/marketplace')} className="hover:text-cs-ink">{t('hubs.dtMarketplace')}</Link></li>
              <li aria-hidden>/</li>
              <li><Link href={`${lp('/marketplace')}?category=${encodeURIComponent(p.category)}`} className="hover:text-cs-ink">{catName(t, p.category)}</Link></li>
            </ol>
          </nav>
          <CartDrawerButton />
        </div>

        <div className="grid gap-10 lg:grid-cols-2">
          <Gallery images={p.images || []} title={p.title} />
          <div className="min-w-0 space-y-6">
            <div>
              <h1 className="cs-heading text-3xl text-cs-ink sm:text-4xl">{p.title}</h1>
              <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-cs-ink-soft">
                <span>{byBefore}<Link href={lp(`/marketplace/s/${seller.slug}`)} className="font-semibold text-cs-accent-text hover:underline">{seller.display_name}</Link>{byAfter}</span>
                {p.rating?.count ? <span className="inline-flex items-center gap-1"><Stars value={p.rating.avg} /><span className="tabular-nums">{p.rating.avg.toFixed(1)} ({p.rating.count})</span></span> : null}
              </p>
            </div>
            <BuyBox
              productId={p.id} slug={p.slug} kind={p.kind} currency={p.currency} price={p.price}
              variants={p.variants || []} stock={p.stock ?? null}
              service={p.service ? { duration_min: p.service.duration_min, timezone: p.service.timezone, mode: p.service.mode } : null}
            />
            <p className="flex items-start gap-2 rounded-2xl bg-cs-paper p-4 text-sm text-cs-ink-soft"><KindIcon className="mt-0.5 h-4 w-4 shrink-0 text-cs-accent-text" aria-hidden />{deliveryText(p, t)}</p>
            {p.digital && <p className="text-xs text-cs-ink-soft">{[t('hubs.dtFiles', { count: p.digital.files }), p.digital.download_limit ? t('hubs.dtDownloadLimit', { n: p.digital.download_limit }) : '', p.digital.license_note || ''].filter(Boolean).join(' · ')}</p>}
            <ShareButtons url={`${site}${path}`} title={p.title} />
          </div>
        </div>

        <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_320px]">
          <section aria-labelledby="about" className="min-w-0">
            <h2 id="about" className="mb-4 text-xl font-bold text-cs-ink">{t('hubs.dtAboutItem')}</h2>
            <Description md={p.description_md} />
          </section>
          <aside aria-label={t('hubs.dtSeller')} className="h-fit rounded-3xl border border-cs-grid bg-cs-sheet p-5">
            <div className="flex items-center gap-3">
              {seller.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={seller.logo_url} alt={t('hubs.dtSellerLogo', { name: seller.display_name })} width={48} height={48} loading="lazy" decoding="async" className="h-12 w-12 rounded-xl object-cover" />
              ) : <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-cs-accent/10 text-cs-accent-text"><Package className="h-5 w-5" aria-hidden /></span>}
              <div className="min-w-0">
                <p className="truncate font-semibold text-cs-ink">{seller.display_name}</p>
                {seller.is_platform && <p className="inline-flex items-center gap-1 text-xs text-cs-ink-soft"><BadgeCheck className="h-3.5 w-3.5 text-cs-accent-text" aria-hidden />{t('hubs.dtSoldByCs')}</p>}
              </div>
            </div>
            {seller.bio && <p className="mt-3 line-clamp-4 text-sm text-cs-ink-soft">{seller.bio}</p>}
            <Link href={lp(`/marketplace/s/${seller.slug}`)} className="mt-4 inline-flex text-sm font-semibold text-cs-accent-text hover:underline">{t('hubs.dtSeeAllSeller')}</Link>
          </aside>
        </div>

        <section aria-labelledby="reviews" className="mt-12 max-w-3xl">
          <h2 id="reviews" className="mb-4 text-xl font-bold text-cs-ink">{t('hubs.dtReviews')}</h2>
          {reviews.length === 0 ? <p className="mb-4 text-sm text-cs-ink-soft">{t('hubs.dtNoReviewsMarket')}</p> : (
            <ul className="mb-6 space-y-4">
              {reviews.map((r) => (
                <li key={r.id} className="rounded-2xl border border-cs-grid p-4">
                  <div className="flex flex-wrap items-center gap-2 text-sm"><Stars value={r.rating} /><span className="font-semibold text-cs-ink">{r.title}</span></div>
                  {r.body && <p className="mt-2 whitespace-pre-line text-sm text-cs-ink">{r.body}</p>}
                  <p className="mt-2 text-xs text-cs-ink-soft">{r.author} · {t('hubs.dtVerifiedPurchase')} · {locale === 'en' ? new Date(r.created_at).toISOString().slice(0, 10) : formatDate(locale, r.created_at)}</p>
                </li>
              ))}
            </ul>
          )}
          <ReviewForm slug={p.slug} />
        </section>

        {related.length > 0 && (
          <section aria-labelledby="related" className="mt-14">
            <h2 id="related" className="mb-4 text-xl font-bold text-cs-ink">{t('hubs.dtAlsoLike')}</h2>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{related.map((r) => <ProductCard key={r.id} p={r} labels={cardLabels(t)} />)}</div>
          </section>
        )}
      </div>
    </PublicPageWrapper>
  )
}
