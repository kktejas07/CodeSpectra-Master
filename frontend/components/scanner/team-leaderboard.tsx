'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Loader2Icon } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { Trophy, Flame, Star, Target, Medal, Award, Hash, Crosshair, Bug, Lock, Zap } from 'lucide-react'

interface TeamMember {
  userId: string
  name: string
  email: string
  scans: number
  reviews: number
  fixes: number
  submissions: number
  total: number
}

interface TeamLeaderboardProps {
  members?: TeamMember[]
}

export function TeamLeaderboard({ members }: TeamLeaderboardProps) {
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>(members || [])
  const [loading, setLoading] = useState(!members)

  useEffect(() => {
    if (members) {
      setTeamMembers(members)
      return
    }
    setLoading(true)
    fetch('/api/admin/teams/activity?weeks=12', { credentials: 'include' })
      .then((r) => r.json())
      .then((json) => {
        if (json.userStats && Array.isArray(json.userStats)) {
          setTeamMembers(json.userStats)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [members])

  const defaultMembers: TeamMember[] = teamMembers.length > 0 ? teamMembers : []

  const sorted = [...defaultMembers].sort((a, b) => b.total - a.total)

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

  const teamAvgQuality =
    sorted.length > 0
      ? Math.round(sorted.reduce((sum, m) => sum + Math.min(95, 60 + m.total * 2), 0) / sorted.length)
      : 0
  const totalBugsFixed = sorted.reduce((sum, m) => sum + m.fixes, 0)
  const maxStreak = sorted.length > 0 ? Math.max(...sorted.map((m) => m.total * 3)) : 0

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="h-6 w-6" />
        <span className="ml-2 text-sm text-muted-foreground">Loading leaderboard…</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <Trophy className="w-5 h-5" />
          Team Leaderboard
        </h3>
        <p className="text-sm text-foreground/60">
          {sorted.length > 0
            ? `${sorted.length} team members ranked by contribution`
            : 'No team members found — connect GitHub to see team activity'}
        </p>
      </div>

      {sorted.length === 0 ? (
        <Card className="bg-card/30 border border-border p-8 text-center">
          <Trophy className="mx-auto h-12 w-12 text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground">No team data available.</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Connect GitHub integrations to see team activity.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {sorted.map((member, index) => {
            const qualityScore = Math.min(95, 60 + member.total * 2)
            const qualityColor = getQualityBadge(qualityScore)
            const medalColor = getMedalColor(index)

            return (
              <Card key={member.userId} className="bg-card/30 border border-border p-4">
                <div className="flex items-center gap-4">
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

                  <div className="flex-1 flex items-center gap-3">
                    <Avatar className="w-10 h-10 border-2 border-border">
                      <AvatarImage
                        src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(member.name)}`}
                        alt={member.name}
                      />
                      <AvatarFallback>
                        {(member.name || '?').charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>

                    <div className="min-w-0">
                      <p className="font-semibold text-foreground truncate">{member.name}</p>
                      <p className="text-xs text-foreground/50 truncate">{member.email}</p>
                    </div>
                  </div>

                  <div className="hidden md:flex items-center gap-6">
                    <div className="text-center">
                      <p className="text-xs text-foreground/60">Scans</p>
                      <p className="text-lg font-bold text-foreground">{member.scans}</p>
                    </div>

                    <div className="text-center">
                      <p className="text-xs text-foreground/60">Reviews</p>
                      <p className="text-lg font-bold text-foreground">{member.reviews}</p>
                    </div>

                    <div className="text-center">
                      <p className="text-xs text-foreground/60">Fixes</p>
                      <p className="text-lg font-bold text-green-500">{member.fixes}</p>
                    </div>

                    <div className="text-center">
                      <p className="text-xs text-foreground/60">Total</p>
                      <Badge className={`${qualityColor.bg} ${qualityColor.text} border-0`}>
                        {member.total}
                      </Badge>
                    </div>
                  </div>

                  <div className="md:hidden text-right">
                    <p className="text-sm font-bold text-foreground">{member.total}</p>
                    <p className="text-xs text-foreground/50">contributions</p>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-card/30 border border-border p-4 text-center">
          <p className="text-2xl font-bold text-yellow-500 flex justify-center gap-1">
            <Trophy className="w-6 h-6" />
          </p>
          <p className="text-xs text-foreground/60 mt-2">Team Leader</p>
          <p className="text-sm font-bold text-foreground truncate">{sorted[0]?.name || '—'}</p>
        </Card>

        <Card className="bg-card/30 border border-border p-4 text-center">
          <p className="text-2xl font-bold text-foreground flex justify-center">
            <Target className="w-6 h-6 text-blue-500" />
          </p>
          <p className="text-xs text-foreground/60 mt-2">Avg Team Quality</p>
          <p className="text-sm font-bold text-foreground">{teamAvgQuality}%</p>
        </Card>

        <Card className="bg-card/30 border border-border p-4 text-center">
          <p className="text-2xl font-bold text-green-500 flex justify-center">
            <Star className="w-6 h-6" />
          </p>
          <p className="text-xs text-foreground/60 mt-2">Total Bugs Fixed</p>
          <p className="text-sm font-bold text-foreground">{totalBugsFixed}</p>
        </Card>

        <Card className="bg-card/30 border border-border p-4 text-center">
          <p className="text-2xl font-bold text-orange-500 flex justify-center">
            <Flame className="w-6 h-6" />
          </p>
          <p className="text-xs text-foreground/60 mt-2">Top Contributor</p>
          <p className="text-sm font-bold text-foreground">{sorted[0]?.total || 0} pts</p>
        </Card>
      </div>

      <Card className="border border-purple-500/30 bg-linear-to-r from-purple-500/10 to-pink-500/10 p-4 space-y-3">
        <h4 className="font-semibold text-foreground">Team Achievements</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <div className="flex items-center gap-2 rounded bg-background/50 p-2">
            <Crosshair className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <span className="text-foreground">Quality goal</span>
          </div>
          <div className="flex items-center gap-2 rounded bg-background/50 p-2">
            <Bug className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
            <span className="text-foreground">Bug hunters</span>
          </div>
          <div className="flex items-center gap-2 rounded bg-background/50 p-2">
            <Lock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="text-foreground">Security first</span>
          </div>
          <div className="flex items-center gap-2 rounded bg-background/50 p-2">
            <Zap className="h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
            <span className="text-foreground">Quick fixers</span>
          </div>
        </div>
      </Card>
    </div>
  )
}