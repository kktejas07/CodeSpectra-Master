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

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ page?: string }> }

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params
  const s = await getSellerBySlug(slug).catch(() => null)
  if (!s) return { title: 'Seller not found', robots: { index: false } }
  const paged = (Number((await searchParams).page) || 1) > 1
  return buildMetadata({
    title: `${s.display_name}: seller on CodeSpectra marketplace`,
    description: s.bio || `Items sold by ${s.display_name} on the CodeSpectra marketplace.`,
    path: `/marketplace/s/${s.slug}`,
    kind: 'product',
    type: 'profile',
    image: s.logo_url || undefined,
    noIndex: paged ? 'follow' : false,
  })
}

export default async function SellerPage({ params, searchParams }: Props) {
  const { slug } = await params
  const seller = await getSellerBySlug(slug)
  if (!seller) notFound()
  const page = Math.max(1, Math.min(100, Number((await searchParams).page) || 1))
  const result = await browseProducts({ seller: seller.slug, sort: 'newest', page })
  return (
    <PublicPageWrapper>
      <div className="mx-auto w-full min-w-0 max-w-[1200px] px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between gap-4 text-sm">
          <Link href="/marketplace" className="text-cs-ink-soft hover:text-cs-ink">← Marketplace</Link>
          <CartDrawerButton />
        </div>
        <header className="mb-10 flex flex-col gap-5 rounded-3xl border border-cs-grid bg-cs-sheet p-6 sm:flex-row sm:items-center">
          {seller.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={seller.logo_url} alt="" className="h-20 w-20 rounded-2xl object-cover" />
          ) : <span className="flex h-20 w-20 items-center justify-center rounded-2xl bg-cs-accent/10 text-cs-accent-text"><Store className="h-8 w-8" aria-hidden /></span>}
          <div className="min-w-0">
            <h1 className="cs-heading text-3xl text-cs-ink">{seller.display_name}</h1>
            {seller.is_platform && <p className="mt-1 inline-flex items-center gap-1 text-sm text-cs-ink-soft"><BadgeCheck className="h-4 w-4 text-cs-accent-text" aria-hidden />Official CodeSpectra store</p>}
            {seller.bio && <p className="mt-2 max-w-[70ch] whitespace-pre-line text-[15px] leading-relaxed text-cs-ink-soft">{seller.bio}</p>}
            <p className="mt-2 text-xs text-cs-ink-soft">Selling since {new Date(seller.created_at).getUTCFullYear()} · <span className="tabular-nums">{result.total}</span> item{result.total === 1 ? '' : 's'}</p>
          </div>
        </header>
        {result.items.length === 0 ? (
          <EmptyState title="No items listed yet" description="This seller has nothing for sale right now. Browse the rest of the marketplace." actionLabel="Browse the marketplace" actionHref="/marketplace" />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{result.items.map((p) => <ProductCard key={p.id} p={p} />)}</div>
        )}
        {result.pages > 1 && (
          <nav aria-label="Pages" className="mt-10 flex items-center justify-center gap-3 text-sm">
            {page > 1 && <Link href={`/marketplace/s/${seller.slug}?page=${page - 1}`} className="rounded-full border border-cs-grid px-4 py-2 font-semibold text-cs-ink">Previous</Link>}
            <span className="tabular-nums text-cs-ink-soft">Page {page} of {result.pages}</span>
            {page < result.pages && <Link href={`/marketplace/s/${seller.slug}?page=${page + 1}`} className="rounded-full border border-cs-grid px-4 py-2 font-semibold text-cs-ink">Next</Link>}
          </nav>
        )}
      </div>
    </PublicPageWrapper>
  )
}
