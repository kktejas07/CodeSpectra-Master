'use client'

import { useEffect, useState } from 'react'
import { Trophy, Zap, BookOpen, Target, Flame, Code2, Loader, HelpCircle, Loader2 } from 'lucide-react'
import { BadgesShowcase } from '@/components/achievements/badges-showcase'
import { useLockedFeatures } from '@/lib/use-page-guard'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { usePageGuard } from '@/lib/use-page-guard'

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

  const earnedCount = achievements.filter(a => a.earned).length
  const userBadges = achievements.filter(a => a.earned).map(a => (a.name || '').toLowerCase().replace(/\s+/g, '-'))

  if (loading) return <div className="flex justify-center py-20"><Loader className="h-6 w-6 animate-spin text-muted-foreground" /></div>

  if (!gate.ready) return null

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Trophy className="w-6 h-6 text-primary" />
          <h1 className="text-3xl font-bold text-foreground">Achievements & Badges</h1>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="right">
                <p className="text-xs max-w-[250px]">Showcase your platform achievements and earned skill badges.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {achievements.length === 0 ? (
        <Card className="border-border/60 p-10 text-center">
          <Trophy className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-muted-foreground">No achievements yet. Start completing challenges to earn them.</p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card className="border-border/60 p-6 text-center">
              <p className="text-3xl font-bold text-foreground">Lvl {level}</p>
              <p className="text-xs text-muted-foreground">Your level</p>
            </Card>
            <Card className="border-border/60 p-6 text-center">
              <p className="text-3xl font-bold text-foreground">{xp} XP</p>
              <p className="text-xs text-muted-foreground">Total XP earned</p>
            </Card>
            <Card className="border-border/60 p-6 text-center">
              <p className="text-3xl font-bold text-foreground">{earnedCount}/{achievements.length}</p>
              <p className="text-xs text-muted-foreground">Achievements earned</p>
            </Card>
            <Card className="border-border/60 p-6 text-center">
              <p className="text-3xl font-bold text-foreground">{solved}</p>
              <p className="text-xs text-muted-foreground">Problems solved</p>
            </Card>
          </div>

          <Tabs defaultValue="achievements">
            <TabsList>
              <TabsTrigger value="achievements">Achievements</TabsTrigger>
              {!badgesLocked && <TabsTrigger value="badges">Badges</TabsTrigger>}
            </TabsList>
            <TabsContent value="achievements">
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {achievements.map(a => {
                  const Icon = ICON_MAP[a.icon] || Trophy
                  return (
                    <Card key={a.id} className={`border-border/60 p-5 ${!a.earned ? 'opacity-50' : ''}`}>
                      <div className="flex items-start gap-3 mb-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Icon className="h-5 w-5" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-foreground">{a.name}</h3>
                          <p className="text-xs text-muted-foreground">{a.description}</p>
                        </div>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-muted">
                        <div className="h-1.5 rounded-full bg-primary transition-all" style={{ width: `${Math.round((a.progress / a.total) * 100)}%` }} />
                      </div>
                      <p className="mt-1 text-[10px] text-muted-foreground">{a.progress}/{a.total}</p>
                    </Card>
                  )
                })}
              </div>
            </TabsContent>
            {!badgesLocked && <TabsContent value="badges">
              {userBadges.length > 0 ? (
                <div>Badges: {userBadges.join(', ')}</div>
              ) : (
                <p className="py-10 text-center text-sm text-muted-foreground">No badges earned yet.</p>
              )}
            </TabsContent>}
          </Tabs>
        </>
      )}
    </div>
  )
}

