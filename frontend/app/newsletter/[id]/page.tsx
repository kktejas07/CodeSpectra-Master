import type { Metadata } from 'next'
import { buildMetadata } from '@/lib/seo/metadata'
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
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const c = await emailCampaigns().then((c) => c.findOne({ $or: [{ id }, { campaign_id: id }] }, { projection: { _id: 0, subject: 1, intro: 1, status: 1, hero_image: 1, id: 1 } })).catch(() => null)
  if (!c || c.status === 'draft') return { title: 'Issue not found', robots: { index: false } }
  return buildMetadata({
    title: String(c.subject || 'Newsletter issue'),
    description: String(c.intro || 'An issue of the CodeSpectra newsletter: new Learn posts, events and product updates.').replace(/<[^>]+>/g, ' '),
    path: `/newsletter/${encodeURIComponent(id)}`,
    kind: 'article',
    type: 'article',
    image: (c.hero_image as string) || undefined,
  })
}

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
        <div className="relative isolate w-full overflow-hidden border-b border-cs-grid px-4 py-16 sm:px-6 lg:py-20">
          <div aria-hidden className="absolute -top-32 right-[-10%] -z-10 h-[420px] w-[520px] rounded-full bg-[#2f5be7]/10 blur-3xl" />
          <div className="mx-auto max-w-[1200px] lg:px-2">
            <p className="text-sm font-semibold text-cs-accent-text">Newsletter</p>
            <h1 className="cs-display mt-3 max-w-[22ch] text-4xl sm:text-5xl lg:text-6xl">
              {campaign.subject}
            </h1>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <div className="flex flex-col lg:flex-row gap-10">
          <article className="flex-1 min-w-0">
            {campaign.hero_image ? (
              <>
                <p className="text-sm font-semibold text-cs-accent-text">
                  Newsletter · {dateLabel}
                </p>
                <h1 className="cs-display mt-3 max-w-[22ch] text-4xl sm:text-5xl">{campaign.subject}</h1>
              </>
            ) : (
              <p className="text-sm text-cs-ink-soft">{dateLabel}</p>
            )}

            {campaign.intro ? (
              <p className="mt-5 max-w-[60ch] text-lg leading-relaxed text-cs-ink-soft">{campaign.intro}</p>
            ) : null}

            {safeBody ? (
              <div
                className="prose prose-zinc mt-8 max-w-[72ch] dark:prose-invert prose-headings:text-cs-ink prose-p:text-cs-ink-soft prose-li:text-cs-ink-soft prose-strong:text-cs-ink prose-a:text-cs-accent-text prose-img:rounded-2xl"
                dangerouslySetInnerHTML={{ __html: safeBody }}
              />
            ) : null}

            {campaign.cta_text && campaign.cta_url ? (
              <div className="mt-10">
                <a
                  href={campaign.cta_url}
                  className="inline-flex h-12 items-center justify-center rounded-full bg-cs-accent px-7 text-[15px] font-semibold text-cs-accent-ink shadow-lg shadow-[#2f5be7]/25 transition-[filter] hover:brightness-110"
                >
                  {campaign.cta_text}
                </a>
              </div>
            ) : null}

            <p className="mt-12 flex max-w-[72ch] flex-wrap gap-4 border-t border-cs-grid pt-6 text-sm text-cs-ink-soft">
              <Link href="/newsletter" className="font-medium text-cs-accent-text hover:underline">
                ← All newsletters
              </Link>
              <Link href="/blog" className="font-medium text-cs-accent-text hover:underline">
                Newsroom
              </Link>
              <Link
                href="/dashboard/notifications"
                className="font-medium text-cs-accent-text hover:underline"
              >
                Open in dashboard
              </Link>
            </p>
          </article>
          
          {campaign.hero_image && (
            <aside className="w-full lg:w-100 xl:w-125 shrink-0">
              <div className="sticky top-24 rounded-3xl border border-cs-grid bg-cs-sheet p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={campaign.hero_image}
                  alt={campaign.subject}
                  className="max-h-150 w-full rounded-2xl object-contain shadow-sm"
                />
              </div>
            </aside>
          )}
        </div>
      </div>
    </PublicPageWrapper>
  )
}
