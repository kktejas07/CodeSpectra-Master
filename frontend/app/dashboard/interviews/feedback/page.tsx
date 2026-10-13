'use client'

import { useEffect, useState, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  ArrowLeft, Download, AlertCircle, Lock, Play, Pause,
  Volume2, CheckCircle, Clock, MessageSquare, BarChart3,
} from 'lucide-react'
import { SkeletonCard, SkeletonStats, SkeletonText } from '@/components/ui/skeleton-boneyard'
import { usePageGuard, useLockedFeatures } from '@/lib/use-page-guard'
import { useFeedbackReport } from '@/lib/use-feedback-report'
import type { InterviewSessionDoc } from '@/lib/db/interviews'

function scoreCategory(score: number) {
  if (score >= 80) return { label: 'Strong', color: 'bg-green-100 text-green-800' }
  if (score >= 60) return { label: 'Competent', color: 'bg-blue-100 text-blue-800' }
  if (score >= 40) return { label: 'Developing', color: 'bg-yellow-100 text-yellow-800' }
  return { label: 'Needs Improvement', color: 'bg-red-100 text-red-800' }
}

function scoreBarColor(score: number) {
  if (score >= 70) return 'bg-green-500'
  if (score >= 40) return 'bg-yellow-500'
  return 'bg-red-500'
}

