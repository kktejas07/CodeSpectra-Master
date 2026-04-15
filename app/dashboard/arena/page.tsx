'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Trophy, Code2, Clock, Zap, Filter } from 'lucide-react'

type Challenge = {
  id: string
  title: string
  description: string
  difficulty: 'easy' | 'medium' | 'hard'
  category: string
  points: number
  solved: number
  attempts: number
}

const mockChallenges: Challenge[] = [
  {
    id: '1',
    title: 'Two Sum',
    description: 'Find two numbers that add up to a target',
    difficulty: 'easy',
    category: 'Arrays',
    points: 100,
    solved: 1245,
    attempts: 3,
  },
  {
    id: '2',
    title: 'Longest Substring',
    description: 'Find the longest substring without repeating characters',
    difficulty: 'medium',
    category: 'Strings',
    points: 200,
    solved: 876,
    attempts: 0,
  },
  {
    id: '3',
    title: 'Median of Two Sorted Arrays',
    description: 'Find the median of two sorted arrays in O(log(m+n))',
    difficulty: 'hard',
    category: 'Arrays',
    points: 300,
    solved: 234,
    attempts: 0,
  },
  {
    id: '4',
    title: 'Valid Parentheses',
    description: 'Check if parentheses are balanced',
    difficulty: 'easy',
    category: 'Stacks',
    points: 100,
    solved: 2341,
    attempts: 0,
  },
  {
    id: '5',
    title: 'Binary Tree Traversal',
    description: 'Implement in-order, pre-order, and post-order traversals',
    difficulty: 'medium',
    category: 'Trees',
    points: 250,
    solved: 564,
    attempts: 0,
  },
  {
    id: '6',
    title: 'Edit Distance',
    description: 'Calculate minimum edit distance between two strings',
    difficulty: 'hard',
    category: 'Dynamic Programming',
    points: 350,
    solved: 189,
    attempts: 0,
  },
]

const difficultyColors: Record<string, string> = {
  easy: 'text-green-400 bg-green-500/10',
  medium: 'text-yellow-400 bg-yellow-500/10',
  hard: 'text-red-400 bg-red-500/10',
}

export default function ArenaPage() {
  const [difficulty, setDifficulty] = useState<string>('all')
  const [category, setCategory] = useState<string>('all')

  const filteredChallenges = mockChallenges.filter((challenge) => {
    if (difficulty !== 'all' && challenge.difficulty !== difficulty) return false
    if (category !== 'all' && challenge.category !== category) return false
    return true
  })

  const categories = ['all', ...new Set(mockChallenges.map((c) => c.category))]
  const difficulties = ['all', 'easy', 'medium', 'hard']

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Trophy className="w-6 h-6 text-primary" />
          <h1 className="text-3xl font-bold text-foreground">Coding Arena</h1>
        </div>
        <p className="text-foreground/60">Compete in challenges and earn points</p>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-lg bg-card border border-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-foreground/60">Challenges Solved</p>
              <p className="text-2xl font-bold text-foreground">12</p>
            </div>
            <Code2 className="w-8 h-8 text-primary/50" />
          </div>
        </div>
        <div className="p-4 rounded-lg bg-card border border-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-foreground/60">Attempts Today</p>
              <p className="text-2xl font-bold text-foreground">3</p>
            </div>
            <Clock className="w-8 h-8 text-primary/50" />
          </div>
        </div>
        <div className="p-4 rounded-lg bg-card border border-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-foreground/60">Points Earned</p>
              <p className="text-2xl font-bold text-foreground">1,850</p>
            </div>
            <Zap className="w-8 h-8 text-primary/50" />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1">
          <label className="text-sm font-medium text-foreground mb-2 block">
            <div className="flex items-center gap-2 mb-2">
              <Filter className="w-4 h-4" />
              Difficulty
            </div>
          </label>
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
            className="w-full px-4 py-2 rounded-lg bg-card border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {difficulties.map((d) => (
              <option key={d} value={d}>
                {d.charAt(0).toUpperCase() + d.slice(1)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1">
          <label className="text-sm font-medium text-foreground mb-2 block">
            Category
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full px-4 py-2 rounded-lg bg-card border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Challenges List */}
      <div className="space-y-3">
        {filteredChallenges.length === 0 ? (
          <div className="p-8 rounded-lg bg-card border border-border text-center">
            <p className="text-foreground/60">No challenges found matching your filters</p>
          </div>
        ) : (
          filteredChallenges.map((challenge) => (
            <Link key={challenge.id} href={`/dashboard/arena/${challenge.id}`}>
              <div className="p-6 rounded-lg bg-card border border-border hover:border-primary/50 transition cursor-pointer">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-bold text-foreground">{challenge.title}</h3>
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium ${
                          difficultyColors[challenge.difficulty]
                        }`}
                      >
                        {challenge.difficulty.toUpperCase()}
                      </span>
                      <span className="px-3 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
                        {challenge.category}
                      </span>
                    </div>
                    <p className="text-sm text-foreground/60">{challenge.description}</p>
                    <div className="flex gap-4 text-xs text-foreground/50">
                      <span>Solved by {challenge.solved.toLocaleString()} users</span>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-3">
                    <div className="text-right">
                      <p className="text-2xl font-bold text-primary">{challenge.points}</p>
                      <p className="text-xs text-foreground/50">points</p>
                    </div>
                    {challenge.attempts > 0 && (
                      <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400">
                        {challenge.attempts} attempt{challenge.attempts !== 1 ? 's' : ''}
                      </span>
                    )}
                    {challenge.attempts === 0 && (
                      <Button size="sm">Solve</Button>
                    )}
                  </div>
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  )
}
