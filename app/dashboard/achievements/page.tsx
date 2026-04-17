'use client'

import { Trophy, Zap, BookOpen, Target, Flame, Code2 } from 'lucide-react'
import { BadgesShowcase } from '@/components/achievements/badges-showcase'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

const achievements = [
  {
    id: 1,
    name: 'First Victory',
    description: 'Solve your first challenge',
    icon: Trophy,
    earned: true,
    progress: 1,
    total: 1,
  },
  {
    id: 2,
    name: 'Speed Runner',
    description: 'Solve 10 challenges in one day',
    icon: Zap,
    earned: true,
    progress: 10,
    total: 10,
  },
  {
    id: 3,
    name: 'Scholar',
    description: 'Complete 5 courses',
    icon: BookOpen,
    earned: false,
    progress: 2,
    total: 5,
  },
  {
    id: 4,
    name: 'Perfectionist',
    description: 'Solve a hard challenge on first try',
    icon: Target,
    earned: true,
    progress: 1,
    total: 1,
  },
  {
    id: 5,
    name: 'On Fire',
    description: 'Maintain a 30-day streak',
    icon: Flame,
    earned: false,
    progress: 7,
    total: 30,
  },
  {
    id: 6,
    name: 'Code Master',
    description: 'Solve 100 challenges',
    icon: Code2,
    earned: false,
    progress: 42,
    total: 100,
  },
]

export default function AchievementsPage() {
  const earnedCount = achievements.filter((a) => a.earned).length
  const userBadges = ['problem-solving', 'python', 'java', 'cpp', 'react']

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Trophy className="w-6 h-6 text-primary" />
          <h1 className="text-3xl font-bold text-foreground">Achievements & Badges</h1>
        </div>
        <p className="text-foreground/60">
          Unlock badges and achievements as you progress. Showcase your skills and accomplishments.
        </p>
      </div>

      <Tabs defaultValue="badges" className="w-full">
        <TabsList className="grid w-full max-w-xs grid-cols-2">
          <TabsTrigger value="badges">Badges</TabsTrigger>
          <TabsTrigger value="achievements">Achievements</TabsTrigger>
        </TabsList>

        <TabsContent value="badges" className="space-y-6">
          <BadgesShowcase
            userBadges={userBadges}
            earnedCount={userBadges.length}
            totalCount={11}
          />
        </TabsContent>

        <TabsContent value="achievements" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-6 rounded-lg bg-card border border-border">
              <p className="text-sm text-foreground/60 mb-1">Badges Earned</p>
              <p className="text-3xl font-bold text-primary">{userBadges.length}</p>
              <p className="text-xs text-foreground/50 mt-1">of 11</p>
            </div>
            <div className="p-6 rounded-lg bg-card border border-border">
              <p className="text-sm text-foreground/60 mb-1">Progress</p>
              <p className="text-3xl font-bold text-foreground">
                {Math.round((userBadges.length / 11) * 100)}%
              </p>
              <p className="text-xs text-foreground/50 mt-1">Complete</p>
            </div>
            <div className="p-6 rounded-lg bg-card border border-border">
              <p className="text-sm text-foreground/60 mb-1">Achievements Earned</p>
              <p className="text-3xl font-bold text-foreground">{earnedCount}</p>
              <p className="text-xs text-foreground/50 mt-1">of {achievements.length}</p>
            </div>
          </div>

          {/* Achievements Grid */}
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-foreground">All Achievements</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {achievements.map((achievement) => {
                const Icon = achievement.icon
                return (
                  <div
                    key={achievement.id}
                    className={`p-6 rounded-lg border transition ${
                      achievement.earned
                        ? 'bg-primary/10 border-primary/50'
                        : 'bg-card border-border/50 opacity-60'
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div
                        className={`p-3 rounded-lg ${
                          achievement.earned
                            ? 'bg-primary/20'
                            : 'bg-foreground/10'
                        }`}
                      >
                        <Icon
                          className={`w-6 h-6 ${
                            achievement.earned
                              ? 'text-primary'
                              : 'text-foreground/30'
                          }`}
                        />
                      </div>
                      {achievement.earned && (
                        <span className="text-xs font-bold px-2 py-1 rounded-full bg-primary/20 text-primary">
                          EARNED
                        </span>
                      )}
                    </div>

                    <h3 className="font-bold text-foreground mb-1">{achievement.name}</h3>
                    <p className="text-sm text-foreground/60 mb-4">{achievement.description}</p>

                    {!achievement.earned && (
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs text-foreground/50">
                          <span>Progress</span>
                          <span>
                            {achievement.progress}/{achievement.total}
                          </span>
                        </div>
                        <div className="w-full bg-border/50 rounded-full h-2">
                          <div
                            className="bg-primary h-2 rounded-full transition-all"
                            style={{
                              width: `${(achievement.progress / achievement.total) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Leaderboard Integration */}
          <div className="p-6 rounded-lg bg-primary/5 border border-primary/30">
            <h2 className="font-bold text-foreground mb-2">Achievements Leaderboard</h2>
            <p className="text-sm text-foreground/70 mb-4">
              See who has unlocked the most achievements. Compare your badges with other developers.
            </p>
            <button className="text-primary text-sm font-medium hover:underline">
              View Achievement Leaderboard →
            </button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
