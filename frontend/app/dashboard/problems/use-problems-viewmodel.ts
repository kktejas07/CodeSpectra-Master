'use client'

import { useCallback, useEffect, useState } from 'react'

export interface ProblemSummary {
  id: string
  slug: string
  title: string
  difficulty: 'easy' | 'medium' | 'hard'
  topics: string[]
}

export function useProblemsViewModel() {
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

  useEffect(() => {
    void load()
  }, [load])

  const filtered = problems.filter((p) => {
    if (!q) return true
    const title = p.title || ''
    return title.toLowerCase().includes(q.toLowerCase())
  })

  return {
    problems,
    loading,
    error,
    q,
    setQ,
    difficulty,
    setDifficulty,
    filtered,
    load,
  }
}
