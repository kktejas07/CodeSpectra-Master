'use client'

import { Suspense, useEffect, useState, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PageHeader, Panel, BentoGrid } from '@/components/app/page-kit'
import { SoftGlow } from '@/components/visuals'
import { EmptyState } from '@/components/ui/empty-state'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Play, Star, Loader2, Search, Monitor, Code, Settings, Briefcase,
  Heart, Users, BookOpen, Layers, Database, Globe, Cpu,
  Server, Shield, BarChart2, Terminal, Smartphone, Braces, GitBranch,
  FlaskConical, Cloud, Network, Lightbulb, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useTour, autoPlayPageTour, type TourStep } from '@/components/tour/tour-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { DIFFICULTY_LEVELS, DIFFICULTY_LABELS, DIFFICULTY_COLORS } from '@/lib/difficulty-levels'
import { useT } from '@/lib/i18n/client'
import type { Translator } from '@/lib/i18n/catalog'
import { useApiError } from '@/lib/i18n/use-api-error'

const PAGE_SIZE = 10

const CATEGORIES = (t: Translator) => ([
  { id: 'all', label: t('learning.allCourses'), icon: <Monitor className="h-4 w-4" /> },
  { id: 'CPP', label: 'C++', icon: <Braces className="h-4 w-4" /> },
  { id: 'C', label: 'C', icon: <Terminal className="h-4 w-4" /> },
  { id: 'Coding', label: t('learning.coding'), icon: <Code className="h-4 w-4" /> },
  { id: 'Python', label: 'Python', icon: <FlaskConical className="h-4 w-4" /> },
  { id: 'Java', label: 'Java', icon: <Cpu className="h-4 w-4" /> },
  { id: 'JavaScript', label: 'JavaScript', icon: <Braces className="h-4 w-4" /> },
  { id: 'Full Stack Web dev', label: t('learning.fullStackWeb'), icon: <Layers className="h-4 w-4" /> },
  { id: 'React', label: 'React', icon: <Globe className="h-4 w-4" /> },
  { id: 'Node.js', label: 'Node.js', icon: <Server className="h-4 w-4" /> },
  { id: 'Software Tools', label: t('learning.softwareTools'), icon: <Settings className="h-4 w-4" /> },
  { id: 'DevOps', label: t('learning.devops'), icon: <GitBranch className="h-4 w-4" /> },
  { id: 'Docker', label: t('learning.dockerK8s'), icon: <Cloud className="h-4 w-4" /> },
  { id: 'General Aptitude', label: t('learning.aptitude'), icon: <Lightbulb className="h-4 w-4" /> },
  { id: 'SQL', label: t('learning.sqlDatabases'), icon: <Database className="h-4 w-4" /> },
  { id: 'Management', label: t('learning.management'), icon: <Briefcase className="h-4 w-4" /> },
  { id: 'AI', label: t('learning.aiMl'), icon: <BarChart2 className="h-4 w-4" /> },
  { id: 'System Design', label: t('learning.systemDesign'), icon: <Network className="h-4 w-4" /> },
  { id: 'Mobile', label: t('learning.mobileDev'), icon: <Smartphone className="h-4 w-4" /> },
  { id: 'Security', label: t('learning.security'), icon: <Shield className="h-4 w-4" /> },
])

const CATEGORY_IMAGES: Record<string, string> = {
  'CPP': '/courses/cpp.jpg',
  'C': '/courses/c.jpg',
  'Python': '/courses/python.jpg',
  'Java': '/courses/java.jpg',
  'JavaScript': '/courses/javascript.jpg',
  'Full Stack Web dev': '/courses/web.jpg',
  'React': '/courses/react.jpg',
  'Node.js': '/courses/web.jpg',
  'Software Tools': '/courses/os.jpg',
  'DevOps': '/courses/devops.jpg',
  'Docker': '/courses/devops.jpg',
  'SQL': '/courses/sql.jpg',
  'Management': '/courses/system.jpg',
  'AI': '/courses/python.jpg',
  'System Design': '/courses/system.jpg',
}

