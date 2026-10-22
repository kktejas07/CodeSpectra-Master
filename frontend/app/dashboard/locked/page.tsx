import type { Metadata } from 'next'
import { EmptyState } from '@/components/ui/empty-state'
import { resolveRouteAccess } from '@/lib/page-access-map'
import { getAreaI18n } from '@/lib/i18n/area-server'

/**
 * Branded "can't open this page" screen. proxy.ts rewrites a denied page
 * request here (the address bar keeps the original URL), with
 * `reason` = locked | forbidden | plan | unavailable and `from` = that URL.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getAreaI18n()
  return { title: t('dash.metaPageUnavailable') }
}

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
  const { t } = await getAreaI18n()
  const params = await searchParams
  const raw = one(params.reason)
  const reason: Reason = raw === 'forbidden' || raw === 'plan' || raw === 'unavailable' ? raw : 'locked'
  const from = safePath(one(params.from))
  const label = from !== '/dashboard' ? resolveRouteAccess(from)?.label : undefined
  const page = label && !label.startsWith('/') ? label : 'this page'

  const copy: Record<Reason, { title: string; description: string; actionLabel: string; actionHref: string }> = {
    locked: {
      title: t('dash.thisPageIsntAvailableYet'),
      description: t('dash.theCodespectraTeamHasSwitchedPage782', { page }),
      actionLabel: t('dash.backToDashboard'),
      actionHref: '/dashboard',
    },
    forbidden: {
      title: t('dash.youDontHaveAccessToThisaeb'),
      description: t('dash.yourAccountCantOpenPageIfd1c', { page }),
      actionLabel: t('dash.backToDashboard'),
      actionHref: '/dashboard',
    },
    plan: {
      title: t('dash.upgradeToUsePage', { page }),
      description: t('dash.yourCurrentPlanDoesntIncludeThis43a'),
      actionLabel: t('dash.seePlans'),
      actionHref: '/dashboard/pricing',
    },
    unavailable: {
      title: t('dash.weCouldntCheckYourAccess'),
      description: t('dash.somethingWentWrongOnOurSide85f'),
      actionLabel: t('common.tryAgain'),
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
