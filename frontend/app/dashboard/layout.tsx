'use client'

import { useState, useEffect, useMemo, Suspense } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import {
  DASHBOARD_ROUTES,
  getDefaultDashboard,
  getRoleLabel,
  normalizeUserRole,
  UserRole,
  isSuperAdmin,
  isTenantAdmin,
} from '@/lib/rbac'
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
  ScrollText,
  Plug,
  Gauge,
  Globe2,
  SlidersHorizontal,
  ChevronRight,
  Bot,
  Sparkles,
  Sparkles as SparklesIcon,
  Camera as CameraIcon,
  Layers as LayersIcon,
  CreditCard as CreditCardIcon,
  Shield,
  type LucideIcon,
} from 'lucide-react'
import { isPageAllowed, type PlanDefinition } from '@/lib/plans'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { ThemeSwitcher } from '@/components/theme-switcher'
import { CommandMenu } from '@/components/command-menu'
import { ActivityHeartbeat } from '@/components/dashboard/activity-heartbeat'
import { WebVitalsReporter } from '@/components/dashboard/web-vitals-reporter'
import { ScannerSidebarNav } from '@/components/dashboard/scanner-sidebar-nav'
import { LearningSidebarNav } from '@/components/dashboard/learning-sidebar-nav'
import { PlatformSettingsSidebarNav } from '@/components/dashboard/platform-settings-sidebar-nav'
import { LEARNING_HUB_DEFAULT } from '@/lib/learning-query'
import { AskCodeSpectra } from '@/components/ai/ask-codespectra'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const SIDEBAR_COLLAPSED_KEY = 'codespectra-sidebar-collapsed'

