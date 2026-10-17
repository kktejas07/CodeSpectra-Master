'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Search, Home, Trophy, Code2 as CodeIcon, BookOpen, BarChart3, Star, Settings,
  Users, Lock, Plug, Gauge, Globe2, Shield, FileText, Building2,
  CreditCard, Bell, Database, Sparkles, Bot, Briefcase, Flame, MessageSquare,
  Camera, Layers, UserPlus, Award, ScanSearch, type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  ADMIN_ONLY_ROUTES,
  TENANT_ADMIN_ROUTES,
  JUDGE_ROUTES,
  ALL_USER_ROUTES,
  ROUTE_LABELS,
  isPlatformAdminRoute,
} from '@/lib/page-permissions'
import {
  DASHBOARD_ROUTES,
  normalizeUserRole,
  isSuperAdmin,
  isTenantAdmin,
  isJudge,
  type UserRole,
} from '@/lib/rbac'

type CommandMenuProps = {
  fullWidth?: boolean
  compact?: boolean
  overviewHref?: string
  userRole?: UserRole | null
  allowedRoutes?: Set<string>
  deniedRoutes?: Set<string>
}

const SEARCH_ICON_MAP: Record<string, LucideIcon> = {
  '/dashboard': Home,
  '/dashboard/admin/system': Home,
  '/dashboard/admin/users': Users,
  '/dashboard/admin/roles': Lock,
  '/dashboard/admin/analytics': BarChart3,
  '/dashboard/admin/integrations': Plug,
  '/dashboard/admin/speed-insights': Gauge,
  '/dashboard/admin/cdn': Globe2,
  '/dashboard/admin/permissions': Shield,
  '/dashboard/admin/plans': FileText,
  '/dashboard/admin/organizations': Building2,
  '/dashboard/admin/coupons': CreditCard,
  '/dashboard/admin/announcements': Bell,
  '/dashboard/admin/newsletter': Bell,
  '/dashboard/admin/hackathons': Trophy,
  '/dashboard/admin/rag': Database,
  '/dashboard/admin/ai-inventory': Sparkles,
  '/dashboard/admin/settings': Settings,
  '/dashboard/admin/settings/kyc': Shield,
  '/dashboard/admin/security': Shield,
  '/dashboard/admin/security/email-monitoring': Bell,
  '/dashboard/admin/proctor': Shield,
  '/dashboard/admin/certificates': Award,
  '/dashboard/admin/teams': Users,
  '/dashboard/admin/jobs': Briefcase,
  '/dashboard/admin/resumes': FileText,
  '/dashboard/admin/codeathons': Trophy,
  '/dashboard/admin/assessments': FileText,
  '/dashboard/admin/blog': FileText,
  '/dashboard/admin/signals': Bot,
  '/dashboard/admin/billing': CreditCard,
  '/dashboard/admin/help': MessageSquare,
  '/dashboard/admin/sso': Lock,
  '/dashboard/admin/workflows': Settings,
  '/dashboard/admin/question-generator': Bot,
  '/dashboard/admin/team': Users,
  '/dashboard/admin/team/activity': Users,
  '/dashboard/admin/question-bank': Database,
  '/dashboard/admin/predictive-validity': BarChart3,
  '/dashboard/admin/sme-review': Users,
  '/dashboard/admin/hiring-manager-report': FileText,
  '/dashboard/arena': Trophy,
  '/dashboard/hackathons': Trophy,
  '/dashboard/problems': CodeIcon,
  '/dashboard/tracks': Layers,
  '/dashboard/agent': Bot,
  '/dashboard/mock-tests': Sparkles,
  '/dashboard/skill-analytics': Sparkles,
  '/dashboard/identity-verify': Camera,
  '/dashboard/leaderboard': BarChart3,
  '/dashboard/achievements': Star,
  '/dashboard/certifications': Award,
  '/dashboard/pricing': CreditCard,
  '/dashboard/settings/ai': Sparkles,
  '/dashboard/support': MessageSquare,
  '/dashboard/codeathons': Trophy,
  '/dashboard/challenges': CodeIcon,
  '/dashboard/interviews': Users,
  '/dashboard/jobs': Briefcase,
  '/dashboard/assessments': FileText,
  '/dashboard/resumes': FileText,
  '/dashboard/interview-prep': BookOpen,
  '/dashboard/judge': Shield,
  '/dashboard/100-days': Flame,
  '/dashboard/cad': Layers,
  '/dashboard/recruiter-analytics': BarChart3,
  '/dashboard/scanner': ScanSearch,
  '/dashboard/referrals': UserPlus,
  '/dashboard/interviews/feedback': Users,
}

const SEARCH_HREF_OVERRIDES: Record<string, string> = {
  '/dashboard/scanner': '/dashboard/scanner?mode=manual',
}

