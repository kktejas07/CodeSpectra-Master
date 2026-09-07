'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { BrainCircuit, ArrowLeft, Loader2, Sparkles } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { ALL_CATEGORIES, CATEGORY_LABELS, DIFFICULTY_LEVELS, type FluencyCategory } from '@/lib/assessments/ai-fluency-types'

const DIFFICULTY_LABELS: Record<string, string> = {
  beginner: 'Beginner — Simple prompts, obvious bugs',
  intermediate: 'Intermediate — Multi-concept, subtle issues',
  advanced: 'Advanced — Complex systems, trade-offs',
  expert: 'Expert — Novel scenarios, edge cases',
}

const CATEGORY_DESCRIPTIONS: Record<FluencyCategory, string> = {
  prompt_engineering: 'Write effective prompts for AI tools',
  ai_output_review: 'Find bugs in AI-generated code',
  debugging_ai_code: 'Fix buggy AI-generated code',
  ai_decision_making: 'Judge when to use (or NOT use) AI',
  prompt_chaining: 'Design multi-step AI workflows',
}

export default function AiFluencySetupPage() {
  const gate = usePageGuard('user')
  const router = useRouter()

  const [focusCategories, setFocusCategories] = useState<FluencyCategory[]>([...ALL_CATEGORIES])
  const [difficulty, setDifficulty] = useState('intermediate')
  const [questionCount, setQuestionCount] = useState(8)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')

  if (!gate.ready) return null

  const toggleCategory = (cat: FluencyCategory) => {
    setFocusCategories(prev =>
      prev.includes(cat)
        ? prev.filter(c => c !== cat)
        : [...prev, cat]
    )
  }

  const handleStart = async () => {
    if (focusCategories.length === 0) {
      setError('Select at least one category.')
      return
    }
    setStarting(true)
    setError('')

    try {
      const res = await fetch('/api/assessments/ai-fluency/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          focusCategories,
          difficulty,
          questionCount,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to start assessment.')
        setStarting(false)
        return
      }

      sessionStorage.setItem(`aifl_${data.sessionId}`, JSON.stringify({
        sessionId: data.sessionId,
        firstQuestion: data.firstQuestion,
        totalQuestions: data.totalQuestions,
        categories: data.categories,
        difficulty,
      }))

      router.push(`/dashboard/assessments/ai-fluency?session=${data.sessionId}`)
    } catch {
      setError('Network error. Please try again.')
      setStarting(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/assessments" className="rounded-lg p-2 hover:bg-muted">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BrainCircuit className="h-6 w-6 text-primary" /> AI Fluency Assessment
        </h1>
      </div>

      <Card className="p-6 space-y-5">
        <p className="text-sm text-muted-foreground">
          Test your ability to work effectively with AI tools — from writing great prompts
          to knowing when NOT to use AI.
        </p>

        {/* Focus Categories */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Focus Areas</label>
          <p className="text-xs text-muted-foreground">Select which AI fluency skills to assess.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {ALL_CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => toggleCategory(cat)}
                className={`rounded-lg border px-3 py-2.5 text-left text-xs transition-colors ${
                  focusCategories.includes(cat)
                    ? 'bg-primary/10 border-primary text-primary font-medium'
                    : 'bg-background border-border text-muted-foreground hover:border-primary/40'
                }`}
              >
                <span className="block font-medium">{CATEGORY_LABELS[cat]}</span>
                <span className="block mt-0.5 text-[11px] opacity-70">{CATEGORY_DESCRIPTIONS[cat]}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Difficulty */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Difficulty</label>
          <div className="grid grid-cols-2 gap-2">
            {DIFFICULTY_LEVELS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDifficulty(d)}
                className={`rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                  difficulty === d
                    ? 'bg-primary/10 border-primary text-primary font-medium'
                    : 'bg-background border-border text-muted-foreground hover:border-primary/40'
                }`}
              >
                {DIFFICULTY_LABELS[d]}
              </button>
            ))}
          </div>
        </div>

        {/* Question Count */}
        <div className="space-y-2">
          <label className="text-sm font-medium">
            Questions: <span className="text-primary">{questionCount}</span>
          </label>
          <input
            type="range"
            min={5}
            max={15}
            value={questionCount}
            onChange={(e) => setQuestionCount(Number(e.target.value))}
            className="w-full accent-primary"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>5 (Quick)</span>
            <span>10</span>
            <span>15 (Thorough)</span>
          </div>
        </div>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <Button
          onClick={handleStart}
          disabled={starting || focusCategories.length === 0}
          className="w-full"
          size="lg"
        >
          {starting ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating Questions...</>
          ) : (
            <><Sparkles className="mr-2 h-4 w-4" /> Start Assessment</>
          )}
        </Button>
      </Card>
    </div>
  )
}
