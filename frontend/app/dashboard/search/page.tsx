'use client'

import { useState, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Search, Loader2, ArrowRight } from 'lucide-react'
import Link from 'next/link'

interface SearchResult {
  id: string
  title: string
  description?: string
  category: string
  type: string
  href: string
  difficulty?: string
}

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'problems', label: 'Problems' },
  { id: 'challenges', label: 'Challenges' },
  { id: 'tracks', label: 'Tracks' },
  { id: 'jobs', label: 'Jobs' },
  { id: 'exams', label: 'Exams' },
  { id: 'codeathons', label: 'Events' },
]

export default function GlobalSearchPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searchCategory, setSearchCategory] = useState('all')
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  const handleSearch = useCallback(async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const q = searchQuery.trim()
    if (!q) return

    setLoading(true)
    setSearched(true)

    try {
      const results: SearchResult[] = []
      const fetchOpts = { credentials: 'include' as const }

      // Search problems
      if (searchCategory === 'all' || searchCategory === 'problems') {
        const res = await fetch(`/api/problems?query=${encodeURIComponent(q)}&limit=10`, fetchOpts)
        const data = await res.json().catch(() => ({}))
        if (Array.isArray(data.data)) {
          data.data.forEach((p: any) => results.push({
            id: p.slug || p.id,
            title: p.title,
            description: p.description,
            category: 'problems',
            type: 'Problem',
            href: `/dashboard/problems/${p.slug || p.id}`,
            difficulty: p.difficulty,
          }))
        }
      }

      // Search tracks
      if (searchCategory === 'all' || searchCategory === 'tracks') {
        const res = await fetch('/api/tracks', fetchOpts)
        const data = await res.json().catch(() => ({}))
        if (Array.isArray(data.data)) {
          data.data.filter((t: any) => (t.title || '').toLowerCase().includes(q.toLowerCase()))
            .slice(0, 5)
            .forEach((t: any) => results.push({
              id: t.id,
              title: t.title,
              description: t.description,
              category: 'tracks',
              type: 'Track',
              href: `/dashboard/tracks`,
            }))
        }
      }

      // Search jobs
      if (searchCategory === 'all' || searchCategory === 'jobs') {
        const res = await fetch('/api/jobs', fetchOpts)
        const data = await res.json().catch(() => ({}))
        const jobs = data.data || data.jobs || []
        if (Array.isArray(jobs)) {
          jobs.filter((j: any) =>
            (j.title || '').toLowerCase().includes(q.toLowerCase()) ||
            (j.company || '').toLowerCase().includes(q.toLowerCase())
          ).slice(0, 5).forEach((j: any) => results.push({
            id: j.id,
            title: `${j.title} at ${j.company || 'Company'}`,
            description: j.description,
            category: 'jobs',
            type: 'Job',
            href: `/dashboard/jobs`,
          }))
        }
      }

      // Search exams
      if (searchCategory === 'all' || searchCategory === 'exams') {
        const res = await fetch('/api/exams', fetchOpts)
        const data = await res.json().catch(() => ({}))
        const exams = data.data || data.exams || []
        if (Array.isArray(exams)) {
          exams.filter((e: any) => (e.title || '').toLowerCase().includes(q.toLowerCase()))
            .slice(0, 5).forEach((e: any) => results.push({
              id: e.id,
              title: e.title,
              description: e.subject,
              category: 'exams',
              type: 'Exam',
              href: `/dashboard/exams`,
            }))
        }
      }

      // Search codeathons
      if (searchCategory === 'all' || searchCategory === 'codeathons') {
        const res = await fetch('/api/codeathons', fetchOpts)
        const data = await res.json().catch(() => ({}))
        const events = data.data || data.codeathons || []
        if (Array.isArray(events)) {
          events.filter((c: any) => (c.title || '').toLowerCase().includes(q.toLowerCase()))
            .slice(0, 5).forEach((c: any) => results.push({
              id: c.id,
              title: c.title,
              description: c.description,
              category: 'codeathons',
              type: 'Event',
              href: `/dashboard/codeathons`,
            }))
        }
      }

      setSearchResults(results)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [searchQuery, searchCategory])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
          <Search className="w-8 h-8 text-primary" />
          Global Search
        </h1>
        <p className="text-muted-foreground mt-2">Search across problems, tracks, jobs, exams, and events</p>
      </div>

      <Card className="p-6">
        <form onSubmit={handleSearch} className="space-y-4">
          <div className="flex gap-3">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="flex-1"
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <Button onClick={() => handleSearch()} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              <span className="ml-2">Search</span>
            </Button>
          </div>

          <div className="flex gap-2 flex-wrap">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSearchCategory(cat.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  searchCategory === cat.id
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-foreground hover:bg-muted/80'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </form>
      </Card>

      {loading && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && searched && searchResults.length > 0 && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Found {searchResults.length} results</p>
          {searchResults.map((result, i) => (
            <Card key={result.id || i} className="p-4 hover:bg-muted/30 transition-colors">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-foreground truncate">{result.title}</h3>
                    {result.difficulty && (
                      <Badge variant="outline" className="text-[10px] shrink-0">{result.difficulty}</Badge>
                    )}
                  </div>
                  {result.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{result.description}</p>
                  )}
                  <Badge variant="secondary" className="text-[10px] mt-1.5">{result.type}</Badge>
                </div>
                <Link href={result.href}>
                  <Button variant="ghost" size="sm" className="gap-1 shrink-0 ml-2">
                    <ArrowRight className="h-3 w-3" />
                  </Button>
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}

      {!loading && searched && searchResults.length === 0 && (
        <Card className="p-12 text-center">
          <Search className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-foreground font-medium mb-2">No results found</p>
          <p className="text-muted-foreground text-sm">Try different search terms or filters</p>
        </Card>
      )}
    </div>
  )
}
