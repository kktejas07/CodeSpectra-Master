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

const SETTINGS = [
  {
    href: '/dashboard/hiring/settings/screening',
    title: 'Bot screening',
    description: 'Providers, regional numbers, messages and timing for automated candidate screening.',
    icon: MessageSquareText,
  },
  {
    href: '/dashboard/hiring/settings/bgv',
    title: 'Background checks',
    description: 'Region checklists, consent texts, vendors and retention for background verification.',
    icon: ShieldCheck,
  },
  {
    href: '/dashboard/hiring/settings/integrations',
    title: 'Integrations',
    description: 'Connect the meeting apps your team interviews on.',
    icon: PlugZap,
  },
] as const

function Cards() {
  // Keep the superadmin ?tenant= scope when moving into a settings screen.
  const tenant = useSearchParams().get('tenant')
  const suffix = tenant ? `?tenant=${encodeURIComponent(tenant)}` : ''
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {SETTINGS.map(({ href, title, description, icon: Icon }) => (
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
  return (
    <HiringShell title="Hiring settings" description="Choose what to set up for your hiring team." icon={<Settings />}>
      <Suspense fallback={<LoadingRows rows={3} />}>
        <Cards />
      </Suspense>
    </HiringShell>
  )
}
