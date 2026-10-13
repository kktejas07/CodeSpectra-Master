'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Sparkles, Target, Zap, Lightbulb, BrainCircuit } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { usePageGuard } from '@/lib/use-page-guard'
import { useTour, autoPlayPageTour, type TourStep } from '@/components/tour/tour-context'

const DIFFICULTIES = [
  { id: 'beginner', title: 'Beginner', description: 'Basic concepts and foundational knowledge', icon: Lightbulb, color: 'text-green-500', bg: 'bg-green-500/10' },
  { id: 'basic', title: 'Basic', description: 'Standard interview questions and practical usage', icon: Target, color: 'text-blue-500', bg: 'bg-blue-500/10' },
  { id: 'intermediate', title: 'Intermediate', description: 'Complex scenarios and architectural decisions', icon: Zap, color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
  { id: 'advanced', title: 'Advanced', description: 'Deep dives into internals and performance', icon: BrainCircuit, color: 'text-orange-500', bg: 'bg-orange-500/10' },
  { id: 'expert', title: 'Expert', description: 'System design and highly specialized problems', icon: Sparkles, color: 'text-purple-500', bg: 'bg-purple-500/10' },
]

export default function MockTestSetupPage() {
  const gate = usePageGuard('user')
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const [selected, setSelected] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { startTour, setTourSeen } = useTour()

  useEffect(() => {
    if (gate.ready) {
      const mockTestDetailTour: TourStep[] = [
        {
          target: '[data-tour="mock-test-detail-header"]',
          title: 'Set Test Difficulty Level',
          description: 'Configure this company role test for your interview prep so AI matches your level.',
          position: 'bottom',
        },
        {
          target: '[data-tour="mock-test-detail-levels"]',
          title: 'Pick Your Difficulty Card',
          description: 'Select one card from Beginner to Expert to set question depth for your test.',
          position: 'top',
        },
        {
          target: '[data-tour="mock-test-detail-continue"]',
          title: 'Continue to Start Test',
          description: 'Where next: select a level first, then Continue to open your generated test.',
          position: 'top',
        },
      ]
      autoPlayPageTour('mock-test-detail', mockTestDetailTour)}
  }, [gate.ready, startTour, setTourSeen])

  const handleStart = () => {
    if (!selected) return
    setIsSubmitting(true)
    // the route param id contains something like "tcs-software-engineer"
    router.push(`/dashboard/mock-tests/${params.id}/take?difficulty=${selected}`)
  }

  if (!gate.ready) return null

  return (
    <div className="flex-1 space-y-8 p-4 md:p-8 pt-6">
      <div className="flex items-center gap-4" data-tour="mock-test-detail-header">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Configure Your Test</h2>
          <p className="text-muted-foreground mt-2">
            How comfortable are you with this role's core topics?
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 pt-4" data-tour="mock-test-detail-levels">
        {DIFFICULTIES.map((diff) => (
          <Card 
            key={diff.id} 
            className={cn(
              "cursor-pointer transition-all hover:border-primary/50",
              selected === diff.id ? "border-primary ring-1 ring-primary shadow-sm" : ""
            )}
            onClick={() => setSelected(diff.id)}
          >
            <CardHeader>
              <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center mb-4", diff.bg)}>
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
          {isSubmitting ? 'Starting...' : 'Continue to Test'}
        </Button>
      </div>
    </div>
  )
}