const DEFAULT_IMAGE = '/courses/web.jpg'

// Skeleton loaders for better UX
const CourseSkeleton = () => (
  <Card className="overflow-hidden rounded-3xl border-border/70 animate-pulse">
    <div className="relative h-44 w-full overflow-hidden shrink-0 bg-muted">
      <div className="w-full h-full bg-muted/60 animate-pulse" />
    </div>
    <div className="p-5 flex flex-col flex-1">
      <div className="flex items-center justify-between mb-3">
        <div className="h-5 w-20 bg-muted/60 rounded animate-pulse" />
        <div className="h-4 w-8 bg-muted/60 rounded animate-pulse" />
      </div>
      <div className="h-5 w-full bg-muted/60 rounded animate-pulse mb-2" />
      <div className="h-3 w-full bg-muted/50 rounded animate-pulse mb-4" />
      <div className="flex items-center justify-between pt-3 border-t border-border/50 mt-auto">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-medium mb-1">
            <div className="h-3 w-3 bg-muted/50 rounded animate-pulse" />
            <div className="h-3 w-12 bg-muted/50 rounded animate-pulse" />
          </div>
          <div className="flex items-center gap-1.5 text-[11px]">
            <div className="h-3 w-3 bg-muted/50 rounded animate-pulse" />
            <div className="h-3 w-16 bg-muted/50 rounded animate-pulse" />
          </div>
        </div>
        <div className="h-8 w-8 rounded-full border border-border animate-pulse" />
      </div>
    </div>
  </Card>
)

