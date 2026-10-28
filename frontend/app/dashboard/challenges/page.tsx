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
import { useT } from '@/lib/i18n/client'

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
  const { t: tr } = useT()
  const gate = usePageGuard('user')

  const [challenges, setChallenges] = useState<Challenge[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [selectedType, setSelectedType] = useState<string | null>(null)
  const [selectedDifficulty, setSelectedDifficulty] = useState<string | null>(null)
  const { startTour, setTourSeen } = useTour()

  useEffect(() => {
    if (gate.ready) {
      const challengesTour: TourStep[] = [
        {
          target: '[data-tour="challenges-header"]',
          title: tr('practice.interviewChallengePracticeHub'),
          description: tr('practice.practiceCodingSystemDesignAndBehavioral414'),
          position: 'bottom',
        },
        {
          target: '[data-tour="challenges-content"]',
          title: tr('practice.filterCardsTrackProgress'),
          description: tr('practice.proTipFilterByTypeAndf30'),
          position: 'bottom',
        },
      ]
      autoPlayPageTour('challenges', challengesTour)}
  }, [gate.ready, startTour, setTourSeen])

  useEffect(() => {
    setLoading(true)
    setLoadError(false)
    fetch('/api/challenges')
      .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json() })
      .then(json => { if (json.data) setChallenges(json.data) })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false))
  }, [reloadKey])

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
            illustration="coding"
            title={tr('practice.challenges')}
            description={tr('practice.practiseCodingSystemDesignAndBehavioural4eb')}
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
      ) : loadError && challenges.length === 0 ? (
        <Panel className="p-4">
          <EmptyState
            illustration="error"
            title={tr('practice.couldntLoadChallenges')}
            description={tr('practice.checkYourConnectionAndTryAgain')}
            actionLabel={tr('common.tryAgain')}
            onAction={() => setReloadKey(k => k + 1)}
          />
        </Panel>
      ) : challenges.length === 0 ? (
        <Panel className="p-4">
          <EmptyState illustration="coding"
            title={tr('practice.noChallengesYet')}
            description={tr('practice.newInterviewChallengesWillAppearHered0b')}
            actionLabel={tr('practice.goToProblems')}
            actionHref="/dashboard/problems"
          />
        </Panel>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label={tr('practice.completed')} value={`${completedCount}/${challenges.length}`} icon={<CheckCircle />} />
            <StatCard label={tr('practice.available')} value={challenges.filter(c => !c.locked).length} icon={<Zap />} />
            <StatCard label={tr('practice.locked')} value={challenges.filter(c => c.locked).length} icon={<Lock />} />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant={!selectedType ? 'default' : 'outline'} size="sm" onClick={() => setSelectedType(null)}>{tr('practice.all')}</Button>
            {types.map(t => (
              <Button key={t} variant={selectedType === t ? 'default' : 'outline'} size="sm" onClick={() => setSelectedType(t)}>{t}</Button>
            ))}
            <span aria-hidden className="mx-2 border-l border-border" />
            <Button variant={!selectedDifficulty ? 'default' : 'outline'} size="sm" onClick={() => setSelectedDifficulty(null)}>{tr('practice.allLevels')}</Button>
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
                    <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" aria-label={tr('practice.completed')} />
                  ) : c.locked ? (
                    <Lock className="h-4 w-4 text-muted-foreground" aria-label={tr('practice.locked')} />
                  ) : null}
                </div>
                <h3 className="text-base mb-1 font-semibold text-foreground">{c.title}</h3>
                <p className="mb-3 line-clamp-2 text-xs text-muted-foreground">{c.description}</p>
                <div className="mb-3 flex flex-wrap gap-2 text-xs">
                  <Badge variant={c.difficulty === 'Hard' ? 'destructive' : c.difficulty === 'Medium' ? 'default' : 'secondary'} className="text-[10px]">
                    {c.difficulty}
                  </Badge>
                  <span className="text-muted-foreground tabular-nums">{c.duration} min</span>
                  <span className="text-muted-foreground tabular-nums">{tr('practice.successrateSuccess', { successRate: c.successRate })}</span>
                </div>
                {!!c.prerequisites?.length && (
                  <p className="mb-3 text-[11px] text-muted-foreground">{tr('practice.requiresValue', { value: c.prerequisites.join(', ') })}</p>
                )}
                {c.locked ? (
                  <Button variant="outline" size="sm" className="mt-auto w-full gap-2" disabled>{tr('practice.locked')}<ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" className="mt-auto w-full gap-2" asChild>
                    <Link href={`/dashboard/challenges/${c.id}`}>
                      {c.completed ? tr('common.retry') : tr('practice.start')}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                )}
              </Panel>
            ))}
          </BentoGrid>
        </>
      )}
    </div>
  )
}

