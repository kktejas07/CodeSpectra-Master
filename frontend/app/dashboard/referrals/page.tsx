'use client'
import { formatDate } from '@/lib/format-datetime'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, Users, Link2, Copy, Check, Star } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useTour, autoPlayPageTour, type TourStep } from '@/components/tour/tour-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useToast } from '@/lib/toast-context'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonStats, SkeletonCard } from '@/components/ui/skeleton-boneyard'
import { PageHeader, Panel, StatCard } from '@/components/app/page-kit'
import { Illustration } from '@/components/illustrations/spot'

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
  const [loadError, setLoadError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const addToast = useToast()

  useEffect(() => {
    setLoading(true)
    setLoadError(false)
    fetch('/api/referral/stats')
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json() })
      .then((json) => { if (!json.error) setStats(json) })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false))
  }, [reloadKey])

  // First-visit guided tour (same pattern as the other dashboard pages).
  // Only 2 steps: the stats grid and referred-users list render only after a
  // code exists, so there is no third stable first-paint landmark.
  useEffect(() => {
    if (gate.ready) {
      const referralsTour: TourStep[] = [
        {
          target: '[data-tour="referrals-header"]',
          title: 'Invite friends, earn rewards',
          description: 'This page lets users invite friends and earn XP when they join.',
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
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.code) throw new Error(json.error || 'Couldn’t create your code.')
      setStats((prev) => prev ? { ...prev, code: json.code, url: json.url } : { code: json.code, url: json.url, total_referrals: 0, completed_referrals: 0, pending_referrals: 0, total_xp_earned: 0, total_commission_earned: 0, referrals: [] })
      addToast({ type: 'success', title: 'Your referral code is ready' })
    } catch (e) {
      addToast({ type: 'error', title: 'Couldn’t create your referral code', message: e instanceof Error ? e.message : 'Please try again.' })
    }
    setGenerating(false)
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(
      () => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      },
      () => addToast({ type: 'error', title: 'Couldn’t copy', message: 'Select the link and copy it manually.' }),
    )
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
        <PageHeader
          illustration="team"
          className="mb-0"
          icon={<Users aria-hidden />}
          title="Referrals"
          description="Invite friends and earn XP when they verify their email and complete their first graded challenge."
        />
      </div>

      <div data-tour="referrals-action" className="space-y-6">
      {loadError ? (
        <EmptyState
          illustration="error"
          title="Couldn't load your referrals"
          description="Check your connection and try again."
          actionLabel="Try again"
          onAction={() => setReloadKey((k) => k + 1)}
        />
      ) : !stats?.code ? (
        <Panel className="p-10 text-center">
          <Illustration name="team" className="mx-auto w-36" />
          <p className="mt-4 text-muted-foreground">Generate your referral code to start inviting friends.</p>
          <Button onClick={handleGenerate} disabled={generating} className="mt-4">
            {generating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Link2 className="h-4 w-4 mr-2" />}
            Generate referral code
          </Button>
        </Panel>
      ) : (
        <>
          <Panel>
            <div className="flex items-center gap-2 mb-4">
              <Link2 className="h-4 w-4 text-primary" aria-hidden />
              <h2 className="text-lg font-semibold text-foreground">Your referral code</h2>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 rounded-xl border border-border/70 bg-muted/40 px-4 py-3 font-mono text-lg tracking-wider text-foreground">
                {stats.code}
              </div>
              <Button variant="outline" onClick={() => copyToClipboard(stats.url || stats.code || '')} className="shrink-0">
                {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                {copied ? 'Copied' : 'Copy link'}
              </Button>
            </div>
          </Panel>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <StatCard icon={<Users aria-hidden />} label="Total referrals" value={stats.total_referrals} />
            <StatCard icon={<Check aria-hidden />} label="Completed" value={stats.completed_referrals} />
            <StatCard icon={<Star aria-hidden />} label="XP earned" value={stats.total_xp_earned} />
          </div>

          {stats.referrals.length > 0 && (
            <Card className="overflow-hidden rounded-3xl border-border/70">
              <div className="p-6 border-b border-border">
                <h2 className="text-lg font-semibold text-foreground">Referred users</h2>
              </div>
              <div className="divide-y divide-border">
                {stats.referrals.map((r, i) => (
                  <div key={i} className="flex items-center justify-between px-6 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-medium">
                        {(r.name || r.email || '?')[0]?.toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{r.name}</p>
                        <p className="text-xs text-muted-foreground">{r.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={statusColor(r.status)} className="capitalize">{r.status}</Badge>
                      <span className="text-xs tabular-nums text-muted-foreground">{formatDate(r.date)}</span>
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
