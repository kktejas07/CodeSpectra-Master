'use client'

import Link from 'next/link'
import { useState, useMemo } from 'react'
import { Search, ChevronRight, BookOpen, Code2, Zap, Shield, Settings, Trophy, Users, BarChart3, Terminal, MessageSquare, Menu, X, ChevronDown, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { PublicPageWrapper } from '@/app/public-layout'

const docStructure = [
  {
    title: 'Getting Started',
    icon: Zap,
    items: [
      { label: 'What is CodeSpectra?', href: '/about', desc: 'Platform overview and key capabilities' },
      { label: 'Quick Start Guide', href: '/auth/signup', desc: 'Create your account in minutes' },
      { label: 'Dashboard Tour', href: '/dashboard', desc: 'Navigate your personal dashboard' },
      { label: 'Account Settings', href: '/dashboard/settings', desc: 'Manage profile, security, and preferences' },
      { label: 'Roles & Permissions', href: '/admin/roles', desc: 'Understanding user roles and access levels' },
    ],
  },
  {
    title: 'Code Analysis',
    icon: Code2,
    items: [
      { label: 'Manual Code Scan', href: '/dashboard/scanner?mode=manual', desc: 'Submit code for instant analysis' },
      { label: 'GitHub Integration', href: '/dashboard/admin/integrations', desc: 'Auto-scan repositories on push' },
      { label: 'Issue Types', href: '/dashboard/scanner', desc: 'Bugs, vulnerabilities, code smells, and more' },
      { label: 'Quality Gates', href: '/dashboard/scanner', desc: 'Set quality thresholds and enforce standards' },
      { label: 'AI-Powered Fixes', href: '/dashboard/scanner', desc: 'Get intelligent fix suggestions' },
      { label: 'Analysis Reports', href: '/dashboard/analytics', desc: 'View and export detailed reports' },
    ],
  },
  {
    title: 'Learning & Challenges',
    icon: Trophy,
    items: [
      { label: 'Coding Challenges', href: '/dashboard/challenges', desc: 'Solve problems across multiple domains' },
      { label: 'Arena Mode', href: '/dashboard/arena', desc: 'Real-time competitive coding battles' },
      { label: 'Learning Tracks', href: '/dashboard/tracks', desc: 'Structured learning paths with milestones' },
      { label: 'Daily Challenges', href: '/dashboard', desc: 'New challenges every day' },
      { label: 'Leaderboards', href: '/dashboard/leaderboard', desc: 'Compare performance with peers' },
      { label: 'Codeathons', href: '/dashboard/codeathons', desc: 'Timed coding events and competitions' },
    ],
  },
  {
    title: 'Courses & Exams',
    icon: BookOpen,
    items: [
      { label: 'Course Catalog', href: '/dashboard/learning', desc: 'Browse available courses' },
      { label: 'Taking Exams', href: '/dashboard/exams', desc: 'Timed assessments with proctoring' },
      { label: 'Certifications', href: '/dashboard/certifications', desc: 'Earn verifiable certificates' },
      { label: 'Progress Tracking', href: '/dashboard/learning', desc: 'Monitor completion and scores' },
    ],
  },
  {
    title: 'Career Development',
    icon: Users,
    items: [
      { label: 'Dynamic Interviews', href: '/dashboard/interviews/dynamic', desc: 'AI-powered interview simulations' },
      { label: 'Interview Feedback', href: '/dashboard/interviews/feedback', desc: 'Review performance and improve' },
      { label: 'Resume Builder', href: '/dashboard/resumes', desc: 'Create and manage professional resumes' },
      { label: 'Job Listings', href: '/dashboard/jobs', desc: 'Browse and apply to positions' },
      { label: 'Skill Analytics', href: '/dashboard/skill-analytics', desc: 'Identify skill gaps and growth areas' },
    ],
  },
  {
    title: 'Administration',
    icon: Shield,
    items: [
      { label: 'User Management', href: '/dashboard/admin/users', desc: 'Create and manage user accounts' },
      { label: 'Team Management', href: '/dashboard/admin/team', desc: 'Organize users into teams' },
      { label: 'Platform Settings', href: '/dashboard/admin/settings', desc: 'Configure global platform options' },
      { label: 'Security Settings', href: '/dashboard/admin/security', desc: 'Configure authentication and access controls' },
      { label: 'Audit Logs', href: '/dashboard/admin/audit-logs', desc: 'Track all administrative changes' },
      { label: 'System Health', href: '/dashboard/admin/system', desc: 'Monitor platform performance and status' },
    ],
  },
  {
    title: 'Billing & Plans',
    icon: Settings,
    items: [
      { label: 'Pricing Plans', href: '/pricing', desc: 'Compare available subscription tiers' },
      { label: 'Subscription Management', href: '/dashboard/billing', desc: 'Manage your active subscription' },
      { label: 'Payment Methods', href: '/dashboard/billing', desc: 'Add and manage payment options' },
      { label: 'Invoices & Receipts', href: '/dashboard/billing', desc: 'View and download billing history' },
      { label: 'Admin Billing', href: '/dashboard/admin/pricing', desc: 'Configure organization billing' },
    ],
  },
  {
    title: 'Integrations',
    icon: Terminal,
    items: [
      { label: 'GitHub', href: '/dashboard/admin/integrations', desc: 'Repository scanning and OAuth' },
      { label: 'Google Sign-In', href: '/auth/login', desc: 'OAuth authentication with Google' },
      { label: 'Slack', href: '/dashboard/admin/settings', desc: 'Real-time notifications in Slack' },
      { label: 'Razorpay', href: '/dashboard/admin/pricing', desc: 'Payment processing integration' },
      { label: 'OpenAI', href: '/dashboard/admin/settings', desc: 'AI-powered code explanations' },
      { label: 'Email (SMTP)', href: '/dashboard/admin/settings', desc: 'Configure email notifications' },
    ],
  },
  {
    title: 'API & Developers',
    icon: Terminal,
    items: [
      { label: 'Authentication', href: '/api-reference#auth', desc: 'Firebase Auth integration' },
      { label: 'REST API', href: '/api-reference', desc: 'API endpoints and usage' },
      { label: 'Code Analysis API', href: '/api-reference#analyze', desc: 'Programmatic code scanning' },
      { label: 'Webhooks', href: '/api-reference#webhooks', desc: 'Event-driven integrations' },
      { label: 'Rate Limits', href: '/api-reference', desc: 'API usage limits and best practices' },
    ],
  },
]

export default function DocsPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [activeSection, setActiveSection] = useState<string | null>(null)

  const filteredSections = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return docStructure
    return docStructure
      .map((s) => ({
        ...s,
        items: s.items.filter(
          (a) => a.label.toLowerCase().includes(q) || s.title.toLowerCase().includes(q) || a.desc.toLowerCase().includes(q)
        ),
      }))
      .filter((s) => s.items.length > 0)
  }, [searchQuery])

  return (
    <PublicPageWrapper>
      <div className="flex min-h-screen">
        {/* Sidebar */}
        <aside className={cn(
          "fixed inset-y-0 left-0 z-40 w-72 border-r border-border/40 bg-background/95 backdrop-blur-xl transform transition-transform duration-300 lg:translate-x-0 lg:static lg:z-auto",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}>
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between p-4 border-b border-border/40">
              <Link href="/docs" className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-primary" />
                <span className="font-semibold">Documentation</span>
              </Link>
              <button onClick={() => setSidebarOpen(false)} className="lg:hidden p-1 hover:bg-muted rounded">
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto p-4 space-y-1">
              {docStructure.map((section) => {
                const Icon = section.icon
                const isActive = activeSection === section.title
                return (
                  <div key={section.title}>
                    <button
                      onClick={() => setActiveSection(isActive ? null : section.title)}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted transition-colors"
                    >
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <span className="flex-1 text-left">{section.title}</span>
                      <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", isActive && "rotate-180")} />
                    </button>
                    {isActive && (
                      <div className="ml-6 mt-1 space-y-0.5">
                        {section.items.map((item) => (
                          <Link
                            key={item.label}
                            href={item.href}
                            className="block rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                          >
                            {item.label}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </nav>
          </div>
        </aside>

        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />
        )}

        {/* Main content */}
        <main className="flex-1 min-w-0">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {/* Mobile menu button & breadcrumb */}
            <div className="flex items-center gap-3 mb-8">
              <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 -ml-2 hover:bg-muted rounded-lg">
                <Menu className="h-5 w-5" />
              </button>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Link href="/" className="hover:text-foreground">Home</Link>
                <ChevronRight className="h-3.5 w-3.5" />
                <span className="text-foreground font-medium">Documentation</span>
              </div>
            </div>

            {/* Search */}
            <div className="relative max-w-xl mb-12">
              <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search documentation..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-border/40 bg-background py-3 pl-12 pr-4 text-sm transition-colors hover:border-primary/40 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>

            {/* Content */}
            {searchQuery ? (
              <div className="space-y-8">
                <h2 className="text-xl font-semibold">Search Results</h2>
                {filteredSections.length === 0 ? (
                  <p className="text-muted-foreground">No results found for &quot;{searchQuery}&quot;</p>
                ) : (
                  filteredSections.map((section) => (
                    <div key={section.title}>
                      <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                        <section.icon className="h-4 w-4 text-primary" />
                        {section.title}
                      </h3>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {section.items.map((item) => (
                          <Link
                            key={item.label}
                            href={item.href}
                            className="group rounded-lg border border-border/40 p-4 hover:border-primary/40 hover:bg-primary/5 transition-all"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className="text-sm font-medium group-hover:text-primary transition-colors">{item.label}</span>
                              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">{item.desc}</p>
                          </Link>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <>
                <div className="mb-12">
                  <h1 className="text-4xl font-bold mb-3">CodeSpectra Documentation</h1>
                  <p className="text-lg text-muted-foreground max-w-2xl">
                    Everything you need to know about using CodeSpectra. Browse by category below or use the search to find specific topics.
                  </p>
                </div>

                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {docStructure.map((section) => {
                    const Icon = section.icon
                    return (
                      <Link
                        key={section.title}
                        href={section.items[0].href}
                        className="group rounded-xl border border-border/40 p-6 hover:border-primary/40 hover:shadow-sm transition-all"
                      >
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 mb-4 group-hover:bg-primary/20 transition-colors">
                          <Icon className="h-5 w-5 text-primary" />
                        </div>
                        <h3 className="font-semibold mb-1 group-hover:text-primary transition-colors">{section.title}</h3>
                        <p className="text-sm text-muted-foreground mb-3">{section.items.length} topics</p>
                        <ul className="space-y-1.5">
                          {section.items.slice(0, 4).map((item) => (
                            <li key={item.label} className="text-xs text-muted-foreground flex items-center gap-1.5">
                              <span className="h-1 w-1 rounded-full bg-muted-foreground/40 shrink-0" />
                              {item.label}
                            </li>
                          ))}
                          {section.items.length > 4 && (
                            <li className="text-xs text-primary">+{section.items.length - 4} more</li>
                          )}
                        </ul>
                      </Link>
                    )
                  })}
                </div>

                <div className="mt-16 rounded-xl border border-primary/20 bg-primary/5 p-8">
                  <div className="flex items-start gap-4">
                    <MessageSquare className="mt-0.5 h-6 w-6 shrink-0 text-primary" />
                    <div>
                      <h3 className="mb-2 text-lg font-semibold">Still have questions?</h3>
                      <p className="mb-4 text-sm text-muted-foreground max-w-xl">
                        Our support team is ready to help. Check the FAQ for common questions or reach out directly.
                      </p>
                      <div className="flex flex-wrap gap-3">
                        <Button asChild>
                          <Link href="/support">Contact Support</Link>
                        </Button>
                        <Button variant="outline" asChild>
                          <Link href="/faq">View FAQ</Link>
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </main>
      </div>
    </PublicPageWrapper>
  )
}
