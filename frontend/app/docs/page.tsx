'use client'

import Link from 'next/link'
import { useState, useMemo, useEffect, useCallback } from 'react'
import { Search, ChevronRight, BookOpen, Code2, Zap, Shield, Settings, Trophy, Users, Terminal, MessageSquare, Menu, X, ChevronDown, ExternalLink, CheckCircle, ArrowRight, Copy, Check, List, Hash } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { PublicPageWrapper } from '@/app/public-layout'

type DocItem = {
  id: string
  label: string
  desc: string
  href: string
}

type CodeExample = {
  lang: string
  code: string
  caption?: string
}

type DocSection = {
  id: string
  title: string
  icon: typeof Zap
  badge: string
  content: string
  features: { title: string; text: string }[]
  codeExample?: CodeExample
  items: DocItem[]
}

const docSections: DocSection[] = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    icon: Zap,
    badge: 'Core',
    content: 'CodeSpectra is a unified platform for developers who want to write better code, learn new skills, and advance their careers. Unlike traditional learning platforms that focus only on theory, CodeSpectra combines static code analysis, AI-powered fixes, structured learning paths, coding challenges, interview simulations, and career tools in one workspace. Your account ties everything together — scan a real project, practice in the arena, take a course, then apply for roles with certificates and a polished resume, all without switching between tools.',
    features: [
      { title: 'Unified dashboard', text: 'Every module — scanner, challenges, courses, interviews, jobs — is accessible from one sidebar after a single sign-in.' },
      { title: 'Progress persistence', text: 'Scans, completed challenges, course progress, interview feedback, and certificates are tied to your account and persist across sessions.' },
      { title: 'Role-based access', text: 'Learners access their own content; admins manage users, teams, and platform settings.' },
      { title: 'Integration ready', text: 'Connect GitHub for repository context, Google for faster sign-in, and Slack for notifications.' },
    ],
    codeExample: {
      lang: 'ts',
      caption: 'Initialize a session and access your dashboard',
      code: `import { createSession } from '@codespectra/auth'

export async function bootstrap() {
  const session = await createSession({ provider: 'google' })
  return { target: 'dashboard', regions: ['auto'] }
}`,
    },
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
    badge: 'Feature',
    content: 'The code analysis engine scans your source code for bugs, vulnerabilities, code smells, and maintainability issues. It supports multiple languages and provides severity-ranked results so you know what to fix first. Each issue includes an explanation, the exact location in your code, and (when available) an AI-generated fix suggestion. You can submit code manually through the web interface or connect a GitHub repository for automatic scanning on every push.',
    features: [
      { title: 'Multi-language support', text: 'Scan TypeScript, JavaScript, Python, Java, Go, Rust, and more. The parser automatically detects the language.' },
      { title: 'Severity classification', text: 'Every issue is tagged as error, warning, or info. Quality gates let you enforce rules like "zero errors before merge".' },
      { title: 'AI-assisted fixes', text: 'Many issue types include a suggested fix with a diff preview. Review and apply directly or copy the recommendation.' },
      { title: 'Historical trends', text: 'The analytics dashboard tracks issue counts over time so you can see whether your codebase is improving.' },
    ],
    codeExample: {
      lang: 'bash',
      caption: 'Trigger a scan via the API',
      code: `curl -X POST https://api.codespectra.dev/analyze \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "code": "const x: number = 'hello';",
    "language": "typescript"
  }'`,
    },
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
    badge: 'Feature',
    content: 'The challenges module lets you practice coding through structured problems, timed competitions, and real-time arena battles. Problems span multiple difficulty levels and domains including algorithms, data structures, system design, and debugging. Each challenge includes test cases, a built-in code editor, and immediate pass/fail feedback. Arena mode pairs you with other learners for head-to-head competition, and the leaderboard tracks your performance over time.',
    features: [
      { title: 'Structured difficulty', text: 'Problems are categorized as easy, medium, hard, and expert. Progress at your own pace.' },
      { title: 'Real-time arena', text: 'Arena mode matches you with peers for timed coding battles. Solve the same problem faster to win.' },
      { title: 'Daily challenges', text: 'A new problem every day keeps your skills sharp. Build streaks and earn badges.' },
      { title: 'Leaderboards', text: 'Compare your performance across challenges, arenas, and codeathons.' },
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
    badge: 'Feature',
    content: 'The learning module offers structured courses that combine lessons, quizzes, and hands-on exercises. Each course has a clear curriculum with milestones. Exams are timed assessments that test your knowledge, and passing an exam earns you a verifiable certificate. Progress tracking shows your completion percentage, scores, and time spent across all enrolled courses. Certificates can be shared on LinkedIn or included in your resume.',
    features: [
      { title: 'Structured curriculum', text: 'Courses organized into modules with lessons, quizzes, and practical exercises.' },
      { title: 'Timed exams', text: 'Exams simulate real-world pressure with countdown timers across multiple question formats.' },
      { title: 'Verifiable certificates', text: 'Pass an exam to earn a certificate with a unique verification code.' },
      { title: 'Progress dashboard', text: 'See completion percentages, scores, and streak data for all courses.' },
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
    badge: 'Feature',
    content: 'The career module bridges the gap between learning and employment. Dynamic interviews use AI to simulate real interview scenarios, asking questions and evaluating your responses. After each interview, you receive detailed feedback on technical accuracy, communication, and areas for improvement. The resume builder helps you create professional resumes that highlight your skills, certificates, and experience. Job listings let you browse and apply to positions directly from the platform.',
    features: [
      { title: 'AI interview simulations', text: 'Practice with dynamic interviews that adapt to your answers in technical or behavioral formats.' },
      { title: 'Detailed feedback', text: 'Review performance with scores, transcript analysis, and improvement suggestions.' },
      { title: 'Resume builder', text: 'Build professional resumes with drag-and-drop sections and automatic certificate imports.' },
      { title: 'Job marketplace', text: 'Browse listings from partner companies filtered by role, location, and experience.' },
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
    badge: 'Admin',
    content: 'The administration panel gives platform and tenant admins the tools to manage users, teams, security, and platform settings. User management covers account creation, role assignment, and access revocation. Team management lets you organize users into groups for shared resources and permissions. Security settings control authentication methods, session policies, and OAuth configurations. Audit logs record every administrative action for compliance and troubleshooting.',
    features: [
      { title: 'User lifecycle management', text: 'Create, suspend, or delete accounts. Assign roles and manage authentication providers.' },
      { title: 'Team organization', text: 'Group users into teams with shared access to resources, courses, and billing.' },
      { title: 'Security controls', text: 'Configure password policies, session timeouts, OAuth providers, and MFA requirements.' },
      { title: 'Audit trail', text: 'Every admin action is logged with timestamp, actor, and details for compliance.' },
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
    badge: 'Admin',
    content: 'CodeSpectra offers tiered subscription plans that scale with your needs. The free tier provides access to basic scanning and a limited number of challenges. Paid plans unlock advanced analysis, unlimited challenges, full course access, interview simulations, and priority support. Billing is managed through Razorpay with support for monthly and annual billing cycles. Admins can configure organization-wide billing and provision seats for their team.',
    features: [
      { title: 'Tiered plans', text: 'Free, Pro, and Enterprise tiers. Each tier adds more scans, challenges, courses, and support.' },
      { title: 'Flexible billing', text: 'Monthly and annual billing cycles. Annual plans include a discount.' },
      { title: 'Team billing', text: 'Enterprise admins manage organization-wide subscriptions and allocate seats.' },
      { title: 'Invoice history', text: 'All payments and invoices available in the billing dashboard for download.' },
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
    badge: 'Integration',
    content: 'Integrations extend CodeSpectra\'s functionality by connecting with the tools you already use. GitHub integration enables automatic code scanning when you push to a repository. Google Sign-In provides one-click authentication. Slack integration sends scan results and challenge notifications. Razorpay powers the billing system. OpenAI provides AI-driven code explanations and fix suggestions. Each integration is configured from the admin settings panel and requires your explicit authorization.',
    features: [
      { title: 'GitHub auto-scan', text: 'Connect repositories to scan every push and PR. Results appear directly in the PR conversation.' },
      { title: 'Google OAuth', text: 'Sign in with your Google account. Configure which Workspace domains are allowed.' },
      { title: 'Slack notifications', text: 'Receive scan results, reminders, and alerts in your Slack workspace via webhooks.' },
      { title: 'AI integration', text: 'OpenAI powers fix suggestions and explanations. No API key setup needed on your end.' },
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
    badge: 'Reference',
    content: 'CodeSpectra exposes a REST API that lets you integrate code analysis, challenge data, and user management into your own tools and workflows. Authentication uses Firebase Auth tokens or API keys. The code analysis endpoint accepts source code and returns issues with severity, location, and suggested fixes. Webhooks notify your server when scans complete, challenges are created, or user status changes. Rate limits ensure fair usage across all API consumers.',
    features: [
      { title: 'RESTful design', text: 'All endpoints follow REST conventions with JSON request/response bodies.' },
      { title: 'Firebase Auth', text: 'Authenticate with Firebase ID tokens or custom API keys validated server-side.' },
      { title: 'Webhook events', text: 'Subscribe to scan.completed, challenge.submitted, or user.updated events.' },
      { title: 'Usage quotas', text: 'Rate limits applied per API key or user. Check response headers for remaining quota.' },
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

function CodeBlock({ example }: { example: CodeExample }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(example.code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [example.code])

  return (
    <div className="rounded-lg border border-border/40 overflow-hidden mb-8">
      <div className="flex items-center justify-between bg-muted/30 px-4 py-2 border-b border-border/40">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-muted-foreground bg-muted/50 px-2 py-0.5 rounded">{example.lang}</span>
          {example.caption && <span className="text-xs text-muted-foreground">{example.caption}</span>}
        </div>
        <button onClick={handleCopy} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
          {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="bg-zinc-950 p-4 overflow-x-auto">
        <code className="text-sm font-mono text-zinc-200 leading-relaxed whitespace-pre">{example.code}</code>
      </pre>
    </div>
  )
}

function TOC({ activeSectionId, sections }: { activeSectionId: string | null; sections: DocSection[] }) {
  const activeSection = sections.find(s => s.id === activeSectionId)
  if (!activeSection || activeSection.items.length === 0) return null

  return (
    <nav className="space-y-1">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
        <List className="h-3 w-3" />
        On this page
      </div>
      {activeSection.items.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          className="block text-xs text-muted-foreground hover:text-foreground transition-colors py-1 border-l-2 border-transparent hover:border-primary/40 pl-3"
        >
          {item.label}
        </Link>
      ))}
    </nav>
  )
}

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
        items: (s.items || []).filter(
          (a) => (a.label || '').toLowerCase().includes(q) || (s.title || '').toLowerCase().includes(q) || (a.desc || '').toLowerCase().includes(q)
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

  useEffect(() => {
    const handleScroll = () => {
      const sections = docSections.map(s => document.getElementById(s.id)).filter(Boolean) as HTMLElement[]
      let current = activeSection
      for (const el of sections) {
        const rect = el.getBoundingClientRect()
        if (rect.top <= 120) {
          current = el.id
        }
      }
      if (current !== activeSection) {
        setActiveSection(current)
      }
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [activeSection])

  const BadgeClass: Record<string, string> = {
    Core: 'bg-primary/10 text-primary border-primary/20',
    Feature: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    Admin: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    Integration: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
    Reference: 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20',
  }

  return (
    <PublicPageWrapper>
      <div className="flex min-h-screen">
        {/* Left sidebar */}
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
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        isActive ? "bg-primary/10 text-primary" : "hover:bg-muted"
                      )}
                    >
                      <Icon className={cn("h-4 w-4", isActive ? "text-primary" : "text-muted-foreground")} />
                      <span className="flex-1 text-left">{section.title}</span>
                      <span className={cn(
                        "text-[10px] font-medium px-1.5 py-0.5 rounded border",
                        BadgeClass[section.badge] || 'border-border/40 text-muted-foreground'
                      )}>
                        {section.badge}
                      </span>
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

        {/* Mobile overlay */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />
        )}

        {/* Main content */}
        <main className="flex-1 min-w-0">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {/* Breadcrumb */}
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

            {/* Content area */}
            <div className="flex gap-12">
              <div className="flex-1 min-w-0">
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

                    <div className="space-y-24">
                      {docSections.map((section) => {
                        const Icon = section.icon
                        return (
                          <section key={section.id} id={section.id} className="scroll-mt-24">
                            <div className="flex items-center gap-3 mb-1">
                              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                                <Icon className="h-4 w-4 text-primary" />
                              </div>
                              <h2 className="text-2xl font-bold">{section.title}</h2>
                              <span className={cn(
                                "text-[11px] font-medium px-2 py-0.5 rounded-full border",
                                BadgeClass[section.badge] || 'border-border/40 text-muted-foreground'
                              )}>
                                {section.badge}
                              </span>
                              <a href={`#${section.id}`} className="ml-auto text-muted-foreground/40 hover:text-muted-foreground transition-colors" aria-label={`Link to ${section.title}`}>
                                <Hash className="h-4 w-4" />
                              </a>
                            </div>

                            <p className="text-muted-foreground leading-relaxed mb-6 mt-4">
                              {section.content}
                            </p>

                            {section.codeExample && <CodeBlock example={section.codeExample} />}

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

                            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/20">
                              <span className="text-xs text-muted-foreground mr-1">Related:</span>
                              {section.items.map((item) => (
                                <Link
                                  key={item.id}
                                  href={item.href}
                                  className="inline-flex items-center gap-1 rounded-full border border-border/40 px-3 py-1 text-xs hover:border-primary/40 hover:text-primary transition-colors"
                                >
                                  {item.label}
                                  <ArrowRight className="h-2.5 w-2.5" />
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

              {/* Right sidebar - On this page TOC */}
              {!searchQuery && (
                <aside className="hidden xl:block w-56 shrink-0">
                  <div className="sticky top-24">
                    <TOC activeSectionId={activeSection} sections={docSections} />
                  </div>
                </aside>
              )}
            </div>
          </div>
        </main>
      </div>
    </PublicPageWrapper>
  )
}