/** Main nav targets that swap the sidebar for a section sub-nav (fixed nested shell). */
function mainNavHasNestedShell(href: string): boolean {
  const path = (href.split('?')[0] || href).replace(/\/$/, '')
  if (path.startsWith('/dashboard/scanner')) return true
  if (path.startsWith('/dashboard/learning')) return true
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
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [unreadNotifications, setUnreadNotifications] = useState(0)
  const [userRole, setUserRole] = useState<UserRole | null>(null)
  const [userPlan, setUserPlan] = useState<string>('free')

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

  // Global session expiry handler — intercept 401 on API calls, redirect to login
  useEffect(() => {
    const originalFetch = window.fetch
    window.fetch = async function (...args: Parameters<typeof fetch>) {
      const response = await originalFetch(...args)
      if (response.status === 401) {
        const url = args[0]?.toString() || ''
        // Only redirect for API calls, not for page loads (proxy.ts handles those)
        if (url.includes('/api/') && !url.includes('/api/auth/')) {
          const loginUrl = new URL('/auth/login', window.location.origin)
          loginUrl.searchParams.set('redirectTo', window.location.pathname)
          window.location.href = loginUrl.toString()
        }
      }
      return response
    }
    return () => { window.fetch = originalFetch }
  }, [])

  useEffect(() => {
    if (!userProfile?.id) return
    let cancelled = false
    const loadUnread = async () => {
      try {
        const res = await fetch('/api/notifications', { credentials: 'include' })
        if (!res.ok) return
        const list = (await res.json()) as { is_read?: boolean | null }[]
        if (cancelled || !Array.isArray(list)) return
        setUnreadNotifications(list.filter((n) => !n.is_read).length)
      } catch {
        if (!cancelled) setUnreadNotifications(0)
      }
    }
    void loadUnread()
    const t = window.setInterval(() => void loadUnread(), 45_000)
    return () => {
      cancelled = true
      window.clearInterval(t)
    }
  }, [userProfile?.id, pathname])

  type NavLeaf = { href: string; label: string; icon: LucideIcon }
  type NavEntry = { type: 'link'; item: NavLeaf }

  const navEntries = useMemo((): NavEntry[] => {
    if (!userProfile?.role) return []

    const baseLeaves: NavLeaf[] = [
      { href: '/dashboard/arena', icon: Trophy, label: 'Arena' },
      { href: '/dashboard/problems', icon: CodeIcon, label: 'Problems' },
      { href: '/dashboard/tracks', icon: LayersIcon, label: 'Tracks' },
      { href: '/dashboard/scanner?mode=manual', icon: CodeIcon, label: 'Scanner' },
      { href: '/dashboard/agent', icon: Bot, label: 'Agent' },
      { href: LEARNING_HUB_DEFAULT, icon: BookOpen, label: 'Learning' },
      { href: '/dashboard/skill-analytics', icon: SparklesIcon, label: 'Skill Analytics' },
      { href: '/dashboard/identity-verify', icon: CameraIcon, label: 'Identity Verify' },
      { href: '/dashboard/leaderboard', icon: BarChart3, label: 'Leaderboard' },
      { href: '/dashboard/achievements', icon: Star, label: 'Achievements' },
      { href: '/dashboard/certifications', icon: Award, label: 'Certifications' },
      { href: '/dashboard/pricing', icon: CreditCardIcon, label: 'Pricing' },
    ]

    const role = normalizeUserRole(userProfile.role)
    const p = DASHBOARD_ROUTES.platform

    let entries: NavEntry[] = []

    if (isSuperAdmin(role)) {
      const platformItems: NavLeaf[] = [
        { href: p.users, icon: Users, label: 'Users' },
        { href: p.roles, icon: Lock, label: 'Roles' },
        { href: p.analytics, icon: BarChart3, label: 'Insights' },
        { href: p.auditLogs, icon: ScrollText, label: 'Audit logs' },
        { href: p.integrations, icon: Plug, label: 'Integrations' },
        { href: p.speedInsights, icon: Gauge, label: 'Speed Insights' },
        { href: p.cdn, icon: Globe2, label: 'CDN' },
        { href: p.permissions, icon: Shield, label: 'Permissions' },
        { href: p.plans, icon: FileText, label: 'Plans' },
        { href: p.pricing, icon: FileText, label: 'Pricing' },
        { href: '/dashboard/admin/hackathons', icon: Trophy, label: 'Hackathons' },
        { href: '/dashboard/admin/ai-inventory', icon: Sparkles, label: 'AI Inventory' },
      ]
      const platformSettingsLeaf: NavLeaf = {
        href: p.settings,
        icon: Settings,
        label: 'Platform settings',
      }
      entries = [
        { type: 'link', item: { href: p.system, icon: Home, label: 'Operations overview' } },
        ...platformItems.map((item) => ({ type: 'link' as const, item })),
        ...baseLeaves.map((item) => ({ type: 'link' as const, item })),
        { type: 'link', item: platformSettingsLeaf },
      ]
    } else if (isTenantAdmin(role)) {
      entries = [
        { type: 'link', item: { href: '/dashboard', icon: Home, label: 'Overview' } },
        { type: 'link', item: { href: DASHBOARD_ROUTES.organization.team, icon: Users, label: 'Organization' } },
        ...baseLeaves.map((item) => ({ type: 'link' as const, item })),
      ]
    } else {
      entries = [
        { type: 'link', item: { href: '/dashboard', icon: Home, label: 'Overview' } },
        ...baseLeaves.map((item) => ({ type: 'link' as const, item })),
      ]
    }

    return entries.filter(entry =>
      isPageAllowed({ plan: userPlan } as PlanDefinition, entry.item.href)
    )
  }, [userProfile?.role, userPlan])

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

  const handleLogout = async () => {
    await signOut()
    router.push('/auth/login')
    router.refresh()
  }

  const isScannerShell = pathname.startsWith('/dashboard/scanner')
  const isLearningShell = pathname.startsWith('/dashboard/learning')
  const isPlatformSettingsShell = pathname.startsWith('/dashboard/admin/settings')

  const isActive = (href: string | undefined) => {
    if (!href) return false
    if (href.includes('/dashboard/admin/settings')) {
      return pathname.startsWith('/dashboard/admin/settings')
    }
    if (pathname === href) return true
    if (href.startsWith('/dashboard/scanner')) {
      return pathname.startsWith('/dashboard/scanner')
    }
    if (href.startsWith('/dashboard/learning')) {
      return pathname.startsWith('/dashboard/learning')
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

  return (
    <div className="min-h-screen bg-linear-to-br from-background via-background to-primary/4 dark:from-background dark:via-background dark:to-primary/10">
      <ActivityHeartbeat />
      <WebVitalsReporter />
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed left-0 top-0 z-40 h-screen w-64 border-r border-border/40 bg-card/95 backdrop-blur-md transition-[width,transform] duration-200',
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
            />
          </div>

          {/* Main nav or Scanner sub-nav (nested sidebar) */}
          <nav className="flex-1 overflow-y-auto">
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
            ) : isLearningShell ? (
              <Suspense
                fallback={
                  <div className="mx-2 my-2 h-40 animate-pulse rounded-md bg-muted/40" />
                }
              >
                <LearningSidebarNav
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
                ) : (
                  navEntries.map((entry) => {
                    const { href, label, icon: IconComponent } = entry.item
                    const active = isActive(href)
                    const nestedShell = mainNavHasNestedShell(href)
                    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
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
                            'flex min-w-0 w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-all',
                            sidebarCollapsed && 'lg:justify-center lg:px-2',
                            active
                              ? 'bg-primary/10 font-medium text-primary'
                              : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                          )}
                        >
                          <IconComponent className="h-4 w-4 shrink-0 opacity-90" />
                          <span
                            className={cn(
                              'min-w-0 flex-1 truncate',
                              sidebarCollapsed && 'lg:sr-only'
                            )}
                          >
                            {label}
                          </span>
                          {nestedShell ? (
                            <ChevronRight
                              className={cn(
                                'h-4 w-4 shrink-0 text-muted-foreground/70',
                                active && 'text-primary/80',
                                sidebarCollapsed && 'lg:sr-only'
                              )}
                              aria-hidden
                            />
                          ) : null}
                        </div>
                      </Link>
                    )
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
                  'relative shrink-0 rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
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
                  <span
                    className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-primary"
                    aria-hidden
                  />
                ) : null}
              </Link>

              <button
                type="button"
                onClick={() => void handleLogout()}
                className={cn(
                  'shrink-0 rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-destructive',
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

      {/* Main Content */}
      <div
        className={cn(
          'transition-[margin] duration-200',
          sidebarCollapsed ? 'lg:ml-16' : 'lg:ml-64'
        )}
      >
        {/* Breadcrumbs + mobile menu (no top profile — account lives in sidebar footer) */}
        <div className="sticky top-0 z-20 flex h-12 items-center justify-between gap-3 border-b border-border/20 bg-background/80 px-4 backdrop-blur-xl lg:px-6">
          <Breadcrumbs homeHref={homeHref} className="min-w-0" />
          <button
            type="button"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="rounded-lg p-2 hover:bg-muted lg:hidden"
            aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
          >
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {/* Page Content — one max width for every dashboard route */}
        <main className="p-4 lg:p-6">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
      {/* Floating Ask CodeSpectra AI assistant — available across the dashboard */}
      <AskCodeSpectra />
    </div>
  )
}
