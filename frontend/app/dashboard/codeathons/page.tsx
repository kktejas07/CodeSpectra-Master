'use client'
import { formatDate } from '@/lib/format-datetime'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Trophy, Users, Clock, HelpCircle, Calendar, Target, BookOpen, ChevronRight } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { SkeletonCard } from '@/components/ui/skeleton-boneyard'
import { usePageGuard } from '@/lib/use-page-guard'
import { useTour, autoPlayPageTour, type TourStep } from '@/components/tour/tour-context'
import { PageHeader, Panel } from '@/components/app/page-kit'
import { SoftGlow } from '@/components/visuals'
import { EmptyState } from '@/components/ui/empty-state'

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
    <div className="flex items-center gap-1.5 text-xs tabular-nums">
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
  const { startTour, setTourSeen } = useTour()
  const [codeathons, setCodeathons] = useState<Codeathon[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [filter, setFilter] = useState({ status: '', difficulty: '' })

  useEffect(() => {
    setLoadError(false)
    fetch('/api/codeathons')
      .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json() })
      .then(json => { if (json.data) setCodeathons(json.data) })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false))
  }, [reloadKey])

  // Initialize tour on first visit
  useEffect(() => {
    if (gate.ready) {
      const codeathonsTour: TourStep[] = [
        {
          target: '[data-tour="codeathons-header"]',
          title: 'Codeathons',
          description: 'Compete in coding competitions, solve challenges, and win prizes.',
          position: 'bottom',
        },
        {
          target: '[data-tour="codeathons-filters"]',
          title: 'Filter codeathons',
          description: 'Filter competitions by status and difficulty level.',
          position: 'bottom',
        },
        {
          target: '[data-tour="codeathons-grid"]',
          title: 'Codeathon list',
          description: 'Browse upcoming and ongoing coding competitions.',
          position: 'bottom',
        },
      ]
      autoPlayPageTour('codeathons', codeathonsTour)}
  }, [gate.ready, startTour, setTourSeen])

  const filtered = codeathons.filter(c =>
    (!filter.status || c.status === filter.status) &&
    (!filter.difficulty || c.difficulty === filter.difficulty)
  )

  const getStatusColor = (s: string) => {
    if (s === 'active' || s === 'ongoing') return 'bg-green-500/10 text-green-700 border-green-500/30 dark:text-green-400'
    if (s === 'upcoming') return 'bg-primary/10 text-primary border-primary/30'
    return 'bg-muted text-muted-foreground border-border'
  }

  const getDifficultyColor = (d: string) => {
    if (d === 'Hard') return 'bg-red-500/10 text-red-700 border-red-500/30 dark:text-red-400'
    if (d === 'Easy') return 'bg-green-500/10 text-green-700 border-green-500/30 dark:text-green-400'
    if (d === 'Mixed') return 'bg-primary/10 text-primary border-primary/30'
    return 'bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400'
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
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="h-8 w-32 bg-muted/60 rounded animate-pulse" />
        <div className="h-4 w-64 bg-muted/40 rounded animate-pulse" />
      </div>
      <div className="flex gap-2">
        <div className="h-9 w-32 bg-muted/50 rounded animate-pulse" />
        <div className="h-9 w-32 bg-muted/50 rounded animate-pulse" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
    </div>
  )

  if (!gate.ready) return null

  return (
    <div className="space-y-6">
      <div data-tour="codeathons-header">
        <div className="relative isolate">
          <SoftGlow className="-inset-x-2 -top-4 rounded-3xl" />
          <PageHeader
            illustration="hackathon"
            className="mb-0"
            icon={<Trophy />}
            description="Join live coding competitions and prove your skills."
            title={<span className="inline-flex items-center gap-2">Codeathons
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-4 w-4 cursor-help text-muted-foreground" aria-label="About codeathons" />
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p className="text-xs max-w-62.5">Compete in coding competitions, solve challenges, and win prizes</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider></span>}
          />
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2" data-tour="codeathons-filters">
        <select
          value={filter.status}
          onChange={e => setFilter(f => ({ ...f, status: e.target.value }))}
          aria-label="Filter by status"
          className="h-10 rounded-xl border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-primary"
        >
          <option value="">All statuses</option>
          <option value="upcoming">Upcoming</option>
          <option value="active">Active</option>
          <option value="ended">Ended</option>
        </select>
        <select
          value={filter.difficulty}
          onChange={e => setFilter(f => ({ ...f, difficulty: e.target.value }))}
          aria-label="Filter by difficulty"
          className="h-10 rounded-xl border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-primary"
        >
          <option value="">All levels</option>
          <option value="Easy">Easy</option>
          <option value="Medium">Medium</option>
          <option value="Hard">Hard</option>
          <option value="Mixed">Mixed</option>
        </select>
      </div>

      {loadError && codeathons.length === 0 ? (
        <EmptyState
          illustration="error"
          title="Couldn't load codeathons"
          description="Check your connection and try again."
          actionLabel="Try again"
          onAction={() => setReloadKey(k => k + 1)}
        />
      ) : codeathons.length === 0 ? (
        <EmptyState illustration="hackathon"
          title="No codeathons yet"
          description="Upcoming competitions will show up here once they're announced. Practise problems in the meantime."
          actionLabel="Practise problems"
          actionHref="/dashboard/problems"
        />
      ) : filtered.length === 0 ? (
        <EmptyState variant="search" title="No codeathons match" description="Try a different status or level." />
      ) : (
        <div className="cs-stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-3 lg:gap-5" data-tour="codeathons-grid">
          {filtered.map(h => (
            <Card key={h.id} className="flex flex-col gap-0 rounded-3xl p-6 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_18px_40px_-20px_rgba(47,91,231,0.35)] motion-reduce:hover:translate-y-0">
              {/* Header */}
              <div className="mb-3 flex items-start justify-between gap-2">
                <h3 className="text-base font-semibold text-foreground line-clamp-1">{h.title}</h3>
                <div className="flex gap-1.5 shrink-0">
                  <Badge variant="outline" className={getStatusColor(isActive(h) ? 'active' : isUpcoming(h) ? 'upcoming' : h.status)}>
                    {isActive(h) ? 'Live' : isUpcoming(h) ? 'Upcoming' : <span className="capitalize">{h.status}</span>}
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
                    <Clock className="h-3.5 w-3.5 text-primary" />
                    <span className="text-muted-foreground">Starts in</span>
                    <CountdownTimer target={h.startDate} />
                  </div>
                ) : (
                  <div className="flex items-center gap-3 text-xs tabular-nums text-muted-foreground">
                    <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{h.startDate ? formatDate(h.startDate) : 'TBA'}</span>
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
