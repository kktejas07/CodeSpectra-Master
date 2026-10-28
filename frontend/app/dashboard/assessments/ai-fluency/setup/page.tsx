'use client'
import { csrfFetch } from '@/lib/csrf-fetch'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { BrainCircuit, ArrowLeft, Loader2, Sparkles } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { PageHeader } from '@/components/app/page-kit'
import { ALL_CATEGORIES, CATEGORY_LABELS, DIFFICULTY_LEVELS, type FluencyCategory } from '@/lib/assessments/ai-fluency-types'
import { useT } from '@/lib/i18n/client'
import type { Translator } from '@/lib/i18n/catalog'
import { useApiError } from '@/lib/i18n/use-api-error'

const DIFFICULTY_LABELS = (t: Translator): Record<string, string> => ({
  beginner: t('practice.beginnerSimplePromptsObviousBugs'),
  intermediate: t('practice.intermediateMultiConceptSubtleIssues'),
  advanced: t('practice.advancedComplexSystemsTradeOffs'),
  expert: t('practice.expertNovelScenariosEdgeCases'),
})

const CATEGORY_DESCRIPTIONS = (t: Translator): Record<FluencyCategory, string> => ({
  prompt_engineering: t('practice.writeEffectivePromptsForAiTools'),
  ai_output_review: t('practice.findBugsInAiGeneratedCode'),
  debugging_ai_code: t('practice.fixBuggyAiGeneratedCode'),
  ai_decision_making: t('practice.judgeWhenToUseOrNot167'),
  prompt_chaining: t('practice.designMultiStepAiWorkflows'),
})

export default function AiFluencySetupPage() {
  const apiError = useApiError()
  const { td, t } = useT()
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
      setError(t('practice.selectAtLeastOneCategory'))
      return
    }
    setStarting(true)
    setError('')

    try {
      const res = await csrfFetch('/api/assessments/ai-fluency/start', {
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
        setError(apiError(data, t('practice.failedToStartAssessment')))
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
      setError(t('practice.networkErrorPleaseTryAgain'))
      setStarting(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('practice.aiFluencyAssessment')}
        description={t('practice.testHowWellYouWorkWithea9')}
        icon={<BrainCircuit />}
        className="mb-0"
        actions={
          <Button variant="outline" size="sm" className="gap-2" asChild>
            <Link href="/dashboard/assessments">
              <ArrowLeft className="h-4 w-4" />{' '}{t('practice.backToAssessments')}</Link>
          </Button>
        }
      />

      <Card className="rounded-3xl border-border/70 p-6 space-y-5">

        {/* Focus Categories */}
        <div className="space-y-2">
          <label className="text-sm font-medium">{t('practice.focusAreas')}</label>
          <p className="text-xs text-muted-foreground">{t('practice.selectWhichAiFluencySkillsTo9cf')}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {ALL_CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => toggleCategory(cat)}
                className={`rounded-xl border px-3 py-2.5 text-left text-xs transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
                  focusCategories.includes(cat)
                    ? 'bg-primary/10 border-primary text-primary font-medium'
                    : 'bg-background border-border text-muted-foreground hover:border-primary/40'
                }`}
              >
                <span className="block font-medium">{td(`practice.categoryLabels:${cat}`, CATEGORY_LABELS[cat])}</span>
                <span className="block mt-0.5 text-[11px] opacity-70">{CATEGORY_DESCRIPTIONS(t)[cat]}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Difficulty */}
        <div className="space-y-2">
          <label className="text-sm font-medium">{t('practice.difficulty')}</label>
          <div className="grid grid-cols-2 gap-2">
            {DIFFICULTY_LEVELS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDifficulty(d)}
                className={`rounded-xl border px-3 py-2 text-left text-xs transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
                  difficulty === d
                    ? 'bg-primary/10 border-primary text-primary font-medium'
                    : 'bg-background border-border text-muted-foreground hover:border-primary/40'
                }`}
              >
                {DIFFICULTY_LABELS(t)[d]}
              </button>
            ))}
          </div>
        </div>

        {/* Question Count */}
        <div className="space-y-2">
          <label className="text-sm font-medium">{t('practice.questions')}{' '}<span className="text-primary tabular-nums">{questionCount}</span>
          </label>
          <input aria-label={t('practice.questions2')}
            type="range"
            min={5}
            max={15}
            value={questionCount}
            onChange={(e) => setQuestionCount(Number(e.target.value))}
            className="w-full accent-primary"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>{t('practice.n5Quick')}</span>
            <span>10</span>
            <span>{t('practice.n15Thorough')}</span>
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
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{' '}{t('practice.generatingQuestions')}</>
          ) : (
            <><Sparkles className="mr-2 h-4 w-4" />{' '}{t('practice.startAssessment')}</>
          )}
        </Button>
      </Card>
    </div>
  )
}
