'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Trophy, Users, Clock, HelpCircle, Calendar, Target, BookOpen, ChevronRight } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { usePageGuard } from '@/lib/use-page-guard'

interface Problem {
  id: string
  title: string
  difficulty: 'Easy' | 'Medium' | 'Hard'
  points: number
}

interface Codeathon {
  id: string
  title: string
  description: string
  difficulty: string
  topics: string[]
  startDate: string
  endDate: string
  totalPrize: string
  prizePool: string
  participants: number
  maxParticipants: number
  status: string
  registered?: boolean
  problems?: Problem[]
}

function CountdownTimer({ target }: { target: string }) {
  const [time, setTime] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 })

  useEffect(() => {
    const calc = () => {
      const diff = new Date(target).getTime() - Date.now()
      if (diff <= 0) { setTime({ days: 0, hours: 0, minutes: 0, seconds: 0 }); return }
      setTime({
        days: Math.floor(diff / 86400000),
        hours: Math.floor((diff % 86400000) / 3600000),
        minutes: Math.floor((diff % 3600000) / 60000),
        seconds: Math.floor((diff % 60000) / 1000),
      })
    }
    calc()
    const interval = setInterval(calc, 1000)
    return () => clearInterval(interval)
  }, [target])

  if (time.days === 0 && time.hours === 0 && time.minutes === 0 && time.seconds === 0) return null

  return (
    <div className="flex items-center gap-1.5 text-xs">
      {time.days > 0 && <span className="font-mono font-semibold">{time.days}d</span>}
      <span className="font-mono font-semibold">{String(time.hours).padStart(2, '0')}</span>
      <span className="text-muted-foreground">:</span>
      <span className="font-mono font-semibold">{String(time.minutes).padStart(2, '0')}</span>
      <span className="text-muted-foreground">:</span>
      <span className="font-mono font-semibold">{String(time.seconds).padStart(2, '0')}</span>
    </div>
  )
}

