'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  ArrowLeft,
  Code2,
  Github,
  Plus,
  BarChart3,
  FileText,
  Settings,
  Users,
  Shield,
  Activity,
  GitBranch,
  GitPullRequest,
  Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { parseScannerMode, scannerHref, type ScannerMode } from '@/lib/scanner-modes'

type Item = { mode: ScannerMode; label: string; icon: ReactNode }

const PRIMARY: Item[] = [
  { mode: 'manual', label: 'Manual Analysis', icon: <Code2 className="h-4 w-4" /> },
  { mode: 'github', label: 'GitHub Repos', icon: <Github className="h-4 w-4" /> },
  { mode: 'trends', label: 'Trends', icon: <BarChart3 className="h-4 w-4" /> },
  { mode: 'quality-gates', label: 'Quality Gates', icon: <Plus className="h-4 w-4" /> },
  { mode: 'review', label: 'Code Review', icon: <FileText className="h-4 w-4" /> },
]

const QUALITY: Item[] = [
  { mode: 'metrics', label: 'Metrics Browser', icon: <Zap className="h-4 w-4" /> },
  { mode: 'hotspots', label: 'Security Hotspots', icon: <Shield className="h-4 w-4" /> },
  { mode: 'ratings', label: 'Quality Ratings', icon: <BarChart3 className="h-4 w-4" /> },
  { mode: 'activity', label: 'Activity Timeline', icon: <Activity className="h-4 w-4" /> },
  { mode: 'architecture', label: 'Architecture', icon: <GitBranch className="h-4 w-4" /> },
  { mode: 'pr', label: 'PR Integration', icon: <GitPullRequest className="h-4 w-4" /> },
  { mode: 'branches', label: 'Branch Analytics', icon: <GitBranch className="h-4 w-4" /> },
]

const FOOTER: Item[] = [
  { mode: 'config', label: 'Configuration', icon: <Settings className="h-4 w-4" /> },
  { mode: 'reports', label: 'Reports', icon: <FileText className="h-4 w-4" /> },
  { mode: 'insights', label: 'Insights', icon: <BarChart3 className="h-4 w-4" /> },
  { mode: 'team', label: 'Team', icon: <Users className="h-4 w-4" /> },
]

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
          'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-all',
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
          <span className={cn('font-medium', collapsed && 'lg:sr-only')}>
            Back to dashboard
          </span>
        </Link>
        <p
          className={cn(
            'mt-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80',
            collapsed && 'lg:sr-only'
          )}
        >
          Scanner
        </p>
      </div>

      <div className="space-y-0.5 px-2 py-2">
        {PRIMARY.map((item) => (
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
              'mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70',
              collapsed && 'lg:sr-only'
            )}
          >
            Quality analysis
          </p>
          <div className="space-y-0.5">
            {QUALITY.map((item) => (
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

        {FOOTER.map((item) => (
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
