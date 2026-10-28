'use client'

import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import { Card } from '@/components/ui/card'
import { BarChart3, TrendingUp, Users, Activity, Code, Send } from 'lucide-react'
import { StatCard } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'

export interface AnalyticsDashboardProps {
  userGrowth: Array<{ date: string; users: number }>
  usersByRole: Array<{ name: string; value: number }>
  activityTrend: Array<{ date: string; accepted: number }>
  summary?: {
    totalUsers: number
    activeNow: number
    challengesCount: number
    submissionsCount: number
  }
}

const COLORS = ['#2F5BE7', '#f97316', '#64748b']

export function AnalyticsDashboard({
  userGrowth,
  usersByRole,
  activityTrend,
  summary,
}: AnalyticsDashboardProps) {
  const hasGrowth = userGrowth.some((d) => d.users > 0)
  const hasRoleData = usersByRole.some((d) => d.value > 0)
  const hasActivity = activityTrend.some((d) => d.accepted > 0)

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
        <BarChart3 className="w-5 h-5 text-primary" />
        Platform analytics
      </h2>

      {summary && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total users" value={summary.totalUsers} icon={<Users />} />
          <StatCard label="Active (15m)" value={summary.activeNow} icon={<Activity />} />
          <StatCard label="Challenges" value={summary.challengesCount} icon={<Code />} />
          <StatCard label="Submissions" value={summary.submissionsCount} icon={<Send />} />
        </div>
      )}

      <Card className="rounded-3xl p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary" />
          New profiles by month (UTC)
        </h3>
        {hasGrowth ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={userGrowth}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
              <YAxis stroke="hsl(var(--muted-foreground))" allowDecimals={false} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
              <Tooltip
                contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', color: 'hsl(var(--foreground))' }} labelStyle={{ color: 'hsl(var(--foreground))' }} itemStyle={{ color: 'hsl(var(--foreground))' }}
              />
              <Line type="monotone" dataKey="users" stroke="hsl(var(--primary))" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState illustration="team" title="No sign-ups yet" description="New profiles will show here by month." className="border-0 bg-transparent py-4 md:py-6 [&_h3]:text-base" />
        )}
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="rounded-3xl p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            Users by role
          </h3>
          {hasRoleData ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={usersByRole}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name }: { name?: string }) => name || ''}
                  outerRadius={100}
                  dataKey="value"
                >
                  {usersByRole.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', color: 'hsl(var(--foreground))' }} labelStyle={{ color: 'hsl(var(--foreground))' }} itemStyle={{ color: 'hsl(var(--foreground))' }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState illustration="team" title="No role distribution yet" description="This fills in as people join with different roles." className="border-0 bg-transparent py-4 md:py-6 [&_h3]:text-base" />
          )}
        </Card>

        <div className="grid gap-4">
          <Card className="rounded-3xl p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Directory size</p>
                <p className="text-3xl font-bold tabular-nums text-foreground">{summary?.totalUsers ?? '—'}</p>
                <p className="text-xs text-muted-foreground mt-1">Profiles in database</p>
              </div>
              <Users className="w-8 h-8 text-primary/40" />
            </div>
          </Card>
          <Card className="rounded-3xl p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Recent sessions</p>
                <p className="text-3xl font-bold tabular-nums text-foreground">{summary?.activeNow ?? '—'}</p>
                <p className="text-xs text-muted-foreground mt-1">Heartbeat in last 15 minutes</p>
              </div>
              <Activity className="w-8 h-8 text-primary/40" />
            </div>
          </Card>
        </div>
      </div>

      <Card className="rounded-3xl p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary" />
          Accepted submissions (UTC, last 7 days)
        </h3>
        {hasActivity ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={activityTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
              <YAxis stroke="hsl(var(--muted-foreground))" allowDecimals={false} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
              <Tooltip
                cursor={{ fill: 'hsl(var(--muted))', opacity: 0.2 }}
                contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', color: 'hsl(var(--foreground))' }} labelStyle={{ color: 'hsl(var(--foreground))' }} itemStyle={{ color: 'hsl(var(--foreground))' }}
              />
              <Bar dataKey="accepted" name="Accepted" fill="#16a34a" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState illustration="coding" title="No accepted submissions in this window" description="Accepted solutions are charted here as they come in." className="border-0 bg-transparent py-4 md:py-6 [&_h3]:text-base" />
        )}
      </Card>
    </div>
  )
}
