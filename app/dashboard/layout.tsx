'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { getNavItems, UserRole, isAdmin, isSuperAdmin } from '@/lib/rbac'
import { Home, Trophy, Code2 as CodeIcon, BookOpen, BarChart3, Settings, LogOut, Star, Bell, Search, ChevronDown, Shield, Users, Menu, X, MoreHorizontal, Lock, FileText, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { signOut } from '@/lib/auth-service'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { ThemeSwitcher } from '@/components/theme-switcher'
import { CommandMenu } from '@/components/command-menu'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { createClient } from '@supabase/supabase-js'

// Icon mapping for dynamic icons
const iconMap: Record<string, any> = {
  'Home': Home,
  'Trophy': Trophy,
  'Code2': CodeIcon,
  'BookOpen': BookOpen,
  'BarChart3': BarChart3,
  'Settings': Settings,
  'LogOut': LogOut,
  'Star': Star,
  'Bell': Bell,
  'Search': Search,
  'ChevronDown': ChevronDown,
  'Shield': Shield,
  'Users': Users,
  'Menu': Menu,
  'X': X,
  'MoreHorizontal': MoreHorizontal,
  'Lock': Lock,
  'FileText': FileText,
  'User': User,
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [userProfile, setUserProfile] = useState<any>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // Fetch user profile on mount
  useEffect(() => {
    const fetchUserProfile = async () => {
      try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        
        if (!supabaseUrl || !supabaseKey) {
          console.log('[v0] Missing Supabase config')
          return
        }

        const supabase = createClient(supabaseUrl, supabaseKey)
        
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          console.log('[v0] No authenticated user')
          return
        }

        // Try to get profile from profiles table
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single()

        if (data) {
          setUserProfile(data)
          console.log('[v0] Profile loaded:', data.role)
        } else if (error?.code === 'PGRST116') {
          // Profile doesn't exist, create it
          console.log('[v0] Creating new profile for user...')
          const newProfile = {
            id: user.id,
            full_name: user.user_metadata?.full_name || 'User',
            email: user.email || '',
            role: user.user_metadata?.role || 'user',
          }
          
          const { data: created } = await supabase
            .from('profiles')
            .insert([newProfile])
            .select()
            .single()

          if (created) {
            setUserProfile(created)
          } else {
            // Fallback to auth metadata
            setUserProfile(newProfile)
          }
        } else if (error) {
          console.log('[v0] Error fetching profile:', error.message)
          // Use auth metadata as fallback
          setUserProfile({
            id: user.id,
            full_name: user.user_metadata?.full_name || 'User',
            email: user.email || '',
            role: user.user_metadata?.role || 'user',
          })
        }
      } catch (error) {
        console.error('[v0] Error in fetchUserProfile:', error)
        // Set minimal fallback profile
        setUserProfile({
          full_name: 'User',
          email: '',
          role: 'user',
        })
      }
    }

    fetchUserProfile()
  }, [])

  // Get dynamic nav items based on role
  const getDynamicNavItems = () => {
    if (!userProfile?.role) return []
    
    const baseItems = [
      { href: '/dashboard', icon: Home, label: 'Overview' },
      { href: '/dashboard/arena', icon: Trophy, label: 'Arena' },
      { href: '/dashboard/scanner', icon: CodeIcon, label: 'Scanner' },
      { href: '/dashboard/learning', icon: BookOpen, label: 'Learning' },
      { href: '/dashboard/leaderboard', icon: BarChart3, label: 'Leaderboard' },
      { href: '/dashboard/achievements', icon: Star, label: 'Achievements' },
    ]

    // Admin users get Team Management instead of regular overview
    if (isAdmin(userProfile.role as UserRole)) {
      return [
        { href: '/dashboard', icon: Home, label: 'Overview' },
        { href: '/dashboard/admin', icon: isSuperAdmin(userProfile.role as UserRole) ? Shield : Users, label: isSuperAdmin(userProfile.role as UserRole) ? 'System Admin' : 'Team Management' },
        ...baseItems.slice(1)
      ]
    }

    return baseItems
  }

  const navItems = getDynamicNavItems()
  const dynamicNavItems = navItems.length > 0 ? navItems : [
    { href: '/dashboard', icon: Home, label: 'Overview' },
    { href: '/dashboard/arena', icon: Trophy, label: 'Arena' },
    { href: '/dashboard/scanner', icon: CodeIcon, label: 'Scanner' },
    { href: '/dashboard/learning', icon: BookOpen, label: 'Learning' },
    { href: '/dashboard/leaderboard', icon: BarChart3, label: 'Leaderboard' },
    { href: '/dashboard/achievements', icon: Star, label: 'Achievements' },
  ]

  const Code2 = () => null

  const handleLogout = async () => {
    const result = await signOut()
    if (result.success) {
      router.push('/auth/login')
    }
  }

  const isActive = (href: string) => {
    if (href === '/dashboard') {
      return pathname === '/dashboard'
    }
    return pathname.startsWith(href)
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed left-0 top-0 h-screen w-64 bg-card border-r border-border/40 z-40 transform transition-transform duration-200 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      } lg:translate-x-0`}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="h-16 px-6 flex items-center border-b border-border/40">
            <Link href="/dashboard" className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <Code2 className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="text-lg font-semibold">CodeSpectra</span>
            </Link>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto p-4 space-y-1">
            {/* Render grouped navigation */}
            {dynamicNavItems.reduce((groups: any[], item: any) => {
              const group = groups.find(g => g.section === item.section)
              if (group) {
                group.items.push(item)
              } else {
                groups.push({ section: item.section, items: [item] })
              }
              return groups
            }, []).map((group: any, idx: number) => (
              <div key={group.section}>
                {idx > 0 && <div className="my-3 h-px bg-border/30" />}
                {group.items.map((item: any) => {
                  const active = isActive(item.href)
                  const IconComponent = typeof item.icon === 'string' ? iconMap[item.icon] : item.icon
                  return (
                    <Link key={item.href} href={item.href}>
                      <div className={`px-3 py-2.5 rounded-lg flex items-center gap-3 text-sm font-medium transition-colors ${
                        active 
                          ? 'bg-primary/10 text-primary' 
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                      }`}>
                        {IconComponent && <IconComponent className={`w-4 h-4 ${active ? 'text-primary' : ''}`} />}
                        <span>{item.label}</span>
                      </div>
                    </Link>
                  )
                })}
              </div>
            ))}
          </nav>

          {/* Bottom Section - Search, Theme, Notifications */}
          <div className="p-4 border-t border-border/40 space-y-3">
            {/* Search Button */}
            <button 
              onClick={() => {}} 
              className="w-full px-3 py-2 rounded-lg bg-muted hover:bg-muted/80 transition-colors flex items-center gap-2 text-sm text-muted-foreground"
            >
              <Search className="w-4 h-4" />
              <span>Search</span>
              <span className="ml-auto text-xs opacity-50">⌘K</span>
            </button>

            {/* Controls */}
            <div className="flex items-center justify-between gap-2">
              {/* Theme Switcher */}
              <ThemeSwitcher />

              {/* Notifications */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="p-2 hover:bg-muted rounded-lg transition-colors relative flex-1">
                    <Bell className="w-4 h-4 text-muted-foreground mx-auto" />
                    <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-primary rounded-full" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" side="right" className="w-80 ml-2">
                  <div className="p-3 border-b border-border">
                    <p className="font-semibold text-sm">Notifications</p>
                  </div>
                  <div className="p-3 max-h-64 overflow-y-auto">
                    <div className="space-y-2">
                      <div className="p-2 bg-primary/5 rounded border border-primary/20 text-xs">
                        <p className="font-medium">Challenge Completed</p>
                        <p className="text-muted-foreground">Docker mastery challenge</p>
                      </div>
                      <div className="p-2 bg-muted rounded border border-border text-xs">
                        <p className="font-medium">Achievement Unlocked</p>
                        <p className="text-muted-foreground">Bronze Developer badge</p>
                      </div>
                    </div>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* More Menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="p-2 hover:bg-muted rounded-lg transition-colors flex-1">
                    <MoreHorizontal className="w-4 h-4 text-muted-foreground mx-auto" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" side="right" className="w-56 ml-2">
                  <div className="p-3 border-b border-border">
                    <p className="text-sm font-semibold">Quick Links</p>
                  </div>
                  <DropdownMenuItem asChild>
                    <Link href="/dashboard/profile">Profile</Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <a href="https://docs.example.com" target="_blank" rel="noopener noreferrer">Documentation</a>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <a href="https://help.example.com" target="_blank" rel="noopener noreferrer">Help & Support</a>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* User Profile */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="w-8 h-8 rounded-full bg-primary flex items-center justify-center hover:bg-primary/90 transition-colors">
                    <span className="text-xs font-semibold text-primary-foreground">
                      {userProfile?.full_name?.charAt(0) || 'U'}
                    </span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" side="right" className="w-56 ml-2">
                  <div className="p-3 border-b border-border">
                    <p className="text-sm font-medium">{userProfile?.full_name || 'User'}</p>
                    <p className="text-xs text-muted-foreground">{userProfile?.email}</p>
                    <p className="text-xs text-primary capitalize font-semibold mt-1">{userProfile?.role || 'user'}</p>
                  </div>
                  <DropdownMenuItem asChild>
                    <Link href="/dashboard/settings">Settings</Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="text-destructive cursor-pointer">
                    <LogOut className="w-4 h-4 mr-2" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Logout Button - Remove old one */}
        </div>
      </aside>

      {/* Main Content */}
      <div className="lg:ml-64">
        {/* Breadcrumbs */}
        <div className="sticky top-0 h-10 bg-background/80 backdrop-blur-xl border-b border-border/20 z-20 px-4 lg:px-6 flex items-center">
          <Breadcrumbs />
        </div>

        {/* Top Bar */}
        <header className="sticky top-10 h-16 bg-background/80 backdrop-blur-xl border-b border-border/40 z-30">
          <div className="h-full px-4 lg:px-6 flex items-center justify-between gap-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden p-2 hover:bg-muted rounded-lg transition-colors"
            >
              {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            {/* Spacer */}
            <div className="flex-1" />

            {/* User Profile Dropdown - Header */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-muted transition-colors cursor-pointer">
                  <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                    <span className="text-primary-foreground text-sm font-medium">
                      {userProfile?.full_name?.charAt(0) || 'U'}
                    </span>
                  </div>
                  <div className="hidden sm:flex flex-col items-start">
                    <span className="text-sm font-medium leading-tight">{userProfile?.full_name || 'User'}</span>
                    <span className="text-xs text-muted-foreground capitalize">{userProfile?.role || 'user'}</span>
                  </div>
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <div className="p-3 border-b border-border">
                  <p className="text-sm font-medium">{userProfile?.full_name || 'User'}</p>
                  <p className="text-xs text-muted-foreground">{userProfile?.email || 'user@example.com'}</p>
                  <p className="text-xs text-primary capitalize mt-1 font-semibold">{userProfile?.role || 'user'}</p>
                </div>
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/settings">Settings</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/profile">Profile</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-destructive cursor-pointer">
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page Content */}
        <main className="p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
