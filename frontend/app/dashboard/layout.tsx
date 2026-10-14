'use client'

import { useState, useEffect, useMemo, useRef, Suspense } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { usePlatformTimezone } from '@/lib/use-platform-timezone'
import { ImpersonationBanner } from '@/components/admin/impersonation-banner'
import {
  DASHBOARD_ROUTES,
  getDefaultDashboard,
  getRoleLabel,
  normalizeUserRole,
  UserRole,
  isSuperAdmin,
  isTenantAdmin,
  isJudge,
} from '@/lib/rbac'
import {
  ADMIN_ONLY_ROUTES,
  TENANT_ADMIN_ROUTES,
  JUDGE_ROUTES,
  ALL_USER_ROUTES,
  ROUTE_LABELS,
  ADMIN_SECTIONS,
  USER_SECTIONS,
  isPlatformAdminRoute,
} from '@/lib/page-permissions'
import { cn } from '@/lib/utils'
import {
  Home,
  Trophy,
  Code2 as CodeIcon,
  BookOpen,
  BarChart3,
  Settings,
  LogOut,
  Star,
  Award,
  Bell,
  Users,
  User,
  Menu,
  X,
  CreditCard,
  LifeBuoy,
  ChevronsLeft,
  ChevronsRight,
  Lock,
  FileText,
  Plug,
  Gauge,
  Globe2,
  SlidersHorizontal,
  ChevronRight,
  ChevronDown,
  Bot,
  Sparkles,
  Sparkles as SparklesIcon,
  Camera as CameraIcon,
  Layers as LayersIcon,
  CreditCard as CreditCardIcon,
  Building2,
  Shield,
  MessageSquare,
  Database,
  Briefcase,
  Flame,
  Mail,
  Newspaper,
  Radio,
  ScanSearch,
  UserPlus,
  AlertCircle,
  Timer,
  Swords,
  Target,
  GitFork,
  CalendarDays,
  Terminal,
  Video,
  UserCheck,
  FileSpreadsheet,
  ClipboardCheck,
  Boxes,
  ScanFace,
  Crown,
  Medal,
  LineChart,
  Gift,
  Receipt,
  Server,
  KeyRound,
  Users2,
  Ticket,
  Megaphone,
  BrainCircuit,
  Brain,
  ShieldAlert,
  ShieldCheck,
  Zap,
  Gavel,
  Workflow,
  Wand2,
  FileBarChart,
  BadgeCheck,
  Upload as UploadIcon,
  LayoutDashboard as LayoutDashboardIcon,
  TrendingUp,
  Activity,
  Heart,
  HelpCircle,
  Library,
  History,
  Bookmark,
  UserRound,
  MessageSquareWarning,
  type LucideIcon,
} from 'lucide-react'
import { isPageAllowed, type PlanDefinition } from '@/lib/plans-client'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { PushNotifications } from '@/components/push-notifications'
import { Celebration } from '@/components/gamification/celebration'
import { ThemeSwitcher } from '@/components/theme-switcher'
import { CommandMenu } from '@/components/command-menu'
import { ActivityHeartbeat } from '@/components/dashboard/activity-heartbeat'
import { WebVitalsReporter } from '@/components/dashboard/web-vitals-reporter'
import { AnalyticsTracker } from '@/components/dashboard/analytics-tracker'
import { ScannerSidebarNav } from '@/components/dashboard/scanner-sidebar-nav'
import { PlatformSettingsSidebarNav } from '@/components/dashboard/platform-settings-sidebar-nav'
import { AskCodeSpectra } from '@/components/ai/ask-codespectra'
import { PageLocked } from '@/components/page-locked'
import { fetchLockedPages } from '@/lib/use-page-guard'
import { resolveTourId } from '@/components/tour/tour-context'
import { GuideDrawer } from '@/components/tour/guide-drawer'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const SIDEBAR_COLLAPSED_KEY = 'codespectra-sidebar-collapsed'

// Stable empty array — superadmin bypasses locked pages. MUST be a module-level
// constant, not `[]` inline: a fresh array literal changes identity every render,
// which flows into the navEntries useMemo deps below and causes an infinite
// re-render loop (setCollapsedSections(new Set) → re-render → new [] → ...).
const EMPTY_LOCKED_PAGES: string[] = []