export function CommandMenu({
  fullWidth = false,
  compact = false,
  overviewHref = '/dashboard',
  userRole = null,
  allowedRoutes,
  deniedRoutes,
}: CommandMenuProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  const commands = useMemo(() => {
    const role = normalizeUserRole(userRole)
    const allRouteGroups = [ADMIN_ONLY_ROUTES, TENANT_ADMIN_ROUTES, JUDGE_ROUTES, ALL_USER_ROUTES] as const
    const seen = new Set<string>()

    const allItems: { label: string; icon: LucideIcon; href: string; route: string }[] = []

    for (const group of allRouteGroups) {
      for (const route of group) {
        if (seen.has(route)) continue
        seen.add(route)
        const icon = SEARCH_ICON_MAP[route]
        if (!icon) continue
        allItems.push({
          label: ROUTE_LABELS[route] || route.split('/').pop() || route,
          icon,
          href: SEARCH_HREF_OVERRIDES[route] || route,
          route,
        })
      }
    }

    let filtered = allItems
    if (isSuperAdmin(role)) {
      filtered = allItems
    } else if (isTenantAdmin(role)) {
      const tenantAdminSet = new Set(TENANT_ADMIN_ROUTES)
      filtered = allItems.filter(item => {
        const r = item.href.split('?')[0]
        return !r.startsWith('/dashboard/admin/') || tenantAdminSet.has(r)
      })
    } else if (isJudge(role)) {
      const judgeSet = new Set([...JUDGE_ROUTES, ...ALL_USER_ROUTES])
      filtered = allItems.filter(item => judgeSet.has(item.href.split('?')[0]))
    } else {
      const tenantOnlySet = new Set(TENANT_ADMIN_ROUTES.filter(r => !ALL_USER_ROUTES.includes(r)))
      const judgeOnlySet = new Set(JUDGE_ROUTES.filter(r => !ALL_USER_ROUTES.includes(r)))
      filtered = allItems.filter(item => {
        const r = item.href.split('?')[0]
        return r.startsWith('/dashboard') &&
          !r.startsWith('/dashboard/admin/') &&
          !r.startsWith(DASHBOARD_ROUTES.organization.team) &&
          !tenantOnlySet.has(r) &&
          !judgeOnlySet.has(r)
      })
    }

    if (allowedRoutes && allowedRoutes.size > 0) {
      filtered = allItems.filter(item => {
        const checkRoute = item.route
        return allowedRoutes.has(checkRoute) ||
          Array.from(allowedRoutes).some(r => checkRoute.startsWith(r + '/'))
      })
    }

    if (deniedRoutes && deniedRoutes.size > 0) {
      filtered = filtered.filter(item =>
        !deniedRoutes.has(item.route) &&
        !Array.from(deniedRoutes).some(r => item.route.startsWith(r + '/'))
      )
    }

    if (!isSuperAdmin(role)) {
      filtered = filtered.filter(item => !isPlatformAdminRoute(item.route))
    }

    // ponytail: overview duplicates the same route's menu item (same href, and
    // the old hardcoded 'Dashboard'/'Overview' label mismatched ROUTE_LABELS).
    // Label from ROUTE_LABELS and drop the dup so each destination appears once.
    const overviewRoute = overviewHref.split('?')[0]
    const overview = {
      label: ROUTE_LABELS[overviewRoute] || 'Overview',
      icon: Home,
      href: overviewHref,
      route: overviewRoute,
    }

    return [overview, ...filtered.filter(item => item.route !== overviewRoute)]
  }, [userRole, overviewHref, allowedRoutes, deniedRoutes])

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((open) => !open)
      }
    }

    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  const runCommand = (callback: () => void) => {
    setOpen(false)
    callback()
  }

  return (
    <>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search pages and commands..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Navigation">
            {commands.map((command) => (
              <CommandItem
                key={`${command.label}-${command.href}`}
                onSelect={() => {
                  runCommand(() => router.push(command.href))
                }}
              >
                <command.icon className="mr-2 h-4 w-4" />
                <span>{command.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>

      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search (Ctrl or Command + K)"
        className={cn(
          'inline-flex items-center gap-2 text-sm rounded-lg border border-border/40 bg-background/90 hover:bg-muted/80 transition-colors group text-muted-foreground',
          fullWidth ? 'w-full justify-between px-3 py-2.5' : 'px-3 py-2',
          compact && 'lg:px-2 lg:py-2.5 lg:justify-center'
        )}
      >
        <Search aria-hidden className="w-4 h-4 shrink-0 opacity-80" />
        <span
          className={cn(
            'truncate text-left text-muted-foreground',
            fullWidth && !compact && 'flex-1',
            !fullWidth && 'hidden sm:inline',
            fullWidth && compact && 'lg:hidden'
          )}
        >
          Search…
        </span>
        <span
          className={cn(
            'ml-auto shrink-0 text-xs text-muted-foreground group-hover:text-foreground',
            !fullWidth && 'hidden sm:inline',
            compact && 'lg:hidden'
          )}
        >
          <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border/40 bg-muted px-1.5 font-mono text-[10px] font-medium">
            <span className="text-xs">⌘</span>K
          </kbd>
        </span>
      </button>
    </>
  )
}
