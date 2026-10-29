'use client'

/**
 * Practice review — approve or reject generated challenges.
 *
 * Challenges are prose and can't be execution-verified, so they wait here as
 * drafts instead of going live unreviewed. Arena and problem content does not
 * appear here: it is published only after its reference solution passes every
 * test (lib/practice-content/*).
 */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Check, Loader2, X } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useAdminT } from '@/lib/i18n/admin'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface DraftChallenge {
  id: string
  title: string
  description: string
  type: string
  difficulty: string
  duration: number
  review_status: string
  source: string
}

interface Counts {
  draft: number
  approved: number
  rejected: number
}

export default function PracticeReviewPage() {
  const gate = usePageGuard('superadmin')
  const { t } = useAdminT()
  const [drafts, setDrafts] = useState<DraftChallenge[]>([])
  const [counts, setCounts] = useState<Counts | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/practice-review', { credentials: 'include' })
      const json = await res.json() as { data?: DraftChallenge[]; counts?: Counts; error?: string }
      if (!res.ok) throw new Error(json.error || String(res.status))
      setDrafts(json.data ?? [])
      setCounts(json.counts ?? null)
    } catch {
      setError(t('practiceReview.loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    if (gate.ready) void load()
  }, [gate.ready, load])

  const review = useCallback(async (id: string, action: 'approve' | 'reject') => {
    setBusy(id)
    setError(null)
    try {
      const res = await csrfFetch('/api/admin/practice-review', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id, action }),
      })
      if (!res.ok) throw new Error(String(res.status))
      setDrafts(prev => prev.filter(d => d.id !== id))
      setCounts(prev => prev ? {
        draft: Math.max(0, prev.draft - 1),
        approved: prev.approved + (action === 'approve' ? 1 : 0),
        rejected: prev.rejected + (action === 'reject' ? 1 : 0),
      } : prev)
    } catch {
      setError(t('practiceReview.actionFailed'))
    } finally {
      setBusy(null)
    }
  }, [t])

  if (!gate.ready) return null

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('practiceReview.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('practiceReview.subtitle')}</p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/dashboard/challenges">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('practiceReview.backToChallenges')}
          </Link>
        </Button>
      </div>

      {counts && (
        <div className="flex flex-wrap gap-2 text-sm">
          <Badge variant="secondary">{t('practiceReview.draft')} {counts.draft}</Badge>
          <Badge variant="outline">{t('practiceReview.approved')} {counts.approved}</Badge>
          <Badge variant="outline">{t('practiceReview.rejected')} {counts.rejected}</Badge>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('practiceReview.loading')}
        </div>
      ) : drafts.length === 0 ? (
        <Card>
          <CardContent className="space-y-1 py-10 text-center">
            <p className="text-sm font-medium">{t('practiceReview.empty')}</p>
            <p className="text-sm text-muted-foreground">{t('practiceReview.emptyBody')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {drafts.map(d => (
            <Card key={d.id}>
              <CardHeader className="pb-2">
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                  {d.title}
                  <Badge variant="secondary" className="text-[10px] uppercase">{d.type}</Badge>
                  <Badge variant="outline" className="text-[10px] uppercase">{d.difficulty}</Badge>
                  <span className="text-xs font-normal text-muted-foreground tabular-nums">{d.duration} min</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">{d.description}</p>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => void review(d.id, 'approve')} disabled={busy === d.id}>
                    {busy === d.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                    {t('practiceReview.approve')}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void review(d.id, 'reject')} disabled={busy === d.id}>
                    <X className="mr-2 h-4 w-4" />
                    {t('practiceReview.reject')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
