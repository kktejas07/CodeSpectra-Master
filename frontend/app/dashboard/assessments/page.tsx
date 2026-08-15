'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Clock, BookOpen, Play, Loader2, CheckCircle, Search, Users, BarChart3 } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'

interface Exam {
  id: string
  title: string
  subject: string
  level: string
  duration: number
  questions: number
  access_type: string
  published: boolean
  cert_template?: string
  degree_type?: string
  branch?: string
  screening_type?: string
  techStack?: string[]
  attempts: number
  avgScore: number
  status: string
  score?: number
}

export default function ExamsPage() {
  const gate = usePageGuard('user')
  const router = useRouter()
  const [exams, setExams] = useState<Exam[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [levelFilter, setLevelFilter] = useState('all')
  const [subjectFilter, setSubjectFilter] = useState('all')

  useEffect(() => {
    fetch('/api/exams', { credentials: 'include' })
      .then(r => r.json())
      .then(json => { if (json.data) setExams(json.data) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const subjects = [...new Set(exams.map(e => e.subject).filter(Boolean))].sort()
  const levels = [...new Set(exams.map(e => e.level).filter(Boolean))].sort()

  const filtered = exams.filter(exam => {
    const q = search.trim().toLowerCase()
    if (q && !(exam.title || '').toLowerCase().includes(q) && !(exam.subject || '').toLowerCase().includes(q)) return false
    if (levelFilter !== 'all' && exam.level !== levelFilter) return false
    if (subjectFilter !== 'all' && exam.subject !== subjectFilter) return false
    return true
  })

  const getLevelColor = (level: string) => {
    const l = (level || '').toLowerCase()
    if (l === 'beginner') return 'bg-green-500/20 text-green-700'
    if (l === 'intermediate') return 'bg-yellow-500/20 text-yellow-700'
    if (l === 'advanced') return 'bg-red-500/20 text-red-700'
    return 'bg-muted text-muted-foreground'
  }

  const stats = {
    total: exams.length,
    open: exams.filter(e => e.access_type === 'open').length,
    inviteOnly: exams.filter(e => e.access_type === 'invite_only').length,
  }

  if (!gate.ready) return null

  if (loading) return (
    <div className="flex justify-center py-20">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Assessments</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Take certification assessments to validate your skills</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-border/60 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10">
              <BookOpen className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{stats.total}</p>
              <p className="text-xs text-muted-foreground">Total assessments</p>
            </div>
          </div>
        </Card>
        <Card className="border-border/60 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-500/10">
              <Play className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{stats.open}</p>
              <p className="text-xs text-muted-foreground">Open enrollment</p>
            </div>
          </div>
        </Card>
        <Card className="border-border/60 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-500/10">
              <Users className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{stats.inviteOnly}</p>
              <p className="text-xs text-muted-foreground">Invite only</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1 min-w-[200px]">
          <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Search assessments..." value={search} onChange={e => setSearch(e.target.value)} className="pl-7 h-8 text-xs" />
        </div>
        <Select value={levelFilter} onValueChange={setLevelFilter}>
          <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue placeholder="All levels" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All levels</SelectItem>
            {levels.map(l => <SelectItem key={l} value={l} className="text-xs">{l}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={subjectFilter} onValueChange={setSubjectFilter}>
          <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue placeholder="All subjects" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All subjects</SelectItem>
            {subjects.map(s => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">{filtered.length} assessment{filtered.length !== 1 ? 's' : ''}</p>
      </div>

      {/* Exam Grid */}
      {filtered.length === 0 ? (
        <Card className="border-border/60 p-10 text-center">
          <BookOpen className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-muted-foreground">{search || levelFilter !== 'all' || subjectFilter !== 'all' ? 'No assessments match your filters' : 'No assessments available yet.'}</p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map(exam => (
            <Card key={exam.id} className="border-border/60 p-5 hover:shadow-md transition-shadow">
              <div className="mb-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-semibold text-foreground truncate">{exam.title}</h3>
                  <p className="text-xs text-muted-foreground">{exam.subject}</p>
                </div>
                <Badge variant="outline" className={`text-[10px] shrink-0 ${getLevelColor(exam.level)}`}>{exam.level}</Badge>
              </div>

              <div className="mb-4 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{exam.duration} min</span>
                <span>{exam.questions} questions</span>
                {exam.access_type === 'invite_only' && <Badge variant="secondary" className="text-[10px]">Invite</Badge>}
              </div>

              {exam.status === 'completed' ? (
                <>
                  <div className="mb-3 p-2 rounded-lg bg-green-500/10 border border-green-500/20 text-xs font-semibold text-green-600 flex items-center gap-1.5 justify-center">
                    <CheckCircle className="h-3.5 w-3.5" /> Score: {exam.score}% — Completed
                  </div>
                  <Button variant="outline" size="sm" className="w-full gap-2 text-xs" onClick={() => router.push(`/dashboard/assessments/${exam.id}`)}>
                    <BookOpen className="h-3.5 w-3.5" /> View Results
                  </Button>
                </>
              ) : exam.status === 'submitted' ? (
                <>
                  <div className="mb-3 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs font-semibold text-amber-600 flex items-center gap-1.5 justify-center">
                    <Clock className="h-3.5 w-3.5" /> Submitted — Awaiting Review
                  </div>
                  <Button variant="outline" size="sm" className="w-full gap-2 text-xs" onClick={() => router.push(`/dashboard/assessments/${exam.id}`)}>
                    <Clock className="h-3.5 w-3.5" /> View Status
                  </Button>
                </>
              ) : (
                <Button size="sm" className="w-full gap-2 text-xs" onClick={() => router.push(`/dashboard/assessments/${exam.id}`)}>
                  <Play className="h-3.5 w-3.5" /> Start Assessment
                </Button>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
