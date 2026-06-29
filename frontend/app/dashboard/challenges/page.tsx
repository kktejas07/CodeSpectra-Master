'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Lock, Star, Code, Zap, CheckCircle, ArrowRight, Loader, Trophy } from 'lucide-react'
import Link from 'next/link'

interface Challenge {
  id: string
  title: string
  description: string
  difficulty: string
  type: string
  duration: number
  successRate: number
  completed: boolean
  locked: boolean
  prerequisites?: string[]
}

export default function ChallengesPage() {
  const [challenges, setChallenges] = useState<Challenge[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedType, setSelectedType] = useState<string | null>(null)
  const [selectedDifficulty, setSelectedDifficulty] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/challenges')
      .then(r => r.json())
      .then(json => { if (json.data) setChallenges(json.data) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const filteredChallenges = challenges.filter((c) => {
    if (selectedType && c.type !== selectedType) return false
    if (selectedDifficulty && c.difficulty !== selectedDifficulty) return false
    return true
  })

  const completedCount = challenges.filter(c => c.completed).length
  const types = [...new Set(challenges.map(c => c.type))]
  const difficulties = [...new Set(challenges.map(c => c.difficulty))]

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Challenges</h1>
        <p className="text-muted-foreground mt-1">Practice coding, system design, and behavioral interviews</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : challenges.length === 0 ? (
        <Card className="border-border/60 p-10 text-center">
          <Trophy className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-muted-foreground">No challenges available yet.</p>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="border-border/60 p-4 text-center">
              <p className="text-2xl font-bold text-foreground">{completedCount}/{challenges.length}</p>
              <p className="text-xs text-muted-foreground">Completed</p>
            </Card>
            <Card className="border-border/60 p-4 text-center">
              <p className="text-2xl font-bold text-foreground">{challenges.filter(c => !c.locked).length}</p>
              <p className="text-xs text-muted-foreground">Available</p>
            </Card>
            <Card className="border-border/60 p-4 text-center">
              <p className="text-2xl font-bold text-foreground">{challenges.filter(c => c.locked).length}</p>
              <p className="text-xs text-muted-foreground">Locked</p>
            </Card>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant={!selectedType ? 'default' : 'outline'} size="sm" onClick={() => setSelectedType(null)}>All</Button>
            {types.map(t => (
              <Button key={t} variant={selectedType === t ? 'default' : 'outline'} size="sm" onClick={() => setSelectedType(t)}>{t}</Button>
            ))}
            <span className="mx-2 border-l border-border" />
            <Button variant={!selectedDifficulty ? 'default' : 'outline'} size="sm" onClick={() => setSelectedDifficulty(null)}>All levels</Button>
            {difficulties.map(d => (
              <Button key={d} variant={selectedDifficulty === d ? 'default' : 'outline'} size="sm" onClick={() => setSelectedDifficulty(d)}>{d}</Button>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredChallenges.map((c) => (
              <Card key={c.id} className={`border-border/60 p-5 transition-colors ${c.locked ? 'opacity-60' : 'hover:border-primary/40'}`}>
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Code className="h-4 w-4 text-primary" />
                    <span className="text-xs font-medium text-muted-foreground capitalize">{c.type.replace('-', ' ')}</span>
                  </div>
                  {c.completed ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : c.locked ? (
                    <Lock className="h-4 w-4 text-muted-foreground" />
                  ) : null}
                </div>
                <h3 className="mb-1 font-semibold text-foreground">{c.title}</h3>
                <p className="mb-3 line-clamp-2 text-xs text-muted-foreground">{c.description}</p>
                <div className="mb-3 flex flex-wrap gap-2 text-xs">
                  <Badge variant={c.difficulty === 'Hard' ? 'destructive' : c.difficulty === 'Medium' ? 'default' : 'secondary'} className="text-[10px]">
                    {c.difficulty}
                  </Badge>
                  <span className="text-muted-foreground">{c.duration} min</span>
                  <span className="text-muted-foreground">{c.successRate}% success</span>
                </div>
                {c.prerequisites?.length && (
                  <p className="mb-3 text-[10px] text-muted-foreground">
                    Requires: {c.prerequisites.join(', ')}
                  </p>
                )}
                <Link href={c.locked ? '#' : `/dashboard/challenges/${c.id}`}>
                  <Button variant="outline" size="sm" className="w-full gap-2" disabled={c.locked}>
                    {c.completed ? 'Retry' : c.locked ? 'Locked' : 'Start'}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
