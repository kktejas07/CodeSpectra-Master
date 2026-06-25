'use client'

import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Trophy, Flame, Star, Target, Medal, Award, Hash, Crosshair, Bug, Lock, Zap } from 'lucide-react'

interface TeamMember {
  id: string
  name: string
  avatar: string
  email: string
  scans: number
  avgQuality: number
  bugsFixed: number
  streak: number
}

interface TeamLeaderboardProps {
  members?: TeamMember[]
}

export function TeamLeaderboard({ members }: TeamLeaderboardProps) {
  const defaultMembers: TeamMember[] = members || [
    {
      id: '1',
      name: 'Alice Johnson',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Alice',
      email: 'alice@example.com',
      scans: 156,
      avgQuality: 88,
      bugsFixed: 87,
      streak: 23,
    },
    {
      id: '2',
      name: 'Bob Smith',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Bob',
      email: 'bob@example.com',
      scans: 142,
      avgQuality: 85,
      bugsFixed: 72,
      streak: 18,
    },
    {
      id: '3',
      name: 'Carol Davis',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Carol',
      email: 'carol@example.com',
      scans: 128,
      avgQuality: 82,
      bugsFixed: 64,
      streak: 15,
    },
    {
      id: '4',
      name: 'David Wilson',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=David',
      email: 'david@example.com',
      scans: 94,
      avgQuality: 79,
      bugsFixed: 48,
      streak: 8,
    },
    {
      id: '5',
      name: 'Eva Martinez',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Eva',
      email: 'eva@example.com',
      scans: 76,
      avgQuality: 81,
      bugsFixed: 42,
      streak: 5,
    },
  ]

  const sorted = [...defaultMembers].sort((a, b) => b.scans - a.scans)

  const getMedalColor = (position: number) => {
    if (position === 0) return 'text-yellow-500'
    if (position === 1) return 'text-gray-400'
    if (position === 2) return 'text-orange-600'
    return 'text-foreground/40'
  }

  const getQualityBadge = (score: number) => {
    if (score >= 85) return { bg: 'bg-green-500/20', text: 'text-green-600', label: 'Excellent' }
    if (score >= 80) return { bg: 'bg-blue-500/20', text: 'text-blue-600', label: 'Good' }
    return { bg: 'bg-yellow-500/20', text: 'text-yellow-600', label: 'Fair' }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <Trophy className="w-5 h-5" />
          Team Leaderboard
        </h3>
        <p className="text-sm text-foreground/60">
          See how your team members are performing in code quality metrics
        </p>
      </div>

      {/* Leaderboard */}
      <div className="space-y-3">
        {sorted.map((member, index) => {
          const qualityColor = getQualityBadge(member.avgQuality)
          const medalColor = getMedalColor(index)

          return (
            <Card key={member.id} className="bg-card/30 border border-border p-4">
              <div className="flex items-center gap-4">
                {/* Position Badge */}
                <div
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted/30 ${medalColor}`}
                >
                  {index === 0 && <Medal className="h-6 w-6" aria-label="First place" />}
                  {index === 1 && <Award className="h-6 w-6" aria-label="Second place" />}
                  {index === 2 && <Trophy className="h-6 w-6" aria-label="Third place" />}
                  {index > 2 && (
                    <span className="flex items-center gap-0.5 text-sm font-bold tabular-nums">
                      <Hash className="h-4 w-4 opacity-70" />
                      {index + 1}
                    </span>
                  )}
                </div>

                {/* Avatar and Name */}
                <div className="flex-1 flex items-center gap-3">
                  <Avatar className="w-10 h-10 border-2 border-border">
                    <AvatarImage src={member.avatar} alt={member.name} />
                    <AvatarFallback>{member.name.charAt(0)}</AvatarFallback>
                  </Avatar>

                  <div className="min-w-0">
                    <p className="font-semibold text-foreground truncate">{member.name}</p>
                    <p className="text-xs text-foreground/50 truncate">{member.email}</p>
                  </div>
                </div>

                {/* Stats */}
                <div className="hidden md:flex items-center gap-6">
                  {/* Scans */}
                  <div className="text-center">
                    <p className="text-xs text-foreground/60">Scans</p>
                    <p className="text-lg font-bold text-foreground">{member.scans}</p>
                  </div>

                  {/* Avg Quality */}
                  <div className="text-center">
                    <p className="text-xs text-foreground/60">Avg Quality</p>
                    <Badge className={`${qualityColor.bg} ${qualityColor.text} border-0`}>
                      {member.avgQuality}/100
                    </Badge>
                  </div>

                  {/* Bugs Fixed */}
                  <div className="text-center">
                    <p className="text-xs text-foreground/60">Bugs Fixed</p>
                    <p className="text-lg font-bold text-green-500">{member.bugsFixed}</p>
                  </div>

                  {/* Streak */}
                  <div className="text-center flex flex-col items-center gap-1">
                    <p className="text-xs text-foreground/60">Streak</p>
                    <div className="flex items-center gap-1">
                      <Flame className="w-4 h-4 text-orange-500" />
                      <span className="font-bold text-foreground">{member.streak}</span>
                    </div>
                  </div>
                </div>

                {/* Mobile Stats */}
                <div className="md:hidden text-right">
                  <p className="text-sm font-bold text-foreground">{member.scans}</p>
                  <p className="text-xs text-foreground/50">scans</p>
                </div>
              </div>

              {/* Mobile Expanded Stats */}
              <div className="md:hidden mt-3 pt-3 border-t border-border/50 grid grid-cols-3 gap-2 text-xs">
                <div className="text-center">
                  <p className="text-foreground/60">Avg Quality</p>
                  <p className="font-bold text-foreground">{member.avgQuality}%</p>
                </div>
                <div className="text-center">
                  <p className="text-foreground/60">Bugs Fixed</p>
                  <p className="font-bold text-green-500">{member.bugsFixed}</p>
                </div>
                <div className="text-center">
                  <p className="text-foreground/60">Streak</p>
                  <div className="flex items-center justify-center gap-1">
                    <Flame className="w-3 h-3 text-orange-500" />
                    <span className="font-bold">{member.streak}</span>
                  </div>
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-card/30 border border-border p-4 text-center">
          <p className="text-2xl font-bold text-yellow-500 flex justify-center gap-1">
            <Trophy className="w-6 h-6" />
          </p>
          <p className="text-xs text-foreground/60 mt-2">Team Leader</p>
          <p className="text-sm font-bold text-foreground">{sorted[0]?.name}</p>
        </Card>

        <Card className="bg-card/30 border border-border p-4 text-center">
          <p className="text-2xl font-bold text-foreground flex justify-center">
            <Target className="w-6 h-6 text-blue-500" />
          </p>
          <p className="text-xs text-foreground/60 mt-2">Avg Team Quality</p>
          <p className="text-sm font-bold text-foreground">
            {Math.round(defaultMembers.reduce((sum, m) => sum + m.avgQuality, 0) / defaultMembers.length)}%
          </p>
        </Card>

        <Card className="bg-card/30 border border-border p-4 text-center">
          <p className="text-2xl font-bold text-green-500 flex justify-center">
            <Star className="w-6 h-6" />
          </p>
          <p className="text-xs text-foreground/60 mt-2">Total Bugs Fixed</p>
          <p className="text-sm font-bold text-foreground">
            {defaultMembers.reduce((sum, m) => sum + m.bugsFixed, 0)}
          </p>
        </Card>

        <Card className="bg-card/30 border border-border p-4 text-center">
          <p className="text-2xl font-bold text-orange-500 flex justify-center">
            <Flame className="w-6 h-6" />
          </p>
          <p className="text-xs text-foreground/60 mt-2">Longest Streak</p>
          <p className="text-sm font-bold text-foreground">
            {Math.max(...defaultMembers.map((m) => m.streak))} days
          </p>
        </Card>
      </div>

      {/* Achievements */}
      <Card className="border border-purple-500/30 bg-linear-to-r from-purple-500/10 to-pink-500/10 p-4 space-y-3">
        <h4 className="font-semibold text-foreground">Team Achievements</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <div className="flex items-center gap-2 rounded bg-background/50 p-2">
            <Crosshair className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            <span className="text-foreground">Quality goal</span>
          </div>
          <div className="flex items-center gap-2 rounded bg-background/50 p-2">
            <Bug className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
            <span className="text-foreground">Bug hunters</span>
          </div>
          <div className="flex items-center gap-2 rounded bg-background/50 p-2">
            <Lock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="text-foreground">Security first</span>
          </div>
          <div className="flex items-center gap-2 rounded bg-background/50 p-2">
            <Zap className="h-4 w-4 shrink-0 text-amber-500" aria-hidden />
            <span className="text-foreground">Quick fixers</span>
          </div>
        </div>
      </Card>
    </div>
  )
}
