'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, Video, Calendar, Clock, ArrowRight, Bot, Brain } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useTour, type TourStep } from '@/components/tour/tour-context'
import { DIFFICULTY_LABELS, DIFFICULTY_COLORS, toDifficultyLevel } from '@/lib/difficulty-levels'

interface Interview {
  id: string; title: string; type: string; role: string
  status: string; scheduled_at: string; duration_minutes: number
  interviewer_id: string; candidate_id: string
  questions: any[]; overall_score?: number
}

export default function InterviewsPage() {
  const gate = usePageGuard('user')
  const { startTour, setTourSeen } = useTour()

  const [interviews, setInterviews] = useState<Interview[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/interviews', { cache: 'no-store' })
      if (res.ok) {
        const j = await res.json()
        setInterviews(j.items as Interview[])
      }
    } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  // Initialize tour on first visit
  useEffect(() => {
    if (gate.ready && !localStorage.getItem('has_seen_interviews_tour')) {
      const interviewsTour: TourStep[] = [
        {
          target: '[data-tour="interviews-header"]',
          title: 'Your Interviews',
          description: 'View all your scheduled and past interviews. Schedule new ones to practice.',
          position: 'bottom',
        },
        {
          target: '[data-tour="interviews-schedule-btn"]',
          title: 'Schedule Interview',
          description: 'Click here to schedule a new AI-powered mock interview.',
          position: 'bottom',
        },
        {
          target: '[data-tour="interviews-list"]',
          title: 'Interview List',
          description: 'Browse your interviews. Click any card to view details and start the interview.',
          position: 'bottom',
        },
      ]
      startTour(interviewsTour, 'interviews')
      setTourSeen('interviews')
    }
  }, [gate.ready, startTour, setTourSeen])

  if (!gate.ready) return null

  const statusColor: Record<string, string> = {
    scheduled: 'bg-blue-500/10 text-blue-500',
    in_progress: 'bg-green-500/10 text-green-500',
    completed: 'bg-muted text-muted-foreground',
    cancelled: 'bg-destructive/10 text-destructive',
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between" data-tour="interviews-header">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Video className="h-7 w-7 text-primary" /> Interviews
        </h1>
        <Link href="/dashboard/interviews/schedule" data-tour="interviews-schedule-btn">
          <Button><Video className="mr-1 h-4 w-4" /> Schedule Interview</Button>
        </Link>
      </div>

      <Link href="/dashboard/interviews/ai-mock/setup">
        <Card className="p-5 hover:border-primary/40 transition-colors flex items-center gap-4 cursor-pointer">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Brain className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold">Start AI Mock Interview</h3>
            <p className="text-xs text-muted-foreground">Practice with AI-generated questions personalized to your resume</p>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
        </Card>
      </Link>

      {loading ? (
        <Card className="flex h-32 items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading interviews…
        </Card>
      ) : interviews.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          <Bot className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
          No interviews yet. Schedule your first AI-powered interview.
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2" data-tour="interviews-list">
          {interviews.map((iv) => (
            <Link key={iv.id} href={`/dashboard/interviews/${iv.id}`}>
              <Card className="p-5 hover:border-primary/40 transition-colors space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold">{iv.title}</h3>
                    <p className="text-xs text-muted-foreground">{iv.role} · {iv.type}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {iv.type && (() => {
                      const dl = toDifficultyLevel(iv.type)
                      return dl ? (
                        <Badge variant="outline" className={`text-[10px] ${DIFFICULTY_COLORS[dl]}`}>
                          {DIFFICULTY_LABELS[dl]}
                        </Badge>
                      ) : null
                    })()}
                    <Badge variant="outline" className={statusColor[iv.status] || ''}>{iv.status}</Badge>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" /> {new Date(iv.scheduled_at).toLocaleString()}
                  <Clock className="h-3 w-3 ml-2" /> {iv.duration_minutes} min
                </div>
                {iv.overall_score !== undefined && (
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${iv.overall_score}%` }} />
                    </div>
                    <span className="text-xs font-medium">{Math.round(iv.overall_score)}%</span>
                  </div>
                )}
                {iv.questions?.length > 0 && (
                  <p className="text-xs text-muted-foreground">{iv.questions.length} questions answered</p>
                )}
                {iv.status === 'completed' && (
                  <Link
                    href={`/dashboard/interviews/feedback?id=${iv.id}`}
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    View Feedback →
                  </Link>
                )}
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
