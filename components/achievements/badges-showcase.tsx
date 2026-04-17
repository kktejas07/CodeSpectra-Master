'use client'

import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface BadgesShowcaseProps {
  userBadges?: string[]
  earnedCount?: number
  totalCount?: number
}

const AVAILABLE_BADGES = [
  { id: 'problem-solving', name: 'Problem Solving', icon: '🎯', stars: 4 },
  { id: 'cpp', name: 'C++', icon: '⚙️', stars: 4 },
  { id: 'c', name: 'C Language', icon: '💾', stars: 4 },
  { id: 'python', name: 'Python', icon: '🐍', stars: 4 },
  { id: 'java', name: 'Java', icon: '☕', stars: 4 },
  { id: 'ruby', name: 'Ruby', icon: '💎', stars: 4 },
  { id: 'sql', name: 'SQL', icon: '🗄️', stars: 4 },
  { id: 'days-30', name: '30 Days of Code', icon: '📅', stars: 4 },
  { id: 'days-js-10', name: '10 Days of JS', icon: '⏰', stars: 4 },
  { id: 'statistics', name: '10 Days of Statistics', icon: '📊', stars: 4 },
  { id: 'react', name: 'React', icon: '⚛️', stars: 4 },
]

export function BadgesShowcase({ userBadges = [], earnedCount = 0, totalCount = AVAILABLE_BADGES.length }: BadgesShowcaseProps) {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold text-foreground">Your Badges & Achievements</h2>
        <p className="text-muted-foreground mt-2">
          Earn badges by solving challenges and completing practice paths. You&apos;ve earned {earnedCount} of {totalCount} badges.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {AVAILABLE_BADGES.map((badge) => {
          const isEarned = userBadges.includes(badge.id)
          return (
            <Card
              key={badge.id}
              className={`p-6 flex flex-col items-center justify-center text-center transition-all ${
                isEarned
                  ? 'bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800'
                  : 'opacity-50 grayscale'
              }`}
            >
              <div className="text-5xl mb-3">{badge.icon}</div>
              <h3 className="font-bold text-foreground text-sm">{badge.name}</h3>
              <div className="flex gap-0.5 mt-2">
                {Array(badge.stars).fill(0).map((_, i) => (
                  <span key={i} className="text-yellow-500">★</span>
                ))}
              </div>
              {isEarned && (
                <Badge className="mt-3 bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300">
                  Earned
                </Badge>
              )}
            </Card>
          )
        })}
      </div>

      <Card className="p-6 bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
        <h3 className="font-bold text-foreground mb-3">How do I earn badges?</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          You earn badges by solving challenges on various practice tracks on our site. If you solve a challenge in an official
          CodeSpectra contest, you will earn points towards your progress once the challenge is added to the practice site. Please note
          that if you unlock the editorial and solve the challenge in a Skill Track (i.e Non Tutorial track), your score will not be
          counted toward your progress.
        </p>
      </Card>
    </div>
  )
}
