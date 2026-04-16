'use client'

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TrendingUp, AlertCircle, CheckCircle, Zap, ArrowUpRight, ArrowDownRight, Activity, Code, Target } from 'lucide-react'

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      {/* Welcome Section */}
      <div>
        <h1 className="text-4xl font-bold text-foreground mb-2">Welcome back</h1>
        <p className="text-muted-foreground">Here&apos;s an overview of your code analysis activity</p>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Quality Score */}
        <Card className="p-6 hover:shadow-lg transition-all duration-300 border-border/50">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Quality Score</p>
              <p className="text-3xl font-bold mt-3 text-foreground">94<span className="text-lg text-muted-foreground">/100</span></p>
            </div>
            <div className="w-12 h-12 rounded-lg bg-green-500/10 flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-green-500" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-full bg-muted rounded-full h-2">
              <div className="bg-gradient-to-r from-green-500 to-green-600 h-2 rounded-full" style={{ width: '94%' }} />
            </div>
          </div>
          <p className="text-xs text-green-600 mt-3 font-medium">↑ +2.4% from last week</p>
        </Card>

        {/* Active Repos */}
        <Card className="p-6 hover:shadow-lg transition-all duration-300 border-border/50">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Monitored Repos</p>
              <p className="text-3xl font-bold mt-3 text-foreground">128</p>
            </div>
            <div className="w-12 h-12 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Code className="w-6 h-6 text-blue-500" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">+12 added this month</p>
          <div className="flex gap-1.5 mt-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="w-6 h-6 rounded-full bg-primary/20 border border-primary/30" />
            ))}
            <span className="text-xs text-primary font-medium self-center">+12</span>
          </div>
        </Card>

        {/* Critical Issues */}
        <Card className="p-6 hover:shadow-lg transition-all duration-300 border-border/50">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Critical Issues</p>
              <p className="text-3xl font-bold mt-3 text-destructive">07</p>
            </div>
            <div className="w-12 h-12 rounded-lg bg-destructive/10 flex items-center justify-center">
              <AlertCircle className="w-6 h-6 text-destructive" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">3 resolved in last 24h</p>
          <Badge variant="destructive" className="mt-3 text-xs">Action Required</Badge>
        </Card>

        {/* Scans Completed */}
        <Card className="p-6 hover:shadow-lg transition-all duration-300 border-border/50">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Scans This Week</p>
              <p className="text-3xl font-bold mt-3 text-foreground">342</p>
            </div>
            <div className="w-12 h-12 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <Activity className="w-6 h-6 text-purple-500" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">42 pending analysis</p>
          <div className="text-xs text-purple-600 mt-3 font-medium">↑ 12% increase</div>
        </Card>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Scan Activity Chart */}
        <div className="lg:col-span-2">
          <Card className="p-6 border-border/50">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-foreground">Scan Activity</h2>
                <p className="text-sm text-muted-foreground mt-1">Weekly trend across all repositories</p>
              </div>
              <Badge variant="outline" className="text-xs">Weekly</Badge>
            </div>

            {/* Simple bar chart */}
            <div className="flex items-end justify-around h-48 gap-2">
              {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map((day, i) => {
                const heights = [40, 60, 70, 85, 65, 45, 50]
                return (
                  <div key={day} className="flex flex-col items-center gap-2 flex-1">
                    <div
                      className="w-full bg-gradient-to-t from-primary via-primary to-primary/50 rounded-t-lg transition-all duration-300 hover:shadow-lg cursor-pointer hover:from-primary/80"
                      style={{ height: `${heights[i]}%`, minHeight: '24px' }}
                    />
                    <span className="text-xs text-foreground/60 font-medium">{day}</span>
                  </div>
                )
              })}
            </div>
          </Card>
        </div>

        {/* Issues by Severity */}
        <Card className="p-6 border-border/50">
          <h2 className="text-xl font-bold text-foreground mb-6">Issues by Severity</h2>

          <div className="space-y-4">
            {[
              { label: 'Critical', value: 7, color: 'bg-red-500', percentage: 4 },
              { label: 'High', value: 42, color: 'bg-orange-500', percentage: 27 },
              { label: 'Medium', value: 107, color: 'bg-yellow-500', percentage: 69 },
            ].map((item) => (
              <div key={item.label}>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-foreground">{item.label}</span>
                  <span className="text-xs text-muted-foreground">{item.value}</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className={`${item.color} h-2 rounded-full transition-all duration-300`}
                    style={{ width: `${item.percentage}%` }}
                  />
                </div>
              </div>
            ))}

            <div className="border-t border-border/50 pt-4 mt-4 text-center">
              <p className="text-2xl font-bold text-foreground">156</p>
              <p className="text-xs text-muted-foreground font-medium">TOTAL ISSUES</p>
            </div>
          </div>
        </Card>
      </div>

      {/* AI Insights */}
      <Card className="p-6 bg-gradient-to-r from-primary/5 via-primary/5 to-primary/10 border-primary/20 hover:shadow-lg transition-all duration-300">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Zap className="w-6 h-6 text-primary" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="font-bold text-foreground">AI Recommendations</h3>
              <Badge className="text-xs bg-primary/20 text-primary hover:bg-primary/30">SMART</Badge>
            </div>
            <p className="text-sm text-foreground/80 leading-relaxed">
              Optimize Docker layers in cluster &apos;non-main&apos; - 15% reduction in build time possible. We detected 3 redundant layer builds that can be consolidated for better performance.
            </p>
            <Button size="sm" variant="outline" className="mt-4 text-xs">
              View Full Report
            </Button>
          </div>
        </div>
      </Card>

      {/* Recent Security Events */}
      <Card className="p-6 border-border/50">
        <h2 className="text-xl font-bold text-foreground mb-6">Recent Security Events</h2>
        <div className="space-y-3">
          {[
            { event: 'Auth-API Gateway', severity: 'CRITICAL', time: '2 mins ago', status: 'In Progress', icon: '🔴' },
            { event: 'Postgres Cluster-A', severity: 'MEDIUM', time: '14 mins ago', status: 'Resolved', icon: '🟡' },
            { event: 'Lambda Edge: Auth', severity: 'HIGH', time: '1 hour ago', status: 'Investigating', icon: '🟠' },
            { event: 'Docker Registry Scan', severity: 'MEDIUM', time: '3 hours ago', status: 'Resolved', icon: '🟡' },
            { event: 'Frontend Load Balancer', severity: 'LOW', time: '5 hours ago', status: 'Resolved', icon: '🟢' },
          ].map((event, i) => (
            <div
              key={i}
              className="flex items-center justify-between p-4 bg-background/50 rounded-lg border border-border/50 hover:border-border/80 hover:shadow-md transition-all duration-300 group"
            >
              <div className="flex items-center gap-3 flex-1">
                <span className="text-lg">{event.icon}</span>
                <div>
                  <p className="font-medium text-sm text-foreground group-hover:text-primary transition-colors">{event.event}</p>
                  <p className="text-xs text-muted-foreground">{event.time}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant={
                    event.severity === 'CRITICAL'
                      ? 'destructive'
                      : event.severity === 'HIGH'
                      ? 'default'
                      : 'secondary'
                  }
                  className="text-xs font-semibold"
                >
                  {event.severity}
                </Badge>
                <Badge variant="outline" className="text-xs bg-background/50">
                  {event.status}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-3">
        <Button size="lg" className="gap-2">
          <Code className="w-5 h-5" />
          Analyze Code
        </Button>
        <Button size="lg" variant="outline" className="gap-2">
          <Target className="w-5 h-5" />
          Set Quality Gates
        </Button>
        <Button size="lg" variant="outline" className="gap-2">
          <CheckCircle className="w-5 h-5" />
          View Reports
        </Button>
      </div>
    </div>
  )
}

