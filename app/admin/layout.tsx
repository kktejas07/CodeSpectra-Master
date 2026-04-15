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
      <aside className={`fixed left-0 top-0 h-screen w-64 bg-card border-r border-border z-40 transform transition-transform ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      } lg:translate-x-0`}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="p-6 border-b border-border">
            <Link href="/admin" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <Code2 className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="font-bold text-foreground">CodeSpectra</span>
            </Link>
            <p className="text-xs text-foreground/50 mt-2">Admin Panel</p>
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
            <Button variant="ghost" className="w-full justify-start text-foreground/70 hover:text-foreground">
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
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                  <span className="text-primary-foreground text-xs font-bold">A</span>
                </div>
                <span className="text-sm font-medium text-foreground">Admin</span>
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
