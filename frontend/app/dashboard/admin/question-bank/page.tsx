'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { Database, Plus, Loader2, Trash2, Pencil, Sparkles, FileUp, Download, ChevronLeft, ChevronRight, X, Eye } from 'lucide-react'
import { BRANCHES, DEGREE_TYPES, BANK_QUESTION_TYPES, INDUSTRIES, LEVELS, ASSESSMENT_CATEGORIES, type QuestionType } from '@/lib/engineering-catalog'

interface BankQuestion {
  id: string
  title: string
  question: string
  type: QuestionType
  options?: string[]
  answer?: string
  explanation?: string
  difficulty: 'Easy' | 'Medium' | 'Hard'
  marks: number
  degree_type?: string
  branch?: string
  subject?: string
  tech_stack?: string[]
  tags?: string[]
  industry?: string
  level?: string
  assessment_category?: string
  source: string
}

interface Stats {
  total: number
  byDifficulty: Record<string, number>
  byType: Record<string, number>
  byBranch: Record<string, number>
  byDegree: Record<string, number>
}

const EMPTY_FORM = {
  title: '', question: '', type: 'mcq' as QuestionType, options: '', answer: '', explanation: '',
  difficulty: 'Medium' as 'Easy' | 'Medium' | 'Hard', marks: 10, degree_type: '', branch: '', subject: '', tech_stack: '', tags: '',
  industry: '', level: '', assessment_category: '',
}

