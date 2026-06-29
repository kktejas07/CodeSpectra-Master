'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Trophy, Code, Loader } from 'lucide-react'

interface ArenaChallenge {
  id: string
  title: string
  shortDescription?: string
  description?: string
  difficulty: string
  category?: string
  points: number
  solved: number
  attempts: number
}

const difficultyColors: Record<string, string> = {
  easy: 'text-green-600 bg-green-500/10 border-green-500/30',
  medium: 'text-amber-600 bg-amber-500/10 border-amber-500/30',
  hard: 'text-red-600 bg-red-500/10 border-red-500/30',
}

export default function ArenaPage() {
  const [challenges, setChallenges] = useState<ArenaChallenge[]>([])
  const [loading, setLoading] = useState(true)
  const [difficulty, setDifficulty] = useState('all')
  const [category, setCategory] = useState('all')

  useEffect(() => {
    fetch('/api/arena/challenges')
      .then(r => r.json())
      .then(json => { if (json.data) setChallenges(json.data) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const filtered = challenges.filter((c) => {
    if (difficulty !== 'all' && c.difficulty !== difficulty) return false
    if (category !== 'all' && c.category !== category) return false
    return true
  })

  const categories = ['all', ...new Set(challenges.map(c => c.category).filter(Boolean))]
  const difficulties = ['all', 'easy', 'medium', 'hard']

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-2">
        <Trophy className="w-6 h-6 text-primary" />
        <h1 className="text-3xl font-semibold text-foreground">Coding Arena</h1>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : challenges.length === 0 ? (
        <Card className="border-border/60 p-10 text-center">
          <Code className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-muted-foreground">No arena challenges available yet.</p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="border-border/60 p-6">
              <p className="text-sm text-muted-foreground">Challenges</p>
              <p className="text-3xl font-semibold text-foreground">{challenges.length}</p>
            </Card>
            <Card className="border-border/60 p-6">
              <p className="text-sm text-muted-foreground">Solved</p>
              <p className="text-3xl font-semibold text-foreground">{challenges.filter(c => c.solved > 0).length}</p>
            </Card>
            <Card className="border-border/60 p-6">
              <p className="text-sm text-muted-foreground">Total Points</p>
              <p className="text-3xl font-semibold text-foreground">{challenges.reduce((s, c) => s + c.points, 0)}</p>
            </Card>
          </div>

          <div className="flex flex-wrap gap-4">
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">Difficulty</label>
              <select
                value={difficulty}
                onChange={e => setDifficulty(e.target.value)}
                className="px-4 py-2 rounded-lg bg-card border border-border text-foreground"
              >
                {difficulties.map(d => <option key={d} value={d}>{d === 'all' ? 'All' : d}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">Category</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="px-4 py-2 rounded-lg bg-card border border-border text-foreground"
              >
                {categories.map(c => <option key={c} value={c}>{c === 'all' ? 'All' : c}</option>)}
              </select>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((c) => (
              <Link key={c.id} href={`/dashboard/arena/${c.id}`}>
                <Card className="border-border/60 p-5 transition-colors hover:border-primary/40">
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-foreground">{c.title}</h3>
                    <Badge variant="outline" className={`text-[10px] ${difficultyColors[c.difficulty] || ''}`}>
                      {c.difficulty}
                    </Badge>
                  </div>
                  <p className="mb-3 line-clamp-2 text-xs text-muted-foreground">{c.shortDescription || c.description}</p>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>{c.points} pts</span>
                    <span>{c.solved} solved</span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
