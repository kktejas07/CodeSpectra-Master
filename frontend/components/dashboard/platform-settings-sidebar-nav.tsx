'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  ArrowLeft,
  Building2,
  Mail,
  Sliders,
  Users,
  KeyRound,
  CreditCard,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  parsePlatformSettingsSection,
  platformSettingsHref,
  type PlatformSettingsSection,
} from '@/lib/platform-settings-nav'

const ITEMS: {
  id: PlatformSettingsSection
  label: string
  icon: typeof Building2
}[] = [
  { id: 'branding', label: 'Branding & support', icon: Building2 },
  { id: 'mail', label: 'Mail & email APIs', icon: Mail },
  { id: 'ops', label: 'Operations', icon: Sliders },
  { id: 'product', label: 'Product & access', icon: Users },
  { id: 'integrations', label: 'Integrations', icon: KeyRound },
  { id: 'payments', label: 'Payments & billing', icon: CreditCard },
]

export function PlatformSettingsSidebarNav({
  collapsed,
  homeHref,
  onNavigate,
}: {
  collapsed: boolean
  homeHref: string
  onNavigate: () => void
}) {
  const searchParams = useSearchParams()
  const current = parsePlatformSettingsSection(searchParams.get('section'))

  return (
    <div className="flex flex-col">
      <div
        className={cn(
          'border-b border-border/40 px-2 py-2',
          collapsed && 'lg:px-1'
        )}
      >
        <Link
          href={homeHref}
          onClick={onNavigate}
          className={cn(
            'flex items-center gap-2 rounded-md px-2 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground',
            collapsed && 'lg:justify-center'
          )}
        >
          <ArrowLeft className="h-4 w-4 shrink-0" />
          <span className={cn('font-medium', collapsed && 'lg:sr-only')}>Back to dashboard</span>
        </Link>
        <p
          className={cn(
            'mt-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80',
            collapsed && 'lg:sr-only'
          )}
        >
          Platform settings
        </p>
      </div>

      <div className="space-y-0.5 px-2 py-2">
        {ITEMS.map((item) => {
          const href = platformSettingsHref(item.id)
          const active = current === item.id
          const Icon = item.icon
          return (
            <Link
              key={item.id}
              href={href}
              title={item.label}
              prefetch={false}
              onClick={onNavigate}
            >
              <div
                className={cn(
                  'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-all',
                  collapsed && 'lg:justify-center lg:px-2',
                  active
                    ? 'bg-primary/10 font-medium text-primary'
                    : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                )}
              >
                <Icon className="h-4 w-4 shrink-0 opacity-90" />
                <span className={cn('truncate', collapsed && 'lg:sr-only')}>{item.label}</span>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
