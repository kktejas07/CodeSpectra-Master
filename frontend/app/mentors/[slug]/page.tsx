import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BadgeCheck, Briefcase, Globe, Languages, Star } from 'lucide-react'
import { PublicPageWrapper } from '@/app/public-layout'
import { buildMetadata } from '@/lib/seo/metadata'
import { JsonLd } from '@/components/seo/json-ld'
import { breadcrumbJsonLd, mentorJsonLd, validJsonLd } from '@/lib/seo/jsonld'
import { getSiteOrigin } from '@/lib/seo/settings'
import { mentorBySlugCached } from '@/lib/mentors/public-cache'
import { OfferingBooker } from '@/components/mentors/offering-booker'
import { CartDrawerButton } from '@/components/marketplace/cart-drawer'
import { productReviews } from '@/lib/marketplace/catalog'
import { OFFERING_LABELS } from '@/lib/mentors/types'
import { SERVICE_CANCEL_HOURS } from '@/lib/marketplace/rules'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const m = await mentorBySlugCached(slug).catch(() => null)
  if (!m) return { title: 'Mentor not found', robots: { index: false } }
  return buildMetadata({
    title: `${m.display_name}: ${m.offerings.map((o) => OFFERING_LABELS[o.type].toLowerCase()).filter((v, i, a) => a.indexOf(v) === i).join(', ')}`,
    description: m.headline,
    path: `/mentors/${m.slug}`,
    kind: 'product',
    type: 'profile',
    image: m.avatar_url || undefined,
  })
}

export default async function MentorPage({ params }: Props) {
  const { slug } = await params
  const m = await mentorBySlugCached(slug)
  if (!m) notFound()
  // Verified-purchase reviews of this mentor's session types (published only).
  const reviews = (await Promise.all(m.offerings.slice(0, 6).map((o) => productReviews(o.product_id, 10).catch(() => [])))).flat()
    .sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 12)
  // SEO-036: Person + bookable sessions as Service offers.
  const site = await getSiteOrigin()
  const schema = validJsonLd([
    mentorJsonLd({
      site, path: `/mentors/${m.slug}`, name: m.display_name, headline: m.headline, image: m.avatar_url, skills: m.skills,
      sameAs: m.linkedin_url ? [m.linkedin_url] : [],
      offers: m.offerings.map((o) => ({ name: o.title, description: o.description_md, price: o.price, currency: o.currency })),
    }),
    breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'Mentors', path: '/mentors' }, { name: m.display_name, path: `/mentors/${m.slug}` }], site),
  ])
  return (
    <PublicPageWrapper>
      <JsonLd data={schema} />
      <div className="mx-auto w-full min-w-0 max-w-[1100px] px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between gap-4 text-sm">
          <Link href="/mentors" className="text-cs-ink-soft hover:text-cs-ink">← All mentors</Link>
          <CartDrawerButton />
        </div>
        <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
          <div className="min-w-0 space-y-8">
            <header className="flex flex-col gap-5 sm:flex-row sm:items-center">
              {m.avatar_url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={m.avatar_url} alt="" width={96} height={96} decoding="async" className="h-24 w-24 rounded-3xl object-cover" />
                : <span aria-hidden className="flex h-24 w-24 items-center justify-center rounded-3xl bg-cs-accent/10 text-3xl font-bold text-cs-accent-text">{m.display_name.slice(0, 1).toUpperCase()}</span>}
              <div className="min-w-0">
                <h1 className="cs-heading flex items-center gap-2 text-3xl text-cs-ink">{m.display_name}<BadgeCheck className="h-6 w-6 text-cs-accent-text" aria-label="Verified mentor" /></h1>
                <p className="mt-1 text-[15px] text-cs-ink-soft">{m.headline}</p>
                <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-cs-ink-soft">
                  {m.rating.count > 0 && <span className="inline-flex items-center gap-1 text-cs-ink"><Star className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden /><span className="tabular-nums">{m.rating.avg.toFixed(1)}</span> ({m.rating.count} review{m.rating.count === 1 ? '' : 's'})</span>}
                  <span className="inline-flex items-center gap-1"><Briefcase className="h-4 w-4" aria-hidden /><span className="tabular-nums">{m.experience_years}</span> years</span>
                  {m.sessions_completed > 0 && <span><span className="tabular-nums">{m.sessions_completed}</span> sessions</span>}
                  {m.languages.length > 0 && <span className="inline-flex items-center gap-1"><Languages className="h-4 w-4" aria-hidden />{m.languages.join(', ')}</span>}
                  {m.linkedin_url && <a href={m.linkedin_url} rel="noopener noreferrer nofollow" target="_blank" className="inline-flex items-center gap-1 underline-offset-2 hover:underline"><Globe className="h-4 w-4" aria-hidden />LinkedIn</a>}
                </p>
              </div>
            </header>
            <section aria-labelledby="about" className="rounded-3xl border border-cs-grid bg-cs-sheet p-6">
              <h2 id="about" className="text-lg font-semibold text-cs-ink">About</h2>
              <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-cs-ink-soft">{m.bio}</p>
              <div className="mt-5 flex flex-wrap gap-1.5">{m.skills.map((s) => <span key={s} className="rounded-full bg-cs-accent/10 px-2.5 py-0.5 text-xs text-cs-accent-text">{s}</span>)}</div>
              {m.companies.length > 0 && <p className="mt-4 text-sm text-cs-ink-soft">Companies: {m.companies.join(', ')}</p>}
            </section>
            <section aria-labelledby="reviews">
              <h2 id="reviews" className="mb-3 text-lg font-semibold text-cs-ink">Reviews</h2>
              {reviews.length === 0 ? <p className="text-sm text-cs-ink-soft">No reviews yet. Only learners who completed a session can leave one.</p> : (
                <ul className="space-y-3">
                  {reviews.map((r) => (
                    <li key={r.id} className="rounded-2xl border border-cs-grid bg-cs-sheet p-4">
                      <p className="flex items-center gap-1 text-sm text-cs-ink"><span className="sr-only">Rating</span>{Array.from({ length: 5 }, (_, i) => <Star key={i} className={`h-3.5 w-3.5 ${i < r.rating ? 'fill-amber-400 text-amber-400' : 'text-cs-grid'}`} aria-hidden />)}<span className="ml-1 tabular-nums">{r.rating}/5</span></p>
                      {r.title && <p className="mt-1 font-semibold text-cs-ink">{r.title}</p>}
                      {r.body && <p className="mt-1 text-sm text-cs-ink-soft">{r.body}</p>}
                      <p className="mt-2 text-xs text-cs-ink-soft">{r.author} · {new Date(r.created_at).toLocaleDateString()}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
          <aside aria-label="Book a session" className="h-fit rounded-3xl border border-cs-grid bg-cs-sheet p-6 lg:sticky lg:top-24">
            <h2 className="mb-4 text-lg font-semibold text-cs-ink">Book a session</h2>
            <OfferingBooker offerings={m.offerings} cancelHours={SERVICE_CANCEL_HOURS} />
          </aside>
        </div>
      </div>
    </PublicPageWrapper>
  )
}
