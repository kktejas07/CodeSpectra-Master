'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Loader2, ArrowLeft, RefreshCw, Trash2, CheckCircle, Code, List, Plus, Edit3, X, Save, CheckSquare, HelpCircle, FileText, Type, Upload, Download, Pencil, Database, Link2, Copy } from 'lucide-react'
import { SkeletonText, SkeletonList } from '@/components/ui/skeleton-boneyard'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { BRANCHES, DEGREE_TYPES, SCREENING_TYPES, BANK_QUESTION_TYPES, INDUSTRIES, LEVELS, ASSESSMENT_CATEGORIES } from '@/lib/engineering-catalog'

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

interface BankQuestionRow {
  id: string
  title: string
  question: string
  type: QuestionType
  options?: string[]
  answer?: string
  explanation?: string
  difficulty: string
  marks: number
  branch?: string
  subject?: string
  level?: string
  industry?: string
  tags?: string[]
  source: string
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
  cert_template?: string
  degree_type?: string
  branch?: string
  screening_type?: string
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
        const rawType = String(item.type || '').toLowerCase().trim().replace(/[-_]/g, '')
        let type: QuestionType = 'mcq'
        if (['descriptive', 'openended', 'essay', 'shortanswer'].includes(rawType)) {
          type = 'descriptive'
        } else if (['mcq', 'multiplechoice', 'singlechoice'].includes(rawType)) {
          type = 'mcq'
        } else if (['multipleresponse', 'multiselect'].includes(rawType)) {
          type = 'multiple_response'
        } else if (['truefalse', 'boolean', 'tf'].includes(rawType)) {
          type = 'true_false'
        } else if (['coding', 'code', 'programming'].includes(rawType)) {
          type = 'coding'
        } else if (['fillblanks', 'fillintheblanks', 'fib'].includes(rawType)) {
          type = 'fill_blanks'
        } else {
          type = ['mcq','multiple_response','true_false','coding','descriptive','fill_blanks'].includes(item.type) ? item.type : 'mcq'
        }

        const opts = Array.isArray(item.options) ? item.options.map(String).filter(Boolean) : undefined
        const titleVal = item.title || item.category || (item.question && item.question.length > 60 ? item.question.slice(0, 60) + '...' : item.question) || `Question ${i + 1}`
        
