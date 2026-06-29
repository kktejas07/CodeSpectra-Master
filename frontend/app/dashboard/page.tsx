'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TrendingUp, AlertCircle, Zap, Activity, Code, Trophy, BookOpen, CheckCircle, ArrowRight, Clock, Loader } from 'lucide-react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { DailyChallengeWidget } from '@/components/dashboard/daily-challenge-widget'
import { getDefaultDashboard } from '@/lib/rbac'

export default function DashboardPage() {
  const router = useRouter()
  const pathname = usePathname()
  const { user: fbUser, loading: isPending } = useAuth()
  const [scans, setScans] = useState(0)
  const [reviews, setReviews] = useState(0)
  const [fixes, setFixes] = useState(0)

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

  useEffect(() => {
    fetch('/api/user/stats')
      .then(r => r.json())
      .then(data => {
        if (!data.error) {
          setScans(data.scans ?? 0)
          setReviews(data.reviews ?? 0)
          setFixes(data.fixes ?? 0)
        }
      })
      .catch(() => {})
  }, [])

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Overview of your activity</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="border-border/60 p-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
              <Activity className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Code Scans</p>
              <p className="text-2xl font-bold text-foreground">{scans}</p>
            </div>
          </div>
        </Card>
        <Card className="border-border/60 p-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
              <Code className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Code Reviews</p>
              <p className="text-2xl font-bold text-foreground">{reviews}</p>
            </div>
          </div>
        </Card>
        <Card className="border-border/60 p-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
              <Zap className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Fixes Applied</p>
              <p className="text-2xl font-bold text-foreground">{fixes}</p>
            </div>
          </div>
        </Card>
        <DailyChallengeWidget />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border/60 p-6">
          <div className="mb-4 flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Quick actions</h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Link href="/dashboard/scanner">
              <div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-center transition-colors hover:border-primary/40">
                <Activity className="mx-auto h-6 w-6 text-primary" />
                <p className="mt-2 text-sm font-medium text-foreground">Run Scan</p>
              </div>
            </Link>
            <Link href="/dashboard/challenges">
              <div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-center transition-colors hover:border-primary/40">
                <Trophy className="mx-auto h-6 w-6 text-primary" />
                <p className="mt-2 text-sm font-medium text-foreground">Challenges</p>
              </div>
            </Link>
            <Link href="/dashboard/interviews">
              <div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-center transition-colors hover:border-primary/40">
                <Zap className="mx-auto h-6 w-6 text-primary" />
                <p className="mt-2 text-sm font-medium text-foreground">Interviews</p>
              </div>
            </Link>
            <Link href="/dashboard/exams">
              <div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-center transition-colors hover:border-primary/40">
                <CheckCircle className="mx-auto h-6 w-6 text-primary" />
                <p className="mt-2 text-sm font-medium text-foreground">Exams</p>
              </div>
            </Link>
          </div>
        </Card>

        <Card className="border-border/60 p-6">
          <div className="mb-4 flex items-center gap-2">
            <Trophy className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Your activity</h2>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Scans</span>
              <span className="text-sm font-medium text-foreground">{scans}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Reviews</span>
              <span className="text-sm font-medium text-foreground">{reviews}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Fixes</span>
              <span className="text-sm font-medium text-foreground">{fixes}</span>
            </div>
            <div className="pt-2">
              <Link href="/dashboard/profile">
                <Button variant="outline" size="sm" className="w-full gap-2">
                  <ArrowRight className="h-4 w-4" />
                  View full profile
                </Button>
              </Link>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
