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

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ slug: string }> }

const plain = (md: string) => md.replace(/[#*_`>[\]()!-]/g, ' ').replace(/\s+/g, ' ').trim()

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const found = await getProductBySlug(slug).catch(() => null)
  if (!found) return { title: 'Item not found', robots: { index: false } }
  const p = found.product
  return buildMetadata({
    title: p.title,
    description: plain(p.description_md) || `${p.title} on the CodeSpectra marketplace.`,
    path: `/marketplace/p/${p.slug}`,
    kind: 'product',
    image: p.images?.[0] || undefined,
    ogSubtitle: `${formatMinor(p.price, p.currency)} · ${categoryLabel(p.category)} · by ${found.seller.display_name}`,
  })
}

function deliveryText(p: PublicProduct): string {
  if (p.kind === 'digital') return 'Instant download after payment.'
  if (p.kind === 'service') return p.service ? `${p.service.duration_min}-minute ${p.service.mode === 'virtual' ? 'online' : 'in-person'} session — pick a time below.` : 'Book a time below.'
  const s = p.shipping
  if (!s) return 'Ships after payment.'
  const from = new Date(Date.now() + s.dispatch_days * 86_400_000)
  const to = new Date(from.getTime() + (p.currency === 'INR' ? 5 : 7) * 86_400_000)
  const f = (d: Date) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(d)
  return `Usually dispatched within ${s.dispatch_days} day${s.dispatch_days === 1 ? '' : 's'} from ${s.ships_from}; estimated delivery ${f(from)}–${f(to)}.${s.free_over ? ` Free shipping over ${formatMinor(s.free_over, p.currency)}.` : ''}`
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params
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
      category: categoryLabel(p.category),
      rating: p.rating ?? null,
      shipping: p.shipping ? { dispatchDays: p.shipping.dispatch_days, shipsFromCountry: p.shipping.ships_from } : null,
      isCourse: p.category === 'courses',
    }),
    breadcrumbJsonLd([
      { name: 'Home', path: '/' },
      { name: 'Marketplace', path: '/marketplace' },
      { name: categoryLabel(p.category), path: `/marketplace?category=${encodeURIComponent(p.category)}` },
      { name: p.title, path },
    ], site),
  ]
  return (
    <PublicPageWrapper>
      <JsonLd data={jsonLd} />
      <div className="mx-auto w-full min-w-0 max-w-[1200px] px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <div className="mb-6 flex items-center justify-between gap-4">
          <nav aria-label="Breadcrumb" className="min-w-0 text-sm text-cs-ink-soft">
            <ol className="flex flex-wrap items-center gap-1.5">
              <li><Link href="/marketplace" className="hover:text-cs-ink">Marketplace</Link></li>
              <li aria-hidden>/</li>
              <li><Link href={`/marketplace?category=${encodeURIComponent(p.category)}`} className="hover:text-cs-ink">{categoryLabel(p.category)}</Link></li>
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
                <span>by <Link href={`/marketplace/s/${seller.slug}`} className="font-semibold text-cs-accent-text hover:underline">{seller.display_name}</Link></span>
                {p.rating?.count ? <span className="inline-flex items-center gap-1"><Stars value={p.rating.avg} /><span className="tabular-nums">{p.rating.avg.toFixed(1)} ({p.rating.count})</span></span> : null}
              </p>
            </div>
            <BuyBox
              productId={p.id} slug={p.slug} kind={p.kind} currency={p.currency} price={p.price}
              variants={p.variants || []} stock={p.stock ?? null}
              service={p.service ? { duration_min: p.service.duration_min, timezone: p.service.timezone, mode: p.service.mode } : null}
            />
            <p className="flex items-start gap-2 rounded-2xl bg-cs-paper p-4 text-sm text-cs-ink-soft"><KindIcon className="mt-0.5 h-4 w-4 shrink-0 text-cs-accent-text" aria-hidden />{deliveryText(p)}</p>
            {p.digital && <p className="text-xs text-cs-ink-soft">{p.digital.files} file{p.digital.files === 1 ? '' : 's'}{p.digital.download_limit ? ` · up to ${p.digital.download_limit} downloads` : ''}{p.digital.license_note ? ` · ${p.digital.license_note}` : ''}</p>}
            <ShareButtons url={`${site}${path}`} title={p.title} />
          </div>
        </div>

        <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_320px]">
          <section aria-labelledby="about" className="min-w-0">
            <h2 id="about" className="mb-4 text-xl font-bold text-cs-ink">About this item</h2>
            <Description md={p.description_md} />
          </section>
          <aside aria-label="Seller" className="h-fit rounded-3xl border border-cs-grid bg-cs-sheet p-5">
            <div className="flex items-center gap-3">
              {seller.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={seller.logo_url} alt={`${seller.display_name} logo`} width={48} height={48} loading="lazy" decoding="async" className="h-12 w-12 rounded-xl object-cover" />
              ) : <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-cs-accent/10 text-cs-accent-text"><Package className="h-5 w-5" aria-hidden /></span>}
              <div className="min-w-0">
                <p className="truncate font-semibold text-cs-ink">{seller.display_name}</p>
                {seller.is_platform && <p className="inline-flex items-center gap-1 text-xs text-cs-ink-soft"><BadgeCheck className="h-3.5 w-3.5 text-cs-accent-text" aria-hidden />Sold by CodeSpectra</p>}
              </div>
            </div>
            {seller.bio && <p className="mt-3 line-clamp-4 text-sm text-cs-ink-soft">{seller.bio}</p>}
            <Link href={`/marketplace/s/${seller.slug}`} className="mt-4 inline-flex text-sm font-semibold text-cs-accent-text hover:underline">See all items from this seller</Link>
          </aside>
        </div>

        <section aria-labelledby="reviews" className="mt-12 max-w-3xl">
          <h2 id="reviews" className="mb-4 text-xl font-bold text-cs-ink">Reviews</h2>
          {reviews.length === 0 ? <p className="mb-4 text-sm text-cs-ink-soft">No reviews yet — reviews come from verified buyers only.</p> : (
            <ul className="mb-6 space-y-4">
              {reviews.map((r) => (
                <li key={r.id} className="rounded-2xl border border-cs-grid p-4">
                  <div className="flex flex-wrap items-center gap-2 text-sm"><Stars value={r.rating} /><span className="font-semibold text-cs-ink">{r.title}</span></div>
                  {r.body && <p className="mt-2 whitespace-pre-line text-sm text-cs-ink">{r.body}</p>}
                  <p className="mt-2 text-xs text-cs-ink-soft">{r.author} · verified purchase · {new Date(r.created_at).toISOString().slice(0, 10)}</p>
                </li>
              ))}
            </ul>
          )}
          <ReviewForm slug={p.slug} />
        </section>

        {related.length > 0 && (
          <section aria-labelledby="related" className="mt-14">
            <h2 id="related" className="mb-4 text-xl font-bold text-cs-ink">You may also like</h2>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{related.map((r) => <ProductCard key={r.id} p={r} />)}</div>
          </section>
        )}
      </div>
    </PublicPageWrapper>
  )
}
