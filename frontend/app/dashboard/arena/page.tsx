'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Trophy, Code, Loader, Loader2 } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useTour, autoPlayPageTour, type TourStep } from '@/components/tour/tour-context'
import { PageHeader, Panel, StatCard, BentoGrid } from '@/components/app/page-kit'
import { SoftGlow } from '@/components/visuals'
import { EmptyState } from '@/components/ui/empty-state'
import { useT } from '@/lib/i18n/client'

interface ArenaChallenge {
  id: string
  title: string
  shortDescription?: string
  description?: string
  difficulty: string
  category?: string
  points: number
  solved: number
  attempts: number
}

const difficultyColors: Record<string, string> = {
  easy: 'text-green-700 dark:text-green-400 bg-green-500/10 border-green-500/30',
  medium: 'text-amber-700 dark:text-amber-400 bg-amber-500/10 border-amber-500/30',
  hard: 'text-red-700 dark:text-red-400 bg-red-500/10 border-red-500/30',
}

// Skeleton components for better loading UX
const SkeletonCard = () => (
  <Card className="rounded-3xl border-border/70 p-5 animate-pulse">
    <div className="h-5 bg-muted/60 rounded w-3/4 mb-3" />
    <div className="h-3 bg-muted/50 rounded w-full mb-2" />
    <div className="h-3 bg-muted/50 rounded w-5/6 mb-3" />
    <div className="flex gap-4">
      <div className="h-3 bg-muted/50 rounded w-12" />
      <div className="h-3 bg-muted/50 rounded w-12" />
    </div>
  </Card>
)

const StatsSkeleton = () => (
  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
    {Array.from({ length: 3 }).map((_, i) => (
      <Card key={i} className="rounded-3xl border-border/70 p-6 animate-pulse">
        <div className="h-4 bg-muted/60 rounded w-24 mb-2" />
        <div className="h-8 bg-muted/70 rounded w-16" />
      </Card>
    ))}
  </div>
)

const FilterSkeleton = () => (
  <div className="flex flex-wrap gap-4 animate-pulse">
    <div className="h-10 w-36 bg-muted/60 rounded" />
    <div className="h-10 w-32 bg-muted/60 rounded" />
  </div>
)

const GridSkeleton = () => (
  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
    {Array.from({ length: 6 }).map((_, i) => (
      <SkeletonCard key={i} />
    ))}
  </div>
)