function LearningPageInner() {
  const apiError = useApiError()
  const { td, t: tr } = useT()
  const router = useRouter()
  const searchParams = useSearchParams()
  const category = searchParams.get('category') || 'all'
  const levelFilter = searchParams.get('level') || 'all'
  const searchQuery = searchParams.get('q') || ''
  const pageParam = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)
  const { startTour, setTourSeen } = useTour()

  const [courses, setCourses] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [savedCourses, setSavedCourses] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState(searchQuery)

  useEffect(() => {
    setLoading(true)
    setLoadError(false)
    fetch('/api/courses', { credentials: 'include' })
      .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json() })
      .then(j => {
        if (!j.data) return
        // Belt-and-suspenders: collapse same-title cards if API ever returns both seed + generated
        const best = new Map<string, any>()
        for (const c of j.data as any[]) {
          const key = String(c.title || '').trim().toLowerCase() || `__id:${c.id}`
          const prev = best.get(key)
          const richness = (x: any) => {
            const secs = Array.isArray(x.sections) ? x.sections : Array.isArray(x.modules) ? x.modules : []
            const lessons = secs.reduce((n: number, s: any) => n + ((s.lessons || s.videos || []).length || 0), 0)
            const gen = x.id === 'java-beginner' || x.source === 'generated' || x.techStack ? 1000 : 0
            return gen + lessons + secs.length * 10 + (Number(x.sessions) || 0)
          }
          if (!prev || richness(c) > richness(prev)) best.set(key, c)
        }
        setCourses([...best.values()])
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false))
  }, [reloadKey])

  // Initialize tour on first visit (outer LearningPage already gates on auth).
  // autoPlayPageTour registers steps on every mount (so Guide can replay)
  // but only plays when unseen.
  useEffect(() => {
      const coursesTour: TourStep[] = [
        {
          target: '[data-tour="courses-header"]',
          title: tr('learning.exploreCourseCatalog'),
          description: tr('learning.courseLibraryWhereLearnersBrowseCourses173'),
          position: 'bottom',
        },
        {
          target: '[data-tour="courses-search"]',
          title: tr('learning.searchCoursesQuickly'),
          description: tr('learning.typeATitleTopicOrTag06b'),
          position: 'bottom',
        },
        {
          target: '[data-tour="categories"]',
          title: tr('learning.filterByCategory'),
          description: tr('learning.tapACategoryPillToShowe7f'),
          position: 'bottom',
        },
        {
          target: '[data-tour="course-card"]',
          title: tr('learning.tipOpenCourseCards'),
          description: tr('learning.tipClickACardToOpendbe'),
          position: 'bottom',
        },
      ]
      autoPlayPageTour('courses', coursesTour)
  }, [startTour, setTourSeen])

  const toggleSave = async (e: React.MouseEvent, id: string) => {
    e.preventDefault()
    e.stopPropagation()
    const was = savedCourses.has(id)
    setSavedCourses(prev => {
      const next = new Set(prev)
      if (was) next.delete(id)
      else next.add(id)
      return next
    })
    try {
      const res = await csrfFetch('/api/user/course-wishlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId: id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(apiError(data, tr('learning.wishlistFailed')))
      setSavedCourses(prev => {
        const next = new Set(prev)
        if (data.saved) next.add(id)
        else next.delete(id)
        return next
      })
    } catch {
      setSavedCourses(prev => {
        const next = new Set(prev)
        if (was) next.add(id)
        else next.delete(id)
        return next
      })
    }
  }

  const replaceParams = (mutate: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(searchParams.toString())
    mutate(params)
    router.replace(`/dashboard/courses${params.toString() ? `?${params.toString()}` : ''}`, { scroll: false })
  }

  const setCategory = (id: string) => {
    replaceParams(params => {
      if (id === 'all') params.delete('category')
      else params.set('category', id)
      if (search) params.set('q', search)
      else params.delete('q')
      params.delete('page')
    })
  }

  const setLevel = (id: string) => {
    replaceParams(params => {
      if (id === 'all') params.delete('level')
      else params.set('level', id)
      if (search) params.set('q', search)
      else params.delete('q')
      params.delete('page')
    })
  }

  const handleSearch = (val: string) => {
    setSearch(val)
    replaceParams(params => {
      if (val) params.set('q', val)
      else params.delete('q')
      params.delete('page')
    })
  }

  const setPage = (page: number) => {
    replaceParams(params => {
      if (page <= 1) params.delete('page')
      else params.set('page', String(page))
    })
  }

  const filteredCourses = useMemo(() => {
    let list = courses
    if (category !== 'all') {
      list = list.filter(c => {
        const tags: string[] = c.tags || [c.category]
        return tags.some(t =>
          (t || '').toLowerCase().includes(category.toLowerCase()) ||
          category.toLowerCase().includes((t || '').toLowerCase())
        )
      })
    }
    if (levelFilter !== 'all') {
      list = list.filter(c => (c.level || '').toLowerCase() === levelFilter)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(c =>
        c.title?.toLowerCase().includes(q) ||
        c.description?.toLowerCase().includes(q) ||
        (c.tags || []).some((t: string) => (t || '').toLowerCase().includes(q))
      )
    }
    return list
  }, [courses, category, levelFilter, search])

  const totalPages = Math.max(1, Math.ceil(filteredCourses.length / PAGE_SIZE))
  const safePage = Math.min(pageParam, totalPages)
  const pagedCourses = filteredCourses.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  useEffect(() => {
    if (!loading && pageParam > totalPages && totalPages >= 1) setPage(totalPages)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, pageParam, totalPages])

  return (
    <div className="space-y-6 w-full pb-12">
      <div data-tour="courses-header">
        <div className="relative isolate">
          <SoftGlow className="-inset-x-2 -top-4 rounded-3xl" />
          <PageHeader
            illustration="courses"
            title={tr('learning.exploreCourses')}
            description={tr('learning.shortStructuredCoursesOnTheSkillsaf9')}
            icon={<BookOpen />}
            className="mb-4"
            actions={
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <Link href="/dashboard/courses/wishlist"><Heart className="h-4 w-4" />{' '}{tr('learning.wishlist')}</Link>
              </Button>
            }
          />
        </div>
        <div className="relative w-full" data-tour="courses-search">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9 h-11 bg-card rounded-full"
            aria-label={tr('learning.searchCourses')}
            placeholder={tr('learning.searchCourses')}
            value={search}
            onChange={e => handleSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2" data-tour="categories">
        {CATEGORIES(tr).map((cat) => (
          <button
            key={cat.id}
            onClick={() => setCategory(cat.id)}
            aria-pressed={category === cat.id}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-full border text-xs font-semibold transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
              category === cat.id
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border/70 bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground'
            }`}
          >
            <span className={category === cat.id ? 'text-primary-foreground' : 'text-muted-foreground'}>{cat.icon}</span>
            {cat.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setLevel('all')}
          aria-pressed={levelFilter === 'all'}
          className={`px-3 py-1.5 rounded-full border text-xs font-semibold transition-all duration-200 ${
            levelFilter === 'all'
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border/70 bg-card text-muted-foreground hover:text-foreground hover:bg-muted/40'
          }`}
        >{tr('learning.allLevels')}</button>
        {DIFFICULTY_LEVELS.map((lv) => (
          <button
            key={lv}
            onClick={() => setLevel(lv)}
            aria-pressed={levelFilter === lv}
            className={`px-3 py-1.5 rounded-full border text-xs font-semibold transition-all duration-200 ${
              levelFilter === lv
                ? `border-current ${DIFFICULTY_COLORS[lv]}`
                : 'border-border/70 bg-card text-muted-foreground hover:text-foreground hover:bg-muted/40'
            }`}
          >
            {td(`learning.difficultyLabels:${lv}`, DIFFICULTY_LABELS[lv])}
          </button>
        ))}
      </div>

      {loading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 lg:gap-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <CourseSkeleton key={i} />
          ))}
        </div>
      )}

      {!loading && loadError && courses.length === 0 && (
        <Panel className="p-4">
          <EmptyState
            illustration="error"
            title={tr('learning.couldntLoadCourses')}
            description={tr('learning.checkYourConnectionAndTryAgain')}
            actionLabel={tr('common.tryAgain')}
            onAction={() => setReloadKey(k => k + 1)}
          />
        </Panel>
      )}

      {!loading && !(loadError && courses.length === 0) && filteredCourses.length === 0 && (
        <Panel className="p-4">
          <EmptyState
            variant="search"
            scene="learning"
            title={tr('learning.noCoursesFound')}
            description={tr('learning.tryADifferentCategoryOrSearchcde')}
            actionLabel={tr('learning.viewAllCourses')}
            onAction={() => setCategory('all')}
          />
        </Panel>
      )}

      {!loading && filteredCourses.length > 0 && (
        <>
          <BentoGrid className="lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {pagedCourses.map((course, i) => (
              <Link href={`/dashboard/courses/${course.id}`} key={course.id || i} className="block group rounded-3xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                <Card className="overflow-hidden rounded-3xl border-border/70 bg-card h-full flex flex-col transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_18px_40px_-20px_rgba(47,91,231,0.35)] motion-reduce:hover:translate-y-0" data-tour="course-card">
                  <div className="relative h-44 w-full overflow-hidden shrink-0 bg-muted">
                    <img
                      src={course.image || CATEGORY_IMAGES[course.category || course.tags?.[0]] || DEFAULT_IMAGE}
                      alt={course.title}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:group-hover:scale-100"
                      onError={e => { (e.target as HTMLImageElement).src = CATEGORY_IMAGES[course.category || course.tags?.[0]] || DEFAULT_IMAGE }}
                    />
                    {course.level && (
                      <div className="absolute top-2 left-2">
                        <Badge className="text-[10px] capitalize bg-black/60 text-white border-0 backdrop-blur-sm">
                          {course.level}
                        </Badge>
                      </div>
                    )}
                  </div>

                  <div className="p-5 flex flex-col flex-1">
                    <div className="flex items-center justify-between mb-3">
                      <Badge variant="secondary" className="text-[11px] font-medium capitalize text-primary bg-primary/10 hover:bg-primary/15 truncate max-w-30">
                        {course.category || course.tags?.[0] || tr('learning.general')}
                      </Badge>
                      <div className="flex items-center gap-1 text-xs font-medium tabular-nums text-amber-600 dark:text-amber-400 shrink-0">
                        <Star className="h-3.5 w-3.5 fill-amber-500" />
                        {course.rating || '—'}
                      </div>
                    </div>

                    <h3 className="font-bold text-base mb-2 text-foreground group-hover:text-primary transition-colors line-clamp-1">
                      {course.title}
                    </h3>
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-4 flex-1">
                      {course.description}
                    </p>

                    <div className="flex items-center justify-between pt-3 border-t border-border/50 mt-auto">
                      <div>
                        <div className="flex items-center gap-1.5 text-xs font-medium text-foreground mb-1">
                          <Play className="h-3.5 w-3.5 text-muted-foreground" />
                          {course.sessions != null ? tr('learning.sessionsSessions', { sessions: course.sessions }) : '—'}
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <Users className="h-3.5 w-3.5" />
                          {course.enrolled != null
                            ? course.enrolled > 0
                              ? tr('learning.nEnrolled', { n: course.enrolled })
                              : tr('learning.beTheFirstToEnroll')
                            : '—'}
                        </div>
                      </div>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={(e) => toggleSave(e, course.id)}
                            aria-label={savedCourses.has(course.id) ? tr('learning.removeFromWishlist') : tr('learning.addToWishlist')}
                            aria-pressed={savedCourses.has(course.id)}
                            className={`h-8 w-8 rounded-full border flex items-center justify-center transition-colors ${
                              savedCourses.has(course.id)
                                ? 'border-red-500 bg-red-500/10 text-red-500'
                                : 'border-border text-muted-foreground hover:text-red-500 hover:border-red-500 hover:bg-red-500/10'
                            }`}
                          >
                            <Heart className={`h-4 w-4 ${savedCourses.has(course.id) ? 'fill-red-500' : ''}`} />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{savedCourses.has(course.id) ? tr('learning.removeFromWishlist') : tr('learning.addToWishlist')}</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </BentoGrid>

          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-3 pt-2">
              <p className="text-xs text-muted-foreground tabular-nums">{tr('learning.showing')}{' '}{(safePage - 1) * PAGE_SIZE + 1}{tr('learning.valueOfCount', { value: Math.min(safePage * PAGE_SIZE, filteredCourses.length), count: filteredCourses.length })}</p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  disabled={safePage <= 1}
                  onClick={() => setPage(safePage - 1)}
                >
                  <ChevronLeft className="h-3 w-3 mr-1" />{tr('learning.prev')}</Button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
                  .reduce<(number | 'ellipsis')[]>((acc, p, idx, arr) => {
                    if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('ellipsis')
                    acc.push(p)
                    return acc
                  }, [])
                  .map((p, idx) =>
                    p === 'ellipsis' ? (
                      <span key={`e-${idx}`} className="px-1 text-xs text-muted-foreground">…</span>
                    ) : (
                      <Button
                        key={p}
                        variant={p === safePage ? 'default' : 'outline'}
                        size="sm"
                        className="h-8 w-8 text-xs"
                        onClick={() => setPage(p)}
                      >
                        {p}
                      </Button>
                    )
                  )}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage(safePage + 1)}
                >{tr('common.next')}<ChevronRight className="h-3 w-3 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default function LearningPage() {
  const { t } = useT()
  const gate = usePageGuard('user')
  if (!gate.ready) return (
    <div className="w-full min-h-[60vh] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-8 h-8 rounded-full border-4 border-primary border-t-transparent animate-spin" />
        <p className="text-sm text-muted-foreground">{t('learning.loadingCourses')}</p>
      </div>
    </div>
  )

  return (
    <Suspense>
      <LearningPageInner />
    </Suspense>
  )
}
