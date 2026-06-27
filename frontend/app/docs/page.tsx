'use client'

import Link from 'next/link'
import { Search, ChevronRight, Code2, Zap, Shield, Settings, BookOpen, Trophy, Users, BarChart3, Award, Terminal, Puzzle, Globe, Key, CreditCard, Mail, Bell, GitBranch, Cpu, MessageSquare, FileText, Layers, Target, Sparkles, Radio } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PublicPageWrapper } from '@/app/public-layout'
import { useMemo, useState } from 'react'

type DocArticle = { label: string; href: string; desc?: string }

const sections: {
  icon: typeof Zap
  title: string
  description: string
  articles: DocArticle[]
}[] = [
  {
    icon: Zap,
    title: 'Getting Started',
    description: 'Learn the basics and set up your account',
    articles: [
      { label: 'What is CodeSpectra?', href: '/about', desc: 'Overview of the platform and its capabilities' },
      { label: 'Creating an Account', href: '/auth/signup', desc: 'Sign up with email, Google, or GitHub' },
      { label: 'Dashboard Overview', href: '/dashboard', desc: 'Navigate your personal dashboard' },
      { label: 'Profile Settings', href: '/dashboard/settings', desc: 'Manage your account and preferences' },
      { label: 'Roles & Permissions', href: '/admin/roles', desc: 'Understanding user roles: user, admin, superadmin' },
    ],
  },
  {
    icon: Code2,
    title: 'Code Scanner',
    description: 'Analyze and improve your code quality',
    articles: [
      { label: 'Manual Code Scan', href: '/dashboard/scanner?mode=manual', desc: 'Submit code snippets for instant analysis' },
      { label: 'GitHub Integration', href: '/dashboard/admin/integrations', desc: 'Connect repositories for automated scanning' },
      { label: 'Understanding Issues', href: '/dashboard/scanner', desc: 'Bug detection, vulnerabilities, code smells' },
      { label: 'Quality Gates', href: '/dashboard/scanner', desc: 'Set quality thresholds and enforce standards' },
      { label: 'AI-Powered Fixes', href: '/dashboard/scanner', desc: 'Get suggested fixes with AI explanations' },
      { label: 'Historical Tracking', href: '/dashboard/analytics', desc: 'Monitor code quality trends over time' },
      { label: 'Scanner Reports', href: '/dashboard/scanner', desc: 'Export and share analysis reports' },
    ],
  },
  {
    icon: Trophy,
    title: 'Learning & Challenges',
    description: 'Practice and improve your skills',
    articles: [
      { label: 'Coding Challenges', href: '/dashboard/challenges', desc: 'Solve problems and earn points' },
      { label: 'Arena Mode', href: '/dashboard/arena', desc: 'Compete in real-time coding battles' },
      { label: 'Learning Tracks', href: '/dashboard/tracks', desc: 'Follow structured learning paths' },
      { label: 'Daily Challenge', href: '/dashboard', desc: 'New challenge every day to stay sharp' },
      { label: 'Leaderboard', href: '/dashboard/leaderboard', desc: 'Compare your progress with others' },
      { label: 'Codeathons', href: '/dashboard/codeathons', desc: 'Participate in timed coding events' },
    ],
  },
  {
    icon: BookOpen,
    title: 'Courses & Exams',
    description: 'Structured learning and certification',
    articles: [
      { label: 'Browse Courses', href: '/dashboard/learning', desc: 'Explore available courses and modules' },
      { label: 'Taking Exams', href: '/dashboard/exams', desc: 'Timed assessments to validate knowledge' },
      { label: 'Certifications', href: '/dashboard/certifications', desc: 'Earn certificates upon completion' },
      { label: 'Progress Tracking', href: '/dashboard/learning', desc: 'Monitor your learning journey' },
    ],
  },
  {
    icon: Users,
    title: 'Interviews & Careers',
    description: 'Prepare for job interviews and manage your career',
    articles: [
      { label: 'Dynamic Interviews', href: '/dashboard/interviews/dynamic', desc: 'AI-powered interview simulations' },
      { label: 'Interview Feedback', href: '/dashboard/interviews/feedback', desc: 'Review and improve your performance' },
      { label: 'Resume Builder', href: '/dashboard/resumes', desc: 'Create and manage your resume' },
      { label: 'Job Listings', href: '/dashboard/jobs', desc: 'Browse and apply for positions' },
      { label: 'Skill Analytics', href: '/dashboard/skill-analytics', desc: 'Analyze your skill gaps' },
    ],
  },
  {
    icon: BarChart3,
    title: 'Analytics & Reports',
    description: 'Track your performance and growth',
    articles: [
      { label: 'Personal Analytics', href: '/dashboard/analytics', desc: 'View your activity and progress charts' },
      { label: 'Admin Dashboard', href: '/dashboard/admin/analytics', desc: 'Organization-wide analytics' },
      { label: 'Speed Insights', href: '/dashboard/admin/speed-insights', desc: 'Performance monitoring and metrics' },
      { label: 'Audit Logs', href: '/dashboard/admin/audit-logs', desc: 'Track all administrative actions' },
    ],
  },
  {
    icon: Shield,
    title: 'Admin Guide',
    description: 'For organization and platform administrators',
    articles: [
      { label: 'User Management', href: '/dashboard/admin/users', desc: 'Create, edit, and manage users' },
      { label: 'Team Management', href: '/dashboard/admin/team', desc: 'Manage teams and memberships' },
      { label: 'Platform Settings', href: '/dashboard/admin/settings', desc: 'Configure global platform settings' },
      { label: 'Billing & Plans', href: '/dashboard/admin/pricing', desc: 'Manage subscription plans and pricing' },
      { label: 'Integrations', href: '/dashboard/admin/integrations', desc: 'Configure GitHub, Slack, and more' },
      { label: 'Security Settings', href: '/dashboard/admin/security', desc: 'Configure security policies and MFA' },
      { label: 'CDN Configuration', href: '/dashboard/admin/cdn', desc: 'Manage content delivery settings' },
      { label: 'System Health', href: '/dashboard/admin/system', desc: 'Monitor system status and performance' },
    ],
  },
  {
    icon: Settings,
    title: 'Integrations',
    description: 'Connect CodeSpectra with your tools',
    articles: [
      { label: 'GitHub Integration', href: '/dashboard/admin/integrations', desc: 'Connect repositories and automate scans' },
      { label: 'Slack Notifications', href: '/dashboard/admin/settings', desc: 'Receive alerts in your Slack workspace' },
      { label: 'Google Sign-In', href: '/auth/login', desc: 'Sign in with your Google account' },
      { label: 'Razorpay Billing', href: '/dashboard/admin/pricing', desc: 'Payment processing and subscription management' },
      { label: 'OpenAI Integration', href: '/dashboard/admin/settings', desc: 'AI-powered code explanations and fixes' },
      { label: 'Email Notifications', href: '/dashboard/notifications/preferences', desc: 'Configure email alert preferences' },
    ],
  },
  {
    icon: Terminal,
    title: 'API Reference',
    description: 'For developers building on CodeSpectra',
    articles: [
      { label: 'Authentication API', href: '/api-reference#auth', desc: 'Firebase-based authentication flow' },
      { label: 'Code Analysis API', href: '/api-reference#analyze', desc: 'Submit code for analysis and get results' },
      { label: 'Scanner API', href: '/api-reference', desc: 'Programmatic access to scanner features' },
      { label: 'Leaderboard API', href: '/api-reference', desc: 'Fetch leaderboard data' },
      { label: 'Webhooks', href: '/api-reference#webhooks', desc: 'Receive real-time events via webhooks' },
      { label: 'Rate Limits', href: '/api-reference', desc: 'API rate limits and best practices' },
    ],
  },
]

