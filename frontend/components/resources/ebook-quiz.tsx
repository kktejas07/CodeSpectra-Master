'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CheckCircle, XCircle, RotateCcw, Trophy, Lightbulb } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { EbookPage } from '@/lib/db/ebooks'

interface QuizQuestion {
  question: string
  options: string[]
  correct: number
  explanation: string
}

interface EbookQuizProps {
  questions: QuizQuestion[]
  onComplete?: (score: number, total: number) => void
}

export function EbookQuiz({ questions, onComplete }: EbookQuizProps) {
  const [currentQ, setCurrentQ] = useState(0)
  const [selected, setSelected] = useState<number | null>(null)
  const [answered, setAnswered] = useState(false)
  const [score, setScore] = useState(0)
  const [showExplanation, setShowExplanation] = useState(false)
  const [completed, setCompleted] = useState(false)

  const question = questions[currentQ]
  const isCorrect = selected === question?.correct

  const handleSelect = (idx: number) => {
    if (answered) return
    setSelected(idx)
    setAnswered(true)
    setShowExplanation(true)
    if (idx === question.correct) {
      setScore(s => s + 1)
    }
  }

  const handleNext = () => {
    if (currentQ < questions.length - 1) {
      setCurrentQ(q => q + 1)
      setSelected(null)
      setAnswered(false)
      setShowExplanation(false)
    } else {
      setCompleted(true)
      onComplete?.(score + (isCorrect ? 0 : 0), questions.length)
    }
  }

  const handleRestart = () => {
    setCurrentQ(0)
    setSelected(null)
    setAnswered(false)
    setScore(0)
    setShowExplanation(false)
    setCompleted(false)
  }

  if (completed) {
    const percentage = Math.round((score / questions.length) * 100)
    return (
      <Card className="p-6 text-center space-y-4">
        <Trophy className="h-12 w-12 mx-auto text-amber-500" />
        <h3 className="text-xl font-bold">Quiz Complete!</h3>
        <div className="text-4xl font-bold text-primary">{score}/{questions.length}</div>
        <p className="text-muted-foreground">{percentage}% correct</p>
        <Badge variant={percentage >= 70 ? 'default' : 'secondary'} className={percentage >= 70 ? 'bg-green-500/20 text-green-600' : 'bg-amber-500/20 text-amber-600'}>
          {percentage >= 70 ? 'Great job!' : 'Keep practicing!'}
        </Badge>
        <Button onClick={handleRestart} variant="outline">
          <RotateCcw className="mr-2 h-4 w-4" /> Try Again
        </Button>
      </Card>
    )
  }

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <Badge variant="outline">Question {currentQ + 1}/{questions.length}</Badge>
        <Badge variant="secondary">Score: {score}</Badge>
      </div>
      <h4 className="text-lg font-semibold">{question.question}</h4>
      <div className="space-y-2">
        {question.options.map((opt, idx) => (
          <button
            key={idx}
            onClick={() => handleSelect(idx)}
            disabled={answered}
            className={cn(
              "w-full text-left p-3 rounded-lg border transition-all",
              answered && idx === question.correct && "border-green-500 bg-green-500/10 text-green-700",
              answered && selected === idx && idx !== question.correct && "border-red-500 bg-red-500/10 text-red-700",
              !answered && "border-border hover:border-primary/50 hover:bg-muted/50",
              answered && idx !== question.correct && idx !== selected && "opacity-50"
            )}
          >
            <div className="flex items-center gap-2">
              {answered && idx === question.correct && <CheckCircle className="h-4 w-4 text-green-500" />}
              {answered && selected === idx && idx !== question.correct && <XCircle className="h-4 w-4 text-red-500" />}
              <span className="text-sm">{opt}</span>
            </div>
          </button>
        ))}
      </div>
      {showExplanation && (
        <div className="p-3 rounded-lg bg-muted/50 border border-border/50">
          <div className="flex items-start gap-2">
            <Lightbulb className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-sm text-muted-foreground">{question.explanation}</p>
          </div>
        </div>
      )}
      {answered && (
        <Button onClick={handleNext} className="w-full">
          {currentQ < questions.length - 1 ? 'Next Question' : 'See Results'}
        </Button>
      )}
    </Card>
  )
}
