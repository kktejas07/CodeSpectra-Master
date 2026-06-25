'use client'

import type { LucideIcon } from 'lucide-react'
import {
  Brain,
  Cpu,
  Database,
  Gem,
  Layers,
  CalendarRange,
  Timer,
  BarChart3,
  Atom,
  Coffee,
  FileCode2,
  Star,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface BadgesShowcaseProps {
  userBadges?: string[]
  earnedCount?: number
  totalCount?: number
}

const AVAILABLE_BADGES: Array<{
  id: string
  name: string
  icon: LucideIcon
  accent: string
  stars: number
}> = [
  { id: 'problem-solving', name: 'Problem Solving', icon: Brain, accent: 'text-sky-500', stars: 4 },
  { id: 'cpp', name: 'C++', icon: Cpu, accent: 'text-indigo-500', stars: 4 },
  { id: 'c', name: 'C', icon: FileCode2, accent: 'text-slate-500', stars: 4 },
  { id: 'python', name: 'Python', icon: Layers, accent: 'text-emerald-500', stars: 4 },
  { id: 'java', name: 'Java', icon: Coffee, accent: 'text-orange-600', stars: 4 },
  { id: 'ruby', name: 'Ruby', icon: Gem, accent: 'text-rose-500', stars: 4 },
  { id: 'sql', name: 'SQL', icon: Database, accent: 'text-cyan-600', stars: 4 },
  { id: 'days-30', name: '30 Days of Code', icon: CalendarRange, accent: 'text-violet-500', stars: 4 },
  { id: 'days-js-10', name: '10 Days of JS', icon: Timer, accent: 'text-amber-500', stars: 4 },
  { id: 'statistics', name: '10 Days of Statistics', icon: BarChart3, accent: 'text-blue-500', stars: 4 },
  { id: 'react', name: 'React', icon: Atom, accent: 'text-sky-400', stars: 4 },
]

function BadgeGlyph({ icon: Icon, accent }: { icon: LucideIcon; accent?: string }) {
  return (
    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl border border-border/60 bg-muted/40">
      <Icon className={cn('h-7 w-7 text-muted-foreground', accent)} strokeWidth={1.75} aria-hidden />
    </div>
  )
}

export function BadgesShowcase({
  userBadges = [],
  earnedCount = 0,
  totalCount = AVAILABLE_BADGES.length,
}: BadgesShowcaseProps) {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Your badges</h2>
        <p className="text-muted-foreground mt-2">
          Earn badges by solving challenges and completing practice paths. You&apos;ve earned {earnedCount} of{' '}
          {totalCount} badges.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {AVAILABLE_BADGES.map((badge) => {
          const isEarned = userBadges.includes(badge.id)
          const Icon = badge.icon
          return (
            <Card
              key={badge.id}
              className={cn(
                'relative flex flex-col items-center p-6 text-center transition-all',
                isEarned
                  ? 'border-primary/35 bg-linear-to-b from-primary/8 via-card to-card shadow-sm'
                  : 'border-border/60 bg-card/80 opacity-55'
              )}
            >
              <BadgeGlyph icon={Icon} accent={isEarned ? badge.accent : undefined} />
              <h3 className="text-sm font-semibold text-foreground">{badge.name}</h3>
              <div className="mt-3 flex gap-0.5" aria-hidden>
                {Array.from({ length: badge.stars }).map((_, i) => (
                  <Star
                    key={i}
                    className={cn(
                      'h-4 w-4',
                      isEarned ? 'fill-amber-400 text-amber-500' : 'text-muted-foreground/40'
                    )}
                  />
                ))}
              </div>
              {isEarned && (
                <Badge className="mt-4 border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                  Earned
                </Badge>
              )}
            </Card>
          )
        })}
      </div>

      <Card className="border-border/60 bg-muted/20 p-6">
        <h3 className="font-semibold text-foreground mb-2">How do I earn badges?</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          You earn badges by solving challenges on practice tracks. Contest submissions may count once challenges are
          mirrored to practice. Skill-track editorials may not count toward progress — see each track&apos;s rules.
        </p>
      </Card>
    </div>
  )
}
