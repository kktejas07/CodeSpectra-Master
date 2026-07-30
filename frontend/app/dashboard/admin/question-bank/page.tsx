'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Database, Plus, Loader2, Trash2 } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { DataTable, type DataTableColumn, type BulkAction } from '@/components/ui/data-table'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Question {
  id: string
  title: string
  domain: string
  difficulty: string
  type: string
  tags: string[]
}

export default function QuestionBankPage() {
  const gate = usePageGuard('superadmin')
  const addToast = useToast()
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [newQuestion, setNewQuestion] = useState({ title: '', domain: '', difficulty: 'Medium' })

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/question-bank', { credentials: 'include' })
      const json = await res.json()
      setQuestions(json.data || [])
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchData() }, [])

  const handleDelete = async (ids: string[]) => {
    for (const id of ids) {
      await csrfFetch(`/api/question-bank?id=${id}`, { method: 'DELETE', credentials: 'include' })
    }
    addToast({ type: 'success', title: `${ids.length} question${ids.length !== 1 ? 's' : ''} deleted` })
    setQuestions(prev => prev.filter(q => !ids.includes(q.id)))
  }

  const columns: DataTableColumn<Question>[] = [
    { key: 'title', header: 'Title', cell: (r) => <span className="font-medium">{r.title}</span> },
    { key: 'domain', header: 'Domain', cell: (r) => <Badge variant="outline">{r.domain}</Badge> },
    { key: 'difficulty', header: 'Difficulty', cell: (r) => (
      <Badge className={r.difficulty === 'Hard' ? 'bg-red-500/20 text-red-700' : r.difficulty === 'Medium' ? 'bg-yellow-500/20 text-yellow-700' : 'bg-green-500/20 text-green-700'}>
        {r.difficulty}
      </Badge>
    )},
    { key: 'type', header: 'Type', cell: (r) => r.type },
    { key: 'tags', header: 'Tags', cell: (r) => (
      <div className="flex flex-wrap gap-1">
        {(r.tags || []).slice(0, 3).map(t => <Badge key={t} className="text-[10px] bg-muted">{t}</Badge>)}
        {(r.tags || []).length > 3 && <span className="text-[10px] text-muted-foreground">+{r.tags.length - 3}</span>}
      </div>
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
            <Database className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Engineering Question Bank</h1>
            <p className="text-muted-foreground text-sm">{questions.length} questions</p>
          </div>
        </div>
        <Button className="gap-2" onClick={() => {
          setNewQuestion({ title: '', domain: '', difficulty: 'Medium' })
          setAddModalOpen(true)
        }}>
          <Plus className="w-4 h-4" />Add Question
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />Loading questions...
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={questions}
          searchPlaceholder="Search questions..."
          searchKeys={['title', 'domain']}
          filters={[{
            label: 'Difficulty', key: 'difficulty',
            options: [{ label: 'Easy', value: 'Easy' }, { label: 'Medium', value: 'Medium' }, { label: 'Hard', value: 'Hard' }],
          }]}
          bulkActions={bulkActions}
          loading={loading}
          emptyMessage="No questions. Add one to get started."
        />
      )}

      <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Question</DialogTitle>
            <DialogDescription>Create a new engineering question.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Question Title</Label>
              <Input 
                value={newQuestion.title} 
                onChange={e => setNewQuestion({...newQuestion, title: e.target.value})} 
                placeholder="Enter question title"
              />
            </div>
            <div className="space-y-2">
              <Label>Domain</Label>
              <Input 
                value={newQuestion.domain} 
                onChange={e => setNewQuestion({...newQuestion, domain: e.target.value})} 
                placeholder="e.g., Mechanical, Civil"
              />
            </div>
            <div className="space-y-2">
              <Label>Difficulty</Label>
              <select 
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                value={newQuestion.difficulty}
                onChange={e => setNewQuestion({...newQuestion, difficulty: e.target.value})}
              >
                <option value="Easy">Easy</option>
                <option value="Medium">Medium</option>
                <option value="Hard">Hard</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddModalOpen(false)}>Cancel</Button>
            <Button onClick={() => {
              if (!newQuestion.title) {
                addToast({ type: 'error', title: 'Title is required' })
                return
              }
              csrfFetch('/api/question-bank', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
                body: JSON.stringify({ ...newQuestion, type: 'MCQ' }),
              }).then(() => { 
                fetchData(); 
                addToast({ type: 'success', title: 'Question added' });
                setAddModalOpen(false)
              })
              .catch(() => addToast({ type: 'error', title: 'Failed to add question' }))
            }}>Save Question</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
