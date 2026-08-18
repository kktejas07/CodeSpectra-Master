'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

export interface ProblemSummary {
  id: string
  slug: string
  title: string
  difficulty: 'easy' | 'medium' | 'hard'
  topics: string[]
}

export function useProblemsViewModel() {
  const searchParams = useSearchParams()
  const [problems, setProblems] = useState<ProblemSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [difficulty, setDifficulty] = useState<string>('all')

  useEffect(() => {
    setQ(searchParams.get('q') || '')
    setDifficulty(searchParams.get('difficulty') || 'all')
  }, [searchParams])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (difficulty !== 'all') params.set('difficulty', difficulty)
      if (q) params.set('q', q)
      const topics = searchParams.get('topics')
      if (topics) params.set('topics', topics)
      const res = await fetch(`/api/problems?${params.toString()}`, { cache: 'no-store' })
      const json = (await res.json()) as { data?: ProblemSummary[]; error?: string }
      if (!res.ok) throw new Error(json.error || 'Failed to load problems')
      const rawList = json.data || []
      const seen = new Set<string>()
      const deduped = rawList.filter((p) => {
        const key = p.id || p.slug
        if (!key || seen.has(key)) return false
        seen.add(key)
        return true
      })
      setProblems(deduped)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [difficulty, q, searchParams])

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
