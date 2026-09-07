'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { HelpCircle, Search } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useTour, type TourStep } from '@/components/tour/tour-context'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AllFiltersDialog, type FilterState } from '@/components/listings/all-filters-dialog'
import { Loader2 } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonList, SkeletonText } from '@/components/ui/skeleton-boneyard'

const QUIZZES = [
  { id: 'tcs-software-engineer', company: 'TCS', role: 'Software Engineer', type: 'Tech', level: 'Entry-level', href: '/dashboard/mock-tests/tcs-software-engineer' },
  { id: 'google-sde', company: 'Google', role: 'SDE', type: 'Tech', level: 'Mid-level', href: '/dashboard/mock-tests/google-sde' },
  { id: 'amazon-sde', company: 'Amazon', role: 'SDE I', type: 'Tech', level: 'Entry-level', href: '/dashboard/mock-tests/amazon-sde' },
  { id: 'ey-data-analyst', company: 'EY', role: 'Data Analyst', type: 'Data', level: 'Entry-level', href: '/dashboard/mock-tests/ey-data-analyst' },
  { id: 'fractal-data-scientist', company: 'Fractal', role: 'Data Scientist', type: 'Data', level: 'Advanced', href: '/dashboard/mock-tests/fractal-data-scientist' },
]

export default function QuizzesPage() {
  const gate = usePageGuard('user')
  const { startTour, setTourSeen } = useTour()
  const [q, setQ] = useState('')
  const [filters, setFilters] = useState<FilterState>({})
  const [open, setOpen] = useState(false)

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase()
    return QUIZZES.filter((item) => {
      if (query && !`${item.company} ${item.role}`.toLowerCase().includes(query)) return false
      if (filters.category?.length && !filters.category.includes(item.type)) return false
      if (filters.experience?.length && !filters.experience.includes(item.level)) return false
      return true
    })
  }, [q, filters])

  // First-visit guided tour (same pattern as the other dashboard pages).
  useEffect(() => {
    if (gate.ready && !localStorage.getItem('has_seen_quizzes_tour')) {
      const quizzesTour: TourStep[] = [
        {
          target: '[data-tour="quizzes-header"]',
          title: 'Practice role-based quizzes',
          description: 'Company mock tests for SDE, data, and analyst roles live here.',
          position: 'bottom',
        },
        {
          target: '[data-tour="quizzes-search"]',
          title: 'Search and filter',
          description: 'Search by company or role, or open All Filters by category and level.',
          position: 'bottom',
        },
        {
          target: '[data-tour="quizzes-grid"]',
          title: 'Start a quiz',
          description: 'Pick any card to jump into the company mock test.',
          position: 'top',
        },
      ]
      startTour(quizzesTour, 'quizzes')
      setTourSeen('quizzes')
    }
  }, [gate.ready, startTour, setTourSeen])

  if (!gate.ready) {
    return (
      <div className="w-full space-y-6">
        <SkeletonText lines={2} />
        <SkeletonList count={4} />
      </div>
    )
  }

  return (
    <div className="w-full space-y-6">
      <div data-tour="quizzes-header">
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
          <HelpCircle className="h-8 w-8 text-primary" /> Quizzes
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Role-based quizzes and company mock tests.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row" data-tour="quizzes-search">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search quizzes…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Button type="button" variant="outline" onClick={() => setOpen(true)}>
          All Filters
          {Object.values(filters).some((v) => v?.length) ? (
            <Badge className="ml-2" variant="secondary">
              Active
            </Badge>
          ) : null}
        </Button>
      </div>

      <div data-tour="quizzes-grid">
      {filtered.length === 0 ? (
        <EmptyState
          variant="search"
          title="No quizzes match your filters"
          description="Clear filters or try a different search to see role-based quizzes again."
          actionLabel="Clear search"
          onAction={() => { setQ(''); setFilters({}) }}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((item) => (
            <Link key={item.id} href={item.href}>
              <Card className="h-full p-4 transition-colors hover:border-primary/40 hover:bg-muted/30">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold">{item.company}</p>
                  <Badge variant="outline">{item.type}</Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{item.role}</p>
                <p className="mt-3 text-xs text-muted-foreground">{item.level}</p>
              </Card>
            </Link>
          ))}
        </div>
      )}
      </div>

      <AllFiltersDialog
        open={open}
        onOpenChange={setOpen}
        value={filters}
        onApply={setFilters}
        categories={['Tech', 'Data']}
        experienceLevels={['Entry-level', 'Mid-level', 'Advanced']}
      />
    </div>
  )
}
