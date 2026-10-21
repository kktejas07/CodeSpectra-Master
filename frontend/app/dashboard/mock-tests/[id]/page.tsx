'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Sparkles, Target, Zap, Lightbulb, BrainCircuit } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/app/page-kit'
import { usePageGuard } from '@/lib/use-page-guard'
import { useTour, autoPlayPageTour, type TourStep } from '@/components/tour/tour-context'
import { useT } from '@/lib/i18n/client'
import type { Translator } from '@/lib/i18n/catalog'

const DIFFICULTIES = (t: Translator) => ([
  { id: 'beginner', title: t('practice.beginner'), description: t('practice.basicConceptsAndFoundationalKnowledge'), icon: Lightbulb, color: 'text-primary', bg: 'bg-primary/10' },
  { id: 'basic', title: t('practice.basic'), description: t('practice.standardInterviewQuestionsAndPracticalUs'), icon: Target, color: 'text-primary', bg: 'bg-primary/10' },
  { id: 'intermediate', title: t('practice.intermediate'), description: t('practice.complexScenariosAndArchitecturalDecision'), icon: Zap, color: 'text-primary', bg: 'bg-primary/10' },
  { id: 'advanced', title: t('practice.advanced'), description: t('practice.deepDivesIntoInternalsAndPerformance'), icon: BrainCircuit, color: 'text-primary', bg: 'bg-primary/10' },
  { id: 'expert', title: t('practice.expert'), description: t('practice.systemDesignAndHighlySpecializedProblems'), icon: Sparkles, color: 'text-primary', bg: 'bg-primary/10' },
])

export default function MockTestSetupPage() {
  const { t } = useT()
  const gate = usePageGuard('user')
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const [selected, setSelected] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { startTour, setTourSeen } = useTour()

  useEffect(() => {
    if (gate.ready) {
      const mockTestDetailTour: TourStep[] = [
        {
          target: '[data-tour="mock-test-detail-header"]',
          title: t('practice.setTestDifficultyLevel'),
          description: t('practice.configureThisCompanyRoleTestFor950'),
          position: 'bottom',
        },
        {
          target: '[data-tour="mock-test-detail-levels"]',
          title: t('practice.pickYourDifficultyCard'),
          description: t('practice.selectOneCardFromBeginnerTo530'),
          position: 'top',
        },
        {
          target: '[data-tour="mock-test-detail-continue"]',
          title: t('practice.continueToStartTest'),
          description: t('practice.whereNextSelectALevelFirstc80'),
          position: 'top',
        },
      ]
      autoPlayPageTour('mock-test-detail', mockTestDetailTour)}
  }, [gate.ready, startTour, setTourSeen])

  const handleStart = () => {
    if (!selected) return
    setIsSubmitting(true)
    // Forward company/role from the list page; the take page falls back to the
    // sample catalogue when they're missing.
    const qs = new URLSearchParams(searchParams?.toString() || '')
    qs.set('difficulty', selected)
    router.push(`/dashboard/mock-tests/${params.id}/take?${qs.toString()}`)
  }

  if (!gate.ready) return null

  return (
    <div className="flex-1 space-y-6">
      <div data-tour="mock-test-detail-header">
        <PageHeader
          title={t('practice.setUpYourTest')}
          description={t('practice.howComfortableAreYouWithThisb75')}
          className="mb-0"
          icon={
            <button type="button" onClick={() => router.back()} aria-label={t('practice.goBack')} className="flex h-full w-full items-center justify-center rounded-xl focus-visible:outline-2 focus-visible:outline-primary">
              <ArrowLeft />
            </button>
          }
        />
      </div>

      <div className="cs-stagger grid gap-4 md:grid-cols-2 lg:grid-cols-3" role="radiogroup" aria-label={t('practice.difficulty')} data-tour="mock-test-detail-levels">
        {DIFFICULTIES(t).map((diff) => (
          <Card 
            key={diff.id} 
            role="radio"
            aria-checked={selected === diff.id}
            tabIndex={0}
            className={cn(
              "cursor-pointer rounded-3xl border-border/70 transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-0.5 hover:border-primary/40 motion-reduce:hover:translate-y-0 focus-visible:outline-2 focus-visible:outline-primary",
              selected === diff.id ? "border-primary ring-1 ring-primary bg-primary/5" : ""
            )}
            onClick={() => setSelected(diff.id)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(diff.id) } }}
          >
            <CardHeader>
              <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center mb-4", diff.bg)}>
                <diff.icon className={cn("h-5 w-5", diff.color)} />
              </div>
              <CardTitle className="text-xl">{diff.title}</CardTitle>
              <CardDescription>{diff.description}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>

      <div className="flex justify-end pt-4" data-tour="mock-test-detail-continue">
        <Button 
          size="lg" 
          disabled={!selected || isSubmitting}
          onClick={handleStart}
          className="w-full sm:w-auto"
        >
          {isSubmitting ? t('practice.starting') : t('practice.continueToTest')}
        </Button>
      </div>
    </div>
  )
}