export default function DocsPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedSection, setExpandedSection] = useState<string | null>(null)

  const filteredSections = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return sections
    return sections
      .map((s) => ({
        ...s,
        articles: s.articles.filter(
          (a) => a.label.toLowerCase().includes(q) || s.title.toLowerCase().includes(q) || s.description.toLowerCase().includes(q) || (a.desc && a.desc.toLowerCase().includes(q))
        ),
      }))
      .filter((s) => s.articles.length > 0)
  }, [searchQuery])

  return (
    <PublicPageWrapper>
      <div className="space-y-16">
        <div className="text-center">
          <p className="mb-3 text-sm text-muted-foreground">Resources</p>
          <h1 className="mb-4 text-5xl font-bold sm:text-6xl">Documentation</h1>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
            Comprehensive guides covering every feature of CodeSpectra. Learn how to scan code, take courses, earn certifications, prepare for interviews, manage your team, and more.
          </p>
        </div>

        <div className="mx-auto max-w-2xl">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search documentation..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-border/40 bg-background py-3 pl-12 pr-4 transition-colors hover:border-primary/40 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </div>

        <div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredSections.map((section) => {
            const Icon = section.icon
            return (
              <div
                key={section.title}
                className="rounded-xl border border-border/40 p-6 transition-colors hover:border-primary/40 hover:bg-primary/5"
              >
                <div className="mb-5 flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <Icon className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold">{section.title}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{section.description}</p>
                  </div>
                </div>
                <ul className="space-y-2">
                  {section.articles.map((article) => (
                    <li key={article.label}>
                      <Link
                        href={article.href}
                        className="group -mx-3 flex flex-col rounded-lg px-3 py-2 transition-colors hover:bg-muted"
                      >
                        <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                          {article.label}
                        </span>
                        {article.desc && (
                          <span className="text-xs text-muted-foreground mt-0.5">{article.desc}</span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>

        <div className="mx-auto max-w-4xl rounded-xl border border-primary/20 bg-primary/5 p-8">
          <div className="flex items-start gap-4">
            <MessageSquare className="mt-0.5 h-6 w-6 shrink-0 text-primary" />
            <div>
              <h3 className="mb-2 text-lg font-semibold">Need help?</h3>
              <p className="mb-4 text-sm text-muted-foreground">
                Can&apos;t find what you&apos;re looking for? Check our FAQ or contact our support team.
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
      </div>
    </PublicPageWrapper>
  )
}
