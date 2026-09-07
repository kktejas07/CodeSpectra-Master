'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Search, Building2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import type { CompanyEntry } from '@/lib/companies/company-catalog'

interface Props {
  companies: CompanyEntry[]
  industries: string[]
}

export function CompaniesDirectory({ companies, industries }: Props) {
  const [query, setQuery] = useState('')
  const [selectedIndustry, setSelectedIndustry] = useState<string>('')
  const [sortBy, setSortBy] = useState<'name' | 'difficulty' | 'glassdoor'>('name')

  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    let result = companies.filter(c => {
      const matchesQuery =
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.techStack.some(t => t.toLowerCase().includes(q))
      const matchesIndustry = !selectedIndustry || c.industry === selectedIndustry
      return matchesQuery && matchesIndustry
    })

    result.sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name)
      if (sortBy === 'difficulty') {
        const aDiff = a.difficultyDistribution.hard
        const bDiff = b.difficultyDistribution.hard
        return bDiff - aDiff
      }
      return b.glassdoor - a.glassdoor
    })

    return result
  }, [companies, query, selectedIndustry, sortBy])

  return (
    <div>
      {/* Filters */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search companies or tech stack..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          value={selectedIndustry}
          onChange={e => setSelectedIndustry(e.target.value)}
          className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
        >
          <option value="">All Industries</option>
          {industries.map(ind => (
            <option key={ind} value={ind}>
              {ind}
            </option>
          ))}
        </select>
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value as typeof sortBy)}
          className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
        >
          <option value="name">Sort by Name</option>
          <option value="difficulty">Sort by Difficulty</option>
          <option value="glassdoor">Sort by Rating</option>
        </select>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground">
          No companies match your search.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(company => (
            <Link key={company.slug} href={`/companies/${company.slug}`}>
              <Card className="group cursor-pointer transition-all hover:border-primary/40 hover:shadow-md">
                <div className="flex items-start gap-4 px-6">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted text-2xl">
                    {company.logo}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-lg font-semibold group-hover:text-primary transition-colors">
                      {company.name}
                    </h3>
                    <p className="text-sm text-muted-foreground">{company.industry}</p>
                  </div>
                  <div className="flex items-center gap-1 text-sm text-amber-500">
                    ★ {company.glassdoor.toFixed(1)}
                  </div>
                </div>
                <div className="px-6">
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {company.techStack.slice(0, 5).map(tech => (
                      <span
                        key={tech}
                        className="inline-block rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                      >
                        {tech}
                      </span>
                    ))}
                    {company.techStack.length > 5 && (
                      <span className="inline-block rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        +{company.techStack.length - 5}
                      </span>
                    )}
                  </div>
                </div>
                <div className="px-6 pt-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Difficulty:</span>
                    <div className="flex flex-1 overflow-hidden rounded-full bg-muted h-2">
                      <div
                        className="bg-green-500"
                        style={{ width: `${company.difficultyDistribution.easy}%` }}
                      />
                      <div
                        className="bg-yellow-500"
                        style={{ width: `${company.difficultyDistribution.medium}%` }}
                      />
                      <div
                        className="bg-red-500"
                        style={{ width: `${company.difficultyDistribution.hard}%` }}
                      />
                    </div>
                    <span>{company.difficultyDistribution.hard}% hard</span>
                  </div>
                </div>
                <div className="px-6 pt-2">
                  <p className="text-sm font-medium text-foreground">{company.salaryRange}</p>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
