'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase-client'
import { Users, BarChart3, Shield, Activity, Server, Lock, Settings } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { DASHBOARD_ROUTES, getDefaultDashboard, isSuperAdmin, normalizeUserRole } from '@/lib/rbac'
import { AnalyticsDashboard, type AnalyticsDashboardProps } from '@/components/admin/analytics-dashboard'
import { AuditLogsViewer } from '@/components/admin/audit-logs-viewer'

const emptyCharts: AnalyticsDashboardProps = {
  userGrowth: [],
  usersByRole: [],
  activityTrend: [],
}

export default function SystemAdminDashboard() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeUsers: 0,
    superadmins: 0,
    admins: 0,
  })
  const [charts, setCharts] = useState<AnalyticsDashboardProps>(emptyCharts)
  const [summary, setSummary] = useState<NonNullable<AnalyticsDashboardProps['summary']> | undefined>()

  useEffect(() => {
    const run = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) {
          router.push('/auth/login')
          return
        }

        const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()

        const meta = (user.user_metadata as { role?: string } | undefined)?.role
        const role = normalizeUserRole(profile?.role ?? meta)
        if (!isSuperAdmin(role)) {
          router.push(getDefaultDashboard(role))
          return
        }

        const { data: allUsers } = await supabase.from('profiles').select('role')
        if (allUsers) {
          const superadminCount = allUsers.filter((u) => u.role === 'superadmin').length
          const adminCount = allUsers.filter((u) => u.role === 'tenant_admin' || u.role === 'admin').length
          setStats({
            totalUsers: allUsers.length,
            activeUsers: 0,
            superadmins: superadminCount,
            admins: adminCount,
          })
        }

        const res = await fetch('/api/admin/metrics', { credentials: 'include' })
        const json = await res.json().catch(() => ({}))
        if (res.ok) {
          setStats((s) => ({
            ...s,
            totalUsers: json.totalUsers ?? s.totalUsers,
            activeUsers: json.activeNow ?? 0,
            superadmins: json.superadmins ?? s.superadmins,
            admins: json.tenantAdmins ?? s.admins,
          }))
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
      } catch (e) {
        console.error('[CodeSpectra] system admin load:', e)
      } finally {
        setLoading(false)
      }
    }
    void run()
  }, [router])

  const p = DASHBOARD_ROUTES.platform

  if (loading) {
    return <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">Loading…</div>
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Server className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Operations overview</h1>
            <p className="text-muted-foreground">
              Live health metrics, charts, and audit access. Use the sidebar for other platform areas,{' '}
              <strong>Insights</strong> for a metrics-focused page, and <strong>Platform settings</strong> for product
              configuration.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card className="p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="mb-2 text-sm text-muted-foreground">Total users</p>
              <p className="text-3xl font-bold text-foreground">{stats.totalUsers}</p>
            </div>
            <Users className="h-8 w-8 text-primary/40" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="mb-2 text-sm text-muted-foreground">Active (15m)</p>
              <p className="text-3xl font-bold text-foreground">{stats.activeUsers}</p>
            </div>
            <Activity className="h-8 w-8 text-primary/40" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="mb-2 text-sm text-muted-foreground">Platform admins</p>
              <p className="text-3xl font-bold text-foreground">{stats.superadmins}</p>
            </div>
            <Shield className="h-8 w-8 text-primary/40" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="mb-2 text-sm text-muted-foreground">Org admins</p>
              <p className="text-3xl font-bold text-foreground">{stats.admins}</p>
            </div>
            <BarChart3 className="h-8 w-8 text-primary/40" />
          </div>
        </Card>
      </div>

      <div className="rounded-lg border border-border/40 bg-card p-8 space-y-6">
        <h2 className="flex items-center gap-3 text-xl font-bold text-foreground">
          <Lock className="h-5 w-5 text-primary" />
          Quick links
        </h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Button className="h-12 justify-start" asChild variant="secondary">
            <Link href={p.users}>
              <Users className="mr-3 h-5 w-5" />
              Users & roles
            </Link>
          </Button>
          <Button className="h-12 justify-start" asChild variant="secondary">
            <Link href={p.analytics}>
              <BarChart3 className="mr-3 h-5 w-5" />
              Insights
            </Link>
          </Button>
          <Button className="h-12 justify-start" asChild variant="secondary">
            <Link href={p.settings}>
              <Settings className="mr-3 h-5 w-5" />
              Platform settings
            </Link>
          </Button>
          <Button className="h-12 justify-start" asChild variant="secondary">
            <Link href={p.auditLogs}>
              <Activity className="mr-3 h-5 w-5" />
              Audit logs
            </Link>
          </Button>
        </div>
      </div>

      <AnalyticsDashboard {...charts} summary={summary} />

      <AuditLogsViewer />
    </div>
  )
}
