'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { BookOpen, Plus, Edit, Trash2, Eye } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'

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

  const [exams, setExams] = useState<Exam[]>([
    {
      id: '1',
      title: 'JavaScript Fundamentals',
      subject: 'JavaScript',
      level: 'Beginner',
      duration: 60,
      questions: 50,
      published: true,
      attempts: 234,
      avgScore: 72,
    },
    {
      id: '2',
      title: 'React Advanced Patterns',
      subject: 'React',
      level: 'Advanced',
      duration: 90,
      questions: 40,
      published: true,
      attempts: 156,
      avgScore: 68,
    },
  ])

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newExam, setNewExam] = useState({ title: '', subject: '', level: 'Beginner' })

  if (!gate.ready) return <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">Loading…</div>

  const handleCreateExam = (e: React.FormEvent) => {
    e.preventDefault()
    const exam: Exam = {
      id: String(exams.length + 1),
      ...newExam,
      duration: 60,
      questions: 0,
      published: false,
      attempts: 0,
      avgScore: 0,
    }
    setExams([exam, ...exams])
    setNewExam({ title: '', subject: '', level: 'Beginner' })
    setShowCreateModal(false)
  }

  const handleDelete = (id: string) => {
    setExams(exams.filter(e => e.id !== id))
  }

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'Beginner':
        return 'bg-green-500/20 text-green-700'
      case 'Intermediate':
        return 'bg-yellow-500/20 text-yellow-700'
      case 'Advanced':
        return 'bg-red-500/20 text-red-700'
      default:
        return ''
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
            <BookOpen className="w-8 h-8 text-primary" />
            Exam Management
          </h1>
          <p className="text-muted-foreground mt-2">Create and manage coding exams</p>
        </div>
        <Button onClick={() => setShowCreateModal(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          Create Exam
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Total Exams</p>
          <p className="text-3xl font-bold text-foreground">{exams.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Published</p>
          <p className="text-3xl font-bold text-green-600">{exams.filter(e => e.published).length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Total Attempts</p>
          <p className="text-3xl font-bold text-primary">{exams.reduce((sum, e) => sum + e.attempts, 0)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Avg Score</p>
          <p className="text-3xl font-bold text-blue-600">
            {(exams.reduce((sum, e) => sum + e.avgScore, 0) / exams.length).toFixed(1)}%
          </p>
        </Card>
      </div>

      {/* Exams Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/50">
              <tr>
                <th className="px-6 py-3 text-left font-semibold">Title</th>
                <th className="px-6 py-3 text-left font-semibold">Subject</th>
                <th className="px-6 py-3 text-left font-semibold">Level</th>
                <th className="px-6 py-3 text-left font-semibold">Questions</th>
                <th className="px-6 py-3 text-left font-semibold">Attempts</th>
                <th className="px-6 py-3 text-left font-semibold">Avg Score</th>
                <th className="px-6 py-3 text-left font-semibold">Status</th>
                <th className="px-6 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {exams.map((exam) => (
                <tr key={exam.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-6 py-3 font-medium">{exam.title}</td>
                  <td className="px-6 py-3">{exam.subject}</td>
                  <td className="px-6 py-3">
                    <Badge className={getLevelColor(exam.level)}>{exam.level}</Badge>
                  </td>
                  <td className="px-6 py-3">{exam.questions}</td>
                  <td className="px-6 py-3">{exam.attempts}</td>
                  <td className="px-6 py-3 font-semibold">{exam.avgScore}%</td>
                  <td className="px-6 py-3">
                    <Badge className={exam.published ? 'bg-green-500/20 text-green-700' : 'bg-gray-500/20 text-gray-700'}>
                      {exam.published ? 'Published' : 'Draft'}
                    </Badge>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <div className="flex gap-2 justify-end">
                      <Button variant="ghost" size="sm">
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm">
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(exam.id)}>
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Create Exam Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md p-6">
            <h2 className="text-xl font-bold text-foreground mb-4">Create New Exam</h2>
            <form onSubmit={handleCreateExam} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Exam Title</label>
                <input
                  type="text"
                  value={newExam.title}
                  onChange={(e) => setNewExam({ ...newExam, title: e.target.value })}
                  className="w-full px-3 py-2 rounded border border-border bg-background text-foreground"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Subject</label>
                <input
                  type="text"
                  value={newExam.subject}
                  onChange={(e) => setNewExam({ ...newExam, subject: e.target.value })}
                  className="w-full px-3 py-2 rounded border border-border bg-background text-foreground"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Level</label>
                <select
                  value={newExam.level}
                  onChange={(e) => setNewExam({ ...newExam, level: e.target.value })}
                  className="w-full px-3 py-2 rounded border border-border bg-background text-foreground"
                >
                  <option>Beginner</option>
                  <option>Intermediate</option>
                  <option>Advanced</option>
                </select>
              </div>
              <div className="flex gap-3">
                <Button type="submit" className="flex-1">
                  Create Exam
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  )
}
