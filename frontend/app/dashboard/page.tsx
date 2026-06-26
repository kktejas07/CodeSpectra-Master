'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TrendingUp, AlertCircle, Zap, Activity, Code, Trophy, BookOpen, CheckCircle, ArrowRight, Clock } from 'lucide-react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { DailyChallengeWidget } from '@/components/dashboard/daily-challenge-widget'
import { getDefaultDashboard } from '@/lib/rbac'

export default function DashboardPage() {
  const router = useRouter()
  const pathname = usePathname()
  const { user: fbUser, loading: isPending } = useAuth()

  useEffect(() => {
    if (isPending) return
    if (!fbUser) {
      router.push('/auth/login')
      return
    }
    const role = 'user' as const
    const target = getDefaultDashboard(role)
    if (pathname === '/dashboard' && target !== pathname) {
      router.replace(target)
    }
  }, [router, pathname, isPending, fbUser?.uid])
  const metrics = [
    {
      label: 'Quality Score',
      value: '94',
      suffix: '/100',
      change: '+2.4%',
      trend: 'up',
      icon: TrendingUp,
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
    },
    {
      label: 'Monitored Repos',
      value: '128',
      change: '+12 this month',
      icon: Code,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
    },
    {
      label: 'Critical Issues',
      value: '07',
      change: '3 resolved today',
      icon: AlertCircle,
      color: 'text-destructive',
      bgColor: 'bg-destructive/10',
      badge: 'Action Required',
    },
    {
      label: 'Scans This Week',
      value: '342',
      change: '+12% increase',
      trend: 'up',
      icon: Activity,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
    },
  ]

  const recentEvents = [
    { event: 'Auth-API Gateway', severity: 'CRITICAL', time: '2 mins ago', status: 'In Progress' },
    { event: 'Postgres Cluster-A', severity: 'MEDIUM', time: '14 mins ago', status: 'Resolved' },
    { event: 'Lambda Edge: Auth', severity: 'HIGH', time: '1 hour ago', status: 'Investigating' },
    { event: 'Docker Registry Scan', severity: 'MEDIUM', time: '3 hours ago', status: 'Resolved' },
    { event: 'Frontend Load Balancer', severity: 'LOW', time: '5 hours ago', status: 'Resolved' },
  ]

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold mb-1">Welcome back</h1>
        <p className="text-muted-foreground">Here&apos;s an overview of your code analysis activity</p>
      </div>

      {/* Daily challenge / streak — HackerRank-style */}
      <DailyChallengeWidget />

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((metric) => {
          const Icon = metric.icon
          return (
            <Card key={metric.label} className="p-5 border-border/40 hover:border-primary/40 transition-colors">
              <div className="flex items-start justify-between mb-4">
                <p className="text-sm text-muted-foreground">{metric.label}</p>
                <div className={`w-10 h-10 rounded-lg ${metric.bgColor} flex items-center justify-center`}>
                  <Icon className={`w-5 h-5 ${metric.color}`} />
                </div>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold">{metric.value}</span>
                {metric.suffix && <span className="text-lg text-muted-foreground">{metric.suffix}</span>}
              </div>
              <div className="flex items-center gap-2 mt-2">
                {metric.badge ? (
                  <Badge variant="destructive" className="text-xs">{metric.badge}</Badge>
                ) : (
                  <span className={`text-xs ${metric.trend === 'up' ? 'text-green-500' : 'text-muted-foreground'}`}>
                    {metric.change}
                  </span>
                )}
              </div>
            </Card>
          )
        })}
      </div>

      {/* Charts Row */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Scan Activity */}
        <Card className="lg:col-span-2 p-6 border-border/40">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-semibold">Scan Activity</h2>
              <p className="text-sm text-muted-foreground">Weekly trend across all repositories</p>
            </div>
            <Badge variant="outline" className="text-xs">Weekly</Badge>
          </div>

          <div className="flex items-end justify-around h-48 gap-2">
            {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map((day, i) => {
              const heights = [40, 60, 70, 85, 65, 45, 50]
              return (
                <div key={day} className="flex flex-col items-center gap-2 flex-1">
                  <div
                    className="w-full bg-primary rounded-t-md transition-all duration-300 hover:bg-primary/80"
                    style={{ height: `${heights[i]}%`, minHeight: '16px' }}
                  />
                  <span className="text-xs text-muted-foreground">{day}</span>
                </div>
              )
            })}
          </div>
        </Card>

        {/* Issues by Severity */}
        <Card className="p-6 border-border/40">
          <h2 className="text-lg font-semibold mb-6">Issues by Severity</h2>

          <div className="space-y-4">
            {[
              { label: 'Critical', value: 7, color: 'bg-red-500', percentage: 4 },
              { label: 'High', value: 42, color: 'bg-orange-500', percentage: 27 },
              { label: 'Medium', value: 107, color: 'bg-yellow-500', percentage: 69 },
            ].map((item) => (
              <div key={item.label}>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm">{item.label}</span>
                  <span className="text-xs text-muted-foreground">{item.value}</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className={`${item.color} h-2 rounded-full`}
                    style={{ width: `${item.percentage}%` }}
                  />
                </div>
              </div>
            ))}

            <div className="border-t border-border/40 pt-4 mt-4 text-center">
              <p className="text-2xl font-bold">156</p>
              <p className="text-xs text-muted-foreground">TOTAL ISSUES</p>
            </div>
          </div>
        </Card>
      </div>

      {/* AI Insights */}
      <Card className="p-6 border-primary/20 bg-primary/5">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Zap className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="font-semibold">AI Recommendations</h3>
              <Badge className="text-xs bg-primary/20 text-primary border-0">SMART</Badge>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Optimize Docker layers in cluster &apos;non-main&apos; - 15% reduction in build time possible. We detected 3 redundant layer builds that can be consolidated.
            </p>
            <Button size="sm" variant="outline" className="mt-4">
              View Full Report
            </Button>
          </div>
        </div>
      </Card>

      {/* Recent Events */}
      <Card className="p-6 border-border/40">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">Recent Security Events</h2>
          <Button variant="ghost" size="sm" className="text-xs gap-1">
            View all <ArrowRight className="w-3 h-3" />
          </Button>
        </div>
        <div className="space-y-2">
          {recentEvents.map((event, i) => (
            <div
              key={i}
              className="flex items-center justify-between p-3 rounded-lg border border-border/40 hover:border-primary/40 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${
                  event.severity === 'CRITICAL' ? 'bg-red-500' :
                  event.severity === 'HIGH' ? 'bg-orange-500' :
                  event.severity === 'MEDIUM' ? 'bg-yellow-500' : 'bg-green-500'
                }`} />
                <div>
                  <p className="text-sm font-medium">{event.event}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    {event.time}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant={
                    event.severity === 'CRITICAL' ? 'destructive' :
                    event.severity === 'HIGH' ? 'default' : 'secondary'
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

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-3">
        <Button asChild className="gap-2">
          <Link href="/dashboard/scanner?mode=manual">
            <Code className="w-4 h-4" />
            Analyze Code
          </Link>
        </Button>
        <Button asChild variant="outline" className="gap-2">
          <Link href="/dashboard/challenges">
            <Trophy className="w-4 h-4" />
            Practice Challenges
          </Link>
        </Button>
        <Button asChild variant="outline" className="gap-2">
          <Link href="/dashboard/prepare">
            <BookOpen className="w-4 h-4" />
            Prepare for Interview
          </Link>
        </Button>
        <Button asChild variant="outline" className="gap-2">
          <Link href="/dashboard/certifications">
            <CheckCircle className="w-4 h-4" />
            Get Certified
          </Link>
        </Button>
      </div>
    </div>
  )
}
