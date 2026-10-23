import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BadgeCheck, Store } from 'lucide-react'
import { PublicPageWrapper } from '@/app/public-layout'
import { EmptyState } from '@/components/ui/empty-state'
import { ProductCard } from '@/components/marketplace/product-card'
import { CartDrawerButton } from '@/components/marketplace/cart-drawer'
import { browseProducts, getSellerBySlug } from '@/lib/marketplace/catalog'
import { buildMetadata } from '@/lib/seo/metadata'
import { cardLabels } from '@/app/marketplace/marketplace-view'
import type { Locale } from '@/lib/i18n/config'
import { localizedPath } from '@/lib/i18n/public-paths'
import { publicT } from '@/lib/i18n/public-server'

// One seller store for every language (English: ./page.tsx, hi / te: app/[lang]/marketplace/s/[slug]).
// SEO-047: chrome in the page language; listings as the seller wrote them (canonical: English URL).

export type SellerSP = Promise<{ page?: string }>

export async function sellerMetadata(slug: string, searchParams: SellerSP, locale: Locale): Promise<Metadata> {
  const t = publicT(locale)
  const s = await getSellerBySlug(slug).catch(() => null)
  if (!s) return { title: t('hubs.dtSellerNotFound'), robots: { index: false } }
  const paged = (Number((await searchParams).page) || 1) > 1
  return buildMetadata({
    title: t('hubs.dtSellerTitle', { name: s.display_name }),
    description: s.bio || t('hubs.dtSellerDesc', { name: s.display_name }),
    path: `/marketplace/s/${s.slug}`,
    locale,
    kind: 'product',
    type: 'profile',
    image: s.logo_url || undefined,
    noIndex: paged ? 'follow' : false,
  })
}

export async function SellerView({ slug, searchParams, locale }: { slug: string; searchParams: SellerSP; locale: Locale }) {
  const t = publicT(locale)
  const base = localizedPath(`/marketplace/s/${slug}`, locale)
  const seller = await getSellerBySlug(slug)
  if (!seller) notFound()
  const page = Math.max(1, Math.min(100, Number((await searchParams).page) || 1))
  const result = await browseProducts({ seller: seller.slug, sort: 'newest', page })
  return (
    <PublicPageWrapper>
      <div className="mx-auto w-full min-w-0 max-w-[1200px] px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between gap-4 text-sm">
          <Link href={localizedPath('/marketplace', locale)} className="text-cs-ink-soft hover:text-cs-ink">{t('hubs.dtBackMarketplace')}</Link>
          <CartDrawerButton />
        </div>
        <header className="mb-10 flex flex-col gap-5 rounded-3xl border border-cs-grid bg-cs-sheet p-6 sm:flex-row sm:items-center">
          {seller.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={seller.logo_url} alt="" width={80} height={80} decoding="async" className="h-20 w-20 rounded-2xl object-cover" />
          ) : <span className="flex h-20 w-20 items-center justify-center rounded-2xl bg-cs-accent/10 text-cs-accent-text"><Store className="h-8 w-8" aria-hidden /></span>}
          <div className="min-w-0">
            <h1 className="cs-heading text-3xl text-cs-ink">{seller.display_name}</h1>
            {seller.is_platform && <p className="mt-1 inline-flex items-center gap-1 text-sm text-cs-ink-soft"><BadgeCheck className="h-4 w-4 text-cs-accent-text" aria-hidden />{t('hubs.dtOfficialStore')}</p>}
            {seller.bio && <p className="mt-2 max-w-[70ch] whitespace-pre-line text-[15px] leading-relaxed text-cs-ink-soft">{seller.bio}</p>}
            <p className="mt-2 text-xs text-cs-ink-soft">{t('hubs.dtSellingSince', { year: new Date(seller.created_at).getUTCFullYear() })} · <span className="tabular-nums">{t('hubs.storeItems', { count: result.total })}</span></p>
          </div>
        </header>
        {result.items.length === 0 ? (
          <EmptyState title={t('hubs.dtNoItems')} description={t('hubs.dtNoItemsBody')} actionLabel={t('hubs.dtBrowseMarket')} actionHref={localizedPath('/marketplace', locale)} />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{result.items.map((p) => <ProductCard key={p.id} p={p} labels={cardLabels(t)} />)}</div>
        )}
        {result.pages > 1 && (
          <nav aria-label={t('hubs.dtPages')} className="mt-10 flex items-center justify-center gap-3 text-sm">
            {page > 1 && <Link href={`${base}?page=${page - 1}`} className="rounded-full border border-cs-grid px-4 py-2 font-semibold text-cs-ink">{t('hubs.dtPrev')}</Link>}
            <span className="tabular-nums text-cs-ink-soft">{t('hubs.dtPageOf', { page, pages: result.pages })}</span>
            {page < result.pages && <Link href={`${base}?page=${page + 1}`} className="rounded-full border border-cs-grid px-4 py-2 font-semibold text-cs-ink">{t('hubs.dtNext')}</Link>}
          </nav>
        )}
      </div>
    </PublicPageWrapper>
  )
}
