import { formatDate } from '@/lib/format-datetime'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import DOMPurify from 'isomorphic-dompurify'
import { PublicPageWrapper } from '@/app/public-layout'
import { emailCampaigns } from '@/lib/db/email-campaigns'

export const dynamic = 'force-dynamic'

/**
 * Public newsletter reader — full site chrome (header/footer).
 * Poster/hero is full-bleed; article body stays readable width.
 * Dashboard notification inbox can deep-link here; in-app chrome stays on /dashboard/*.
 */
export default async function NewsletterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const col = await emailCampaigns()
  const campaign = await col.findOne({
    $or: [{ id }, { campaign_id: id }],
  })

  if (!campaign || campaign.status === 'draft') {
    notFound()
  }

  const safeBody = DOMPurify.sanitize(campaign.body || '', {
    ADD_TAGS: ['img'],
    ADD_ATTR: ['src', 'alt', 'width', 'height', 'style', 'class'],
  })
  const dateLabel = formatDate(String(campaign.completed_at || campaign.created_at), undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <PublicPageWrapper>
      {/* Header bar if no hero image (fallback style) */}
      {!campaign.hero_image && (
        <div className="w-full border-b border-border/60 bg-linear-to-br from-teal-700/30 via-emerald-600/10 to-cyan-700/20 px-4 py-16 sm:px-6">
          <div className="mx-auto max-w-7xl">
            <p className="text-xs font-semibold uppercase tracking-wider text-teal-300">Newsletter</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              {campaign.subject}
            </h1>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row gap-10">
          <article className="flex-1 min-w-0">
            {campaign.hero_image ? (
              <>
                <p className="text-xs font-semibold uppercase tracking-wider text-teal-600 dark:text-teal-400">
                  Newsletter · {dateLabel}
                </p>
                <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{campaign.subject}</h1>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">{dateLabel}</p>
            )}

            {campaign.intro ? (
              <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{campaign.intro}</p>
            ) : null}

            {safeBody ? (
              <div
                className="prose prose-zinc mt-8 max-w-none dark:prose-invert prose-img:rounded-xl"
                dangerouslySetInnerHTML={{ __html: safeBody }}
              />
            ) : null}

            {campaign.cta_text && campaign.cta_url ? (
              <div className="mt-10">
                <a
                  href={campaign.cta_url}
                  className="inline-flex items-center justify-center rounded-lg bg-teal-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-500"
                >
                  {campaign.cta_text}
                </a>
              </div>
            ) : null}

            <p className="mt-12 flex flex-wrap gap-4 border-t border-border pt-6 text-sm text-muted-foreground">
              <Link href="/newsletter" className="text-teal-600 hover:underline dark:text-teal-400">
                ← All newsletters
              </Link>
              <Link href="/blog" className="text-teal-600 hover:underline dark:text-teal-400">
                Newsroom
              </Link>
              <Link
                href="/dashboard/notifications"
                className="text-teal-600 hover:underline dark:text-teal-400"
              >
                Open in dashboard
              </Link>
            </p>
          </article>
          
          {campaign.hero_image && (
            <aside className="w-full lg:w-100 xl:w-125 shrink-0">
              <div className="sticky top-24 rounded-2xl border border-border/50 bg-muted/20 p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={campaign.hero_image}
                  alt={campaign.subject}
                  className="max-h-150 w-full rounded-xl object-contain shadow-sm"
                />
              </div>
            </aside>
          )}
        </div>
      </div>
    </PublicPageWrapper>
  )
}
