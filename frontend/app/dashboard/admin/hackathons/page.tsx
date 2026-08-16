'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NumberField } from '@/components/ui/number-field'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Loader2, Plus, CalendarDays, Users, Timer, Trophy,
  ExternalLink, Trash2, HelpCircle, CheckSquare, ListChecks,
  Shield, GripVertical, Pencil, Wand2, BookOpen, Search,
  Sparkles, ChevronDown, ChevronUp, X,
} from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { usePageGuard } from '@/lib/use-page-guard'
import { toLocalDatetimeString, fromZonedDatetimeString } from '@/lib/datetime-local'
import { usePlatformTimezone } from '@/lib/use-platform-timezone'
import { useAuth } from '@/lib/auth-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useToast } from '@/lib/toast-context'

interface Hackathon {
  id: string; name: string; slug: string; description?: string
  num_teams: number; max_per_team: number; timeout_minutes: number
  starts_at: string; ends_at: string; status: string
  tasks: { problem_slug: string; problem_title: string; points: number; difficulty: string; required: boolean }[]
  rules: { type: string; title: string; description: string }[]
  scoring: { auto_grade: boolean; points_per_problem: number; bonus_time: number; penalty_per_attempt: number };
  solve_limit: number
  results_released: boolean
  created_at: string
}

interface ProblemOption { slug: string; title: string; difficulty: string; topics?: string[] }

