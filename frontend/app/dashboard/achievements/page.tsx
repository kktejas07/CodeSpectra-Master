'use client'

import { useEffect, useState } from 'react'
import { Trophy, Zap, BookOpen, Target, Flame, Code2, Loader, HelpCircle, Loader2 } from 'lucide-react'
import { BadgesShowcase } from '@/components/achievements/badges-showcase'
import { useLockedFeatures } from '@/lib/use-page-guard'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { usePageGuard } from '@/lib/use-page-guard'
import { useTour, autoPlayPageTour, type TourStep } from '@/components/tour/tour-context'
import { SkeletonStats, SkeletonList } from '@/components/ui/skeleton-boneyard'
import { ContributionGraph } from '@/components/gamification/contribution-graph'
import { SkillBadges } from '@/components/gamification/skill-badges'
import { PageHeader, Panel, StatCard, BentoGrid } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'

interface Achievement {
  id: number
  name: string
  description: string
  icon: string
  earned: boolean
  progress: number
  total: number
}

const ICON_MAP: Record<string, React.ComponentType<any>> = {
  Trophy, Zap, BookOpen, Target, Flame, Code2,
}

export default function AchievementsPage() {
  const gate = usePageGuard('user')
  const { startTour, setTourSeen } = useTour()

  const [achievements, setAchievements] = useState<Achievement[]>([])
  const [xp, setXp] = useState(0)
  const [level, setLevel] = useState(1)
  const [solved, setSolved] = useState(0)
  const [loading, setLoading] = useState(true)
  const { lockedFeatures } = useLockedFeatures()
  const badgesLocked = lockedFeatures.includes('achievements:badges')

  useEffect(() => {
    fetch('/api/achievements')
      .then(r => r.json())
      .then(json => {
        if (json.data) setAchievements(json.data)
        if (typeof json.xp === 'number') setXp(json.xp)
        if (typeof json.level === 'number') setLevel(json.level)
        if (json.stats && typeof json.stats.solved === 'number') setSolved(json.stats.solved)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // Initialize tour on first visit
  useEffect(() => {
    if (gate.ready) {
      const achievementsTour: TourStep[] = [
        {
          target: '[data-tour="achievements-header"]',
          title: 'Your achievements overview',
          description: 'This page shows your earned achievements, skill badges, and progress for all learners.',
          position: 'bottom',
        },
        {
          target: '[data-tour="achievements-stats"]',
          title: 'Track level and XP',
          description: 'Track your level, XP, earned achievements, and solved problems at a glance.',
          position: 'bottom',
        },
        {
          target: '[data-tour="achievements-graph"]',
          title: 'Review activity streaks',
          description: 'Review your contribution graph to spot activity streaks and gaps over time.',
          position: 'bottom',
        },
        {
          target: '[data-tour="achievements-badges"]',
          title: 'Earn skill badges',
          description: 'Earn skill badges as you master technologies tracked in the SkillBadges section.',
          position: 'bottom',
        },
        {
          target: '[data-tour="achievements-tabs"]',
          title: 'Browse every achievement',
          description: 'Pro tip: open each achievement card to check progress counts and finish remaining tasks first.',
          position: 'bottom',
        },
      ]
      autoPlayPageTour('achievements', achievementsTour)}
  }, [gate.ready, startTour, setTourSeen])

  const earnedCount = achievements.filter(a => a.earned).length
  const userBadges = achievements.filter(a => a.earned).map(a => (a.name || '').toLowerCase().replace(/\s+/g, '-'))

  if (loading) return (
    <div className="space-y-6">
      <SkeletonStats />
      <SkeletonList count={6} />
    </div>
  )

  if (!gate.ready) return null

  return (
    <div className="space-y-6">
      <div data-tour="achievements-header">
        <PageHeader
          illustration="leaderboard"
          title="Achievements and badges"
          description="Your level, XP and the achievements and skill badges you've earned."
          icon={<Trophy />}
          className="mb-0"
        />
      </div>

      {achievements.length === 0 ? (
        <Panel className="p-4">
          <EmptyState illustration="leaderboard"
            title="No achievements yet"
            description="Solve problems and finish challenges to start earning achievements."
            actionLabel="Go to problems"
            actionHref="/dashboard/problems"
          />
        </Panel>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" data-tour="achievements-stats">
            <StatCard label="Your level" value={`Level ${level}`} icon={<Zap />} />
            <StatCard label="Total XP" value={`${xp} XP`} icon={<Flame />} />
            <StatCard label="Achievements" value={`${earnedCount}/${achievements.length}`} icon={<Trophy />} />
            <StatCard label="Problems solved" value={solved} icon={<Code2 />} />
          </div>

          <div data-tour="achievements-graph"><ContributionGraph /></div>
          <div data-tour="achievements-badges"><SkillBadges /></div>
          <div data-tour="achievements-tabs"><Tabs defaultValue="achievements">
            <TabsList>
              <TabsTrigger value="achievements">Achievements</TabsTrigger>
              {!badgesLocked && <TabsTrigger value="badges">Badges</TabsTrigger>}
            </TabsList>
            <TabsContent value="achievements">
              <BentoGrid className="lg:grid-cols-3">
                {achievements.map(a => {
                  const Icon = ICON_MAP[a.icon] || Trophy
                  return (
                    <Panel key={a.id} className={`p-5 ${!a.earned ? 'opacity-60' : ''}`}>
                      <div className="flex items-start gap-3 mb-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                          <Icon className="h-5 w-5" />
                        </div>
                        <div>
                          <h3 className="text-base font-semibold text-foreground">{a.name}</h3>
                          <p className="text-xs text-muted-foreground">{a.description}</p>
                        </div>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={a.total} aria-valuenow={a.progress} aria-label={`${a.name} progress`}>
                        <div className="h-1.5 rounded-full bg-primary transition-all motion-reduce:transition-none" style={{ width: `${a.total ? Math.round((a.progress / a.total) * 100) : 0}%` }} />
                      </div>
                      <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">{a.progress}/{a.total}</p>
                    </Panel>
                  )
                })}
              </BentoGrid>
            </TabsContent>
            {!badgesLocked && <TabsContent value="badges">
              {userBadges.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {userBadges.map(b => (
                    <span key={b} className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-sm font-medium capitalize text-primary">{b.replace(/-/g, ' ')}</span>
                  ))}
                </div>
              ) : (
                <EmptyState illustration="leaderboard" title="No badges yet" description="Solve problems to earn your first one." actionLabel="Go to problems" actionHref="/dashboard/problems" className="border-0 bg-transparent" />
              )}
            </TabsContent>}
          </Tabs>
          </div>
        </>
      )}
    </div>
  )
}

