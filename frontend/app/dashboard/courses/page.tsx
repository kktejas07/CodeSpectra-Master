'use client'

import { Suspense, useEffect, useState, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Play, Star, Loader2, Search, Monitor, Code, Settings, Briefcase,
  Heart, Users, BookOpen, Layers, Clock, Database, Globe, Cpu, 
  Server, Shield, BarChart2, Terminal, Smartphone, Braces, GitBranch,
  FlaskConical, Cloud, Network, Lightbulb
} from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'

// All technology categories — shown as a wrapping pill grid (no scroll/hidden)
const CATEGORIES = [
  { id: 'all',           label: 'All Courses',       icon: <Monitor className="h-4 w-4" /> },
  { id: 'CPP',           label: 'C++',               icon: <Braces className="h-4 w-4" /> },
  { id: 'C',             label: 'C',                 icon: <Terminal className="h-4 w-4" /> },
  { id: 'Coding',        label: 'Coding',             icon: <Code className="h-4 w-4" /> },
  { id: 'Python',        label: 'Python',             icon: <FlaskConical className="h-4 w-4" /> },
  { id: 'Java',          label: 'Java',               icon: <Cpu className="h-4 w-4" /> },
  { id: 'JavaScript',    label: 'JavaScript',         icon: <Braces className="h-4 w-4" /> },
  { id: 'Full Stack Web dev', label: 'Full Stack Web', icon: <Layers className="h-4 w-4" /> },
  { id: 'React',         label: 'React',              icon: <Globe className="h-4 w-4" /> },
  { id: 'Node.js',       label: 'Node.js',            icon: <Server className="h-4 w-4" /> },
  { id: 'Software Tools',label: 'Software Tools',     icon: <Settings className="h-4 w-4" /> },
  { id: 'DevOps',        label: 'DevOps',             icon: <GitBranch className="h-4 w-4" /> },
  { id: 'Docker',        label: 'Docker / K8s',       icon: <Cloud className="h-4 w-4" /> },
  { id: 'General Aptitude', label: 'Aptitude',        icon: <Lightbulb className="h-4 w-4" /> },
  { id: 'SQL',           label: 'SQL / Databases',    icon: <Database className="h-4 w-4" /> },
  { id: 'Management',    label: 'Management',         icon: <Briefcase className="h-4 w-4" /> },
  { id: 'AI',            label: 'AI / ML',            icon: <BarChart2 className="h-4 w-4" /> },
  { id: 'System Design', label: 'System Design',      icon: <Network className="h-4 w-4" /> },
  { id: 'Mobile',        label: 'Mobile Dev',         icon: <Smartphone className="h-4 w-4" /> },
  { id: 'Security',      label: 'Security',           icon: <Shield className="h-4 w-4" /> },
]

// Category-based fallback images
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

function LearningPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const category = searchParams.get('category') || 'all'
  const searchQuery = searchParams.get('q') || ''

  const [courses, setCourses] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [savedCourses, setSavedCourses] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState(searchQuery)

  useEffect(() => {
    setLoading(true)
    fetch('/api/courses', { credentials: 'include' })
      .then(r => r.json())
      .then(j => {
        if (j.data) setCourses(j.data)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const toggleSave = (e: React.MouseEvent, id: string) => {
    e.preventDefault()
    e.stopPropagation()
    setSavedCourses(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const setCategory = (id: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (id === 'all') params.delete('category')
    else params.set('category', id)
    if (search) params.set('q', search)
    else params.delete('q')
    router.replace(`/dashboard/courses${params.toString() ? `?${params.toString()}` : ''}`, { scroll: false })
  }

  const handleSearch = (val: string) => {
    setSearch(val)
    const params = new URLSearchParams(searchParams.toString())
    if (val) params.set('q', val)
    else params.delete('q')
    router.replace(`/dashboard/courses${params.toString() ? `?${params.toString()}` : ''}`, { scroll: false })
  }

  const filteredCourses = useMemo(() => {
    let list = courses
    if (category !== 'all') {
      list = list.filter(c => {
        const tags: string[] = c.tags || [c.category]
        return tags.some(t => 
          t.toLowerCase().includes(category.toLowerCase()) ||
          category.toLowerCase().includes(t.toLowerCase())
        )
      })
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(c =>
        c.title?.toLowerCase().includes(q) ||
        c.description?.toLowerCase().includes(q) ||
        (c.tags || []).some((t: string) => t.toLowerCase().includes(q))
      )
    }
    return list
  }, [courses, category, search])

  return (
    <div className="space-y-8 w-full mx-auto pb-12 px-2 sm:px-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
        <h1 className="text-3xl font-bold">
          <span className="text-foreground">Explore </span>
          <span className="text-blue-500">Courses</span>
        </h1>
        <div className="relative max-w-sm w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9 bg-background/50 border-muted rounded-full"
            placeholder="Search Courses"
            value={search}
            onChange={e => handleSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Category Pills — wrapping grid, all visible */}
      <div className="flex flex-wrap gap-2 mb-2">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setCategory(cat.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-full border text-xs font-semibold transition-all duration-200 ${
              category === cat.id
                ? 'border-blue-500 bg-blue-500 text-white shadow-blue-500/25 ring-2 ring-blue-500/20 ring-offset-1 ring-offset-background'
                : 'border-border/50 bg-card text-muted-foreground hover:border-blue-400/40 hover:text-foreground hover:bg-muted/40'
            }`}
          >
            <span className={category === cat.id ? 'text-white' : 'text-muted-foreground'}>{cat.icon}</span>
            {cat.label}
          </button>
        ))}
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty State */}
      {!loading && filteredCourses.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
          <BookOpen className="h-12 w-12 text-muted-foreground/40" />
          <p className="text-muted-foreground text-lg font-medium">No courses found</p>
          <p className="text-sm text-muted-foreground/70">Try a different category or search term</p>
          <Button variant="outline" onClick={() => setCategory('all')}>View All Courses</Button>
        </div>
      )}

      {/* Course Grid */}
      {!loading && filteredCourses.length > 0 && (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {filteredCourses.map((course, i) => (
            <Link href={`/dashboard/courses/${course.id}`} key={course.id || i} className="block group">
              <Card className="overflow-hidden border-border/60 hover:border-primary/40 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 bg-card h-full flex flex-col">
                {/* Thumbnail */}
                <div className="relative h-44 w-full overflow-hidden shrink-0 bg-muted">
                  <img
                    src={course.image || CATEGORY_IMAGES[course.category || course.tags?.[0]] || DEFAULT_IMAGE}
                    alt={course.title}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    onError={e => { (e.target as HTMLImageElement).src = CATEGORY_IMAGES[course.category || course.tags?.[0]] || DEFAULT_IMAGE }}
                  />
                  {/* Level badge */}
                  {course.level && (
                    <div className="absolute top-2 left-2">
                      <Badge className="text-[10px] capitalize bg-black/60 text-white border-0 backdrop-blur-sm">
                        {course.level}
                      </Badge>
                    </div>
                  )}
                </div>

                {/* Body */}
                <div className="p-5 flex flex-col flex-1">
                  <div className="flex items-center justify-between mb-3">
                    <Badge variant="secondary" className="text-[10px] font-medium text-blue-500 bg-blue-500/10 hover:bg-blue-500/20 uppercase truncate max-w-[120px]">
                      {course.category || course.tags?.[0] || 'General'}
                    </Badge>
                    <div className="flex items-center gap-1 text-xs font-medium text-amber-500 shrink-0">
                      <Star className="h-3.5 w-3.5 fill-amber-500" />
                      {course.rating || '—'}
                    </div>
                  </div>

                  <h3 className="font-bold text-base mb-2 text-foreground group-hover:text-blue-500 transition-colors line-clamp-1">
                    {course.title}
                  </h3>
                  <p className="text-xs text-muted-foreground line-clamp-2 mb-4 flex-1">
                    {course.description}
                  </p>

                  {/* Stats Footer */}
                  <div className="flex items-center justify-between pt-3 border-t border-border/50 mt-auto">
                    <div>
                      {/* Sessions — real from DB */}
                      <div className="flex items-center gap-1.5 text-xs font-medium text-foreground mb-1">
                        <Play className="h-3.5 w-3.5 text-muted-foreground" />
                        {course.sessions != null ? `${course.sessions} Sessions` : '—'}
                      </div>
                      {/* Enrolled — real count from course_enrollments */}
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <Users className="h-3.5 w-3.5" />
                        {course.enrolled != null
                          ? course.enrolled > 0
                            ? `${course.enrolled.toLocaleString()} Enrolled`
                            : 'Be the first to enroll'
                          : '—'}
                      </div>
                    </div>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={(e) => toggleSave(e, course.id)}
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
                        <p>{savedCourses.has(course.id) ? 'Remove from wishlist' : 'Add to wishlist'}</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

export default function LearningPage() {
  const gate = usePageGuard('user')
  if (!gate.ready) return (
    <div className="w-full min-h-[60vh] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-8 h-8 rounded-full border-4 border-primary border-t-transparent animate-spin" />
        <p className="text-sm text-muted-foreground">Loading courses…</p>
      </div>
    </div>
  )

  return (
    <Suspense>
      <LearningPageInner />
    </Suspense>
  )
}
