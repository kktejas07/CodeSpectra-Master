'use client'

import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { Card } from '@/components/ui/card'
import { BarChart3, TrendingUp, Users, Activity } from 'lucide-react'

interface AnalyticsDashboardProps {
  userGrowth?: Array<{ date: string; users: number }>
  usersByRole?: Array<{ name: string; value: number }>
  activityTrend?: Array<{ date: string; challenges: number; interviews: number; scans: number }>
}

export function AnalyticsDashboard({
  userGrowth = [
    { date: 'Jan', users: 120 },
    { date: 'Feb', users: 180 },
    { date: 'Mar', users: 240 },
    { date: 'Apr', users: 310 },
    { date: 'May', users: 400 },
    { date: 'Jun', users: 520 },
  ],
  usersByRole = [
    { name: 'Users', value: 480 },
    { name: 'Admins', value: 35 },
    { name: 'Superadmins', value: 5 },
  ],
  activityTrend = [
    { date: 'Mon', challenges: 120, interviews: 45, scans: 90 },
    { date: 'Tue', challenges: 150, interviews: 60, scans: 110 },
    { date: 'Wed', challenges: 200, interviews: 75, scans: 140 },
    { date: 'Thu', challenges: 180, interviews: 65, scans: 120 },
    { date: 'Fri', challenges: 220, interviews: 85, scans: 160 },
    { date: 'Sat', challenges: 140, interviews: 40, scans: 80 },
    { date: 'Sun', challenges: 100, interviews: 30, scans: 60 },
  ],
}: AnalyticsDashboardProps) {
  const COLORS = ['#3b82f6', '#ef4444', '#8b5cf6']

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
        <BarChart3 className="w-6 h-6 text-primary" />
        Platform Analytics
      </h2>

      {/* User Growth Chart */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary" />
          User Growth
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={userGrowth}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis stroke="var(--muted-foreground)" />
            <YAxis stroke="var(--muted-foreground)" />
            <Tooltip contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)' }} />
            <Line type="monotone" dataKey="users" stroke="var(--primary)" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Users by Role */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            Users by Role
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={usersByRole} cx="50%" cy="50%" labelLine={false} label={(entry) => entry.name} outerRadius={100} fill="#8884d8" dataKey="value">
                {COLORS.map((color, index) => (
                  <Cell key={`cell-${index}`} fill={color} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)' }} />
            </PieChart>
          </ResponsiveContainer>
        </Card>

        {/* Activity Statistics */}
        <div className="grid gap-4">
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Users</p>
                <p className="text-3xl font-bold text-foreground">520</p>
                <p className="text-xs text-green-500 mt-1">+30% from last month</p>
              </div>
              <Users className="w-8 h-8 text-primary/40" />
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Today</p>
                <p className="text-3xl font-bold text-foreground">245</p>
                <p className="text-xs text-muted-foreground mt-1">47% engagement</p>
              </div>
              <Activity className="w-8 h-8 text-green-500/40" />
            </div>
          </Card>
        </div>
      </div>

      {/* Activity Trend */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">Weekly Activity Trend</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={activityTrend}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis stroke="var(--muted-foreground)" />
            <YAxis stroke="var(--muted-foreground)" />
            <Tooltip contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)' }} />
            <Legend />
            <Bar dataKey="challenges" fill="#3b82f6" />
            <Bar dataKey="interviews" fill="#10b981" />
            <Bar dataKey="scans" fill="#f59e0b" />
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  )
}
