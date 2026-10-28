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
  LayoutDashboard,
} from 'lucide-react'
import { PageHeader, Panel } from '@/components/app/page-kit'
import { Illustration } from '@/components/illustrations/spot'
import { EmptyState } from '@/components/ui/empty-state'
import { useT } from '@/lib/i18n/client'

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
  const { t } = useT()
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
      .catch(() => { if (!cancelled) setError(t('dash.failedToLoadOrganizationData')) })
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
      <Panel className="mx-auto mt-8 max-w-lg p-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <Illustration name="error" className="w-36" />
          <h2 className="text-lg font-semibold text-foreground">{t('dash.organizationNotLinked')}</h2>
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" className="mt-2" asChild>
            <Link href="/dashboard/support">{t('dash.contactSupport')}</Link>
          </Button>
        </div>
      </Panel>
    )
  }

  const stats = [
    { label: t('dash.assessments'), value: data?.assessments.total ?? 0, icon: FileText, href: '/dashboard/admin/assessments' },
    { label: t('dash.candidates'), value: data?.candidates.total ?? 0, icon: UserPlus, href: '/dashboard/admin/assessments' },
    { label: t('dash.teamMembers'), value: data?.members.total ?? 0, icon: Users, href: '/dashboard/admin/team' },
    { label: t('dash.averageScore'), value: data?.assessments.avgScore ?? 0, suffix: '%', icon: TrendingUp, href: '/dashboard/recruiter-analytics' },
  ]

  return (
    <div className="space-y-8">
      <PageHeader
        illustration="team"
        className="mb-0"
        icon={<Building2 />}
        title={data?.org?.name || t('dash.organization')}
        description={
          <span className="inline-flex items-center gap-1.5">
            <LayoutDashboard className="h-3.5 w-3.5" aria-hidden />{t('dash.yourOrganizationAtAGlanceAssessmentsa7b')}</span>
        }
        actions={data?.org?.plan ? (
          <Badge variant="outline" className="gap-1.5 rounded-full px-3 py-1.5 capitalize">{t('dash.planPlan', { plan: data.org.plan })}</Badge>
        ) : undefined}
      />

      <div className="cs-stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(({ label, value, suffix, icon: Icon, href }) => (
          <Link
            key={label}
            href={href}
            className="group rounded-3xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <Card className="h-full rounded-3xl border-border/70 p-5 transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_18px_40px_-20px_rgba(47,91,231,0.35)] motion-reduce:hover:translate-y-0">
              <div className="flex items-center gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{label}</p>
                  <p className="text-3xl font-bold tabular-nums tracking-tight text-foreground">{value}{suffix || ''}</p>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card className="rounded-3xl border-border/70 p-6">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                <ClipboardList className="h-5 w-5 text-primary" aria-hidden />{' '}{t('dash.recentAssessments')}</h2>
              <Button variant="ghost" size="sm" className="gap-1 text-sm" asChild>
                <Link href="/dashboard/admin/assessments">{t('dash.manageAll')}{' '}<ArrowRight className="h-3 w-3" />
                </Link>
              </Button>
            </div>
            {(data?.recent?.length ?? 0) === 0 ? (
              <EmptyState illustration="assessment"
                title={t('dash.noAssessmentsYet')}
                description={t('dash.createYourFirstOneToStart2b1')}
                actionLabel={t('dash.addAssessment')}
                actionHref="/dashboard/admin/assessments"
                className="py-10 md:py-10"
              />
            ) : (
              <div className="divide-y divide-border/70">
                {data!.recent.map((e) => (
                  <Link key={e.id} href={`/dashboard/admin/assessments/${e.id}/edit`}>
                    <div className="-mx-2 flex items-center justify-between rounded-xl px-2 py-3 transition-colors duration-200 hover:bg-primary/5">
                      <div className="min-w-0">
                        <p className="font-medium text-foreground text-sm truncate">{e.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {[e.subject, e.level, e.questions ? `${e.questions} questions` : null].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xs tabular-nums text-muted-foreground">{t('dash.attemptsAttempts', { attempts: e.attempts })}</span>
                        <Badge variant={e.published ? 'default' : 'secondary'} className="text-[10px]">
                          {e.published ? t('dash.published') : t('dash.draft')}
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
          <Card className="space-y-3 rounded-3xl border-border/70 p-6">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" aria-hidden />
              <h2 className="text-sm font-semibold text-foreground">{t('dash.team')}</h2>
            </div>
            <p className="text-sm text-muted-foreground">{t('dash.manageYourOrganizationsMembersAndRoles')}</p>
            <Button variant="outline" size="sm" className="w-full gap-2 text-xs" asChild>
              <Link href="/dashboard/admin/team">
                <Users className="h-3.5 w-3.5" />{' '}{t('dash.manageTeam')}</Link>
            </Button>
          </Card>

          <Card className="space-y-3 rounded-3xl border-border/70 p-6">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" aria-hidden />
              <h2 className="text-sm font-semibold text-foreground">{t('dash.hiringInsights')}</h2>
            </div>
            <p className="text-sm text-muted-foreground">{t('dash.trackCandidatePerformanceAndScreeningEff')}</p>
            <Button variant="outline" size="sm" className="w-full gap-2 text-xs" asChild>
              <Link href="/dashboard/recruiter-analytics">
                <TrendingUp className="h-3.5 w-3.5" />{' '}{t('dash.recruiterAnalytics')}</Link>
            </Button>
          </Card>
        </div>
      </div>
    </div>
  )
}