function formatTime(seconds?: number) {
  if (!seconds) return null
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function InterviewFeedbackPage() {
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
          <ArrowLeft className="h-4 w-4" /> Back to Interviews
        </Link>
        <Card className="flex flex-col items-center justify-center h-64 text-muted-foreground">
          <MessageSquare className="h-10 w-10 mb-3 opacity-50" />
          <p className="text-sm font-medium">No interview selected</p>
          <p className="text-xs mt-1">Select an interview from the list to view feedback.</p>
        </Card>
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
          <ArrowLeft className="h-4 w-4" /> Back to Interviews
        </Link>
        <Card className="flex flex-col items-center justify-center h-64 text-red-600">
          <AlertCircle className="h-10 w-10 mb-3" />
          <p className="text-sm font-medium">Interview not found</p>
          <Link href="/dashboard/interviews" className="text-xs text-red-500 hover:underline mt-1">
            Return to interviews
          </Link>
        </Card>
      </div>
    )
  }

  if (error === 'forbidden') {
    return (
      <div className="space-y-6">
        <Link href="/dashboard/interviews" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to Interviews
        </Link>
        <Card className="flex flex-col items-center justify-center h-64 text-orange-600">
          <Lock className="h-10 w-10 mb-3" />
          <p className="text-sm font-medium">Access denied</p>
          <p className="text-xs mt-1 text-muted-foreground">You do not have permission to view this interview.</p>
        </Card>
      </div>
    )
  }

  if (!session) return null

  const feedback = session.feedback || []
  const hasFeedback = feedback.length > 0
  const overallScore = session.overall_score ?? 0
  const cat = hasFeedback || session.overall_score != null ? scoreCategory(overallScore) : null

  const statusColors: Record<string, string> = {
    scheduled: 'bg-blue-500/10 text-blue-500',
    in_progress: 'bg-green-500/10 text-green-500',
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
  const gridCols = `${tabCount}fr`

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-4">
        <Link href="/dashboard/interviews" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to Interviews
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">{session.title}</h1>
            <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
              <span>{session.type} interview</span>
              <span>·</span>
              <span>{session.role}</span>
              <Badge variant="outline" className={statusColors[session.status] || ''}>{session.status}</Badge>
              {session.completed_at && (
                <span className="ml-2">Completed {new Date(session.completed_at).toLocaleDateString()}</span>
              )}
            </div>
          </div>
          {hasFeedback && (
            <Button variant="outline" className="gap-2" onClick={handleDownload}>
              <Download className="w-4 h-4" />
              Download Report
            </Button>
          )}
        </div>
      </div>

      {/* Overall Recommendation */}
      {hasFeedback || session.overall_score != null ? (
        <Card className={`p-6 bg-linear-to-r ${
          overallScore >= 70 ? 'from-green-500/10 to-green-600/5 border-green-200/50'
          : overallScore >= 40 ? 'from-yellow-500/10 to-yellow-600/5 border-yellow-200/50'
          : 'from-red-500/10 to-red-600/5 border-red-200/50'
        }`}>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-foreground mb-2">Overall Recommendation</h2>
                {cat && <Badge className={cat.color}>{cat.label}</Badge>}
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-foreground">{Math.round(overallScore)}%</p>
              </div>
            </div>
            <div className="w-full bg-muted rounded-full h-3">
              <div className={`h-3 rounded-full ${scoreBarColor(overallScore)}`} style={{ width: `${overallScore}%` }} />
            </div>
          </div>
        </Card>
      ) : (
        <Card className="p-6 bg-muted/50">
          <div className="flex items-center gap-3 text-muted-foreground">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <div>
              <p className="font-medium">Feedback not yet available</p>
              <p className="text-xs mt-0.5">Complete the interview to receive AI-generated feedback.</p>
            </div>
          </div>
        </Card>
      )}

      {/* Tabs */}
      <Tabs defaultValue="chat" className="w-full">
        <TabsList className="grid w-full" style={{ gridTemplateColumns: gridCols }}>
          {!chatLocked && <TabsTrigger value="chat">Chat Transcript</TabsTrigger>}
          {!analysisLocked && <TabsTrigger value="analysis">Feedback</TabsTrigger>}
          <TabsTrigger value="audio">Audio</TabsTrigger>
        </TabsList>

        {/* Chat Transcript Tab */}
        {!chatLocked && (
          <TabsContent value="chat" className="space-y-4">
            {session.questions.length === 0 ? (
              <Card className="p-8 text-center text-muted-foreground">
                <MessageSquare className="h-8 w-8 mb-2 opacity-50" />
                <p className="text-sm">No questions recorded for this interview.</p>
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
                            <span className="font-semibold text-foreground text-sm">AI Interviewer</span>
                            <Badge variant="outline" className="text-[10px]">{q.category}</Badge>
                            <Badge variant="outline" className={`text-[10px] ${
                              q.difficulty === 'Hard' ? 'text-red-600' : q.difficulty === 'Medium' ? 'text-yellow-600' : 'text-green-600'
                            }`}>{q.difficulty}</Badge>
                            {q.time_limit_seconds > 0 && (
                              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                <Clock className="w-3 h-3" /> {formatTime(q.time_limit_seconds)}
                              </span>
                            )}
                          </div>
                          <div className="p-3 rounded-lg bg-primary/10 border border-primary/30">
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
                              <span className="font-semibold text-foreground text-sm">Candidate</span>
                              {q.time_spent_seconds != null && q.time_spent_seconds > 0 && (
                                <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                  <Clock className="w-3 h-3" /> {formatTime(q.time_spent_seconds)}
                                </span>
                              )}
                              {q.skipped && <Badge variant="outline" className="text-[10px] text-yellow-600">Skipped</Badge>}
                            </div>
                            <div className="p-3 rounded-lg bg-muted border border-border">
                              <p className="text-sm text-foreground leading-relaxed">{q.answer}</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* AI Follow-up */}
                      {q.ai_follow_up && (
                        <div className="ml-11 pl-11 border-l-2 border-dashed border-primary/20">
                          <p className="text-xs text-muted-foreground mb-1 font-medium">AI Follow-up</p>
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
              <Card className="p-8 text-center text-muted-foreground">
                <BarChart3 className="h-8 w-8 mb-2 opacity-50" />
                <p className="text-sm">No feedback data available for this interview.</p>
                <p className="text-xs mt-1">Feedback will appear after the interview is completed.</p>
              </Card>
            ) : (
              <>
                {feedback.map((f) => (
                  <Card key={f.dimension} className="p-6">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-bold text-foreground">{f.dimension}</h3>
                        <span className="text-sm font-semibold text-foreground">{f.score}%</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2.5">
                        <div className={`h-2.5 rounded-full ${scoreBarColor(f.score)}`} style={{ width: `${f.score}%` }} />
                      </div>
                      <p className="text-foreground/70 leading-relaxed text-sm">{f.feedback}</p>
                      {f.suggestions.length > 0 && (
                        <ul className="space-y-2">
                          {f.suggestions.map((s, i) => (
                            <li key={i} className="flex gap-2 text-sm text-foreground/70">
                              <CheckCircle className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
                              <span>{s}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </Card>
                ))}

                {/* Overall score bar */}
                <Card className="p-6 border-primary/20 bg-primary/5">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-bold text-foreground">Overall Score</h3>
                      <span className="text-2xl font-bold text-foreground">{Math.round(overallScore)}%</span>
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
            <Card className="p-8 text-center text-muted-foreground">
              <Volume2 className="h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">Audio recording not available for this interview.</p>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

function AudioPlayer({ url }: { url: string }) {
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
    <Card className="p-6">
      <audio ref={audioRef} src={url} preload="metadata" />
      <div className="space-y-4">
        <h3 className="text-xl font-bold text-foreground">Audio Recording</h3>
        <div className="flex items-center gap-4">
          <Button size="sm" className="rounded-full w-10 h-10 p-0" onClick={togglePlay} title={playing ? 'Pause' : 'Play'}>
            {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </Button>
          <div className="flex-1 cursor-pointer" onClick={seek}>
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
          <span className="text-sm text-muted-foreground">Speed:</span>
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
