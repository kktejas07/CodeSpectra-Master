'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Brain, Code, BookOpen, ArrowRight, Loader2, Trophy, Clock } from 'lucide-react'
import Link from 'next/link'
import { useToast } from '@/lib/toast-context'

interface PrepKit {
  id: string
  title: string
  description: string
  challenges: number
  duration: string
  difficulty: string
}

interface Topic {
  id: string
  title: string
  count: number
}

export default function PreparePage() {
  const addToast = useToast()
  const [kits, setKits] = useState<PrepKit[]>([])
  const [topics, setTopics] = useState<Topic[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/tracks', { credentials: 'include' }).then(r => r.json()).catch(() => ({ data: [] })),
      fetch('/api/problems?limit=200', { credentials: 'include' }).then(r => r.json()).catch(() => ({ data: [] })),
    ]).then(([tracksData, problemsData]) => {
      const tracks = tracksData.data || []
      setKits(tracks.slice(0, 3).map((t: any) => ({
        id: t.id || t.slug,
        title: t.title || 'Practice Track',
        description: t.description || 'Master essential coding skills',
        challenges: t.problemCount || t.count || 0,
        duration: t.duration || 'Self-paced',
        difficulty: t.difficulty || 'All Levels',
      })))

      const problems = problemsData.data || []
      const topicMap: Record<string, number> = {}
      problems.forEach((p: any) => {
        (p.topics || []).forEach((t: string) => {
          topicMap[t] = (topicMap[t] || 0) + 1
        })
      })
      const sortedTopics = Object.entries(topicMap)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 11)
        .map(([title, count]) => ({ id: title.toLowerCase().replace(/\s+/g, '-'), title, count }))
      setTopics(sortedTopics)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-2">Prepare for Your Interview</h1>
        <p className="text-muted-foreground">
          Master coding skills and prepare for technical interviews with comprehensive prep kits and practice challenges.
        </p>
      </div>

      {kits.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" /> Prep Kits
          </h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {kits.map((kit) => (
              <Card key={kit.id} className="p-6 border-border/60 hover:border-primary/30 transition-colors">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground truncate">{kit.title}</h3>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{kit.description}</p>
                  </div>
                  <Badge className="text-[10px] shrink-0 ml-2">{kit.difficulty}</Badge>
                </div>
                <div className="flex items-center justify-between text-sm border-t border-border/40 pt-4">
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Code className="h-3.5 w-3.5" />
                    <span className="text-xs">{kit.challenges} challenges</span>
                  </div>
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    <span className="text-xs">{kit.duration}</span>
                  </div>
                </div>
                <Link href="/dashboard/tracks" className="mt-4 block">
                  <Button variant="outline" size="sm" className="w-full gap-2">
                    Start practicing <ArrowRight className="h-3 w-3" />
                  </Button>
                </Link>
              </Card>
            ))}
          </div>
        </div>
      )}

      {topics.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Trophy className="h-5 w-5 text-primary" /> Popular Topics
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {topics.map((topic) => (
              <Link key={topic.id} href={`/dashboard/problems?topic=${encodeURIComponent(topic.title)}`}>
                <Card className="p-4 border-border/60 hover:border-primary/30 hover:bg-primary/5 transition-all text-center cursor-pointer">
                  <p className="text-sm font-medium text-foreground">{topic.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">{topic.count} problems</p>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      <Card className="p-6 border-primary/20 bg-primary/5">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
            <Brain className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Ready to test your skills?</h3>
            <p className="text-sm text-muted-foreground mt-0.5">Take on coding challenges and track your progress.</p>
          </div>
          <div className="ml-auto flex gap-2">
            <Link href="/dashboard/problems">
              <Button size="sm" className="gap-2"><Code className="h-4 w-4" /> Solve Problems</Button>
            </Link>
            <Link href="/dashboard/arena">
              <Button size="sm" variant="outline" className="gap-2"><Trophy className="h-4 w-4" /> Join Arena</Button>
            </Link>
          </div>
        </div>
      </Card>
    </div>
  )
}