/** Main nav targets that swap the sidebar for a section sub-nav (fixed nested shell). */
function mainNavHasNestedShell(href: string): boolean {
  const path = (href.split('?')[0] || href).replace(/\/$/, '')
  if (path.startsWith('/dashboard/scanner')) return true
  if (path.startsWith('/dashboard/admin/settings')) return true
  return false
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  // Prime the app-wide default timezone from Settings → General so every page's
  // date formatting reflects it (see lib/format-datetime.ts).
  usePlatformTimezone()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [unreadNotifications, setUnreadNotifications] = useState(0)
  const [openSupportTickets, setOpenSupportTickets] = useState(0)
  const [userRole, setUserRole] = useState<UserRole | null>(null)
  const [userPlan, setUserPlan] = useState<string>('free')
  const [deniedRoutes, setDeniedRoutes] = useState<Set<string>>(new Set())
  const [allowedRoutes, setAllowedRoutes] = useState<Set<string>>(new Set())
  const [permsLoaded, setPermsLoaded] = useState(false)
  const [lockedPages, setLockedPages] = useState<string[]>([])
  const [chatbotEnabled, setChatbotEnabled] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())

  const { user: fbUser, signOut } = useAuth()

  useEffect(() => {
    if (!fbUser) { setUserRole(null); return }
    let cancelled = false
    fetch('/api/auth/session', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled || !data?.user) return
        setUserRole((data.user.role || 'user') as UserRole)
        setUserPlan(data.user.plan || 'free')
      })
      .catch(() => { if (!cancelled) setUserRole('user') })
    return () => { cancelled = true }
  }, [fbUser])

  // Fetch locked pages from platform settings (shared cached fetch — deduplicated across hooks & layout)
  useEffect(() => {
    let cancelled = false
    fetchLockedPages().then(pages => {
      if (!cancelled) setLockedPages(pages)
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    fetch('/api/daily-login', {
      method: 'POST',
      credentials: 'include',
    })
      .then(r => r.json())
      .then(data => {
        if (data.xp_awarded) {
          window.dispatchEvent(new CustomEvent('codespectra:celebrate', { detail: { type: 'daily_login' } }))
        }
      })
      .catch(() => {})
  }, [])

  // Fetch public platform settings
  useEffect(() => {
    let cancelled = false
    fetch('/api/platform/settings')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!cancelled && data?.settings) {
          if (typeof data.settings.enable_chatbot === 'boolean') {
            setChatbotEnabled(data.settings.enable_chatbot)
          }
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  // Fetch DB permissions to find routes where read was explicitly removed
  useEffect(() => {
    if (!userRole) return
    let cancelled = false
    fetch('/api/user/my-permissions', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled) return
        if (data?.readable?.length) {
          setAllowedRoutes(new Set(data.readable))
        }
        if (data?.denied?.length) setDeniedRoutes(new Set(data.denied))
        setPermsLoaded(true)
      })
      .catch(() => { if (!cancelled) setPermsLoaded(true) })
    return () => { cancelled = true }
  }, [userRole])

  const currentPageLocked = (() => {
    if (userRole && isSuperAdmin(userRole)) return false
    const base = pathname.split('?')[0]
    return lockedPages.some(route => base === route || base.startsWith(route + '/'))
  })()

  const lockedPageLabel = (() => {
    const base = pathname.split('?')[0]
    if (ROUTE_LABELS[base]) return ROUTE_LABELS[base]
    for (const [route, label] of Object.entries(ROUTE_LABELS)) {
      if (base.startsWith(route + '/')) return label
    }
    return null
  })()

  const userProfile = useMemo(() => {
    if (!fbUser || !userRole) return null
    return {
      id: fbUser.uid,
      email: fbUser.email || '',
      full_name: fbUser.displayName || 'User',
      role: userRole,
      tenant_id: null,
    }
  }, [fbUser, userRole])

  useEffect(() => {
    try {
      setSidebarCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1')
    } catch {
      /* ignore */
    }
  }, [])

  // Global session expiry handler — 2 minute grace period before redirect
  useEffect(() => {
    let redirectTimer: ReturnType<typeof setTimeout> | null = null
    const originalFetch = window.fetch
    window.fetch = async function (...args: Parameters<typeof fetch>) {
      const response = await originalFetch(...args)
      if (response.status === 401) {
        const url = args[0]?.toString() || ''
        if (url.includes('/api/') && !url.includes('/api/auth/')) {
          if (!redirectTimer) {
            redirectTimer = setTimeout(() => {
              const loginUrl = new URL('/auth/login', window.location.origin)
              loginUrl.searchParams.set('redirectTo', window.location.pathname)
              window.location.href = loginUrl.toString()
            }, 120000) // 2 minute grace period
          }
        }
      } else if (response.status === 200 && redirectTimer) {
        clearTimeout(redirectTimer)
        redirectTimer = null
      }
      return response
    }
    return () => {
      window.fetch = originalFetch
      if (redirectTimer) clearTimeout(redirectTimer)
    }
  }, [])

  useEffect(() => {
    if (!userProfile?.id) return
    let cancelled = false
    const loadUnread = async () => {
      try {
        const res = await fetch('/api/notifications/unread', { credentials: 'include' })
        if (!res.ok) return
        const data = (await res.json()) as { count?: number }
        if (cancelled) return
        setUnreadNotifications(data.count ?? 0)
      } catch {
        if (!cancelled) setUnreadNotifications(0)
      }
    }
    void loadUnread()
    const t = window.setInterval(() => void loadUnread(), 30_000)
    const onPush = () => void loadUnread()
    window.addEventListener('codespectra:notification', onPush)
    return () => {
      cancelled = true
      window.clearInterval(t)
      window.removeEventListener('codespectra:notification', onPush)
    }
  }, [userProfile?.id, pathname])

  useEffect(() => {
    if (!userProfile?.id) return
    let cancelled = false
    const loadTickets = async () => {
      try {
        const res = await fetch('/api/support/tickets/count', { credentials: 'include' })
        if (!res.ok) return
        const data = (await res.json()) as { open?: number }
        if (cancelled) return
        setOpenSupportTickets(data.open ?? 0)
      } catch {
        if (!cancelled) setOpenSupportTickets(0)
      }
    }
    void loadTickets()
    const t = window.setInterval(() => void loadTickets(), 60_000)
    return () => {
      cancelled = true
      window.clearInterval(t)
    }
  }, [userProfile?.id])

  type NavLeaf = { href: string; label: string; icon: LucideIcon; route: string }
  type NavEntry =
    | { type: 'link'; item: NavLeaf }
    | { type: 'group'; label: string; items: NavLeaf[] }

  const effectiveLockedPages = userProfile?.role && isSuperAdmin(userProfile.role) ? EMPTY_LOCKED_PAGES : lockedPages

  const navEntries = useMemo((): NavEntry[] => {
    if (!userProfile?.role) return []

    const role = normalizeUserRole(userProfile.role)
    const p = DASHBOARD_ROUTES.platform

    const ICON_MAP: Record<string, LucideIcon> = {
      // Core & Dashboard
      '/dashboard': Home,
      '/dashboard/agent': Bot,

      // Practice
      '/dashboard/arena': Swords,
      '/dashboard/problems': CodeIcon,
      '/dashboard/challenges': Target,
      '/dashboard/tracks': GitFork,
      '/dashboard/100-days': Flame,

      // Events
      '/dashboard/events': CalendarDays,
      '/dashboard/judge': Gavel,
      '/dashboard/codeathons': Terminal,
      '/dashboard/hackathons': Trophy,

      // Learning
      '/dashboard/courses': BookOpen,
      '/dashboard/courses/my': UserRound,
      '/dashboard/courses/wishlist': Heart,
      '/dashboard/interview-prep': Video,

      // Discover
      '/dashboard/quizzes': HelpCircle,
      '/dashboard/articles': Newspaper,
      '/dashboard/resources': Library,

      // My Activity
      '/dashboard/activity/recent': History,
      '/dashboard/activity/sessions': Video,
      '/dashboard/activity/bookmarks': Bookmark,

      // Career
      '/dashboard/jobs': Briefcase,
      '/dashboard/interviews': UserCheck,
      '/dashboard/interviews/ai-mock': Brain,
      '/dashboard/interviews/feedback': MessageSquare,
      '/dashboard/mock-tests': Sparkles,
      '/dashboard/resumes': FileSpreadsheet,
      '/dashboard/assessments': ClipboardCheck,
      '/dashboard/assessments/ai-fluency': BrainCircuit,
      '/dashboard/certifications': Award,

      // Tools
      '/dashboard/scanner': ScanSearch,
      '/dashboard/cad': Boxes,
      '/dashboard/identity-verify': ScanFace,

      // Stats
      '/dashboard/leaderboard': Crown,
      '/dashboard/achievements': Medal,
      '/dashboard/skill-analytics': LineChart,

      // Account
      '/dashboard/profile': User,
      '/dashboard/notifications': Bell,
      '/dashboard/calendar': CalendarDays,
      '/dashboard/billing': Receipt,
      '/dashboard/pricing': CreditCard,
      '/dashboard/settings': Settings,
      '/dashboard/settings/ai': Sparkles,
      '/dashboard/referrals': Gift,

      // Support & Misc
      '/dashboard/support': LifeBuoy,
      '/dashboard/status': Activity,

      // Admin & Platform
      [p.system]: Server,
      [p.users]: Users,
      [p.roles]: KeyRound,
      [p.analytics]: TrendingUp,
      [p.integrations]: Plug,
      [p.speedInsights]: Gauge,
      [p.cdn]: Globe2,
      [p.permissions]: Shield,
      [p.plans]: FileText,
      '/dashboard/admin/organizations': Building2,
      '/dashboard/admin/feedback': MessageSquareWarning,
      '/dashboard/admin/coupons': Ticket,
      '/dashboard/admin/announcements': Megaphone,
      '/dashboard/admin/newsletter': Mail,
      '/dashboard/admin/content-studio': Zap,
      '/dashboard/admin/blog': Newspaper,
      '/dashboard/admin/signals': Radio,
      '/dashboard/admin/resources': Library,
      '/dashboard/admin/hackathons': Trophy,
      '/dashboard/admin/rag': BrainCircuit,
      '/dashboard/admin/ai-inventory': Sparkles,
      [p.settings]: Settings,
      [p.security]: ShieldCheck,
      '/dashboard/admin/security/email-monitoring': Mail,
      '/dashboard/admin/security/scans': ShieldCheck,
      '/dashboard/admin/proctor': ShieldAlert,
      '/dashboard/admin/certificates': Award,
      [p.jobs]: Briefcase,
      [p.resumes]: FileSpreadsheet,
      [p.codeathons]: Terminal,
      [p.exams]: ClipboardCheck,
      '/dashboard/admin/assessments/bulk': UploadIcon,
      '/dashboard/admin/assessments/pipeline': LayoutDashboardIcon,
      [p.workflows]: Workflow,
      '/dashboard/admin/cron-jobs': Timer,
      [p.questionGenerator]: Bot,
      '/dashboard/admin/courses': BookOpen,
      [DASHBOARD_ROUTES.organization.team]: Users2,
      '/dashboard/admin/team/activity': Activity,
      '/dashboard/admin/question-bank': Database,
      '/dashboard/admin/predictive-validity': LineChart,
      '/dashboard/admin/sme-review': UserCheck,
      '/dashboard/admin/hiring-manager-report': FileBarChart,
      '/dashboard/admin/billing': Receipt,
      '/dashboard/admin/help': HelpCircle,
      '/dashboard/admin/sso': KeyRound,
      '/dashboard/admin/kyc': BadgeCheck,
      '/dashboard/recruiter-analytics': BarChart3,
      '/companies': Building2,
    }

    const HREF_OVERRIDES: Record<string, string> = {
      '/dashboard/scanner': '/dashboard/scanner?mode=manual',
    }

    const addSectionHeaders = (leaves: NavLeaf[]): NavEntry[] => {
      const sectionByRoute = new Map<string, string>()
      for (const s of USER_SECTIONS) sectionByRoute.set(s.firstRoute, s.label)
      for (const s of ADMIN_SECTIONS) sectionByRoute.set(s.firstRoute, s.label)
      const seenSections = new Set<string>()
      const result: NavEntry[] = []
      let current: { label: string; items: NavLeaf[] } | null = null
      for (const leaf of leaves) {
        const label = sectionByRoute.get(leaf.route)
        if (label && !seenSections.has(label)) {
          seenSections.add(label)
          if (current) result.push({ type: 'group', label: current.label, items: current.items })
          current = { label, items: [leaf] }
        } else if (current) {
          current.items.push(leaf)
        } else {
          result.push({ type: 'link', item: leaf })
        }
      }
      if (current) result.push({ type: 'group', label: current.label, items: current.items })
      return result
    }

    const allRouteGroups = [ALL_USER_ROUTES, TENANT_ADMIN_ROUTES, JUDGE_ROUTES, ADMIN_ONLY_ROUTES] as const
    const seen = new Set<string>()
    const allLeaves: NavLeaf[] = []
    for (const group of allRouteGroups) {
      for (const route of group) {
        if (seen.has(route)) continue
        seen.add(route)
        const icon = ICON_MAP[route]
        if (!icon) continue
        allLeaves.push({
          href: HREF_OVERRIDES[route] || route,
          icon,
          label: ROUTE_LABELS[route] || route,
          route: route,
        })
      }
    }

    let leaves: NavLeaf[]
    if (isSuperAdmin(role)) {
      leaves = allLeaves
    } else if (isTenantAdmin(role)) {
      const tenantAdminSet = new Set(TENANT_ADMIN_ROUTES)
      leaves = allLeaves.filter(leaf => {
        const route = leaf.href.split('?')[0]
        return !route.startsWith('/dashboard/admin/') || tenantAdminSet.has(route)
      })
    } else if (isJudge(role)) {
      const judgeSet = new Set([...JUDGE_ROUTES, ...ALL_USER_ROUTES])
      leaves = allLeaves.filter(leaf => judgeSet.has(leaf.href.split('?')[0]))
    } else {
      const tenantOnlySet = new Set(TENANT_ADMIN_ROUTES.filter(r => !ALL_USER_ROUTES.includes(r)))
      const judgeOnlySet = new Set(JUDGE_ROUTES.filter(r => !ALL_USER_ROUTES.includes(r)))
      leaves = allLeaves.filter(leaf => {
        const route = leaf.href.split('?')[0]
        return route.startsWith('/dashboard') &&
          !route.startsWith('/dashboard/admin/') &&
          !route.startsWith(DASHBOARD_ROUTES.organization.team) &&
          !tenantOnlySet.has(route) &&
          !judgeOnlySet.has(route)
      })
    }

    // When DB permissions are loaded they are the source of truth: they carry the
    // role defaults (merged server-side) PLUS any pages superadmin explicitly
    // granted beyond the static role arrays. So once loaded, ignore the static
    // role filter above — otherwise granted pages never appear (the old bug).
    if (permsLoaded && allowedRoutes.size > 0) {
      leaves = allLeaves.filter(leaf => {
        const checkRoute = leaf.route
        if (effectiveLockedPages.some(r => checkRoute === r || checkRoute.startsWith(r + '/'))) return true
        return allowedRoutes.has(checkRoute) ||
          Array.from(allowedRoutes).some(r => checkRoute.startsWith(r + '/'))
      })
    }

    if (deniedRoutes.size > 0) {
      leaves = leaves.filter(leaf =>
        !deniedRoutes.has(leaf.route) &&
        !Array.from(deniedRoutes).some(r => leaf.route.startsWith(r + '/'))
      )
    }

    if (!isSuperAdmin(role)) {
      leaves = leaves.filter(leaf => !isPlatformAdminRoute(leaf.route))
    }

    return addSectionHeaders(leaves)
  }, [userProfile?.role, userPlan, allowedRoutes, deniedRoutes, permsLoaded, effectiveLockedPages])

  const toggleSidebarCollapsed = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0')
      } catch {
        /* ignore */
      }
      return next
    })
  }

  const homeHref = userProfile?.role
    ? getDefaultDashboard(normalizeUserRole(userProfile.role))
    : '/dashboard'

  /** Avoid flashing `/dashboard` links for superadmin before profile hydrates (prevents redirect ping-pong + wrong prefetch). */
  const navReady = Boolean(userProfile?.role)
  const sidebarReady = navReady && permsLoaded

  const handleLogout = async () => {
    await signOut()
    router.push('/auth/login')
    router.refresh()
  }

  const handleGuideClick = () => {
    // ponytail: the Guide button opens the Unstop-style explanation drawer —
    // never a reload. The drawer resolves content by route and offers the
    // spotlight tour when the page registered one.
    setGuideOpen(true)
  }

  const guideTourId = resolveTourId(pathname)
  const guideFallbackTitle = (() => {
    const base = pathname.split('?')[0]
    if (ROUTE_LABELS[base]) return ROUTE_LABELS[base]
    for (const [route, label] of Object.entries(ROUTE_LABELS)) {
      if (base.startsWith(route + '/')) return label
    }
    return 'Guide'
  })()

  const isScannerShell = pathname.startsWith('/dashboard/scanner')
  // ponytail: exact match only — sub-pages like /settings/kyc are standalone
  // pages with their own content; prefix-matching swapped the whole sidebar
  // to the Platform Settings sub-nav and made it look like you landed inside
  // Settings. (?section= deep-links still match: pathname excludes query.)
  const isPlatformSettingsShell = pathname === '/dashboard/admin/settings'
  const isLessonPlayer = pathname.includes('/lesson/')

  const isActive = (href: string | undefined) => {
    if (!href) return false
    if (href.includes('/dashboard/admin/settings')) {
      return pathname.startsWith('/dashboard/admin/settings')
    }
    if (pathname === href) return true
    if (href.startsWith('/dashboard/scanner')) {
      return pathname.startsWith('/dashboard/scanner')
    }
    if (href === '/dashboard') {
      return pathname === '/dashboard'
    }
    if (href === '/dashboard/admin/team') {
      return pathname === href || pathname.startsWith('/dashboard/admin/team')
    }
    if (href === '/dashboard/admin/system') {
      return pathname === href || pathname.startsWith(`${href}/`)
    }
    return pathname.startsWith(`${href}/`)
  }

  // Auto-expand the section containing the current route (keeps the active page visible after nav)
  const activeSection = useMemo(() => {
    for (const entry of navEntries) {
      if (entry.type === 'group' && entry.items.some(item => isActive(item.href))) {
        return entry.label
      }
    }
    return null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, navEntries])

  const sectionsInitialized = useRef(false)

  // First time nav is ready: collapse every section except the active one (dropdown default state)
  useEffect(() => {
    if (sectionsInitialized.current || navEntries.length === 0) return
    sectionsInitialized.current = true
    const allLabels = navEntries
      .filter((e): e is Extract<typeof e, { type: 'group' }> => e.type === 'group')
      .map(e => e.label)
    setCollapsedSections(prev => {
      const next = new Set(prev)
      for (const label of allLabels) {
        if (label !== activeSection) next.add(label)
      }
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navEntries.length, activeSection])

  // Accordion: navigating into a section keeps it open and auto-collapses every other section
  useEffect(() => {
    if (!activeSection) return
    setCollapsedSections(prev => {
      const next = new Set(prev)
      for (const entry of navEntries) {
        if (entry.type === 'group' && entry.label !== activeSection) {
          next.add(entry.label)
        }
      }
      next.delete(activeSection)
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection, navEntries])

  const toggleSection = (label: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }

  const badgeCount = (route: string): number => {
    if (route === '/dashboard/support') return openSupportTickets
    if (route === '/dashboard/notifications') return unreadNotifications
    return 0
  }

  const renderLeaf = (leaf: NavLeaf) => {
    const { href, label, icon: IconComponent } = leaf
    const active = isActive(href)
    const nestedShell = mainNavHasNestedShell(href)
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const basePath = href.split('?')[0]
    const isLocked = effectiveLockedPages.some(r => basePath === r || basePath.startsWith(r + '/'))
    const showLock = isLocked && (userProfile?.role ? !isSuperAdmin(userProfile.role) : true)
    const chevron = nestedShell ? (
      <ChevronRight
        className={cn(
          'h-4 w-4 shrink-0 text-muted-foreground/70',
          active && 'text-primary/90',
          sidebarCollapsed && 'lg:sr-only'
        )}
        aria-hidden
      />
    ) : null
    return (
      <Link
        key={href}
        href={href}
        title={label}
        prefetch={false}
        onClick={() => setSidebarOpen(false)}
        data-testid={`sidebar-nav-${slug}`}
      >
        <div
          className={cn(
            'flex min-w-0 w-full items-center gap-3 rounded-lg px-3 py-2 text-[14px] transition-all',
            sidebarCollapsed && 'lg:justify-center lg:px-2',
            active
              ? 'bg-primary/15 font-semibold text-primary shadow-xs'
              : 'font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground'
          )}
        >
          <IconComponent className="h-4.5 w-4.5 shrink-0 opacity-90" />
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-[14px]',
              sidebarCollapsed && 'lg:sr-only'
            )}
          >
            {label}
          </span>
          {badgeCount(leaf.route) > 0 && (
            <span
              className={cn(
                'flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground',
                sidebarCollapsed && 'lg:sr-only'
              )}
            >
              {badgeCount(leaf.route) > 9 ? '9+' : badgeCount(leaf.route)}
            </span>
          )}
          {showLock && (
            <Lock className="h-4 w-4 shrink-0 text-muted-foreground/50" />
          )}
          {chevron}
        </div>
      </Link>
    )
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-background via-background to-primary/5">
      <ActivityHeartbeat />
      <WebVitalsReporter />
      <AnalyticsTracker />
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      {!isLessonPlayer && (
      <aside
        className={cn(
          'fixed left-0 top-0 z-40 h-screen w-64 border-r border-border/40 bg-card/95 backdrop-blur-md overflow-hidden transition-[width,transform] duration-200',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
          'lg:translate-x-0',
          sidebarCollapsed ? 'lg:w-16' : 'lg:w-64'
        )}
      >
        <div className="flex h-full flex-col">
          {/* Logo + collapse — desktop collapsed uses vertical stack to avoid icon overlap */}
          <div
            className={cn(
              'flex shrink-0 border-b border-border/40 px-2 sm:px-3',
              sidebarCollapsed
                ? 'h-14 flex-row items-center gap-2 lg:h-auto lg:flex-col lg:items-center lg:gap-2 lg:py-3'
                : 'h-14 flex-row items-center gap-2'
            )}
          >
            <Link
              href={homeHref}
              className={cn(
                'flex min-w-0 flex-1 items-center gap-2 rounded-lg py-1.5 pl-1 pr-1 hover:bg-muted/50',
                sidebarCollapsed &&
                  'lg:flex-none lg:justify-center lg:px-0 lg:py-0'
              )}
              title="Home"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-linear-to-br from-primary to-primary/70 shadow-sm">
                <CodeIcon className="h-4 w-4 text-primary-foreground" />
              </div>
              <span
                className={cn(
                  'min-w-0 truncate text-sm font-semibold tracking-tight',
                  sidebarCollapsed && 'lg:sr-only'
                )}
              >
                CodeSpectra
              </span>
            </Link>
            <button
              type="button"
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className={cn(
                'ml-auto hidden shrink-0 rounded-md border border-transparent p-2 text-muted-foreground hover:border-border/60 hover:bg-muted/80 hover:text-foreground lg:inline-flex lg:ml-0',
                sidebarCollapsed && 'lg:mx-auto'
              )}
              onClick={toggleSidebarCollapsed}
            >
              {sidebarCollapsed ? (
                <ChevronsRight className="h-4 w-4" />
              ) : (
                <ChevronsLeft className="h-4 w-4" />
              )}
            </button>
          </div>

          {/* Command search — single entry; full width */}
          <div className={cn('border-b border-border/40 px-3 py-3', sidebarCollapsed && 'lg:px-2')}>
            <CommandMenu
              fullWidth
              compact={sidebarCollapsed}
              overviewHref={homeHref}
              userRole={userProfile?.role}
              allowedRoutes={allowedRoutes}
              deniedRoutes={deniedRoutes}
            />
          </div>

          {/* Main nav or Scanner sub-nav (nested sidebar) */}
          <nav className="flex-1 min-h-0 overflow-y-auto">
            {isScannerShell ? (
              <Suspense
                fallback={
                  <div className="mx-2 my-2 h-40 animate-pulse rounded-md bg-muted/40" />
                }
              >
                <ScannerSidebarNav
                  collapsed={sidebarCollapsed}
                  homeHref={homeHref}
                  onNavigate={() => setSidebarOpen(false)}
                />
              </Suspense>
            ) : isPlatformSettingsShell ? (
              <Suspense
                fallback={
                  <div className="mx-2 my-2 h-40 animate-pulse rounded-md bg-muted/40" />
                }
              >
                <PlatformSettingsSidebarNav
                  collapsed={sidebarCollapsed}
                  homeHref={homeHref}
                  onNavigate={() => setSidebarOpen(false)}
                />
              </Suspense>
            ) : (
              <div className="space-y-0.5 px-2 py-2">
                {!navReady ? (
                  <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                    Loading navigation…
                  </div>
                ) : !sidebarReady ? (
                  <div className="space-y-1.5 px-1">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div key={i} className="h-8 rounded-md bg-muted/40 animate-pulse" />
                    ))}
                  </div>
                ) : (
                  navEntries.map((entry) => {
                    if (entry.type === 'group') {
                      const { label, items } = entry
                      const expanded = sidebarCollapsed || !collapsedSections.has(label)
                      return (
                        <div key={label} className="space-y-0.5">
                          <button
                            type="button"
                            onClick={() => toggleSection(label)}
                            aria-expanded={expanded}
                            className={cn(
                              'flex w-full items-center justify-between gap-1 rounded-md px-3 py-2 text-xs font-bold uppercase tracking-wider text-muted-foreground/80 transition-colors hover:bg-muted/50 hover:text-foreground',
                              sidebarCollapsed && 'lg:sr-only'
                            )}
                          >
                            <span className="min-w-0 truncate text-xs font-bold tracking-wider">{label}</span>
                            <ChevronDown
                              className={cn(
                                'h-3.5 w-3.5 shrink-0 transition-transform duration-200 opacity-80',
                                expanded && 'rotate-180 opacity-100',
                                sidebarCollapsed && 'lg:sr-only'
                              )}
                              aria-hidden
                            />
                          </button>
                          {expanded && (
                            <div className="space-y-0.5">
                              {items.map(item => renderLeaf(item))}
                            </div>
                          )}
                        </div>
                      )
                    }
                    return renderLeaf(entry.item)
                  })
                )}
              </div>
            )}
          </nav>

          {/* Bottom: profile + theme + notifications + logout — row when expanded; stacked when collapsed (narrow rail) */}
          <div
            className={cn(
              'shrink-0 border-t border-border/40 px-2 py-2',
              sidebarCollapsed
                ? 'flex flex-col items-stretch gap-2 lg:px-1.5'
                : 'flex flex-row items-center gap-1.5'
            )}
          >
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    'flex min-w-0 items-center gap-2 rounded-lg p-1.5 text-left transition-colors hover:bg-muted/60',
                    sidebarCollapsed ? 'w-full justify-center' : 'min-w-0 flex-1'
                  )}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                    {userProfile?.full_name?.charAt(0) || 'U'}
                  </div>
                  <div
                    className={cn(
                      'min-w-0 flex-1',
                      sidebarCollapsed && 'lg:hidden'
                    )}
                  >
                    <p className="truncate text-sm font-medium leading-tight">
                      {userProfile?.full_name || 'User'}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {userProfile?.role
                        ? getRoleLabel(normalizeUserRole(userProfile.role))
                        : 'User'}
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="top" className="mb-2 w-56">
                <div className="space-y-1 border-b border-border p-3">
                  <p className="text-sm font-semibold">{userProfile?.full_name || 'User'}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {userProfile?.email || ''}
                  </p>
                </div>
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/profile" className="flex cursor-pointer items-center gap-2">
                    <User className="h-4 w-4 opacity-70" />
                    Profile
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/settings" className="flex cursor-pointer items-center gap-2">
                    <Settings className="h-4 w-4 opacity-70" />
                    Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/billing" className="flex cursor-pointer items-center gap-2">
                    <CreditCard className="h-4 w-4 opacity-70" />
                    Billing
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/notifications" className="flex cursor-pointer items-center gap-2">
                    <Bell className="h-4 w-4 opacity-70" />
                    Notifications
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link
                    href="/dashboard/notifications/preferences"
                    className="flex cursor-pointer items-center gap-2"
                  >
                    <SlidersHorizontal className="h-4 w-4 opacity-70" />
                    Notification preferences
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/docs" className="flex cursor-pointer items-center gap-2">
                    <FileText className="h-4 w-4 opacity-70" />
                    Documentation
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/support" className="flex cursor-pointer items-center gap-2">
                    <LifeBuoy className="h-4 w-4 opacity-70" />
                    Support
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <div
              className={cn(
                'flex items-center',
                sidebarCollapsed
                  ? 'flex-col gap-1'
                  : 'ml-auto shrink-0 flex-row gap-0.5'
              )}
            >
              <ThemeSwitcher compact={sidebarCollapsed} />
              <Link
                href="/dashboard/notifications"
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  'relative flex shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground max-md:min-h-10 max-md:min-w-10',
                  sidebarCollapsed
                    ? 'flex h-9 w-9 items-center justify-center'
                    : 'p-2',
                  pathname.startsWith('/dashboard/notifications') && 'bg-muted text-foreground'
                )}
                title="Notifications"
                aria-label="Notifications"
              >
                <Bell className="h-4 w-4 shrink-0" />
                {unreadNotifications > 0 ? (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground leading-none"
                    aria-label={`${unreadNotifications} unread notifications`}>
                    {unreadNotifications > 9 ? '9+' : unreadNotifications}
                  </span>
                ) : null}
              </Link>

              <button
                type="button"
                onClick={() => void handleLogout()}
                className={cn(
                  'flex shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-destructive max-md:min-h-10 max-md:min-w-10',
                  sidebarCollapsed ? 'flex h-9 w-9 items-center justify-center' : 'p-2'
                )}
                title="Sign out"
                aria-label="Sign out"
              >
                <LogOut className="h-4 w-4 shrink-0" />
              </button>
            </div>
          </div>
        </div>
      </aside>
      )}

      {/* Main Content */}
      <div
        className={cn(
          'transition-[margin] duration-200',
          !isLessonPlayer && (sidebarCollapsed ? 'lg:ml-16' : 'lg:ml-64')
        )}
      >
        {/* Impersonation notice — superadmin acting as another user */}
        <ImpersonationBanner />

        {/* Face biometric enrollment warning */}
        {userRole === 'user' && fbUser?.has_enrolled_face === false && (
          <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-sm">
            <div className="flex items-center gap-2 text-amber-600">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <p><strong>Action Required:</strong> Please complete your face biometric enrollment to take proctored assessments.</p>
            </div>
            <Link 
              href="/auth/enroll-face?redirect=/dashboard" 
              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-md font-medium text-xs text-center whitespace-nowrap transition-colors"
            >
              Enroll Now
            </Link>
          </div>
        )}

        {/* Breadcrumbs + mobile menu + tour guide (no top profile — account lives in sidebar footer) */}
        {!isLessonPlayer && (
        <div className="sticky top-0 z-20 flex h-12 items-center justify-between gap-3 border-b border-border/20 bg-background/80 px-4 backdrop-blur-xl lg:px-6">
          <Breadcrumbs homeHref={homeHref} className="min-w-0" />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="flex min-h-10 min-w-10 items-center justify-center rounded-lg p-2 hover:bg-muted lg:hidden"
              aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
            >
              {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            {/* Tour guide button */}
            <button
              type="button"
              onClick={handleGuideClick}
              className="flex items-center justify-center rounded-lg p-2 hover:bg-muted max-md:min-h-10 max-md:min-w-10"
              aria-label="Guide"
              title="Show guide"
            >
              <HelpCircle className="h-5 w-5" />
            </button>
          </div>
        </div>
        )}
        <GuideDrawer
          open={guideOpen}
          onClose={() => setGuideOpen(false)}
          tourId={guideTourId}
          fallbackTitle={guideFallbackTitle}
        />

        {/* Page Content — full width with proper padding */}
        <main className={cn("w-full", isLessonPlayer ? "p-0" : "px-4 py-5 lg:px-6 lg:py-8")}>
          <div className="w-full">
            {currentPageLocked ? (
              <PageLocked routeName={lockedPageLabel || undefined} />
            ) : (
              children
            )}
          </div>
        </main>
      </div>
      {/* Floating Chatbot */}
      {chatbotEnabled && <AskCodeSpectra />}

      {/* Real-time FCM push → XP toasts / notification popups */}
      <PushNotifications userId={userProfile?.id} />
      <Celebration />

      {/* Global Modals */}
    </div>
  )
}
