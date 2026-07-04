'use client'

import { useEffect, useState, useMemo } from 'react'
import { Card } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { BarChart3, HelpCircle, TrendingUp, Users, Activity, Code2, ListOrdered, Loader2, UserCheck, ArrowUp, ArrowDown } from 'lucide-react'
import { useRoleGate } from '@/lib/use-role-gate'
import Link from 'next/link'

interface MetricsData {
  totalUsers: number
  activeNow: number
  superadmins: number
  tenantAdmins: number
  submissionsCount: number
  challengesCount: number
  leaderboardRows: number
  userGrowth: Array<{ date: string; users: number }>
  usersByRole: Array<{ name: string; value: number }>
  activityTrend: Array<{ date: string; challenges: number; interviews: number; scans: number }>
}

export default function Analytics() {
  const gate = useRoleGate({ require: 'superadmin' })
  const [data, setData] = useState<MetricsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState('7d')

  useEffect(() => {
    if (!gate.ready) return
    const run = async () => {
      setLoading(true)
      const res = await fetch('/api/admin/metrics', { credentials: 'include' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(json.error || `HTTP ${res.status}`); setLoading(false); return }
      setData(json)
      setLoading(false)
    }
    void run()
  }, [gate.ready])

  const growthPct = useMemo(() => {
    if (!data?.userGrowth || data.userGrowth.length < 2) return 0
    const len = data.userGrowth.length
    const prev = data.userGrowth[len - 2].users
    const curr = data.userGrowth[len - 1].users
    return prev === 0 ? 100 : Math.round(((curr - prev) / prev) * 100)
  }, [data])

  const maxGrowth = useMemo(() => Math.max(...(data?.userGrowth.map(d => d.users) || [0]), 1), [data])
  const maxActivity = useMemo(() => {
    if (!data?.activityTrend) return 1
    return Math.max(...data.activityTrend.map(d => d.scans + d.challenges + d.interviews), 1)
  }, [data])

  if (!gate.ready || loading) return <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading…</div>

  if (error) return <Card className="border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{error}</Card>

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-3xl font-bold">Platform Insights</h1>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild><HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" /></TooltipTrigger>
              <TooltipContent side="right"><p className="text-xs max-w-[250px]">Real-time platform KPIs, user growth, and activity trends. Data refreshes on page load.</p></TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-[100px] h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">7 days</SelectItem>
            <SelectItem value="30d">30 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={<Users className="h-5 w-5 text-blue-500" />} color="bg-blue-500/10" label="Total Users" value={data?.totalUsers ?? 0} trend={growthPct} hint="Registered accounts" />
        <KpiCard icon={<UserCheck className="h-5 w-5 text-green-500" />} color="bg-green-500/10" label="Active Now (15m)" value={data?.activeNow ?? 0} hint="Users with recent activity" />
        <KpiCard icon={<ListOrdered className="h-5 w-5 text-purple-500" />} color="bg-purple-500/10" label="Submissions" value={data?.submissionsCount ?? 0} hint="All-time code submissions" />
        <KpiCard icon={<Code2 className="h-5 w-5 text-amber-500" />} color="bg-amber-500/10" label="Challenges" value={data?.challengesCount ?? 0} hint="Published challenges" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* User Growth Chart */}
        <Card className="p-6 border-border/60">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-4">
            <TrendingUp className="h-5 w-5 text-primary" /> User Growth
          </h2>
          <div className="h-[200px] flex items-end gap-1">
            {data?.userGrowth.map((d, i) => {
              const h = (d.users / maxGrowth) * 100
              return (
                <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group relative">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="w-full bg-primary/20 hover:bg-primary/40 rounded-t transition-all cursor-pointer" style={{ height: `${Math.max(h, 4)}%` }} />
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        <p className="text-xs">{d.date}: <strong>{d.users}</strong> users</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <span className="text-[10px] text-muted-foreground">{d.date.slice(0, 3)}</span>
                </div>
              )
            })}
          </div>
        </Card>

        {/* Role Distribution */}
        <Card className="p-6 border-border/60">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-4">
            <Users className="h-5 w-5 text-primary" /> Role Distribution
          </h2>
          <div className="space-y-4">
            {data?.usersByRole.map(role => {
              const total = data.usersByRole.reduce((s, r) => s + r.value, 0) || 1
              const pct = Math.round((role.value / total) * 100)
              const colors: Record<string, string> = { 'Users': 'bg-blue-500', 'Org admins': 'bg-amber-500', 'Platform admins': 'bg-red-500' }
              return (
                <div key={role.name}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-muted-foreground">{role.name}</span>
                    <span className="font-medium">{role.value} <span className="text-muted-foreground text-xs">({pct}%)</span></span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted/50">
                    <div className={`h-2 rounded-full transition-all ${colors[role.name] || 'bg-primary'}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </Card>

        {/* Activity Trend */}
        <Card className="p-6 border-border/60 lg:col-span-2">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-4">
            <Activity className="h-5 w-5 text-primary" /> Activity Trend
          </h2>
          <div className="h-[200px] flex items-end gap-1">
            {data?.activityTrend.map(d => {
              const scansH = (d.scans / maxActivity) * 100
              const challengesH = (d.challenges / maxActivity) * 100
              const interviewsH = (d.interviews / maxActivity) * 100
              return (
                <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="w-full flex flex-col gap-0.5 cursor-pointer" style={{ height: '100%' }}>
                          <div className="w-full bg-blue-500/60 rounded-t-sm" style={{ height: `${Math.max(scansH, 3)}%` }} />
                          <div className="w-full bg-purple-500/60" style={{ height: `${Math.max(challengesH, 3)}%` }} />
                          <div className="w-full bg-green-500/60 rounded-b-sm" style={{ height: `${Math.max(interviewsH, 3)}%` }} />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        <p className="text-xs">{d.date}</p>
                        <p className="text-xs">Scans: <strong>{d.scans}</strong></p>
                        <p className="text-xs">Challenges: <strong>{d.challenges}</strong></p>
                        <p className="text-xs">Interviews: <strong>{d.interviews}</strong></p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <span className="text-[10px] text-muted-foreground">{d.date.slice(0, 3)}</span>
                </div>
              )
            })}
          </div>
          <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-500/60 inline-block" /> Scans</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-purple-500/60 inline-block" /> Challenges</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-500/60 inline-block" /> Interviews</span>
          </div>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        Detailed audit logs, server health, and user management on{' '}
        <Link href="/dashboard/admin/system" className="text-primary underline">Operations Overview</Link>
      </p>
    </div>
  )
}

function KpiCard({ icon, color, label, value, trend, hint }: { icon: React.ReactNode; color: string; label: string; value: number; trend?: number; hint: string }) {
  return (
    <Card className="p-5 border-border/60">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-1.5">
            <p className="text-xs text-muted-foreground">{label}</p>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild><HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" /></TooltipTrigger>
                <TooltipContent side="bottom"><p className="text-xs max-w-[200px]">{hint}</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <p className="mt-1 text-2xl font-bold tabular-nums">{value.toLocaleString()}</p>
          {trend !== undefined && trend !== 0 && (
            <p className={`text-xs mt-0.5 flex items-center gap-1 ${trend > 0 ? 'text-green-600' : 'text-red-600'}`}>
              {trend > 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
              {Math.abs(trend)}% vs prev month
            </p>
          )}
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${color}`}>{icon}</div>
      </div>
    </Card>
  )
}
