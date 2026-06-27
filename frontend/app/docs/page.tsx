'use client'

import Link from 'next/link'
import { useState, useMemo } from 'react'
import { Search, ChevronRight, BookOpen, Code2, Zap, Shield, Settings, Trophy, Users, BarChart3, Terminal, MessageSquare, Menu, X, ChevronDown, ExternalLink, CheckCircle, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { PublicPageWrapper } from '@/app/public-layout'

type DocItem = {
  id: string
  label: string
  desc: string
  href: string
}

type DocSection = {
  id: string
  title: string
  icon: typeof Zap
  content: string
  features: { title: string; text: string }[]
  items: DocItem[]
}

const docSections: DocSection[] = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    icon: Zap,
    content: 'CodeSpectra is a unified platform for developers who want to write better code, learn new skills, and advance their careers. Unlike traditional learning platforms that focus only on theory, CodeSpectra combines static code analysis, AI-powered fixes, structured learning paths, coding challenges, interview simulations, and career tools in one workspace. Your account ties everything together — scan a real project, practice in the arena, take a course, then apply for roles with certificates and a polished resume, all without switching between tools.',
    features: [
      { title: 'Unified dashboard', text: 'Every module — scanner, challenges, courses, interviews, jobs — is accessible from one sidebar after a single sign-in.' },
      { title: 'Progress persistence', text: 'Scans, completed challenges, course progress, interview feedback, and certificates are tied to your account and persist across sessions.' },
      { title: 'Role-based access', text: 'Learners access their own content; admins manage users, teams, and platform settings. Your role determines what you see.' },
      { title: 'Integration ready', text: 'Connect GitHub for repository context, Google for faster sign-in, and Slack for notifications — all from the settings panel.' },
    ],
    items: [
      { id: 'what-is-codespectra', label: 'What is CodeSpectra?', desc: 'Platform overview and key capabilities', href: '/docs#getting-started' },
      { id: 'quick-start', label: 'Quick Start Guide', desc: 'Create your account in minutes', href: '/auth/signup' },
      { id: 'dashboard-tour', label: 'Dashboard Tour', desc: 'Navigate your personal dashboard', href: '/dashboard' },
      { id: 'account-settings', label: 'Account Settings', desc: 'Manage profile, security, and preferences', href: '/dashboard/settings' },
      { id: 'roles', label: 'Roles & Permissions', desc: 'Understanding user roles and access levels', href: '/docs#roles-section' },
    ],
  },
  {
    id: 'code-analysis',
    title: 'Code Analysis',
    icon: Code2,
    content: 'The code analysis engine scans your source code for bugs, vulnerabilities, code smells, and maintainability issues. It supports multiple languages and provides severity-ranked results so you know what to fix first. Each issue includes an explanation, the exact location in your code, and (when available) an AI-generated fix suggestion. You can submit code manually through the web interface or connect a GitHub repository for automatic scanning on every push.',
    features: [
      { title: 'Multi-language support', text: 'Scan TypeScript, JavaScript, Python, Java, Go, Rust, and more. The parser automatically detects the language from the file extension or content.' },
      { title: 'Severity classification', text: 'Every issue is tagged as error, warning, or info. Quality gates let you enforce rules like "zero errors before merge".' },
      { title: 'AI-assisted fixes', text: 'For many issue types, the engine generates a suggested fix with a diff preview. Review the change and apply it directly or copy the recommendation.' },
      { title: 'Historical trends', text: 'The analytics dashboard tracks issue counts over time so you can see whether your codebase is improving after each scan.' },
    ],
    items: [
      { id: 'manual-scan', label: 'Manual Code Scan', desc: 'Submit code for instant analysis', href: '/dashboard/scanner?mode=manual' },
      { id: 'github-scan', label: 'GitHub Integration', desc: 'Auto-scan repositories on push', href: '/dashboard/admin/integrations' },
      { id: 'issue-types', label: 'Issue Types', desc: 'Bugs, vulnerabilities, code smells, and more', href: '/docs#issue-types-section' },
      { id: 'quality-gates', label: 'Quality Gates', desc: 'Set quality thresholds and enforce standards', href: '/docs#quality-gates-section' },
      { id: 'ai-fixes', label: 'AI-Powered Fixes', desc: 'Get intelligent fix suggestions', href: '/docs#ai-fixes-section' },
      { id: 'reports', label: 'Analysis Reports', desc: 'View and export detailed reports', href: '/dashboard/analytics' },
    ],
  },
  {
    id: 'challenges',
    title: 'Learning & Challenges',
    icon: Trophy,
    content: 'The challenges module lets you practice coding through structured problems, timed competitions, and real-time arena battles. Problems span multiple difficulty levels and domains including algorithms, data structures, system design, and debugging. Each challenge includes test cases, a built-in code editor, and immediate pass/fail feedback. Arena mode pairs you with other learners for head-to-head competition, and the leaderboard tracks your performance over time.',
    features: [
      { title: 'Structured difficulty', text: 'Problems are categorized as easy, medium, hard, and expert. Start where you are comfortable and progress as your skills grow.' },
      { title: 'Real-time arena', text: 'Arena mode matches you with peers for timed coding battles. Solve the same problem faster or more efficiently than your opponent to win.' },
      { title: 'Daily challenges', text: 'A new problem every day keeps your skills sharp. Complete the daily challenge to build streaks and earn badges.' },
      { title: 'Leaderboards', text: 'Compare your performance across challenges, arenas, and codeathons. Filter by domain, difficulty, or time period.' },
    ],
    items: [
      { id: 'challenges', label: 'Coding Challenges', desc: 'Solve problems across multiple domains', href: '/dashboard/challenges' },
      { id: 'arena', label: 'Arena Mode', desc: 'Real-time competitive coding battles', href: '/dashboard/arena' },
      { id: 'tracks', label: 'Learning Tracks', desc: 'Structured learning paths with milestones', href: '/dashboard/tracks' },
      { id: 'daily', label: 'Daily Challenges', desc: 'New challenges every day', href: '/dashboard' },
      { id: 'leaderboard', label: 'Leaderboards', desc: 'Compare performance with peers', href: '/dashboard/leaderboard' },
      { id: 'codeathons', label: 'Codeathons', desc: 'Timed coding events and competitions', href: '/dashboard/codeathons' },
    ],
  },
  {
    id: 'courses',
    title: 'Courses & Exams',
    icon: BookOpen,
    content: 'The learning module offers structured courses that combine lessons, quizzes, and hands-on exercises. Each course has a clear curriculum with milestones. Exams are timed assessments that test your knowledge, and passing an exam earns you a verifiable certificate. Progress tracking shows your completion percentage, scores, and time spent across all enrolled courses. Certificates can be shared on LinkedIn or included in your resume.',
    features: [
      { title: 'Structured curriculum', text: 'Courses are organized into modules with lessons, quizzes, and practical exercises. Each module builds on the previous one.' },
      { title: 'Timed exams', text: 'Exams simulate real-world pressure with countdown timers. Questions cover multiple formats: multiple choice, code writing, and debugging.' },
      { title: 'Verifiable certificates', text: 'Pass an exam to earn a certificate with a unique verification code. Employers and peers can verify authenticity online.' },
      { title: 'Progress dashboard', text: 'See completion percentages, scores, time spent, and streak data for all enrolled courses and upcoming exams.' },
    ],
    items: [
      { id: 'catalog', label: 'Course Catalog', desc: 'Browse available courses', href: '/dashboard/learning' },
      { id: 'exams', label: 'Taking Exams', desc: 'Timed assessments with proctoring', href: '/dashboard/exams' },
      { id: 'certifications', label: 'Certifications', desc: 'Earn verifiable certificates', href: '/dashboard/certifications' },
      { id: 'progress', label: 'Progress Tracking', desc: 'Monitor completion and scores', href: '/dashboard/learning' },
    ],
  },
  {
    id: 'career',
    title: 'Career Development',
    icon: Users,
    content: 'The career module bridges the gap between learning and employment. Dynamic interviews use AI to simulate real interview scenarios, asking questions and evaluating your responses. After each interview, you receive detailed feedback on technical accuracy, communication, and areas for improvement. The resume builder helps you create professional resumes that highlight your skills, certificates, and experience. Job listings let you browse and apply to positions directly from the platform.',
    features: [
      { title: 'AI interview simulations', text: 'Practice with dynamic interviews that adapt to your answers. Choose from technical, behavioral, or mixed formats.' },
      { title: 'Detailed feedback', text: 'After each interview, review your performance with scores, transcript analysis, and specific improvement suggestions.' },
      { title: 'Resume builder', text: 'Build professional resumes with drag-and-drop sections. Import your certificates and completed courses automatically.' },
      { title: 'Job marketplace', text: 'Browse listings from partner companies. Filter by role type, location, experience level, and required skills.' },
    ],
    items: [
      { id: 'interviews', label: 'Dynamic Interviews', desc: 'AI-powered interview simulations', href: '/dashboard/interviews/dynamic' },
      { id: 'feedback', label: 'Interview Feedback', desc: 'Review performance and improve', href: '/dashboard/interviews/feedback' },
      { id: 'resume', label: 'Resume Builder', desc: 'Create and manage professional resumes', href: '/dashboard/resumes' },
      { id: 'jobs', label: 'Job Listings', desc: 'Browse and apply to positions', href: '/dashboard/jobs' },
      { id: 'skills', label: 'Skill Analytics', desc: 'Identify skill gaps and growth areas', href: '/dashboard/skill-analytics' },
    ],
  },
  {
    id: 'administration',
    title: 'Administration',
    icon: Shield,
    content: 'The administration panel gives platform and tenant admins the tools to manage users, teams, security, and platform settings. User management covers account creation, role assignment, and access revocation. Team management lets you organize users into groups for shared resources and permissions. Security settings control authentication methods, session policies, and OAuth configurations. Audit logs record every administrative action for compliance and troubleshooting.',
    features: [
      { title: 'User lifecycle management', text: 'Create, suspend, or delete accounts. Assign roles (learner, admin, superadmin) and manage authentication providers.' },
      { title: 'Team organization', text: 'Group users into teams with shared access to resources, courses, and billing. Team admins can manage their members.' },
      { title: 'Security controls', text: 'Configure password policies, session timeouts, OAuth providers (Google, GitHub), and MFA requirements.' },
      { title: 'Audit trail', text: 'Every admin action is logged with timestamp, actor, action type, and details. Export logs for external compliance.' },
    ],
    items: [
      { id: 'user-mgmt', label: 'User Management', desc: 'Create and manage user accounts', href: '/dashboard/admin/users' },
      { id: 'team-mgmt', label: 'Team Management', desc: 'Organize users into teams', href: '/dashboard/admin/team' },
      { id: 'platform-settings', label: 'Platform Settings', desc: 'Configure global platform options', href: '/dashboard/admin/settings' },
      { id: 'security', label: 'Security Settings', desc: 'Configure authentication and access controls', href: '/dashboard/admin/security' },
      { id: 'audit', label: 'Audit Logs', desc: 'Track all administrative changes', href: '/dashboard/admin/audit-logs' },
      { id: 'system-health', label: 'System Health', desc: 'Monitor platform performance and status', href: '/dashboard/admin/system' },
    ],
  },
  {
    id: 'billing',
    title: 'Billing & Plans',
    icon: Settings,
    content: 'CodeSpectra offers tiered subscription plans that scale with your needs. The free tier provides access to basic scanning and a limited number of challenges. Paid plans unlock advanced analysis, unlimited challenges, full course access, interview simulations, and priority support. Billing is managed through Razorpay with support for monthly and annual billing cycles. Admins can configure organization-wide billing and provision seats for their team.',
    features: [
      { title: 'Tiered plans', text: 'Choose from Free, Pro, and Enterprise tiers. Each tier adds more scans, challenges, courses, and support options.' },
      { title: 'Flexible billing', text: 'Monthly and annual billing cycles. Annual plans include a discount. Switch or cancel anytime from the billing dashboard.' },
      { title: 'Team billing', text: 'Enterprise admins can manage organization-wide subscriptions, allocate seats, and view consolidated billing.' },
      { title: 'Invoice history', text: 'All payments, invoices, and receipts are available in the billing dashboard. Download past invoices for accounting.' },
    ],
    items: [
      { id: 'pricing', label: 'Pricing Plans', desc: 'Compare available subscription tiers', href: '/pricing' },
      { id: 'subscription', label: 'Subscription Management', desc: 'Manage your active subscription', href: '/dashboard/billing' },
      { id: 'payment', label: 'Payment Methods', desc: 'Add and manage payment options', href: '/dashboard/billing' },
      { id: 'invoices', label: 'Invoices & Receipts', desc: 'View and download billing history', href: '/dashboard/billing' },
      { id: 'admin-billing', label: 'Admin Billing', desc: 'Configure organization billing', href: '/dashboard/admin/pricing' },
    ],
  },
  {
    id: 'integrations',
    title: 'Integrations',
    icon: Terminal,
    content: 'Integrations extend CodeSpectra\'s functionality by connecting with the tools you already use. GitHub integration enables automatic code scanning when you push to a repository — every pull request gets a quality report before merge. Google Sign-In provides one-click authentication. Slack integration sends scan results and challenge notifications to your workspace. Razorpay powers the billing system. OpenAI provides AI-driven code explanations and fix suggestions. Each integration is configured from the admin settings panel and requires your explicit authorization.',
    features: [
      { title: 'GitHub auto-scan', text: 'Connect your repositories to scan every push and pull request. Quality gate results appear directly in the PR conversation.' },
      { title: 'Google OAuth', text: 'Sign in with your Google account. No separate password to remember. Configure which Google Workspace domains are allowed.' },
      { title: 'Slack notifications', text: 'Receive scan results, challenge reminders, and system alerts in your Slack workspace. Configure per-channel webhooks.' },
      { title: 'AI integration', text: 'OpenAI powers fix suggestions, code explanations, and interview question generation. No API key setup needed on your end.' },
    ],
    items: [
      { id: 'github', label: 'GitHub', desc: 'Repository scanning and OAuth', href: '/dashboard/admin/integrations' },
      { id: 'google', label: 'Google Sign-In', desc: 'OAuth authentication with Google', href: '/auth/login' },
      { id: 'slack', label: 'Slack', desc: 'Real-time notifications in Slack', href: '/dashboard/admin/settings' },
      { id: 'razorpay', label: 'Razorpay', desc: 'Payment processing integration', href: '/dashboard/admin/pricing' },
      { id: 'openai', label: 'OpenAI', desc: 'AI-powered code explanations', href: '/dashboard/admin/settings' },
      { id: 'email', label: 'Email (SMTP)', desc: 'Configure email notifications', href: '/dashboard/admin/settings' },
    ],
  },
  {
    id: 'api',
    title: 'API & Developers',
    icon: Terminal,
    content: 'CodeSpectra exposes a REST API that lets you integrate code analysis, challenge data, and user management into your own tools and workflows. Authentication uses Firebase Auth tokens or API keys. The code analysis endpoint accepts source code and returns issues with severity, location, and suggested fixes. Webhooks notify your server when scans complete, challenges are created, or user status changes. Rate limits ensure fair usage across all API consumers.',
    features: [
      { title: 'RESTful design', text: 'All endpoints follow REST conventions with JSON request/response bodies. Base URL is available in the API reference.' },
      { title: 'Firebase Auth', text: 'Authenticate with Firebase ID tokens or custom API keys. Tokens are validated server-side for each request.' },
      { title: 'Webhook events', text: 'Subscribe to events like scan.completed, challenge.submitted, or user.updated. Payloads include full context for processing.' },
      { title: 'Usage quotas', text: 'Rate limits are applied per API key or user. Check the response headers for remaining quota and reset time.' },
    ],
    items: [
      { id: 'auth-api', label: 'Authentication', desc: 'Firebase Auth integration', href: '/api-reference#auth' },
      { id: 'rest-api', label: 'REST API', desc: 'API endpoints and usage', href: '/api-reference' },
      { id: 'analyze-api', label: 'Code Analysis API', desc: 'Programmatic code scanning', href: '/api-reference#analyze' },
      { id: 'webhooks', label: 'Webhooks', desc: 'Event-driven integrations', href: '/api-reference#webhooks' },
      { id: 'rate-limits', label: 'Rate Limits', desc: 'API usage limits and best practices', href: '/api-reference' },
    ],
  },
]

