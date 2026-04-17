'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Mic,
  Send,
  Clock,
  Brain,
  CheckCircle,
  MessageSquare,
  TrendingUp,
  Award,
  ArrowRight,
} from 'lucide-react'

interface MockInterviewProps {
  roleId: string
  interviewType: 'technical' | 'behavioral' | 'system-design'
}

interface InterviewQuestion {
  id: string
  question: string
  category: string
  difficulty: 'Easy' | 'Medium' | 'Hard'
  timeLimit: number
}

interface UserResponse {
  answer: string
  timeSpent: number
  timestamp: Date
}

interface FeedbackItem {
  dimension: string
  score: number
  feedback: string
  suggestions: string[]
}

export function MockInterview({ roleId, interviewType }: MockInterviewProps) {
  const [stage, setStage] = useState<'intro' | 'interview' | 'feedback'>('intro')
  const [currentQuestion, setCurrentQuestion] = useState(0)
  const [responses, setResponses] = useState<Record<string, UserResponse>>({})
  const [currentAnswer, setCurrentAnswer] = useState('')
  const [timeSpent, setTimeSpent] = useState(0)
  const [loading, setLoading] = useState(false)
  const [feedback, setFeedback] = useState<FeedbackItem[]>([])

  const questions: InterviewQuestion[] = [
    {
      id: '1',
      question: 'Tell me about yourself and your background in software engineering.',
      category: 'Introduction',
      difficulty: 'Easy',
      timeLimit: 300,
    },
    {
      id: '2',
      question: 'Design a system to handle real-time user activity feeds for millions of users.',
      category: 'System Design',
      difficulty: 'Hard',
      timeLimit: 3600,
    },
    {
      id: '3',
      question: 'Describe a challenging project you worked on and how you overcame obstacles.',
      category: 'Behavioral',
      difficulty: 'Medium',
      timeLimit: 300,
    },
  ]

  const handleStartInterview = () => {
    setStage('interview')
  }

  const handleNextQuestion = async () => {
    // Save current response
    setResponses({
      ...responses,
      [questions[currentQuestion].id]: {
        answer: currentAnswer,
        timeSpent,
        timestamp: new Date(),
      },
    })

    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion(currentQuestion + 1)
      setCurrentAnswer('')
      setTimeSpent(0)
    } else {
      // Generate feedback
      await generateFeedback()
      setStage('feedback')
    }
  }

  const generateFeedback = async () => {
    setLoading(true)
    try {
      // Simulate AI feedback generation
      await new Promise((resolve) => setTimeout(resolve, 2000))

      const mockFeedback: FeedbackItem[] = [
        {
          dimension: 'Communication',
          score: 85,
          feedback: 'Clear articulation of ideas with good structure',
          suggestions: [
            'Use more specific examples',
            'Avoid filler words like "um" and "uh"',
            'Maintain consistent pacing',
          ],
        },
        {
          dimension: 'Technical Depth',
          score: 78,
          feedback: 'Solid understanding of core concepts',
          suggestions: [
            'Discuss trade-offs more explicitly',
            'Consider edge cases earlier',
            'Elaborate on optimization strategies',
          ],
        },
        {
          dimension: 'Problem-Solving',
          score: 92,
          feedback: 'Excellent approach to breaking down complex problems',
          suggestions: [
            'Ask more clarifying questions upfront',
            'Discuss scalability implications sooner',
          ],
        },
        {
          dimension: 'Cultural Fit',
          score: 88,
          feedback: 'Shows strong collaboration and teamwork mindset',
          suggestions: [
            'Highlight more diverse project experiences',
            'Discuss leadership moments',
          ],
        },
      ]

      setFeedback(mockFeedback)
    } finally {
      setLoading(false)
    }
  }

  // Intro Stage
  if (stage === 'intro') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 p-4 md:p-8">
        <div className="max-w-2xl mx-auto">
          <Card className="p-8 border-primary/20 bg-card/50">
            <div className="text-center mb-8">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Brain className="w-8 h-8 text-primary" />
              </div>
              <h1 className="text-3xl font-bold mb-2">AI-Powered Mock Interview</h1>
              <p className="text-muted-foreground">
                Practice your interviewing skills with real-time AI feedback
              </p>
            </div>

            <div className="space-y-6">
              {/* Interview Details */}
              <div className="grid md:grid-cols-2 gap-4">
                <Card className="p-4 bg-muted/30 border-border/40">
                  <div className="flex items-center gap-3">
                    <MessageSquare className="w-5 h-5 text-primary" />
                    <div>
                      <p className="text-sm font-medium">Questions</p>
                      <p className="text-xs text-muted-foreground">{questions.length} questions</p>
                    </div>
                  </div>
                </Card>

                <Card className="p-4 bg-muted/30 border-border/40">
                  <div className="flex items-center gap-3">
                    <Clock className="w-5 h-5 text-primary" />
                    <div>
                      <p className="text-sm font-medium">Duration</p>
                      <p className="text-xs text-muted-foreground">~30 minutes</p>
                    </div>
                  </div>
                </Card>

                <Card className="p-4 bg-muted/30 border-border/40">
                  <div className="flex items-center gap-3">
                    <Brain className="w-5 h-5 text-primary" />
                    <div>
                      <p className="text-sm font-medium">AI Interviewer</p>
                      <p className="text-xs text-muted-foreground">Real-time analysis</p>
                    </div>
                  </div>
                </Card>

                <Card className="p-4 bg-muted/30 border-border/40">
                  <div className="flex items-center gap-3">
                    <Award className="w-5 h-5 text-primary" />
                    <div>
                      <p className="text-sm font-medium">Feedback</p>
                      <p className="text-xs text-muted-foreground">Detailed report</p>
                    </div>
                  </div>
                </Card>
              </div>

              {/* Guidelines */}
              <Card className="p-4 bg-blue-500/10 border-blue-500/20">
                <p className="text-sm font-medium text-blue-300 mb-2">Tips for Success</p>
                <ul className="text-sm text-blue-200 space-y-1">
                  <li>Speak clearly and at a natural pace</li>
                  <li>Take time to think before answering</li>
                  <li>Ask clarifying questions when needed</li>
                  <li>Provide concrete examples from your experience</li>
                </ul>
              </Card>

              {/* Start Button */}
              <Button onClick={handleStartInterview} className="w-full py-6 text-base gap-2">
                <Mic className="w-5 h-5" />
                Start Interview
                <ArrowRight className="w-5 h-5" />
              </Button>
            </div>
          </Card>
        </div>
      </div>
    )
  }

  // Interview Stage
  if (stage === 'interview') {
    const question = questions[currentQuestion]

    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          <div className="grid md:grid-cols-3 gap-6">
            {/* Main Interview Area */}
            <div className="md:col-span-2 space-y-4">
              {/* Progress */}
              <div className="flex items-center justify-between mb-6">
                <div>
                  <p className="text-sm text-muted-foreground">
                    Question {currentQuestion + 1} of {questions.length}
                  </p>
                  <div className="w-48 h-2 bg-muted rounded-full mt-2 overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${((currentQuestion + 1) / questions.length) * 100}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Question */}
              <Card className="p-6 border-primary/20 bg-primary/5">
                <Badge className="mb-3" variant="outline">
                  {question.category}
                </Badge>
                <h2 className="text-2xl font-bold mb-2">{question.question}</h2>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    {question.timeLimit / 60} min limit
                  </span>
                  <span className="flex items-center gap-1">
                    Difficulty:{' '}
                    <Badge
                      variant="outline"
                      className={
                        question.difficulty === 'Easy'
                          ? 'bg-green-500/10'
                          : question.difficulty === 'Medium'
                            ? 'bg-yellow-500/10'
                            : 'bg-red-500/10'
                      }
                    >
                      {question.difficulty}
                    </Badge>
                  </span>
                </div>
              </Card>

              {/* Response Area */}
              <Card className="p-6 border-border/40">
                <label className="text-sm font-medium mb-3 block">Your Response</label>
                <Textarea
                  value={currentAnswer}
                  onChange={(e) => setCurrentAnswer(e.target.value)}
                  placeholder="Type your answer here or record your voice response..."
                  className="mb-4 min-h-40 resize-none"
                />

                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1 gap-2">
                    <Mic className="w-4 h-4" />
                    Record Response
                  </Button>
                  <Button onClick={handleNextQuestion} disabled={!currentAnswer.trim()} className="flex-1 gap-2">
                    <Send className="w-4 h-4" />
                    {currentQuestion === questions.length - 1 ? 'Finish' : 'Next'}
                  </Button>
                </div>
              </Card>
            </div>

            {/* Sidebar */}
            <div className="space-y-4">
              {/* AI Feedback */}
              <Card className="p-4 bg-purple-500/10 border-purple-500/20">
                <div className="flex items-center gap-2 mb-3">
                  <Brain className="w-4 h-4 text-purple-400" />
                  <p className="text-sm font-medium">AI Observer</p>
                </div>
                <p className="text-xs text-purple-200 leading-relaxed">
                  The AI is analyzing your communication style, technical knowledge, and problem-solving approach in real-time.
                </p>
              </Card>

              {/* Timer */}
              <Card className="p-4 bg-muted/30 border-border/40">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium">Time Spent</p>
                  <p className="text-2xl font-bold text-primary">{Math.floor(timeSpent / 60)}:{String(timeSpent % 60).padStart(2, '0')}</p>
                </div>
                <div className="text-xs text-muted-foreground">
                  Limit: {question.timeLimit / 60} minutes
                </div>
              </Card>

              {/* Questions Summary */}
              <Card className="p-4 bg-muted/30 border-border/40">
                <p className="text-sm font-medium mb-3">Questions</p>
                <div className="space-y-2">
                  {questions.map((q, idx) => (
                    <div
                      key={q.id}
                      className={`p-2 rounded text-xs ${
                        idx === currentQuestion
                          ? 'bg-primary/20 border border-primary'
                          : idx < currentQuestion
                            ? 'bg-green-500/10 border border-green-500/30'
                            : 'bg-muted border border-border/40'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {idx < currentQuestion && <CheckCircle className="w-3 h-3 text-green-500" />}
                        {idx === currentQuestion && <div className="w-3 h-3 rounded-full bg-primary" />}
                        <span className="flex-1">Q{idx + 1}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Feedback Stage
  if (stage === 'feedback') {
    const avgScore = Math.round(feedback.reduce((sum, item) => sum + item.score, 0) / feedback.length)

    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 p-4 md:p-8">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Overall Score */}
          <Card className="p-8 border-primary/20 bg-gradient-to-r from-primary/10 to-primary/5">
            <div className="text-center">
              <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4 border-4 border-primary/20">
                <p className="text-4xl font-bold text-primary">{avgScore}</p>
              </div>
              <h1 className="text-2xl font-bold mb-2">Interview Complete</h1>
              <p className="text-muted-foreground mb-6">
                Great effort! Here&apos;s your personalized feedback from the AI interviewer.
              </p>
              <Button size="lg" className="gap-2">
                <Download className="w-4 h-4" />
                Download Report
              </Button>
            </div>
          </Card>

          {/* Feedback by Dimension */}
          <div className="space-y-4">
            <h2 className="text-2xl font-bold">Detailed Feedback</h2>
            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-40" />
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {feedback.map((item, idx) => (
                  <Card key={idx} className="p-6 border-border/40">
                    <div className="space-y-4">
                      {/* Header */}
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="font-semibold text-foreground mb-1">{item.dimension}</h3>
                          <p className="text-sm text-muted-foreground">{item.feedback}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-primary">{item.score}%</p>
                          <Badge variant="outline" className="text-xs mt-1">
                            {item.score >= 85 ? 'Excellent' : item.score >= 75 ? 'Good' : 'Fair'}
                          </Badge>
                        </div>
                      </div>

                      {/* Score bar */}
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary transition-all" style={{ width: `${item.score}%` }} />
                      </div>

                      {/* Suggestions */}
                      <div>
                        <p className="text-sm font-medium mb-2">Areas for Improvement</p>
                        <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                          {item.suggestions.map((suggestion, i) => (
                            <li key={i}>{suggestion}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Next Steps */}
          <Card className="p-6 bg-green-500/10 border-green-500/20">
            <div className="flex items-start gap-4">
              <TrendingUp className="w-5 h-5 text-green-400 flex-shrink-0 mt-1" />
              <div>
                <p className="font-semibold text-green-300 mb-2">Next Steps</p>
                <ul className="text-sm text-green-200 space-y-2">
                  <li>Review the areas marked for improvement</li>
                  <li>Practice similar questions to build confidence</li>
                  <li>Try another mock interview to measure progress</li>
                  <li>Join our discussion forum to learn from others</li>
                </ul>
              </div>
            </div>
          </Card>

          {/* Actions */}
          <div className="flex gap-4">
            <Button asChild variant="outline" className="flex-1">
              <a href="/dashboard">Back to Dashboard</a>
            </Button>
            <Button className="flex-1 gap-2">
              Try Another Interview
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    )
  }
}

// Add this import at the top
import { Download } from 'lucide-react'
