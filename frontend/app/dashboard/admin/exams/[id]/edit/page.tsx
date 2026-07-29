'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Loader2, ArrowLeft, RefreshCw, Trash2, CheckCircle, Code, List, Plus, Edit3, X, Save, CheckSquare, HelpCircle, FileText, Type, Upload } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type QuestionType = 'mcq' | 'multiple_response' | 'true_false' | 'coding' | 'descriptive' | 'fill_blanks'

const QUESTION_TYPE_META: Record<QuestionType, { label: string; icon: React.ReactNode }> = {
  mcq: { label: 'Multiple Choice', icon: <List className="h-3 w-3 mr-1" /> },
  multiple_response: { label: 'Multiple Response', icon: <CheckSquare className="h-3 w-3 mr-1" /> },
  true_false: { label: 'True / False', icon: <HelpCircle className="h-3 w-3 mr-1" /> },
  coding: { label: 'Coding Challenge', icon: <Code className="h-3 w-3 mr-1" /> },
  descriptive: { label: 'Descriptive', icon: <FileText className="h-3 w-3 mr-1" /> },
  fill_blanks: { label: 'Fill in the Blanks', icon: <Type className="h-3 w-3 mr-1" /> },
}

interface Question {
  id: string
  type: QuestionType
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
  techStack?: string[]
  duration: number
  questions: number
  questionList: Question[]
  published: boolean
}

function parseQuestions(raw: string): { questions: Question[]; errors: string[] } {
  const errors: string[] = []
  const trimmed = raw.trim()
  if (!trimmed) return { questions: [], errors: ['No content provided'] }

  // Try JSON
  try {
    const arr = JSON.parse(trimmed)
    if (Array.isArray(arr) && arr.length > 0) {
      const mapped = arr.map((item: any, i: number) => {
        const type: QuestionType = ['mcq','multiple_response','true_false','coding','descriptive','fill_blanks'].includes(item.type) ? item.type : 'mcq'
        const opts = Array.isArray(item.options) ? item.options.map(String).filter(Boolean) : undefined
        return {
          id: crypto.randomUUID(),
          type,
          title: String(item.title || item.question || `Question ${i + 1}`),
          prompt: String(item.prompt || item.description || ''),
          options: ['mcq','multiple_response','true_false','fill_blanks'].includes(type) && opts?.length ? opts : undefined,
          answer: item.answer ? String(item.answer) : undefined,
          score: Number(item.score) || 10,
        }
      })
      return { questions: mapped, errors }
    }
  } catch {}

  // Try CSV (header: type,title,prompt,options,answer,score)
  const lines = trimmed.split('\n').map(l => l.trim()).filter(Boolean)
  if (lines.length >= 2 && lines[0].toLowerCase().includes('type')) {
    const parsed: Question[] = []
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',').map(s => s.trim().replace(/^"(.*)"$/, '$1'))
      if (parts.length < 2) { errors.push(`Row ${i + 1}: too few columns`); continue }
      const type: QuestionType = ['mcq','multiple_response','true_false','coding','descriptive','fill_blanks'].includes(parts[0]) ? parts[0] as QuestionType : 'mcq'
      const opts = parts[3] ? parts[3].split('|').map(s => s.trim()).filter(Boolean) : undefined
      parsed.push({
        id: crypto.randomUUID(),
        type,
        title: parts[1] || `Question ${i}`,
        prompt: parts[2] || '',
        options: ['mcq','multiple_response','true_false','fill_blanks'].includes(type) && opts?.length ? opts : undefined,
        answer: parts[4] || undefined,
        score: parseInt(parts[5]) || 10,
      })
    }
    if (parsed.length) return { questions: parsed, errors }
  }

  // Fallback: plain text — each block separated by blank line
  const blocks = trimmed.split(/\n\s*\n/).filter(Boolean)
  if (blocks.length) {
    return {
      questions: blocks.map((block, i) => ({
        id: crypto.randomUUID(),
        type: 'descriptive' as QuestionType,
        title: `Question ${i + 1}`,
        prompt: block,
        options: undefined,
        answer: undefined,
        score: 10,
      })),
      errors,
    }
  }

  return { questions: [], errors: ['Could not parse any questions'] }
}

const emptyQuestion = (): Question => ({
  id: crypto.randomUUID(),
  type: 'mcq',
  title: '',
  prompt: '',
  options: ['', '', '', ''],
  answer: '',
  score: 10,
})

