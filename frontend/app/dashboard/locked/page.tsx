import type { Metadata } from 'next'
import { EmptyState } from '@/components/ui/empty-state'
import { resolveRouteAccess } from '@/lib/page-access-map'

/**
 * Branded "can't open this page" screen. proxy.ts rewrites a denied page
 * request here (the address bar keeps the original URL), with
 * `reason` = locked | forbidden | plan | unavailable and `from` = that URL.
 */
export const metadata: Metadata = { title: 'Page unavailable' }

type Reason = 'locked' | 'forbidden' | 'plan' | 'unavailable'

function one(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? ''
}

/** Only same-site app paths; anything else falls back to the dashboard. */
function safePath(v: string): string {
  return v.startsWith('/') && !v.startsWith('//') && !v.includes('\\') ? v : '/dashboard'
}

export default async function LockedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const raw = one(params.reason)
  const reason: Reason = raw === 'forbidden' || raw === 'plan' || raw === 'unavailable' ? raw : 'locked'
  const from = safePath(one(params.from))
  const label = from !== '/dashboard' ? resolveRouteAccess(from)?.label : undefined
  const page = label && !label.startsWith('/') ? label : 'this page'

  const copy: Record<Reason, { title: string; description: string; actionLabel: string; actionHref: string }> = {
    locked: {
      title: 'This page isn’t available yet',
      description: `The CodeSpectra team has switched ${page} off for now. Check back soon.`,
      actionLabel: 'Back to dashboard',
      actionHref: '/dashboard',
    },
    forbidden: {
      title: 'You don’t have access to this page',
      description: `Your account can’t open ${page}. If you need it, ask your organisation admin.`,
      actionLabel: 'Back to dashboard',
      actionHref: '/dashboard',
    },
    plan: {
      title: `Upgrade to use ${page}`,
      description: 'Your current plan doesn’t include this. Pick a plan that does to unlock it.',
      actionLabel: 'See plans',
      actionHref: '/dashboard/pricing',
    },
    unavailable: {
      title: 'We couldn’t check your access',
      description: 'Something went wrong on our side. Try again in a moment.',
      actionLabel: 'Try again',
      actionHref: from,
    },
  }
  const c = copy[reason]

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <EmptyState
        illustration="locked"
        title={c.title}
        description={c.description}
        actionLabel={c.actionLabel}
        actionHref={c.actionHref}
        className="max-w-2xl"
      />
    </div>
  )
}
