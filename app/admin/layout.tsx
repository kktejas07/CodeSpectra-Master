'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Code2, Menu, X, BarChart3, BookOpen, Trophy, Settings, Users, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const navItems = [
    { href: '/admin', icon: BarChart3, label: 'Dashboard' },
    { href: '/admin/users', icon: Users, label: 'Users' },
    { href: '/admin/challenges', icon: Trophy, label: 'Challenges' },
    { href: '/admin/courses', icon: BookOpen, label: 'Courses' },
    { href: '/admin/settings', icon: Settings, label: 'Settings' },
  ]

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar */}
      <aside className={`fixed left-0 top-0 h-screen w-64 bg-gradient-to-b from-card to-card/80 border-r border-border/50 z-40 transform transition-transform ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      } lg:translate-x-0`}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="p-6 border-b border-border/50">
            <Link href="/admin" className="flex items-center gap-2 group">
              <div className="w-8 h-8 bg-gradient-to-br from-primary to-primary/60 rounded-lg flex items-center justify-center group-hover:shadow-lg transition-shadow">
                <Code2 className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="font-bold text-foreground group-hover:text-primary transition-colors">CodeSpectra</span>
            </Link>
            <p className="text-xs text-muted-foreground mt-2 font-medium">Admin Panel</p>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-1">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href}>
                <div className="px-4 py-3 rounded-lg flex items-center gap-3 text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition text-sm font-medium group">
                  <item.icon className="w-4 h-4 group-hover:text-primary transition-colors" />
                  <span>{item.label}</span>
                </div>
              </Link>
            ))}
          </nav>

          {/* Logout */}
          <div className="p-4 border-t border-border/50">
            <Button variant="ghost" className="w-full justify-start text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all duration-200 rounded-lg">
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="lg:ml-64">
        {/* Top Bar */}
        <header className="sticky top-0 h-16 bg-gradient-to-r from-card to-card/80 border-b border-border/50 z-30">
          <div className="h-full px-6 flex items-center justify-between">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden p-2 hover:bg-muted rounded-lg transition-colors"
            >
              {sidebarOpen ? (
                <X className="w-6 h-6" />
              ) : (
                <Menu className="w-6 h-6" />
              )}
            </button>

            <div className="flex-1 flex justify-end items-center gap-4">
              <div className="flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-muted/50 transition-colors">
                <div className="w-8 h-8 bg-gradient-to-br from-primary to-primary/60 rounded-lg flex items-center justify-center shadow-md">
                  <span className="text-primary-foreground text-xs font-bold">A</span>
                </div>
                <span className="text-sm font-medium text-foreground">Admin</span>
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="p-6 bg-gradient-to-br from-background via-background to-primary/5">
          {children}
        </main>
      </div>
    </div>
  )
}
