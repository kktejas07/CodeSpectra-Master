import type { Metadata } from 'next'
import Link from 'next/link'
import { Search, SlidersHorizontal } from 'lucide-react'
import { PublicPageWrapper } from '@/app/public-layout'
import { HeroIllustration, PageHero } from '@/components/landing/page-hero'
import { EmptyState } from '@/components/ui/empty-state'
import { ProductCard, type ProductCardLabels } from '@/components/marketplace/product-card'
import { CartDrawerButton } from '@/components/marketplace/cart-drawer'
import { buildMetadata } from '@/lib/seo/metadata'
import { STORE_CATEGORIES, browseProducts, parseBrowseParams, type BrowseQuery } from '@/lib/marketplace/catalog'
import type { Locale } from '@/lib/i18n/config'
import { localizedPath } from '@/lib/i18n/public-paths'
import { publicT, type PublicTranslator } from '@/lib/i18n/public-server'

// Marketplace browse for every language (English: app/marketplace/page.tsx,
// hi / te: app/[lang]/marketplace). Listings stay as sellers wrote them.

export type SP = Promise<Record<string, string | string[] | undefined>>
const catName = (t: PublicTranslator, c: { id: string; label: string }) => t.dyn(`hubs.storeCat:${c.id}`, c.label)
const cardLabels = (t: PublicTranslator): ProductCardLabels | undefined => t.locale === 'en' ? undefined : {
  kind: { physical: t('hubs.storeShips'), digital: t('hubs.storeInstant'), service: t('hubs.storeBook') },
  soldOut: t('hubs.storeSoldOut'),
  by: (name) => t('public.byName', { name }),
  stars: (value) => t('hubs.storeStars', { value }),
}

/**
 * Hub and per-category pages (?category=x alone) are indexable with their own
 * canonical; search, sort, price, rating, kind, seller and page variants are
 * noindex,follow (SEO-021) so crawl budget goes to items.
 */
export async function marketplaceMetadata(searchParams: SP, locale: Locale): Promise<Metadata> {
  const t = publicT(locale)
  const q = parseBrowseParams(await searchParams)
  const cat = q.category ? STORE_CATEGORIES.find((c) => c.id === q.category) : null
  const variant = !!(q.q || q.kind || q.currency || q.min != null || q.max != null || q.rating || q.seller || (q.sort && q.sort !== 'relevance') || (q.page && q.page > 1))
  if (cat) {
    return buildMetadata({
      title: t('hubs.storeCatMetaTitle', { category: catName(t, cat) }),
      description: t('hubs.storeCatMetaDescription', { category: locale === 'en' ? cat.label.toLowerCase() : catName(t, cat) }),
      path: '/marketplace',
      locale,
      canonical: `/marketplace?category=${encodeURIComponent(cat.id)}`,
      kind: 'product',
      noIndex: variant ? 'follow' : false,
    })
  }
  return buildMetadata({
    title: t('hubs.storeMetaTitle'),
    description: t('hubs.storeMetaDescription'),
    path: '/marketplace',
    locale,
    kind: 'product',
    noIndex: variant || q.category ? 'follow' : false,
  })
}

const SORTS = [
  { id: 'relevance', label: 'hubs.sortRelevance' },
  { id: 'newest', label: 'hubs.sortNewest' },
  { id: 'price_asc', label: 'hubs.sortPriceLow' },
  { id: 'price_desc', label: 'hubs.sortPriceHigh' },
  { id: 'rating', label: 'hubs.sortTopRated' },
] as const

function href(root: string, q: BrowseQuery, patch: Partial<BrowseQuery>): string {
  const n = { ...q, ...patch }
  const p = new URLSearchParams()
  if (n.q) p.set('q', n.q)
  if (n.kind) p.set('kind', n.kind)
  if (n.category) p.set('category', n.category)
  if (n.currency) p.set('currency', n.currency)
  if (n.min != null) p.set('min', String(n.min / 100))
  if (n.max != null) p.set('max', String(n.max / 100))
  if (n.rating) p.set('rating', String(n.rating))
  if (n.seller) p.set('seller', n.seller)
  if (n.sort && n.sort !== 'relevance') p.set('sort', n.sort)
  if (n.page && n.page > 1) p.set('page', String(n.page))
  const s = p.toString()
  return s ? `${root}?${s}` : root
}

