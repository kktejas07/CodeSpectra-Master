'use client'

import { Shield, ArrowRight } from 'lucide-react'
import { PageHeader, Panel, BentoGrid } from '@/components/app/page-kit'
import { usePageGuard } from '@/lib/use-page-guard'
import Link from 'next/link'

const SECTIONS = [
  {
    title: 'Users and roles',
    items: [
      { label: 'Users', desc: 'View, edit, and delete user accounts. Edit profile includes display name, subscription plan, and active/inactive status. Change role and delete from the row dropdown menu.', href: '/dashboard/admin/users' },
      { label: 'Role assignments', desc: 'Assign roles (Platform Admin, Org Admin, User) to individual users. Shows summary counts per role.', href: '/dashboard/admin/roles' },
      { label: 'Role permissions', desc: 'Toggle what each role can access via a checkmark matrix. New pages and data types appear automatically. Changes take effect immediately.', href: '/dashboard/admin/permissions' },
    ]
  },
  {
    title: 'Platform',
    items: [
      { label: 'System overview', desc: 'Live server health and cache tools. Refreshes every 30 seconds.', href: '/dashboard/admin/system' },
      { label: 'Audit logs', desc: 'Track admin actions, role changes, and security events. Filter by event type and date range.', href: '/dashboard/admin/system' },
      { label: 'Integrations', desc: 'Manage third-party connections: GitHub App for PR scanning, email providers, and billing.', href: '/dashboard/admin/integrations' },
      { label: 'Speed insights', desc: 'How fast pages load for real visitors (Core Web Vitals).', href: '/dashboard/admin/speed-insights' },
      { label: 'CDN and edge', desc: 'Configure edge caching, redirects, and routing rules through your CDN provider.', href: '/dashboard/admin/cdn' },
    ]
  },
  {
    title: 'Content and features',
    items: [
      { label: 'Plans and pricing', desc: 'Free, Pro and Enterprise plans and the public pricing page. Turn features on per plan and set usage limits. Default plans are created the first time you open the page.', href: '/dashboard/admin/plans' },
      { label: 'Platform settings', desc: 'Configure branding, email providers, operations, product access, and integrations.', href: '/dashboard/admin/settings' },
      { label: 'AI inventory', desc: 'Every place the platform uses AI — prompts, agents and automations — plus a dependency check for known vulnerabilities.', href: '/dashboard/admin/ai-inventory' },
      { label: 'Workflows', desc: 'Build automations visually from trigger, HTTP, AI, database, log and delay steps, and run them on a schedule.', href: '/dashboard/admin/workflows' },    ]
  },
  {
    title: 'Events and community',
    items: [
      { label: 'Hackathons', desc: 'Create and run hackathons and contests with team registration, QR scoreboards and time limits.', href: '/dashboard/admin/hackathons' },
      { label: 'Codeathons', desc: 'Manage coding competitions and hackathons.', href: '/dashboard/admin/codeathons' },
      { label: 'Assessments', desc: 'Create and manage coding assessments and exams.', href: '/dashboard/admin/assessments' },
      { label: 'Jobs', desc: 'Manage job postings on the platform.', href: '/dashboard/admin/jobs' },
      { label: 'Resumes', desc: 'Uploaded resumes, the skills found in them, and job matching.', href: '/dashboard/admin/resumes' },
    ]
  },
]

export default function AdminHelpPage() {
  const gate = usePageGuard('superadmin')
  if (!gate.ready) return null

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admin help"
        description="What each admin page does and where to find it. Visible to platform admins only."
        icon={<Shield />}
      />

      <BentoGrid className="lg:grid-cols-2">
        {SECTIONS.map(section => (
          <Panel key={section.title} className="p-5">
            <h2 className="mb-4 font-semibold text-foreground">{section.title}</h2>
            <div className="space-y-1">
              {section.items.map(item => (
                <Link key={item.label} href={item.href} className="block rounded-xl focus-visible:outline-2 focus-visible:outline-primary">
                  <div className="group flex items-start gap-3 rounded-xl p-2.5 transition-colors duration-200 hover:bg-primary/5">
                    <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" aria-hidden />
                    <div>
                      <p className="text-sm font-medium text-foreground group-hover:text-primary">{item.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </Panel>
        ))}
      </BentoGrid>
    </div>
  )
}


