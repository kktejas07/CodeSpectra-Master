import { notFound } from 'next/navigation'
import Link from 'next/link'
import DOMPurify from 'isomorphic-dompurify'
import { emailCampaigns } from '@/lib/db/email-campaigns'

export const dynamic = 'force-dynamic'

export default async function NewsletterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const col = await emailCampaigns()
  // Match internal `id` or public `campaign_id` (older notifs / alternate ids)
  const campaign = await col.findOne({
    $or: [{ id }, { campaign_id: id }],
  })

  if (!campaign || campaign.status === 'draft') {
    notFound()
  }

  const safeBody = DOMPurify.sanitize(campaign.body || '')

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="mb-8 text-center">
          <Link href="/" className="inline-block">
            <span className="bg-gradient-to-br from-violet-600 to-fuchsia-500 text-white px-4 py-1.5 rounded-full text-sm font-semibold tracking-wide">
              CODESPECTRA
            </span>
          </Link>
        </div>

        <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
          {campaign.hero_image && (
            <div className="w-full relative h-64 sm:h-80 lg:h-96">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={campaign.hero_image}
                alt=""
                className="w-full h-full object-cover"
              />
            </div>
          )}

          <div className="p-6 sm:p-10">
            <h1 className="text-3xl font-bold tracking-tight text-foreground mb-6">
              {campaign.subject}
            </h1>

            {campaign.intro && (
              <p className="text-lg text-muted-foreground leading-relaxed mb-8">
                {campaign.intro}
              </p>
            )}

            {safeBody && (
              <div
                className="prose prose-zinc dark:prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: safeBody }}
              />
            )}

            {campaign.cta_text && campaign.cta_url && (
              <div className="mt-10">
                <a
                  href={campaign.cta_url}
                  className="inline-flex items-center justify-center rounded-lg bg-violet-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-violet-500 transition-colors"
                >
                  {campaign.cta_text}
                </a>
              </div>
            )}
          </div>
        </div>

        <p className="mt-8 text-center text-sm text-muted-foreground">
          <Link href="/dashboard/notifications" className="text-primary hover:underline">
            ← Back to notifications
          </Link>
        </p>
      </div>
    </div>
  )
}