        return {
          id: crypto.randomUUID(),
          type,
          title: String(titleVal),
          prompt: String(item.prompt || item.question || item.description || ''),
          options: ['mcq','multiple_response','true_false','fill_blanks'].includes(type) && opts?.length ? opts : undefined,
          answer: item.answer ? String(item.answer) : undefined,
          score: Number(item.score || item.marks || item.points) || 10,
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
  const gate = usePageGuard('tenant_admin')
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
  const [bankModal, setBankModal] = useState(false)
  const [bankLoading, setBankLoading] = useState(false)
  const [bankRows, setBankRows] = useState<BankQuestionRow[]>([])
  const [bankTotal, setBankTotal] = useState(0)
  const [bankPage, setBankPage] = useState(1)
  const [bankBranch, setBankBranch] = useState('')
  const [bankLevel, setBankLevel] = useState('')
  const [bankType, setBankType] = useState('')
  const [bankIndustry, setBankIndustry] = useState('')
  const [bankQ, setBankQ] = useState('')
  const [bankSelected, setBankSelected] = useState<Set<string>>(new Set())
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [deletingSelected, setDeletingSelected] = useState(false)
  const [editingMeta, setEditingMeta] = useState(false)
  const [metaTitle, setMetaTitle] = useState('')
  const [metaSubject, setMetaSubject] = useState('')
  const [metaLevel, setMetaLevel] = useState('')
  const [metaDuration, setMetaDuration] = useState(30)
  const [metaCertTemplate, setMetaCertTemplate] = useState('classic')
  const [metaDegreeType, setMetaDegreeType] = useState('')
  const [metaBranch, setMetaBranch] = useState('')
  const [metaScreeningType, setMetaScreeningType] = useState('mixed')
  const [savingMeta, setSavingMeta] = useState(false)

  const fetchExam = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/exams', { credentials: 'include' })
      const json = await res.json()
      const found = json.data?.find((e: Exam) => e.id === params.id)
      if (found) {
        found.questionList = found.questionList || []
        setExam(found)
        setMetaTitle(found.title || '')
        setMetaSubject(found.subject || '')
        setMetaLevel(found.level || found.difficulty_level || '')
        setMetaDuration(found.duration || 30)
        setMetaCertTemplate(found.cert_template || 'classic')
        setMetaDegreeType(found.degree_type || '')
        setMetaBranch(found.branch || '')
        setMetaScreeningType(found.screening_type || 'mixed')
      } else {
        addToast({ type: 'error', title: 'Assessment not found' })
        router.push('/dashboard/admin/assessments')
      }
    } catch { 
      addToast({ type: 'error', title: 'Failed to load assessment' })
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
        body: JSON.stringify({ id: exam.id, questionList: updatedList, questions: updatedList.length, title: exam.title, subject: exam.subject, level: exam.level, duration: exam.duration })
      })
    } catch {
      addToast({ type: 'error', title: 'Failed to save exam' })
    }
  }

  const saveExamMeta = async () => {
    if (!exam) return
    setSavingMeta(true)
    try {
      await csrfFetch('/api/exams', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          id: exam.id,
          title: metaTitle,
          subject: metaSubject,
          level: metaLevel,
          difficulty_level: metaLevel,
          duration: metaDuration,
          cert_template: metaCertTemplate,
          degree_type: metaDegreeType,
          branch: metaBranch,
          screening_type: metaScreeningType,
        })
      })
      setExam({ ...exam, title: metaTitle, subject: metaSubject, level: metaLevel, duration: metaDuration, cert_template: metaCertTemplate, degree_type: metaDegreeType, branch: metaBranch, screening_type: metaScreeningType })
      setEditingMeta(false)
      addToast({ type: 'success', title: 'Assessment details updated' })
    } catch {
      addToast({ type: 'error', title: 'Failed to update assessment details' })
    } finally {
      setSavingMeta(false)
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

  const fetchBankRows = async () => {
    if (!bankModal) return
    setBankLoading(true)
    try {
      const params = new URLSearchParams({ page: String(bankPage), limit: '20' })
      if (bankBranch) params.set('branch', bankBranch)
      if (bankLevel) params.set('level', bankLevel)
      if (bankType) params.set('type', bankType)
      if (bankIndustry) params.set('industry', bankIndustry)
      if (bankQ.trim()) params.set('q', bankQ.trim())
      const res = await fetch(`/api/question-bank?${params}`, { credentials: 'include' })
      const json = await res.json()
      setBankRows(json.data || [])
      setBankTotal(json.total || 0)
    } catch { /* ignore */ }
    finally { setBankLoading(false) }
  }

  const openBankModal = () => {
    setBankModal(true)
    setBankPage(1)
    setBankSelected(new Set())
    fetchBankRows()
  }

  useEffect(() => {
    if (bankModal) fetchBankRows()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bankModal, bankPage, bankBranch, bankLevel, bankType, bankIndustry, bankQ])

  const addSelectedFromBank = async () => {
    if (!exam || bankSelected.size === 0) return
    const picked = bankRows.filter(r => bankSelected.has(r.id))
    const existingIds = new Set(exam.questionList.map(q => q.id))
    const newQuestions: Question[] = picked
      .filter(r => !existingIds.has(r.id))
      .map(r => ({
        id: r.id,
        type: r.type,
        title: r.title || r.question.slice(0, 60),
        prompt: r.question,
        options: r.options || [],
        answer: r.answer,
        score: r.marks || 10,
      }))
    if (newQuestions.length === 0) {
      addToast({ type: 'error', title: 'All selected questions are already in this exam' })
      return
    }
    const updated = [...exam.questionList, ...newQuestions]
    setExam({ ...exam, questionList: updated })
    await saveExam(updated)
    setBankSelected(new Set())
    setBankModal(false)
    addToast({ type: 'success', title: `Added ${newQuestions.length} question${newQuestions.length !== 1 ? 's' : ''} from bank` })
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
          title: exam.title,
          subject: exam.subject,
          level: exam.level,
          duration: exam.duration,
          questionList: exam.questionList,
          questions: exam.questionList.length,
          published: true 
        })
      })
      addToast({ type: 'success', title: 'Assessment Published!' })
      router.push('/dashboard/admin/assessments')
    } catch {
      addToast({ type: 'error', title: 'Failed to publish assessment' })
    } finally {
      setPublishing(false)
    }
  }

  if (!gate.ready) return null

  if (loading) {
    return (
      <div className="space-y-6 pb-12">
        <div className="space-y-2">
          <SkeletonText lines={1} />
          <SkeletonText lines={2} />
        </div>
        <div className="bg-card border rounded-lg p-6 space-y-4">
          <SkeletonText lines={1} />
          <SkeletonList count={3} />
        </div>
      </div>
    )
  }

  if (!exam) return null

  return (
    <div className="space-y-6 pb-12">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-muted-foreground hover:text-foreground cursor-pointer text-sm mb-2" onClick={() => router.push('/dashboard/admin/assessments')}>
            <ArrowLeft className="h-4 w-4" /> Back to Assessments
          </div>
          {editingMeta ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Input
                  value={metaTitle}
                  onChange={(e) => setMetaTitle(e.target.value)}
                  className="text-2xl font-bold h-auto py-1 min-w-50 max-w-[400px]"
                  placeholder="Assessment Title"
                />
                <Button size="sm" onClick={saveExamMeta} disabled={savingMeta}>
                  {savingMeta ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingMeta(false)}>
                  <X className="h-4 w-4 mr-1" /> Cancel
                </Button>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <Label className="text-xs text-muted-foreground whitespace-nowrap">Role:</Label>
                  <Input
                    value={metaSubject}
                    onChange={(e) => setMetaSubject(e.target.value)}
                    className="h-8 w-32 text-sm"
                    placeholder="e.g. Frontend"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <Label className="text-xs text-muted-foreground whitespace-nowrap">Level:</Label>
                  <Select value={metaLevel} onValueChange={setMetaLevel}>
                    <SelectTrigger className="h-8 w-32 text-sm">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Beginner">Beginner</SelectItem>
                      <SelectItem value="Intermediate">Intermediate</SelectItem>
                      <SelectItem value="Advanced">Advanced</SelectItem>
                      <SelectItem value="Expert">Expert</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-1.5">
                  <Label className="text-xs text-muted-foreground whitespace-nowrap">Duration (mins):</Label>
                  <Input
                    type="number"
                    value={metaDuration}
                    onChange={(e) => setMetaDuration(parseInt(e.target.value) || 30)}
                    className="h-8 w-20 text-sm"
                    min="1"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <Label className="text-xs text-muted-foreground whitespace-nowrap">Cert Template:</Label>
                  <select
                    value={metaCertTemplate}
                    onChange={(e) => setMetaCertTemplate(e.target.value)}
                    className="h-8 rounded-md border border-border/60 bg-background px-2 py-1 text-xs"
                  >
                    <option value="classic">Classic</option>
                    <option value="modern">Modern</option>
                    <option value="minimal">Minimal</option>
                  </select>
                </div>
                <div className="flex items-center gap-1.5">
                  <Label className="text-xs text-muted-foreground whitespace-nowrap">Degree:</Label>
                  <Select value={metaDegreeType || 'any'} onValueChange={v => setMetaDegreeType(v === 'any' ? '' : v)}>
                    <SelectTrigger className="h-8 w-32 text-sm">
                      <SelectValue placeholder="Any degree" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any degree</SelectItem>
                      {DEGREE_TYPES.map(d => <SelectItem key={d.id} value={d.id}>{d.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-1.5">
                  <Label className="text-xs text-muted-foreground whitespace-nowrap">Branch:</Label>
                  <Select value={metaBranch || 'any'} onValueChange={v => setMetaBranch(v === 'any' ? '' : v)}>
                    <SelectTrigger className="h-8 w-36 text-sm">
                      <SelectValue placeholder="General" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">General / all</SelectItem>
                      {BRANCHES.map(b => <SelectItem key={b.id} value={b.id}>{b.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-1.5">
                  <Label className="text-xs text-muted-foreground whitespace-nowrap">Screening:</Label>
                  <Select value={metaScreeningType} onValueChange={setMetaScreeningType}>
                    <SelectTrigger className="h-8 w-36 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SCREENING_TYPES.map(s => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          ) : (
            <>
              <h1 className="text-3xl font-bold tracking-tight">
                {exam.title}
                <Button variant="ghost" size="sm" className="ml-2 h-7 w-7 p-0" onClick={() => setEditingMeta(true)} title="Edit exam details">
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </h1>
              <div className="flex items-center gap-2 mt-2">
                {exam.subject && <Badge variant="outline">{exam.subject}</Badge>}
                {exam.degree_type && <Badge variant="outline">{DEGREE_TYPES.find(d => d.id === exam.degree_type)?.label || exam.degree_type}</Badge>}
                {exam.branch && <Badge variant="outline">{BRANCHES.find(b => b.id === exam.branch)?.short || exam.branch}</Badge>}
                {exam.screening_type && <Badge variant="outline">{SCREENING_TYPES.find(s => s.id === exam.screening_type)?.short || exam.screening_type}</Badge>}
                <Badge variant="outline">{exam.level || 'N/A'}</Badge>
                <Badge variant="outline">{exam.duration} mins</Badge>
                <Badge variant={exam.published ? 'default' : 'secondary'}>
                  {exam.published ? 'Published' : 'Draft'}
                </Badge>
              </div>
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => router.push('/dashboard/admin/assessments')}>Save as Draft</Button>
          <Button onClick={handlePublish} disabled={publishing} className="bg-green-600 hover:bg-green-700 text-white">
            {publishing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
            Publish Assessment
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
            {selectedIds.size > 0 && (
              <Button variant="destructive" size="sm" disabled={deletingSelected} onClick={async () => {
                setDeletingSelected(true)
                const remaining = exam.questionList.filter(q => !selectedIds.has(q.id))
                setExam({ ...exam, questionList: remaining })
                await saveExam(remaining)
                setSelectedIds(new Set())
                setDeletingSelected(false)
                addToast({ type: 'success', title: `${selectedIds.size} questions removed` })
              }} className="gap-2">
                {deletingSelected ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Delete {selectedIds.size}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => {
              if (selectedIds.size === exam.questionList.length) {
                setSelectedIds(new Set())
              } else {
                setSelectedIds(new Set(exam.questionList.map(q => q.id)))
              }
            }} className="gap-2">
              <CheckSquare className="h-4 w-4" />
              {selectedIds.size === exam.questionList.length ? 'Deselect All' : 'Select All'}
            </Button>
            <Button variant="outline" onClick={() => { setImportText(''); setImportedPreview(null); setImportModal(true) }} className="gap-2">
              <Upload className="h-4 w-4" /> Import
            </Button>
            <Button variant="outline" onClick={openBankModal} className="gap-2">
              <Database className="h-4 w-4" /> Pull from Bank
            </Button>
            <Button onClick={openAddQuestion} className="gap-2">
              <Plus className="h-4 w-4" /> Add Question
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          {exam.questionList.map((q, idx) => (
            <div key={q.id} className={`border rounded-md p-4 bg-muted/20 relative group transition-colors ${selectedIds.has(q.id) ? 'border-primary ring-1 ring-primary/30' : ''}`}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2 mb-2">
                  <button onClick={() => {
                    const next = new Set(selectedIds)
                    if (next.has(q.id)) next.delete(q.id)
                    else next.add(q.id)
                    setSelectedIds(next)
                  }} className={`shrink-0 w-5 h-5 rounded border flex items-center justify-center transition-colors ${selectedIds.has(q.id) ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground/30 hover:border-muted-foreground/60'}`}>
                    {selectedIds.has(q.id) && <CheckSquare className="w-3.5 h-3.5" />}
                  </button>
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
          {/* ponytail: the API strips questionList for non-admin sessions, so
              exam.questions > 0 with an empty list means a stale/forbidden
              session — not an empty exam. Say so instead of misleading. */}
          {exam.questionList.length === 0 && (exam.questions || 0) > 0 && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
              <p className="font-medium text-amber-700 dark:text-amber-400">
                Expected {exam.questions} questions, but the server sent none.
              </p>
              <p className="mt-1 text-muted-foreground">
                This usually means your session lost admin rights. Try reloading — if it
                persists, sign out and sign back in, then reopen this page.
              </p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="outline" onClick={() => void fetchExam()}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1" /> Retry
                </Button>
                <Button size="sm" variant="outline" onClick={() => router.push('/auth/login')}>
                  Sign in again
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <Dialog open={importModal} onOpenChange={setImportModal}>
        <DialogContent className="sm:max-w-150 max-h-[90vh] overflow-y-auto">
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
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={() => {
                const sample = [
                  { type: 'mcq', title: 'Basic SQL Query', prompt: 'Which SQL clause is used to filter records?', options: ['WHERE', 'HAVING', 'FILTER', 'MATCH'], answer: 'WHERE', score: 10 },
                  { type: 'true_false', title: 'JavaScript Hoisting', prompt: 'In JavaScript, variable declarations using `var` are hoisted to the top of their scope.', options: ['True', 'False'], answer: 'True', score: 5 },
                  { type: 'coding', title: 'Reverse a String', prompt: 'Write a function that reverses a string without using built-in reverse methods.', score: 20 },
                  { type: 'descriptive', title: 'Explain REST', prompt: 'Explain the principles of RESTful API design and its key constraints.', score: 15 },
                  { type: 'multiple_response', title: 'CSS Selectors', prompt: 'Which of the following are valid CSS selectors?', options: ['.class', '#id', '$name', ':hover'], answer: '.class, #id, :hover', score: 10 },
                  { type: 'fill_blanks', title: 'HTTP Status Codes', prompt: 'HTTP 200 means ___, 404 means ___, and 500 means ___.', options: ['OK', 'Not Found', 'Server Error'], answer: 'OK, Not Found, Server Error', score: 5 },
                ]
                const blob = new Blob([JSON.stringify(sample, null, 2)], { type: 'application/json' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url; a.download = 'sample-questions.json'; a.click()
                URL.revokeObjectURL(url)
              }} className="gap-2">
                <Download className="h-4 w-4" /> Sample
              </Button>
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

      {/* Pull from Question Bank modal */}
      <Dialog open={bankModal} onOpenChange={setBankModal}>
        <DialogContent className="sm:max-w-200 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Database className="h-4 w-4 text-primary" /> Pull from Question Bank
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                placeholder="Search bank questions..."
                value={bankQ}
                onChange={(e) => setBankQ(e.target.value)}
                className="h-9 flex-1 min-w-[180px] text-sm"
              />
              <Select value={bankBranch || 'all'} onValueChange={v => { setBankBranch(v === 'all' ? '' : v); setBankPage(1) }}>
                <SelectTrigger className="h-9 w-[150px] text-sm"><SelectValue placeholder="All branches" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All branches</SelectItem>
                  {BRANCHES.map(b => <SelectItem key={b.id} value={b.id}>{b.short}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={bankLevel || 'all'} onValueChange={v => { setBankLevel(v === 'all' ? '' : v); setBankPage(1) }}>
                <SelectTrigger className="h-9 w-[110px] text-sm"><SelectValue placeholder="All levels" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All levels</SelectItem>
                  {LEVELS.map(l => <SelectItem key={l.id} value={l.id}>{l.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={bankType || 'all'} onValueChange={v => { setBankType(v === 'all' ? '' : v); setBankPage(1) }}>
                <SelectTrigger className="h-9 w-[120px] text-sm"><SelectValue placeholder="All types" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {BANK_QUESTION_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={bankIndustry || 'all'} onValueChange={v => { setBankIndustry(v === 'all' ? '' : v); setBankPage(1) }}>
                <SelectTrigger className="h-9 w-[130px] text-sm"><SelectValue placeholder="All industries" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All industries</SelectItem>
                  {INDUSTRIES.map(i => <SelectItem key={i.id} value={i.id}>{i.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {bankLoading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading bank questions...
              </div>
            ) : bankRows.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm border border-dashed rounded-lg">
                No bank questions match. Try clearing filters.
              </div>
            ) : (
              <div className="max-h-[400px] overflow-y-auto border rounded-md">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b border-border sticky top-0">
                    <tr>
                      <th className="py-2 px-3 w-10">
                        <input
                          type="checkbox"
                          checked={bankRows.length > 0 && bankRows.every(r => bankSelected.has(r.id))}
                          onChange={(e) => {
                            const next = new Set(bankSelected)
                            if (e.target.checked) bankRows.forEach(r => next.add(r.id))
                            else bankRows.forEach(r => next.delete(r.id))
                            setBankSelected(next)
                          }}
                          className="h-4 w-4"
                        />
                      </th>
                      <th className="text-left py-2 px-3 font-semibold text-xs">Question</th>
                      <th className="text-left py-2 px-3 font-semibold text-xs">Type</th>
                      <th className="text-left py-2 px-3 font-semibold text-xs">Difficulty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bankRows.map(r => (
                      <tr key={r.id} className="border-b border-border hover:bg-muted/40">
                        <td className="py-2 px-3">
                          <input
                            type="checkbox"
                            checked={bankSelected.has(r.id)}
                            onChange={(e) => {
                              const next = new Set(bankSelected)
                              if (e.target.checked) next.add(r.id)
                              else next.delete(r.id)
                              setBankSelected(next)
                            }}
                            className="h-4 w-4"
                          />
                        </td>
                        <td className="py-2 px-3 max-w-[380px]">
                          <p className="font-medium truncate">{r.title || r.question}</p>
                          <p className="text-xs text-muted-foreground truncate">{r.question}</p>
                        </td>
                        <td className="py-2 px-3 text-xs">{r.type}</td>
                        <td className="py-2 px-3 text-xs">{r.difficulty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{bankTotal} question{bankTotal !== 1 ? 's' : ''} · {bankSelected.size} selected</span>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" className="h-8 text-xs" disabled={bankPage <= 1} onClick={() => setBankPage(p => p - 1)}>Prev</Button>
                <Button variant="outline" size="sm" className="h-8 text-xs" disabled={bankPage * 20 >= bankTotal} onClick={() => setBankPage(p => p + 1)}>Next</Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBankModal(false)}>Cancel</Button>
            <Button disabled={bankSelected.size === 0} onClick={addSelectedFromBank} className="gap-2">
              <Database className="h-4 w-4" /> Add {bankSelected.size || 0} Selected
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={questionModal} onOpenChange={setQuestionModal}>
        <DialogContent className="sm:max-w-150 max-h-[90vh] overflow-y-auto">
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
              {/* Model Answer for coding/descriptive types */}
              {['coding', 'descriptive'].includes(editingQuestion.type) && (
                <div className="grid gap-2">
                  <Label htmlFor="q-model-answer">Model Answer / Rubric</Label>
                  <Textarea
                    id="q-model-answer"
                    value={editingQuestion.answer || ''}
                    onChange={(e) => setEditingQuestion({ ...editingQuestion, answer: e.target.value })}
                    rows={5}
                    placeholder={editingQuestion.type === 'coding'
                      ? 'Paste the expected code solution or key patterns to look for...'
                      : 'Write the ideal answer or grading rubric / key points...'}
                    className="font-mono text-xs"
                  />
                  <p className="text-xs text-muted-foreground">
                    This will be shown to the reviewer side-by-side with the candidate&apos;s answer during manual grading.
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
