'use client'
import { formatDate } from '@/lib/format-datetime'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  Bookmark,
  BookOpen,
  Code2,
  FileText,
  History,
  ListChecks,
  Newspaper,
  RotateCcw,
  Search,
  Trash2,
  Video,
  X,
  Clock,
  CalendarDays,
  TrendingUp,
} from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useTour, autoPlayPageTour, type TourStep } from '@/components/tour/tour-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonList, SkeletonText } from '@/components/ui/skeleton-boneyard'
import { cn } from '@/lib/utils'
import { PageHeader, StatCard } from '@/components/app/page-kit'

type RecentItem = {
  type: string
  id: string
  title: string
  href: string
  viewedAt: string
}

const TYPE_META: Record<string, { label: string; icon: typeof BookOpen; color: string }> = {
  course: { label: 'Course', icon: BookOpen, color: 'text-primary bg-primary/10' },
  lesson: { label: 'Lesson', icon: Video, color: 'text-primary bg-primary/10' },
  problem: { label: 'Problem', icon: Code2, color: 'text-foreground bg-muted' },
  article: { label: 'Article', icon: Newspaper, color: 'text-amber-600 dark:text-amber-400 bg-amber-500/10' },
  quiz: { label: 'Quiz', icon: ListChecks, color: 'text-foreground bg-muted' },
}

function typeMeta(type: string) {
  return (
    TYPE_META[type] || {
      label: type ? type.charAt(0).toUpperCase() + type.slice(1) : 'Item',
      icon: FileText,
      color: 'text-muted-foreground bg-muted',
    }
  )
}

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const s = Math.floor((Date.now() - t) / 1000)
  if (s < 60) return 'Just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d === 1) return 'Yesterday'
  if (d < 7) return `${d}d ago`
  return formatDate(iso)
}

function dayGroup(iso: string): string {
  const t = new Date(iso)
  if (Number.isNaN(t.getTime())) return 'Older'
  const now = new Date()
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const diffDays = Math.round((startOf(now) - startOf(t)) / 86400000)
  if (diffDays <= 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays <= 7) return 'Last 7 days'
  return 'Older'
}

const GROUP_ORDER = ['Today', 'Yesterday', 'Last 7 days', 'Older']

