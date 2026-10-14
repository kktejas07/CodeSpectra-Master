'use client'
import { formatDate } from '@/lib/format-datetime'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, Users, Link2, Copy, Check, Star, Coins } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useTour, autoPlayPageTour, type TourStep } from '@/components/tour/tour-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { SkeletonStats, SkeletonCard } from '@/components/ui/skeleton-boneyard'

interface ReferralStats {
  code: string | null
  url: string | null
  total_referrals: number
  completed_referrals: number
  pending_referrals: number
  total_xp_earned: number
  total_commission_earned: number
  referrals: Array<{ name: string; email: string; status: string; date: string }>
}

export default function ReferralsPage() {
  const gate = usePageGuard('user')
  const { startTour, setTourSeen } = useTour()
  const [stats, setStats] = useState<ReferralStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetch('/api/referral/stats')
      .then((r) => r.json())
      .then((json) => { if (!json.error) setStats(json) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // First-visit guided tour (same pattern as the other dashboard pages).
  // Only 2 steps: the stats grid and referred-users list render only after a
  // code exists, so there is no third stable first-paint landmark.
  useEffect(() => {
    if (gate.ready) {
      const referralsTour: TourStep[] = [
        {
          target: '[data-tour="referrals-header"]',
          title: 'Invite friends, earn rewards',
          description: 'This page lets users invite friends to earn XP and commission rewards.',
          position: 'bottom',
        },
        {
          target: '[data-tour="referrals-action"]',
          title: 'Generate code, track rewards',
          description: 'Generate your referral code, copy the link to share, then track referrals and rewards below; check statuses here.',
          position: 'top',
        },
      ]
      autoPlayPageTour('referrals', referralsTour)}
  }, [gate.ready, startTour, setTourSeen])

  async function handleGenerate() {
    setGenerating(true)
    try {
      const res = await csrfFetch('/api/referral/generate', { method: 'POST' })
      const json = await res.json()
      if (json.code) {
        setStats((prev) => prev ? { ...prev, code: json.code, url: json.url } : { code: json.code, url: json.url, total_referrals: 0, completed_referrals: 0, pending_referrals: 0, total_xp_earned: 0, total_commission_earned: 0, referrals: [] })
      }
    } catch { /* ignore */ }
    setGenerating(false)
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!gate.ready) return null
  if (loading) return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="h-8 w-28 bg-muted/60 rounded animate-pulse" />
        <div className="h-4 w-64 bg-muted/40 rounded animate-pulse" />
      </div>
      <SkeletonCard />
      <SkeletonStats />
      <SkeletonCard />
    </div>
  )

  const statusColor = (s: string) => {
    if (s === 'completed' || s === 'commissioned') return 'default'
    return 'secondary'
  }

  return (
    <div className="space-y-6">
      <div data-tour="referrals-header">
        <div className="flex items-center gap-2">
          <Users className="w-6 h-6 text-primary" />
          <h1 className="text-3xl font-bold text-foreground">Referrals</h1>
        </div>
        <p className="text-muted-foreground mt-1">Invite friends and earn XP and commission rewards.</p>
      </div>

      <div data-tour="referrals-action">
      {!stats?.code ? (
        <Card className="border-border/60 p-10 text-center">
          <Users className="h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-muted-foreground">Generate your unique referral code to start inviting friends.</p>
          <Button onClick={handleGenerate} disabled={generating} className="mt-4">
            {generating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Link2 className="h-4 w-4 mr-2" />}
            Generate Referral Code
          </Button>
        </Card>
      ) : (
        <>
          <Card className="border-border/60 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Link2 className="h-4 w-4 text-primary" />
              <h2 className="text-lg font-semibold">Your Referral Code</h2>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 rounded-lg bg-muted/50 px-4 py-3 font-mono text-lg tracking-widest text-foreground">
                {stats.code}
              </div>
              <Button variant="outline" onClick={() => copyToClipboard(stats.url || stats.code || '')} className="shrink-0">
                {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                {copied ? 'Copied' : 'Copy Link'}
              </Button>
            </div>
          </Card>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border-border/60 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.total_referrals}</p>
                  <p className="text-xs text-muted-foreground">Total Referrals</p>
                </div>
              </div>
            </Card>
            <Card className="border-border/60 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/15 text-green-600 dark:text-green-400">
                  <Check className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.completed_referrals}</p>
                  <p className="text-xs text-muted-foreground">Completed</p>
                </div>
              </div>
            </Card>
            <Card className="border-border/60 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
                  <Star className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.total_xp_earned}</p>
                  <p className="text-xs text-muted-foreground">XP Earned</p>
                </div>
              </div>
            </Card>
            <Card className="border-border/60 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/15 text-purple-600 dark:text-purple-400">
                  <Coins className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold">₹{(stats.total_commission_earned / 100).toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground">Commission</p>
                </div>
              </div>
            </Card>
          </div>

          {stats.referrals.length > 0 && (
            <Card className="border-border/60">
              <div className="p-6 border-b border-border">
                <h2 className="text-lg font-semibold">Referred Users</h2>
              </div>
              <div className="divide-y divide-border">
                {stats.referrals.map((r, i) => (
                  <div key={i} className="flex items-center justify-between px-6 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
                        {(r.name || r.email || '?')[0]?.toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{r.name}</p>
                        <p className="text-xs text-muted-foreground">{r.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={statusColor(r.status)} className="capitalize">{r.status}</Badge>
                      <span className="text-xs text-muted-foreground">{formatDate(r.date)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
      </div>
    </div>
  )
}
