'use client'
import { formatDate } from '@/lib/format-datetime'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import {
  Trophy, Target, Zap, Swords, Terminal, Braces, Coffee, Database, Atom, Cpu, Flame,
} from 'lucide-react'
import { useT } from '@/lib/i18n/client'

interface SkillBadge {
  id: string
  name: string
  icon: string
  description: string
  earned: boolean
  progress: number
  total: number
  earned_at: string | null
}

const ICON_MAP: Record<string, React.ComponentType<any>> = {
  Trophy, Target, Zap, Swords, Terminal, Braces, Coffee, Database, Atom, Cpu, Flame,
}

function formatEarnedDate(dateStr: string | null): string {
  if (!dateStr) return 'Not earned yet'
  const d = new Date(dateStr)
  return `Earned ${formatDate(d, undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
}

export function SkillBadges() {
  const { t } = useT()
  const [badges, setBadges] = useState<SkillBadge[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/user/skill-badges')
      .then(r => r.json())
      .then(json => {
        if (json.badges) setBadges(json.badges)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <Card className="rounded-3xl border-border/70 p-6">
        <div className="h-6 w-32 animate-pulse rounded bg-muted" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mt-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded bg-muted" />
          ))}
        </div>
      </Card>
    )
  }

  if (badges.length === 0) return null

  return (
    <Card className="rounded-3xl border-border/70 p-6">
      <h2 className="text-lg font-semibold text-foreground mb-4">{t('dash.skillBadges')}</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {badges.map(badge => {
          const Icon = ICON_MAP[badge.icon] || Trophy
          const pct = Math.round((badge.progress / badge.total) * 100)
          return (
            <div
              key={badge.id}
              className={`flex flex-col items-center p-4 rounded-2xl border border-border/60 text-center ${
                badge.earned ? 'border-primary/30 bg-primary/5' : 'opacity-60'
              }`}
            >
              <div className={`flex h-14 w-14 items-center justify-center rounded-full ${
                badge.earned ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
              }`}>
                <Icon className="h-7 w-7" />
              </div>
              <h3 className="mt-3 text-sm font-semibold text-foreground">{badge.name}</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">{badge.description}</p>
              <div className="w-full mt-3">
                <div className="h-1.5 w-full rounded-full bg-muted">
                  <div
                    className="h-1.5 rounded-full bg-primary transition-all"
                    style={{ width: `${pct || 0}%` }}
                  />
                </div>
                <p className="text-[11px] tabular-nums text-muted-foreground mt-1">{badge.progress}/{badge.total}</p>
              </div>
              <p className={`text-[10px] mt-1 ${badge.earned ? 'text-primary' : 'text-muted-foreground'}`}>
                {formatEarnedDate(badge.earned_at)}
              </p>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