export default function RecentlyViewedPage() {
  const gate = usePageGuard('user')
  const { startTour, setTourSeen } = useTour()
  const [items, setItems] = useState<RecentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [clearing, setClearing] = useState(false)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch('/api/user/recently-viewed', { credentials: 'include' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || `Request failed (${r.status})`)
      setItems(Array.isArray(d.items) ? d.items : [])
    } catch (e) {
      setItems([])
      setError(e instanceof Error ? e.message : 'Failed to load history')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!gate.ready) return
    void load()
  }, [gate.ready])

  // First-visit guided tour
  useEffect(() => {
    if (gate.ready) {
      const recentTour: TourStep[] = [
        {
          target: '[data-tour="recent-header"]',
          title: 'Recently viewed',
          description:
            'This page lists everything you opened so you can resume courses, lessons, and problems.',
          position: 'bottom',
        },
        {
          target: '[data-tour="recent-stats"]',
          title: 'Quick stats',
          description:
            'See your total views, recent activity, and most-viewed content type at a glance.',
          position: 'bottom',
        },
        {
          target: '[data-tour="recent-list"]',
          title: 'Jump back in',
          description:
            'Click any entry to continue. Hover to remove a single item, or clear the whole history.',
          position: 'top',
        },
      ]
      autoPlayPageTour('recent', recentTour)}
  }, [gate.ready, startTour, setTourSeen])

  // ── Derived stats ──────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const dayMs = 86400000
    const startOfToday = new Date().setHours(0, 0, 0, 0)
    const startOfWeek = startOfToday - new Date().getDay() * dayMs

    let today = 0
    let thisWeek = 0
    const typeCounts = new Map<string, number>()
    for (const it of items) {
      const t = new Date(it.viewedAt).getTime()
      if (Number.isNaN(t)) continue
      if (t >= startOfToday) today++
      if (t >= startOfWeek) thisWeek++
      typeCounts.set(it.type, (typeCounts.get(it.type) || 0) + 1)
    }
    let topType = ''
    let topCount = 0
    for (const [type, count] of typeCounts) {
      if (count > topCount) {
        topType = type
        topCount = count
      }
    }
    return { total: items.length, today, thisWeek, topType, topCount }
  }, [items])

  const availableTypes = useMemo(() => {
    const set = new Map<string, number>()
    for (const it of items) set.set(it.type, (set.get(it.type) || 0) + 1)
    return [...set.entries()].sort((a, b) => b[1] - a[1])
  }, [items])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((it) => {
      if (typeFilter !== 'all' && it.type !== typeFilter) return false
      if (q && !(it.title || '').toLowerCase().includes(q)) return false
      return true
    })
  }, [items, query, typeFilter])

  const groups = useMemo(() => {
    const map = new Map<string, RecentItem[]>()
    for (const it of filtered) {
      const g = dayGroup(it.viewedAt)
      if (!map.has(g)) map.set(g, [])
      map.get(g)!.push(it)
    }
    return GROUP_ORDER.filter((g) => map.has(g)).map((g) => ({
      name: g,
      items: map.get(g)!,
    }))
  }, [filtered])

  async function removeItem(it: RecentItem) {
    setItems((prev) => prev.filter((p) => !(p.type === it.type && p.id === it.id)))
    try {
      await csrfFetch(
        `/api/user/recently-viewed?type=${encodeURIComponent(it.type)}&id=${encodeURIComponent(it.id)}`,
        { method: 'DELETE' },
      )
    } catch {
      /* already removed locally */
    }
  }

  async function clearAll() {
    if (!window.confirm('Clear your entire viewing history? This cannot be undone.')) return
    setClearing(true)
    try {
      await csrfFetch('/api/user/recently-viewed', { method: 'DELETE' })
      setItems([])
      setQuery('')
      setTypeFilter('all')
    } finally {
      setClearing(false)
    }
  }

  if (!gate.ready || loading) {
    return (
      <div className="w-full space-y-6">
        <SkeletonText lines={2} />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="h-28 animate-pulse bg-muted/30" />
          ))}
        </div>
        <SkeletonList count={6} />
      </div>
    )
  }

  const topMeta = stats.topType ? typeMeta(stats.topType) : null

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <div data-tour="recent-header">
        <PageHeader
          illustration="analytics"
          className="mb-0"
          icon={<History aria-hidden />}
          title={
            <span className="flex flex-wrap items-center gap-2">
              Recently viewed
              {items.length > 0 && (
                <Badge variant="secondary" className="tabular-nums">
                  {items.length}
                </Badge>
              )}
            </span>
          }
          description="Pick up where you left off — courses, lessons, and problems you opened."
          actions={items.length > 0 ? (
            <Button variant="outline" size="sm" onClick={clearAll} disabled={clearing}>
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              {clearing ? 'Clearing…' : 'Clear history'}
            </Button>
          ) : undefined}
        />
      </div>

      {error ? (
        <Card className="flex flex-col items-center gap-3 rounded-3xl p-10 text-center">
          <p className="text-sm font-medium text-foreground">Couldn&apos;t load your history</p>
          <p className="text-xs text-muted-foreground">{error}</p>
          <Button size="sm" onClick={load}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Try again
          </Button>
        </Card>
      ) : items.length === 0 ? (
        <EmptyState illustration="analytics"
          variant="default"
          title="Nothing viewed yet"
          description="Open a course, lesson, or problem and it will show up here automatically."
          actionLabel="Browse courses"
          actionHref="/dashboard/courses"
        />
      ) : (
        <>
          {/* ── 4 Stat Cards ──────────────────────────────────────────── */}
          <div
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
            data-tour="recent-stats"
          >
            <StatCard icon={<History aria-hidden />} label="Total items" value={stats.total} />
            <StatCard icon={<Clock aria-hidden />} label="Viewed today" value={stats.today} />
            <StatCard icon={<CalendarDays aria-hidden />} label="This week" value={stats.thisWeek} />
            <Card className="rounded-3xl border-border/70 p-5">
              <div className="flex items-center gap-4">
                <div
                  className={cn(
                    'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
                    topMeta?.color || 'bg-muted',
                  )}
                >
                  {topMeta ? (
                    <topMeta.icon className="h-5 w-5" />
                  ) : (
                    <TrendingUp className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Most viewed</p>
                  <p className="text-lg font-bold capitalize text-foreground">
                    {topMeta?.label || '—'}
                  </p>
                  {topMeta && (
                    <p className="text-xs tabular-nums text-muted-foreground">{stats.topCount} views</p>
                  )}
                </div>
              </div>
            </Card>
          </div>

          {/* ── Search + type filter ────────────────────────────────────── */}
          <div
            className="flex flex-col gap-3 sm:flex-row sm:items-center"
            data-tour="recent-filters"
          >
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search your history…"
                className="pl-9"
                aria-label="Search history"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setTypeFilter('all')}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  typeFilter === 'all'
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground',
                )}
              >
                All
              </button>
              {availableTypes.map(([type, count]) => {
                const meta = typeMeta(type)
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setTypeFilter(typeFilter === type ? 'all' : type)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition-colors',
                      typeFilter === type
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground',
                    )}
                  >
                    <meta.icon className="h-3 w-3" />
                    {meta.label}
                    <span className="tabular-nums opacity-70">{count}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* ── List ─────────────────────────────────────────────────── */}
          {filtered.length === 0 ? (
            <Card className="rounded-3xl p-10 text-center">
              <p className="text-sm font-medium text-foreground">No matches</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Try a different search or clear the type filter.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-4"
                onClick={() => {
                  setQuery('')
                  setTypeFilter('all')
                }}
              >
                Reset filters
              </Button>
            </Card>
          ) : (
            <div className="space-y-7" data-tour="recent-list">
              {groups.map((group) => (
                <section key={group.name} aria-label={group.name}>
                  <h2 className="mb-2.5 text-sm font-semibold text-muted-foreground">
                    {group.name}
                  </h2>
                  <ul className="space-y-2">
                    {group.items.map((it) => {
                      const meta = typeMeta(it.type)
                      const Icon = meta.icon
                      return (
                        <li key={`${it.type}-${it.id}`}>
                          <Card className="group flex items-center gap-3 rounded-2xl border-border/70 p-3 transition-colors duration-200 hover:border-primary/30 hover:bg-muted/40">
                            <span
                              className={cn(
                                'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                                meta.color,
                              )}
                            >
                              <Icon className="h-4 w-4" />
                            </span>
                            <Link href={it.href} className="min-w-0 flex-1">
                              <p className="truncate font-medium leading-tight text-foreground">
                                {it.title || 'Untitled'}
                              </p>
                              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                                <span className="capitalize">{meta.label}</span>
                                <span aria-hidden>·</span>
                                <span className="tabular-nums">
                                  {timeAgo(it.viewedAt)}
                                </span>
                              </p>
                            </Link>
                            <Link
                              href={it.href}
                              className="hidden shrink-0 items-center gap-1 text-xs font-medium text-primary opacity-0 transition-opacity hover:underline group-hover:opacity-100 sm:inline-flex"
                            >
                              Continue <ArrowRight className="h-3.5 w-3.5" />
                            </Link>
                            <button
                              type="button"
                              onClick={() => removeItem(it)}
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus:opacity-100 group-hover:opacity-100"
                              aria-label={`Remove ${it.title} from history`}
                              title="Remove from history"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </Card>
                        </li>
                      )
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </>
      )}

      {/* Cross-links */}
      <div className="flex flex-wrap gap-4 border-t border-border/60 pt-4 text-sm">
        <Link
          href="/dashboard/activity/sessions"
          className="inline-flex items-center gap-1.5 text-primary hover:underline"
        >
          <Video className="h-3.5 w-3.5" /> My sessions
        </Link>
        <Link
          href="/dashboard/activity/bookmarks"
          className="inline-flex items-center gap-1.5 text-primary hover:underline"
        >
          <Bookmark className="h-3.5 w-3.5" /> Bookmarked questions
        </Link>
      </div>
    </div>
  )
}
