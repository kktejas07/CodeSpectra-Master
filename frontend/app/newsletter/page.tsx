import { formatDate } from '@/lib/format-datetime'
import Link from 'next/link'
import { PublicPageWrapper } from '@/app/public-layout'
import { emailCampaigns } from '@/lib/db/email-campaigns'
import { Mail, ArrowRight } from 'lucide-react'

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
      <div className="w-full min-w-0 px-4 py-10 sm:px-6 lg:px-10 xl:px-12">
        <div className="mb-10 max-w-3xl">
          <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-teal-600 dark:text-teal-400">
            Updates
          </p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">Newsletters</h1>
          <p className="mt-3 text-muted-foreground">
            Recent product, campus, and community updates from CodeSpectra.
          </p>
        </div>

        {list.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">
            <Mail className="mx-auto mb-3 h-10 w-10 opacity-40" />
            <p>No newsletters published yet.</p>
          </div>
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((c) => {
              const href = `/newsletter/${c.id || c.campaign_id}`
              return (
                <li key={String(c.id || c.campaign_id)}>
                  <Link
                    href={href}
                    className="group flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card transition-colors hover:border-teal-500/40"
                  >
                    <div className="aspect-[16/9] overflow-hidden bg-linear-to-br from-teal-600/20 via-emerald-500/10 to-cyan-500/20">
                      {c.hero_image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={c.hero_image}
                          alt=""
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                        />
                      ) : (
                        <div className="flex h-full items-end p-4">
                          <span className="rounded-full bg-background/80 px-3 py-1 text-[11px] font-semibold text-teal-700 backdrop-blur dark:text-teal-300">
                            Newsletter
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-1 flex-col gap-2 p-4">
                      <p className="line-clamp-2 text-base font-semibold group-hover:text-teal-600 dark:group-hover:text-teal-400">
                        {c.subject}
                      </p>
                      {c.intro ? (
                        <p className="line-clamp-2 text-sm text-muted-foreground">{c.intro}</p>
                      ) : null}
                      <p className="mt-auto flex items-center justify-between pt-2 text-[11px] text-muted-foreground">
                        <span>
                          {formatDate(String(c.completed_at || c.created_at))}
                        </span>
                        <span className="inline-flex items-center gap-1 font-medium text-teal-600 dark:text-teal-400">
                          Read <ArrowRight className="h-3 w-3" />
                        </span>
                      </p>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}

        <p className="mt-10 flex flex-wrap gap-4 text-sm text-muted-foreground">
          <Link href="/blog" className="text-teal-600 hover:underline dark:text-teal-400">
            ← Newsroom
          </Link>
          <Link
            href="/dashboard/notifications"
            className="text-teal-600 hover:underline dark:text-teal-400"
          >
            Open in dashboard
          </Link>
        </p>
      </div>
    </PublicPageWrapper>
  )
}
