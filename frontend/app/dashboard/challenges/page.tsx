'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Lock, Star, Code, Zap, CheckCircle, ArrowRight, Loader, Trophy, HelpCircle, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { usePageGuard } from '@/lib/use-page-guard'
import { SkeletonStats, SkeletonList, SkeletonText } from '@/components/ui/skeleton-boneyard'
import { useTour, autoPlayPageTour, type TourStep } from '@/components/tour/tour-context'
import { PageHeader, Panel, StatCard, BentoGrid } from '@/components/app/page-kit'
import { SoftGlow } from '@/components/visuals'
import { EmptyState } from '@/components/ui/empty-state'

interface Challenge {
  id: string
  title: string
  description: string
  difficulty: string
  type: string
  duration: number
  successRate: number
  completed: boolean
  locked: boolean
  prerequisites?: string[]
}

export default function ChallengesPage() {
  const gate = usePageGuard('user')

  const [challenges, setChallenges] = useState<Challenge[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedType, setSelectedType] = useState<string | null>(null)
  const [selectedDifficulty, setSelectedDifficulty] = useState<string | null>(null)
  const { startTour, setTourSeen } = useTour()

  useEffect(() => {
    if (gate.ready) {
      const challengesTour: TourStep[] = [
        {
          target: '[data-tour="challenges-header"]',
          title: 'Interview challenge practice hub',
          description: 'Practice coding, system design, and behavioral challenges to prepare for technical interviews.',
          position: 'bottom',
        },
        {
          target: '[data-tour="challenges-content"]',
          title: 'Filter cards track progress',
          description: 'Pro tip: filter by type and level, watch Completed counts, then Start or Retry unlocked cards.',
          position: 'bottom',
        },
      ]
      autoPlayPageTour('challenges', challengesTour)}
  }, [gate.ready, startTour, setTourSeen])

  useEffect(() => {
    fetch('/api/challenges')
      .then(r => r.json())
      .then(json => { if (json.data) setChallenges(json.data) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const filteredChallenges = challenges.filter((c) => {
    if (selectedType && c.type !== selectedType) return false
    if (selectedDifficulty && c.difficulty !== selectedDifficulty) return false
    return true
  })

  const completedCount = challenges.filter(c => c.completed).length
  const types = [...new Set(challenges.map(c => c.type))]
  const difficulties = [...new Set(challenges.map(c => c.difficulty))]

  if (!gate.ready) return null

  return (
    <div className="space-y-6" data-tour="challenges-content">
      <div data-tour="challenges-header">
        <div className="relative isolate">
          <SoftGlow className="-inset-x-2 -top-4 rounded-3xl" />
          <PageHeader
            title="Challenges"
            description="Practise coding, system design and behavioural interview questions."
            icon={<Trophy />}
            className="mb-0"
          />
        </div>
      </div>

      {loading ? (
        <div className="space-y-6">
          <SkeletonText lines={1} />
          <SkeletonStats />
          <SkeletonList count={6} />
        </div>
      ) : challenges.length === 0 ? (
        <Panel className="p-4">
          <EmptyState
            title="No challenges yet"
            description="New interview challenges will appear here. Meanwhile, try the coding problems."
            actionLabel="Go to problems"
            actionHref="/dashboard/problems"
          />
        </Panel>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Completed" value={`${completedCount}/${challenges.length}`} icon={<CheckCircle />} />
            <StatCard label="Available" value={challenges.filter(c => !c.locked).length} icon={<Zap />} />
            <StatCard label="Locked" value={challenges.filter(c => c.locked).length} icon={<Lock />} />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant={!selectedType ? 'default' : 'outline'} size="sm" onClick={() => setSelectedType(null)}>All</Button>
            {types.map(t => (
              <Button key={t} variant={selectedType === t ? 'default' : 'outline'} size="sm" onClick={() => setSelectedType(t)}>{t}</Button>
            ))}
            <span aria-hidden className="mx-2 border-l border-border" />
            <Button variant={!selectedDifficulty ? 'default' : 'outline'} size="sm" onClick={() => setSelectedDifficulty(null)}>All levels</Button>
            {difficulties.map(d => (
              <Button key={d} variant={selectedDifficulty === d ? 'default' : 'outline'} size="sm" onClick={() => setSelectedDifficulty(d)}>{d}</Button>
            ))}
          </div>

          <BentoGrid className="lg:grid-cols-3">
            {filteredChallenges.map((c) => (
              <Panel key={c.id} interactive={!c.locked} className={`flex flex-col p-5 ${c.locked ? 'opacity-60' : ''}`}>
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Code className="h-4 w-4 text-primary" />
                    <span className="text-xs font-medium text-muted-foreground capitalize">{c.type.replace('-', ' ')}</span>
                  </div>
                  {c.completed ? (
                    <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" aria-label="Completed" />
                  ) : c.locked ? (
                    <Lock className="h-4 w-4 text-muted-foreground" aria-label="Locked" />
                  ) : null}
                </div>
                <h3 className="text-base mb-1 font-semibold text-foreground">{c.title}</h3>
                <p className="mb-3 line-clamp-2 text-xs text-muted-foreground">{c.description}</p>
                <div className="mb-3 flex flex-wrap gap-2 text-xs">
                  <Badge variant={c.difficulty === 'Hard' ? 'destructive' : c.difficulty === 'Medium' ? 'default' : 'secondary'} className="text-[10px]">
                    {c.difficulty}
                  </Badge>
                  <span className="text-muted-foreground tabular-nums">{c.duration} min</span>
                  <span className="text-muted-foreground tabular-nums">{c.successRate}% success</span>
                </div>
                {!!c.prerequisites?.length && (
                  <p className="mb-3 text-[11px] text-muted-foreground">
                    Requires: {c.prerequisites.join(', ')}
                  </p>
                )}
                <Link href={c.locked ? '#' : `/dashboard/challenges/${c.id}`} className="mt-auto">
                  <Button variant="outline" size="sm" className="w-full gap-2" disabled={c.locked}>
                    {c.completed ? 'Retry' : c.locked ? 'Locked' : 'Start'}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              </Panel>
            ))}
          </BentoGrid>
        </>
      )}
    </div>
  )
}