export default function CodeathonsPage() {
  const gate = usePageGuard('user')
  const router = useRouter()
  const [codeathons, setCodeathons] = useState<Codeathon[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState({ status: '', difficulty: '' })

  useEffect(() => {
    fetch('/api/codeathons')
      .then(r => r.json())
      .then(json => { if (json.data) setCodeathons(json.data) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const filtered = codeathons.filter(c =>
    (!filter.status || c.status === filter.status) &&
    (!filter.difficulty || c.difficulty === filter.difficulty)
  )

  const getStatusColor = (s: string) => {
    if (s === 'active' || s === 'ongoing') return 'bg-green-500/20 text-green-700 border-green-500/30'
    if (s === 'upcoming') return 'bg-blue-500/20 text-blue-700 border-blue-500/30'
    return 'bg-gray-500/20 text-gray-700 border-gray-500/30'
  }

  const getDifficultyColor = (d: string) => {
    if (d === 'Hard') return 'bg-red-500/20 text-red-700 border-red-500/30'
    if (d === 'Easy') return 'bg-green-500/20 text-green-700 border-green-500/30'
    if (d === 'Mixed') return 'bg-purple-500/20 text-purple-700 border-purple-500/30'
    return 'bg-yellow-500/20 text-yellow-700 border-yellow-500/30'
  }

  const isActive = (c: Codeathon) => {
    const now = Date.now()
    const start = new Date(c.startDate).getTime()
    const end = new Date(c.endDate).getTime()
    return now >= start && now <= end
  }

  const isUpcoming = (c: Codeathon) => {
    return new Date(c.startDate).getTime() > Date.now()
  }

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      <p className="text-sm text-muted-foreground">Loading codeathons...</p>
    </div>
  )

  if (!gate.ready) return null

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-3xl font-bold">Codeathons</h1>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="right">
                <p className="text-xs max-w-62.5">Compete in coding competitions, solve challenges, and win prizes</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <p className="text-sm text-muted-foreground mt-1">Join live coding competitions and prove your skills</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <select
          value={filter.status}
          onChange={e => setFilter(f => ({ ...f, status: e.target.value }))}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All Status</option>
          <option value="upcoming">Upcoming</option>
          <option value="active">Active</option>
          <option value="ended">Ended</option>
        </select>
        <select
          value={filter.difficulty}
          onChange={e => setFilter(f => ({ ...f, difficulty: e.target.value }))}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All Levels</option>
          <option value="Easy">Easy</option>
          <option value="Medium">Medium</option>
          <option value="Hard">Hard</option>
          <option value="Mixed">Mixed</option>
        </select>
      </div>

      {codeathons.length === 0 ? (
        <Card className="border-border/60 p-10 text-center">
          <Trophy className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-muted-foreground">No codeathons available yet.</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Check back soon for upcoming competitions</p>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="border-border/60 p-10 text-center">
          <p className="text-muted-foreground">No codeathons match your filters.</p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map(h => (
            <Card key={h.id} className="border-border/60 p-5 hover:border-primary/30 transition-colors flex flex-col">
              {/* Header */}
              <div className="mb-3 flex items-start justify-between gap-2">
                <h3 className="font-semibold text-foreground line-clamp-1">{h.title}</h3>
                <div className="flex gap-1.5 shrink-0">
                  <Badge variant="outline" className={getStatusColor(isActive(h) ? 'active' : isUpcoming(h) ? 'upcoming' : h.status)}>
                    {isActive(h) ? 'Live' : isUpcoming(h) ? 'Upcoming' : h.status}
                  </Badge>
                </div>
              </div>

              {/* Description */}
              {h.description && (
                <p className="mb-3 line-clamp-2 text-xs text-muted-foreground">{h.description}</p>
              )}

              {/* Topics */}
              {h.topics && h.topics.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {h.topics.slice(0, 4).map(t => (
                    <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
                  ))}
                  {h.topics.length > 4 && <Badge variant="secondary" className="text-[10px]">+{h.topics.length - 4}</Badge>}
                </div>
              )}

              {/* Stats */}
              <div className="mb-3 flex items-center gap-3 text-xs text-muted-foreground">
                {h.difficulty && (
                  <Badge variant="outline" className={`text-[10px] ${getDifficultyColor(h.difficulty)}`}>
                    {h.difficulty}
                  </Badge>
                )}
                {h.problems && h.problems.length > 0 && (
                  <span className="flex items-center gap-1"><BookOpen className="h-3 w-3" />{h.problems.length} problems</span>
                )}
              </div>

              {/* Countdown or dates */}
              <div className="mb-3">
                {isUpcoming(h) && h.startDate ? (
                  <div className="flex items-center gap-2 text-xs">
                    <Clock className="h-3.5 w-3.5 text-blue-500" />
                    <span className="text-muted-foreground">Starts in</span>
                    <CountdownTimer target={h.startDate} />
                  </div>
                ) : (
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{h.startDate ? new Date(h.startDate).toLocaleDateString() : 'TBA'}</span>
                    <span className="flex items-center gap-1"><Users className="h-3 w-3" />{h.participants || 0}{h.maxParticipants ? `/${h.maxParticipants}` : ''}</span>
                  </div>
                )}
              </div>

              {/* Prize */}
              {(h.prizePool || h.totalPrize) && (
                <div className="mb-4 flex items-center gap-1.5 text-xs">
                  <Trophy className="h-3.5 w-3.5 text-amber-500" />
                  <span className="font-semibold text-foreground">{h.prizePool || h.totalPrize}</span>
                </div>
              )}

              {/* Action */}
              <div className="mt-auto pt-2">
                <Button
                  variant={h.registered ? 'default' : 'outline'}
                  size="sm"
                  className="w-full"
                  onClick={() => router.push(`/dashboard/codeathons/${h.id}`)}
                >
                  {h.registered ? 'Open' : 'Register'}
                  <ChevronRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
