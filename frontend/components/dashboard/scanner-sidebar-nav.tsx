'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  ArrowLeft,
  Code2,
  Plus,
  BarChart3,
  FileText,
  Users,
  Shield,
  Activity,
  GitBranch,
  GitPullRequest,
  Zap,
  MessageSquare,
  Package,
  Key,
} from 'lucide-react'
import { Github } from '@/components/ui/brand-icons'
import { cn } from '@/lib/utils'
import { parseScannerMode, scannerHref, type ScannerMode } from '@/lib/scanner-modes'
import { useT } from '@/lib/i18n/client'
import type { Translator } from '@/lib/i18n/catalog'

type Item = { mode: ScannerMode; label: string; icon: ReactNode }

// Trends, code review and configuration are hidden: they had no saved data
// behind them (the page shows a "not available yet" state on direct links).
const PRIMARY = (t: Translator): Item[] => ([
  { mode: 'manual', label: t('dash.manualAnalysis'), icon: <Code2 className="h-4 w-4" /> },
  { mode: 'github', label: t('dash.githubRepos'), icon: <Github className="h-4 w-4" /> },
  { mode: 'dependencies', label: t('dash.dependencyScan'), icon: <Package className="h-4 w-4" /> },
  { mode: 'secrets', label: t('dash.secretDetection'), icon: <Key className="h-4 w-4" /> },
  { mode: 'quality-gates', label: t('dash.qualityGates'), icon: <Plus className="h-4 w-4" /> },
  { mode: 'chat', label: t('dash.codebaseChat'), icon: <MessageSquare className="h-4 w-4" /> },
])

const QUALITY = (t: Translator): Item[] => ([
  { mode: 'metrics', label: t('dash.metricsBrowser'), icon: <Zap className="h-4 w-4" /> },
  { mode: 'hotspots', label: t('dash.securityHotspots'), icon: <Shield className="h-4 w-4" /> },
  { mode: 'ratings', label: t('dash.qualityRatings'), icon: <BarChart3 className="h-4 w-4" /> },
  { mode: 'activity', label: t('dash.activityTimeline'), icon: <Activity className="h-4 w-4" /> },
  { mode: 'architecture', label: t('dash.architecture'), icon: <GitBranch className="h-4 w-4" /> },
  { mode: 'pr', label: t('dash.prIntegration'), icon: <GitPullRequest className="h-4 w-4" /> },
  { mode: 'branches', label: t('dash.branchAnalytics'), icon: <GitBranch className="h-4 w-4" /> },
])

const FOOTER = (t: Translator): Item[] => ([
  { mode: 'reports', label: t('dash.reports'), icon: <FileText className="h-4 w-4" /> },
  { mode: 'insights', label: t('dash.insights'), icon: <BarChart3 className="h-4 w-4" /> },
  { mode: 'team', label: t('dash.team'), icon: <Users className="h-4 w-4" /> },
])

function NavLink({
  item,
  active,
  collapsed,
  onPick,
}: {
  item: Item
  active: boolean
  collapsed: boolean
  onPick: () => void
}) {
  const href = scannerHref(item.mode)
  return (
    <Link href={href} title={item.label} onClick={onPick}>
      <div
        className={cn(
          'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors duration-200',
          collapsed && 'lg:justify-center lg:px-2',
          active
            ? 'bg-primary/10 font-medium text-primary'
            : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
        )}
      >
        <span className="shrink-0 opacity-90">{item.icon}</span>
        <span className={cn('truncate', collapsed && 'lg:sr-only')}>{item.label}</span>
      </div>
    </Link>
  )
}

export function ScannerSidebarNav({
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
  const current = parseScannerMode(searchParams.get('mode'))

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
        >{t('dash.scanner')}</p>
      </div>

      <div className="space-y-0.5 px-2 py-2">
        {PRIMARY(t).map((item) => (
          <NavLink
            key={item.mode}
            item={item}
            active={current === item.mode}
            collapsed={collapsed}
            onPick={onNavigate}
          />
        ))}

        <div className={cn('my-2 border-t border-border/40 pt-2', collapsed && 'lg:mx-0')}>
          <p
            className={cn(
              'mb-1 px-2 text-xs font-semibold text-muted-foreground',
              collapsed && 'lg:sr-only'
            )}
          >{t('dash.qualityAnalysis')}</p>
          <div className="space-y-0.5">
            {QUALITY(t).map((item) => (
              <NavLink
                key={item.mode}
                item={item}
                active={current === item.mode}
                collapsed={collapsed}
                onPick={onNavigate}
              />
            ))}
          </div>
        </div>

        {FOOTER(t).map((item) => (
          <NavLink
            key={item.mode}
            item={item}
            active={current === item.mode}
            collapsed={collapsed}
            onPick={onNavigate}
          />
        ))}
      </div>
    </div>
  )
}
