'use client'

import { useMemo } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight, Home } from 'lucide-react'
import { cn } from '@/lib/utils'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Human labels for route segments (pathname pieces, no leading slash). */
const SEGMENT_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  admin: 'Platform',
  system: 'System',
  team: 'Team',
  users: 'Users',
  roles: 'Roles',
  permissions: 'Permissions',
  analytics: 'Analytics',
  'audit-logs': 'Audit logs',
  learning: 'Learning',
  scanner: 'Scanner',
  challenges: 'Challenges',
  interviews: 'Interviews',
  setup: 'Setup',
  feedback: 'Feedback',
  profile: 'Profile',
  achievements: 'Achievements',
  leaderboard: 'Leaderboard',
  settings: 'Settings',
  support: 'Support',
  notifications: 'Notifications',
  arena: 'Arena',
  prepare: 'Prepare',
  certifications: 'Certifications',
  resumes: 'Resumes',
  jobs: 'Jobs',
  codeathons: 'Codeathons',
  exams: 'Exams',
  integrations: 'Integrations',
  pricing: 'Pricing',
  security: 'Security',
  teams: 'Teams',
  billing: 'Billing',
  dynamic: 'Session',
  results: 'Results',
  progress: 'Progress',
}

function labelForSegment(segment: string): string {
  if (UUID_RE.test(segment)) return 'Details'
  if (/^\d+$/.test(segment)) return 'Details'
  const mapped = SEGMENT_LABELS[segment]
  if (mapped) return mapped
  return segment
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export type BreadcrumbsProps = {
  /** Role-aware home (e.g. superadmin system console). Defaults to `/dashboard`. */
  homeHref?: string
  className?: string
}

export function Breadcrumbs({ homeHref = '/dashboard', className }: BreadcrumbsProps) {
  const pathname = usePathname()
  const basePath = pathname.split('?')[0]

  const crumbs = useMemo(() => {
    const segments = basePath.split('/').filter(Boolean)
    if (segments.length === 0) return []

    return segments.map((segment, index) => {
      const href = '/' + segments.slice(0, index + 1).join('/')
      const label = labelForSegment(segment)
      const isLast = index === segments.length - 1
      return { href, label, isLast }
    })
  }, [basePath])

  if (crumbs.length === 0) {
    return (
      <nav aria-label="Breadcrumb" className={cn('flex min-w-0 items-center', className)}>
        <span className="truncate text-sm font-medium text-foreground">Home</span>
      </nav>
    )
  }

  return (
    <nav
      aria-label="Breadcrumb"
      className={cn(
        'flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto text-sm lg:gap-2',
        className
      )}
    >
      <Link
        href={homeHref}
        className="flex shrink-0 items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
        title="Home"
      >
        <Home className="h-4 w-4" />
        <span className="sr-only">Home</span>
      </Link>

      {crumbs.map((crumb) => (
        <div key={crumb.href} className="flex min-w-0 items-center gap-1.5 lg:gap-2">
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" aria-hidden />
          {crumb.isLast ? (
            <span
              className="truncate font-medium text-foreground"
              aria-current="page"
            >
              {crumb.label}
            </span>
          ) : (
            <Link
              href={crumb.href}
              className="truncate text-muted-foreground transition-colors hover:text-foreground"
            >
              {crumb.label}
            </Link>
          )}
        </div>
      ))}
    </nav>
  )
}
