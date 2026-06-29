'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, ArrowRight, Search, Code2, Trophy } from 'lucide-react'
import { Input } from '@/components/ui/input'

interface ProblemSummary {
  id: string
  slug: string
  title: string
  difficulty: 'easy' | 'medium' | 'hard'
  topics: string[]
}

const DIFFICULTY_TONE: Record<ProblemSummary['difficulty'], string> = {
  easy: 'text-primary border-primary/30 bg-primary/10',
  medium: 'text-amber-400 border-amber-400/30 bg-amber-400/10',
  hard: 'text-destructive border-destructive/40 bg-destructive/10',
}

export default function ProblemsListPage() {
  const [problems, setProblems] = useState<ProblemSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [difficulty, setDifficulty] = useState<string>('all')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (difficulty !== 'all') params.set('difficulty', difficulty)
      if (q) params.set('q', q)
      const res = await fetch(`/api/problems?${params.toString()}`, { cache: 'no-store' })
      const json = (await res.json()) as { data?: ProblemSummary[]; error?: string }
      if (!res.ok) throw new Error(json.error || 'Failed to load problems')
      setProblems(json.data || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [difficulty, q])

  useEffect(() => { void load() }, [load])

  const filtered = problems.filter((p) => {
    if (!q) return true
    const title = p.title || ''
    return title.toLowerCase().includes(q.toLowerCase())
  })

  return (
    <div className="space-y-8">
      <div>
        <div className="inline-flex items-center gap-2 text-xs text-primary bg-primary/10 border border-primary/30 rounded-full px-3 py-1 mb-4">
          <Trophy className="h-3 w-3" />
          <span>Practice arena · 40+ languages · Real-time judging</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Solve problems</h1>
        <p className="text-muted-foreground mt-2">Real test cases, real judging, real submissions. Sharpen your skills then compete in Codeathons.</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search problems..." className="pl-9 h-10" />
        </div>
        <div className="flex gap-2">
          {(['all', 'easy', 'medium', 'hard'] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDifficulty(d)}
              className={`px-3 h-10 rounded-md border text-sm capitalize transition ${
                difficulty === d ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-destructive">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-border bg-card/30 p-10 text-center text-muted-foreground">No problems match your filters.</div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((p, i) => (
            <li key={p.id}>
              <Link
                href={`/dashboard/problems/${p.slug || p.id}`}
                className="group flex items-center justify-between rounded-lg border border-border bg-card/40 hover:bg-card hover:border-primary/40 transition px-5 py-4"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <span className="text-xs font-mono text-muted-foreground w-8">{String(i + 1).padStart(2, '0')}</span>
                  <div className="min-w-0">
                    <div className="font-medium truncate">{p.title || p.slug}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-2">
                      {(p.topics || []).map((t) => (
                        <span key={t} className="rounded bg-muted px-1.5 py-0.5">{t}</span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded border capitalize ${DIFFICULTY_TONE[p.difficulty] || ''}`}>{p.difficulty}</span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-transform" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
