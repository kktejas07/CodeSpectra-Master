'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Search, Building2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import type { CompanyEntry } from '@/lib/companies/company-catalog'

interface Props {
  companies: CompanyEntry[]
  industries: string[]
}

export function CompaniesDirectory({ companies, industries }: Props) {
  const [query, setQuery] = useState('')
  const [selectedIndustry, setSelectedIndustry] = useState<string>('')
  const [sortBy, setSortBy] = useState<'name' | 'difficulty'>('name')

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
      return 0
    })

    return result
  }, [companies, query, selectedIndustry, sortBy])

  return (
    <div>
      {/* Filters */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cs-ink-soft" aria-hidden />
          <Input
            aria-label="Search companies or tech stack"
            placeholder="Search companies or tech stack..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="h-11 rounded-full border-cs-grid bg-cs-sheet pl-9 text-cs-ink"
          />
        </div>
        <select
          value={selectedIndustry}
          onChange={e => setSelectedIndustry(e.target.value)}
          aria-label="Industry"
          className="h-11 rounded-full border border-cs-grid bg-cs-sheet px-4 text-sm text-cs-ink focus-visible:outline-2 focus-visible:outline-cs-accent"
        >
          <option value="">All industries</option>
          {industries.map(ind => (
            <option key={ind} value={ind}>
              {ind}
            </option>
          ))}
        </select>
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value as typeof sortBy)}
          aria-label="Sort companies"
          className="h-11 rounded-full border border-cs-grid bg-cs-sheet px-4 text-sm text-cs-ink focus-visible:outline-2 focus-visible:outline-cs-accent"
        >
          <option value="name">Sort by name</option>
          <option value="difficulty">Sort by difficulty</option>
        </select>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-cs-grid bg-cs-sheet py-16 text-center text-cs-ink-soft">
          No companies match your search. Try a company name or a technology like Python.
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(company => (
            <Link
              key={company.slug}
              href={`/companies/${company.slug}`}
              className="group block rounded-3xl border border-cs-grid bg-cs-sheet py-6 shadow-[0_1px_2px_rgba(15,23,41,0.04),0_8px_24px_-12px_rgba(15,23,41,0.10)] transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-0.5 hover:border-cs-accent/40 hover:shadow-[0_18px_40px_-18px_rgba(47,91,231,0.35)] motion-reduce:hover:translate-y-0 dark:shadow-none"
            >
              <div>
                <div className="flex items-start gap-4 px-6">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-cs-accent/10 text-2xl" aria-hidden>
                    {company.logo}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-lg font-bold tracking-tight text-cs-ink transition-colors group-hover:text-cs-accent-text">
                      {company.name}
                    </h3>
                    <p className="text-sm text-cs-ink-soft">{company.industry}</p>
                  </div>
                </div>
                <div className="px-6">
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {company.techStack.slice(0, 5).map(tech => (
                      <span
                        key={tech}
                        className="inline-block rounded-full bg-cs-accent/10 px-2 py-0.5 text-xs font-semibold text-cs-accent-text"
                      >
                        {tech}
                      </span>
                    ))}
                    {company.techStack.length > 5 && (
                      <span className="inline-block rounded-full border border-cs-grid px-2 py-0.5 text-xs text-cs-ink-soft">
                        +{company.techStack.length - 5}
                      </span>
                    )}
                  </div>
                </div>
                <div className="px-6 pt-3">
                  <div className="flex items-center gap-2 text-xs text-cs-ink-soft">
                    <span title="Editorial estimate, not measured data">Difficulty (est.)</span>
                    <div className="flex h-2 flex-1 overflow-hidden rounded-full bg-cs-grid" aria-hidden>
                      <div
                        className="bg-green-500"
                        style={{ width: `${company.difficultyDistribution.easy}%` }}
                      />
                      <div
                        className="bg-amber-500"
                        style={{ width: `${company.difficultyDistribution.medium}%` }}
                      />
                      <div
                        className="bg-red-500"
                        style={{ width: `${company.difficultyDistribution.hard}%` }}
                      />
                    </div>
                    <span className="tabular-nums">{company.difficultyDistribution.hard}% hard</span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
