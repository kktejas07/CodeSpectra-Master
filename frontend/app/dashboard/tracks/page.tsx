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

interface TrackDef {
  id: string
  name: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  topics: string[]
  tone: string
  badge?: string
}

const TRACKS: TrackDef[] = [
  {
    id: 'python',
    name: 'Python',
    description: 'Core syntax, data structures, OOP, decorators, async, pytest.',
    icon: FileCode2,
    topics: ['Strings', 'Lists', 'Dicts', 'OOP', 'Iterators', 'Asyncio'],
    tone: 'border-emerald-500/30 bg-emerald-500/5',
    badge: 'Most popular',
  },
  {
    id: 'javascript',
    name: 'JavaScript / TypeScript',
    description: 'ES2024+, closures, async/await, Node.js patterns, types.',
    icon: Code2,
    topics: ['Closures', 'Promises', 'Map/Set', 'TS generics', 'Event loop'],
    tone: 'border-amber-500/30 bg-amber-500/5',
  },
  {
    id: 'dsa',
    name: 'DSA — Data Structures & Algorithms',
    description: 'Arrays, Trees, Graphs, DP, Greedy, Two-pointer, Tries.',
    icon: Layers,
    topics: ['Arrays', 'Trees', 'Graphs', 'DP', 'Greedy', 'Bit manipulation'],
    tone: 'border-primary/30 bg-primary/5',
    badge: 'Interview core',
  },
  {
    id: 'react',
    name: 'React',
    description: 'Hooks, Suspense, RSC, state management, performance.',
    icon: Sparkles,
    topics: ['Hooks', 'Context', 'RSC', 'Forms', 'Performance'],
    tone: 'border-cyan-500/30 bg-cyan-500/5',
  },
  {
    id: 'node',
    name: 'Node.js & Backend',
    description: 'Express/Fastify, streams, auth, queues, observability.',
    icon: ServerCog,
    topics: ['HTTP', 'Streams', 'Auth', 'Queues', 'Caching'],
    tone: 'border-green-500/30 bg-green-500/5',
  },
  {
    id: 'sql',
    name: 'SQL',
    description: 'Joins, window functions, query plans, optimization.',
    icon: Database,
    topics: ['SELECT', 'JOINs', 'Window fns', 'CTEs', 'Indexes'],
    tone: 'border-fuchsia-500/30 bg-fuchsia-500/5',
  },
  {
    id: 'java',
    name: 'Java',
    description: 'Collections, streams, concurrency, JVM tuning, Spring.',
    icon: Terminal,
    topics: ['Collections', 'Streams', 'Concurrency', 'JVM', 'Generics'],
    tone: 'border-orange-500/30 bg-orange-500/5',
  },
  {
    id: 'cpp',
    name: 'C++',
    description: 'STL, move semantics, templates, memory, performance.',
    icon: GitBranch,
    topics: ['STL', 'Templates', 'Move semantics', 'Smart pointers', 'CRTP'],
    tone: 'border-rose-500/30 bg-rose-500/5',
  },
  {
    id: 'system_design',
    name: 'System Design',
    description: 'Scalability, caching, sharding, queues, consistency, design patterns.',
    icon: TrendingUp,
    topics: ['Sharding', 'Caching', 'Queues', 'Consistency', 'Rate limits'],
    tone: 'border-indigo-500/30 bg-indigo-500/5',
    badge: 'Senior+',
  },
]

interface ProblemCount {
  topic: string
  count: number
}

export default function TracksPage() {
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/problems', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        const all: { topics?: string[] }[] = j.data || []
        const c: Record<string, number> = {}
        for (const p of all) {
          for (const t of p.topics || []) {
            const key = t.toLowerCase()
            c[key] = (c[key] || 0) + 1
          }
        }
        setCounts(c)
      })
      .catch(() => null)
      .finally(() => setLoading(false))
  }, [])

  function trackProblemCount(track: TrackDef): number {
    let n = 0
    for (const topic of track.topics) {
      n += counts[topic.toLowerCase()] || 0
    }
    return n
  }

  return (
    <div className="space-y-6" data-testid="tracks-page">
      <div>
        <h1 className="text-3xl font-bold">Tech-stack tracks</h1>
        <p className="text-sm text-muted-foreground">
          Pick a stack and grind through curated problems. Each track surfaces matching topics from
          the live problem catalog.
        </p>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading catalog…
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {TRACKS.map((t) => {
          const count = trackProblemCount(t)
          return (
            <Link
              key={t.id}
              href={`/problems?topic=${encodeURIComponent(t.topics[0])}`}
              className="group"
              data-testid={`track-${t.id}`}
            >
              <Card
                className={cn(
                  'p-5 h-full transition border-border/60 hover:border-primary/40 hover:bg-card/70',
                  t.tone,
                )}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-background/60 text-primary">
                    <t.icon className="h-4 w-4" />
                  </div>
                  <h3 className="font-semibold flex-1">{t.name}</h3>
                  {t.badge && (
                    <span className="rounded-full bg-primary/15 text-primary text-[10px] px-2 py-0.5 uppercase tracking-wide">
                      {t.badge}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                  {t.description}
                </p>
                <div className="flex flex-wrap gap-1 mb-3">
                  {t.topics.map((tp) => (
                    <span
                      key={tp}
                      className="rounded border border-border/60 bg-background/40 text-[10px] px-1.5 py-0.5"
                    >
                      {tp}
                    </span>
                  ))}
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    {count > 0 ? `${count} problems` : 'Catalog growing'}
                  </span>
                  <span className="inline-flex items-center gap-1 text-primary group-hover:translate-x-0.5 transition">
                    Practice <ArrowRight className="h-3 w-3" />
                  </span>
                </div>
              </Card>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
