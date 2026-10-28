'use client'

/**
 * Admin → Problems (SEC-037 follow-up). "Pending review" lists problems that
 * learners published before the admin-only gate (and learner edits since);
 * Approve republishes one and re-indexes it. "Published" lists the live library.
 */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Check, ExternalLink, Loader2, RefreshCw, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonList } from '@/components/ui/skeleton-boneyard'
import { PageHeader, Panel } from '@/components/app/page-kit'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useAdminT } from '@/lib/i18n/admin'
import { useApiError } from '@/lib/i18n/use-api-error'

type Filter = 'pending_review' | 'published'
type Row = { id: string; slug: string; title: string; difficulty: string; topics: string[]; review_requested_at?: string | null; creator_exists?: boolean }

export default function AdminProblemsPage() {
  const { t, td, fmt } = useAdminT()
  const gate = usePageGuard('superadmin')
  const addToast = useToast()
  const apiError = useApiError()
  const [filter, setFilter] = useState<Filter>('pending_review')
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setFailed(false)
    try {
      const url = filter === 'pending_review' ? '/api/admin/problems?status=pending_review' : '/api/problems?limit=200'
      const res = await fetch(url, { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(apiError(data))
      setRows((filter === 'pending_review' ? data.items : data.data) || [])
    } catch {
      setFailed(true)
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [filter, apiError])

  useEffect(() => {
    if (gate.ready) void load()
  }, [gate.ready, load])

  if (!gate.ready) return null

  const approve = async (row: Row) => {
    setBusy(row.id)
    try {
      const res = await csrfFetch(`/api/admin/problems/${encodeURIComponent(row.id)}/approve`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { addToast({ type: 'error', title: apiError(data) }); return }
      addToast({ type: 'success', title: t('problemsReview.approved') })
      setRows((r) => r.filter((x) => x.id !== row.id))
    } catch {
      addToast({ type: 'error', title: t('problemsReview.requestFailed') })
    } finally {
      setBusy(null)
    }
  }

  const filters: { key: Filter; label: string }[] = [
    { key: 'pending_review', label: t('problemsReview.filterPending') },
    { key: 'published', label: t('problemsReview.filterPublished') },
  ]

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <PageHeader
        icon={<ShieldCheck />}
        title={t('problemsReview.title')}
        description={t('problemsReview.description')}
        actions={
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden />
            {t('problemsReview.refresh')}
          </Button>
        }
      />

      <div role="group" aria-label={t('problemsReview.filterLabel')} className="mb-4 flex flex-wrap gap-2">
        {filters.map((f) => (
          <Button
            key={f.key}
            size="sm"
            variant={filter === f.key ? 'default' : 'outline'}
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      <Panel>
        {loading ? (
          <SkeletonList />
        ) : failed ? (
          <EmptyState compact title={t('problemsReview.loadFailed')} description={t('problemsReview.loadFailedHint')} actionLabel={t('problemsReview.tryAgain')} onAction={() => void load()} />
        ) : rows.length === 0 ? (
          <EmptyState
            compact
            title={filter === 'pending_review' ? t('problemsReview.emptyPending') : t('problemsReview.emptyPublished')}
            description={filter === 'pending_review' ? t('problemsReview.emptyPendingHint') : undefined}
          />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((row) => (
              <li key={row.id || row.slug} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="wrap-break-word font-medium text-foreground">{row.title || row.slug}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {row.difficulty && <Badge variant="outline">{td(`problemsReview.difficulty.${row.difficulty}`, row.difficulty)}</Badge>}
                    {filter === 'pending_review' && <Badge variant="secondary">{t('problemsReview.badgePending')}</Badge>}
                    {filter === 'pending_review' && row.creator_exists === false && <span>{t('problemsReview.creatorDeleted')}</span>}
                    {row.review_requested_at && <span>{t('problemsReview.since', { date: fmt.date(row.review_requested_at) })}</span>}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/dashboard/problems/${encodeURIComponent(row.slug || row.id)}`}>
                      <ExternalLink className="mr-1 h-4 w-4" aria-hidden />
                      {t('problemsReview.view')}
                    </Link>
                  </Button>
                  {filter === 'pending_review' && (
                    <Button size="sm" onClick={() => void approve(row)} disabled={busy === row.id}>
                      {busy === row.id ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden /> : <Check className="mr-1 h-4 w-4" aria-hidden />}
                      {t('problemsReview.approve')}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}
