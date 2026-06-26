'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  Code, Trophy, BookOpen, Users, BarChart3, Settings, LogOut, Menu, X,
  Briefcase, Brain, MessageSquare, PlusSquare, Award, Play, Volume2, Zap
} from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { LEARNING_HUB_DEFAULT } from '@/lib/learning-query'
import { useSession } from '@/lib/auth-client'
import { normalizeUserRole, isAdmin as isAdminRole, type UserRole } from '@/lib/rbac'

interface NavItem {
  id: string
  label: string
  href: string
  icon: React.ReactNode
  badge?: string
  /** Optional role gate. If set, item (or submenu entry) is only rendered when the user role passes. */
  requires?: 'admin' | 'superadmin'
  submenu?: NavItem[]
}

const navItems: NavItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    href: '/dashboard',
    icon: <BarChart3 className="w-5 h-5" />,
  },
  {
    id: 'scanner',
    label: 'Code Scanner',
    href: '/dashboard/scanner',
    icon: <Code className="w-5 h-5" />,
  },
  {
    id: 'challenges',
    label: 'Challenges',
    href: '/dashboard/challenges',
    icon: <Trophy className="w-5 h-5" />,
    badge: 'New',
    submenu: [
      { id: 'challenges-all', label: 'All Challenges', href: '/dashboard/challenges', icon: <Trophy className="w-4 h-4" /> },
      { id: 'leaderboard', label: 'Leaderboard', href: '/dashboard/leaderboard', icon: <BarChart3 className="w-4 h-4" /> },
      { id: 'id-card', label: 'My ID Card', href: '/dashboard/id-card', icon: <Zap className="w-4 h-4" /> },
      // Hackathons admin entry — admin-only (server returns 403 for non-admins).
      { id: 'hackathons', label: 'Hackathons', href: '/dashboard/admin/hackathons', icon: <Trophy className="w-4 h-4" />, requires: 'admin' },
      { id: 'progress', label: 'My Progress', href: '/dashboard/challenges/progress', icon: <Zap className="w-4 h-4" /> },
    ]
  },
  {
    id: 'interviews',
    label: 'Mock Interviews',
    href: '/dashboard/interviews',
    icon: <Briefcase className="w-5 h-5" />,
    badge: 'Hot',
    submenu: [
      { id: 'interviews-all', label: 'All Interviews', href: '/dashboard/interviews', icon: <Briefcase className="w-4 h-4" /> },
      { id: 'coding', label: 'Coding Interview', href: '/dashboard/interviews/setup', icon: <Code className="w-4 h-4" /> },
      { id: 'behavioral', label: 'Behavioral', href: '/dashboard/interviews', icon: <MessageSquare className="w-4 h-4" /> },
      { id: 'feedback', label: 'Feedback & Analysis', href: '/dashboard/interviews/feedback', icon: <Brain className="w-4 h-4" /> },
    ]
  },
  {
    id: 'learning',
    label: 'Learning Hub',
    href: LEARNING_HUB_DEFAULT,
    icon: <BookOpen className="w-5 h-5" />,
    badge: 'Updated',
    submenu: [
      { id: 'learning-all', label: 'All Courses', href: LEARNING_HUB_DEFAULT, icon: <BookOpen className="w-4 h-4" /> },
      { id: 'video', label: 'Video Courses', href: '/dashboard/learning?view=all&level=all&type=video', icon: <Play className="w-4 h-4" /> },
      { id: 'audio', label: 'Audio Courses', href: '/dashboard/learning?view=all&level=all&type=audio', icon: <Volume2 className="w-4 h-4" /> },
      { id: 'text', label: 'Text Courses', href: '/dashboard/learning?view=all&level=all&type=text', icon: <BookOpen className="w-4 h-4" /> },
    ]
  },
  {
    id: 'achievements',
    label: 'Achievements',
    href: '/dashboard/achievements',
    icon: <Award className="w-5 h-5" />,
    submenu: [
      { id: 'badges', label: 'Badges', href: '/dashboard/achievements?tab=badges', icon: <Award className="w-4 h-4" /> },
      { id: 'achievements-list', label: 'Achievements', href: '/dashboard/achievements?tab=achievements', icon: <Trophy className="w-4 h-4" /> },
      { id: 'certifications', label: 'Certifications', href: '/dashboard/certifications', icon: <Award className="w-4 h-4" /> },
    ]
  },
  {
    id: 'prepare',
    label: 'Prep Kits',
    href: '/dashboard/prepare',
    icon: <PlusSquare className="w-5 h-5" />,
  },
  {
    id: 'analytics',
    label: 'Analytics',
    href: '/dashboard/analytics',
    icon: <BarChart3 className="w-5 h-5" />,
  },
]

const adminItems: NavItem[] = [
  {
    id: 'admin-dashboard',
    label: 'Admin Dashboard',
    href: '/admin',
    icon: <Settings className="w-5 h-5" />,
  },
  {
    id: 'learning-management',
    label: 'Learning Management',
    href: '/admin/learning',
    icon: <BookOpen className="w-5 h-5" />,
    submenu: [
      { id: 'create-course', label: 'Create Course', href: '/admin/learning/create', icon: <PlusSquare className="w-4 h-4" /> },
      { id: 'manage-courses', label: 'Manage Courses', href: '/admin/learning', icon: <BookOpen className="w-4 h-4" /> },
      { id: 'instructors', label: 'Instructors', href: '/admin/learning/instructors', icon: <Users className="w-4 h-4" /> },
    ]
  },
  {
    id: 'admin-hackathons',
    label: 'Hackathons',
    href: '/dashboard/admin/hackathons',
    icon: <Trophy className="w-5 h-5" />,
    requires: 'admin',
  },
  {
    id: 'admin-ai-inventory',
    label: 'AI Inventory',
    href: '/dashboard/admin/ai-inventory',
    icon: <Brain className="w-5 h-5" />,
    requires: 'admin',
  },
]

