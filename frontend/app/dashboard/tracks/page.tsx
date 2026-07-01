'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  Code2,
  Database,
  FileCode2,
  GitBranch,
  Layers,
  Loader2,
  ServerCog,
  Sparkles,
  Terminal,
  TrendingUp,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

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
  const [tracks, setTracks] = useState<TrackDef[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/tracks').then(r => r.json()),
      fetch('/api/problems', { cache: 'no-store' }).then(r => r.json()),
    ]).then(([tracksJson, problemsJson]) => {
      if (tracksJson.data) setTracks(tracksJson.data)
      const all: { topics?: string[] }[] = problemsJson.data || []
      const c: Record<string, number> = {}
      for (const p of all) {
        for (const t of p.topics || []) {
          c[t.toLowerCase()] = (c[t.toLowerCase()] || 0) + 1
        }
      }
      setCounts(c)
    }).catch(() => null).finally(() => setLoading(false))
  }, [])

  function trackProblemCount(track: TrackDef): number {
    let n = 0
    for (const topic of track.topics) {
      n += counts[(topic || '').toLowerCase()] || 0
    }
    return n
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Tech-stack tracks</h1>
        <p className="text-sm text-muted-foreground">Pick a stack and grind through curated problems.</p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-20 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading catalog…
        </div>
      ) : tracks.length === 0 ? (
        <Card className="border-border/60 p-10 text-center">
          <TrendingUp className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-muted-foreground">No tracks available yet.</p>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tracks.map((t) => {
            const count = trackProblemCount(t)
            const Icon = TRACK_ICONS[t.id] || Code2
            return (
              <Link key={t.id} href={`/dashboard/problems?topic=${encodeURIComponent(t.topics[0] || '')}`} className="group">
                <Card className={cn('p-5 h-full transition border-border/60 hover:border-primary/40 hover:bg-card/70', t.tone)}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-background/60 text-primary">
                      <Icon className="h-4 w-4" />
                    </div>
                    <h3 className="font-semibold flex-1">{t.name}</h3>
                    {t.badge && (
                      <span className="rounded-full bg-primary/15 text-primary text-[10px] px-2 py-0.5 uppercase tracking-wide">{t.badge}</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed mb-3">{t.description}</p>
                  <div className="flex flex-wrap gap-1 mb-3">
                    {t.topics.map((tp) => (
                      <span key={tp} className="rounded border border-border/60 bg-background/40 text-[10px] px-1.5 py-0.5">{tp}</span>
                    ))}
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{count > 0 ? `${count} problems` : 'Catalog growing'}</span>
                    <span className="inline-flex items-center gap-1 text-primary group-hover:translate-x-0.5 transition">
                      Practice <ArrowRight className="h-3 w-3" />
                    </span>
                  </div>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
