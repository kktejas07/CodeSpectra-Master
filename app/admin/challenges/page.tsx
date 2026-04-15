'use client'

import { useState } from 'react'
import { Trophy, Plus, Edit2, Trash2, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'

const challenges = [
  {
    id: 1,
    title: 'Two Sum',
    difficulty: 'easy',
    category: 'Arrays',
    solved: 1245,
    attempts: 3421,
  },
  {
    id: 2,
    title: 'Longest Substring',
    difficulty: 'medium',
    category: 'Strings',
    solved: 876,
    attempts: 2145,
  },
  {
    id: 3,
    title: 'Median of Two Sorted Arrays',
    difficulty: 'hard',
    category: 'Arrays',
    solved: 234,
    attempts: 890,
  },
  {
    id: 4,
    title: 'Valid Parentheses',
    difficulty: 'easy',
    category: 'Stacks',
    solved: 2341,
    attempts: 4234,
  },
  {
    id: 5,
    title: 'Binary Tree Traversal',
    difficulty: 'medium',
    category: 'Trees',
    solved: 564,
    attempts: 1234,
  },
]

const difficultyColors: Record<string, string> = {
  easy: 'bg-green-500/10 text-green-400',
  medium: 'bg-yellow-500/10 text-yellow-400',
  hard: 'bg-red-500/10 text-red-400',
}

export default function ChallengesPage() {
  const [filter, setFilter] = useState('all')

  const filtered = filter === 'all' ? challenges : challenges.filter((c) => c.difficulty === filter)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Trophy className="w-6 h-6 text-primary" />
            <h1 className="text-3xl font-bold text-foreground">Challenges</h1>
          </div>
          <p className="text-foreground/60">Manage coding challenges</p>
        </div>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          New Challenge
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {['all', 'easy', 'medium', 'hard'].map((difficulty) => (
          <button
            key={difficulty}
            onClick={() => setFilter(difficulty)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              filter === difficulty
                ? 'bg-primary text-primary-foreground'
                : 'bg-card border border-border text-foreground hover:border-primary'
            }`}
          >
            {difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}
          </button>
        ))}
      </div>

      {/* Challenges Table */}
      <div className="rounded-lg bg-card border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-card/50">
                <th className="px-6 py-4 text-left text-sm font-semibold text-foreground/70">Title</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-foreground/70">Difficulty</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-foreground/70">Category</th>
                <th className="px-6 py-4 text-right text-sm font-semibold text-foreground/70">Solved</th>
                <th className="px-6 py-4 text-right text-sm font-semibold text-foreground/70">Attempts</th>
                <th className="px-6 py-4 text-right text-sm font-semibold text-foreground/70">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((challenge) => (
                <tr key={challenge.id} className="border-b border-border last:border-b-0 hover:bg-background/50 transition">
                  <td className="px-6 py-4">
                    <span className="font-medium text-foreground">{challenge.title}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${difficultyColors[challenge.difficulty]}`}>
                      {challenge.difficulty.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-foreground/70">{challenge.category}</span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="font-medium text-foreground">{challenge.solved}</span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="text-foreground/70">{challenge.attempts}</span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button className="p-2 hover:bg-background rounded transition" title="View">
                        <Eye className="w-4 h-4 text-foreground/60" />
                      </button>
                      <button className="p-2 hover:bg-background rounded transition" title="Edit">
                        <Edit2 className="w-4 h-4 text-foreground/60" />
                      </button>
                      <button className="p-2 hover:bg-background rounded transition" title="Delete">
                        <Trash2 className="w-4 h-4 text-red-400/60" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-lg bg-card border border-border">
          <p className="text-sm text-foreground/60 mb-1">Total Challenges</p>
          <p className="text-3xl font-bold text-foreground">{challenges.length}</p>
        </div>
        <div className="p-4 rounded-lg bg-card border border-border">
          <p className="text-sm text-foreground/60 mb-1">Total Solves</p>
          <p className="text-3xl font-bold text-foreground">{challenges.reduce((sum, c) => sum + c.solved, 0).toLocaleString()}</p>
        </div>
        <div className="p-4 rounded-lg bg-card border border-border">
          <p className="text-sm text-foreground/60 mb-1">Total Attempts</p>
          <p className="text-3xl font-bold text-foreground">{challenges.reduce((sum, c) => sum + c.attempts, 0).toLocaleString()}</p>
        </div>
      </div>
    </div>
  )
}
