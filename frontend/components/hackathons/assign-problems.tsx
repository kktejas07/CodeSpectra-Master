'use client'

import { useState, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { csrfFetch } from '@/lib/csrf-fetch'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Search, Plus, Trash2, GripVertical, BookOpen, Sparkles, Eye,
  ChevronDown, ChevronUp, ArrowUp, ArrowDown, CheckCircle,
} from 'lucide-react'

interface ProblemOption {
  slug: string
  title: string
  difficulty: string
  topics?: string[]
}

interface AssignedProblem {
  slug: string
  title: string
  points: number
  difficulty: string
  required: boolean
  order: number
}

interface AssignProblemsProps {
  assigned: AssignedProblem[]
  onChange: (problems: AssignedProblem[]) => void
  onSearch: (query: string) => void
  searchResults: ProblemOption[]
  searching: boolean
  onPreview?: (problem: ProblemOption) => void
}

type ProblemSource = 'pick' | 'own' | 'ai'

export function AssignProblems({
  assigned,
  onChange,
  onSearch,
  searchResults,
  searching,
  onPreview,
}: AssignProblemsProps) {
  const [problemSource, setProblemSource] = useState<ProblemSource>('pick')
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedProblem, setExpandedProblem] = useState<string | null>(null)
  const [previewProblem, setPreviewProblem] = useState<ProblemOption | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)

  // Own problem form state
  const [ownForm, setOwnForm] = useState({
    title: '',
    difficulty: 'medium' as 'easy' | 'medium' | 'hard',
    points: 100,
    topics: '',
    statement_md: '',
    input_format: '',
    output_format: '',
    constraints: '',
  })
  const [ownTestCases, setOwnTestCases] = useState<{ stdin: string; expected: string; is_sample: boolean }[]>([
    { stdin: '', expected: '', is_sample: true },
  ])

  // AI generation state
  const [aiConfig, setAiConfig] = useState({
    role: 'Software Engineer',
    difficulty: 'medium' as 'easy' | 'medium' | 'hard',
    topics: '',
    language_hint: 'python',
    count: 1,
  })

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query)
    onSearch(query)
  }, [onSearch])

  const addProblem = (problem: ProblemOption) => {
    if (assigned.find(p => p.slug === problem.slug)) return
    onChange([...assigned, {
      slug: problem.slug,
      title: problem.title,
      points: 100,
      difficulty: problem.difficulty,
      required: true,
      order: assigned.length,
    }])
  }

  const removeProblem = (slug: string) => {
    onChange(assigned.filter(p => p.slug !== slug))
  }

  const updateProblem = (slug: string, updates: Partial<AssignedProblem>) => {
    onChange(assigned.map(p => p.slug === slug ? { ...p, ...updates } : p))
  }

  const moveProblem = (index: number, direction: 'up' | 'down') => {
    const newAssigned = [...assigned]
    const newIndex = direction === 'up' ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= newAssigned.length) return
    ;[newAssigned[index], newAssigned[newIndex]] = [newAssigned[newIndex], newAssigned[index]]
    // Update order values
    newAssigned.forEach((p, i) => { p.order = i })
    onChange(newAssigned)
  }

  const difficultyColor = (d: string) => {
    switch (d) {
      case 'easy': return 'text-green-700 dark:text-green-400 border-green-500/30'
      case 'medium': return 'text-amber-700 dark:text-amber-400 border-amber-500/30'
      case 'hard': return 'text-red-600 dark:text-red-400 border-red-500/30'
      default: return 'text-muted-foreground'
    }
  }

  return (
    <div className="space-y-6">
      {/* Source selector */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setProblemSource('pick')}
          className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all cursor-pointer ${
            problemSource === 'pick' ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card hover:bg-muted/50'
          }`}
        >
          <Search className="h-4 w-4" /> Pick from library
        </button>
        <button
          onClick={() => setProblemSource('own')}
          className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all cursor-pointer ${
            problemSource === 'own' ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card hover:bg-muted/50'
          }`}
        >
          <BookOpen className="h-4 w-4" /> Create your own
        </button>
        <button
          onClick={() => setProblemSource('ai')}
          className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all cursor-pointer ${
            problemSource === 'ai' ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card hover:bg-muted/50'
          }`}
        >
          <Sparkles className="h-4 w-4" /> Generate with AI
        </button>
      </div>

      {/* Source-specific content */}
      {problemSource === 'pick' && (
        <PickFromLibrary
          searchQuery={searchQuery}
          onSearch={handleSearch}
          results={searchResults}
          searching={searching}
          assigned={assigned}
          onAdd={addProblem}
          onPreview={onPreview || setPreviewProblem}
        />
      )}

      {problemSource === 'own' && (
        <CreateCustomProblem
          form={ownForm}
          setForm={setOwnForm}
          testCases={ownTestCases}
          setTestCases={setOwnTestCases}
          onAdd={(problem) => {
            addProblem(problem)
            setOwnForm({ title: '', difficulty: 'medium', points: 100, topics: '', statement_md: '', input_format: '', output_format: '', constraints: '' })
            setOwnTestCases([{ stdin: '', expected: '', is_sample: true }])
          }}
        />
      )}

      {problemSource === 'ai' && (
        <AIGenerate
          config={aiConfig}
          setConfig={setAiConfig}
          onGenerate={(problem) => addProblem(problem)}
        />
      )}

      {/* Assigned problems list */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold">Assigned problems (<span className="tabular-nums">{assigned.length}</span>)</h4>
          {assigned.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => setShowAddForm(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Quick add
            </Button>
          )}
        </div>

        {assigned.length === 0 ? (
          <Card className="rounded-2xl p-8 text-center border-dashed">
            <Target className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No problems assigned yet</p>
            <p className="text-xs text-muted-foreground mt-1">Use the options above to add problems</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {assigned.map((problem, index) => (
              <ProblemCard
                key={problem.slug}
                problem={problem}
                index={index}
                total={assigned.length}
                isExpanded={expandedProblem === problem.slug}
                onToggleExpand={() => setExpandedProblem(expandedProblem === problem.slug ? null : problem.slug)}
                onUpdate={(updates) => updateProblem(problem.slug, updates)}
                onRemove={() => removeProblem(problem.slug)}
                onMoveUp={() => moveProblem(index, 'up')}
                onMoveDown={() => moveProblem(index, 'down')}
                difficultyColor={difficultyColor}
              />
            ))}
          </div>
        )}
      </div>

      {/* Quick Add Dialog */}
      <QuickAddDialog
        open={showAddForm}
        onClose={() => setShowAddForm(false)}
        searchQuery={searchQuery}
        onSearch={handleSearch}
        results={searchResults}
        searching={searching}
        onAdd={(problem) => {
          addProblem(problem)
          setShowAddForm(false)
        }}
      />

      {/* Preview Dialog */}
      <ProblemPreviewDialog
        problem={previewProblem}
        onClose={() => setPreviewProblem(null)}
      />
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function PickFromLibrary({ searchQuery, onSearch, results, searching, assigned, onAdd, onPreview }: {
  searchQuery: string
  onSearch: (q: string) => void
  results: ProblemOption[]
  searching: boolean
  assigned: AssignedProblem[]
  onAdd: (problem: ProblemOption) => void
  onPreview: (problem: ProblemOption) => void
}) {
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by title, slug, or topic..."
            value={searchQuery}
            onChange={(e) => onSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {searching && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Searching…
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-1 max-h-64 overflow-y-auto border border-border rounded-xl">
          {results.map((p) => {
            const isAdded = assigned.some(a => a.slug === p.slug)
            return (
              <div key={p.slug} className="flex items-center justify-between p-3 hover:bg-muted/50 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{p.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge variant="outline" className={`text-[10px] ${difficultyColor(p.difficulty)}`}>{p.difficulty}</Badge>
                    {p.topics && p.topics.length > 0 && (
                      <span className="text-[10px] text-muted-foreground">{p.topics.slice(0, 2).join(', ')}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="sm" variant="ghost" onClick={() => onPreview(p)}>
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                  {isAdded ? (
                    <Badge variant="outline" className="text-xs"><CheckCircle className="h-3 w-3 mr-1" /> Added</Badge>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => onAdd(p)}>Add</Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {!searching && searchQuery && results.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-4">No problems found</p>
      )}
    </div>
  )
}

function CreateCustomProblem({ form, setForm, testCases, setTestCases, onAdd }: {
  form: any
  setForm: (f: any) => void
  testCases: { stdin: string; expected: string; is_sample: boolean }[]
  setTestCases: (t: { stdin: string; expected: string; is_sample: boolean }[]) => void
  onAdd: (problem: ProblemOption) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Save the problem to the library first so it has a real slug the event can use.
  async function save() {
    setSaving(true); setSaveError(null)
    try {
      const slug = String(form.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      const test_cases = testCases
        .filter((tc) => tc.stdin.trim() || tc.expected.trim())
        .map((tc, i) => ({ id: `tc_${Date.now()}_${i}`, stdin: tc.stdin, expected_stdout: tc.expected, is_sample: tc.is_sample }))
      const res = await csrfFetch('/api/problems', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          difficulty: form.difficulty,
          topics: [],
          statement_md: form.statement_md || '',
          input_format: form.input_format || null,
          output_format: form.output_format || null,
          constraints: form.constraints || null,
          test_cases,
          slug,
          starter_code: {},
          visibility: 'hackathon_only',
          is_published: true,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'The problem could not be saved. Try again.')
      onAdd({ slug: j.slug || slug, title: form.title, difficulty: form.difficulty })
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Create a problem</h4>
        <Button size="sm" variant="ghost" onClick={() => setExpanded(!expanded)}>
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="md:col-span-2 space-y-1.5">
          <Label>Problem title *</Label>
          <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Two Sum" />
        </div>
        <div className="space-y-1.5">
          <Label>Difficulty</Label>
          <select value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}
            className="flex h-10 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm cursor-pointer">
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Points</Label>
          <Input type="number" value={form.points} min={10} onChange={(e) => setForm({ ...form, points: Number(e.target.value) })} />
        </div>
      </div>

      {expanded && (
        <div className="space-y-4 pt-2 border-t">
          <div className="space-y-1.5">
            <Label>Problem statement (Markdown)</Label>
            <Textarea rows={4} value={form.statement_md} onChange={(e) => setForm({ ...form, statement_md: e.target.value })}
              placeholder="## Description&#10;Given an array..." />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Input format</Label>
              <Input value={form.input_format} onChange={(e) => setForm({ ...form, input_format: e.target.value })} placeholder="First line contains n..." />
            </div>
            <div className="space-y-1.5">
              <Label>Output format</Label>
              <Input value={form.output_format} onChange={(e) => setForm({ ...form, output_format: e.target.value })} placeholder="Print the result..." />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Constraints</Label>
            <Input value={form.constraints} onChange={(e) => setForm({ ...form, constraints: e.target.value })} placeholder="2 ≤ n ≤ 10⁵" />
          </div>
        </div>
      )}

      {saveError && <p role="alert" className="text-sm text-destructive">{saveError}</p>}
      <Button onClick={save} disabled={!form.title.trim() || saving} className="w-full">
        <Plus className="h-4 w-4 mr-1" /> {saving ? 'Saving…' : 'Add problem'}
      </Button>
    </div>
  )
}

function AIGenerate({ config, setConfig, onGenerate }: {
  config: any
  setConfig: (c: any) => void
  onGenerate: (problem: ProblemOption) => void
}) {
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastTitle, setLastTitle] = useState<string | null>(null)

  const generate = async () => {
    setGenerating(true)
    setError(null)
    setLastTitle(null)
    try {
      const topics = String(config.topics || '')
        .split(',')
        .map((t: string) => t.trim())
        .filter(Boolean)
      // publish: true saves the problem to the library so it has a real slug
      // that can be assigned to the event.
      const res = await csrfFetch('/api/ai/generate-problem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: config.role,
          difficulty: config.difficulty,
          topics,
          language_hint: config.language_hint,
          publish: true,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        problem?: { title?: string; difficulty?: string; topics?: string[] }
        published_problem_slug?: string | null
      }
      if (!res.ok) throw new Error(data.error || 'Could not generate a problem. Try again.')
      if (!data.published_problem_slug) {
        throw new Error('The problem was generated but could not be saved to the library. Try again.')
      }
      const title = data.problem?.title || data.published_problem_slug
      onGenerate({
        slug: data.published_problem_slug,
        title,
        difficulty: data.problem?.difficulty || config.difficulty,
        topics: data.problem?.topics,
      })
      setLastTitle(title)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not generate a problem. Try again.')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
      <h4 className="text-sm font-semibold flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" /> Generate with AI
      </h4>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="ai-gen-role">Role</Label>
          <Input id="ai-gen-role" value={config.role} onChange={(e) => setConfig({ ...config, role: e.target.value })} placeholder="Software Engineer" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ai-gen-difficulty">Difficulty</Label>
          <select id="ai-gen-difficulty" value={config.difficulty} onChange={(e) => setConfig({ ...config, difficulty: e.target.value })}
            className="flex h-10 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm cursor-pointer">
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>
        <div className="md:col-span-2 space-y-1.5">
          <Label htmlFor="ai-gen-topics">Topics (comma-separated)</Label>
          <Input id="ai-gen-topics" value={config.topics} onChange={(e) => setConfig({ ...config, topics: e.target.value })} placeholder="arrays, dynamic programming" />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        The new problem is saved to your problem library and added to this event. Review it before the event starts.
      </p>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      {lastTitle && !error && (
        <p role="status" className="text-xs text-green-700 dark:text-green-400">Added &ldquo;{lastTitle}&rdquo;</p>
      )}
      <Button onClick={generate} disabled={generating} className="w-full">
        {generating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
        {generating ? 'Generating…' : 'Generate problem'}
      </Button>
    </div>
  )
}

function ProblemCard({ problem, index, total, isExpanded, onToggleExpand, onUpdate, onRemove, onMoveUp, onMoveDown, difficultyColor }: {
  problem: AssignedProblem
  index: number
  total: number
  isExpanded: boolean
  onToggleExpand: () => void
  onUpdate: (updates: Partial<AssignedProblem>) => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  difficultyColor: (d: string) => string
}) {
  return (
    <Card className={`rounded-2xl p-3 transition-shadow duration-200 ${isExpanded ? 'ring-2 ring-primary/20' : ''}`}>
      <div className="flex items-center gap-3">
        <div className="flex flex-col gap-0.5 shrink-0">
          <button onClick={onMoveUp} disabled={index === 0} aria-label="Move up" className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30 cursor-pointer">
            <ArrowUp className="h-3 w-3" />
          </button>
          <button onClick={onMoveDown} disabled={index === total - 1} aria-label="Move down" className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30 cursor-pointer">
            <ArrowDown className="h-3 w-3" />
          </button>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Q{index + 1}</span>
            <span className="font-medium text-sm truncate">{problem.title}</span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <Badge variant="outline" className={`text-[10px] ${difficultyColor(problem.difficulty)}`}>{problem.difficulty}</Badge>
            <span className="text-[10px] text-muted-foreground">{problem.points} pts</span>
            {problem.required && <Badge variant="secondary" className="text-[10px]">Required</Badge>}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Button size="sm" variant="ghost" onClick={onToggleExpand}>
            {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </Button>
          <Button size="sm" variant="ghost" className="text-destructive" onClick={onRemove}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {isExpanded && (
        <div className="mt-3 pt-3 border-t space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Points</Label>
              <Input type="number" value={problem.points} min={10}
                className="h-8 text-xs"
                onChange={(e) => onUpdate({ points: Number(e.target.value) })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Required</Label>
              <div className="flex items-center gap-2 h-8">
                <input type="checkbox" checked={problem.required}
                  onChange={(e) => onUpdate({ required: e.target.checked })}
                  className="rounded border-border cursor-pointer" />
                <span className="text-xs text-muted-foreground">Must be solved to qualify</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}

function QuickAddDialog({ open, onClose, searchQuery, onSearch, results, searching, onAdd }: {
  open: boolean
  onClose: () => void
  searchQuery: string
  onSearch: (q: string) => void
  results: ProblemOption[]
  searching: boolean
  onAdd: (problem: ProblemOption) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Quick add problem</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search problems..." value={searchQuery}
              onChange={(e) => onSearch(e.target.value)} className="pl-9" />
          </div>
          <div className="max-h-64 overflow-y-auto space-y-1">
            {results.map((p) => (
              <div key={p.slug} className="flex items-center justify-between p-2 hover:bg-muted/50 rounded-lg cursor-pointer"
                onClick={() => onAdd(p)}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{p.title}</p>
                  <p className="text-xs text-muted-foreground">{p.difficulty}</p>
                </div>
                <Plus className="h-4 w-4 text-muted-foreground" />
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ProblemPreviewDialog({ problem, onClose }: { problem: ProblemOption | null; onClose: () => void }) {
  if (!problem) return null

  return (
    <Dialog open={!!problem} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{problem.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={difficultyColor(problem.difficulty)}>{problem.difficulty}</Badge>
            {problem.topics && problem.topics.map(t => (
              <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
            ))}
          </div>
          <div className="text-sm text-muted-foreground">
            <p>Slug: {problem.slug}</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Target(props: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  )
}

function Loader2(props: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  )
}

function difficultyColor(d: string) {
  switch (d) {
    case 'easy': return 'text-green-700 dark:text-green-400 border-green-500/30'
    case 'medium': return 'text-amber-700 dark:text-amber-400 border-amber-500/30'
    case 'hard': return 'text-red-600 dark:text-red-400 border-red-500/30'
    default: return 'text-muted-foreground'
  }
}