interface SidebarProps {
  isOpen?: boolean
  onClose?: () => void
}

/** Filter items by the visitor's role. Removes whole items and prunes submenu entries. */
function filterByRole(items: NavItem[], role: UserRole): NavItem[] {
  const passes = (req?: 'admin' | 'superadmin') => {
    if (!req) return true
    if (req === 'superadmin') return role === 'superadmin'
    return isAdminRole(role)
  }
  return items
    .filter((it) => passes(it.requires))
    .map((it) =>
      it.submenu
        ? { ...it, submenu: it.submenu.filter((s) => passes(s.requires)) }
        : it,
    )
}

export function Sidebar({ isOpen = true, onClose }: SidebarProps) {
  const pathname = usePathname()
  const { data: session } = useSession()
  const [expandedMenus, setExpandedMenus] = useState<string[]>([])

  const role = normalizeUserRole((session?.user as { role?: string } | undefined)?.role)
  const isAdminView = pathname.startsWith('/admin')

  const toggleSubmenu = (itemId: string) => {
    setExpandedMenus(prev =>
      prev.includes(itemId)
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]
    )
  }

  // Admin views are gated to admins; for non-admins fall back to user nav.
  const baseItems = isAdminView && isAdminRole(role) ? adminItems : navItems
  const menuItems = filterByRole(baseItems, role)

  return (
    <div data-testid="sidebar" className={cn(
      'fixed inset-y-0 left-0 z-40 w-64 bg-background border-r border-border overflow-y-auto transition-transform lg:translate-x-0',
      isOpen ? 'translate-x-0' : '-translate-x-full'
    )}>
      {/* Logo */}
      <div className="p-6 border-b border-border">
        <Link href="/dashboard" className="flex items-center gap-2" data-testid="sidebar-logo">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-white font-bold">
            CS
          </div>
          <div>
            <p className="font-bold text-foreground">CodeSpectra</p>
            <p className="text-xs text-foreground/60">Interview Prep</p>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="p-4 space-y-2" data-testid="sidebar-nav">
        {menuItems.map((item) => (
          <div key={item.id}>
            {item.submenu && item.submenu.length > 0 ? (
              <>
                <button
                  onClick={() => toggleSubmenu(item.id)}
                  data-testid={`sidebar-item-${item.id}`}
                  className={cn(
                    'w-full flex items-center justify-between px-4 py-2 rounded-lg transition',
                    expandedMenus.includes(item.id)
                      ? 'bg-primary/10 text-primary'
                      : 'text-foreground/70 hover:text-foreground hover:bg-muted'
                  )}
                >
                  <div className="flex items-center gap-3">
                    {item.icon}
                    <span className="font-medium">{item.label}</span>
                    {item.badge && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary">
                        {item.badge}
                      </span>
                    )}
                  </div>
                  <span className={cn(
                    'transition',
                    expandedMenus.includes(item.id) ? 'rotate-180' : ''
                  )}>
                    ▼
                  </span>
                </button>

                {expandedMenus.includes(item.id) && (
                  <div className="ml-4 mt-1 space-y-1 border-l border-border/50 pl-3">
                    {item.submenu.map((subitem) => (
                      <Link
                        key={subitem.id}
                        href={subitem.href}
                        data-testid={`sidebar-subitem-${subitem.id}`}
                        className={cn(
                          'flex items-center gap-2 px-3 py-2 rounded text-sm transition',
                          pathname === subitem.href
                            ? 'bg-primary/10 text-primary font-semibold'
                            : 'text-foreground/60 hover:text-foreground'
                        )}
                      >
                        {subitem.icon}
                        <span>{subitem.label}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <Link
                href={item.href}
                data-testid={`sidebar-item-${item.id}`}
                className={cn(
                  'flex items-center gap-3 px-4 py-2 rounded-lg transition',
                  pathname === item.href
                    ? 'bg-primary/10 text-primary font-semibold'
                    : 'text-foreground/70 hover:text-foreground hover:bg-muted'
                )}
              >
                {item.icon}
                <span className="font-medium flex-1">{item.label}</span>
                {item.badge && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary">
                    {item.badge}
                  </span>
                )}
              </Link>
            )}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-border space-y-2 bg-muted/30">
        <Button variant="outline" size="sm" className="w-full gap-2" data-testid="sidebar-settings-btn">
          <Settings className="w-4 h-4" />
          Settings
        </Button>
        <Button variant="ghost" size="sm" className="w-full gap-2 text-destructive hover:text-destructive" data-testid="sidebar-logout-btn">
          <LogOut className="w-4 h-4" />
          Logout
        </Button>
      </div>
    </div>
  )
}

export function MobileMenuButton() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={() => setIsOpen(!isOpen)}
        data-testid="mobile-menu-toggle"
      >
        {isOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </Button>
      {isOpen && <Sidebar isOpen={isOpen} onClose={() => setIsOpen(false)} />}
    </>
  )
}
