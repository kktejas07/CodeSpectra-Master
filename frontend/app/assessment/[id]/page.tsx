'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Loader2, Clock, AlertTriangle, Send, CheckCircle2, ChevronRight, ChevronLeft, LockKeyhole, ShieldX } from 'lucide-react'
import { useToast } from '@/lib/toast-context'
import { ProctoringWrapper } from '@/components/proctoring/ProctoringWrapper'

interface Question {
  id: string
  type: 'mcq' | 'coding'
  title: string
  prompt: string
  options?: string[]
}

interface Exam {
  id: string
  title: string
  level: string
  duration: number
  access_type?: 'invite_only' | 'open'
  questionList: Question[]
}

export default function CandidateAssessmentPage() {
  const addToast = useToast()
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  
  const [exam, setExam] = useState<Exam | null>(null)
  const [loading, setLoading] = useState(true)
  const [accessError, setAccessError] = useState<string | null>(null)
  
  // Assessment State
  const [hasStarted, setHasStarted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [timeLeft, setTimeLeft] = useState<number | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [currentQIndex, setCurrentQIndex] = useState(0)
  
  // Timer Ref for cleanup
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    const fetchExam = async () => {
      try {
        const res = await fetch(`/api/exams`, { credentials: 'include' })
        const json = await res.json()
        const found = json.data?.find((e: Exam) => e.id === params.id)

        if (!found || !found.published) {
          addToast({ type: 'error', title: 'Assessment unavailable or invalid.' })
          router.push('/')
          return
        }

        const accType = found.access_type || 'invite_only'
        const inviteToken = searchParams.get('inviteToken')
        const inviteEmail = searchParams.get('inviteEmail')

        if (accType === 'invite_only') {
          if (!inviteToken) {
            setAccessError('This exam is invite-only. A valid invitation link is required.')
            setLoading(false)
            return
          }
          const verifyRes = await fetch(`/api/assessment/invite/${inviteToken}`, { credentials: 'include' })
          if (!verifyRes.ok) {
            const verifyErr = await verifyRes.json().catch(() => ({ error: 'Invalid or expired invitation' }))
            setAccessError(verifyErr.error || 'Invalid or expired invitation link')
            setLoading(false)
            return
          }
          const verifyJson = await verifyRes.json()
          if (inviteEmail && verifyJson.email?.toLowerCase() !== inviteEmail.toLowerCase()) {
            setAccessError('Email mismatch — this invitation belongs to a different candidate.')
            setLoading(false)
            return
          }
        }

        setExam(found)
      } catch {
        addToast({ type: 'error', title: 'Failed to load assessment' })
      } finally {
        setLoading(false)
      }
    }
    if (params.id) fetchExam()
  }, [params.id, router, searchParams])

  // Timer Logic
  useEffect(() => {
    if (hasStarted && timeLeft !== null && timeLeft > 0 && !isSubmitted && !isSubmitting) {
      timerRef.current = setTimeout(() => setTimeLeft(prev => (prev !== null ? prev - 1 : 0)), 1000)
    } else if (hasStarted && timeLeft === 0 && !isSubmitted && !isSubmitting) {
      // Time is up -> Auto Submit
      handleAutoSubmit()
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [hasStarted, timeLeft, isSubmitted, isSubmitting])

  const handleStart = () => {
    if (!exam) return
    setHasStarted(true)
    // Convert duration (minutes) to seconds
    setTimeLeft(exam.duration * 60)
  }

  const handleAutoSubmit = async () => {
    addToast({ type: 'error', title: 'Time is up! Auto-submitting...' })
    await submitAssessment()
  }

  const handleManualSubmit = async () => {
    if (confirm('Are you sure you want to submit? You cannot return to the assessment once submitted.')) {
      await submitAssessment()
    }
  }

  const submitAssessment = async () => {
    if (!exam) return
    setIsSubmitting(true)
    try {
      // Mocking successful submission for Phase 3.
      await new Promise(r => setTimeout(r, 1500))
      setIsSubmitted(true)
      addToast({ type: 'success', title: 'Assessment submitted successfully!' })
    } catch {
      addToast({ type: 'error', title: 'Failed to submit' })
    } finally {
      setIsSubmitting(false)
    }
  }

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" /> Preparing your environment...
      </div>
    )
  }

  if (!exam) return null

  if (accessError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full p-8 text-center border-destructive/30 space-y-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 mx-auto text-destructive">
            <ShieldX className="h-7 w-7" />
          </div>
          <h1 className="text-xl font-bold">Access Denied</h1>
          <p className="text-sm text-muted-foreground">{accessError}</p>
          <div className="pt-2">
            <Link href="/">
              <Button variant="outline" className="w-full">Return Home</Button>
            </Link>
          </div>
        </Card>
      </div>
    )
  }

  // Pre-Start Screen
  if (!hasStarted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-lg w-full p-8 border-primary/20 space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-2">{exam.title}</h1>
            <p className="text-muted-foreground text-sm">
              You have been invited to complete a {exam.level} level technical assessment.
            </p>
          </div>

          <div className="bg-muted/30 border rounded-lg p-4 space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Duration:</span>
              <span className="font-semibold">{exam.duration} Minutes</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Questions:</span>
              <span className="font-semibold">{exam.questionList.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Format:</span>
              <span className="font-semibold">Strict Timing, Auto-Submit</span>
            </div>
          </div>

          <div className="bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 p-4 rounded-lg flex items-start gap-3 text-sm">
            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
            <p>
              <strong>Warning:</strong> Once you begin, the timer cannot be paused. If the timer reaches zero, your assessment will be automatically submitted regardless of completion. Ensure you have a stable internet connection and {exam.duration} minutes of uninterrupted time.
            </p>
          </div>

          <Button onClick={handleStart} className="w-full text-lg h-12">
            Start Assessment Now
          </Button>
        </Card>
      </div>
    )
  }

  // Submitted Screen
  if (isSubmitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full p-8 text-center border-primary/20 space-y-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10 mx-auto text-green-500 mb-4">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold">Assessment Submitted</h1>
          <p className="text-muted-foreground">
            Thank you for completing the {exam.title} assessment. Your results have been securely recorded and sent to the technical team for review. 
            <br/><br/>
            <strong>Your final score will be released after the admin reviews and evaluates your answers.</strong>
          </p>
          <div className="pt-4">
            <Button variant="outline" onClick={() => router.push('/')}>Return to Home</Button>
          </div>
        </Card>
      </div>
    )
  }

  // Active Assessment UI
  const currentQ = exam.questionList[currentQIndex]

  return (
    <ProctoringWrapper proctoringLevel="strict_lockdown" candidateName="Candidate">
      <div className="min-h-screen bg-background flex flex-col">
        {/* Top Navbar */}
        <header className="sticky top-0 z-30 border-b border-border bg-card px-6 py-3 flex items-center justify-between shadow-xs">
        <div>
          <h1 className="font-bold text-lg">{exam.title}</h1>
          <p className="text-xs text-muted-foreground">Question {currentQIndex + 1} of {exam.questionList.length}</p>
        </div>
        <div className="flex items-center gap-4">
          <div className={`flex items-center gap-2 px-4 py-1.5 rounded-full border font-mono font-bold ${
            (timeLeft || 0) < 300 ? 'bg-red-500/10 border-red-500/30 text-red-600' : 'bg-muted/50 border-border'
          }`}>
            <Clock className="h-4 w-4" />
            {formatTime(timeLeft || 0)} Remaining
          </div>
          <Button onClick={handleManualSubmit} disabled={isSubmitting} variant="destructive" size="sm" className="gap-2">
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Submit Assessment
          </Button>
        </div>
      </header>

      {/* Main Content Workspace */}
      <main className="flex-1 flex overflow-hidden">
        {/* Left Side: Question List Sidebar */}
        <aside className="w-64 border-r border-border bg-muted/10 p-4 overflow-y-auto hidden md:block">
          <h3 className="text-sm font-semibold text-muted-foreground mb-4 uppercase tracking-wider">Overview</h3>
          <div className="space-y-2">
            {exam.questionList.map((q, idx) => {
              const isAnswered = !!answers[q.id]
              const isActive = idx === currentQIndex
              return (
                <button
                  key={q.id}
                  onClick={() => setCurrentQIndex(idx)}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center justify-between ${
                    isActive ? 'bg-primary text-primary-foreground font-medium' :
                    isAnswered ? 'bg-primary/10 text-foreground hover:bg-primary/20' : 'bg-card text-foreground border hover:bg-muted'
                  }`}
                >
                  <span className="truncate pr-2" title={q.title}>Q{idx + 1}: {q.title}</span>
                  {isAnswered && !isActive && <CheckCircle2 className="h-3.5 w-3.5 text-primary" />}
                </button>
              )
            })}
          </div>
        </aside>

        {/* Right Side: Question Active Area */}
        <div className="flex-1 overflow-y-auto p-6 md:p-10 bg-background/50">
          <div className="max-w-4xl mx-auto space-y-8">
            <div className="space-y-4">
              <Badge variant="outline" className="uppercase tracking-widest">{currentQ.type === 'mcq' ? 'Knowledge Check' : 'Implementation Task'}</Badge>
              <h2 className="text-2xl font-bold">{currentQ.title}</h2>
              <div className="prose prose-sm dark:prose-invert max-w-none p-4 rounded-lg bg-card border">
                {currentQ.prompt}
              </div>
            </div>

            <div className="pt-4">
              {currentQ.type === 'mcq' ? (
                <div className="space-y-3">
                  {currentQ.options?.map((opt, i) => (
                    <label 
                      key={i} 
                      className={`flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-all ${
                        answers[currentQ.id] === opt 
                          ? 'bg-primary/10 border-primary shadow-xs' 
                          : 'bg-card hover:border-primary/50'
                      }`}
                    >
                      <input 
                        type="radio" 
                        name={`q-${currentQ.id}`}
                        value={opt}
                        checked={answers[currentQ.id] === opt}
                        onChange={(e) => setAnswers(prev => ({ ...prev, [currentQ.id]: e.target.value }))}
                        className="h-4 w-4 text-primary focus:ring-primary border-gray-300"
                      />
                      <span className="text-sm font-medium">{opt}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-muted-foreground">Your Code Solution:</label>
                    <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20">Auto-saving locally...</Badge>
                  </div>
                  <textarea 
                    value={answers[currentQ.id] || ''}
                    onChange={(e) => setAnswers(prev => ({ ...prev, [currentQ.id]: e.target.value }))}
                    placeholder="// Write your implementation here..."
                    className="w-full h-96 p-4 font-mono text-sm bg-zinc-950 text-zinc-50 rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                    spellCheck={false}
                  />
                </div>
              )}
            </div>

            {/* Pagination Controls */}
            <div className="flex items-center justify-between pt-8 border-t mt-8 pb-12">
              <Button 
                variant="outline" 
                onClick={() => setCurrentQIndex(prev => Math.max(0, prev - 1))}
                disabled={currentQIndex === 0}
              >
                <ChevronLeft className="h-4 w-4 mr-2" /> Previous
              </Button>
              
              {currentQIndex < exam.questionList.length - 1 ? (
                <Button onClick={() => setCurrentQIndex(prev => Math.min(exam.questionList.length - 1, prev + 1))}>
                  Next Question <ChevronRight className="h-4 w-4 ml-2" />
                </Button>
              ) : (
                <Button onClick={handleManualSubmit} variant="default" className="bg-primary hover:bg-primary/90 text-primary-foreground">
                  Complete Assessment <Send className="h-4 w-4 ml-2" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
    </ProctoringWrapper>
  )
}