export default function HackathonsAdminPage() {
  const gate = usePageGuard('superadmin')
  const addToast = useToast()
  const tz = usePlatformTimezone()
  const [items, setItems] = useState<Hackathon[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState(1)

  const [form, setForm] = useState({
    name: '',
    description: '',
    num_teams: 8,
    max_per_team: 4,
    timeout_minutes: 60,
    starts_at: toLocalDatetimeString(new Date(Date.now() + 3600000)),
    event_type: 'hackathon' as 'hackathon' | 'speed_contest',
    per_problem_time_minutes: 30,
    tasks: [] as { slug: string; title: string; points: number; difficulty: string; required: boolean; time_limit_minutes?: number }[],
    rules: [
      { type: 'scoring' as const, title: 'Scoring', description: 'Points are awarded based on test cases passed and code quality.' },
      { type: 'submission' as const, title: 'Submissions', description: 'Unlimited submissions during the event window. Last submission counts.' },
      { type: 'conduct' as const, title: 'Code of Conduct', description: 'Plagiarism or collusion with other teams will result in disqualification.' },
    ],
    scoring: { auto_grade: true, points_per_problem: 100, bonus_time: 0, penalty_per_attempt: 0 },
    solve_limit: 0,
    banner_url: '',
  })
  const [editing, setEditing] = useState<Hackathon | null>(null)

  const [problemSearch, setProblemSearch] = useState('')
  const [problemResults, setProblemResults] = useState<ProblemOption[]>([])
  const [searchingProblems, setSearchingProblems] = useState(false)

  type ProblemSource = 'pick' | 'own' | 'ai'
  const [problemSource, setProblemSource] = useState<ProblemSource>('pick')

  const [aiConfig, setAiConfig] = useState({
    role: 'Software Engineer',
    difficulty: 'medium' as 'easy' | 'medium' | 'hard',
    topics: '',
    language_hint: 'python',
    count: 1,
  })
  const [generating, setGenerating] = useState(false)
  const [generatingError, setGeneratingError] = useState<string | null>(null)

  const [ownForm, setOwnForm] = useState({
    title: '',
    difficulty: 'medium' as 'easy' | 'medium' | 'hard',
    topics: '',
    statement_md: '',
    input_format: '',
    output_format: '',
    constraints: '',
    points: 100,
  })
  const [ownTestCases, setOwnTestCases] = useState<{ stdin: string; expected: string; is_sample: boolean }[]>([
    { stdin: '', expected: '', is_sample: true },
  ])
  const [creatingOwn, setCreatingOwn] = useState(false)
  const [creatingOwnError, setCreatingOwnError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/hackathons', { cache: 'no-store' })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'failed')
      setItems(j.items as Hackathon[])
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { if (gate.ready) void load() }, [gate.ready, load])

  const searchProblems = useCallback(async (q: string) => {
    setSearchingProblems(true)
    try {
      const res = await fetch(`/api/problems?search=${encodeURIComponent(q)}&limit=10`)
      const j = await res.json()
      setProblemResults((j.items || j.data || []) as ProblemOption[])
    } catch { setProblemResults([]) }
    finally { setSearchingProblems(false) }
  }, [])

  async function generateAiProblems() {
    const requested = Math.min(5, Math.max(1, aiConfig.count || 1))
    setGenerating(true); setGeneratingError(null)
    for (let i = 0; i < requested; i++) {
      try {
        const topics = aiConfig.topics.split(',').map((t) => t.trim()).filter(Boolean)
        const res = await csrfFetch('/api/ai/generate-problem', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            role: aiConfig.role,
            difficulty: aiConfig.difficulty,
            topics,
            language_hint: aiConfig.language_hint,
            publish: true,
          }),
        })
        const j = await res.json()
        if (!res.ok) throw new Error(j.error || 'Generation failed')
        const prob = j.problem as Record<string, unknown>
        const slug = typeof j.published_problem_slug === 'string' && j.published_problem_slug
          ? j.published_problem_slug
          : (typeof prob.slug === 'string' ? prob.slug
            : (prob.title as string || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''))
        const difficulty = (['easy', 'medium', 'hard'].includes(prob.difficulty as string)
          ? prob.difficulty : 'medium') as string
        const title = String(prob.title || slug)
        const points = prob.points || 100
        setForm((f) => ({
          ...f,
          tasks: [...f.tasks, {
            slug,
            title,
            points: typeof points === 'number' ? points : 100,
            difficulty,
            required: true,
          }],
        }))
      } catch (e) {
        setGeneratingError(e instanceof Error ? e.message : String(e))
        break
      }
    }
    setGenerating(false)
  }

  async function createOwnProblem() {
    setCreatingOwn(true); setCreatingOwnError(null)
    try {
      const topics = ownForm.topics.split(',').map((t) => t.trim()).filter(Boolean)
      const slug = ownForm.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      const test_cases = ownTestCases
        .filter((tc) => tc.stdin.trim() || tc.expected.trim())
        .map((tc, i) => ({
          id: `tc_${Date.now()}_${i}`,
          stdin: tc.stdin,
          expected_stdout: tc.expected,
          is_sample: tc.is_sample,
        }))
      const res = await csrfFetch('/api/problems', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          title: ownForm.title,
          difficulty: ownForm.difficulty,
          topics,
          statement_md: ownForm.statement_md,
          input_format: ownForm.input_format || null,
          output_format: ownForm.output_format || null,
          constraints: ownForm.constraints || null,
          test_cases,
          starter_code: {},
          visibility: 'hackathon_only',
          is_published: true,
        }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Failed to create problem')
      setForm((f) => ({
        ...f,
        tasks: [...f.tasks, {
          slug: j.slug || slug,
          title: ownForm.title,
          points: ownForm.points,
          difficulty: ownForm.difficulty,
          required: true,
        }],
      }))
      setOwnForm({ title: '', difficulty: 'medium', topics: '', statement_md: '', input_format: '', output_format: '', constraints: '', points: 100 })
      setOwnTestCases([{ stdin: '', expected: '', is_sample: true }])
    } catch (e) {
      setCreatingOwnError(e instanceof Error ? e.message : String(e))
    } finally {
      setCreatingOwn(false)
    }
  }

  async function create() {
    if (!form.name.trim()) return
    setBusy(true); setError(null)
    try {
      const res = await csrfFetch('/api/hackathons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name, description: form.description,
          num_teams: form.num_teams, max_per_team: form.max_per_team,
          timeout_minutes: form.timeout_minutes,
          starts_at: fromZonedDatetimeString(form.starts_at, tz),
          event_type: form.event_type,
          per_problem_time_minutes: form.per_problem_time_minutes,
          tasks: form.tasks.map((t) => ({
            problem_slug: t.slug, problem_title: t.title,
            points: t.points, difficulty: t.difficulty, required: t.required,
            time_limit_minutes: t.time_limit_minutes,
          })),
          rules: form.rules,
          scoring: form.scoring,
          solve_limit: form.solve_limit || undefined,
          banner_url: form.banner_url,
        }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'failed')
      setCreating(false); setStep(1)
      setForm((f) => ({ ...f, name: '', description: '' }))
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }

  async function update() {
    if (!editing || !form.name.trim()) return
    setBusy(true); setError(null)
    try {
      const res = await csrfFetch(`/api/hackathons/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name, description: form.description,
          num_teams: form.num_teams, max_per_team: form.max_per_team,
          timeout_minutes: form.timeout_minutes,
          event_type: form.event_type,
          per_problem_time_minutes: form.per_problem_time_minutes,
          starts_at: fromZonedDatetimeString(form.starts_at, tz),
          tasks: form.tasks.map((t) => ({
            problem_slug: t.slug, problem_title: t.title,
            points: t.points, difficulty: t.difficulty, required: t.required,
            time_limit_minutes: t.time_limit_minutes,
          })),
          rules: form.rules,
          scoring: form.scoring,
          solve_limit: form.solve_limit || undefined,
          banner_url: form.banner_url,
        }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'failed')
      setEditing(null); setStep(1)
      setForm((f) => ({ ...f, name: '', description: '' }))
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }

  function openEdit(hk: Hackathon) {
    setEditing(hk)
    setStep(1)
    setForm({
      name: hk.name,
      description: hk.description || '',
      num_teams: hk.num_teams,
      max_per_team: hk.max_per_team,
      timeout_minutes: hk.timeout_minutes,
      starts_at: hk.starts_at ? toLocalDatetimeString(new Date(hk.starts_at)) : '',
      event_type: (hk as any).event_type === 'speed_contest' ? 'speed_contest' : 'hackathon',
      per_problem_time_minutes: (hk as any).per_problem_time_minutes || 30,
      tasks: (hk.tasks || []).map((t) => ({
        slug: t.problem_slug, title: t.problem_title,
        points: t.points, difficulty: t.difficulty, required: t.required,
        time_limit_minutes: (t as any).time_limit_minutes,
      })),
      rules: (hk.rules || [
        { type: 'scoring' as const, title: 'Scoring', description: 'Points are awarded based on test cases passed and code quality.' },
        { type: 'submission' as const, title: 'Submissions', description: 'Unlimited submissions during the event window. Last submission counts.' },
        { type: 'conduct' as const, title: 'Code of Conduct', description: 'Plagiarism or collusion with other teams will result in disqualification.' },
      ]) as typeof form.rules,
      scoring: hk.scoring || { auto_grade: true, points_per_problem: 100, bonus_time: 0, penalty_per_attempt: 0 },
      solve_limit: Number((hk as any).solve_limit) || 0,
      banner_url: (hk as any).banner_url || '',
    })
  }

  const isEditing = !!editing

  if (!gate.ready) return null

  return (
    <div className="space-y-6" data-testid="hackathons-admin-page">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Trophy className="h-7 w-7 text-primary" /> Hackathon events
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Create coding competitions, assign problems, manage teams, and release results.
          </p>
        </div>
        <Link href="/dashboard/admin/hackathons/create" data-testid="hackathon-new-btn">
          <Button><Plus className="mr-1 h-4 w-4" /> New event</Button>
        </Link>
      </div>

      {error && <Card className="border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</Card>}

      {(creating || isEditing) && (
        <Card className="space-y-6 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{isEditing ? `Edit: ${editing?.name}` : 'New Hackathon Event'}</h2>
            <Button variant="ghost" size="sm" onClick={() => { setEditing(null); setCreating(false); setStep(1) }}>Cancel</Button>
          </div>
          {/* Step indicator */}
          <div className="flex gap-3 text-sm">
            {[
              { n: 1, label: 'Basics' },
              { n: 2, label: 'Problems' },
              { n: 3, label: 'Rules & Scoring' },
            ].map((s) => (
              <button key={s.n} onClick={() => setStep(s.n)}
                className={`px-4 py-2 rounded-lg transition-colors ${step === s.n ? 'bg-primary text-primary-foreground font-medium' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
                {s.n}. {s.label}
              </button>
            ))}
          </div>

          {/* Step 1: Basics */}
          {step === 1 && (
            <div className="space-y-6">
              <h3 className="font-semibold text-lg">Event Details</h3>
              <div className="space-y-2">
                <Label>Event name</Label>
                <Input autoFocus value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Frostbyte Winter 2026" />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea rows={4} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Describe the event, theme, and what participants will build..." />
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <NumberField
                  label="Teams allowed"
                  value={form.num_teams}
                  onChange={(v) => setForm((f) => ({ ...f, num_teams: v }))}
                  min={1}
                  max={500}
                  hint="Total number of teams that can compete in this event."
                />
                <NumberField
                  label="Max per team"
                  value={form.max_per_team}
                  onChange={(v) => setForm((f) => ({ ...f, max_per_team: v }))}
                  min={1}
                  max={20}
                  hint="How many members can join a single team (1 = solo)."
                />
                <div>
                  <NumberField
                    label="Duration (minutes)"
                    value={form.timeout_minutes}
                    onChange={(v) => setForm((f) => ({ ...f, timeout_minutes: v }))}
                    min={5}
                    max={10080}
                    step={5}
                    hint="Total time window for the event."
                  />
                  <div className="flex flex-wrap gap-1 pt-1">
                    {[
                      { label: '1h', mins: 60 },
                      { label: '3h', mins: 180 },
                      { label: '1 day', mins: 1440 },
                      { label: '3 days', mins: 4320 },
                    ].map((p) => (
                      <button
                        key={p.mins}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, timeout_minutes: p.mins }))}
                        className={`rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                          form.timeout_minutes === p.mins
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border text-muted-foreground hover:bg-muted/50'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div>
                <Label>Starts at</Label>
                <Input type="datetime-local" value={form.starts_at} onChange={(e) => setForm((f) => ({ ...f, starts_at: e.target.value }))} />
                <p className="mt-1 text-xs text-muted-foreground">
                  Ends at {new Date(new Date(form.starts_at).getTime() + form.timeout_minutes * 60000).toLocaleString()}
                </p>
              </div>
              <div className="space-y-2">
                <Label>Event type</Label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" value="hackathon" checked={form.event_type === 'hackathon'} onChange={() => setForm((f) => ({ ...f, event_type: 'hackathon' }))} />
                    <span className="text-sm">Hackathon</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" value="speed_contest" checked={form.event_type === 'speed_contest'} onChange={() => setForm((f) => ({ ...f, event_type: 'speed_contest' }))} />
                    <span className="text-sm">Speed Contest</span>
                  </label>
                </div>
                <p className="text-xs text-muted-foreground">
                  {form.event_type === 'speed_contest'
                    ? 'Each problem has a time limit. Teams race against the clock per problem.'
                    : 'Teams work on all problems concurrently over the full event window.'}
                </p>
              </div>
              {form.event_type === 'speed_contest' && (
                <NumberField
                  label="Default time per problem (minutes)"
                  value={form.per_problem_time_minutes}
                  onChange={(v) => setForm((f) => ({ ...f, per_problem_time_minutes: v }))}
                  min={1}
                  max={1440}
                  hint="Each problem locks after this many minutes."
                />
              )}
              <div className="space-y-2">
                  <Label>Banner image</Label>
                  {form.banner_url && (
                    <div className="relative w-full h-32 rounded-lg overflow-hidden border bg-muted mb-2">
                      <img src={form.banner_url} alt="Banner preview" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, banner_url: '' }))}
                        className="absolute top-1 right-1 rounded-full bg-black/60 text-white p-1 hover:bg-black/80"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      const reader = new FileReader()
                      reader.onload = (ev) => {
                        const dataUrl = ev.target?.result as string
                        setForm((f) => ({ ...f, banner_url: dataUrl }))
                      }
                      reader.readAsDataURL(file)
                    }}
                  />
                  <p className="text-xs text-muted-foreground">Upload an image or paste a URL below. leave empty for default.</p>
                  <Input
                    value={form.banner_url.startsWith('data:') ? '' : form.banner_url}
                    onChange={(e) => setForm((f) => ({ ...f, banner_url: e.target.value }))}
                    placeholder="Or paste image URL..."
                  />
                </div>
              <Button onClick={() => setStep(2)}>Next: Problems →</Button>
            </div>
          )}

          {/* Step 2: Problem/Task Selection */}
          {step === 2 && (
            <div className="space-y-6">
              <h3 className="font-semibold text-lg">Assign Problems</h3>
              <p className="text-sm text-muted-foreground">
                Choose how to add problems — pick from your library, write your own, or generate with AI.
              </p>

              {/* Source mode selector */}
              <div className="flex gap-2">
                <button
                  onClick={() => setProblemSource('pick')}
                  className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all ${
                    problemSource === 'pick'
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-card hover:bg-muted/50'
                  }`}
                >
                  <Search className="h-4 w-4" /> Pick from library
                </button>
                <button
                  onClick={() => setProblemSource('own')}
                  className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all ${
                    problemSource === 'own'
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-card hover:bg-muted/50'
                  }`}
                >
                  <BookOpen className="h-4 w-4" /> Own questions
                </button>
                <button
                  onClick={() => setProblemSource('ai')}
                  className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all ${
                    problemSource === 'ai'
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-card hover:bg-muted/50'
                  }`}
                >
                  <Sparkles className="h-4 w-4" /> AI generate
                </button>
              </div>

              {/* ── Mode: Pick from existing ── */}
              {problemSource === 'pick' && (
                <>
                  <div className="flex gap-2">
                    <Input placeholder="Search problems..." value={problemSearch}
                      onChange={(e) => { setProblemSearch(e.target.value); searchProblems(e.target.value) }} />
                  </div>

                  {searchingProblems && <p className="text-xs text-muted-foreground">Searching...</p>}

                  {problemResults.length > 0 && (
                    <div className="space-y-2 max-h-48 overflow-y-auto border rounded-lg p-3">
                      {problemResults.map((p) => {
                        const added = form.tasks.find((t) => t.slug === p.slug)
                        return (
                          <div key={p.slug} className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm truncate">{p.title}</p>
                              <p className="text-xs text-muted-foreground">{p.slug} · {p.difficulty}</p>
                            </div>
                            {added ? (
                              <Badge variant="outline" className="shrink-0">Added</Badge>
                            ) : (
                              <Button size="sm" variant="ghost" onClick={() => setForm((f) => ({
                                ...f, tasks: [...f.tasks, { slug: p.slug, title: p.title, points: 100, difficulty: p.difficulty, required: true }]
                              }))}>Add</Button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </>
              )}

              {/* ── Mode: Own questions ── */}
              {problemSource === 'own' && (
                <div className="space-y-4 rounded-lg border border-border/60 bg-card/40 p-5">
                  <div className="space-y-3">
                    <p className="text-sm font-semibold">Write your own problem</p>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="md:col-span-2 space-y-1.5">
                        <Label>Problem title *</Label>
                        <Input value={ownForm.title}
                          onChange={(e) => setOwnForm((f) => ({ ...f, title: e.target.value }))}
                          placeholder="Two Sum" />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Difficulty</Label>
                        <select className="flex h-10 w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm"
                          value={ownForm.difficulty}
                          onChange={(e) => setOwnForm((f) => ({ ...f, difficulty: e.target.value as 'easy' | 'medium' | 'hard' }))}>
                          <option value="easy">Easy</option>
                          <option value="medium">Medium</option>
                          <option value="hard">Hard</option>
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Points</Label>
                        <NumberField value={ownForm.points} min={10} max={1000} step={10} unit="pts"
                          onChange={(v) => setOwnForm((f) => ({ ...f, points: v }))} />
                      </div>
                      <div className="md:col-span-2 space-y-1.5">
                        <Label>Topics (comma-separated)</Label>
                        <Input value={ownForm.topics}
                          onChange={(e) => setOwnForm((f) => ({ ...f, topics: e.target.value }))}
                          placeholder="arrays, dynamic programming, strings" />
                      </div>
                      <div className="md:col-span-2 space-y-1.5">
                        <Label>Problem statement (Markdown)</Label>
                        <Textarea rows={5} value={ownForm.statement_md}
                          onChange={(e) => setOwnForm((f) => ({ ...f, statement_md: e.target.value }))}
                          placeholder="## Problem Description&#10;Given an array of integers, return indices of the two numbers that add up to a specific target..." />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Input format</Label>
                        <Input value={ownForm.input_format}
                          onChange={(e) => setOwnForm((f) => ({ ...f, input_format: e.target.value }))}
                          placeholder="First line contains n..." />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Output format</Label>
                        <Input value={ownForm.output_format}
                          onChange={(e) => setOwnForm((f) => ({ ...f, output_format: e.target.value }))}
                          placeholder="Print the two indices..." />
                      </div>
                      <div className="md:col-span-2 space-y-1.5">
                        <Label>Constraints</Label>
                        <Input value={ownForm.constraints}
                          onChange={(e) => setOwnForm((f) => ({ ...f, constraints: e.target.value }))}
                          placeholder="2 ≤ n ≤ 10⁵, -10⁹ ≤ nums[i] ≤ 10⁹" />
                      </div>
                    </div>

                    {/* Test cases */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Test cases</Label>
                        <Button size="sm" variant="outline" onClick={() => setOwnTestCases((t) => [...t, { stdin: '', expected: '', is_sample: true }])}>
                          <Plus className="h-3 w-3 mr-1" /> Add test case
                        </Button>
                      </div>
                      {ownTestCases.map((tc, i) => (
                        <div key={i} className="rounded-lg border bg-muted/20 p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium">Test case {i + 1}</span>
                            <div className="flex items-center gap-2">
                              <label className="flex items-center gap-1 text-xs text-muted-foreground">
                                <input type="checkbox" checked={tc.is_sample}
                                  onChange={(e) => {
                                    const next = [...ownTestCases]
                                    next[i] = { ...next[i], is_sample: e.target.checked }
                                    setOwnTestCases(next)
                                  }} />
                                Sample
                              </label>
                              {ownTestCases.length > 1 && (
                                <Button size="sm" variant="ghost" className="h-6 text-destructive"
                                  onClick={() => setOwnTestCases((t) => t.filter((_, idx) => idx !== i))}>
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          </div>
                          <div className="grid gap-2 sm:grid-cols-2">
                            <div>
                              <Label className="text-[10px] uppercase tracking-wider">Input</Label>
                              <Textarea rows={2} value={tc.stdin}
                                onChange={(e) => {
                                  const next = [...ownTestCases]
                                  next[i] = { ...next[i], stdin: e.target.value }
                                  setOwnTestCases(next)
                                }}
                                placeholder="[2,7,11,15]&#10;9" className="font-mono text-xs" />
                            </div>
                            <div>
                              <Label className="text-[10px] uppercase tracking-wider">Expected output</Label>
                              <Textarea rows={2} value={tc.expected}
                                onChange={(e) => {
                                  const next = [...ownTestCases]
                                  next[i] = { ...next[i], expected: e.target.value }
                                  setOwnTestCases(next)
                                }}
                                placeholder="[0,1]" className="font-mono text-xs" />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {creatingOwnError && <p className="text-xs text-destructive">{creatingOwnError}</p>}
                    <Button onClick={createOwnProblem} disabled={creatingOwn || !ownForm.title.trim()}>
                      {creatingOwn ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Plus className="mr-1 h-3 w-3" />}
                      Add to problems
                    </Button>
                  </div>
                </div>
              )}

              {/* ── Mode: AI generate ── */}
              {problemSource === 'ai' && (
                <div className="space-y-4 rounded-lg border border-primary/20 bg-primary/5 p-5">
                  <div className="flex items-start gap-3">
                    <Sparkles className="h-5 w-5 text-primary mt-0.5" />
                    <div className="flex-1 space-y-3">
                      <p className="text-sm font-semibold">AI generates problems for you</p>
                      <p className="text-xs text-muted-foreground">
                        Configure the role, difficulty, and topics. The AI will create a polished problem with test cases and add it to the event.
                      </p>
                      <div className="grid gap-3 md:grid-cols-2">
                          <div className="space-y-1.5">
                            <Label>Role / Persona</Label>
                            <Input value={aiConfig.role}
                              onChange={(e) => setAiConfig((c) => ({ ...c, role: e.target.value }))}
                              placeholder="Software Engineer" />
                          </div>
                          <div className="space-y-1.5">
                            <Label>Difficulty</Label>
                            <select className="flex h-10 w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm"
                              value={aiConfig.difficulty}
                              onChange={(e) => setAiConfig((c) => ({ ...c, difficulty: e.target.value as 'easy' | 'medium' | 'hard' }))}>
                              <option value="easy">Easy</option>
                              <option value="medium">Medium</option>
                              <option value="hard">Hard</option>
                            </select>
                          </div>
                          <div className="space-y-1.5">
                            <Label>Language hint</Label>
                            <Input value={aiConfig.language_hint}
                              onChange={(e) => setAiConfig((c) => ({ ...c, language_hint: e.target.value }))}
                              placeholder="python" />
                          </div>
                          <div className="space-y-1.5">
                            <Label>Topics (comma-separated)</Label>
                            <Input value={aiConfig.topics}
                              onChange={(e) => setAiConfig((c) => ({ ...c, topics: e.target.value }))}
                              placeholder="arrays, strings, sorting" />
                          </div>
                          <NumberField
                            label="How many to generate"
                            value={aiConfig.count}
                            onChange={(v) => setAiConfig((c) => ({ ...c, count: v }))}
                            min={1}
                            max={5}
                            unit="problems"
                            hint="Each problem takes a few seconds. Checked problems are added to the event and saved to your library."
                          />
                        </div>
                        {generatingError && <p className="text-xs text-destructive">{generatingError}</p>}
                        <div className="flex gap-2">
                          <Button onClick={generateAiProblems} disabled={generating}>
                            {generating ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Wand2 className="mr-1 h-3 w-3" />}
                            {generating ? 'Generating…' : aiConfig.count > 1 ? `Generate ${aiConfig.count} problems` : 'Generate problem'}
                          </Button>
                        </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Selected problems (all modes) */}
              {form.tasks.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Selected Problems ({form.tasks.length})</p>
                  {form.tasks.map((t, i) => (
                    <div key={t.slug} className="flex items-center gap-2 p-2 rounded border bg-muted/20">
                      <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{t.title}</p>
                        <p className="text-xs text-muted-foreground">{t.difficulty}</p>
                      </div>
                      <Input type="number" className="w-20 h-8 text-xs" value={t.points}
                        onChange={(e) => {
                          const points = Number(e.target.value)
                          setForm((f) => ({ ...f, tasks: f.tasks.map((x, idx) => idx === i ? { ...x, points } : x) }))
                        }} />
                      <Button size="sm" variant="ghost" className="text-destructive"
                        onClick={() => setForm((f) => ({ ...f, tasks: f.tasks.filter((_, idx) => idx !== i) }))}>
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(1)}>← Back</Button>
                <Button onClick={() => setStep(3)}>Next: Rules →</Button>
              </div>
            </div>
          )}

          {/* Step 3: Rules & Scoring */}
          {step === 3 && (
            <div className="space-y-6">
              <h3 className="font-semibold text-lg">Rules & Scoring</h3>

              <div className="space-y-4">
                {form.rules.map((r, i) => (
                  <div key={i} className="rounded-lg border border-border/60 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline">{r.type}</Badge>
                      <Button size="sm" variant="ghost" className="text-destructive h-6"
                        onClick={() => setForm((f) => ({ ...f, rules: f.rules.filter((_, idx) => idx !== i) }))}>
                        Remove
                      </Button>
                    </div>
                    <div className="space-y-2">
                      <Label>Rule title</Label>
                      <Input value={r.title}
                        onChange={(e) => setForm((f) => ({ ...f, rules: f.rules.map((x, idx) => idx === i ? { ...x, title: e.target.value } : x) }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Description</Label>
                      <Textarea rows={2} value={r.description}
                        onChange={(e) => setForm((f) => ({ ...f, rules: f.rules.map((x, idx) => idx === i ? { ...x, description: e.target.value } : x) }))} />
                    </div>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => setForm((f: any) => ({
                  ...f, rules: [...f.rules, { type: 'general' as const, title: '', description: '' }]
                }))}>+ Add Rule</Button>
              </div>

              <div className="rounded border p-4 space-y-4">
                <h4 className="text-sm font-semibold">Scoring Configuration</h4>
                <div className="grid gap-3 md:grid-cols-4">
                  <NumberField
                    label="Points per problem"
                    value={form.scoring.points_per_problem}
                    onChange={(v) => setForm((f) => ({ ...f, scoring: { ...f.scoring, points_per_problem: v } }))}
                    min={10}
                    max={1000}
                    step={10}
                    unit="pts"
                    hint="Base score for a fully correct solution."
                  />
                  <NumberField
                    label="Bonus (early submit)"
                    value={form.scoring.bonus_time}
                    onChange={(v) => setForm((f) => ({ ...f, scoring: { ...f.scoring, bonus_time: v } }))}
                    min={0}
                    max={2000}
                    step={5}
                    unit="pts"
                    hint="Extra points per remaining minute on early submissions."
                  />
                  <NumberField
                    label="Penalty per attempt"
                    value={form.scoring.penalty_per_attempt}
                    onChange={(v) => setForm((f) => ({ ...f, scoring: { ...f.scoring, penalty_per_attempt: v } }))}
                    min={0}
                    max={2000}
                    step={5}
                    unit="pts"
                    hint="Points deducted for each wrong submission."
                  />
                  <NumberField
                    label="Solve limit"
                    value={form.solve_limit}
                    onChange={(v) => setForm((f) => ({ ...f, solve_limit: v }))}
                    min={0}
                    max={500}
                    hint="Max problems a team can attempt. 0 = no limit."
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="auto_grade" checked={form.scoring.auto_grade}
                    onChange={(e) => setForm((f) => ({ ...f, scoring: { ...f.scoring, auto_grade: e.target.checked } }))} />
                  <Label htmlFor="auto_grade">Auto-grade submissions on submit</Label>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button variant="outline" onClick={() => setStep(2)}>← Back</Button>
                <Button onClick={isEditing ? update : create} disabled={busy}>
                  {busy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                  {isEditing ? 'Update Event' : 'Create Event'}
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {loading ? (
        <Card className="flex h-32 items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading events…
        </Card>
      ) : items.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No hackathon events yet. Click <strong>New event</strong> to host your first one.
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((hk) => (
            <Card key={hk.id} className="space-y-3 p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <Link href={`/hackathons/${hk.slug}`} className="text-lg font-semibold hover:underline">{hk.name}</Link>
                  <p className="text-xs text-muted-foreground">/{hk.slug} · {hk.tasks?.length || 0} problems</p>
                </div>
                <Badge variant={hk.status === 'live' ? 'default' : 'secondary'} className="uppercase">{hk.status}</Badge>
              </div>
              {hk.description && <p className="text-xs text-muted-foreground line-clamp-2">{hk.description}</p>}
              <div className="grid grid-cols-4 gap-2 text-[11px]">
                <Stat icon={<Users />} label="Teams" value={hk.num_teams} />
                <Stat icon={<Users />} label="Per team" value={hk.max_per_team} />
                <Stat icon={<Timer />} label="Mins" value={hk.timeout_minutes} />
                <Stat icon={<ListChecks />} label="Problems" value={hk.tasks?.length || 0} />
              </div>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <CalendarDays className="h-3 w-3" />
                {new Date(hk.starts_at).toLocaleString()} → {new Date(hk.ends_at).toLocaleTimeString()}
              </div>
              <div className="flex gap-2 pt-2">
                <Link href={`/hackathons/${hk.slug}`}>
                  <Button variant="outline" size="sm">Open <ExternalLink className="ml-1 h-3 w-3" /></Button>
                </Link>
                <Link href={`/dashboard/admin/hackathons/${hk.id}`}>
                  <Button variant="outline" size="sm">Manage</Button>
                </Link>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/dashboard/admin/hackathons/edit/${hk.id}`}><Pencil className="h-3 w-3 mr-1" /> Edit</Link>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Edit event settings</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <Button variant="ghost" size="sm" onClick={() => setDeleteTarget({ id: hk.id, name: hk.name })} className="text-destructive"><Trash2 className="h-3 w-3" /></Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {deleteTarget && (
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Hackathon</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget ? `Delete "${deleteTarget.name}"? Only allowed if no teams registered.` : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!deleteTarget) return
                const res = await csrfFetch(`/api/hackathons/${deleteTarget.id}`, { method: 'DELETE' })
                setDeleteTarget(null)
                if (!res.ok) {
                  const err = await res.json().catch(() => ({ error: 'Delete failed' }))
                  addToast({ type: 'error', title: 'Delete Failed', message: err.error || 'Cannot delete — teams are registered' })
                }
                await load()
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      )}
    </div>
  )
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="rounded border border-border/40 bg-muted/30 px-2 py-1">
      <p className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-muted-foreground">
        {icon} {label}
      </p>
      <p className="font-semibold tabular-nums">{value}</p>
    </div>
  )
}
