'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { TrendingUp, Calendar, Target, Zap, Loader } from 'lucide-react'

interface SkillData {
  skill: string
  solved: number
  total: number
  percentage: number
}

interface PerformanceData {
  day: string
  score: number
  attempts: number
}

export default function AnalyticsPage() {
  const [skills, setSkills] = useState<SkillData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/analytics/skills')
      .then(r => r.json())
      .then(json => { if (json.data) setSkills(json.data) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const totalSolved = skills.reduce((s, sk) => s + sk.solved, 0)
  const totalProblems = skills.reduce((s, sk) => s + sk.total, 0)
  const avgPct = skills.length ? Math.round(skills.reduce((s, sk) => s + sk.percentage, 0) / skills.length) : 0

  const difficultyDistribution = [
    { name: 'Easy', value: skills.filter(s => s.percentage >= 80).length, color: '#22c55e' },
    { name: 'Medium', value: skills.filter(s => s.percentage >= 50 && s.percentage < 80).length, color: '#eab308' },
    { name: 'Hard', value: skills.filter(s => s.percentage < 50).length, color: '#ef4444' },
  ]

  const performanceData: PerformanceData[] = skills.slice(0, 7).map(sk => ({
    day: sk.skill.slice(0, 3),
    score: sk.percentage,
    attempts: sk.solved,
  }))

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Performance Analytics</h1>
        <p className="text-muted-foreground mt-1">Track your progress and identify areas for improvement</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4 border-border/40">
          <div className="flex items-center gap-2 mb-2">
            <Target className="w-4 h-4 text-primary" />
            <p className="text-sm text-muted-foreground">Problems Solved</p>
          </div>
          <p className="text-3xl font-bold">{totalSolved}</p>
        </Card>
        <Card className="p-4 border-border/40">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-green-500" />
            <p className="text-sm text-muted-foreground">Avg. Score</p>
          </div>
          <p className="text-3xl font-bold">{avgPct}%</p>
        </Card>
        <Card className="p-4 border-border/40">
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="w-4 h-4 text-blue-500" />
            <p className="text-sm text-muted-foreground">Skills Tracked</p>
          </div>
          <p className="text-3xl font-bold">{skills.length}</p>
        </Card>
        <Card className="p-4 border-border/40">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-4 h-4 text-yellow-500" />
            <p className="text-sm text-muted-foreground">Total Problems</p>
          </div>
          <p className="text-3xl font-bold">{totalProblems}</p>
        </Card>
      </div>

      {skills.length === 0 ? (
        <Card className="border-border/60 p-10 text-center">
          <TrendingUp className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-muted-foreground">No analytics data yet. Start solving challenges to see your stats.</p>
        </Card>
      ) : (
        <>
          <div className="grid lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2 p-6 border-border/40">
              <h2 className="text-lg font-semibold mb-4">Performance Trend</h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={performanceData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="day" stroke="var(--muted-foreground)" fontSize={12} />
                    <YAxis stroke="var(--muted-foreground)" fontSize={12} />
                    <Tooltip contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px' }} />
                    <Bar dataKey="score" fill="var(--primary)" radius={[4, 4, 0, 0]} name="Score %" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="p-6 border-border/40">
              <h2 className="text-lg font-semibold mb-4">Skill Distribution</h2>
              {difficultyDistribution.some(d => d.value > 0) ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={difficultyDistribution} cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="value">
                        {difficultyDistribution.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-10 text-center">No distribution data</p>
              )}
            </Card>
          </div>

          <Card className="p-6 border-border/40">
            <h2 className="text-lg font-semibold mb-4">Skill Breakdown</h2>
            <div className="space-y-4">
              {skills.map((sk) => (
                <div key={sk.skill}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium">{sk.skill}</span>
                    <span className="text-muted-foreground">{sk.solved}/{sk.total} ({sk.percentage}%)</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted">
                    <div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${sk.percentage}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
