'use client'

import { Card } from '@/components/ui/card'
import { Shield, ArrowRight } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import Link from 'next/link'

const SECTIONS = [
  {
    title: 'Users & Roles',
    items: [
      { label: 'Users Management', desc: 'View, edit, and delete user accounts. Edit profile includes display name, subscription plan, and active/inactive status. Change role and delete from the row dropdown menu.', href: '/dashboard/admin/users' },
      { label: 'User Assignments', desc: 'Assign roles (Platform Admin, Org Admin, User) to individual users. Shows summary counts per role.', href: '/dashboard/admin/roles' },
      { label: 'Role Permissions', desc: 'Toggle what each role can access via a checkmark matrix. Resources auto-discover from page routes and API entities. Changes take effect immediately.', href: '/dashboard/admin/permissions' },
    ]
  },
  {
    title: 'Platform',
    items: [
      { label: 'Operations Overview', desc: 'Live server health metrics and cache management tools. Auto-refreshes every 30 seconds.', href: '/dashboard/admin/system' },
      { label: 'Audit Logs', desc: 'Track admin actions, role changes, and security events. Filter by event type and date range.', href: '/dashboard/admin/audit-logs' },
      { label: 'Integrations', desc: 'Manage third-party connections: GitHub App for PR scanning, email providers, and billing.', href: '/dashboard/admin/integrations' },
      { label: 'Speed Insights', desc: 'Performance monitoring dashboard showing Core Web Vitals for your application.', href: '/dashboard/admin/speed-insights' },
      { label: 'CDN & Edge', desc: 'Configure edge caching, redirects, and routing rules through your CDN provider.', href: '/dashboard/admin/cdn' },
    ]
  },
  {
    title: 'Content & Features',
    items: [
      { label: 'Subscription Plans', desc: 'Free, Pro, and Enterprise plans. Toggle features per plan and set usage limits. Plans auto-seed on first access.', href: '/dashboard/admin/plans' },
      { label: 'Platform Settings', desc: 'Configure branding, email providers, operations, product access, and integrations.', href: '/dashboard/admin/settings' },
      { label: 'AI Inventory', desc: 'Auto-discovered AI surfaces catalog: prompts, agents, automation chains. Dependency audit for security vulnerabilities.', href: '/dashboard/admin/ai-inventory' },
      { label: 'Workflows', desc: 'Visual workflow builder with trigger, HTTP, AI, MongoDB, log, and delay nodes. Cron scheduler for automated tasks.', href: '/dashboard/admin/workflows' },
      { label: 'Pricing Management', desc: 'Configure catalog tiers and feature flags for the pricing page.', href: '/dashboard/admin/pricing' },
    ]
  },
  {
    title: 'Events & Community',
    items: [
      { label: 'Hackathons', desc: 'Create and manage hackathons/contests with team registration, QR scoreboards, and timeouts.', href: '/dashboard/admin/hackathons' },
      { label: 'Codeathons', desc: 'Manage coding competitions and hackathons.', href: '/dashboard/admin/codeathons' },
      { label: 'Exams', desc: 'Create and manage coding exams for assessment.', href: '/dashboard/admin/exams' },
      { label: 'Jobs', desc: 'Manage job postings on the platform.', href: '/dashboard/admin/jobs' },
      { label: 'Resumes', desc: 'AI-powered resume analysis and job matching.', href: '/dashboard/admin/resumes' },
    ]
  },
]

export default function AdminHelpPage() {
  const gate = usePageGuard('superadmin')
  if (!gate.ready) return <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">Loading…</div>

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Shield className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-foreground">Admin Help</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Platform administration guide — superadmin only</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {SECTIONS.map(section => (
          <Card key={section.title} className="p-5 border-border/60">
            <h2 className="font-semibold text-foreground mb-4">{section.title}</h2>
            <div className="space-y-3">
              {section.items.map(item => (
                <Link key={item.href} href={item.href}>
                  <div className="flex items-start gap-3 rounded-md p-2 hover:bg-muted/40 transition-colors group">
                    <ArrowRight className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0 group-hover:text-primary" />
                    <div>
                      <p className="text-sm font-medium text-foreground group-hover:text-primary">{item.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}


