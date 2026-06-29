'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Clock, BookOpen, Play, Loader } from 'lucide-react'

interface Exam {
  id: string
  title: string
  subject: string
  level: string
  duration: number
  questions: number
  passingScore: number
  description: string
  status: string
  score?: number
  date?: string
}

export default function ExamsPage() {
  const [exams, setExams] = useState<Exam[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState({ level: '', subject: '' })

  useEffect(() => {
    fetch('/api/exams')
      .then(r => r.json())
      .then(json => { if (json.data) setExams(json.data) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const filteredExams = exams.filter(exam =>
    (!filter.level || exam.level === filter.level) &&
    (!filter.subject || exam.subject === filter.subject)
  )

  const getLevelColor = (level: string) => {
    const l = level.toLowerCase()
    if (l === 'beginner') return 'bg-green-500/20 text-green-700'
    if (l === 'intermediate') return 'bg-yellow-500/20 text-yellow-700'
    if (l === 'advanced') return 'bg-red-500/20 text-red-700'
    return 'bg-muted text-muted-foreground'
  }

  if (loading) return <div className="flex justify-center py-20"><Loader className="h-6 w-6 animate-spin text-muted-foreground" /></div>

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Exams</h1>
        <p className="text-muted-foreground mt-1">Take certification exams to validate your skills</p>
      </div>

      {exams.length === 0 ? (
        <Card className="border-border/60 p-10 text-center">
          <BookOpen className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-muted-foreground">No exams available yet.</p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filteredExams.map(exam => (
            <Card key={exam.id} className="border-border/60 p-5">
              <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-foreground">{exam.title}</h3>
                  <p className="text-xs text-muted-foreground">{exam.subject}</p>
                </div>
                <Badge variant="outline" className={getLevelColor(exam.level)}>{exam.level}</Badge>
              </div>
              <p className="mb-4 line-clamp-2 text-xs text-muted-foreground">{exam.description}</p>
              <div className="mb-4 flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{exam.duration} min</span>
                <span>{exam.questions} questions</span>
                <span>Pass: {exam.passingScore}%</span>
              </div>
              {exam.status === 'completed' ? (
                <div className="mb-3 p-2 rounded bg-green-500/10 text-xs text-green-700">
                  Score: {exam.score}% - Completed
                </div>
              ) : null}
              <Button variant="outline" size="sm" className="w-full gap-2">
                <Play className="h-3.5 w-3.5" />
                {exam.status === 'completed' ? 'Retake' : 'Start'} Exam
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
