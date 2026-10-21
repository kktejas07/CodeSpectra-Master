'use client'

import { useLocaleDates } from '@/lib/i18n/use-dates'
import { useEffect, useState, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  ArrowLeft, Download, AlertCircle, Play, Pause,
  Volume2, CheckCircle, Clock, MessageSquare, BarChart3,
} from 'lucide-react'
import { SkeletonCard, SkeletonStats, SkeletonText } from '@/components/ui/skeleton-boneyard'
import { usePageGuard, useLockedFeatures } from '@/lib/use-page-guard'
import { useFeedbackReport } from '@/lib/use-feedback-report'
import type { InterviewSessionDoc } from '@/lib/db/interviews'
import { Illustration } from '@/components/illustrations/spot'
import { useT } from '@/lib/i18n/client'
import type { Translator } from '@/lib/i18n/catalog'

function scoreCategory(t: Translator, score: number) {
  if (score >= 80) return { label: t('career.scoreStrong'), color: 'bg-green-500/15 text-green-800 dark:text-green-300' }
  if (score >= 60) return { label: t('career.scoreCompetent'), color: 'bg-primary/15 text-primary' }
  if (score >= 40) return { label: t('career.scoreDeveloping'), color: 'bg-amber-500/15 text-amber-800 dark:text-amber-300' }
  return { label: t('career.scoreNeedsImprovement'), color: 'bg-red-500/15 text-red-800 dark:text-red-300' }
}

function scoreBarColor(score: number) {
  if (score >= 70) return 'bg-green-500'
  if (score >= 40) return 'bg-amber-500'
  return 'bg-red-500'
}

