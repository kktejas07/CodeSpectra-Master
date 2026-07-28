'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { BookOpen, Plus, Loader2, Trash2 } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { DataTable, type DataTableColumn, type BulkAction } from '@/components/ui/data-table'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'

interface Exam {
  id: string
  title: string
  subject: string
  level: string
  duration: number
  questions: number
  published: boolean
  attempts: number
  avgScore: number
}

export default function AdminExamsPage() {
  const gate = usePageGuard('superadmin')
  const addToast = useToast()
  const [exams, setExams] = useState<Exam[]>([])
  const [loading, setLoading] = useState(true)

  const fetchExams = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/exams', { credentials: 'include' })
      const json = await res.json()
      setExams(json.data || [])
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchExams() }, [])

  const handleDelete = async (ids: string[]) => {
    for (const id of ids) {
      await csrfFetch(`/api/exams?id=${id}`, { method: 'DELETE', credentials: 'include' })
    }
    addToast({ type: 'success', title: `${ids.length} exam${ids.length !== 1 ? 's' : ''} deleted` })
    setExams(prev => prev.filter(e => !ids.includes(e.id)))
  }

  const columns: DataTableColumn<Exam>[] = [
    { key: 'title', header: 'Title', cell: (r) => <span className="font-medium">{r.title}</span> },
    { key: 'subject', header: 'Subject', cell: (r) => r.subject },
    { key: 'level', header: 'Level', cell: (r) => r.level },
    { key: 'duration', header: 'Duration', cell: (r) => `${r.duration} min` },
    { key: 'questions', header: 'Questions', cell: (r) => r.questions },
    { key: 'status', header: 'Status', cell: (r) => (
      <Badge className={r.published ? 'bg-green-500/20 text-green-700' : 'bg-gray-500/20 text-gray-700'}>
        {r.published ? 'Published' : 'Draft'}
      </Badge>
    )},
    { key: 'stats', header: 'Stats', cell: (r) => (
      <span className="text-xs text-muted-foreground">{r.attempts} attempts · {r.avgScore}% avg</span>
    )},
  ]

  const bulkActions: BulkAction[] = [
    { label: 'Delete', variant: 'destructive', icon: <Trash2 className="w-3.5 h-3.5 mr-1" />, onClick: handleDelete },
  ]

  if (!gate.ready) return null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <BookOpen className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Exam Management</h1>
            <p className="text-muted-foreground text-sm">{exams.length} exams</p>
          </div>
        </div>
        <Button className="gap-2" onClick={() => {
          const title = prompt('Exam title:')
          if (!title) return
          const subject = prompt('Subject:') || ''
          const level = prompt('Level (Beginner/Intermediate/Advanced):') || 'Beginner'
          const duration = parseInt(prompt('Duration (minutes):') || '60')
          const questions = parseInt(prompt('Number of questions:') || '0')
          csrfFetch('/api/exams', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
            body: JSON.stringify({ title, subject, level, duration, questions, published: false }),
          }).then(() => fetchExams()).then(() => addToast({ type: 'success', title: 'Exam created' }))
            .catch(() => addToast({ type: 'error', title: 'Failed to create exam' }))
        }}>
          <Plus className="w-4 h-4" />Add Exam
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />Loading exams...
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={exams}
          searchPlaceholder="Search exams..."
          searchKeys={['title', 'subject', 'level']}
          bulkActions={bulkActions}
          loading={loading}
          emptyMessage="No exams. Click 'Add Exam' to create one."
        />
      )}
    </div>
  )
}