const field = 'h-11 w-full rounded-xl border border-cs-grid bg-cs-sheet px-3 text-sm text-cs-ink outline-none focus:border-cs-accent/50 focus:ring-2 focus:ring-cs-accent/30'

export async function MarketplaceView({ searchParams, locale }: { searchParams: SP; locale: Locale }) {
  const t = publicT(locale)
  const root = localizedPath('/marketplace', locale)
  const q = parseBrowseParams(await searchParams)
  let result: Awaited<ReturnType<typeof browseProducts>> = { items: [], total: 0, page: 1, pages: 1 }
  let failed = false
  try { result = await browseProducts(q) } catch (e) { failed = true; console.error('[marketplace] browse failed', (e as Error)?.message) }
  const filtered = !!(q.q || q.kind || q.category || q.currency || q.min != null || q.max != null || q.rating || q.seller)

  return (
    <PublicPageWrapper>
      <PageHero
        title={t('public.navMarketplace')}
        lead={t('hubs.storeLead')}
        actions={
          <form action={root} role="search" className="flex w-full max-w-xl gap-2">
            <label className="relative block flex-1">
              <span className="sr-only">{t('hubs.storeSearch')}</span>
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-cs-ink-soft" aria-hidden />
              <input type="search" name="q" defaultValue={q.q} placeholder={t('hubs.storeSearchPlaceholder')} className="h-12 w-full rounded-full border border-cs-grid bg-cs-sheet pl-11 pr-4 text-sm text-cs-ink outline-none placeholder:text-cs-ink-soft/70 focus:border-cs-accent/50 focus:ring-2 focus:ring-cs-accent/30" />
            </label>
            <CartDrawerButton className="h-12" />
          </form>
        }
        art={<HeroIllustration spot="courses" />}
      />
      <div className="mx-auto w-full min-w-0 max-w-[1200px] px-4 py-10 sm:px-6 lg:px-8">
        <nav aria-label={t('hubs.storeCategories')} className="mb-8 flex flex-wrap gap-2">
          <Chip href={href(root, q, { category: null, kind: null, page: 1 })} active={!q.category && !q.kind} label={t('hubs.all')} />
          {STORE_CATEGORIES.map((c) => <Chip key={c.id} href={href(root, q, { category: c.id, kind: null, page: 1 })} active={q.category === c.id} label={catName(t, c)} />)}
        </nav>

        <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
          <aside aria-label={t('hubs.filters')}>
            <details className="group rounded-3xl border border-cs-grid bg-cs-sheet p-5 lg:open:block" open>
              <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-cs-ink"><SlidersHorizontal className="h-4 w-4" aria-hidden />{t('hubs.filters')}</summary>
              <form action={root} className="mt-4 space-y-4">
                {q.q && <input type="hidden" name="q" value={q.q} />}
                {q.category && <input type="hidden" name="category" value={q.category} />}
                <label className="block space-y-1.5 text-sm"><span className="font-medium text-cs-ink">{t('hubs.storeType')}</span>
                  <select name="kind" defaultValue={q.kind ?? ''} className={field}>
                    <option value="">{t('hubs.any')}</option><option value="digital">{t('hubs.storeDigital')}</option><option value="physical">{t('hubs.storePhysical')}</option><option value="service">{t('hubs.storeService')}</option>
                  </select>
                </label>
                <label className="block space-y-1.5 text-sm"><span className="font-medium text-cs-ink">{t('hubs.storeCurrency')}</span>
                  <select name="currency" defaultValue={q.currency ?? ''} className={field}>
                    <option value="">{t('hubs.any')}</option><option value="INR">INR (₹)</option><option value="USD">USD ($)</option>
                  </select>
                </label>
                <fieldset className="space-y-1.5 text-sm"><legend className="font-medium text-cs-ink">{t('hubs.storePrice')}</legend>
                  <div className="flex gap-2">
                    <label className="flex-1"><span className="sr-only">{t('hubs.storeMinPrice')}</span><input name="min" type="number" min={0} step="1" inputMode="decimal" defaultValue={q.min != null ? q.min / 100 : ''} placeholder={t('hubs.storeMin')} className={field} /></label>
                    <label className="flex-1"><span className="sr-only">{t('hubs.storeMaxPrice')}</span><input name="max" type="number" min={0} step="1" inputMode="decimal" defaultValue={q.max != null ? q.max / 100 : ''} placeholder={t('hubs.storeMax')} className={field} /></label>
                  </div>
                </fieldset>
                <label className="block space-y-1.5 text-sm"><span className="font-medium text-cs-ink">{t('hubs.storeRating')}</span>
                  <select name="rating" defaultValue={q.rating ? String(q.rating) : ''} className={field}>
                    <option value="">{t('hubs.any')}</option><option value="4">{t('hubs.starsUp', { count: 4 })}</option><option value="3">{t('hubs.starsUp', { count: 3 })}</option>
                  </select>
                </label>
                <label className="block space-y-1.5 text-sm"><span className="font-medium text-cs-ink">{t('hubs.storeSeller')}</span>
                  <input name="seller" defaultValue={q.seller ?? ''} placeholder={t('hubs.storeSellerHandle')} pattern="[a-z0-9-]*" className={field} />
                </label>
                <label className="block space-y-1.5 text-sm"><span className="font-medium text-cs-ink">{t('hubs.sortBy')}</span>
                  <select name="sort" defaultValue={q.sort} className={field}>
                    {SORTS.map((s) => <option key={s.id} value={s.id}>{t(s.label)}</option>)}
                  </select>
                </label>
                <div className="flex gap-2">
                  <button type="submit" className="inline-flex h-11 flex-1 items-center justify-center rounded-full bg-cs-accent text-sm font-semibold text-cs-accent-ink hover:brightness-110">{t('hubs.apply')}</button>
                  {filtered && <Link href={root} className="inline-flex h-11 items-center justify-center rounded-full border border-cs-grid px-4 text-sm font-semibold text-cs-ink">{t('hubs.reset')}</Link>}
                </div>
              </form>
            </details>
          </aside>

          <section aria-label={t('hubs.storeProducts')} className="min-w-0">
            <p className="mb-4 text-sm text-cs-ink-soft" aria-live="polite">{t('hubs.storeItems', { count: result.total })}</p>
            {failed ? (
              <EmptyState illustration="error" title={t('hubs.storeLoadFailed')} description={t('hubs.storeLoadFailedBody')} />
            ) : result.items.length === 0 ? (
              <EmptyState variant={filtered ? 'search' : 'default'} title={filtered ? t('hubs.storeNoMatch') : t('hubs.storeEmpty')} description={filtered ? t('hubs.storeNoMatchBody') : t('hubs.storeEmptyBody')} actionLabel={filtered ? t('hubs.clearFilters') : undefined} actionHref={filtered ? root : undefined} />
            ) : (
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {result.items.map((p) => <ProductCard key={p.id} p={p} labels={cardLabels(t)} />)}
              </div>
            )}
            {result.pages > 1 && (
              <nav aria-label={t('hubs.pages')} className="mt-10 flex items-center justify-center gap-3 text-sm">
                {result.page > 1 && <Link href={href(root, q, { page: result.page - 1 })} className="rounded-full border border-cs-grid px-4 py-2 font-semibold text-cs-ink hover:border-cs-accent">{t('common.previous')}</Link>}
                <span className="tabular-nums text-cs-ink-soft">{t('hubs.pageOf', { page: result.page, pages: result.pages })}</span>
                {result.page < result.pages && <Link href={href(root, q, { page: result.page + 1 })} className="rounded-full border border-cs-grid px-4 py-2 font-semibold text-cs-ink hover:border-cs-accent">{t('common.next')}</Link>}
              </nav>
            )}
          </section>
        </div>
      </div>
    </PublicPageWrapper>
  )
}

function Chip({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link href={href} aria-current={active ? 'page' : undefined} className={`inline-flex min-h-9 items-center rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors duration-200 ${active ? 'border-cs-accent bg-cs-accent text-cs-accent-ink' : 'border-cs-grid bg-cs-sheet text-cs-ink-soft hover:border-cs-accent/40 hover:text-cs-ink'}`}>
      {label}
    </Link>
  )
}
