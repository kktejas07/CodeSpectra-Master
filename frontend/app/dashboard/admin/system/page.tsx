'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Users, BarChart3, Shield, Activity, Server, Lock, Settings } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { DASHBOARD_ROUTES } from '@/lib/rbac'
import { AnalyticsDashboard, type AnalyticsDashboardProps } from '@/components/admin/analytics-dashboard'
import { AuditLogsViewer } from '@/components/admin/audit-logs-viewer'
import { useRoleGate } from '@/lib/use-role-gate'

const emptyCharts: AnalyticsDashboardProps = {
  userGrowth: [],
  usersByRole: [],
  activityTrend: [],
}

export default function SystemAdminDashboard() {
  const gate = useRoleGate({ require: 'superadmin' })
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ totalUsers: 0, activeUsers: 0, superadmins: 0, admins: 0 })
  const [charts, setCharts] = useState<AnalyticsDashboardProps>(emptyCharts)
  const [summary, setSummary] =
    useState<NonNullable<AnalyticsDashboardProps['summary']> | undefined>()

  useEffect(() => {
    if (!gate.ready) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/admin/metrics', { credentials: 'include' })
        const json = await res.json().catch(() => ({}))
        if (cancelled) return
        if (res.ok) {
          setStats({
            totalUsers: json.totalUsers ?? 0,
            activeUsers: json.activeNow ?? 0,
            superadmins: json.superadmins ?? 0,
            admins: json.tenantAdmins ?? 0,
          })
          setCharts({
            userGrowth: json.userGrowth ?? [],
            usersByRole: json.usersByRole ?? [],
            activityTrend: json.activityTrend ?? [],
          })
          setSummary({
            totalUsers: json.totalUsers ?? 0,
            activeNow: json.activeNow ?? 0,
            challengesCount: json.challengesCount ?? 0,
            submissionsCount: json.submissionsCount ?? 0,
          })
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [gate.ready])

  const p = DASHBOARD_ROUTES.platform

  if (!gate.ready || loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        Loading…
      </div>
    )
  }

  return (
    <div className="space-y-8" data-testid="admin-system-page">
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Server className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Operations overview</h1>
            <p className="text-muted-foreground">
              Live health metrics, charts, and audit access.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Kpi label="Total users" value={stats.totalUsers} icon={Users} />
        <Kpi label="Active (15m)" value={stats.activeUsers} icon={Activity} />
        <Kpi label="Platform admins" value={stats.superadmins} icon={Shield} />
        <Kpi label="Org admins" value={stats.admins} icon={BarChart3} />
      </div>

      <div className="rounded-lg border border-border/40 bg-card p-8 space-y-6">
        <h2 className="flex items-center gap-3 text-xl font-bold text-foreground">
          <Lock className="h-5 w-5 text-primary" /> Quick links
        </h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <QL href={p.users} icon={Users} label="Users & roles" />
          <QL href={p.analytics} icon={BarChart3} label="Insights" />
          <QL href={p.settings} icon={Settings} label="Platform settings" />
          <QL href={p.auditLogs} icon={Activity} label="Audit logs" />
        </div>
      </div>

      <AnalyticsDashboard {...charts} summary={summary} />
      <AuditLogsViewer />
    </div>
  )
}

function Kpi({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: number
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <Card className="p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="mb-2 text-sm text-muted-foreground">{label}</p>
          <p className="text-3xl font-bold text-foreground">{value}</p>
        </div>
        <Icon className="h-8 w-8 text-primary/40" />
      </div>
    </Card>
  )
}

function QL({
  href,
  icon: Icon,
  label,
}: {
  href: string
  icon: React.ComponentType<{ className?: string }>
  label: string
}) {
  return (
    <Button className="h-12 justify-start" asChild variant="secondary">
      <Link href={href}>
        <Icon className="mr-3 h-5 w-5" /> {label}
      </Link>
    </Button>
  )
}
