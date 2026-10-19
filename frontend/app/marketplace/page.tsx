import type { Metadata } from 'next'
import Link from 'next/link'
import { Search, SlidersHorizontal } from 'lucide-react'
import { PublicPageWrapper } from '@/app/public-layout'
import { HeroIllustration, PageHero } from '@/components/landing/page-hero'
import { EmptyState } from '@/components/ui/empty-state'
import { ProductCard } from '@/components/marketplace/product-card'
import { CartDrawerButton } from '@/components/marketplace/cart-drawer'
import { STORE_CATEGORIES, browseProducts, parseBrowseParams, type BrowseQuery } from '@/lib/marketplace/catalog'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Marketplace — books, courses, mentoring and mock interviews | CodeSpectra',
  description: 'Buy books, courses, e-books, templates and merch, or book mentoring and mock interviews with CodeSpectra and approved sellers.',
  alternates: { canonical: '/marketplace' },
  openGraph: { title: 'CodeSpectra marketplace', description: 'Books, courses, e-books, templates, merch, mentoring and mock interviews.', url: '/marketplace', type: 'website' },
}

const SORTS = [
  { id: 'relevance', label: 'Best match' },
  { id: 'newest', label: 'Newest' },
  { id: 'price_asc', label: 'Price: low to high' },
  { id: 'price_desc', label: 'Price: high to low' },
  { id: 'rating', label: 'Top rated' },
]

function href(q: BrowseQuery, patch: Partial<BrowseQuery>): string {
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
  return s ? `/marketplace?${s}` : '/marketplace'
}

const field = 'h-11 w-full rounded-xl border border-cs-grid bg-cs-sheet px-3 text-sm text-cs-ink outline-none focus:border-cs-accent/50 focus:ring-2 focus:ring-cs-accent/30'

