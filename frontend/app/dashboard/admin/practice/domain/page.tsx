'use client'

/**
 * Admin → Practice sets: bulk-generate industry / tech-stack / level practice
 * problems, then generate + attach walkthrough videos for them. Superadmin,
 * unlimited on AI credits (no charge/refund). Same shared form + verified
 * pipeline as the learner page, so what an admin publishes here is what
 * learners practice with.
 */
import { useState } from 'react'
import Link from 'next/link'
import { Loader2, Crosshair, ExternalLink, CheckCircle2, XCircle, ListPlus, Video, BookOpen } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { PageHeader, Panel } from '@/components/app/page-kit'
import { Button } from '@/components/ui/button'
import { DomainPracticeForm, type DomainPracticeSelection } from '@/components/practice/domain-practice-form'
import { useAdminT } from '@/lib/i18n/admin'
import { useApiError } from '@/lib/i18n/use-api-error'

interface ResultRow {
  spec: { title: string; difficulty: string; topics: string[]; role: string }
  requested: number
  published: { id: string; slug: string; url: string }[]
  results: Array<{ ok: boolean; reason?: string }>
  failed: number
}

interface VideoJobRow {
  ok?: boolean
  courseId?: string
  courseTitle?: string
  courseUrl?: string
  jobId?: string
  existingJobId?: string
  attached?: number
  skipped?: number
  message?: string
  error?: string
}

export default function AdminDomainPracticePage() {
  const gate = usePageGuard('superadmin')
  const { t } = useAdminT()
  const addToast = useToast()
  const apiError = useApiError()
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ResultRow | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastSel, setLastSel] = useState<DomainPracticeSelection | null>(null)
  const [videoBusy, setVideoBusy] = useState(false)
  const [videoJob, setVideoJob] = useState<VideoJobRow | null>(null)

  const generate = async (sel: DomainPracticeSelection, count: number) => {
    setBusy(true)
    setError(null)
    setResult(null)
    setVideoJob(null)
    setLastSel(sel)
    try {
      const res = await csrfFetch('/api/admin/practice/domain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ industry: sel.industry, techStack: sel.techStack, level: sel.level, count }),
      })
      const j = (await res.json().catch(() => ({}))) as ResultRow & { error?: string }
      if (!res.ok) throw new Error(apiError(j, t('practiceDomain.generateFailed')))
      setResult(j)
      addToast({ type: 'success', title: `${j.published.length}/${j.requested} ${t('practiceDomain.published', { n: j.published.length })}` })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      addToast({ type: 'error', title: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }

  const generateVideos = async () => {
    if (!result || !lastSel) return
    const ids = result.published.map(p => p.id)
    if (ids.length === 0) return
    setVideoBusy(true)
    setVideoJob(null)
    try {
      const res = await csrfFetch('/api/admin/practice/domain/videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          industry: lastSel.industry,
          techStack: lastSel.techStack,
          level: lastSel.level,
          problemIds: ids,
        }),
      })
      const j = (await res.json().catch(() => ({}))) as VideoJobRow & { error?: string }
      if (!res.ok) {
        setVideoJob({ ...j, ok: false })
        addToast({ type: 'error', title: apiError(j, t('practiceDomain.videosFailed')) })
        return
      }
      setVideoJob(j)
      addToast({ type: 'success', title: j.message || t('practiceDomain.videosQueued') })
    } catch (e) {
      addToast({ type: 'error', title: e instanceof Error ? e.message : String(e) })
    } finally {
      setVideoBusy(false)
    }
  }

  if (!gate.ready) return null

  const fails = (result?.results ?? []).filter(r => !r.ok)
  const published = result?.published ?? []

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title={t('practiceDomain.title')}
        description={t('practiceDomain.body')}
        icon={<Crosshair />}
        actions={
          <Button asChild variant="outline" size="sm" className="gap-1.5 rounded-full">
            <Link href="/dashboard/practice/domain">
              <ExternalLink className="h-3.5 w-3.5" aria-hidden /> {t('practiceDomain.learnerPage')}
            </Link>
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[320px_1fr] items-start">
        <Panel className="p-5">
          <DomainPracticeForm
            defaultCount={5}
            disabled={busy}
            onGenerate={(sel, count) => void generate(sel, count)}
            generateLabel={busy ? t('practiceDomain.generating') : t('practiceDomain.generate')}
          />
        </Panel>

        <Panel className="p-5 space-y-4">
          {busy && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              {t('practiceDomain.verifying')}
            </div>
          )}
          {error && (
            <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
          )}
          {result && (
            <div className="space-y-3">
              <p className="text-sm font-semibold">
                {t('practiceDomain.specLabel')}: {result.spec.title} · {result.spec.difficulty}
              </p>
              <p className="text-xs text-muted-foreground">{result.spec.topics.join(', ')}</p>
              <ul className="space-y-2">
                {published.map(p => (
                  <li key={p.id}>
                    <Button asChild variant="outline" size="sm" className="h-9 gap-2">
                      <Link href={`/dashboard/problems/${p.slug}`} target="_blank">
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> {p.slug}
                      </Link>
                    </Button>
                  </li>
                ))}
                {fails.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" aria-hidden />
                    <span>{f.reason || 'rejected'}</span>
                  </li>
                ))}
              </ul>
              {published.length === 0 && (
                <p className="text-sm text-amber-700 dark:text-amber-300">{t('practiceDomain.nonePublished')}</p>
              )}
            </div>
          )}
          {!result && !busy && !error && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <ListPlus className="h-4 w-4" aria-hidden /> {t('practiceDomain.empty')}
            </p>
          )}
        </Panel>
      </div>

      {/* Walkthrough videos for the published set */}
      {result && published.length > 0 && (
        <Panel className="p-5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Video className="h-4 w-4 text-primary" aria-hidden /> {t('practiceDomain.videosTitle')}
              </h2>
              <p className="text-xs text-muted-foreground mt-1">{t('practiceDomain.videosBody')}</p>
            </div>
            <Button onClick={() => void generateVideos()} disabled={videoBusy} className="gap-2">
              {videoBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Video className="h-4 w-4" aria-hidden />}
              {videoBusy ? t('practiceDomain.videosQueuing') : t('practiceDomain.videosCta', { n: published.length })}
            </Button>
          </div>
          {videoJob && videoJob.ok && (
            <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-800 dark:text-green-300">
              <p>{videoJob.message}</p>
              {videoJob.courseUrl && (
                <Link href={videoJob.courseUrl} className="mt-1 flex items-center gap-1 font-medium underline underline-offset-2">
                  <BookOpen className="h-3.5 w-3.5" aria-hidden /> {videoJob.courseTitle || videoJob.courseUrl}
                </Link>
              )}
            </div>
          )}
          {videoJob && !videoJob.ok && videoJob.error && (
            <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{videoJob.error}</div>
          )}
        </Panel>
      )}
    </div>
  )
}