export default function ArenaPage() {
  const { t } = useT()
  const gate = usePageGuard('user')

  const [challenges, setChallenges] = useState<ArenaChallenge[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [difficulty, setDifficulty] = useState('all')
  const [category, setCategory] = useState('all')
  const { startTour, setTourSeen } = useTour()

  useEffect(() => {
    setLoading(true)
    setLoadError(false)
    fetch('/api/arena/challenges')
      .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json() })
      .then(json => { if (json.data) setChallenges(json.data) })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false))
  }, [reloadKey])

  // Initialize tour on first visit
  useEffect(() => {
    if (gate.ready) {
      const arenaTour: TourStep[] = [
        {
          target: '[data-tour="arena-overview"]',
          title: t('practice.codingArena'),
          description: t('practice.browseAndSolveCodingChallengesToc0c'),
          position: 'bottom',
        },
        {
          target: '[data-tour="stats-panel"]',
          title: t('practice.yourStats'),
          description: t('practice.trackYourProgressWithTotalChallenges497'),
          position: 'bottom',
        },
        {
          target: '[data-tour="arena-filters"]',
          title: t('practice.filterChallenges'),
          description: t('practice.filterChallengesByDifficultyAndCategory6f9'),
          position: 'bottom',
        },
        {
          target: '[data-tour="arena-grid"]',
          title: t('practice.challengeList'),
          description: t('practice.clickAnyChallengeToStartSolving6fe'),
          position: 'bottom',
        },
      ]
      autoPlayPageTour('arena', arenaTour)}
  }, [gate.ready, startTour, setTourSeen])

  const filtered = challenges.filter((c) => {
    if (difficulty !== 'all' && c.difficulty !== difficulty) return false
    if (category !== 'all' && c.category !== category) return false
    return true
  })

  const categories = ['all', ...new Set(challenges.map(c => c.category).filter(Boolean))]
  const difficulties = ['all', 'easy', 'medium', 'hard']

  if (!gate.ready) return null

  return (
    <div className="space-y-6" data-tour="arena-overview">
      <div data-tour="stats-panel">
        <div className="relative isolate">
          <SoftGlow className="-inset-x-2 -top-4 rounded-3xl" />
          <PageHeader
            illustration="coding"
            title={t('practice.codingArena')}
            description={t('practice.solveTimedChallengesToEarnPointsd51')}
            icon={<Trophy />}
            className="mb-0"
          />
        </div>
      </div>

      {loading ? (
        <div className="space-y-8">
          <StatsSkeleton />
          <FilterSkeleton />
          <GridSkeleton />
        </div>
      ) : loadError ? (
        <Panel className="p-4">
          <EmptyState illustration="error"
            title={t('practice.couldntLoadArenaChallenges')}
            description={t('practice.checkYourConnectionAndTryAgain')}
            actionLabel={t('common.tryAgain')}
            onAction={() => setReloadKey((k) => k + 1)}
          />
        </Panel>
      ) : challenges.length === 0 ? (
        <Panel className="p-4">
          <EmptyState illustration="coding"
            title={t('practice.noArenaChallengesYet')}
            description={t('practice.checkBackSoonInTheMeantime1a3')}
            actionLabel={t('practice.goToProblems')}
            actionHref="/dashboard/problems"
          />
        </Panel>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard label={t('practice.challenges')} value={challenges.length} icon={<Code />} />
            <StatCard label={t('practice.solved')} value={challenges.filter(c => c.solved > 0).length} icon={<Trophy />} />
            <StatCard label={t('practice.totalPoints')} value={challenges.reduce((s, c) => s + c.points, 0)} />
          </div>

          <div className="flex flex-wrap gap-4" data-tour="arena-filters">
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">{t('practice.difficulty')}</label>
              <select
                aria-label={t('practice.difficulty')}
                value={difficulty}
                onChange={e => setDifficulty(e.target.value)}
                className="px-4 py-2 rounded-xl bg-card border border-border text-foreground capitalize focus-visible:outline-2 focus-visible:outline-primary"
              >
                {difficulties.map(d => <option key={d} value={d}>{d === 'all' ? t('practice.all') : d}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">{t('practice.category')}</label>
              <select
                aria-label={t('practice.category')}
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="px-4 py-2 rounded-xl bg-card border border-border text-foreground capitalize focus-visible:outline-2 focus-visible:outline-primary"
              >
                {categories.map(c => <option key={c} value={c}>{c === 'all' ? t('practice.all') : c}</option>)}
              </select>
            </div>
          </div>

          <div data-tour="arena-grid">
          <BentoGrid className="lg:grid-cols-3">
            {filtered.map((c) => (
              <Link key={c.id} href={`/dashboard/arena/${c.id}`} className="rounded-3xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                <Panel interactive className="h-full p-5">
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <h3 className="text-base font-semibold text-foreground">{c.title}</h3>
                    <Badge variant="outline" className={`text-[10px] capitalize ${difficultyColors[c.difficulty] || ''}`}>
                      {c.difficulty}
                    </Badge>
                  </div>
                  <p className="mb-3 line-clamp-2 text-xs text-muted-foreground">{c.shortDescription || c.description}</p>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="tabular-nums">{t('practice.pointsPts', { points: c.points })}</span>
                    <span className="tabular-nums">{t('practice.solvedSolved', { solved: c.solved })}</span>
                  </div>
                </Panel>
              </Link>
            ))}
          </BentoGrid>
          </div>
        </>
      )}
    </div>
  )
}