function formatTime(seconds?: number) {
  if (!seconds) return null
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function InterviewFeedbackPage() {
  const { formatDate } = useLocaleDates()
  const { t } = useT()
  const gate = usePageGuard('tenant_admin')
  const { lockedFeatures } = useLockedFeatures()
  const chatLocked = lockedFeatures.includes('interviews/feedback:chat')
  const analysisLocked = lockedFeatures.includes('interviews/feedback:analysis')
  const { downloadPdf } = useFeedbackReport()

  const searchParams = useSearchParams()
  const id = searchParams.get('id')

  const [session, setSession] = useState<InterviewSessionDoc | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<'not-found' | 'forbidden' | null>(null)

  useEffect(() => {
    if (!id) { setLoading(false); return }
    let cancelled = false
    fetch(`/api/interviews/${id}`)
      .then(async (res) => {
        if (cancelled) return
        if (res.status === 404) { setError('not-found'); return }
        if (res.status === 403) { setError('forbidden'); return }
        if (!res.ok) { setError('not-found'); return }
        const data = await res.json()
        setSession(data as InterviewSessionDoc)
      })
      .catch(() => { if (!cancelled) setError('not-found') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [id])

  if (!gate.ready) return null

  // ── No ID ──
  if (!id) {
    return (
      <div className="space-y-6">
        <Link href="/dashboard/interviews" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />{' '}{t('career.backToInterviews')}</Link>
        <EmptyState illustration="interview"
          variant="sessions"
          title={t('career.noInterviewSelected')}
          description={t('career.pickAnInterviewFromYourList021')}
          actionLabel={t('career.goToInterviews')}
          actionHref="/dashboard/interviews"
        />
      </div>
    )
  }

  // ── Loading ──
  if (loading) {
    return (
      <div className="space-y-8">
        <div className="space-y-4">
          <div className="h-4 w-32 bg-muted/60 rounded animate-pulse" />
          <div className="h-8 w-64 bg-muted/60 rounded animate-pulse" />
          <div className="h-4 w-48 bg-muted/50 rounded animate-pulse" />
        </div>
        <SkeletonStats />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    )
  }

  // ── Error states ──
  if (error === 'not-found') {
    return (
      <div className="space-y-6">
        <Link href="/dashboard/interviews" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />{' '}{t('career.backToInterviews')}</Link>
        <Card className="flex flex-col items-center justify-center h-64 rounded-3xl text-destructive">
          <AlertCircle className="h-10 w-10 mb-3" />
          <p className="text-sm font-medium">{t('career.interviewNotFound')}</p>
          <Link href="/dashboard/interviews" className="text-xs text-destructive hover:underline mt-1">{t('career.returnToInterviews')}</Link>
        </Card>
      </div>
    )
  }

  if (error === 'forbidden') {
    return (
      <div className="space-y-6">
        <Link href="/dashboard/interviews" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />{' '}{t('career.backToInterviews')}</Link>
        <Card className="flex flex-col items-center justify-center min-h-64 rounded-3xl p-6 text-center text-amber-700 dark:text-amber-400">
          <Illustration name="locked" className="mb-3 w-36" />
          <p className="text-sm font-medium">{t('career.accessDenied')}</p>
          <p className="text-xs mt-1 text-muted-foreground">{t('career.youDoNotHavePermissionToc31')}</p>
        </Card>
      </div>
    )
  }

  if (!session) return null

  const feedback = session.feedback || []
  const hasFeedback = feedback.length > 0
  const overallScore = session.overall_score ?? 0
  const cat = hasFeedback || session.overall_score != null ? scoreCategory(t, overallScore) : null

  const statusColors: Record<string, string> = {
    scheduled: 'bg-primary/10 text-primary',
    in_progress: 'bg-green-500/10 text-green-700 dark:text-green-400',
    completed: 'bg-muted text-muted-foreground',
    cancelled: 'bg-destructive/10 text-destructive',
  }

  const handleDownload = () => {
    const messages = [
      ...session.questions.map(q => ({ role: 'interviewer' as const, content: q.question })),
      ...session.questions.filter(q => q.answer).map(q => ({ role: 'candidate' as const, content: q.answer! })),
    ]
    downloadPdf({
      interviewType: session.type,
      roleId: session.role,
      overallScore,
      feedback: feedback.map(f => ({
        dimension: f.dimension,
        score: f.score,
        feedback: f.feedback,
        suggestions: f.suggestions,
      })),
      messages,
      proctorEvents: [],
    })
  }

  // ── Tab grid columns ──
  const tabCount = 1 + (chatLocked ? 0 : 1) + (analysisLocked ? 0 : 1)
  const gridCols = `repeat(${tabCount}, minmax(0, 1fr))`

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-4">
        <Link href="/dashboard/interviews" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />{' '}{t('career.backToInterviews')}</Link>
        <PageHeader
          className="mb-0"
          icon={<MessageSquare />}
          title={session.title}
          description={
            <span className="flex flex-wrap items-center gap-2">
              <span>{t('career.typeInterview', { type: session.type })}</span>
              <span>·</span>
              <span>{session.role}</span>
              <Badge variant="outline" className={`capitalize ${statusColors[session.status] || ''}`}>{String(session.status ?? '').replace('_', ' ')}</Badge>
              {session.completed_at && (
                <span className="ml-2">{t('career.completedDate', { date: formatDate(session.completed_at) })}</span>
              )}
            </span>
          }
          actions={hasFeedback ? (
            <Button variant="outline" className="gap-2" onClick={handleDownload}>
              <Download className="w-4 h-4" />{t('career.downloadReport')}</Button>
          ) : undefined}
        />
      </div>

      {/* Overall Recommendation */}
      {hasFeedback || session.overall_score != null ? (
        <Card className={`rounded-3xl p-6 bg-linear-to-r ${
          overallScore >= 70 ? 'from-green-500/10 to-green-600/5 border-green-500/25'
          : overallScore >= 40 ? 'from-amber-500/10 to-amber-600/5 border-amber-500/25'
          : 'from-red-500/10 to-red-600/5 border-red-500/25'
        }`}>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-foreground mb-2">{t('career.overallRecommendation')}</h2>
                {cat && <Badge className={cat.color}>{cat.label}</Badge>}
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold tabular-nums text-foreground">{Math.round(overallScore)}%</p>
              </div>
            </div>
            <div className="w-full bg-muted rounded-full h-3">
              <div className={`h-3 rounded-full ${scoreBarColor(overallScore)}`} style={{ width: `${overallScore}%` }} />
            </div>
          </div>
        </Card>
      ) : (
        <Card className="rounded-3xl p-6 bg-muted/50">
          <div className="flex items-center gap-3 text-muted-foreground">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <div>
              <p className="font-medium text-foreground">{t('career.feedbackNotYetAvailable')}</p>
              <p className="text-xs mt-0.5">{t('career.completeTheInterviewToReceiveAi406')}</p>
            </div>
          </div>
        </Card>
      )}

      {/* Tabs */}
      <Tabs defaultValue={chatLocked ? (analysisLocked ? 'audio' : 'analysis') : 'chat'} className="w-full">
        <TabsList className="grid w-full" style={{ gridTemplateColumns: gridCols }}>
          {!chatLocked && <TabsTrigger value="chat">{t('career.chatTranscript')}</TabsTrigger>}
          {!analysisLocked && <TabsTrigger value="analysis">{t('career.feedback')}</TabsTrigger>}
          <TabsTrigger value="audio">{t('career.audio')}</TabsTrigger>
        </TabsList>

        {/* Chat Transcript Tab */}
        {!chatLocked && (
          <TabsContent value="chat" className="space-y-4">
            {session.questions.length === 0 ? (
              <Card className="rounded-3xl p-8 text-center text-muted-foreground">
                <MessageSquare className="mx-auto h-8 w-8 mb-2 opacity-50" aria-hidden />
                <p className="text-sm">{t('career.noQuestionsRecordedForThisInterview')}</p>
              </Card>
            ) : (
              <div className="space-y-4">
                {session.questions
                  .slice()
                  .sort((a, b) => a.order - b.order)
                  .map((q) => (
                    <div key={q.id} className="space-y-3">
                      {/* Interviewer question */}
                      <div className="flex gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <span className="text-xs font-semibold text-primary">I</span>
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="font-semibold text-foreground text-sm">{t('career.aiInterviewer')}</span>
                            <Badge variant="outline" className="text-[10px]">{q.category}</Badge>
                            <Badge variant="outline" className={`text-[10px] ${
                              q.difficulty === 'Hard' ? 'text-red-600 dark:text-red-400' : q.difficulty === 'Medium' ? 'text-amber-700 dark:text-amber-400' : 'text-green-700 dark:text-green-400'
                            }`}>{q.difficulty}</Badge>
                            {q.time_limit_seconds > 0 && (
                              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                <Clock className="w-3 h-3" /> {formatTime(q.time_limit_seconds)}
                              </span>
                            )}
                          </div>
                          <div className="p-3 rounded-2xl bg-primary/10 border border-primary/30">
                            <p className="text-sm text-foreground leading-relaxed">{q.question}</p>
                          </div>
                        </div>
                      </div>

                      {/* Candidate answer */}
                      {q.answer && (
                        <div className="flex gap-3 ml-11">
                          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                            <span className="text-xs font-semibold text-muted-foreground">C</span>
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-semibold text-foreground text-sm">{t('career.candidate')}</span>
                              {q.time_spent_seconds != null && q.time_spent_seconds > 0 && (
                                <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                  <Clock className="w-3 h-3" /> {formatTime(q.time_spent_seconds)}
                                </span>
                              )}
                              {q.skipped && <Badge variant="outline" className="text-[10px] text-amber-700 dark:text-amber-400">{t('career.skipped')}</Badge>}
                            </div>
                            <div className="p-3 rounded-2xl bg-muted border border-border">
                              <p className="text-sm text-foreground leading-relaxed">{q.answer}</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* AI Follow-up */}
                      {q.ai_follow_up && (
                        <div className="ml-11 pl-11 border-l-2 border-dashed border-primary/20">
                          <p className="text-xs text-muted-foreground mb-1 font-medium">{t('career.aiFollowUp')}</p>
                          <p className="text-sm text-foreground/80 italic">{q.ai_follow_up}</p>
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </TabsContent>
        )}

        {/* Feedback Tab */}
        {!analysisLocked && (
          <TabsContent value="analysis" className="space-y-6">
            {!hasFeedback ? (
              <Card className="rounded-3xl p-8 text-center text-muted-foreground">
                <BarChart3 className="mx-auto h-8 w-8 mb-2 opacity-50" aria-hidden />
                <p className="text-sm">{t('career.noFeedbackDataAvailableForThis6d8')}</p>
                <p className="text-xs mt-1">{t('career.feedbackWillAppearAfterTheInterview91f')}</p>
              </Card>
            ) : (
              <>
                {feedback.map((f) => (
                  <Card key={f.dimension} className="rounded-3xl border-border/70 p-6">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold text-foreground">{f.dimension}</h3>
                        <span className="text-sm font-semibold tabular-nums text-foreground">{f.score}%</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2.5">
                        <div className={`h-2.5 rounded-full ${scoreBarColor(f.score)}`} style={{ width: `${f.score}%` }} />
                      </div>
                      <p className="text-foreground/70 leading-relaxed text-sm">{f.feedback}</p>
                      {f.suggestions.length > 0 && (
                        <ul className="space-y-2">
                          {f.suggestions.map((s, i) => (
                            <li key={i} className="flex gap-2 text-sm text-foreground/70">
                              <CheckCircle className="w-4 h-4 text-primary shrink-0 mt-0.5" aria-hidden />
                              <span>{s}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </Card>
                ))}

                {/* Overall score bar */}
                <Card className="rounded-3xl p-6 border-primary/20 bg-primary/5">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-foreground">{t('career.overallScore')}</h3>
                      <span className="text-2xl font-bold tabular-nums text-foreground">{Math.round(overallScore)}%</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-3">
                      <div className={`h-3 rounded-full ${scoreBarColor(overallScore)}`} style={{ width: `${overallScore}%` }} />
                    </div>
                    {cat && <p className="text-sm text-muted-foreground">{cat.label}</p>}
                  </div>
                </Card>
              </>
            )}
          </TabsContent>
        )}

        {/* Audio Tab */}
        <TabsContent value="audio" className="space-y-6">
          {(session as unknown as { audioUrl?: string }).audioUrl ? (
            <AudioPlayer url={(session as unknown as { audioUrl: string }).audioUrl} />
          ) : (
            <Card className="rounded-3xl p-8 text-center text-muted-foreground">
              <Volume2 className="mx-auto h-8 w-8 mb-2 opacity-50" aria-hidden />
              <p className="text-sm">{t('career.audioRecordingNotAvailableForThis804')}</p>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

function AudioPlayer({ url }: { url: string }) {
  const { t } = useT()
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [speed, setSpeed] = useState(1)

  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    const onTime = () => { if (el.duration) setProgress(el.currentTime / el.duration) }
    const onMeta = () => { if (el.duration) setDuration(el.duration) }
    el.addEventListener('timeupdate', onTime)
    el.addEventListener('loadedmetadata', onMeta)
    return () => { el.removeEventListener('timeupdate', onTime); el.removeEventListener('loadedmetadata', onMeta) }
  }, [])

  const togglePlay = () => {
    const el = audioRef.current
    if (!el) return
    if (el.paused) { el.play(); setPlaying(true) } else { el.pause(); setPlaying(false) }
  }

  const changeSpeed = (s: number) => {
    setSpeed(s)
    if (audioRef.current) audioRef.current.playbackRate = s
  }

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = audioRef.current
    if (!el || !el.duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const pct = (e.clientX - rect.left) / rect.width
    el.currentTime = pct * el.duration
  }

  const fmt = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${String(sec).padStart(2, '0')}`
  }

  return (
    <Card className="rounded-3xl border-border/70 p-6">
      <audio ref={audioRef} src={url} preload="metadata" />
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-foreground">{t('career.audioRecording')}</h3>
        <div className="flex items-center gap-4">
          <Button size="sm" className="rounded-full w-10 h-10 p-0" onClick={togglePlay} title={playing ? t('career.pause') : t('career.play')} aria-label={playing ? t('career.pause') : t('career.play')}>
            {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </Button>
          <div
            className="flex-1 cursor-pointer rounded py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={seek}
            role="slider"
            tabIndex={0}
            aria-label={t('career.seek')}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            onKeyDown={(e) => {
              const el = audioRef.current
              if (!el || !el.duration) return
              if (e.key === 'ArrowRight') { e.preventDefault(); el.currentTime = Math.min(el.duration, el.currentTime + 5) }
              if (e.key === 'ArrowLeft') { e.preventDefault(); el.currentTime = Math.max(0, el.currentTime - 5) }
            }}
          >
            <div className="bg-muted rounded h-1.5 relative">
              <div className="absolute h-full bg-primary rounded" style={{ width: `${progress * 100}%` }} />
            </div>
          </div>
          <span className="text-sm text-muted-foreground tabular-nums">
            {fmt(progress * (duration || 0))} / {duration ? fmt(duration) : '0:00'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Volume2 className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">{t('career.speed')}</span>
          {[0.5, 0.75, 1, 1.25, 1.5, 2].map((s) => (
            <Button
              key={s}
              size="sm"
              variant={speed === s ? 'default' : 'outline'}
              className="h-7 px-2 text-xs"
              onClick={() => changeSpeed(s)}
            >
              {s}x
            </Button>
          ))}
        </div>
      </div>
    </Card>
  )
}
