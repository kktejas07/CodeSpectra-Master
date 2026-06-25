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
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import { Card } from '@/components/ui/card'
import { BarChart3, TrendingUp, Users, Activity } from 'lucide-react'

export interface AnalyticsDashboardProps {
  userGrowth: Array<{ date: string; users: number }>
  usersByRole: Array<{ name: string; value: number }>
  activityTrend: Array<{ date: string; challenges: number; interviews: number; scans: number }>
  summary?: {
    totalUsers: number
    activeNow: number
    challengesCount: number
    submissionsCount: number
  }
}

const COLORS = ['#3b82f6', '#f97316', '#a855f7']

export function AnalyticsDashboard({
  userGrowth,
  usersByRole,
  activityTrend,
  summary,
}: AnalyticsDashboardProps) {
  const hasGrowth = userGrowth.some((d) => d.users > 0)
  const hasRoleData = usersByRole.some((d) => d.value > 0)
  const hasActivity = activityTrend.some((d) => d.challenges + d.interviews + d.scans > 0)

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
        <BarChart3 className="w-6 h-6 text-primary" />
        Platform analytics
      </h2>

      {summary && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="p-4">
            <p className="text-sm text-muted-foreground">Total users</p>
            <p className="text-2xl font-bold">{summary.totalUsers}</p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-muted-foreground">Active (15m)</p>
            <p className="text-2xl font-bold">{summary.activeNow}</p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-muted-foreground">Challenges</p>
            <p className="text-2xl font-bold">{summary.challengesCount}</p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-muted-foreground">Submissions</p>
            <p className="text-2xl font-bold">{summary.submissionsCount}</p>
          </Card>
        </div>
      )}

      <Card className="p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary" />
          New profiles by month (UTC)
        </h3>
        {hasGrowth ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={userGrowth}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" stroke="var(--muted-foreground)" />
              <YAxis stroke="var(--muted-foreground)" allowDecimals={false} />
              <Tooltip
                contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)' }}
              />
              <Line type="monotone" dataKey="users" stroke="var(--primary)" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="py-16 text-center text-sm text-muted-foreground">
            No signup trend data yet — create profiles or run demo setup.
          </p>
        )}
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-6">
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
                  label={(entry: { name?: string }) => entry.name}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {usersByRole.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)' }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-12 text-center text-sm text-muted-foreground">No role distribution yet.</p>
          )}
        </Card>

        <div className="grid gap-4">
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Directory size</p>
                <p className="text-3xl font-bold text-foreground">{summary?.totalUsers ?? '—'}</p>
                <p className="text-xs text-muted-foreground mt-1">Profiles in database</p>
              </div>
              <Users className="w-8 h-8 text-primary/40" />
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Recent sessions</p>
                <p className="text-3xl font-bold text-foreground">{summary?.activeNow ?? '—'}</p>
                <p className="text-xs text-muted-foreground mt-1">Heartbeat in last 15 minutes</p>
              </div>
              <Activity className="w-8 h-8 text-green-500/40" />
            </div>
          </Card>
        </div>
      </div>

      <Card className="p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">Accepted submissions (UTC, last 7 days)</h3>
        {hasActivity ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={activityTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" stroke="var(--muted-foreground)" />
              <YAxis stroke="var(--muted-foreground)" allowDecimals={false} />
              <Tooltip
                contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)' }}
              />
              <Legend />
              <Bar dataKey="challenges" name="Submissions" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="py-12 text-center text-sm text-muted-foreground">
            No submission activity in this window.
          </p>
        )}
      </Card>
    </div>
  )
}
