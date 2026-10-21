'use client'

/**
 * Bottom tab bar for the installed app on phones/tablets (display-mode:
 * standalone, < lg). Pure CSS decides visibility (components/pwa/pwa.css), so
 * the browser layout and the desktop sidebar are untouched. The spacer keeps
 * page content clear of the bar and the home indicator (safe-area inset).
 */
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BookOpen, CalendarDays, Code2, LayoutDashboard, User } from 'lucide-react'
import { cn } from '@/lib/utils'

const TABS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/dashboard/problems', label: 'Practice', icon: Code2 },
  { href: '/dashboard/events', label: 'Events', icon: CalendarDays },
  { href: '/dashboard/courses', label: 'Learn', icon: BookOpen },
  { href: '/dashboard/profile', label: 'Profile', icon: User },
] as const

export function isTabActive(pathname: string, href: string, exact?: boolean): boolean {
  if (exact) return pathname === href
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function BottomNav() {
  const pathname = usePathname() || ''
  return (
    <>
      <div className="cs-bottom-nav-spacer" aria-hidden />
      <nav
        aria-label="App"
        className="cs-bottom-nav fixed inset-x-0 bottom-0 z-30 border-t border-border/70 bg-background/95 pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] backdrop-blur-xl"
      >
        <ul className="mx-auto grid w-full max-w-xl grid-cols-5">
          {TABS.map((t) => {
            const active = isTabActive(pathname, t.href, 'exact' in t ? t.exact : false)
            const Icon = t.icon
            return (
              <li key={t.href}>
                <Link
                  href={t.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
                    active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Icon className="h-5 w-5" aria-hidden />
                  {t.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </>
  )
}
