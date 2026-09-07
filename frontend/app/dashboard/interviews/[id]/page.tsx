'use client'

import { use, useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, ArrowLeft, Video, Bot, Clock, Calendar, CheckCircle, Send, SkipForward, BarChart3, Code2, Phone } from 'lucide-react'
import { SkeletonCard, SkeletonStats, SkeletonText, SkeletonButton } from '@/components/ui/skeleton-boneyard'
import { CollabEditor } from '@/components/interviews/collab-editor'
import { csrfFetch } from '@/lib/csrf-fetch'
import Link from 'next/link'
import { usePageGuard } from '@/lib/use-page-guard'
import { useTour, type TourStep } from '@/components/tour/tour-context'

interface Interview {
  id: string; title: string; type: string; role: string
  status: string; scheduled_at: string; duration_minutes: number
  interviewer_id: string; candidate_id: string
  resume_info?: string; notes?: string
  questions: {
    id: string; question: string; category: string; difficulty: string
    order: number; time_limit_seconds: number
    answer?: string; time_spent_seconds?: number; skipped?: boolean
  }[]
  feedback?: { dimension: string; score: number; feedback: string; suggestions: string[] }[]
  overall_score?: number
}

export default function InterviewDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const gate = usePageGuard('user')
  const { startTour, setTourSeen } = useTour()

  const { id } = use(params)
  const router = useRouter()
  const [interview, setInterview] = useState<Interview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentAnswer, setCurrentAnswer] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/auth/session', { credentials: 'include' })
      .then(r => r.json())
      .then(j => setUserId(j?.user?.id || j?.uid || null))
      .catch(() => {})
  }, [])

  // Initialize tour if this is the first visit to interview detail
  useEffect(() => {
    if (gate.ready && !localStorage.getItem('has_seen_interview-detail_tour')) {
      const interviewTour: TourStep[] = [
        {
          target: '[data-tour="back-to-interviews"]',
          title: 'Interview Dashboard',
          description: 'Return to your list of scheduled interviews.',
          position: 'bottom',
        },
        {
          target: '[data-tour="interview-details"]',
          title: 'Interview Details',
          description: 'View the scheduled interview information including title, role, and type.',
          position: 'bottom',
        },
        {
          target: '[data-tour="status-controls"]',
          title: 'Interview Controls',
          description: 'Start or end interviews using these control buttons.',
          position: 'bottom',
        },
        {
          target: '[data-tour="current-question"]',
          title: 'Current Question',
          description: 'The active question you need to answer during the interview.',
          position: 'bottom',
        },
        {
          target: '[data-tour="answered-questions"]',
          title: 'Answered Questions',
          description: 'Review all your previous answers and feedback.',
          position: 'bottom',
        },
        {
          target: '[data-tour="ai-feedback"]',
          title: 'AI Feedback',
          description: 'View performance feedback and suggestions from the AI interviewer.',
          position: 'bottom',
        },
        {
          target: '[data-tour="collaborative-editor"]',
          title: 'Collaborative Editor',
          description: 'Real-time collaborative code editor for writing solutions during the interview.',
          position: 'bottom',
        }
      ]
      startTour(interviewTour, 'interview-detail')
      setTourSeen('interview-detail')
    }
  }, [gate.ready, startTour, setTourSeen])

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/interviews/${id}`, { cache: 'no-store' })
      if (!res.ok) throw new Error('Interview not found')
      setInterview(await res.json() as Interview)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setLoading(false) }
  }, [id])

  useEffect(() => { void load() }, [load])

  const updateStatus = async (status: string) => {
    await csrfFetch(`/api/interviews/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    await load()
  }

  const submitAnswer = async (questionId: string) => {
    if (!currentAnswer.trim()) return
    setSubmitting(true)
    try {
      await csrfFetch(`/api/interviews/${id}/questions`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question_id: questionId, answer: currentAnswer, time_spent_seconds: 30 }),
      })
      setCurrentAnswer('')
      await load()
    } catch {} finally { setSubmitting(false) }
  }

  if (!gate.ready) return null

  if (loading) return (
    <div className="max-w-4xl space-y-6">
      <div className="h-4 w-32 bg-muted/60 rounded animate-pulse" />
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="h-8 w-64 bg-muted/60 rounded animate-pulse" />
          <div className="h-4 w-40 bg-muted/50 rounded animate-pulse" />
        </div>
        <div className="flex gap-2">
          <SkeletonButton />
          <SkeletonButton />
        </div>
      </div>
      <SkeletonStats />
      <SkeletonCard />
      <SkeletonCard />
    </div>
  )
  if (!interview) return <div className="p-10 text-center text-destructive">{error || 'Not found'}</div>

  const unanswered = interview.questions.filter((q) => !q.answer && !q.skipped)
  const answered = interview.questions.filter((q) => q.answer)
  const currentQ = unanswered[0]

  return (
    <div className="max-w-4xl space-y-6">
      <Link href="/dashboard/interviews" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground" data-tour="back-to-interviews">
        <ArrowLeft className="h-3 w-3" /> All interviews
      </Link>

      <div className="flex items-start justify-between">
        <div data-tour="interview-details">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Video className="h-6 w-6 text-primary" /> {interview.title}
          </h1>
          <p className="text-sm text-muted-foreground">{interview.role} · {interview.type}</p>
        </div>
        <div className="flex items-center gap-2" data-tour="status-controls">
          <Badge variant={interview.status === 'in_progress' ? 'default' : 'secondary'}>{interview.status}</Badge>
          {interview.status === 'scheduled' && (
            <Button size="sm" onClick={() => updateStatus('in_progress')}>
              <Video className="h-3.5 w-3.5 mr-1" /> Start Interview
            </Button>
          )}
          {interview.status === 'in_progress' && (
            <Button size="sm" variant="outline" onClick={() => updateStatus('completed')}>
              <CheckCircle className="h-3.5 w-3.5 mr-1" /> End Interview
            </Button>
          )}
        </div>
      </div>

      {userId && (interview.interviewer_id === userId || interview.candidate_id === userId) && (
        <Link
          href={`/dashboard/interviews/${id}/live`}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 w-fit"
        >
          <Phone className="h-4 w-4" /> Join Live Room
        </Link>
      )}

      <div className="flex gap-2 text-xs text-muted-foreground">
        <Calendar className="h-3 w-3" /> {new Date(interview.scheduled_at).toLocaleString()}
        <Clock className="h-3 w-3 ml-2" /> {interview.duration_minutes} min
        <BarChart3 className="h-3 w-3 ml-2" /> {answered.length}/{interview.questions.length} answered
      </div>

      {interview.overall_score !== undefined && (
        <Card className="p-4 border-primary/20 bg-primary/5">
          <div className="flex items-center gap-4">
            <div className="text-3xl font-bold text-primary">{Math.round(interview.overall_score)}%</div>
            <div>
              <p className="text-sm font-medium">Overall Score</p>
              <div className="h-2 w-48 rounded-full bg-muted overflow-hidden mt-1">
                <div className="h-full bg-primary rounded-full" style={{ width: `${interview.overall_score}%` }} />
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Current question */}
      {currentQ && interview.status === 'in_progress' && (
        <Card className="p-6 space-y-4 border-primary/30" data-tour="current-question">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Bot className="h-4 w-4 text-primary" />
            <Badge variant="outline">{currentQ.category}</Badge>
            <Badge variant="outline">{currentQ.difficulty}</Badge>
          </div>
          <p className="text-lg">{currentQ.question}</p>
          <Textarea
            rows={5} value={currentAnswer}
            onChange={(e) => setCurrentAnswer(e.target.value)}
            placeholder="Type your answer..."
          />
          <div className="flex gap-2">
            <Button onClick={() => submitAnswer(currentQ.id)} disabled={submitting || !currentAnswer.trim()}>
              {submitting ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}
              Submit Answer
            </Button>
            <Button variant="ghost" onClick={async () => {
              await csrfFetch(`/api/interviews/${id}/questions`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question_id: currentQ.id, skipped: true }),
              })
              await load()
            }}>
              <SkipForward className="mr-1 h-4 w-4" /> Skip
            </Button>
          </div>
        </Card>
      )}

      {/* Answered questions */}
      {answered.length > 0 && (
        <div className="space-y-3" data-tour="answered-questions">
          <h2 className="text-sm font-semibold">Answered Questions ({answered.length})</h2>
          {answered.map((q) => (
            <Card key={q.id} className="p-4 space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="text-sm font-medium">{q.question}</span>
                <Badge variant="outline" className="ml-auto">{q.category}</Badge>
              </div>
              <p className="text-sm text-muted-foreground ml-6">{q.answer}</p>
            </Card>
          ))}
        </div>
      )}

      {/* Feedback */}
      {interview.feedback && interview.feedback.length > 0 && (
        <div className="space-y-3" data-tour="ai-feedback">
          <h2 className="text-sm font-semibold">AI Feedback</h2>
          {interview.feedback.map((f, i) => (
            <Card key={i} className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{f.dimension}</span>
                <span className="text-sm font-bold">{f.score}/100</span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-primary rounded-full" style={{ width: `${f.score}%` }} />
              </div>
              <p className="text-sm text-muted-foreground">{f.feedback}</p>
              {f.suggestions.length > 0 && (
                <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-1">
                  {f.suggestions.map((s, j) => <li key={j}>{s}</li>)}
                </ul>
              )}
            </Card>
          ))}
        </div>
      )}

      {interview.status === 'completed' && interview.questions.length === 0 && (
        <Card className="p-6 text-center">
          <p className="text-sm text-muted-foreground">No questions were recorded for this interview.</p>
        </Card>
      )}

      {/* Collaborative Editor */}
      {(interview.status === 'in_progress' || interview.status === 'scheduled') && (
        <div className="space-y-3" data-tour="collaborative-editor">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Code2 className="h-4 w-4 text-primary" /> Collaborative Editor
          </h2>
          <CollabEditor
            sessionId={interview.id}
            initialLanguage="javascript"
            readOnly={false}
          />
        </div>
      )}
    </div>
  )
}
