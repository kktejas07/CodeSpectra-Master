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

const DIFFICULTIES = [
  { id: 'beginner', title: 'Beginner', description: 'Basic concepts and foundational knowledge', icon: Lightbulb, color: 'text-primary', bg: 'bg-primary/10' },
  { id: 'basic', title: 'Basic', description: 'Standard interview questions and practical usage', icon: Target, color: 'text-primary', bg: 'bg-primary/10' },
  { id: 'intermediate', title: 'Intermediate', description: 'Complex scenarios and architectural decisions', icon: Zap, color: 'text-primary', bg: 'bg-primary/10' },
  { id: 'advanced', title: 'Advanced', description: 'Deep dives into internals and performance', icon: BrainCircuit, color: 'text-primary', bg: 'bg-primary/10' },
  { id: 'expert', title: 'Expert', description: 'System design and highly specialized problems', icon: Sparkles, color: 'text-purple-500', bg: 'bg-purple-500/10' },
]

export default function MockTestSetupPage() {
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
          title: 'Set test difficulty level',
          description: 'Configure this company role test for your interview prep so AI matches your level.',
          position: 'bottom',
        },
        {
          target: '[data-tour="mock-test-detail-levels"]',
          title: 'Pick your difficulty card',
          description: 'Select one card from Beginner to Expert to set question depth for your test.',
          position: 'top',
        },
        {
          target: '[data-tour="mock-test-detail-continue"]',
          title: 'Continue to start test',
          description: 'Where next: select a level first, then Continue to open your generated test.',
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
          title="Set up your test"
          description="How comfortable are you with this role's core topics? Pick the level that fits."
          className="mb-0"
          icon={
            <button type="button" onClick={() => router.back()} aria-label="Go back" className="flex h-full w-full items-center justify-center rounded-xl focus-visible:outline-2 focus-visible:outline-primary">
              <ArrowLeft />
            </button>
          }
        />
      </div>

      <div className="cs-stagger grid gap-4 md:grid-cols-2 lg:grid-cols-3" role="radiogroup" aria-label="Difficulty" data-tour="mock-test-detail-levels">
        {DIFFICULTIES.map((diff) => (
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
          {isSubmitting ? 'Starting…' : 'Continue to test'}
        </Button>
      </div>
    </div>
  )
}
