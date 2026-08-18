'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Loader2, ArrowRight, Search, Trophy, HelpCircle, Code2, Layers, TrendingUp, Brain, Binary, GitBranch, BarChart3 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { usePageGuard } from '@/lib/use-page-guard'
import { useProblemsViewModel, type ProblemSummary } from './use-problems-viewmodel'

const DIFFICULTY_TONE: Record<ProblemSummary['difficulty'], string> = {
  easy: 'text-primary border-primary/30 bg-primary/10',
  medium: 'text-amber-400 border-amber-400/30 bg-amber-400/10',
  hard: 'text-destructive border-destructive/40 bg-destructive/10',
}

const SKILL_CATEGORIES = [
  { key: '', label: 'All', icon: Layers },
  { key: 'Arrays', label: 'Arrays', icon: Layers },
  { key: 'Strings', label: 'Strings', icon: Code2 },
  { key: 'Algorithms', label: 'Algorithms', icon: TrendingUp },
  { key: 'Data Structures', label: 'Data Structures', icon: Binary },
  { key: 'Math', label: 'Math', icon: BarChart3 },
  { key: 'Dynamic Programming', label: 'DP', icon: Brain },
  { key: 'Graphs', label: 'Trees & Graphs', icon: GitBranch },
  { key: 'Sorting', label: 'Sorting', icon: BarChart3 },
]

export default function ProblemsListPage() {
  const gate = usePageGuard('user')
  const { loading, error, q, setQ, difficulty, setDifficulty, filtered } = useProblemsViewModel()
  const [topic, setTopic] = useState('')

  const final = (topic
    ? filtered.filter(p => (p.topics || []).some(t => t.toLowerCase() === topic.toLowerCase()))
    : filtered
  ).filter((p, idx, arr) => arr.findIndex(x => (x.id && x.id === p.id) || (x.slug && x.slug === p.slug)) === idx)

  const countByTopic = (key: string) => key ? filtered.filter(p => (p.topics || []).some(t => t.toLowerCase() === key.toLowerCase())).length : filtered.length

  if (!gate.ready) return null

  return (
    <div className="space-y-8">
      <div>
        <div className="inline-flex items-center gap-2 text-xs text-primary bg-primary/10 border border-primary/30 rounded-full px-3 py-1 mb-4">
          <Trophy className="h-3 w-3" />
          <span>Practice arena · 40+ languages · Real-time judging</span>
        </div>
        <div className="flex items-center gap-2">
          <h1 className="text-3xl font-bold tracking-tight">Solve problems</h1>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="right">
                <p className="text-xs max-w-[250px]">Real test cases, real judging, real submissions. Sharpen your skills then compete in Codeathons.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
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

      <div className="flex flex-wrap gap-2">
        {SKILL_CATEGORIES.map((cat) => {
          const active = topic === cat.key
          const count = countByTopic(cat.key)
          const Icon = cat.icon
          return (
            <button
              key={cat.key}
              onClick={() => setTopic(cat.key)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border transition ${
                active
                  ? 'bg-primary/10 text-primary border-primary/40'
                  : 'bg-card text-muted-foreground border-border hover:text-foreground hover:border-muted-foreground/30'
              }`}
            >
              <Icon className="h-3 w-3" />
              {cat.label}
              <span className={`${active ? 'text-primary/60' : 'text-muted-foreground/60'}`}>({count})</span>
            </button>
          )
        })}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-destructive">{error}</div>
      ) : final.length === 0 ? (
        <div className="rounded-lg border border-border bg-card/30 p-10 text-center text-muted-foreground">No problems match your filters.</div>
      ) : (
        <ul className="space-y-2">
          {final.map((p, i) => (
            <li key={p.id ? `${p.id}-${i}` : `prob-${i}`}>
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
                <div className="flex items-center shrink-0 gap-4">
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
