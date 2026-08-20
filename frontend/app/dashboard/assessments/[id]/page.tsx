'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { usePageGuard } from '@/lib/use-page-guard'
import { csrfFetch } from '@/lib/csrf-fetch'
import { ProctorMonitor } from '@/components/ai/proctor-monitor'
import { ExtensionGate } from '@/components/proctoring/ExtensionGate'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import {
  Clock, AlertTriangle, Send, ArrowLeft, Loader2,
  CheckCircle, XCircle, ChevronRight,
} from 'lucide-react'
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

interface ExamQuestion {
  id: string
  question: string
  prompt?: string
  type: string
  options?: string[]
  time_limit_seconds: number
  points: number
}

interface ExamDoc {
  id: string
  title: string
  description: string
  duration_minutes: number
  questions: ExamQuestion[]
  status: string
}

export default function ExamPage() {
  const params = useParams()
  const router = useRouter()
  const gate = usePageGuard()
  const examId = params.id as string

  // Tenant admins should manage assessments, not take them
  useEffect(() => {
    if (gate.ready && gate.user && (gate.user.role === 'tenant_admin' || gate.user.role === 'superadmin')) {
      router.replace('/dashboard/admin/assessments')
    }
  }, [gate.ready, gate.user, router])

  const [exam, setExam] = useState<ExamDoc | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentQ, setCurrentQ] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({})
  const [timeRemaining, setTimeRemaining] = useState(0)
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [results, setResults] = useState<{ score: number; total: number; details: Array<{ qId: string; correct: boolean; points: number; answer?: string }> } | null>(null)
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false)
  const [extVerified, setExtVerified] = useState(false)

  useEffect(() => {
    fetch(`/api/exams/${examId}`)
      .then(r => r.json())
      .then(data => {
        if (data && !data.error) {
          const qList = Array.isArray(data.questionList) ? data.questionList : (Array.isArray(data.questions) ? data.questions : [])
          const mappedQuestions: ExamQuestion[] = qList.map((q: any) => ({
            ...q,
            question: q.question || q.title || q.prompt,
            type: q.type,
            points: q.points || q.score || 10,
            time_limit_seconds: q.time_limit_seconds || 120,
          }))
          setExam({ ...data, questions: mappedQuestions })
          setTimeRemaining((data.duration_minutes || data.duration || 30) * 60)
          
          if (data.submission) {
            setResults(data.submission)
            setSubmitted(true)
          } else {
            // Restore draft answers from local storage
            if (typeof window !== 'undefined') {
              try {
                const draft = localStorage.getItem(`codespectra_exam_draft_${examId}`)
                if (draft) {
                  setAnswers(JSON.parse(draft))
                }
              } catch (e) {
                console.error('Failed to load draft:', e)
              }
            }
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [examId])

  useEffect(() => {
    if (exam && Object.keys(answers).length > 0 && !submitted) {
      localStorage.setItem(`codespectra_exam_draft_${exam.id}`, JSON.stringify(answers))
    }
  }, [answers, exam, submitted])

  // Timer with auto-submit (only runs once the Device Audit extension is verified)
  useEffect(() => {
    if (!exam || submitted || !extVerified || timeRemaining <= 0) return
    const timer = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          clearInterval(timer)
          handleSubmit(true)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [exam, submitted, extVerified, timeRemaining])

  const toggleMultiOption = (qId: string, opt: string) => {
    setAnswers(a => {
      const prev = a[qId]
      const current = Array.isArray(prev) ? prev : prev ? [prev] : []
      if (current.includes(opt)) return { ...a, [qId]: current.filter(o => o !== opt) }
      return { ...a, [qId]: [...current, opt] }
    })
  }

  const handleSubmit = useCallback(async (autoSubmitted = false) => {
    if (submitted || submitting) return
    setSubmitting(true)
    try {
      const serialized: Record<string, string> = {}
      for (const [k, v] of Object.entries(answers)) {
        serialized[k] = Array.isArray(v) ? v.join(',') : v
      }
      const res = await csrfFetch(`/api/exams/${examId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: serialized, auto_submitted: autoSubmitted }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Submit failed')
      setResults(data)
      setSubmitted(true)
      if (typeof window !== 'undefined') {
        localStorage.removeItem(`codespectra_exam_draft_${examId}`)
      }
    } catch {
      setSubmitted(true)
    } finally {
      setSubmitting(false)
    }
  }, [examId, answers, submitted, submitting])

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  if (!gate.ready) return null
  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  if (!exam) return <div className="p-8 text-center text-muted-foreground">Assessment not found.</div>

  const isLowTime = timeRemaining <= 60 && timeRemaining > 0
  const question = exam.questions[currentQ]

  // Results view
  if (submitted && results) {
    const isReleased = (results as any).released ?? false;

    if (!isReleased) {
      return (
        <div className="max-w-md mx-auto p-6 mt-10">
          <Card className="p-8 text-center border-primary/20 space-y-6 shadow-xl bg-card/60 backdrop-blur">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10 mx-auto text-green-500 animate-pulse">
              <CheckCircle className="h-8 w-8" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold tracking-tight">Assessment Submitted</h1>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Thank you for completing the assessment. Your answers have been successfully recorded and submitted.
              </p>
            </div>
            <div className="border-t border-border/60 pt-4 text-xs text-muted-foreground">
              Your results are currently under review. The administrator will release your scores shortly.
            </div>
            <Button onClick={() => router.push('/dashboard/assessments')} className="w-full gap-2 mt-2">
              <ArrowLeft className="h-4 w-4" /> Back to Assessments
            </Button>
          </Card>
        </div>
      )
    }

    // If released, display premium, clean results list
    return (
      <div className="max-w-3xl mx-auto p-6 space-y-8">
        <Card className="p-8 text-center space-y-4 bg-card/60 backdrop-blur border-primary/10 shadow-lg">
          <h1 className="text-3xl font-bold tracking-tight">Assessment Results</h1>
          <div className="flex justify-center items-baseline gap-1">
            <span className="text-6xl font-extrabold text-primary">{results.score}</span>
            <span className="text-2xl text-muted-foreground">/ {results.total}</span>
          </div>
          <p className="text-sm font-medium text-muted-foreground">
            {results.score / results.total >= 0.7 
              ? '🎉 Outstanding! You passed the benchmark.' 
              : 'Keep practicing to improve your score!'}
          </p>
        </Card>

        <div className="space-y-4">
          <h3 className="text-xl font-bold tracking-tight px-1 flex items-center gap-2">
            Detailed Breakdown & Learning
          </h3>
          {(results.details || []).map((d, i) => {
            const questionData = exam.questions.find(q => q.id === d.qId)
            const title = questionData?.question || `Question ${i + 1}`
            const typeLabel = questionData?.type || 'multiple-choice'
            const maxPoints = questionData?.points || 10
            
            // Get correct answer value
            const correctAnswer = questionData ? ((questionData as any).answer || (questionData as any).correct_answer || 'N/A') : 'N/A'
            const selectedAnswer = d.answer || '(No answer provided)'

            return (
              <Card 
                key={d.qId} 
                className={`p-5 rounded-2xl border transition-all duration-300 bg-card/40 backdrop-blur hover:bg-card/60 shadow-sm ${
                  d.correct ? 'border-green-500/20 hover:border-green-500/40' : 'border-red-500/20 hover:border-red-500/40'
                }`}
              >
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">                  {/* Column 1: Question details */}
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Question {i + 1}
                      </span>
                      <Badge variant="secondary" className="text-[10px] py-0.5 px-2">
                        {typeLabel}
                      </Badge>
                      <Badge variant={d.correct ? 'default' : 'destructive'} className="text-[10px] py-0.5 px-2 font-mono">
                        {d.correct ? `+${d.points}` : '0'} / {maxPoints} pts
                      </Badge>
                    </div>
                    <h3 className="text-sm font-semibold text-foreground leading-relaxed">
                      {title}
                    </h3>
                    {questionData?.prompt && questionData.prompt !== questionData.question && (
                      <div className="prose prose-sm dark:prose-invert max-w-none prose-p:text-xs prose-pre:text-xs prose-code:text-xs text-xs text-muted-foreground line-clamp-4 leading-relaxed">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          rehypePlugins={[rehypeHighlight]}
                          components={{
                            code: ({ className, children, ...props }: any) => {
                              const isInline = !className
                              return isInline
                                ? <code className="rounded bg-muted/60 px-1 py-0.5 text-xs font-normal" {...props}>{children}</code>
                                : <code className={className} {...props}>{children}</code>
                            },
                          }}
                        >
                          {questionData.prompt}
                        </ReactMarkdown>
                      </div>
                    )}
                  </div>

                  {/* Column 2: Your Answer */}
                  <div className="space-y-1.5">
                    <span className="text-xs font-semibold text-muted-foreground block">
                      Your Selected Answer:
                    </span>
                    <div className={`p-3 rounded-xl border text-sm font-medium ${
                      d.correct 
                        ? 'bg-green-500/5 border-green-500/20 text-green-600 dark:text-green-400' 
                        : 'bg-red-500/5 border-red-500/20 text-red-600 dark:text-red-400'
                    }`}>
                      <div className="flex items-center gap-2 mb-1">
                        {d.correct ? (
                          <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                        )}
                        <span className="text-xs uppercase font-bold tracking-wider">
                          {d.correct ? 'Correct' : 'Incorrect'}
                        </span>
                      </div>
                      <div className="font-mono text-xs break-words whitespace-pre-wrap mt-1 max-h-24 overflow-y-auto bg-black/5 dark:bg-black/25 p-2 rounded-lg">
                        {selectedAnswer}
                      </div>
                    </div>
                  </div>

                  {/* Column 3: Correct Answer */}
                  <div className="space-y-1.5">
                    <span className="text-xs font-semibold text-muted-foreground block">
                      Correct Answer / Solution:
                    </span>
                    <div className="p-3 rounded-xl border border-green-500/20 bg-green-500/5 text-green-600 dark:text-green-400 text-sm font-medium">
                      <div className="flex items-center gap-2 mb-1">
                        <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                        <span className="text-xs uppercase font-bold tracking-wider">
                          Official Answer
                        </span>
                      </div>
                      <div className="font-mono text-xs break-words whitespace-pre-wrap mt-1 max-h-24 overflow-y-auto bg-black/5 dark:bg-black/25 p-2 rounded-lg text-green-600 dark:text-green-300 font-semibold">
                        {correctAnswer}
                      </div>
                    </div>
                  </div>
                </div>

                {(d as any).remarks ? (
                  <div className="mt-4 p-3 rounded-xl border border-amber-500/20 bg-amber-500/5">
                    <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 block mb-1 flex items-center gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5" /> Evaluator Feedback
                    </span>
                    <div className="text-sm text-foreground whitespace-pre-wrap break-words">{String((d as any).remarks)}</div>
                  </div>
                ) : null}
              </Card>
            )
          })}
        </div>

        <div className="flex gap-4">
          <Button onClick={() => router.push('/dashboard/assessments')} className="flex-1 gap-2" variant="outline">
            <ArrowLeft className="h-4 w-4" /> Back to Assessments
          </Button>
          {results.score / results.total >= 0.7 && (
            <Button onClick={() => router.push(`/certificate-preview/${examId}`)} className="flex-1 gap-2 bg-blue-600 hover:bg-blue-700 text-white">
               View Certificate <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    )
  }

  return (
    <ExtensionGate onVerified={() => setExtVerified(true)}>
    <>
      <div className="h-[calc(100vh-4rem)] flex flex-col overflow-hidden">
      <ProctorMonitor
        sessionKind="exam"
        sessionId={examId}
        enabled
        enforceFullscreen={false}
        captureInterval={30000}
        kickoutThreshold={5}
        blockKeyboardShortcuts
        lockdownBrowser
        detectFace
      />

      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/40 backdrop-blur shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard/assessments')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="font-semibold truncate">{exam.title}</h1>
          <Badge variant="outline">{currentQ + 1}/{exam.questions.length}</Badge>
        </div>
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${
          timeRemaining === 0 ? 'bg-red-500/20 text-red-400 animate-pulse' :
          isLowTime ? 'bg-red-500/10 text-red-400' : 'bg-muted'
        }`}>
          <Clock className="h-4 w-4" />
          <span className="text-sm font-mono font-medium">{formatTime(timeRemaining)}</span>
          {isLowTime && <AlertTriangle className="h-4 w-4" />}
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6">
        {question && (
          <div className="max-w-4xl mx-auto space-y-6">
            <Card className="p-6 space-y-4">
              <div className="flex items-center gap-2">
                <Badge>{question.type}</Badge>
                <Badge variant="outline">{question.points} pts</Badge>
                <Badge variant="outline">{question.time_limit_seconds}s limit</Badge>
              </div>
              <div className="prose prose-zinc dark:prose-invert max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-h2:text-xl prose-h2:mt-6 prose-h2:mb-3 prose-h3:text-lg prose-h3:mt-5 prose-h3:mb-2 prose-p:text-[15px] prose-p:leading-relaxed prose-p:mb-4 prose-code:before:content-none prose-code:after:content-none prose-code:rounded prose-code:bg-muted/60 prose-code:px-1.5 prose-code:py-0.5 prose-code:text-sm prose-code:font-normal prose-pre:bg-zinc-950 prose-pre:border prose-pre:border-border/40 prose-pre:rounded-lg prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-li:text-[15px] prose-strong:text-foreground prose-blockquote:border-l-4 prose-blockquote:border-primary/30 prose-blockquote:bg-primary/5 prose-blockquote:rounded-r-lg prose-blockquote:px-4 prose-blockquote:py-3 prose-table:border prose-table:border-border/40 prose-th:bg-muted/30 prose-th:px-3 prose-th:py-2 prose-th:text-xs prose-td:border-t prose-td:border-border/20 prose-td:px-3 prose-td:py-2 prose-td:text-sm prose-img:rounded-lg">
                <h2 className="text-xl font-bold mb-3">{question.question}</h2>
                {(question as any).prompt && (question as any).prompt !== question.question && (
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
                    {(question as any).prompt}
                  </ReactMarkdown>
                )}
              </div>

              {['multiple-choice', 'mcq', 'multiple_response', 'true_false', 'fill_blanks'].includes(question.type) && question.options && (
                <div className="space-y-2">
                  {question.options.map((opt, i) =>
                    question.type === 'multiple_response' ? (
                      <label
                        key={i}
                        className={`flex items-center gap-3 w-full p-3 rounded-lg border cursor-pointer transition-colors ${
                          Array.isArray(answers[question.id]) && (answers[question.id] as string[]).includes(opt)
                            ? 'border-primary bg-primary/10'
                            : 'border-border hover:border-primary/50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="accent-primary h-4 w-4 rounded"
                          checked={Array.isArray(answers[question.id]) && (answers[question.id] as string[]).includes(opt)}
                          onChange={() => toggleMultiOption(question.id, opt)}
                        />
                        <span className="font-medium mr-1">{String.fromCharCode(65 + i)}.</span>
                        {opt}
                      </label>
                    ) : (
                      <button
                        key={i}
                        onClick={() => setAnswers(a => ({ ...a, [question.id]: opt }))}
                        className={`w-full text-left p-3 rounded-lg border transition-colors ${
                          answers[question.id] === opt
                            ? 'border-primary bg-primary/10'
                            : 'border-border hover:border-primary/50'
                        }`}
                      >
                        <span className="font-medium mr-2">{String.fromCharCode(65 + i)}.</span>
                        {opt}
                      </button>
                    )
                  )}
                </div>
              )}

              {(['short-answer', 'code', 'descriptive', 'coding'].includes(question.type)) && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-muted-foreground">
                      {['code', 'coding'].includes(question.type) ? 'Your Code Solution:' : 'Your Answer:'}
                    </label>
                    <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20">Saved locally</Badge>
                  </div>
                  <Textarea
                    value={answers[question.id] || ''}
                    onChange={e => setAnswers(a => ({ ...a, [question.id]: e.target.value }))}
                    placeholder={['code', 'coding'].includes(question.type) ? 'Write your code here...' : 'Type your answer...'}
                    className="min-h-32 font-mono text-sm"
                  />
                </div>
              )}
            </Card>

            {/* Navigation */}
            <div className="flex flex-col gap-4 items-center">
              <div className="flex items-center justify-between w-full">
                <Button
                  variant="outline"
                  disabled={currentQ === 0}
                  onClick={() => setCurrentQ(q => q - 1)}
                >
                  Previous
                </Button>

                {currentQ < exam.questions.length - 1 ? (
                  <Button onClick={() => setCurrentQ(q => q + 1)}>
                    Next <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                ) : (
                  <Button onClick={() => setShowSubmitConfirm(true)} disabled={submitting}>
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                    Submit Assessment
                  </Button>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5 justify-center max-w-full py-1">
                {exam.questions.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentQ(i)}
                    className={`w-8 h-8 rounded-lg text-xs font-semibold transition-all ${
                      i === currentQ ? 'bg-primary text-primary-foreground shadow-sm scale-115' :
                      answers[exam.questions[i].id] ? 'bg-primary/20 text-primary hover:bg-primary/30' :
                      'bg-muted text-muted-foreground hover:bg-muted/80'
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>

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
            await handleSubmit(false)
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
