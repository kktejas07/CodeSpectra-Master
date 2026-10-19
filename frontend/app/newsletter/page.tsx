import { formatDate } from '@/lib/format-datetime'
import Link from 'next/link'
import { PublicPageWrapper } from '@/app/public-layout'
import { emailCampaigns } from '@/lib/db/email-campaigns'
import { ArrowRight } from 'lucide-react'
import { HeroIllustration, PageHero } from '@/components/landing/page-hero'
import { EmptyState } from '@/components/ui/empty-state'
import { buildMetadata } from '@/lib/seo/metadata'
import { publicRoute } from '@/lib/seo/public-routes'

const seoRoute = publicRoute('/newsletter')!
export const metadata = buildMetadata({ title: seoRoute.title, description: seoRoute.description, path: '/newsletter' })

export const dynamic = 'force-dynamic'

/** Public newsletter archive — same chrome as marketing site (header + footer). */
export default async function NewsletterIndexPage() {
  const col = await emailCampaigns()
  const list = await col
    .find({ status: { $in: ['completed', 'sending'] } })
    .sort({ completed_at: -1, created_at: -1 })
    .limit(40)
    .project({
      id: 1,
      campaign_id: 1,
      subject: 1,
      intro: 1,
      hero_image: 1,
      completed_at: 1,
      created_at: 1,
    })
    .toArray()

  return (
    <PublicPageWrapper>
      <PageHero
        title="Newsletters"
        lead="Recent product, campus, and community updates from CodeSpectra."
        art={<HeroIllustration spot="inbox" />}
      />
      <div className="mx-auto w-full min-w-0 max-w-[1200px] px-4 py-12 sm:px-6 lg:px-8 lg:py-16">

        {list.length === 0 ? (
          <EmptyState
            variant="notifications"
            illustration="inbox"
            title="No newsletters published yet"
            description="In the meantime, the Newsroom has the latest articles."
            actionLabel="Open the Newsroom"
            actionHref="/blog"
          />
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((c) => {
              const href = `/newsletter/${c.id || c.campaign_id}`
              return (
                <li key={String(c.id || c.campaign_id)}>
                  <Link
                    href={href}
                    className="group flex h-full min-w-0 flex-col overflow-hidden rounded-3xl border border-cs-grid bg-cs-sheet shadow-[0_1px_2px_rgba(15,23,41,0.04),0_8px_24px_-12px_rgba(15,23,41,0.10)] transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-0.5 hover:border-cs-accent/40 hover:shadow-[0_18px_40px_-18px_rgba(47,91,231,0.35)] motion-reduce:hover:translate-y-0 dark:shadow-none"
                  >
                    <div className="aspect-[16/9] overflow-hidden bg-linear-to-br from-cs-accent/20 via-cs-teal/10 to-cs-cyan/20">
                      {c.hero_image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={c.hero_image}
                          alt=""
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02] motion-reduce:group-hover:scale-100"
                        />
                      ) : (
                        <div className="flex h-full items-end p-4">
                          <span className="rounded-full bg-cs-sheet/85 px-3 py-1 text-xs font-semibold text-cs-accent-text backdrop-blur">
                            Newsletter
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-1 flex-col gap-2 p-5">
                      <p className="line-clamp-2 text-lg font-bold tracking-tight text-cs-ink group-hover:text-cs-accent-text">
                        {c.subject}
                      </p>
                      {c.intro ? (
                        <p className="line-clamp-2 text-sm text-cs-ink-soft">{c.intro}</p>
                      ) : null}
                      <p className="mt-auto flex items-center justify-between pt-2 text-xs text-cs-ink-soft">
                        <span>
                          {formatDate(String(c.completed_at || c.created_at))}
                        </span>
                        <span className="inline-flex items-center gap-1 font-semibold text-cs-accent-text">
                          Read <ArrowRight className="h-3 w-3" aria-hidden />
                        </span>
                      </p>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}

        <p className="mt-10 flex flex-wrap gap-4 text-sm text-cs-ink-soft">
          <Link href="/blog" className="font-medium text-cs-accent-text hover:underline">
            ← Newsroom
          </Link>
          <Link
            href="/dashboard/notifications"
            className="font-medium text-cs-accent-text hover:underline"
          >
            Open in dashboard
          </Link>
        </p>
      </div>
    </PublicPageWrapper>
  )
}