export default function QuestionBankPage() {
  const gate = usePageGuard('superadmin')
  const addToast = useToast()

  const [rows, setRows] = useState<BankQuestion[]>([])
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [limit] = useState(20)

  const [branchFilter, setBranchFilter] = useState('')
  const [degreeFilter, setDegreeFilter] = useState('')
  const [difficultyFilter, setDifficultyFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [industryFilter, setIndustryFilter] = useState('')
  const [levelFilter, setLevelFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [search, setSearch] = useState('')

  const [editOpen, setEditOpen] = useState(false)
  const [editing, setEditing] = useState<BankQuestion | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })

  const [viewOpen, setViewOpen] = useState(false)
  const [viewing, setViewing] = useState<BankQuestion | null>(null)

  const [aiOpen, setAiOpen] = useState(false)
  const [aiForm, setAiForm] = useState({ branch: '', subject: '', difficulty: 'mixed', types: 'mcq', count: 25 })
  const [aiBusy, setAiBusy] = useState(false)

  const [importOpen, setImportOpen] = useState(false)
  const [importText, setImportText] = useState('')
  const [importBusy, setImportBusy] = useState(false)

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/question-bank/stats', { credentials: 'include' })
      if (res.ok) setStats(await res.json())
    } catch { /* ignore */ }
  }, [])

  const fetchRows = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) })
      if (branchFilter) params.set('branch', branchFilter)
      if (degreeFilter) params.set('degree_type', degreeFilter)
      if (difficultyFilter) params.set('difficulty', difficultyFilter)
      if (typeFilter) params.set('type', typeFilter)
      if (industryFilter) params.set('industry', industryFilter)
      if (levelFilter) params.set('level', levelFilter)
      if (categoryFilter) params.set('category', categoryFilter)
      if (search.trim()) params.set('q', search.trim())
      const res = await fetch(`/api/question-bank?${params}`, { credentials: 'include' })
      const json = await res.json()
      setRows(json.data || [])
      setTotal(json.total || 0)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [page, limit, branchFilter, degreeFilter, difficultyFilter, typeFilter, industryFilter, levelFilter, categoryFilter, search])

  useEffect(() => { fetchStats() }, [fetchStats])
  useEffect(() => { fetchRows() }, [fetchRows])

  const branchLabel = (id: string) => BRANCHES.find(b => b.id === id)?.short || id
  const degreeLabel = (id: string) => DEGREE_TYPES.find(d => d.id === id)?.label || id
  const industryLabel = (id: string) => INDUSTRIES.find(i => i.id === id)?.label || id
  const levelLabel = (id: string) => LEVELS.find(l => l.id === id)?.label || id
  const categoryLabel = (id: string) => ASSESSMENT_CATEGORIES.find(c => c.id === id)?.label || id

  const handleDelete = async (q: BankQuestion) => {
    await csrfFetch(`/api/question-bank?id=${q.id}`, { method: 'DELETE', credentials: 'include' })
    addToast({ type: 'success', title: 'Question deleted' })
    fetchRows(); fetchStats()
  }

  const openEdit = (q?: BankQuestion) => {
    setEditing(q || null)
    setForm(q ? {
      title: q.title, question: q.question, type: q.type, options: (q.options || []).join('\n'), answer: q.answer || '',
      explanation: q.explanation || '', difficulty: q.difficulty, marks: q.marks || 10, degree_type: q.degree_type || '',
      branch: q.branch || '', subject: q.subject || '', tech_stack: (q.tech_stack || []).join(', '), tags: (q.tags || []).join(', '),
      industry: q.industry || '', level: q.level || '', assessment_category: q.assessment_category || '',
    } : { ...EMPTY_FORM })
    setEditOpen(true)
  }

  const handleSave = async () => {
    if (!form.question.trim()) {
      addToast({ type: 'error', title: 'Question prompt is required' })
      return
    }
    const payload = {
      title: form.title.trim(), question: form.question.trim(), type: form.type,
      options: form.options.split('\n').map(s => s.trim()).filter(Boolean),
      answer: form.answer.trim(), explanation: form.explanation.trim(), difficulty: form.difficulty,
      marks: Number(form.marks) || 10, degree_type: form.degree_type, branch: form.branch,
      subject: form.subject.trim(), tech_stack: form.tech_stack.split(',').map(s => s.trim()).filter(Boolean),
      tags: form.tags.split(',').map(s => s.trim().replace(/^#/, '')).filter(Boolean),
      industry: form.industry || undefined, level: form.level || undefined, assessment_category: form.assessment_category || undefined,
    }
    const method = editing ? 'PATCH' : 'POST'
    const url = editing ? `/api/question-bank?id=${editing.id}` : '/api/question-bank'
    try {
      await csrfFetch(url, { method, headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(payload) })
      addToast({ type: 'success', title: editing ? 'Question updated' : 'Question added' })
      setEditOpen(false)
      fetchRows(); fetchStats()
    } catch {
      addToast({ type: 'error', title: editing ? 'Failed to update question' : 'Failed to add question' })
    }
  }

  const handleAiGenerate = async () => {
    if (!aiForm.branch && !aiForm.subject.trim()) {
      addToast({ type: 'error', title: 'Pick a branch or type a subject' })
      return
    }
    setAiBusy(true)
    try {
      const res = await csrfFetch('/api/question-bank/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({
          branch: aiForm.branch, subject: aiForm.subject.trim(), difficulty: aiForm.difficulty,
          types: aiForm.types.split(',').map(s => s.trim()).filter(Boolean), count: Number(aiForm.count) || 25,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      addToast({ type: 'success', title: `${json.inserted} question${json.inserted !== 1 ? 's' : ''} generated${json.skipped ? ` (${json.skipped} duplicates skipped)` : ''}` })
      fetchRows(); fetchStats()
    } catch (e) {
      addToast({ type: 'error', title: e instanceof Error ? e.message : 'AI generation failed' })
    } finally { setAiBusy(false) }
  }

  const handleImport = async () => {
    if (!importText.trim()) return
    setImportBusy(true)
    try {
      const res = await fetch('/api/question-bank/import', {
        method: 'POST', headers: { 'Content-Type': 'text/plain' }, credentials: 'include', body: importText,
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Import failed')
      addToast({ type: 'success', title: `Imported ${json.inserted} question${json.inserted !== 1 ? 's' : ''} (${json.skipped} skipped)` })
      setImportOpen(false)
      setImportText('')
      fetchRows(); fetchStats()
    } catch (e) {
      addToast({ type: 'error', title: e instanceof Error ? e.message : 'Import failed' })
    } finally { setImportBusy(false) }
  }

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'question-bank.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!gate.ready) return null

  const totalPages = Math.max(1, Math.ceil(total / limit))
  const diffColor = (d: string) => d === 'Hard' ? 'bg-red-500/20 text-red-700' : d === 'Medium' ? 'bg-yellow-500/20 text-yellow-700' : 'bg-green-500/20 text-green-700'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Database className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Engineering Question Bank</h1>
            <p className="text-muted-foreground text-sm">{stats ? `${stats.total} questions in bank` : `${total} shown`}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" className="gap-2" onClick={() => setAiOpen(true)}>
            <Sparkles className="w-4 h-4" />Generate with AI
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => setImportOpen(true)}>
            <FileUp className="w-4 h-4" />Import
          </Button>
          <Button variant="outline" className="gap-2" onClick={handleExport} disabled={rows.length === 0}>
            <Download className="w-4 h-4" />Export
          </Button>
          <Button className="gap-2" onClick={() => openEdit()}>
            <Plus className="w-4 h-4" />Add Question
          </Button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          <Card><CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-2xl font-bold">{stats.total}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Easy / Medium / Hard</p>
            <p className="text-2xl font-bold">{stats.byDifficulty.Easy || 0} <span className="text-sm text-muted-foreground font-normal">/</span> {stats.byDifficulty.Medium || 0} <span className="text-sm text-muted-foreground font-normal">/</span> {stats.byDifficulty.Hard || 0}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Branches covered</p>
            <p className="text-2xl font-bold">{Object.keys(stats.byBranch).length}</p>
            <p className="text-xs text-muted-foreground truncate">
              {Object.entries(stats.byBranch).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([b, c]) => `${branchLabel(b)} ${c}`).join(' · ')}
            </p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Coding / MCQ</p>
            <p className="text-2xl font-bold">{stats.byType.coding || 0} <span className="text-sm text-muted-foreground font-normal">/</span> {stats.byType.mcq || 0}</p>
          </CardContent></Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={branchFilter || 'all'} onValueChange={v => { setBranchFilter(v === 'all' ? '' : v); setPage(1) }}>
          <SelectTrigger className="h-9 w-[160px] text-sm"><SelectValue placeholder="All branches" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All branches</SelectItem>
            {BRANCHES.map(b => <SelectItem key={b.id} value={b.id}>{b.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={degreeFilter || 'all'} onValueChange={v => { setDegreeFilter(v === 'all' ? '' : v); setPage(1) }}>
          <SelectTrigger className="h-9 w-[140px] text-sm"><SelectValue placeholder="All degrees" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All degrees</SelectItem>
            {DEGREE_TYPES.map(d => <SelectItem key={d.id} value={d.id}>{d.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={difficultyFilter || 'all'} onValueChange={v => { setDifficultyFilter(v === 'all' ? '' : v); setPage(1) }}>
          <SelectTrigger className="h-9 w-[130px] text-sm"><SelectValue placeholder="All difficulty" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All difficulty</SelectItem>
            {['Easy', 'Medium', 'Hard'].map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={typeFilter || 'all'} onValueChange={v => { setTypeFilter(v === 'all' ? '' : v); setPage(1) }}>
          <SelectTrigger className="h-9 w-[130px] text-sm"><SelectValue placeholder="All types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {BANK_QUESTION_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={levelFilter || 'all'} onValueChange={v => { setLevelFilter(v === 'all' ? '' : v); setPage(1) }}>
          <SelectTrigger className="h-9 w-[120px] text-sm"><SelectValue placeholder="All levels" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All levels</SelectItem>
            {LEVELS.map(l => <SelectItem key={l.id} value={l.id}>{l.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={industryFilter || 'all'} onValueChange={v => { setIndustryFilter(v === 'all' ? '' : v); setPage(1) }}>
          <SelectTrigger className="h-9 w-[150px] text-sm"><SelectValue placeholder="All industries" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All industries</SelectItem>
            {INDUSTRIES.map(i => <SelectItem key={i.id} value={i.id}>{i.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={categoryFilter || 'all'} onValueChange={v => { setCategoryFilter(v === 'all' ? '' : v); setPage(1) }}>
          <SelectTrigger className="h-9 w-[130px] text-sm"><SelectValue placeholder="All categories" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {ASSESSMENT_CATEGORIES.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input
          placeholder="Search questions, subjects, tags..."
          className="h-9 flex-1 min-w-[200px] max-w-sm text-sm"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
        />
        <p className="text-xs text-muted-foreground ml-auto">{total} question{total !== 1 ? 's' : ''}</p>
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="text-left py-3 px-4 font-semibold text-xs">Question</th>
                <th className="text-left py-3 px-4 font-semibold text-xs">Branch</th>
                <th className="text-left py-3 px-4 font-semibold text-xs">Level</th>
                <th className="text-left py-3 px-4 font-semibold text-xs">Subject</th>
                <th className="text-left py-3 px-4 font-semibold text-xs">Difficulty</th>
                <th className="text-left py-3 px-4 font-semibold text-xs">Type</th>
                <th className="text-left py-3 px-4 font-semibold text-xs">Industry</th>
                <th className="text-left py-3 px-4 font-semibold text-xs">Marks</th>
                <th className="text-left py-3 px-4 font-semibold text-xs">Source</th>
                <th className="text-right py-3 px-4 font-semibold text-xs">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} className="py-12 text-center text-muted-foreground text-sm flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />Loading...
                </td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={10} className="py-12 text-center text-muted-foreground text-sm">
                  No questions found. Add one, import a CSV/JSON, or generate with AI.
                </td></tr>
              ) : rows.map(r => (
                <tr key={r.id} className="border-b border-border hover:bg-muted/50 transition-colors">
                  <td className="py-3 px-4 max-w-[320px]">
                    <p className="font-medium truncate">{r.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{r.question}</p>
                  </td>
                  <td className="py-3 px-4">{r.branch ? <Badge variant="outline">{branchLabel(r.branch)}</Badge> : <span className="text-muted-foreground text-xs">—</span>}</td>
                  <td className="py-3 px-4 text-xs">{r.level ? <Badge variant="outline">{levelLabel(r.level)}</Badge> : <span className="text-muted-foreground text-xs">—</span>}</td>
                  <td className="py-3 px-4 max-w-[140px] truncate text-xs">{r.subject || '—'}</td>
                  <td className="py-3 px-4"><Badge className={diffColor(r.difficulty)}>{r.difficulty}</Badge></td>
                  <td className="py-3 px-4 text-xs">{r.type}</td>
                  <td className="py-3 px-4 text-xs truncate max-w-[130px]">{r.industry ? industryLabel(r.industry) : <span className="text-muted-foreground text-xs">—</span>}</td>
                  <td className="py-3 px-4 text-xs">{r.marks}</td>
                  <td className="py-3 px-4 text-xs uppercase text-muted-foreground">{r.source || 'manual'}</td>
                  <td className="py-3 px-4 text-right">
                    <div className="inline-flex items-center gap-1">
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => { setViewing(r); setViewOpen(true) }} title="View"><Eye className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEdit(r)} title="Edit"><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive hover:text-destructive" onClick={() => handleDelete(r)} title="Delete"><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Page {page} of {totalPages}</p>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" className="h-8 text-xs" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-3 w-3 mr-1" />Prev
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
              Next<ChevronRight className="h-3 w-3 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Add / Edit modal */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Question' : 'Add Question'}</DialogTitle>
            <DialogDescription>Create or update an engineering question.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Short Title</Label>
              <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g., Time complexity of binary search" />
            </div>
            <div className="space-y-2">
              <Label>Question</Label>
              <Textarea value={form.question} onChange={e => setForm({ ...form, question: e.target.value })} rows={3} placeholder="Full question prompt" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={form.type} onValueChange={v => setForm({ ...form, type: v as QuestionType })}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{BANK_QUESTION_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Difficulty</Label>
                <Select value={form.difficulty} onValueChange={v => setForm({ ...form, difficulty: v as 'Easy' | 'Medium' | 'Hard' })}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Easy">Easy</SelectItem><SelectItem value="Medium">Medium</SelectItem><SelectItem value="Hard">Hard</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {['mcq', 'multiple_response', 'true_false', 'fill_blanks'].includes(form.type) && (
              <div className="space-y-2">
                <Label>Options (one per line)</Label>
                <Textarea value={form.options} onChange={e => setForm({ ...form, options: e.target.value })} rows={4} placeholder={form.type === 'true_false' ? 'True\nFalse' : 'Option 1\nOption 2\nOption 3\nOption 4'} />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Correct Answer</Label>
                <Input value={form.answer} onChange={e => setForm({ ...form, answer: e.target.value })} placeholder="Correct option text or explanation" />
              </div>
              <div className="space-y-2">
                <Label>Marks</Label>
                <Input type="number" min={1} value={form.marks} onChange={e => setForm({ ...form, marks: Number(e.target.value) || 10 })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Explanation</Label>
              <Textarea value={form.explanation} onChange={e => setForm({ ...form, explanation: e.target.value })} rows={2} placeholder="Optional — shown after answering" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Branch</Label>
                <Select value={form.branch} onValueChange={v => setForm({ ...form, branch: v })}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="General" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">General / None</SelectItem>
                    {BRANCHES.map(b => <SelectItem key={b.id} value={b.id}>{b.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Degree</Label>
                <Select value={form.degree_type} onValueChange={v => setForm({ ...form, degree_type: v })}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Any degree" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any degree</SelectItem>
                    {DEGREE_TYPES.map(d => <SelectItem key={d.id} value={d.id}>{d.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Industry</Label>
                <Select value={form.industry || 'none'} onValueChange={v => setForm({ ...form, industry: v === 'none' ? '' : v })}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {INDUSTRIES.map(i => <SelectItem key={i.id} value={i.id}>{i.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Level</Label>
                <Select value={form.level || 'none'} onValueChange={v => setForm({ ...form, level: v === 'none' ? '' : v })}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {LEVELS.map(l => <SelectItem key={l.id} value={l.id}>{l.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={form.assessment_category || 'none'} onValueChange={v => setForm({ ...form, assessment_category: v === 'none' ? '' : v })}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {ASSESSMENT_CATEGORIES.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Subject / Topic</Label>
              <Input value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} placeholder="e.g., Data Structures, Thermodynamics" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Tech Stack (comma separated)</Label>
                <Input value={form.tech_stack} onChange={e => setForm({ ...form, tech_stack: e.target.value })} placeholder="e.g., Java, React" />
              </div>
              <div className="space-y-2">
                <Label>Tags (comma separated)</Label>
                <Input value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} placeholder="e.g., arrays, dp" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>{editing ? 'Save Changes' : 'Add Question'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View modal */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-primary" />
              {viewing?.title || 'Question'}
              {viewing && (
                <span className="ml-auto flex items-center gap-1.5">
                  {viewing.branch && <Badge variant="outline">{branchLabel(viewing.branch)}</Badge>}
                  {viewing.level && <Badge variant="outline">{levelLabel(viewing.level)}</Badge>}
                  <Badge className={diffColor(viewing.difficulty)}>{viewing.difficulty}</Badge>
                  <Badge variant="outline">{viewing.type}</Badge>
                </span>
              )}
            </DialogTitle>
            <DialogDescription>Read-only view of the question and its answer.</DialogDescription>
          </DialogHeader>
          {viewing && (
            <div className="space-y-4 py-2 text-sm">
              <div className="rounded-lg border border-border bg-muted/40 p-4">
                <p className="text-sm font-medium leading-relaxed">{viewing.question}</p>
                {viewing.subject && <p className="mt-2 text-xs text-muted-foreground">Subject: {viewing.subject}</p>}
                {viewing.industry && <p className="text-xs text-muted-foreground">Industry: {industryLabel(viewing.industry)}</p>}
              </div>
              {viewing.options && viewing.options.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Options</p>
                  {viewing.options.map((opt, i) => (
                    <p key={i} className="rounded-md border border-border px-3 py-1.5">{opt}</p>
                  ))}
                </div>
              )}
              <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-4">
                <p className="text-xs font-semibold text-green-700 uppercase tracking-wide">Answer</p>
                <p className="mt-1 leading-relaxed">{viewing.answer || '—'}</p>
              </div>
              {viewing.explanation && (
                <div className="rounded-lg border border-border p-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Explanation</p>
                  <p className="mt-1 leading-relaxed">{viewing.explanation}</p>
                </div>
              )}
              {viewing.tags && viewing.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {viewing.tags.map((t, i) => <Badge key={i} variant="outline" className="text-xs">#{t}</Badge>)}
                </div>
              )}
              <p className="text-xs text-muted-foreground">Marks: {viewing.marks} · Source: {viewing.source || 'manual'}</p>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setViewOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI generate modal */}
      <Dialog open={aiOpen} onOpenChange={setAiOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary" />Generate with AI</DialogTitle>
            <DialogDescription>Bulk-generate MNC-standard questions into the bank.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Branch</Label>
              <Select value={aiForm.branch || 'all'} onValueChange={v => setAiForm({ ...aiForm, branch: v === 'all' ? '' : v })}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select branch" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">None (subject-driven)</SelectItem>
                  {BRANCHES.map(b => <SelectItem key={b.id} value={b.id}>{b.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Subject / Topic</Label>
              <Input value={aiForm.subject} onChange={e => setAiForm({ ...aiForm, subject: e.target.value })} placeholder="e.g., Binary Trees, Thermodynamics" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Difficulty</Label>
                <Select value={aiForm.difficulty} onValueChange={v => setAiForm({ ...aiForm, difficulty: v })}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mixed">Mixed</SelectItem>
                    <SelectItem value="Easy">Easy</SelectItem><SelectItem value="Medium">Medium</SelectItem><SelectItem value="Hard">Hard</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Count</Label>
                <Input type="number" min={1} max={1000} value={aiForm.count} onChange={e => setAiForm({ ...aiForm, count: Number(e.target.value) || 25 })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Question types (comma separated)</Label>
              <Input value={aiForm.types} onChange={e => setAiForm({ ...aiForm, types: e.target.value })} placeholder="mcq,true_false,coding" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAiOpen(false)}>Cancel</Button>
            <Button className="gap-2" onClick={handleAiGenerate} disabled={aiBusy}>
              {aiBusy ? <><Loader2 className="w-4 h-4 animate-spin" />Generating...</> : <><Sparkles className="w-4 h-4" />Generate</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import modal */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import Questions</DialogTitle>
            <DialogDescription>Paste JSON array or CSV (header: question,title,type,options,answer,explanation,difficulty,branch,degree_type,subject,tags,marks). Options pipe-delimited.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Textarea value={importText} onChange={e => setImportText(e.target.value)} rows={10} placeholder='[{"question":"...","type":"mcq","options":["A","B","C","D"],"answer":"A","difficulty":"Easy","branch":"cse"}]' />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}><X className="w-3.5 h-3.5 mr-1" />Cancel</Button>
            <Button className="gap-2" onClick={handleImport} disabled={importBusy || !importText.trim()}>
              {importBusy ? <><Loader2 className="w-4 h-4 animate-spin" />Importing...</> : <><FileUp className="w-4 h-4" />Import</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
