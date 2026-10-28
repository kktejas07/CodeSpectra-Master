'use client'

/**
 * Hiring settings hub: the sidebar's "Settings" link (ATS admins) lands here
 * and each card opens one settings screen. Access is enforced by the hiring
 * layout and by every /api/ats route behind these pages.
 */
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { ChevronRight, MessageSquareText, PlugZap, Settings, ShieldCheck } from 'lucide-react'
import { Panel } from '@/components/app/page-kit'
import { HiringShell } from '@/components/hiring/shell'
import { LoadingRows } from '@/components/hiring/ui'
import { useT } from '@/lib/i18n/client'
import type { Translator } from '@/lib/i18n/catalog'

const SETTINGS = (t: Translator) => ([
  {
    href: '/dashboard/hiring/settings/screening',
    title: t('hiring.botScreening'),
    description: t('hiring.providersRegionalNumbersMessagesAndTimin575'),
    icon: MessageSquareText,
  },
  {
    href: '/dashboard/hiring/settings/bgv',
    title: t('hiring.backgroundChecks'),
    description: t('hiring.regionChecklistsConsentTextsVendorsAnd6df'),
    icon: ShieldCheck,
  },
  {
    href: '/dashboard/hiring/settings/integrations',
    title: t('hiring.integrations'),
    description: t('hiring.connectTheMeetingAppsYourTeamaac'),
    icon: PlugZap,
  },
] as const)

function Cards() {
  const { t } = useT()
  // Keep the superadmin ?tenant= scope when moving into a settings screen.
  const tenant = useSearchParams().get('tenant')
  const suffix = tenant ? `?tenant=${encodeURIComponent(tenant)}` : ''
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {SETTINGS(t).map(({ href, title, description, icon: Icon }) => (
        <li key={href} className="min-w-0">
          <Link
            href={`${href}${suffix}`}
            className="block h-full rounded-3xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <Panel interactive className="flex h-full items-start gap-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary" aria-hidden="true">
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2 font-semibold text-foreground">
                  {title}
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </span>
                <span className="mt-1 block text-sm text-muted-foreground">{description}</span>
              </span>
            </Panel>
          </Link>
        </li>
      ))}
    </ul>
  )
}

export default function HiringSettingsPage() {
  const { t } = useT()
  return (
    <HiringShell title={t('hiring.hiringSettings')} description={t('hiring.chooseWhatToSetUpForf16')} icon={<Settings />}>
      <Suspense fallback={<LoadingRows rows={3} />}>
        <Cards />
      </Suspense>
    </HiringShell>
  )
}
