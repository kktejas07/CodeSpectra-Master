'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowRight, Code, Users, Brain, MessageSquare, Lock, Briefcase, Clock, Loader } from 'lucide-react'
import Link from 'next/link'

interface InterviewType {
  id: string
  title: string
  description: string
  duration: string
  difficulty: string
  available: boolean
  roles: string[]
}

const ICONS: Record<string, React.ReactNode> = {
  coding: <Code className="w-6 h-6" />,
  'system-design': <Briefcase className="w-6 h-6" />,
  behavioral: <MessageSquare className="w-6 h-6" />,
  'ai-fluency': <Brain className="w-6 h-6" />,
}

export default function InterviewPage() {
  const [interviews, setInterviews] = useState<InterviewType[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/interviews/types')
      .then(r => r.json())
      .then(json => { if (json.data) setInterviews(json.data) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-2">
          <Briefcase className="w-6 h-6 text-primary" />
          <h1 className="text-3xl font-bold text-foreground">AI-Powered Mock Interviews</h1>
        </div>
        <p className="text-muted-foreground mt-1">Practice with AI-powered mock interviews. Choose your role and get started.</p>
      </div>

      <Card className="p-8 bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <h3 className="text-2xl font-bold text-foreground mb-2">Ready for Your Next Interview?</h3>
            <p className="text-muted-foreground">Start a mock interview session with AI feedback. Upload your resume and configure your devices.</p>
          </div>
          <Button asChild size="lg" className="gap-2">
            <Link href="/dashboard/interviews/setup">Start Interview <ArrowRight className="w-4 h-4" /></Link>
          </Button>
        </div>
      </Card>

      {loading ? (
        <div className="flex justify-center py-20"><Loader className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : interviews.length === 0 ? (
        <Card className="border-border/60 p-10 text-center">
          <Briefcase className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-muted-foreground">No interview types available yet.</p>
        </Card>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2">
          {interviews.map(interview => (
            <Card key={interview.id} className={`border-border/60 p-6 ${!interview.available ? 'opacity-60' : ''}`}>
              <div className="flex items-start gap-4 mb-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  {ICONS[interview.id] || <Briefcase className="w-6 h-6" />}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-foreground">{interview.title}</h3>
                    {!interview.available && <Lock className="h-4 w-4 text-muted-foreground" />}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{interview.description}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mb-4">
                <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{interview.duration}</span>
                <Badge variant="outline" className="text-[10px]">{interview.difficulty}</Badge>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-4">
                {interview.roles.map(r => <Badge key={r} variant="secondary" className="text-[10px]">{r}</Badge>)}
              </div>
              <Link href={interview.available ? `/dashboard/interviews/${interview.id}` : '#'}>
                <Button variant="outline" size="sm" className="w-full gap-2" disabled={!interview.available}>
                  {interview.available ? 'Start' : 'Coming Soon'} <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
