'use client'

import { useEffect, useState } from 'react'
import { usePageGuard } from '@/lib/use-page-guard'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import {
  Users, TrendingUp, AlertTriangle, Shield, Clock, Target, Loader, Eye,
} from 'lucide-react'

interface Candidate {
  candidate_id: string
  interviews: number
  avgScore: number
  roles: string[]
  statuses: string[]
  latestInterview: string
}

interface InterviewRow {
  id: string
  title: string
  role: string
  type: string
  status: string
  overall_score?: number
  candidate_id: string
  created_at: string
  completed_at?: string
  proctorFlags: number
}

interface AnalyticsData {
  totalInterviews: number
  completedInterviews: number
  inProgressInterviews: number
  avgScore: number
  candidates: Candidate[]
  roleBreakdown: Record<string, number>
  typeBreakdown: Record<string, number>
  violationTypes: Record<string, number>
  flaggedSessions: number
  scoreDistribution: { range: string; count: number }[]
  recentInterviews: InterviewRow[]
}

const COLORS = ['#22c55e', '#3b82f6', '#eab308', '#ef4444', '#8b5cf6']

export default function RecruiterAnalyticsPage() {
  const gate = usePageGuard('tenant_admin')
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/recruiter/analytics')
      .then(r => r.json())
      .then(json => { if (!json.error) setData(json) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (!gate.ready) {
    return <div className="flex items-center justify-center py-20"><Loader className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  }

  if (!data) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Recruiter Analytics</h1>
          <p className="text-muted-foreground mt-1">Candidate performance and interview insights</p>
        </div>
        <Card className="border-border/60 p-10 text-center">
          <Users className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-muted-foreground">No interview data available yet. Create interviews to see analytics.</p>
        </Card>
      </div>
    )
  }

  const rolePieData = Object.entries(data.roleBreakdown).map(([name, value]) => ({ name, value }))
  const typePieData = Object.entries(data.typeBreakdown).map(([name, value]) => ({ name, value }))
  const violationBarData = Object.entries(data.violationTypes)
    .map(([name, count]) => ({ name: name.replace(/_/g, ' '), count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Recruiter Analytics</h1>
        <p className="text-muted-foreground mt-1">Candidate performance and interview insights for hiring managers</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4 border-border/40">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-4 h-4 text-primary" />
            <p className="text-sm text-muted-foreground">Total Interviews</p>
          </div>
          <p className="text-3xl font-bold">{data.totalInterviews}</p>
          <p className="text-xs text-muted-foreground mt-1">{data.completedInterviews} completed</p>
        </Card>
        <Card className="p-4 border-border/40">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-green-500" />
            <p className="text-sm text-muted-foreground">Avg. Score</p>
          </div>
          <p className="text-3xl font-bold">{data.avgScore}%</p>
          <p className="text-xs text-muted-foreground mt-1">Across all interviews</p>
        </Card>
        <Card className="p-4 border-border/40">
          <div className="flex items-center gap-2 mb-2">
            <Target className="w-4 h-4 text-blue-500" />
            <p className="text-sm text-muted-foreground">Candidates</p>
          </div>
          <p className="text-3xl font-bold">{data.candidates.length}</p>
          <p className="text-xs text-muted-foreground mt-1">Unique candidates assessed</p>
        </Card>
        <Card className="p-4 border-border/40">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <p className="text-sm text-muted-foreground">Flagged Sessions</p>
          </div>
          <p className="text-3xl font-bold">{data.flaggedSessions}</p>
          <p className="text-xs text-muted-foreground mt-1">Proctor violations detected</p>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Score Distribution */}
        <Card className="lg:col-span-2 p-6 border-border/40">
          <h2 className="text-lg font-semibold mb-4">Score Distribution</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.scoreDistribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="range" stroke="var(--muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--muted-foreground)" fontSize={12} />
                <Tooltip contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px' }} />
                <Bar dataKey="count" fill="var(--primary)" radius={[4, 4, 0, 0]} name="Candidates" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Role Breakdown */}
        <Card className="p-6 border-border/40">
          <h2 className="text-lg font-semibold mb-4">By Role</h2>
          {rolePieData.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={rolePieData} cx="50%" cy="50%" innerRadius={50} outerRadius={90} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {rolePieData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-10 text-center">No data</p>
          )}
        </Card>
      </div>

      {/* Proctor Violations & Interview Type */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-6 border-border/40">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5 text-red-500" />
            Proctor Violations
          </h2>
          {violationBarData.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={violationBarData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis type="number" stroke="var(--muted-foreground)" fontSize={12} />
                  <YAxis type="category" dataKey="name" stroke="var(--muted-foreground)" fontSize={11} width={120} />
                  <Tooltip contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px' }} />
                  <Bar dataKey="count" fill="#ef4444" radius={[0, 4, 4, 0]} name="Events" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-10 text-center">No violations recorded</p>
          )}
        </Card>

        <Card className="p-6 border-border/40">
          <h2 className="text-lg font-semibold mb-4">By Interview Type</h2>
          {typePieData.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={typePieData} cx="50%" cy="50%" innerRadius={50} outerRadius={90} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {typePieData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-10 text-center">No data</p>
          )}
        </Card>
      </div>

      {/* Candidate Comparison Table */}
      <Card className="p-6 border-border/40">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Users className="w-5 h-5" />
          Candidate Comparison
        </h2>
        {data.candidates.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">Candidate</th>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">Interviews</th>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">Avg Score</th>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">Roles</th>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">Latest</th>
                </tr>
              </thead>
              <tbody>
                {data.candidates.map((c, i) => (
                  <tr key={i} className="border-b border-border/40 hover:bg-muted/30">
                    <td className="py-3 px-3 font-mono text-xs">{c.candidate_id.slice(0, 8)}...</td>
                    <td className="py-3 px-3">{c.interviews}</td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-16 rounded-full bg-muted">
                          <div
                            className={`h-2 rounded-full ${
                              c.avgScore >= 70 ? 'bg-green-500' : c.avgScore >= 40 ? 'bg-yellow-500' : 'bg-red-500'
                            }`}
                            style={{ width: `${c.avgScore}%` }}
                          />
                        </div>
                        <span className="text-xs">{Math.round(c.avgScore)}%</span>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex flex-wrap gap-1">
                        {c.roles.map(r => <Badge key={r} variant="secondary" className="text-xs">{r}</Badge>)}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-xs text-muted-foreground">
                      {new Date(c.latestInterview).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-6 text-center">No candidates yet</p>
        )}
      </Card>

      {/* Recent Interviews */}
      <Card className="p-6 border-border/40">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Clock className="w-5 h-5" />
          Recent Interviews
        </h2>
        {data.recentInterviews.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">Title</th>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">Role</th>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">Type</th>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">Score</th>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">Flags</th>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">Date</th>
                </tr>
              </thead>
              <tbody>
                {data.recentInterviews.map((interview) => (
                  <tr key={interview.id} className="border-b border-border/40 hover:bg-muted/30">
                    <td className="py-3 px-3 font-medium">{interview.title}</td>
                    <td className="py-3 px-3"><Badge variant="secondary">{interview.role}</Badge></td>
                    <td className="py-3 px-3 text-xs">{interview.type}</td>
                    <td className="py-3 px-3">
                      <Badge variant={
                        interview.status === 'completed' ? 'default' :
                        interview.status === 'in_progress' ? 'outline' : 'secondary'
                      }>
                        {interview.status}
                      </Badge>
                    </td>
                    <td className="py-3 px-3">
                      {typeof interview.overall_score === 'number' ? (
                        <span className={`font-medium ${
                          interview.overall_score >= 70 ? 'text-green-500' :
                          interview.overall_score >= 40 ? 'text-yellow-500' : 'text-red-500'
                        }`}>
                          {Math.round(interview.overall_score)}%
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      {interview.proctorFlags > 0 ? (
                        <span className="flex items-center gap-1 text-red-500 text-xs">
                          <AlertTriangle className="h-3 w-3" />
                          {interview.proctorFlags}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">0</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-xs text-muted-foreground">
                      {new Date(interview.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-6 text-center">No interviews yet</p>
        )}
      </Card>
    </div>
  )
}
