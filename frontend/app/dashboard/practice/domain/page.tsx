'use client'

/**
 * Industry / tech-stack / level practice problem sets.
 *
 * Pick a coordinate, spend credits, get back freshly generated coding problems
 * that are already verified in the sandbox and published to the library. Each
 * links to /dashboard/problems/<slug> where it is solvable in the editor.
 * "Generate walkthrough videos" turns the set into course lessons, the course
 * worker renders + uploads the MP4s and attaches them to the course.
 */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, Zap, CheckCircle2, XCircle, ExternalLink, Video, BookOpen } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useAuth } from '@/lib/auth-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useToast } from '@/lib/toast-context'
import { PageHeader, Panel } from '@/components/app/page-kit'
import { Button } from '@/components/ui/button'
import { creditBalanceLabel } from '@/lib/ai-credits-display'
import { useApiError } from '@/lib/i18n/use-api-error'
import { useT } from '@/lib/i18n/client'
import { DomainPracticeForm, type DomainPracticeSelection } from '@/components/practice/domain-practice-form'

interface PublishedProblem { id: string; slug: string; url: string }
interface ResultRow {
  spec?: unknown
  published: PublishedProblem[]
  results: Array<{ ok: boolean; reason?: string; id?: string; slug?: string }>
  requested?: number
  failed?: number
  balance?: number | null
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
  charged?: number
  balance?: number | null
  unlimited?: boolean
  message?: string
  error?: string
}

export default function DomainPracticePage() {
  const apiError = useApiError()
  const gate = usePageGuard('user')
  const { user } = useAuth()
  const { t } = useT()
  const addToast = useToast()

  const [credits, setCredits] = useState<number | null>(null)
  const [unlimited, setUnlimited] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ResultRow | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastSel, setLastSel] = useState<DomainPracticeSelection | null>(null)
  const [videoBusy, setVideoBusy] = useState(false)
  const [videoJob, setVideoJob] = useState<VideoJobRow | null>(null)

  const loadCredits = useCallback(() => {
    fetch('/api/user/ai-credits')
      .then(r => r.json())
      .then(d => {
        if (d.unlimited) setUnlimited(true)
        if (typeof d.balance === 'number' && !d.unlimited) setCredits(d.balance)
      })
      .catch(() => {})
  }, [])
  useEffect(loadCredits, [loadCredits])

  const generate = async (sel: DomainPracticeSelection, count: number) => {
    if (!user) return
    setBusy(true)
    setError(null)
    setResult(null)
    setLastSel(sel)
    setVideoJob(null)
    try {
      const res = await csrfFetch('/api/practice/domain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          industry: sel.industry,
          techStack: sel.techStack,
          level: sel.level,
          count,
        }),
      })
      const j = (await res.json().catch(() => ({}))) as ResultRow & { error?: string; balance?: number | null }
      if (res.status === 402) {
        setError(t('practice.outOfCreditsForDomainPractice') || 'Not enough AI credits for this practice set.')
        setCredits(typeof j.balance === 'number' ? j.balance : credits)
        return
      }
      if (!res.ok) throw new Error(apiError(j, t('practice.domainPracticeFailed') || 'Practice generation failed.'))
      setResult(j)
      // balance is null for unlimited superadmins — refresh from the credit endpoint.
      if (typeof j.balance === 'number') setCredits(j.balance)
      else loadCredits()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
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
      const res = await csrfFetch('/api/practice/domain/videos', {
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
        addToast({ type: 'error', title: apiError(j, t('practice.videosFailed') || 'Video generation failed') })
        return
      }
      setVideoJob(j)
      if (typeof j.balance === 'number' && !j.unlimited) setCredits(j.balance)
      addToast({ type: 'success', title: j.message || t('practice.videosQueued') || 'Videos queued for the course worker.' })
    } catch (e) {
      addToast({ type: 'error', title: e instanceof Error ? e.message : String(e) })
    } finally {
      setVideoBusy(false)
    }
  }

  if (!gate.ready) return null

  const published = result?.published ?? []
  const fails = (result?.results ?? []).filter(r => !r.ok)

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title={t('practice.domainPractice') || 'Practice problem sets'}
        description={t('practice.domainPracticeBody') || 'Pick an industry, tech stack and level. We generate coding problems grounded in that world, verify each one in the sandbox, and add it to the library — then you solve it in the editor.'}
        icon={<Zap />}
        actions={
          <div className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-sm">
            <Zap className="h-4 w-4 text-amber-500" aria-hidden />
            <span className="font-medium tabular-nums text-muted-foreground">{t('practice.creditsValue', { value: creditBalanceLabel({ balance: credits, unlimited }) })}</span>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[320px_1fr] items-start">
        <Panel className="p-5 space-y-4">
          <DomainPracticeForm
            defaultCount={3}
            disabled={busy}
            onGenerate={(sel, count) => void generate(sel, count)}
            generateLabel={busy ? t('practice.generatingDomainPractice') || 'Generating…' : t('practice.generatePracticeSet') || 'Generate practice set'}
          />
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {t('practice.domainPracticeCost') || '1 AI credit per problem. Problems that fail the sandbox gate are refunded automatically.'}
          </p>
        </Panel>

        <Panel className="p-5 space-y-4">
          {busy && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              {t('practice.verifyingInSandbox') || 'Generating and verifying problems in the sandbox… this takes a minute or two.'}
            </div>
          )}

          {error && (
            <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {result && (
            <div className="space-y-3">
              <p className="text-sm font-semibold">
                {published.length}/{result.requested ?? published.length + (result.failed || 0)} {t('practice.publishedToLibrary') || 'published to the library'}
              </p>
              <ul className="space-y-2">
                {published.map(p => (
                  <li key={p.id}>
                    <Button asChild variant="outline" size="sm" className="h-9 gap-2">
                      <Link href={p.url} target="_blank">
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden /> {p.slug}
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
              {published.length > 0 && (
                <p className="flex items-center gap-1.5 text-xs text-green-700 dark:text-green-400">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                  {t('practice.readyToSolve') || 'Open any link above to solve it in the code editor.'}
                </p>
              )}
            </div>
          )}

          {!result && !busy && !error && (
            <p className="text-sm text-muted-foreground">
              {t('practice.domainPracticeEmpty') || 'Your generated, sandbox-verified problems will appear here.'}
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
                <Video className="h-4 w-4 text-primary" aria-hidden /> {t('practice.videosTitle') || 'Walkthrough videos'}
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                {t('practice.videosBody') || 'Each problem becomes a lesson on this stack+level course; the course worker renders + uploads the MP4 and attaches it back to the course.'}
              </p>
            </div>
            <Button onClick={() => void generateVideos()} disabled={videoBusy} className="gap-2">
              {videoBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Video className="h-4 w-4" aria-hidden />}
              {videoBusy ? (t('practice.videosQueuing') || 'Queuing…') : (t('practice.videosCta', { n: published.length }) || `Generate ${published.length} video(s)`)}
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
