'use client'

import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { TrendingUp, Calendar, Target, Zap, Filter, Download } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const performanceData = [
  { day: 'Mon', score: 72, attempts: 3 },
  { day: 'Tue', score: 78, attempts: 2 },
  { day: 'Wed', score: 85, attempts: 4 },
  { day: 'Thu', score: 88, attempts: 2 },
  { day: 'Fri', score: 92, attempts: 3 },
  { day: 'Sat', score: 87, attempts: 1 },
  { day: 'Sun', score: 94, attempts: 2 },
]

const difficultyDistribution = [
  { name: 'Easy', value: 24, color: '#22c55e' },
  { name: 'Medium', value: 47, color: '#eab308' },
  { name: 'Hard', value: 29, color: '#ef4444' },
]

const skillBreakdown = [
  { skill: 'Arrays', solved: 12, total: 15, percentage: 80 },
  { skill: 'Strings', solved: 8, total: 12, percentage: 67 },
  { skill: 'Trees', solved: 10, total: 14, percentage: 71 },
  { skill: 'Graphs', solved: 6, total: 10, percentage: 60 },
  { skill: 'Dynamic Programming', solved: 4, total: 8, percentage: 50 },
  { skill: 'Sorting', solved: 11, total: 11, percentage: 100 },
]

export default function AnalyticsPage() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold mb-2">Performance Analytics</h1>
          <p className="text-muted-foreground">Track your progress and identify areas for improvement</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2">
            <Filter className="w-4 h-4" />
            Filter
          </Button>
          <Button variant="outline" size="sm" className="gap-2">
            <Download className="w-4 h-4" />
            Export
          </Button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4 border-border/40">
          <div className="flex items-center gap-2 mb-2">
            <Target className="w-4 h-4 text-primary" />
            <p className="text-sm text-muted-foreground">Challenges Solved</p>
          </div>
          <div className="flex items-baseline gap-1">
            <p className="text-3xl font-bold">47</p>
            <p className="text-sm text-green-500">+5 this week</p>
          </div>
        </Card>

        <Card className="p-4 border-border/40">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-green-500" />
            <p className="text-sm text-muted-foreground">Avg. Score</p>
          </div>
          <div className="flex items-baseline gap-1">
            <p className="text-3xl font-bold">84%</p>
            <p className="text-sm text-green-500">+2% from last month</p>
          </div>
        </Card>

        <Card className="p-4 border-border/40">
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="w-4 h-4 text-blue-500" />
            <p className="text-sm text-muted-foreground">Streak</p>
          </div>
          <div className="flex items-baseline gap-1">
            <p className="text-3xl font-bold">12</p>
            <p className="text-sm text-blue-500">days</p>
          </div>
        </Card>

        <Card className="p-4 border-border/40">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-4 h-4 text-yellow-500" />
            <p className="text-sm text-muted-foreground">Total Time</p>
          </div>
          <div className="flex items-baseline gap-1">
            <p className="text-3xl font-bold">48</p>
            <p className="text-sm text-yellow-500">hours</p>
          </div>
        </Card>
      </div>

      {/* Charts Grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Performance Trend */}
        <Card className="lg:col-span-2 p-6 border-border/40">
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-1">Performance Trend</h2>
            <p className="text-sm text-muted-foreground">Weekly progress and attempts</p>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={performanceData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis stroke="var(--muted-foreground)" />
                <YAxis stroke="var(--muted-foreground)" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--card)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  dot={{ fill: 'var(--primary)', r: 4 }}
                  name="Score"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Difficulty Distribution */}
        <Card className="p-6 border-border/40">
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-1">Difficulty Distribution</h2>
            <p className="text-sm text-muted-foreground">Challenges by difficulty</p>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={difficultyDistribution} cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="value">
                  {difficultyDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2 mt-4">
            {difficultyDistribution.map((item) => (
              <div key={item.name} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                  <span>{item.name}</span>
                </div>
                <span className="font-semibold">{item.value}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Skill Breakdown */}
      <Card className="p-6 border-border/40">
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-1">Skills Breakdown</h2>
          <p className="text-sm text-muted-foreground">Your progress by topic</p>
        </div>

        <div className="space-y-4">
          {skillBreakdown.map((skill) => (
            <div key={skill.skill} className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-medium">{skill.skill}</span>
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="text-xs">
                    {skill.solved}/{skill.total}
                  </Badge>
                  <span className="text-sm font-semibold text-primary w-10 text-right">{skill.percentage}%</span>
                </div>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-primary to-primary/50 transition-all"
                  style={{ width: `${skill.percentage}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Stats and Insights */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card className="p-6 bg-blue-500/10 border-blue-500/20">
          <h3 className="font-semibold text-blue-300 mb-3">Insights</h3>
          <ul className="text-sm text-blue-200 space-y-2">
            <li>✓ You're solving problems 15% faster than last week</li>
            <li>✓ Your strength: Sorting and searching algorithms</li>
            <li>✓ Focus area: Dynamic programming (50% completion)</li>
            <li>✓ Maintain your 12-day streak to unlock achievements</li>
          </ul>
        </Card>

        <Card className="p-6 bg-green-500/10 border-green-500/20">
          <h3 className="font-semibold text-green-300 mb-3">Recommendations</h3>
          <ul className="text-sm text-green-200 space-y-2">
            <li>→ Practice more dynamic programming challenges</li>
            <li>→ Review string manipulation concepts</li>
            <li>→ Attempt hard difficulty problems to build confidence</li>
            <li>→ Join study group discussions to learn from peers</li>
          </ul>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card className="p-6 border-border/40">
        <h2 className="text-lg font-semibold mb-4">Recent Activity</h2>
        <div className="space-y-3">
          {[
            { challenge: 'Longest Substring Without Repeating Characters', result: 'Accepted', time: '2 hours ago', score: 92 },
            { challenge: 'Two Sum II - Input Array Is Sorted', result: 'Accepted', time: '4 hours ago', score: 88 },
            { challenge: 'Container With Most Water', result: 'Accepted', time: '1 day ago', score: 85 },
            { challenge: 'Trapping Rain Water', result: 'Attempt', time: '2 days ago', score: 0 },
            { challenge: 'Median of Two Sorted Arrays', result: 'Accepted', time: '3 days ago', score: 91 },
          ].map((activity, idx) => (
            <div key={idx} className="flex items-center justify-between p-3 rounded-lg border border-border/40 hover:border-primary/40 transition-colors">
              <div className="flex-1">
                <p className="font-medium text-sm">{activity.challenge}</p>
                <p className="text-xs text-muted-foreground">{activity.time}</p>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={activity.result === 'Accepted' ? 'default' : 'outline'} className="text-xs">
                  {activity.result}
                </Badge>
                {activity.score > 0 && <span className="text-sm font-semibold text-primary">{activity.score}%</span>}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
