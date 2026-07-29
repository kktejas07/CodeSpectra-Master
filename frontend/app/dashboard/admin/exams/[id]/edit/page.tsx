'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, ArrowLeft, RefreshCw, Trash2, CheckCircle, Code, List } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'

interface Question {
  id: string
  type: 'mcq' | 'coding'
  title: string
  prompt: string
  options?: string[]
  answer?: string
  score: number
}

interface Exam {
  id: string
  title: string
  subject: string
  level: string
  duration: number
  questions: number
  questionList: Question[]
  published: boolean
}

export default function ExamReviewPage() {
  const gate = usePageGuard('superadmin')
  const addToast = useToast()
  const router = useRouter()
  const params = useParams()
  
  const [exam, setExam] = useState<Exam | null>(null)
  const [loading, setLoading] = useState(true)
  const [publishing, setPublishing] = useState(false)

  const fetchExam = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/exams`, { credentials: 'include' })
      const json = await res.json()
      const found = json.data?.find((e: Exam) => e.id === params.id)
      if (found) {
        // Ensure questionList exists
        found.questionList = found.questionList || []
        setExam(found)
      } else {
        addToast({ type: 'error', title: 'Exam not found' })
        router.push('/dashboard/admin/exams')
      }
    } catch { 
      addToast({ type: 'error', title: 'Failed to load exam' })
    } finally { 
      setLoading(false) 
    }
  }

  useEffect(() => {
    if (params.id) fetchExam()
  }, [params.id])

  const handleDeleteQuestion = async (qId: string) => {
    if (!exam) return
    const newQuestions = exam.questionList.filter(q => q.id !== qId)
    setExam({ ...exam, questionList: newQuestions })
  }

  const handleRegenerateQuestion = async (qId: string) => {
    if (!exam) return
    // Mock regeneration by swapping out the prompt
    const newQuestions = exam.questionList.map(q => {
      if (q.id === qId) {
        return {
          ...q,
          title: q.title + ' (Regenerated)',
          prompt: q.prompt + ' Here is a new AI-generated variation of this question.',
        }
      }
      return q
    })
    setExam({ ...exam, questionList: newQuestions })
    addToast({ type: 'success', title: 'AI Regenerated question!' })
  }

  const handlePublish = async () => {
    if (!exam) return
    setPublishing(true)
    try {
      await csrfFetch('/api/exams', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ 
          id: exam.id, 
          questionList: exam.questionList,
          questions: exam.questionList.length,
          published: true 
        })
      })
      addToast({ type: 'success', title: 'Exam Published!' })
      router.push('/dashboard/admin/exams')
    } catch {
      addToast({ type: 'error', title: 'Failed to publish exam' })
    } finally {
      setPublishing(false)
    }
  }

  if (!gate.ready) return null

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading AI generated questions...
      </div>
    )
  }

  if (!exam) return null

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12 p-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-muted-foreground hover:text-foreground cursor-pointer text-sm mb-2" onClick={() => router.push('/dashboard/admin/exams')}>
            <ArrowLeft className="h-4 w-4" /> Back to Exams
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Review Exam: {exam.title}</h1>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="outline">{exam.level}</Badge>
            <Badge variant="outline">{exam.duration} mins</Badge>
            <Badge variant={exam.published ? "default" : "secondary"}>
              {exam.published ? 'Published' : 'Draft'}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => router.push('/dashboard/admin/exams')}>Save as Draft</Button>
          <Button onClick={handlePublish} disabled={publishing} className="bg-green-600 hover:bg-green-700 text-white">
            {publishing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
            Publish Exam
          </Button>
        </div>
      </div>

      <div className="bg-card border rounded-lg p-6 space-y-6">
        <div>
          <h2 className="text-xl font-semibold mb-1">AI Generated Questions</h2>
          <p className="text-muted-foreground text-sm mb-4">Review the {exam.questionList.length} questions generated for this assessment. You can regenerate or remove them before publishing.</p>
        </div>

        <div className="space-y-4">
          {exam.questionList.map((q, idx) => (
            <div key={q.id} className="border rounded-md p-4 bg-muted/20 relative group">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline" className="bg-background">
                    {q.type === 'coding' ? <Code className="h-3 w-3 mr-1" /> : <List className="h-3 w-3 mr-1" />}
                    {q.type === 'coding' ? 'Coding Challenge' : 'Multiple Choice'}
                  </Badge>
                  <span className="text-sm font-medium text-muted-foreground">Q{idx + 1}</span>
                </div>
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button size="sm" variant="outline" onClick={() => handleRegenerateQuestion(q.id)} className="h-8">
                    <RefreshCw className="h-3.5 w-3.5 mr-1" /> Regenerate
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleDeleteQuestion(q.id)} className="h-8 text-destructive hover:bg-destructive/10">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <h3 className="text-lg font-medium">{q.title}</h3>
              <p className="text-sm mt-2 text-foreground/80">{q.prompt}</p>
              
              {q.type === 'mcq' && q.options && (
                <div className="mt-4 space-y-2">
                  {q.options.map((opt, i) => (
                    <div key={i} className={`p-2 border rounded text-sm ${opt === q.answer ? 'bg-primary/10 border-primary/30 font-medium' : 'bg-background'}`}>
                      {opt} {opt === q.answer && <span className="text-xs text-primary ml-2">(Correct Answer)</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          {exam.questionList.length === 0 && (
            <div className="text-center py-12 border border-dashed rounded-lg text-muted-foreground">
              No questions found. Delete this exam and try generating a new one.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
