'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Code2, Menu, X, Home, Trophy, BookOpen, BarChart3, Settings, LogOut, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { signOut } from '@/lib/auth-service'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const navItems = [
    { href: '/dashboard', icon: Home, label: 'Overview' },
    { href: '/dashboard/arena', icon: Trophy, label: 'Coding Arena' },
    { href: '/dashboard/scanner', icon: Code2, label: 'Code Scanner' },
    { href: '/dashboard/learning', icon: BookOpen, label: 'Learning' },
    { href: '/dashboard/leaderboard', icon: BarChart3, label: 'Leaderboard' },
    { href: '/dashboard/achievements', icon: Star, label: 'Achievements' },
    { href: '/dashboard/settings', icon: Settings, label: 'Settings' },
  ]

  const handleLogout = async () => {
    const result = await signOut()
    if (result.success) {
      router.push('/auth/login')
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar */}
      <aside className={`fixed left-0 top-0 h-screen w-64 bg-card border-r border-border z-40 transform transition-transform ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      } lg:translate-x-0`}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="p-6 border-b border-border">
            <Link href="/dashboard" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <Code2 className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="font-bold text-foreground">CodeSpectra</span>
            </Link>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-6 space-y-2">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href}>
                <div className="px-4 py-3 rounded-lg hover:bg-card-foreground/5 transition flex items-center gap-3 text-foreground/70 hover:text-foreground">
                  <item.icon className="w-5 h-5" />
                  <span className="text-sm font-medium">{item.label}</span>
                </div>
              </Link>
            ))}
          </nav>

          {/* Logout */}
          <div className="p-6 border-t border-border">
            <Button 
              onClick={handleLogout}
              variant="ghost" 
              className="w-full justify-start text-foreground/70 hover:text-foreground hover:bg-destructive/10"
            >
              <LogOut className="w-5 h-5 mr-3" />
              Sign Out
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="lg:ml-64">
        {/* Top Bar */}
        <header className="sticky top-0 h-16 bg-card border-b border-border z-30">
          <div className="h-full px-6 flex items-center justify-between">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden text-foreground"
            >
              {sidebarOpen ? (
                <X className="w-6 h-6" />
              ) : (
                <Menu className="w-6 h-6" />
              )}
            </button>

            <div className="flex-1 flex justify-end items-center gap-4">
              {/* User Profile */}
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                  <span className="text-primary-foreground text-xs font-bold">U</span>
                </div>
                <span className="text-sm font-medium text-foreground">User</span>
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
