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
  FileText,
  Globe2,
  ScrollText,
  Trophy,
  Shield,
  Database,
  MessageCircle,
  Video,
  Briefcase,
  BarChart3,
  Search,
  HardDrive,
} from 'lucide-react'
import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  parsePlatformSettingsSection,
  platformSettingsHref,
  type PlatformSettingsSection,
} from '@/lib/platform-settings-nav'
import { useT } from '@/lib/i18n/client'
import type { Translator } from '@/lib/i18n/catalog'

const ITEMS = (t: Translator): {
  id: PlatformSettingsSection
  label: string
  icon: typeof Building2
}[] => ([
  { id: 'branding', label: t('dash.brandingSupport'), icon: Building2 },
  { id: 'media', label: t('dash.mediaPlayer'), icon: Video },
  { id: 'cloudflare', label: 'Cloudflare', icon: Globe2 },
  { id: 'mail', label: t('dash.mailEmailApis'), icon: Mail },
  { id: 'ops', label: t('dash.operations'), icon: Sliders },
  { id: 'product', label: t('dash.productAccess'), icon: Users },
  { id: 'certificates', label: t('dash.certificates'), icon: ScrollText },
  { id: 'integrations', label: t('dash.integrations'), icon: KeyRound },
  { id: 'hiring', label: t('dash.hiringIntegrations'), icon: Briefcase },
  { id: 'payments', label: t('dash.paymentsBilling'), icon: CreditCard },
  { id: 'email-templates', label: t('dash.emailTemplates'), icon: FileText },
  { id: 'llm', label: t('dash.aiLlmKeys'), icon: Sparkles },
  { id: 'gamification', label: t('dash.gamificationXp'), icon: Trophy },
  { id: 'kyc', label: t('dash.kycProviders'), icon: Shield },
  { id: 'redis', label: t('dash.redisRateLimiting'), icon: Database },
  { id: 'storage', label: t('dash.uploadStorage'), icon: HardDrive },
  { id: 'whatsapp', label: t('dash.whatsappOpenwa'), icon: MessageCircle },
  { id: 'seo', label: t('dash.seoAiSearch'), icon: Search },
  { id: 'analytics', label: t('dash.analyticsTracking'), icon: BarChart3 },
])

export function PlatformSettingsSidebarNav({
  collapsed,
  homeHref,
  onNavigate,
}: {
  collapsed: boolean
  homeHref: string
  onNavigate: () => void
}) {
  const { t } = useT()
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
          <span className={cn('font-medium', collapsed && 'lg:sr-only')}>{t('dash.backToDashboard')}</span>
        </Link>
        <p
          className={cn(
            'mt-1 px-2 text-xs font-semibold text-muted-foreground',
            collapsed && 'lg:sr-only'
          )}
        >{t('dash.platformSettings')}</p>
      </div>

      <div className="space-y-0.5 px-2 py-2">
        {ITEMS(t).map((item) => {
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
                  'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors duration-200',
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
