'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { UserAvatar } from '@/components/ui/user-avatar'
import { Loader2Icon } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'
import { Trophy, Flame, Star, Target, Medal, Award, Hash } from 'lucide-react'

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
  const [loadError, setLoadError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (members) {
      setTeamMembers(members)
      return
    }
    setLoading(true)
    setLoadError(false)
    fetch('/api/admin/teams/activity?weeks=12', { credentials: 'include' })
      .then(async (r) => {
        const json = await r.json().catch(() => null)
        if (!r.ok || !json) throw new Error('load failed')
        if (Array.isArray(json.userStats)) setTeamMembers(json.userStats)
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false))
  }, [members, reloadKey])

  const defaultMembers: TeamMember[] = teamMembers.length > 0 ? teamMembers : []

  const sorted = [...defaultMembers].sort((a, b) => b.total - a.total)

  const getMedalColor = (position: number) => {
    if (position === 0) return 'text-yellow-500'
    if (position === 1) return 'text-gray-400'
    if (position === 2) return 'text-orange-600'
    return 'text-muted-foreground'
  }

  const totalBugsFixed = sorted.reduce((sum, m) => sum + m.fixes, 0)
  const totalScans = sorted.reduce((sum, m) => sum + m.scans, 0)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="h-6 w-6" />
        <span className="ml-2 text-sm text-muted-foreground">Loading leaderboard…</span>
      </div>
    )
  }

  if (loadError) {
    return (
      <EmptyState
        compact
        illustration="error"
        title="Couldn't load the leaderboard"
        description="Check your connection and try again."
        actionLabel="Try again"
        onAction={() => setReloadKey((k) => k + 1)}
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <Trophy className="w-5 h-5" />
          Team leaderboard
        </h3>
        <p className="text-sm text-muted-foreground">
          {sorted.length > 0
            ? `${sorted.length} team members ranked by contribution`
            : 'No team members found — connect GitHub to see team activity'}
        </p>
      </div>

      {sorted.length === 0 ? (
        <EmptyState
          illustration="leaderboard"
          title="No team activity yet"
          description="Connect GitHub to see scans, reviews and fixes for your team."
        />
      ) : (
        <div className="space-y-3">
          {sorted.map((member, index) => {
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
                    <UserAvatar seed={member.name} name={member.name} className="w-10 h-10 border-2 border-border" />

                    <div className="min-w-0">
                      <p className="font-semibold text-foreground truncate">{member.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                    </div>
                  </div>

                  <div className="hidden md:flex items-center gap-6">
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">Scans</p>
                      <p className="text-lg font-bold text-foreground">{member.scans}</p>
                    </div>

                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">Reviews</p>
                      <p className="text-lg font-bold text-foreground">{member.reviews}</p>
                    </div>

                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">Fixes</p>
                      <p className="text-lg font-bold text-green-500">{member.fixes}</p>
                    </div>

                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">Total</p>
                      <Badge variant="secondary" className="border-0 tabular-nums">
                        {member.total}
                      </Badge>
                    </div>
                  </div>

                  <div className="md:hidden text-right">
                    <p className="text-sm font-bold text-foreground">{member.total}</p>
                    <p className="text-xs text-muted-foreground">contributions</p>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold text-amber-500 flex justify-center gap-1">
            <Trophy className="w-6 h-6" />
          </p>
          <p className="text-xs text-muted-foreground mt-2">Team leader</p>
          <p className="text-sm font-bold text-foreground truncate">{sorted[0]?.name || '—'}</p>
        </Card>

        <Card className="p-4 text-center">
          <p className="text-2xl font-bold text-foreground flex justify-center">
            <Target className="w-6 h-6 text-primary" />
          </p>
          <p className="text-xs text-muted-foreground mt-2">Total scans</p>
          <p className="text-sm font-bold text-foreground">{totalScans}</p>
        </Card>

        <Card className="p-4 text-center">
          <p className="text-2xl font-bold text-green-500 flex justify-center">
            <Star className="w-6 h-6" />
          </p>
          <p className="text-xs text-muted-foreground mt-2">Total bugs fixed</p>
          <p className="text-sm font-bold text-foreground">{totalBugsFixed}</p>
        </Card>

        <Card className="p-4 text-center">
          <p className="text-2xl font-bold text-orange-500 flex justify-center">
            <Flame className="w-6 h-6" />
          </p>
          <p className="text-xs text-muted-foreground mt-2">Top contributor</p>
          <p className="text-sm font-bold text-foreground">{sorted[0]?.total || 0} pts</p>
        </Card>
      </div>

    </div>
  )
}