'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Mic,
  MicOff,
  Send,
  Volume2,
  Clock,
  Brain,
  Loader2,
  ArrowRight,
  MessageCircle,
  AlertTriangle,
  Download,
} from 'lucide-react'
import { useSpeechToText } from '@/lib/speech-recognition'
import { ProctorMonitor } from '@/components/ai/proctor-monitor'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useFeedbackReport } from '@/lib/use-feedback-report'
import {
  generateFollowUpQuestion,
  generateInterviewFeedback,
  generateOpeningQuestion,
  analyzeAnswerQuality,
  type FollowUpQuestion,
  type InterviewFeedback,
} from '@/lib/interview-service'

interface DynamicInterviewProps {
  roleId: string
  interviewType: 'technical' | 'behavioral' | 'system-design'
  resumeInfo?: string
  interviewId?: string
  onComplete?: (feedback: InterviewFeedback[]) => void
}

interface ConversationMessage {
  role: 'interviewer' | 'candidate'
  content: string
  timestamp: Date
  duration?: number
}

export function DynamicInterview({
  roleId,
  interviewType,
  resumeInfo,
  interviewId,
  onComplete,
}: DynamicInterviewProps) {
  const [stage, setStage] = useState<'intro' | 'interview' | 'feedback'>('intro')
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [currentQuestion, setCurrentQuestion] = useState<FollowUpQuestion | null>(null)
  const [userAnswer, setUserAnswer] = useState('')
  const [isLoadingQuestion, setIsLoadingQuestion] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [feedback, setFeedback] = useState<InterviewFeedback[]>([])
  const [timeRemaining, setTimeRemaining] = useState(30 * 60) // 30 minutes
  const [answerStartTime, setAnswerStartTime] = useState<number | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const { downloadPdf } = useFeedbackReport()

  const handleKickout = useCallback(async (reason: string) => {
    if (interviewId) {
      csrfFetch('/api/proctor/terminate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_kind: 'interview', session_id: interviewId, reason }),
      }).catch(() => null)
    }
  }, [interviewId])

  // Speech Recognition
  const {
    transcript,
    isListening,
    error: speechError,
    startListening,
    stopListening,
    resetTranscript,
    isSupported: isSpeechSupported,
  } = useSpeechToText({
    language: 'en-US',
    continuous: true,
    interimResults: true,
  })

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Timer with auto-submit on expiry
  useEffect(() => {
    if (stage !== 'interview') return
    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          // Auto-submit current answer and finish interview
          if (userAnswer.trim()) {
            handleSubmitAnswer()
          } else {
            setStage('feedback')
            onComplete?.(feedback)
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [stage, userAnswer, feedback, onComplete])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Generate opening question
  const handleStartInterview = async () => {
    setStage('interview')
    setIsLoadingQuestion(true)

    try {
      const openingQuestion = await generateOpeningQuestion(
        roleId,
        interviewType,
        resumeInfo
      )

      setMessages([
        {
          role: 'interviewer',
          content: openingQuestion,
          timestamp: new Date(),
        },
      ])

      // Generate first question as FollowUpQuestion-like object
      setCurrentQuestion({
        question: openingQuestion,
        category: 'Introduction' as any,
        difficulty: 'Easy',
        reasoning: 'Opening question to establish context',
        timeLimit: 60,
      })

      setAnswerStartTime(Date.now())
    } catch (error) {
      console.error('Error generating opening question:', error)
      setMessages([
        {
          role: 'interviewer',
          content: 'Tell me about yourself and your background.',
          timestamp: new Date(),
        },
      ])
    } finally {
      setIsLoadingQuestion(false)
    }
  }

  // Submit answer and get follow-up
  const handleSubmitAnswer = async () => {
    if (!userAnswer.trim() || !currentQuestion) return

    const answerDuration = answerStartTime ? Date.now() - answerStartTime : 0

    // Add candidate's message
    const newMessages: ConversationMessage[] = [
      ...messages,
      {
        role: 'candidate',
        content: userAnswer,
        timestamp: new Date(),
        duration: Math.round(answerDuration / 1000),
      },
    ]

    setMessages(newMessages)
    setUserAnswer('')
    resetTranscript()
    setIsAnalyzing(true)

    try {
      // Analyze answer quality
      const analysis = await analyzeAnswerQuality(
        currentQuestion.question,
        userAnswer
      )

      // Generate follow-up question
      if (analysis.needsFollowUp && messages.length < 10) {
        // Limit to 5 questions max (10 messages)
        const followUpQuestion = await generateFollowUpQuestion(userAnswer, {
          role: roleId,
          interviewType,
          previousQuestions: messages
            .filter((m) => m.role === 'interviewer')
            .map((m) => ({
              question: m.content,
              category: 'Previous',
            })),
          userResponses: newMessages
            .filter((m) => m.role === 'candidate')
            .map((m) => ({
              question: 'Previous question',
              answer: m.content,
              timeSpent: m.duration || 0,
            })),
          resumeInfo,
          totalQuestionsAsked: messages.filter((m) => m.role === 'interviewer')
            .length,
        })

        setCurrentQuestion(followUpQuestion)
        setMessages([
          ...newMessages,
          {
            role: 'interviewer',
            content: followUpQuestion.question,
            timestamp: new Date(),
          },
        ])
      } else {
        // Interview complete - generate feedback
        const interviewFeedback = await generateInterviewFeedback(
          {
            role: roleId,
            interviewType,
            previousQuestions: messages
              .filter((m) => m.role === 'interviewer')
              .map((m) => ({
                question: m.content,
                category: 'Previous',
              })),
            userResponses: [],
            resumeInfo,
            totalQuestionsAsked: messages.filter((m) => m.role === 'interviewer')
              .length,
          },
          newMessages
            .filter((m) => m.role === 'candidate')
            .map((m) => ({
              question: 'Interview question',
              answer: m.content,
              timeSpent: m.duration || 0,
            }))
        )

        setFeedback(interviewFeedback)
        setStage('feedback')
        onComplete?.(interviewFeedback)
      }

      setAnswerStartTime(Date.now())
    } catch (error) {
      console.error('Error processing answer:', error)
      // Fallback: proceed to next question or feedback
      setStage('feedback')
    } finally {
      setIsAnalyzing(false)
    }
  }

  // Render interview stage
  if (stage === 'intro') {
    return (
      <div className="min-h-[70vh] bg-background flex items-center justify-center p-4 sm:p-6">
        <Card className="w-full max-w-md rounded-3xl border-border/70 p-8 space-y-6">
          <div className="text-center space-y-2">
            <Brain className="w-12 h-12 mx-auto text-primary" aria-hidden />
            <h1 className="text-3xl font-bold text-foreground">Ready?</h1>
            <p className="text-muted-foreground">
              You&apos;re about to start a {interviewType} interview. The AI will ask dynamic questions based on your responses. Be honest and thorough.
            </p>
          </div>

          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-center gap-2">
              <Clock className="h-4 w-4 shrink-0 text-primary" />
              Duration: about 30 minutes
            </li>
            <li className="flex items-center gap-2">
              <Mic className="h-4 w-4 shrink-0 text-primary" />
              You can speak or type
            </li>
            <li className="flex items-center gap-2">
              <Brain className="h-4 w-4 shrink-0 text-primary" />
              AI adapts follow-ups to your answers
            </li>
            <li className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4 shrink-0 text-primary" />
              Feedback after each response
            </li>
          </ul>

          <Button
            onClick={handleStartInterview}
            size="lg"
            className="w-full gap-2"
            disabled={isLoadingQuestion}
          >
            {isLoadingQuestion ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Preparing interview…
              </>
            ) : (
              <>
                Start interview
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </Button>
        </Card>
      </div>
    )
  }

  if (stage === 'feedback') {
    const overallScore = feedback.length
      ? Math.round(feedback.reduce((s, f) => s + f.score, 0) / feedback.length)
      : 0

    const downloadReport = () => {
      downloadPdf({
        interviewType,
        roleId,
        overallScore,
        feedback,
        messages: messages.map(m => ({ role: m.role, content: m.content, duration: m.duration })),
      })
    }

    return (
      <div className="min-h-[70vh] bg-background p-4 sm:p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <Card className="rounded-3xl border-border/70 p-8 text-center space-y-4">
            <h1 className="text-3xl font-bold text-foreground">Interview complete</h1>
            <p className="text-muted-foreground">
              Your feedback has been generated. Review your performance below.
            </p>
            <Button variant="outline" onClick={downloadReport} className="gap-2">
              <Download className="w-4 h-4" />
              Download report
            </Button>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {feedback.map((item) => (
              <Card key={item.dimension} className="rounded-3xl border-border/70 p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-lg text-foreground">
                    {item.dimension}
                  </h3>
                  <div className="text-2xl font-bold tabular-nums text-primary">
                    {item.score}%
                  </div>
                </div>

                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full"
                    style={{ width: `${item.score}%` }}
                  />
                </div>

                <p className="text-sm text-muted-foreground">{item.feedback}</p>

                <div className="space-y-2">
                  <p className="text-xs font-semibold text-foreground">
                    Suggestions
                  </p>
                  <ul className="space-y-1">
                    {item.suggestions.map((suggestion, i) => (
                      <li
                        key={i}
                        className="text-sm text-muted-foreground flex gap-2"
                      >
                        <span>•</span>
                        <span>{suggestion}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </Card>
            ))}
          </div>

          <Button asChild className="w-full">
            <a href="/dashboard">Return to dashboard</a>
          </Button>
        </div>
      </div>
    )
  }

  // Main interview stage
  const isLowTime = timeRemaining <= 60 && timeRemaining > 0
  const isTimeUp = timeRemaining === 0

  return (
    <div className="min-h-screen bg-background text-foreground p-4 sm:p-6">
      {interviewId && (
        <ProctorMonitor
          sessionKind="interview"
          sessionId={interviewId}
          enabled
          enforceFullscreen
          captureInterval={30000}
          kickoutThreshold={5}
          blockKeyboardShortcuts
          lockdownBrowser
          detectFace
          onKickout={handleKickout}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-8 max-w-6xl mx-auto">
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-primary" aria-hidden />
          <h1 className="text-xl font-bold capitalize">{interviewType} interview</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className={`flex items-center gap-2 px-4 py-2 rounded-xl ${
            isTimeUp ? 'bg-red-500/15 text-red-600 dark:text-red-400 animate-pulse motion-reduce:animate-none' :
            isLowTime ? 'bg-red-500/10 text-red-600 dark:text-red-400' :
            'bg-muted text-foreground'
          }`}>
            <Clock className="w-4 h-4" />
            <span className="font-mono text-sm font-medium tabular-nums">{formatTime(timeRemaining)}</span>
            {isLowTime && <AlertTriangle className="w-4 h-4" aria-hidden />}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chat Area */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="rounded-3xl border-border/70 p-6 h-96 overflow-y-auto">
            <div className="space-y-4">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex gap-3 ${
                    msg.role === 'interviewer' ? 'justify-start' : 'justify-end'
                  }`}
                >
                  <div
                    className={`max-w-xs px-4 py-2 rounded-2xl ${
                      msg.role === 'interviewer'
                        ? 'bg-primary/10 text-foreground'
                        : 'bg-primary text-primary-foreground'
                    }`}
                  >
                    <p className="text-sm">{msg.content}</p>
                    {msg.duration && (
                      <p className="text-xs tabular-nums opacity-70 mt-1">
                        {msg.duration}s
                      </p>
                    )}
                  </div>
                </div>
              ))}

              {isLoadingQuestion && (
                <div className="flex gap-3">
                  <div className="bg-primary/10 px-4 py-2 rounded-2xl">
                    <Skeleton className="h-4 w-32" />
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </Card>

          {/* Input Area */}
          <Card className="rounded-3xl border-border/70 p-6 space-y-4">
            <div className="space-y-2">
              <label htmlFor="dyn-answer" className="text-sm font-medium flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-primary" aria-hidden />
                Your response
              </label>
              <Textarea
                id="dyn-answer"
                value={userAnswer || transcript}
                onChange={(e) => setUserAnswer(e.target.value)}
                placeholder="Type your answer or click the microphone to speak…"
                className="min-h-24"
              />
              {speechError && (
                <p className="text-xs text-destructive">{speechError}</p>
              )}
            </div>

            <div className="flex gap-2">
              {isSpeechSupported && (
                <Button
                  variant={isListening ? 'destructive' : 'outline'}
                  onClick={isListening ? stopListening : startListening}
                  className="gap-2"
                >
                  {isListening ? (
                    <>
                      <MicOff className="w-4 h-4" />
                      Stop listening
                    </>
                  ) : (
                    <>
                      <Mic className="w-4 h-4" />
                      Speak
                    </>
                  )}
                </Button>
              )}

              <Button
                onClick={handleSubmitAnswer}
                disabled={!userAnswer.trim() || isAnalyzing}
                className="flex-1 gap-2"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Processing…
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Submit answer
                  </>
                )}
              </Button>
            </div>
          </Card>
        </div>

        {/* Sidebar - Current Question Info */}
        <div className="space-y-4">
          {currentQuestion && (
            <>
              <Card className="rounded-3xl border-border/70 p-5 space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Badge>{currentQuestion.category}</Badge>
                  <Badge variant="outline">{currentQuestion.difficulty}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {currentQuestion.reasoning}
                </p>
                <div className="flex items-center gap-2 text-xs tabular-nums text-muted-foreground">
                  <Clock className="w-4 h-4" aria-hidden />
                  Suggested: {currentQuestion.timeLimit}s
                </div>
              </Card>

              <Card className="rounded-3xl border-border/70 p-5 space-y-3">
                <h3 className="font-semibold text-sm text-foreground">Tips</h3>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>• Be specific with examples</li>
                  <li>• Show your thinking process</li>
                  <li>• Ask clarifying questions if needed</li>
                  <li>• Stay focused and relevant</li>
                </ul>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
