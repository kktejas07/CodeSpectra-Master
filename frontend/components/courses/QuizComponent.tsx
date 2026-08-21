'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, XCircle, Loader2, HelpCircle, RotateCcw } from 'lucide-react'

export interface QuizQuestion {
  id: string
  type: 'mcq' | 'code' | 'true_false'
  question: string
  options: string[]
  correct: number
  explanation: string
}

interface QuizComponentProps {
  questions: QuizQuestion[]
  onComplete?: (score: number, total: number) => void
  readOnly?: boolean
}

export function QuizComponent({ questions, onComplete, readOnly = false }: QuizComponentProps) {
  const [currentQ, setCurrentQ] = useState(0)
  const [selected, setSelected] = useState<number | null>(null)
  const [showAnswer, setShowAnswer] = useState(false)
  const [answers, setAnswers] = useState<Record<number, number>>({})
  const [completed, setCompleted] = useState(false)

  const question = questions[currentQ]
  const isCorrect = selected === question?.correct
  const score = Object.entries(answers).filter(([idx, ans]) => questions[parseInt(idx)]?.correct === ans).length

  const handleSelect = (optionIndex: number) => {
    if (showAnswer || readOnly) return
    setSelected(optionIndex)
  }

  const handleSubmit = () => {
    if (selected === null) return
    setAnswers({ ...answers, [currentQ]: selected })
    setShowAnswer(true)
  }

  const handleNext = () => {
    if (currentQ < questions.length - 1) {
      setCurrentQ(currentQ + 1)
      setSelected(null)
      setShowAnswer(false)
    } else {
      setCompleted(true)
      onComplete?.(score + (isCorrect ? 1 : 0), questions.length)
    }
  }

  const handleRetry = () => {
    setCurrentQ(0)
    setSelected(null)
    setShowAnswer(false)
    setAnswers({})
    setCompleted(false)
  }

  if (completed) {
    const finalScore = score
    const percentage = Math.round((finalScore / questions.length) * 100)
    return (
      <div className="p-6 text-center space-y-4">
        <div className="text-4xl font-bold" style={{ color: percentage >= 80 ? '#22c55e' : percentage >= 50 ? '#f59e0b' : '#ef4444' }}>
          {percentage >= 80 ? 'Excellent' : percentage >= 50 ? 'Good' : 'Keep Trying'}
        </div>
        <h3 className="text-2xl font-bold">
          {finalScore} / {questions.length}
        </h3>
        <p className="text-muted-foreground">
          {percentage >= 80
            ? 'Excellent! You have a strong understanding.'
            : percentage >= 50
              ? 'Good effort! Review the explanations below.'
              : 'Keep practicing! Re-read the lessons and try again.'}
        </p>
        <div className="flex gap-2 justify-center">
          <Button variant="outline" onClick={handleRetry}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </div>
      </div>
    )
  }

  if (!question) return null

  return (
    <div className="p-4 space-y-4">
      {/* Progress */}
      <div className="flex items-center justify-between">
        <Badge variant="outline">
          Question {currentQ + 1} of {questions.length}
        </Badge>
        <div className="flex gap-1">
          {questions.map((_, i) => (
            <div
              key={i}
              className={`h-2 w-2 rounded-full ${
                i < currentQ
                  ? answers[i] === questions[i].correct
                    ? 'bg-green-500'
                    : 'bg-red-500'
                  : i === currentQ
                    ? 'bg-primary'
                    : 'bg-muted'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Question */}
      <div className="text-lg font-medium">{question.question}</div>

      {/* Options */}
      <div className="space-y-2">
        {question.options.map((option, i) => {
          const isSelected = selected === i
          const isCorrectOption = i === question.correct
          const showCorrect = showAnswer && isCorrectOption
          const showWrong = showAnswer && isSelected && !isCorrectOption

          return (
            <button
              key={i}
              onClick={() => handleSelect(i)}
              disabled={showAnswer || readOnly}
              className={`w-full text-left p-3 rounded-lg border transition-all ${
                showCorrect
                  ? 'border-green-500 bg-green-500/10 text-green-700'
                  : showWrong
                    ? 'border-red-500 bg-red-500/10 text-red-700'
                    : isSelected
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/50'
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="font-mono text-sm mt-0.5">
                  {String.fromCharCode(65 + i)})
                </span>
                <span className="flex-1">{option}</span>
                {showCorrect && <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />}
                {showWrong && <XCircle className="h-5 w-5 text-red-500 shrink-0" />}
              </div>
            </button>
          )
        })}
      </div>

      {/* Explanation */}
      {showAnswer && (
        <div className={`p-4 rounded-lg border ${isCorrect ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
          <div className="flex items-start gap-2">
            <HelpCircle className={`h-5 w-5 shrink-0 mt-0.5 ${isCorrect ? 'text-green-500' : 'text-red-500'}`} />
            <div>
              <div className={`font-medium mb-1 ${isCorrect ? 'text-green-700' : 'text-red-700'}`}>
                {isCorrect ? 'Correct!' : 'Not quite.'}
              </div>
              <div className="text-sm text-muted-foreground">{question.explanation}</div>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-2">
        {!showAnswer ? (
          <Button onClick={handleSubmit} disabled={selected === null}>
            Check Answer
          </Button>
        ) : (
          <Button onClick={handleNext}>
            {currentQ < questions.length - 1 ? 'Next Question' : 'See Results'}
          </Button>
        )}
      </div>
    </div>
  )
}
