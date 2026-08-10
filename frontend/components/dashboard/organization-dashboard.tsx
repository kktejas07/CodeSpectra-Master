'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Building2,
  FileText,
  Users,
  UserPlus,
  ClipboardList,
  TrendingUp,
  Plus,
  ArrowRight,
  Loader2,
  AlertTriangle,
  LayoutDashboard,
} from 'lucide-react'

interface OrgOverview {
  org: { id: string; name: string; slug: string; plan: string } | null
  assessments: { total: number; published: number; attempts: number; avgScore: number }
  candidates: { total: number; submitted: number }
  members: { total: number }
  recent: Array<{
    id: string
    title: string
    subject: string
    level: string
    duration: number
    questions: number
    published: boolean
    attempts: number
    avgScore: number
    createdAt: string | null
  }>
}

export function OrganizationDashboard() {
  const [data, setData] = useState<OrgOverview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch('/api/user/org-overview', { credentials: 'include' })
      .then(r => r.json())
      .then(json => {
        if (cancelled) return
        if (json.error) setError(json.error)
        setData(json)
      })
      .catch(() => { if (!cancelled) setError('Failed to load organization data') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }

  if (error && !data?.org) {
    return (
      <Card className="border-border/60 p-8 max-w-lg mx-auto mt-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <AlertTriangle className="h-8 w-8 text-amber-500" />
          <h2 className="text-lg font-semibold">Organization not linked</h2>
          <p className="text-sm text-muted-foreground">{error}</p>
          <Link href="/dashboard/support">
            <Button variant="outline" size="sm" className="mt-2">Contact support</Button>
          </Link>
        </div>
      </Card>
    )
  }

  const stats = [
    { label: 'Assessments', value: data?.assessments.total ?? 0, icon: FileText, href: '/dashboard/admin/assessments', color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
    { label: 'Candidates', value: data?.candidates.total ?? 0, icon: UserPlus, href: '/dashboard/admin/assessments', color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    { label: 'Team members', value: data?.members.total ?? 0, icon: Users, href: '/dashboard/admin/team', color: 'text-sky-500', bg: 'bg-sky-500/10' },
    { label: 'Avg score', value: data?.assessments.avgScore ?? 0, suffix: '%', icon: TrendingUp, href: '/dashboard/recruiter-analytics', color: 'text-amber-500', bg: 'bg-amber-500/10' },
  ]

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{data?.org?.name || 'Organization'}</h1>
            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
              <LayoutDashboard className="h-3.5 w-3.5" />
              Organization overview
            </p>
          </div>
        </div>
        {data?.org?.plan && (
          <Badge variant="outline" className="gap-1.5 px-3 py-1.5 capitalize">
            {data.org.plan} plan
          </Badge>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(({ label, value, suffix, icon: Icon, href, color, bg }) => (
          <Link key={label} href={href}>
            <Card className="border-border/60 p-4 hover:border-primary/30 transition-colors">
              <div className="flex items-center gap-4">
                <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${bg}`}>
                  <Icon className={`h-6 w-6 ${color}`} />
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
                  <p className="text-2xl font-bold text-foreground">{value}{suffix || ''}</p>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card className="border-border/60 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-primary" /> Recent assessments
              </h2>
              <Link href="/dashboard/admin/assessments">
                <Badge variant="outline" className="text-xs font-normal gap-1 cursor-pointer">
                  Manage all <ArrowRight className="h-3 w-3" />
                </Badge>
              </Link>
            </div>
            {(data?.recent?.length ?? 0) === 0 ? (
              <div className="py-8 text-center">
                <FileText className="mx-auto h-8 w-8 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">No assessments yet. Create your first one to start screening candidates.</p>
                <Link href="/dashboard/admin/assessments">
                  <Button size="sm" className="mt-4 gap-1.5">
                    <Plus className="h-4 w-4" /> Add Assessment
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {data!.recent.map((e) => (
                  <Link key={e.id} href={`/dashboard/admin/assessments/${e.id}/edit`}>
                    <div className="flex items-center justify-between py-3 transition-colors hover:bg-muted/20 rounded-md px-2 -mx-2">
                      <div className="min-w-0">
                        <p className="font-medium text-foreground text-sm truncate">{e.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {[e.subject, e.level, e.questions ? `${e.questions} questions` : null].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xs text-muted-foreground">{e.attempts} attempts</span>
                        <Badge variant={e.published ? 'default' : 'secondary'} className="text-[10px]">
                          {e.published ? 'Published' : 'Draft'}
                        </Badge>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="border-border/60 p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Team</h2>
            </div>
            <p className="text-xs text-muted-foreground">Manage your organization&apos;s members and roles.</p>
            <Link href="/dashboard/admin/team">
              <Button variant="outline" size="sm" className="w-full gap-2 text-xs">
                <Users className="h-3.5 w-3.5" /> Manage team
              </Button>
            </Link>
          </Card>

          <Card className="border-border/60 p-5 space-y-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Hiring insights</h2>
            </div>
            <p className="text-xs text-muted-foreground">Track candidate performance and screening effectiveness.</p>
            <Link href="/dashboard/recruiter-analytics">
              <Button variant="outline" size="sm" className="w-full gap-2 text-xs">
                <TrendingUp className="h-3.5 w-3.5" /> Recruiter analytics
              </Button>
            </Link>
          </Card>
        </div>
      </div>
    </div>
  )
}
