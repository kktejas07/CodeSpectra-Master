'use client'

import { useEffect, useState, useRef, useMemo } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Loader2, Clock, AlertTriangle, Send, CheckCircle2, ChevronRight, ChevronLeft, LockKeyhole, ShieldX } from 'lucide-react'
import { useToast } from '@/lib/toast-context'
import { ProctoringWrapper } from '@/components/proctoring/ProctoringWrapper'
import { RealTimeProctor } from '@/components/proctoring/RealTimeProctor'
import { ExtensionGate } from '@/components/proctoring/ExtensionGate'
import { IdentityVerification } from '@/components/proctoring/IdentityVerification'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface Question {
  id: string
  type: 'mcq' | 'multiple_response' | 'true_false' | 'coding' | 'descriptive' | 'fill_blanks'
  title: string
  prompt: string
  options?: string[]
}

// ponytail: Fisher-Yates shuffle with optional seed for reproducibility.
// Deterministic seed ensures same user sees same order on re-visit.
function shuffleArray<T>(arr: T[], seed?: number): T[] {
  const copy = [...arr]
  let rng = seed ?? Math.random()
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor((typeof seed === 'number' ? pseudoRandom(rng + i) : Math.random()) * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

// ponytail: Simple LCG for seeded shuffle — not cryptographically secure, good enough for anti-copy
function pseudoRandom(n: number): number {
  const x = Math.sin(n * 9301 + 49297) * 49297
  return x - Math.floor(x)
}

function typeLabel(type: string): string {
  const labels: Record<string, string> = {
    mcq: 'Multiple Choice',
    multiple_response: 'Multiple Response',
    true_false: 'True / False',
    coding: 'Coding Challenge',
    descriptive: 'Written Response',
    fill_blanks: 'Fill in the Blanks',
  }
  return labels[type] || 'Knowledge Check'
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

  // Assessment State — all hooks declared unconditionally (React rule of hooks)
  const [hasStarted, setHasStarted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [timeLeft, setTimeLeft] = useState<number | null>(null)
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({})
  const [currentQIndex, setCurrentQIndex] = useState(0)
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false)

  // Shuffle: map of question id -> shuffled options (stable per session)
  const [shuffledOpts, setShuffledOpts] = useState<Record<string, string[]>>({})

  // Verification State
  const [showVerification, setShowVerification] = useState(false)
  const [idPhoto, setIdPhoto] = useState<string | null>(null)
  const [facePhoto, setFacePhoto] = useState<string | null>(null)

  // Timer Ref for cleanup
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  // Shuffle options once when exam loads or starts
  const sessionSeed = useRef(Math.floor(Math.random() * 2147483647))
  useEffect(() => {
    if (!exam) return
    const map: Record<string, string[]> = {}
    for (const q of exam.questionList) {
      if (q.options && q.options.length > 0 && ['mcq', 'multiple_response', 'true_false'].includes(q.type)) {
        const qSeed = q.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) + sessionSeed.current
        map[q.id] = shuffleArray(q.options, qSeed)
      }
    }
    setShuffledOpts(map)
  }, [exam])

  useEffect(() => {
    const fetchExam = async () => {
      try {
        const res = await fetch(`/api/exams/${params.id}`, { credentials: 'include' })
        if (!res.ok) {
          addToast({ type: 'error', title: 'Assessment unavailable or invalid.' })
          router.push('/')
          return
        }
        const found = await res.json()

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
            setAccessError('This assessment is invite-only. A valid invitation link is required.')
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
        if (typeof window !== 'undefined') {
          try {
            const draft = localStorage.getItem(`codespectra_exam_draft_${params.id}`)
            if (draft) {
              const parsed = JSON.parse(draft)
              if (found.questionList) {
                for (const q of found.questionList) {
                  if (q.type === 'multiple_response' && typeof parsed[q.id] === 'string') {
                    parsed[q.id] = parsed[q.id].split(',').map((s: string) => s.trim()).filter(Boolean)
                  }
                }
              }
              setAnswers(parsed)
            }
          } catch (e) {
            console.error('Failed to load draft:', e)
          }
        }
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
      handleAutoSubmit()
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [hasStarted, timeLeft, isSubmitted, isSubmitting])

  useEffect(() => {
    if (exam && Object.keys(answers).length > 0) {
      localStorage.setItem(`codespectra_exam_draft_${exam.id}`, JSON.stringify(answers))
    }
  }, [answers, exam])

  const handleStart = () => {
    if (!exam) return
    setHasStarted(true)
    // Convert duration (minutes) to seconds
    setTimeLeft(exam.duration * 60)
  }

  const handleAutoSubmit = async () => {
    addToast({ type: 'error', title: 'Time is up! Auto-submitting...' })
    await submitAssessment(true)
  }

  const handleManualSubmit = () => {
    setShowSubmitConfirm(true)
  }

  const submitAssessment = async (autoSubmitted = false) => {
    if (!exam) return
    setIsSubmitting(true)
    try {
      const serialized: Record<string, string> = {}
      for (const [k, v] of Object.entries(answers)) {
        serialized[k] = Array.isArray(v) ? v.join(', ') : v
      }
      const res = await fetch(`/api/exams/${exam.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answers: serialized,
          auto_submitted: autoSubmitted,
          idPhoto,
          facePhoto,
          inviteToken: searchParams.get('inviteToken')
        }),
        credentials: 'include',
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to submit')
      }
      setIsSubmitted(true)
      if (typeof window !== 'undefined') {
        localStorage.removeItem(`codespectra_exam_draft_${exam.id}`)
      }
      addToast({ type: 'success', title: 'Assessment submitted successfully!' })
    } catch (e: any) {
      addToast({ type: 'error', title: 'Failed to submit', message: e.message || '' })
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

          <Button onClick={() => setShowVerification(true)} className="w-full text-lg h-12">
            Start Assessment Now
          </Button>
        </Card>

        {showVerification && (
          <IdentityVerification
            examTitle={exam.title}
            onCancel={() => setShowVerification(false)}
            onComplete={(data) => {
              setIdPhoto(data.idPhoto)
              setFacePhoto(data.facePhoto)
              setShowVerification(false)
              handleStart()
            }}
          />
        )}
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
    <ExtensionGate>
    <>
      <ProctoringWrapper proctoringLevel="strict_lockdown" candidateName="Candidate" sessionKind="exam" sessionId={String(params.id)}>
      <RealTimeProctor sessionKind="exam" sessionId={String(params.id)} enabled={hasStarted}>
      <div className="h-screen bg-background flex flex-col overflow-hidden">
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
              const isAnswered = Array.isArray(answers[q.id]) ? (answers[q.id] as string[]).length > 0 : !!answers[q.id]
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
              <Badge variant="outline" className="uppercase tracking-widest">{typeLabel(currentQ.type)}</Badge>
              <h2 className="text-2xl font-bold">{currentQ.title}</h2>
              <div className="prose prose-zinc dark:prose-invert max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-h2:text-xl prose-h2:mt-6 prose-h2:mb-3 prose-h3:text-lg prose-h3:mt-5 prose-h3:mb-2 prose-p:text-[15px] prose-p:leading-relaxed prose-p:mb-4 prose-code:before:content-none prose-code:after:content-none prose-code:rounded prose-code:bg-muted/60 prose-code:px-1.5 prose-code:py-0.5 prose-code:text-sm prose-code:font-normal prose-pre:bg-zinc-950 prose-pre:border prose-pre:border-border/40 prose-pre:rounded-lg prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-li:text-[15px] prose-strong:text-foreground prose-blockquote:border-l-4 prose-blockquote:border-primary/30 prose-blockquote:bg-primary/5 prose-blockquote:rounded-r-lg prose-blockquote:px-4 prose-blockquote:py-3 prose-table:border prose-table:border-border/40 prose-th:bg-muted/30 prose-th:px-3 prose-th:py-2 prose-th:text-xs prose-td:border-t prose-td:border-border/20 prose-td:px-3 prose-td:py-2 prose-td:text-sm prose-img:rounded-lg p-4 rounded-lg bg-card border">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeHighlight]}
                  components={{
                    code: ({ className, children, ...props }: any) => {
                      const isInline = !className
                      return isInline
                        ? <code className="rounded bg-muted/60 px-1.5 py-0.5 text-sm font-normal" {...props}>{children}</code>
                        : <code className={className} {...props}>{children}</code>
                    },
                  }}
                >
                  {currentQ.prompt}
                </ReactMarkdown>
              </div>
            </div>

            <div className="pt-4">
              {['mcq', 'multiple_response', 'true_false'].includes(currentQ.type) ? (
                <div className="space-y-3">
                  {(shuffledOpts[currentQ.id] || currentQ.options || []).map((opt, i) => {
                    const isMulti = currentQ.type === 'multiple_response'
                    const selectedArr = isMulti ? (Array.isArray(answers[currentQ.id]) ? answers[currentQ.id] as string[] : []) : []
                    const checked = isMulti ? selectedArr.includes(opt) : answers[currentQ.id] === opt
                    return (
                      <label 
                        key={i} 
                        className={`flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-all ${
                          checked 
                            ? 'bg-primary/10 border-primary shadow-xs' 
                            : 'bg-card hover:border-primary/50'
                        }`}
                      >
                        <input 
                          type={isMulti ? 'checkbox' : 'radio'}
                          name={`q-${currentQ.id}`}
                          value={opt}
                          checked={checked}
                          onChange={() => {
                            if (isMulti) {
                              const arr: string[] = Array.isArray(answers[currentQ.id]) ? [...answers[currentQ.id] as string[]] : []
                              const next = arr.includes(opt) ? arr.filter(a => a !== opt) : [...arr, opt]
                              setAnswers(prev => ({ ...prev, [currentQ.id]: next }))
                            } else {
                              setAnswers(prev => ({ ...prev, [currentQ.id]: opt }))
                            }
                          }}
                          className="h-4 w-4 text-primary focus:ring-primary border-gray-300"
                        />
                        <span className="text-sm font-medium">{opt}</span>
                      </label>
                    )
                  })}
                </div>
              ) : currentQ.type === 'fill_blanks' ? (
                (() => {
                  const blankCount = (currentQ.prompt.match(/___/g) || []).length
                  if (blankCount > 1) {
                    const fillAnswers = typeof answers[currentQ.id] === 'string'
                      ? (answers[currentQ.id] as string).split(',').map(s => s.trim())
                      : []
                    return (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <label className="text-sm font-medium text-muted-foreground">Fill in {blankCount} blank(s):</label>
                          <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20">Saved locally</Badge>
                        </div>
                        {Array.from({ length: blankCount }, (_, idx) => (
                          <div key={idx} className="space-y-1.5">
                            <label className="text-xs text-muted-foreground font-medium">Blank {idx + 1}</label>
                            <input
                              type="text"
                              value={fillAnswers[idx] || ''}
                              onChange={(e) => {
                                const arr = [...fillAnswers]
                                arr[idx] = e.target.value
                                setAnswers(prev => ({ ...prev, [currentQ.id]: arr.map(s => s.trim()).join(', ') }))
                              }}
                              placeholder={`Answer for blank ${idx + 1}...`}
                              className="w-full px-4 py-3 rounded-lg border border-border bg-card focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                              autoComplete="off"
                            />
                          </div>
                        ))}
                      </div>
                    )
                  }
                  return (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium text-muted-foreground">Your Answer:</label>
                        <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20">Saved locally</Badge>
                      </div>
                      <input
                        type="text"
                        value={typeof answers[currentQ.id] === 'string' ? answers[currentQ.id] as string : ''}
                        onChange={(e) => setAnswers(prev => ({ ...prev, [currentQ.id]: e.target.value }))}
                        placeholder="Type your answer..."
                        className="w-full px-4 py-3 rounded-lg border border-border bg-card focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                        autoComplete="off"
                      />
                    </div>
                  )
                })()
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-muted-foreground">Your Answer:</label>
                    <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20">Saved locally</Badge>
                  </div>
                  <textarea 
                    value={answers[currentQ.id] || ''}
                    onChange={(e) => setAnswers(prev => ({ ...prev, [currentQ.id]: e.target.value }))}
                    placeholder="// Write your solution here..."
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
    </RealTimeProctor>
    </ProctoringWrapper>

    <AlertDialog open={showSubmitConfirm} onOpenChange={setShowSubmitConfirm}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you sure you want to submit?</AlertDialogTitle>
          <AlertDialogDescription>
            You cannot return to the assessment once submitted. Please verify all your answers before submitting.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={async () => {
            setShowSubmitConfirm(false)
            await submitAssessment(false)
          }}>
            Submit
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
    </ExtensionGate>
  )
}
