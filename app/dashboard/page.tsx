'use client'

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AnimatedIllustration } from '@/components/animated-illustration'
import { TrendingUp, AlertCircle, CheckCircle, Zap } from 'lucide-react'

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-8 bg-gradient-to-br from-primary/10 to-primary/5">
          <div className="space-y-4">
            <div>
              <h1 className="text-4xl font-bold">Welcome back,</h1>
              <h2 className="text-4xl font-bold text-primary">Intelligence Lead.</h2>
            </div>
            <p className="text-foreground/70">
              Your infrastructure is currently performing at 94% optimization. We&apos;ve detected 3 new actionable insights for your CI/CD pipelines.
            </p>
            <div className="flex gap-3 pt-4">
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
                Review Security
              </Button>
              <Button variant="outline">View Activity</Button>
            </div>
          </div>
        </Card>

        {/* Animated AI Bot */}
        <div className="flex items-center justify-center">
          <AnimatedIllustration type="ai-bot" className="max-w-sm" />
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-sm text-foreground/60 font-semibold">SECURITY SCORE</p>
              <p className="text-3xl font-bold mt-2">94<span className="text-lg text-foreground/60">/100</span></p>
            </div>
            <CheckCircle className="w-6 h-6 text-green-500" />
          </div>
          <div className="w-full bg-background rounded-full h-2">
            <div className="bg-green-500 h-2 rounded-full" style={{ width: '94%' }} />
          </div>
          <p className="text-xs text-green-600 mt-2">📈 +2.4% from last week</p>
        </Card>

        <Card className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-sm text-foreground/60 font-semibold">ACTIVE REPOS</p>
              <p className="text-3xl font-bold mt-2">128</p>
            </div>
            <TrendingUp className="w-6 h-6 text-blue-500" />
          </div>
          <p className="text-xs text-foreground/60 mt-4">Total Monitored</p>
          <div className="flex gap-1 mt-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="w-6 h-6 rounded-full bg-primary/20" />
            ))}
            <span className="text-xs text-primary">+12</span>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-sm text-foreground/60 font-semibold">CRITICAL ISSUES</p>
              <p className="text-3xl font-bold mt-2 text-destructive">07</p>
            </div>
            <AlertCircle className="w-6 h-6 text-destructive" />
          </div>
          <Badge variant="destructive" className="mt-2">Action Required</Badge>
          <p className="text-xs text-foreground/60 mt-2">3 resolved in last 24h</p>
        </Card>
      </div>

      {/* Analytics Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Scan Activity Chart */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold">Scan Activity & Vulnerabilities</h2>
            <div className="flex gap-2">
              <Badge variant="outline" className="text-xs">Weekly</Badge>
              <Badge variant="outline" className="text-xs">Monthly</Badge>
            </div>
          </div>

          <p className="text-sm text-foreground/60 mb-6">Weekly trend across all development clusters</p>

          {/* Simple bar chart */}
          <div className="flex items-end justify-around h-48 gap-2">
            {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map((day, i) => (
              <div key={day} className="flex flex-col items-center gap-2">
                <div
                  className="w-8 bg-gradient-to-t from-primary to-primary/50 rounded-t"
                  style={{ height: `${[40, 60, 70, 85, 65, 45, 50][i]}%` }}
                />
                <span className="text-xs text-foreground/60">{day}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Severity Distribution */}
        <Card className="p-6">
          <h2 className="text-xl font-bold mb-6">Severity Distribution</h2>
          <p className="text-sm text-foreground/60 mb-6">Live vulnerability landscape</p>

          <div className="space-y-4">
            {[
              { label: 'Critical', value: 7, color: 'bg-red-500', percentage: 4 },
              { label: 'High', value: 42, color: 'bg-orange-500', percentage: 27 },
              { label: 'Medium', value: 107, color: 'bg-yellow-500', percentage: 69 },
            ].map((item) => (
              <div key={item.label}>
                <div className="flex justify-between mb-2">
                  <span className="text-sm font-medium">{item.label}</span>
                  <span className="text-sm text-foreground/60">{item.value} ({item.percentage}%)</span>
                </div>
                <div className="w-full bg-background rounded-full h-2">
                  <div className={`${item.color} h-2 rounded-full`} style={{ width: `${item.percentage}%` }} />
                </div>
              </div>
            ))}

            <div className="text-center pt-4">
              <p className="text-2xl font-bold text-primary">156</p>
              <p className="text-xs text-foreground/60">TOTAL</p>
            </div>
          </div>
        </Card>
      </div>

      {/* AI Insights */}
      <Card className="p-6">
        <div className="flex items-start gap-4">
          <Zap className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-1" />
          <div className="flex-1">
            <h3 className="font-semibold mb-1">AI Insights</h3>
            <Badge className="mb-3" variant="secondary">ACTIVE INTELLIGENCE</Badge>
            <p className="text-sm text-foreground/70">
              Optimize Docker Layers: Cluster &apos;non-main&apos; shows redundant layer builds. Potential 15% reduction in build time.
            </p>
          </div>
        </div>
      </Card>

      {/* Recent Events */}
      <Card className="p-6">
        <h2 className="text-xl font-bold mb-6">Recent Security Events</h2>
        <div className="space-y-3">
          {[
            { event: 'Auth-API Gateway', severity: 'CRITICAL', time: '2 mins ago', status: 'In Progress' },
            { event: 'Postgres Cluster-A', severity: 'MEDIUM', time: '14 mins ago', status: 'Resolved' },
            { event: 'Lambda Edge: Auth', severity: 'HIGH', time: '1 hour ago', status: 'Investigating' },
            { event: 'Docker Registry Scan', severity: 'MEDIUM', time: '3 hours ago', status: 'Resolved' },
            { event: 'Frontend Load Balancer', severity: 'LOW', time: '5 hours ago', status: 'Resolved' },
          ].map((event, i) => (
            <div key={i} className="flex items-center justify-between p-3 bg-background/50 rounded-lg border border-border/50">
              <div className="flex items-center gap-3 flex-1">
                <div>
                  <p className="font-medium text-sm">{event.event}</p>
                  <p className="text-xs text-foreground/60">{event.time}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge
                  variant={
                    event.severity === 'CRITICAL'
                      ? 'destructive'
                      : event.severity === 'HIGH'
                      ? 'warning'
                      : 'info'
                  }
                  className="text-xs"
                >
                  {event.severity}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {event.status}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
