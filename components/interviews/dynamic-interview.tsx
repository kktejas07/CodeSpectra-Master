'use client'

import { useState, useEffect, useRef } from 'react'
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
} from 'lucide-react'
import { useSpeechToText } from '@/lib/speech-recognition'
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

  // Timer
  useEffect(() => {
    if (stage !== 'interview') return
    const timer = setInterval(() => {
      setTimeRemaining((prev) => (prev > 0 ? prev - 1 : 0))
    }, 1000)
    return () => clearInterval(timer)
  }, [stage])

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
        category: 'Introduction',
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
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-6">
        <Card className="w-full max-w-md p-8 space-y-6">
          <div className="text-center space-y-2">
            <Brain className="w-12 h-12 mx-auto text-primary" />
            <h1 className="text-3xl font-bold text-foreground">Ready?</h1>
            <p className="text-foreground/60">
              You&apos;re about to start a {interviewType} interview. The AI will ask dynamic questions based on your responses. Be honest and thorough.
            </p>
          </div>

          <div className="space-y-2 text-sm text-foreground/70">
            <p>⏱️ Duration: 30 minutes</p>
            <p>🎤 You can speak or type</p>
            <p>🤖 AI will adapt questions to your answers</p>
            <p>📊 Real-time feedback after each response</p>
          </div>

          <Button
            onClick={handleStartInterview}
            size="lg"
            className="w-full gap-2"
            disabled={isLoadingQuestion}
          >
            {isLoadingQuestion ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Preparing Interview...
              </>
            ) : (
              <>
                Start Interview
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </Button>
        </Card>
      </div>
    )
  }

  if (stage === 'feedback') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <Card className="p-8 text-center space-y-4">
            <h1 className="text-3xl font-bold text-foreground">Interview Complete!</h1>
            <p className="text-foreground/60">
              Your feedback has been generated. Review your performance below.
            </p>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {feedback.map((item) => (
              <Card key={item.dimension} className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-lg text-foreground">
                    {item.dimension}
                  </h3>
                  <div className="text-2xl font-bold text-primary">
                    {item.score}%
                  </div>
                </div>

                <div className="w-full bg-slate-700 rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full"
                    style={{ width: `${item.score}%` }}
                  />
                </div>

                <p className="text-sm text-foreground/70">{item.feedback}</p>

                <div className="space-y-2">
                  <p className="text-xs font-semibold text-foreground/60 uppercase">
                    Suggestions
                  </p>
                  <ul className="space-y-1">
                    {item.suggestions.map((suggestion, i) => (
                      <li
                        key={i}
                        className="text-sm text-foreground/60 flex gap-2"
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
            <a href="/dashboard">Return to Dashboard</a>
          </Button>
        </div>
      </div>
    )
  }

  // Main interview stage
  return (
    <div className="min-h-screen bg-black text-white p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 max-w-6xl mx-auto">
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-bold">{interviewType} Interview</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-white/10 px-4 py-2 rounded-lg">
            <Clock className="w-4 h-4" />
            <span className="text-sm font-medium">{formatTime(timeRemaining)}</span>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chat Area */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-6 bg-slate-900 border-slate-700 h-96 overflow-y-auto">
            <div className="space-y-4">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex gap-3 ${
                    msg.role === 'interviewer' ? 'justify-start' : 'justify-end'
                  }`}
                >
                  <div
                    className={`max-w-xs px-4 py-2 rounded-lg ${
                      msg.role === 'interviewer'
                        ? 'bg-primary/20 text-white'
                        : 'bg-primary text-white'
                    }`}
                  >
                    <p className="text-sm">{msg.content}</p>
                    {msg.duration && (
                      <p className="text-xs opacity-70 mt-1">
                        {msg.duration}s
                      </p>
                    )}
                  </div>
                </div>
              ))}

              {isLoadingQuestion && (
                <div className="flex gap-3">
                  <div className="bg-primary/20 px-4 py-2 rounded-lg">
                    <Skeleton className="h-4 w-32" />
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </Card>

          {/* Input Area */}
          <Card className="p-6 bg-slate-900 border-slate-700 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <MessageCircle className="w-4 h-4" />
                Your Response
              </label>
              <Textarea
                value={userAnswer || transcript}
                onChange={(e) => setUserAnswer(e.target.value)}
                placeholder="Type your answer or click the microphone to speak..."
                className="bg-slate-800 border-slate-700 text-white min-h-24"
              />
              {speechError && (
                <p className="text-xs text-red-400">{speechError}</p>
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
                      Stop Listening
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
                    Processing...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Submit Answer
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
              <Card className="p-4 bg-slate-900 border-slate-700 space-y-3">
                <div className="space-y-2">
                  <Badge>{currentQuestion.category}</Badge>
                  <Badge variant="outline">{currentQuestion.difficulty}</Badge>
                </div>
                <p className="text-sm text-foreground/70">
                  {currentQuestion.reasoning}
                </p>
                <div className="flex items-center gap-2 text-xs text-foreground/60">
                  <Clock className="w-4 h-4" />
                  Suggested: {currentQuestion.timeLimit}s
                </div>
              </Card>

              <Card className="p-4 bg-slate-900 border-slate-700 space-y-3">
                <h3 className="font-semibold text-sm">Tips</h3>
                <ul className="text-xs text-foreground/70 space-y-1">
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
