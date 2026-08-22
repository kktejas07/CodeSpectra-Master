import Link from 'next/link'
import { emailCampaigns } from '@/lib/db/email-campaigns'

export const dynamic = 'force-dynamic'

/** Published newsletter index — fallback when a notif has type=newsletter but no campaign id. */
export default async function NewsletterIndexPage() {
  const col = await emailCampaigns()
  const list = await col
    .find({ status: { $in: ['completed', 'sending'] } })
    .sort({ completed_at: -1, created_at: -1 })
    .limit(30)
    .project({ id: 1, campaign_id: 1, subject: 1, intro: 1, completed_at: 1, created_at: 1 })
    .toArray()

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto py-12 px-4">
        <div className="mb-8 text-center">
          <Link href="/">
            <span className="bg-linear-to-br from-violet-600 to-fuchsia-500 text-white px-4 py-1.5 rounded-full text-sm font-semibold tracking-wide">
              CODESPECTRA
            </span>
          </Link>
          <h1 className="mt-6 text-3xl font-bold">Newsletters</h1>
          <p className="mt-2 text-sm text-muted-foreground">Recent updates from CodeSpectra</p>
        </div>

        {list.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">No newsletters published yet.</p>
        ) : (
          <ul className="space-y-3">
            {list.map((c) => {
              const href = `/newsletter/${c.id || c.campaign_id}`
              return (
                <li key={String(c.id || c.campaign_id)}>
                  <Link
                    href={href}
                    className="block rounded-xl border border-border bg-card p-4 hover:border-primary/40 transition-colors"
                  >
                    <p className="font-medium">{c.subject}</p>
                    {c.intro && (
                      <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{c.intro}</p>
                    )}
                    <p className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>{new Date(String(c.completed_at || c.created_at)).toLocaleDateString()}</span>
                      <span className="text-primary">Read full →</span>
                    </p>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}

        <p className="mt-8 text-center text-sm">
          <Link href="/dashboard/notifications" className="text-primary hover:underline">
            ← Back to notifications
          </Link>
        </p>
      </div>
    </div>
  )
}