export default function DocsPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [activeSection, setActiveSection] = useState<string | null>(null)

  const filteredSections = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return docSections
    return docSections
      .map((s) => ({
        ...s,
        items: s.items.filter(
          (a) => a.label.toLowerCase().includes(q) || s.title.toLowerCase().includes(q) || a.desc.toLowerCase().includes(q)
        ),
      }))
      .filter((s) => s.items.length > 0)
  }, [searchQuery])

  const scrollToSection = (id: string) => {
    setSidebarOpen(false)
    const el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setActiveSection(id)
    }
  }

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
              {docSections.map((section) => {
                const Icon = section.icon
                const isActive = activeSection === section.id
                return (
                  <div key={section.id}>
                    <button
                      onClick={() => {
                        if (activeSection === section.id) {
                          setActiveSection(null)
                        } else {
                          scrollToSection(section.id)
                        }
                      }}
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
                            key={item.id}
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
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
                    <div key={section.id}>
                      <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                        <section.icon className="h-4 w-4 text-primary" />
                        {section.title}
                      </h3>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {section.items.map((item) => (
                          <Link
                            key={item.id}
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
                    Everything you need to know about using CodeSpectra. Browse the sections below or use the search to find specific topics.
                  </p>
                </div>

                {/* Inline documentation sections */}
                <div className="space-y-20">
                  {docSections.map((section) => {
                    const Icon = section.icon
                    return (
                      <section key={section.id} id={section.id} className="scroll-mt-24">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                            <Icon className="h-5 w-5 text-primary" />
                          </div>
                          <h2 className="text-2xl font-bold">{section.title}</h2>
                        </div>

                        <p className="text-muted-foreground leading-relaxed mb-6">
                          {section.content}
                        </p>

                        <div className="grid gap-4 sm:grid-cols-2 mb-8">
                          {section.features.map((feature) => (
                            <div key={feature.title} className="rounded-lg border border-border/40 p-4">
                              <div className="flex items-start gap-3">
                                <CheckCircle className="h-5 w-5 shrink-0 text-primary mt-0.5" />
                                <div>
                                  <h4 className="font-medium text-sm mb-1">{feature.title}</h4>
                                  <p className="text-xs text-muted-foreground leading-relaxed">{feature.text}</p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {section.items.slice(0, 4).map((item) => (
                            <Link
                              key={item.id}
                              href={item.href}
                              className="inline-flex items-center gap-1.5 rounded-full border border-border/40 px-4 py-1.5 text-sm hover:border-primary/40 hover:text-primary transition-colors"
                            >
                              {item.label}
                              <ArrowRight className="h-3 w-3" />
                            </Link>
                          ))}
                        </div>
                      </section>
                    )
                  })}
                </div>

                <div className="mt-20 rounded-xl border border-primary/20 bg-primary/5 p-8">
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

