'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Code2, Database, FileCode2, GitBranch, Layers, ServerCog, Sparkles, Terminal, TrendingUp } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { useTour, autoPlayPageTour, type TourStep } from '@/components/tour/tour-context'
import { usePageGuard } from '@/lib/use-page-guard'
import { SkeletonCard } from '@/components/ui/skeleton-boneyard'
import { PageHeader, Panel, BentoGrid } from '@/components/app/page-kit'
import { SoftGlow } from '@/components/visuals'
import { EmptyState } from '@/components/ui/empty-state'
import { useT } from '@/lib/i18n/client'

const TRACK_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  python: FileCode2,
  javascript: Code2,
  typescript: Code2,
  dsa: Layers,
  react: Sparkles,
  node: ServerCog,
  sql: Database,
  java: Terminal,
  cpp: GitBranch,
  system_design: TrendingUp,
}

interface TrackDef {
  id: string
  name: string
  description: string
  topics: string[]
  tone: string
  badge?: string
}

export default function TracksPage() {
  const { t: tr } = useT()
  const gate = usePageGuard('user')
  const { startTour, setTourSeen } = useTour()

  const [tracks, setTracks] = useState<TrackDef[]>([])
  const [problemTopics, setProblemTopics] = useState<string[][]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    setLoading(true)
    setLoadError(false)
    Promise.all([
      fetch('/api/tracks').then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json() }),
      fetch('/api/problems', { cache: 'no-store' }).then(r => r.json()),
    ]).then(([tracksJson, problemsJson]) => {
      if (tracksJson.data) setTracks(tracksJson.data)
      const all: { topics?: string[] }[] = problemsJson.data || []
      setProblemTopics(all.map(p => (p.topics || []).map(t => t.toLowerCase())))
    }).catch(() => setLoadError(true)).finally(() => setLoading(false))
  }, [reloadKey])

  // Initialize tour on first visit
  useEffect(() => {
    if (gate.ready) {
      const tracksTour: TourStep[] = [
        {
          target: '[data-tour="tracks-header"]',
          title: tr('practice.techStackTracks'),
          description: tr('practice.curatedProblemTracksByStackForc2a'),
          position: 'bottom',
        },
        {
          target: '[data-tour="tracks-grid"]',
          title: tr('practice.practiseATrack'),
          description: tr('practice.tipClickAnyTrackCardTofc0'),
          position: 'bottom',
        },
      ]
      autoPlayPageTour('tracks', tracksTour)}
  }, [gate.ready, startTour, setTourSeen])

  // Problems tagged with any of the track's topics (each problem counted once),
  // matching what the Practice link filters to.
  function trackProblemCount(track: TrackDef): number {
    const wanted = new Set(track.topics.map(t => (t || '').toLowerCase()))
    return problemTopics.filter(ts => ts.some(t => wanted.has(t))).length
  }

  if (!gate.ready) return null

  return (
    <div className="space-y-6">
      <div data-tour="tracks-header">
        <div className="relative isolate">
          <SoftGlow className="-inset-x-2 -top-4 rounded-3xl" />
          <PageHeader
            illustration="courses"
            title={tr('practice.techStackTracks')}
            description={tr('practice.pickAStackAndWorkThroughbff')}
            icon={<Layers />}
            className="mb-0"
          />
        </div>
      </div>

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : loadError && tracks.length === 0 ? (
        <Panel className="p-4">
          <EmptyState
            illustration="error"
            title={tr('practice.couldntLoadTracks')}
            description={tr('practice.checkYourConnectionAndTryAgain')}
            actionLabel={tr('common.tryAgain')}
            onAction={() => setReloadKey(k => k + 1)}
          />
        </Panel>
      ) : tracks.length === 0 ? (
        <Panel className="p-4">
          <EmptyState illustration="courses"
            title={tr('practice.noTracksYet')}
            description={tr('practice.tracksWillAppearHereSoonUntil128')}
            actionLabel={tr('practice.goToProblems')}
            actionHref="/dashboard/problems"
          />
        </Panel>
      ) : (
        <div data-tour="tracks-grid">
        <BentoGrid className="lg:grid-cols-3">
          {tracks.map((t, i) => {
            const count = trackProblemCount(t)
            const Icon = TRACK_ICONS[t.id] || Code2
            return (
              <Link key={t.id} href={`/dashboard/problems?topics=${encodeURIComponent(t.topics.join(','))}`} className={cn('group rounded-3xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary', i === 0 && 'sm:col-span-2')}>
                <Panel interactive className="p-5 h-full flex flex-col">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="text-base font-semibold text-foreground flex-1">{t.name}</h3>
                    {t.badge && (
                      <span className="rounded-full bg-primary/10 text-primary text-[11px] font-medium px-2 py-0.5">{t.badge}</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed mb-3">{t.description}</p>
                  <div className="flex flex-wrap gap-1 mb-3">
                    {t.topics.map((tp) => (
                      <span key={tp} className="rounded-full border border-border/70 bg-muted/40 text-[11px] text-muted-foreground px-2 py-0.5">{tp}</span>
                    ))}
                  </div>
                  <div className="mt-auto flex items-center justify-between text-xs">
                    <span className="text-muted-foreground tabular-nums">{count > 0 ? tr('practice.countProblems', { count }) : tr('practice.moreProblemsComing')}</span>
                    <span className="inline-flex items-center gap-1 font-medium text-primary transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:group-hover:translate-x-0">{tr('practice.practice')}{' '}<ArrowRight className="h-3 w-3" />
                    </span>
                  </div>
                </Panel>
              </Link>
            )
          })}
        </BentoGrid>
        </div>
      )}
    </div>
  )
}