export default function ExamReviewPage() {
  const gate = usePageGuard('superadmin')
  const addToast = useToast()
  const router = useRouter()
  const params = useParams()
  
  const [exam, setExam] = useState<Exam | null>(null)
  const [loading, setLoading] = useState(true)
  const [publishing, setPublishing] = useState(false)
  const [questionModal, setQuestionModal] = useState(false)
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null)
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null)
  const [importModal, setImportModal] = useState(false)
  const [importText, setImportText] = useState('')
  const [importedPreview, setImportedPreview] = useState<Question[] | null>(null)

  const fetchExam = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/exams', { credentials: 'include' })
      const json = await res.json()
      const found = json.data?.find((e: Exam) => e.id === params.id)
      if (found) {
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

  const saveExam = async (updatedList: Question[]) => {
    if (!exam) return
    try {
      await csrfFetch('/api/exams', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: exam.id, questionList: updatedList, questions: updatedList.length })
      })
    } catch {
      addToast({ type: 'error', title: 'Failed to save exam' })
    }
  }

  const handleDeleteQuestion = async (qId: string) => {
    if (!exam) return
    const newQuestions = exam.questionList.filter(q => q.id !== qId)
    setExam({ ...exam, questionList: newQuestions })
    await saveExam(newQuestions)
    addToast({ type: 'success', title: 'Question removed' })
  }

  const handleRegenerateQuestion = async (qId: string) => {
    if (!exam) return
    setRegeneratingId(qId)
    try {
      const res = await fetch('/api/ai/generate-problem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          role: exam.subject || 'Software Engineer',
          difficulty: exam.level?.toLowerCase() || 'medium',
          topics: exam.techStack || [],
          language_hint: (exam.techStack || [])[0]?.toLowerCase() || 'python',
        }),
      })
      const data = await res.json()
      const newQuestions = exam.questionList.map(q => {
        if (q.id === qId) {
          const p = data.problem || {}
          return {
            ...q,
            title: String(p.title || q.title),
            prompt: String(p.statement_md || q.prompt),
            type: 'coding' as const,
            options: undefined,
            answer: undefined,
            score: 10,
          }
        }
        return q
      })
      setExam({ ...exam, questionList: newQuestions })
      await saveExam(newQuestions)
      addToast({ type: 'success', title: 'Question regenerated!' })
    } catch {
      addToast({ type: 'error', title: 'AI regeneration failed' })
    } finally {
      setRegeneratingId(null)
    }
  }

  const openAddQuestion = () => {
    setEditingQuestion(emptyQuestion())
    setQuestionModal(true)
  }

  const openEditQuestion = (q: Question) => {
    setEditingQuestion({ ...q })
    setQuestionModal(true)
  }

  const saveQuestion = () => {
    if (!editingQuestion || !exam) return
    if (!editingQuestion.title || !editingQuestion.prompt) {
      addToast({ type: 'error', title: 'Title and prompt are required' })
      return
    }
    if (editingQuestion.type === 'mcq') {
      const validOptions = (editingQuestion.options || []).filter(o => o.trim())
      if (validOptions.length < 2) {
        addToast({ type: 'error', title: 'MCQ needs at least 2 options' })
        return
      }
      if (!editingQuestion.answer) {
        addToast({ type: 'error', title: 'Please mark the correct answer' })
        return
      }
    }
    const exists = exam.questionList.find(q => q.id === editingQuestion.id)
    const newQuestions = exists
      ? exam.questionList.map(q => q.id === editingQuestion.id ? editingQuestion : q)
      : [...exam.questionList, editingQuestion]
    setExam({ ...exam, questionList: newQuestions })
    saveExam(newQuestions)
    setQuestionModal(false)
    addToast({ type: 'success', title: exists ? 'Question updated' : 'Question added' })
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
        <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading questions...
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
            <Badge variant={exam.published ? 'default' : 'secondary'}>
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
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold mb-1">Questions ({exam.questionList.length})</h2>
            <p className="text-muted-foreground text-sm">
              Review the questions for this assessment. You can add, edit, or remove questions.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { setImportText(''); setImportedPreview(null); setImportModal(true) }} className="gap-2">
              <Upload className="h-4 w-4" /> Import
            </Button>
            <Button onClick={openAddQuestion} className="gap-2">
              <Plus className="h-4 w-4" /> Add Question
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          {exam.questionList.map((q, idx) => (
            <div key={q.id} className="border rounded-md p-4 bg-muted/20 relative group">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline" className="bg-background">
                    {QUESTION_TYPE_META[q.type]?.icon}
                    {QUESTION_TYPE_META[q.type]?.label || q.type}
                  </Badge>
                  <span className="text-sm font-medium text-muted-foreground">Q{idx + 1}</span>
                  <span className="text-xs text-muted-foreground">({q.score} pts)</span>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button size="sm" variant="ghost" onClick={() => openEditQuestion(q)} className="h-8">
                    <Edit3 className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleRegenerateQuestion(q.id)} disabled={regeneratingId === q.id} className="h-8">
                    {regeneratingId === q.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleDeleteQuestion(q.id)} className="h-8 text-destructive hover:bg-destructive/10">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <h3 className="text-lg font-medium">{q.title}</h3>
              <p className="text-sm mt-2 text-foreground/80 whitespace-pre-wrap">{q.prompt}</p>
              
              {q.options && q.options.length > 0 && ['mcq', 'multiple_response', 'true_false', 'fill_blanks'].includes(q.type) && (
                <div className="mt-4 space-y-2">
                  {q.options.map((opt, i) => {
                    const isCorrect = q.type === 'multiple_response'
                      ? (q.answer || '').split(',').map(s => s.trim()).includes(opt)
                      : opt === q.answer
                    return (
                      <div key={i} className={`p-2 border rounded text-sm ${isCorrect ? 'bg-primary/10 border-primary/30 font-medium' : 'bg-background'}`}>
                        <span className={q.type === 'multiple_response' ? 'flex items-center gap-2' : ''}>
                          {q.type === 'multiple_response' && (
                            <CheckSquare className={`h-3.5 w-3.5 ${isCorrect ? 'text-primary' : 'text-muted-foreground'}`} />
                          )}
                          {opt}
                          {isCorrect && <span className="text-xs text-primary ml-2">({q.type === 'multiple_response' ? 'Correct' : 'Correct Answer'})</span>}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
          {exam.questionList.length === 0 && (
            <div className="text-center py-12 border border-dashed rounded-lg text-muted-foreground">
              No questions yet. Click "Add Question" to create one manually.
            </div>
          )}
        </div>
      </div>

      <Dialog open={importModal} onOpenChange={setImportModal}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Import Questions</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Paste JSON, CSV, or plain text</Label>
              <p className="text-xs text-muted-foreground">
                <strong>JSON:</strong> [{'{type, title, prompt, options[], answer, score}'}]<br />
                <strong>CSV:</strong> type,title,prompt,options,answer,score (options pipe-delimited, header required)<br />
                <strong>Plain text:</strong> blank-line separated blocks become descriptive questions
              </p>
              <div className="max-h-[400px] overflow-y-auto border rounded-md">
                <Textarea
                  value={importText}
                  onChange={(e) => {
                    setImportText(e.target.value)
                    setImportedPreview(null)
                  }}
                  rows={20}
                  placeholder='Paste JSON, CSV, or text here...'
                  className="font-mono text-sm min-h-[300px] border-0 focus-visible:ring-0 rounded-none"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => {
                const fileInput = document.getElementById('import-file-input')
                if (fileInput) fileInput.click()
              }} className="gap-2">
                <Upload className="h-4 w-4" /> Upload File (.csv, .json, .txt)
              </Button>
              <input
                id="import-file-input"
                type="file"
                accept=".csv,.json,.txt"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  setImportText(await file.text())
                  setImportedPreview(null)
                }}
              />
              <Button onClick={() => {
                const result = parseQuestions(importText)
                if (result.questions.length) {
                  setImportedPreview(result.questions)
                } else {
                  addToast({ type: 'error', title: result.errors[0] || 'No questions found' })
                }
              }} disabled={!importText.trim()}>
                Preview
              </Button>
            </div>
            {importedPreview && (
              <div className="border rounded-md p-3 bg-muted/20 space-y-2">
                <p className="text-sm font-medium">{importedPreview.length} question{importedPreview.length !== 1 ? 's' : ''} parsed</p>
                <div className="max-h-48 overflow-y-auto space-y-1 text-xs text-muted-foreground">
                  {importedPreview.map((q, i) => (
                    <div key={q.id} className="flex gap-2">
                      <span className="font-mono text-primary shrink-0">Q{i + 1}</span>
                      <span className="font-medium text-foreground truncate">{q.title || 'Untitled'}</span>
                      <Badge variant="outline" className="ml-auto text-[10px]">{q.type}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportModal(false)}>Cancel</Button>
            <Button disabled={!importedPreview || importedPreview.length === 0} onClick={async () => {
              if (!importedPreview || !exam) return
              const newQuestions = [...exam.questionList, ...importedPreview]
              setExam({ ...exam, questionList: newQuestions })
              await saveExam(newQuestions)
              setImportModal(false)
              setImportedPreview(null)
              setImportText('')
              addToast({ type: 'success', title: `${importedPreview.length} questions imported` })
            }}>
              <Upload className="h-4 w-4 mr-2" /> Import {importedPreview?.length || 0} Questions
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={questionModal} onOpenChange={setQuestionModal}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>{exam.questionList.find(q => q.id === editingQuestion?.id) ? 'Edit Question' : 'Add Question'}</DialogTitle>
          </DialogHeader>
          {editingQuestion && (
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>Question Type</Label>
                <Select value={editingQuestion.type} onValueChange={(v: QuestionType) => {
                  const needsOptions = ['mcq', 'multiple_response', 'true_false', 'fill_blanks'].includes(v)
                  setEditingQuestion({
                    ...editingQuestion,
                    type: v,
                    options: needsOptions ? (v === 'true_false' ? ['True', 'False'] : ['', '', '', '']) : undefined,
                    answer: undefined,
                  })
                }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(QUESTION_TYPE_META).map(([key, meta]) => (
                      <SelectItem key={key} value={key}>{meta.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="q-title">Title</Label>
                <Input id="q-title" value={editingQuestion.title} onChange={(e) => setEditingQuestion({ ...editingQuestion, title: e.target.value })} placeholder="e.g. Java Exception Handling" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="q-prompt">Prompt / Description</Label>
                <Textarea id="q-prompt" value={editingQuestion.prompt} onChange={(e) => setEditingQuestion({ ...editingQuestion, prompt: e.target.value })} rows={4} placeholder="Describe the question or coding task..." />
              </div>
              {['mcq', 'multiple_response', 'true_false', 'fill_blanks'].includes(editingQuestion.type) && (
                <div className="grid gap-3">
                  <Label>Options</Label>
                  {editingQuestion.options?.map((opt, i) => {
                    const isMulti = editingQuestion.type === 'multiple_response'
                    const checked = isMulti
                      ? (editingQuestion.answer || '').split(',').map(s => s.trim()).includes(opt)
                      : editingQuestion.answer === opt
                    return (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          type={isMulti ? 'checkbox' : 'radio'}
                          name="correct-answer"
                          checked={checked}
                          onChange={() => {
                            if (isMulti) {
                              const current = (editingQuestion.answer || '').split(',').map(s => s.trim()).filter(Boolean)
                              const newAnswer = current.includes(opt)
                                ? current.filter(a => a !== opt).join(', ')
                                : [...current, opt].join(', ')
                              setEditingQuestion({ ...editingQuestion, answer: newAnswer })
                            } else {
                              setEditingQuestion({ ...editingQuestion, answer: opt })
                            }
                          }}
                          className="h-4 w-4"
                        />
                        <Input
                          value={opt}
                          onChange={(e) => {
                            const newOpts = [...(editingQuestion.options || [])]
                            newOpts[i] = e.target.value
                            const oldAnswer = isMulti
                              ? (editingQuestion.answer || '')
                              : (editingQuestion.answer === opt ? e.target.value : editingQuestion.answer)
                            setEditingQuestion({ ...editingQuestion, options: newOpts, answer: oldAnswer })
                          }}
                          placeholder={`Option ${i + 1}`}
                        />
                      </div>
                    )
                  })}
                  <p className="text-xs text-muted-foreground">
                    {editingQuestion.type === 'multiple_response'
                      ? 'Check all correct options'
                      : 'Select the radio button next to the correct answer'}
                  </p>
                </div>
              )}
              <div className="grid gap-2">
                <Label htmlFor="q-score">Score (points)</Label>
                <Input id="q-score" type="number" min="0" value={editingQuestion.score} onChange={(e) => setEditingQuestion({ ...editingQuestion, score: parseInt(e.target.value) || 0 })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuestionModal(false)}>Cancel</Button>
            <Button onClick={saveQuestion}>
              <Save className="h-4 w-4 mr-2" /> Save Question
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