export default async function MarketplacePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = parseBrowseParams(await searchParams)
  let result: Awaited<ReturnType<typeof browseProducts>> = { items: [], total: 0, page: 1, pages: 1 }
  let failed = false
  try { result = await browseProducts(q) } catch (e) { failed = true; console.error('[marketplace] browse failed', (e as Error)?.message) }
  const filtered = !!(q.q || q.kind || q.category || q.currency || q.min != null || q.max != null || q.rating || q.seller)

  return (
    <PublicPageWrapper>
      <PageHero
        title="Marketplace"
        lead="Books, courses, e-books and templates, merch — and time with mentors and mock interviewers. Sold by CodeSpectra and approved sellers."
        actions={
          <form action="/marketplace" role="search" className="flex w-full max-w-xl gap-2">
            <label className="relative block flex-1">
              <span className="sr-only">Search the marketplace</span>
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-cs-ink-soft" aria-hidden />
              <input type="search" name="q" defaultValue={q.q} placeholder="Search books, courses, mentors…" className="h-12 w-full rounded-full border border-cs-grid bg-cs-sheet pl-11 pr-4 text-sm text-cs-ink outline-none placeholder:text-cs-ink-soft/70 focus:border-cs-accent/50 focus:ring-2 focus:ring-cs-accent/30" />
            </label>
            <CartDrawerButton className="h-12" />
          </form>
        }
        art={<HeroIllustration spot="courses" />}
      />
      <div className="mx-auto w-full min-w-0 max-w-[1200px] px-4 py-10 sm:px-6 lg:px-8">
        <nav aria-label="Categories" className="mb-8 flex flex-wrap gap-2">
          <Chip href={href(q, { category: null, kind: null, page: 1 })} active={!q.category && !q.kind} label="All" />
          {STORE_CATEGORIES.map((c) => <Chip key={c.id} href={href(q, { category: c.id, kind: null, page: 1 })} active={q.category === c.id} label={c.label} />)}
        </nav>

        <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
          <aside aria-label="Filters">
            <details className="group rounded-3xl border border-cs-grid bg-cs-sheet p-5 lg:open:block" open>
              <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-cs-ink"><SlidersHorizontal className="h-4 w-4" aria-hidden />Filters</summary>
              <form action="/marketplace" className="mt-4 space-y-4">
                {q.q && <input type="hidden" name="q" value={q.q} />}
                {q.category && <input type="hidden" name="category" value={q.category} />}
                <label className="block space-y-1.5 text-sm"><span className="font-medium text-cs-ink">Type</span>
                  <select name="kind" defaultValue={q.kind ?? ''} className={field}>
                    <option value="">Any</option><option value="digital">Digital (download)</option><option value="physical">Physical (shipped)</option><option value="service">Service (booked)</option>
                  </select>
                </label>
                <label className="block space-y-1.5 text-sm"><span className="font-medium text-cs-ink">Currency</span>
                  <select name="currency" defaultValue={q.currency ?? ''} className={field}>
                    <option value="">Any</option><option value="INR">INR (₹)</option><option value="USD">USD ($)</option>
                  </select>
                </label>
                <fieldset className="space-y-1.5 text-sm"><legend className="font-medium text-cs-ink">Price</legend>
                  <div className="flex gap-2">
                    <label className="flex-1"><span className="sr-only">Minimum price</span><input name="min" type="number" min={0} step="1" inputMode="decimal" defaultValue={q.min != null ? q.min / 100 : ''} placeholder="Min" className={field} /></label>
                    <label className="flex-1"><span className="sr-only">Maximum price</span><input name="max" type="number" min={0} step="1" inputMode="decimal" defaultValue={q.max != null ? q.max / 100 : ''} placeholder="Max" className={field} /></label>
                  </div>
                </fieldset>
                <label className="block space-y-1.5 text-sm"><span className="font-medium text-cs-ink">Rating</span>
                  <select name="rating" defaultValue={q.rating ? String(q.rating) : ''} className={field}>
                    <option value="">Any</option><option value="4">4 stars and up</option><option value="3">3 stars and up</option>
                  </select>
                </label>
                <label className="block space-y-1.5 text-sm"><span className="font-medium text-cs-ink">Seller</span>
                  <input name="seller" defaultValue={q.seller ?? ''} placeholder="Seller handle" pattern="[a-z0-9-]*" className={field} />
                </label>
                <label className="block space-y-1.5 text-sm"><span className="font-medium text-cs-ink">Sort by</span>
                  <select name="sort" defaultValue={q.sort} className={field}>
                    {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </label>
                <div className="flex gap-2">
                  <button type="submit" className="inline-flex h-11 flex-1 items-center justify-center rounded-full bg-cs-accent text-sm font-semibold text-cs-accent-ink hover:brightness-110">Apply</button>
                  {filtered && <Link href="/marketplace" className="inline-flex h-11 items-center justify-center rounded-full border border-cs-grid px-4 text-sm font-semibold text-cs-ink">Reset</Link>}
                </div>
              </form>
            </details>
          </aside>

          <section aria-label="Products" className="min-w-0">
            <p className="mb-4 text-sm text-cs-ink-soft" aria-live="polite"><span className="tabular-nums">{result.total}</span> item{result.total === 1 ? '' : 's'}</p>
            {failed ? (
              <EmptyState illustration="error" title="The marketplace is taking a break" description="We could not load items right now. Please refresh in a moment." />
            ) : result.items.length === 0 ? (
              <EmptyState variant={filtered ? 'search' : 'default'} title={filtered ? 'Nothing matches these filters' : 'Nothing for sale yet'} description={filtered ? 'Try fewer filters or another search term.' : 'New books, courses and sessions will show up here soon.'} actionLabel={filtered ? 'Clear filters' : undefined} actionHref={filtered ? '/marketplace' : undefined} />
            ) : (
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {result.items.map((p) => <ProductCard key={p.id} p={p} />)}
              </div>
            )}
            {result.pages > 1 && (
              <nav aria-label="Pages" className="mt-10 flex items-center justify-center gap-3 text-sm">
                {result.page > 1 && <Link href={href(q, { page: result.page - 1 })} className="rounded-full border border-cs-grid px-4 py-2 font-semibold text-cs-ink hover:border-cs-accent">Previous</Link>}
                <span className="tabular-nums text-cs-ink-soft">Page {result.page} of {result.pages}</span>
                {result.page < result.pages && <Link href={href(q, { page: result.page + 1 })} className="rounded-full border border-cs-grid px-4 py-2 font-semibold text-cs-ink hover:border-cs-accent">Next</Link>}
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
