'use client'
import { formatDateTime } from '@/lib/format-datetime'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { PageHeader, Panel } from '@/components/app/page-kit'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NumberField } from '@/components/ui/number-field'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { toLocalDatetimeString } from '@/lib/datetime-local'
import {
  Loader2, Plus, CalendarDays, Users, Timer, Trophy,
  Trash2, HelpCircle, CheckSquare, ListChecks,
  Shield, GripVertical, Pencil, Wand2, BookOpen, Search,
  Sparkles, ChevronDown, ChevronUp, X, ArrowLeft,
  Settings, FileText, Sliders, Eye,
} from 'lucide-react'
import { SkeletonCard, SkeletonText } from '@/components/ui/skeleton-boneyard'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { usePageGuard } from '@/lib/use-page-guard'
import { csrfFetch } from '@/lib/csrf-fetch'
import { EventStepIndicator } from '@/components/hackathons/event-step-indicator'
import { ProblemViewDialog } from '@/components/problems/problem-view-dialog'

interface ProblemOption { slug: string; title: string; difficulty: string; topics?: string[] }

export default function HackathonCreatePage() {
  const router = useRouter()
  const gate = usePageGuard('superadmin')
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
    tasks: [] as { slug: string; title: string; points: number; difficulty: string; required: boolean }[],
    rules: [
      { type: 'scoring' as const, title: 'Scoring', description: 'Points are awarded based on test cases passed and code quality.' },
      { type: 'submission' as const, title: 'Submissions', description: 'Unlimited submissions during the event window. Last submission counts.' },
      { type: 'conduct' as const, title: 'Code of Conduct', description: 'Plagiarism or collusion with other teams will result in disqualification.' },
    ],
    scoring: { auto_grade: true, points_per_problem: 100, bonus_time: 0, penalty_per_attempt: 0 },
    solve_limit: 0,
    cert_template: 'classic' as 'classic' | 'modern' | 'minimal' | 'professional' | 'corporate' | 'academic',
    banner_url: '',
    features: {
      team_formation: true,
      claims_system: false,
      demo_video: 'optional' as 'required' | 'optional' | 'disabled',
      live_url: 'optional' as 'required' | 'optional' | 'disabled',
      code_upload: true,
      judging_rubrics: false,
      rubric_criteria: [
        { name: 'Innovation', weight: 25 },
        { name: 'Technical complexity', weight: 25 },
        { name: 'Design/UX', weight: 20 },
        { name: 'Impact', weight: 20 },
        { name: 'Completeness', weight: 10 },
      ],
      leaderboard_visibility: 'public' as 'public' | 'private' | 'after_event',
      project_showcase: true,
      forum: false,
      proctoring: false,
      certificates: true,
      sponsor_tracks: [] as { name: string; prize: string; description?: string }[],
    },
  })

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
  const [viewSlug, setViewSlug] = useState<string | null>(null)
  const [editingSlug, setEditingSlug] = useState<string | null>(null)
  const [editLoading, setEditLoading] = useState(false)

  useEffect(() => {
    fetch('/api/admin/platform-settings', { credentials: 'include' })
      .then(r => r.json())
      .then(j => {
        if (j.settings?.certificate_template) {
          setForm(f => ({ ...f, cert_template: j.settings.certificate_template }))
        }
      })
      .catch(() => {})
  }, [])

  const searchProblems = useCallback(async (q: string) => {
    setSearchingProblems(true)
    try {
      const res = await fetch(`/api/problems?search=${encodeURIComponent(q)}&limit=10`)
      const j = await res.json()
      setProblemResults((j.items || j.data || []) as ProblemOption[])
    } catch { setProblemResults([]) }
    finally { setSearchingProblems(false) }
  }, [])

  useEffect(() => { searchProblems('') }, [searchProblems])

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

  async function editProblem(slug: string) {
    setEditLoading(true)
    try {
      const res = await fetch(`/api/problems/${encodeURIComponent(slug)}`, { cache: 'no-store' })
      const j = await res.json()
      if (!res.ok || !j.title) throw new Error(j.error || 'Problem not found')
      setOwnForm({
        title: j.title || '',
        difficulty: (['easy', 'medium', 'hard'].includes(j.difficulty) ? j.difficulty : 'medium') as 'easy' | 'medium' | 'hard',
        topics: Array.isArray(j.topics) ? j.topics.join(', ') : '',
        statement_md: j.statement_md || '',
        input_format: j.input_format || '',
        output_format: j.output_format || '',
        constraints: j.constraints || '',
        points: 100,
      })
      setOwnTestCases((((j as Record<string, unknown>).test_cases as { stdin?: string; expected_stdout?: string; is_sample?: boolean }[]) || []).map((tc) => ({
        stdin: String(tc.stdin ?? ''),
        expected: String(tc.expected_stdout ?? ''),
        is_sample: Boolean(tc.is_sample),
      })))
      setEditingSlug(slug)
      setProblemSource('own')
    } catch (e) {
      setCreatingOwnError(e instanceof Error ? e.message : String(e))
    } finally {
      setEditLoading(false)
    }
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
      const payload = {
        title: ownForm.title,
        difficulty: ownForm.difficulty,
        topics,
        statement_md: ownForm.statement_md,
        input_format: ownForm.input_format || null,
        output_format: ownForm.output_format || null,
        constraints: ownForm.constraints || null,
        test_cases,
      }
      if (editingSlug) {
        const res = await csrfFetch(`/api/problems/${encodeURIComponent(editingSlug)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const j = await res.json()
        if (!res.ok) throw new Error(j.error || 'Failed to update problem')
        setForm((f) => ({
          ...f,
          tasks: f.tasks.map((t) => t.slug === editingSlug
            ? { ...t, title: ownForm.title, difficulty: ownForm.difficulty }
            : t),
        }))
        setEditingSlug(null)
      } else {
        const res = await csrfFetch('/api/problems', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, slug, starter_code: {}, visibility: 'hackathon_only', is_published: true }),
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
      }
      setOwnForm({ title: '', difficulty: 'medium', topics: '', statement_md: '', input_format: '', output_format: '', constraints: '', points: 100 })
      setOwnTestCases([{ stdin: '', expected: '', is_sample: true }])
    } catch (e) {
      setCreatingOwnError(e instanceof Error ? e.message : String(e))
    } finally {
      setCreatingOwn(false)
    }
  }

  const [rubricTouched, setRubricTouched] = useState(false)
  const rubricHasEmptyName = form.features.judging_rubrics
    && form.features.rubric_criteria.some((c) => !c.name.trim())

  async function create() {
    if (!form.name.trim()) return
    if (rubricHasEmptyName) {
      setRubricTouched(true)
      setError('Give every rubric criterion a name, or remove the empty ones, before saving.')
      return
    }
    setBusy(true); setError(null)
    try {
      const res = await csrfFetch('/api/hackathons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name, description: form.description,
          num_teams: form.num_teams, max_per_team: form.max_per_team,
          timeout_minutes: form.timeout_minutes,
          starts_at: new Date(form.starts_at).toISOString(),
          tasks: form.tasks.map((t) => ({
            problem_slug: t.slug, problem_title: t.title,
            points: t.points, difficulty: t.difficulty, required: t.required,
          })),
          solve_limit: form.solve_limit || undefined,
          rules: form.rules,
          scoring: form.scoring,
          banner_url: form.banner_url,
          cert_template: form.cert_template,
          features: form.features,
        }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'failed')
      router.push('/dashboard/admin/hackathons')
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }

  if (!gate.ready) return null

  return (
    <div className="space-y-6">
      {/* Page header */}
      <PageHeader
        icon={<Trophy />}
        title="New hackathon event"
        description="Create a coding competition, assign problems and configure rules, features and scoring."
        actions={
          <Link href="/dashboard/admin/hackathons" className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/40 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" /> Back to events
          </Link>
        }
        className="mb-0"
      />

      {error && <Card className="rounded-2xl border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</Card>}

      <Panel className="space-y-6">
        {/* Step indicator */}
        <EventStepIndicator
          steps={[
            { n: 1, label: 'Basics', icon: FileText },
            { n: 2, label: 'Problems', icon: ListChecks },
            { n: 3, label: 'Rules and scoring', icon: Sliders },
            { n: 4, label: 'Features', icon: Settings },
            { n: 5, label: 'Review', icon: CheckSquare },
          ]}
          currentStep={step}
          onStepClick={(n) => setStep(n)}
        />

        {/* Step 1: Basics */}
        {step === 1 && (
          <div className="space-y-6">
            <h3 className="font-semibold text-lg">Event details</h3>
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
                max={1000}
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
              <div className="space-y-1.5">
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
            <div className="grid gap-6 md:grid-cols-2 mt-6">
              <div className="space-y-2.5">
                <Label className="text-sm font-medium">Starts at</Label>
                <Input type="datetime-local" className="h-10" value={form.starts_at} onChange={(e) => setForm((f) => ({ ...f, starts_at: e.target.value }))} />
                <p className="mt-1.5 text-[11px] text-muted-foreground bg-muted/30 p-2 rounded-md border border-border/50 inline-block">
                  Ends at {formatDateTime(new Date(form.starts_at).getTime() + form.timeout_minutes * 60000)}
                </p>
              </div>
              <div className="space-y-2.5">
                <Label className="text-sm font-medium">Banner image</Label>
              {form.banner_url && (
                <div className="relative w-full h-48 rounded-lg overflow-hidden border bg-muted mb-2">
                  <img src={form.banner_url} alt="Banner preview" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, banner_url: '' }))}
                    className="absolute top-2 right-2 rounded-full bg-black/60 text-white p-1.5 hover:bg-black/80"
                    aria-label="Remove banner image"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
              <Input
                type="file"
                accept="image/*"
                className="h-10 pt-2 cursor-pointer file:cursor-pointer file:mr-4 file:py-1 file:px-4 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
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
              <p className="text-xs text-muted-foreground">Upload an image or paste a URL below. Leave empty for default.</p>
              <Input
                value={form.banner_url.startsWith('data:') ? '' : form.banner_url}
                onChange={(e) => setForm((f) => ({ ...f, banner_url: e.target.value }))}
                placeholder="Or paste image URL..."
              />
            </div>
            </div>
            <Button onClick={() => setStep(2)}>Next: Problems →</Button>
          </div>
        )}

        {/* Step 2: Problems */}
        {step === 2 && (
          <div className="space-y-6">
            <h3 className="font-semibold text-lg">Assign problems</h3>
            <p className="text-sm text-muted-foreground">
              Choose how to add problems — pick from your library, write your own, or generate with AI.
            </p>

            <div className="flex gap-2">
              <button
                onClick={() => setProblemSource('pick')}
                className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all ${
                  problemSource === 'pick' ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card hover:bg-muted/50'
                }`}
              >
                <Search className="h-4 w-4" /> Pick from library
              </button>
              <button
                onClick={() => setProblemSource('own')}
                className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all ${
                  problemSource === 'own' ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card hover:bg-muted/50'
                }`}
              >
                <BookOpen className="h-4 w-4" /> Own questions
              </button>
              <button
                onClick={() => setProblemSource('ai')}
                className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all ${
                  problemSource === 'ai' ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card hover:bg-muted/50'
                }`}
              >
                <Sparkles className="h-4 w-4" /> AI generate
              </button>
            </div>

            {/* Pick from library */}
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
                          <div className="flex items-center gap-1 shrink-0">
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0"
                              onClick={() => setViewSlug(p.slug)} aria-label={`View ${p.title}`}>
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            {added ? (
                              <Badge variant="outline">Added</Badge>
                            ) : (
                              <Button size="sm" variant="ghost" onClick={() => setForm((f) => ({
                                ...f, tasks: [...f.tasks, { slug: p.slug, title: p.title, points: 100, difficulty: p.difficulty, required: true }]
                              }))}>Add</Button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )}

            {/* Own questions */}
            {problemSource === 'own' && (
              <div className="space-y-4 rounded-2xl border border-border/60 bg-muted/20 p-5">
                <div className="space-y-3">
                  <p className="text-sm font-semibold">
                    {editingSlug ? 'Edit problem' : 'Write your own problem'}
                    {editingSlug && <span className="ml-2 text-xs text-muted-foreground">editing {editingSlug}</span>}
                  </p>
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
                            <Label className="text-xs text-muted-foreground">Input</Label>
                            <Textarea rows={2} value={tc.stdin}
                              onChange={(e) => {
                                const next = [...ownTestCases]
                                next[i] = { ...next[i], stdin: e.target.value }
                                setOwnTestCases(next)
                              }}
                              placeholder="[2,7,11,15]&#10;9" className="font-mono text-xs" />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Expected output</Label>
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
                  <div className="flex items-center gap-2">
                    <Button onClick={createOwnProblem} disabled={creatingOwn || !ownForm.title.trim() || editLoading}>
                      {creatingOwn ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : (editingSlug ? <Pencil className="mr-1 h-3 w-3" /> : <Plus className="mr-1 h-3 w-3" />)}
                      {creatingOwn ? 'Saving…' : editingSlug ? 'Save changes' : 'Add to problems'}
                    </Button>
                    {editingSlug && (
                      <Button variant="ghost" size="sm" onClick={() => {
                        setEditingSlug(null)
                        setOwnForm({ title: '', difficulty: 'medium', topics: '', statement_md: '', input_format: '', output_format: '', constraints: '', points: 100 })
                        setOwnTestCases([{ stdin: '', expected: '', is_sample: true }])
                      }} disabled={editLoading}>
                        Cancel edit
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* AI generate */}
            {problemSource === 'ai' && (
              <div className="space-y-4 rounded-2xl border border-primary/20 bg-primary/5 p-5">
                <div className="flex items-start gap-3">
                  <Sparkles className="h-5 w-5 text-primary mt-0.5" />
                  <div className="flex-1 space-y-3">
                    <p className="text-sm font-semibold">AI generates problems for you</p>
                    <p className="text-xs text-muted-foreground">
                      Configure the role, difficulty, and topics. The AI will create a polished problem with test cases and add it to the event.
                    </p>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>Role / persona</Label>
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

            {/* Selected problems */}
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
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0"
                      onClick={() => setViewSlug(t.slug)} aria-label={`View ${t.title}`}>
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0"
                      onClick={() => editProblem(t.slug)} aria-label={`Edit ${t.title}`} disabled={editLoading}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
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
            <h3 className="font-semibold text-lg">Rules and scoring</h3>

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
              }))}>+ Add rule</Button>
            </div>

            <div className="rounded border p-4 space-y-4">
              <h4 className="text-sm font-semibold">Scoring configuration</h4>
              <div className="grid gap-4 md:grid-cols-4">
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
                  max={1000}
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
              <Button onClick={() => setStep(4)}>Next: Features →</Button>
            </div>
          </div>
        )}

        {/* Step 4: Features */}
        {step === 4 && (
          <div className="space-y-6">
            <div>
              <h3 className="font-semibold text-lg">Features and visibility</h3>
              <p className="text-sm text-muted-foreground mt-1">Toggle features on/off for this event. Participants will see and use only the enabled features.</p>
            </div>

            {/* Team & Participation */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-muted-foreground">Team and participation</h4>
              <div className="rounded-2xl border bg-muted/30 p-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">Team formation</Label>
                    <p className="text-xs text-muted-foreground">Allow participants to create and join teams</p>
                  </div>
                  <Switch checked={form.features.team_formation}
                    onCheckedChange={(checked) => setForm((f) => ({ ...f, features: { ...f.features, team_formation: checked } }))} />
                </div>
              </div>
              <div className="rounded-2xl border bg-muted/30 p-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">Claims system</Label>
                    <p className="text-xs text-muted-foreground">First-come lock on problems (5-minute claim timer)</p>
                  </div>
                  <Switch checked={form.features.claims_system}
                    onCheckedChange={(checked) => setForm((f) => ({ ...f, features: { ...f.features, claims_system: checked } }))} />
                </div>
              </div>
            </div>

            {/* Submission Settings */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-muted-foreground">Submission settings</h4>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border bg-muted/30 p-4 space-y-2">
                  <Label className="text-sm font-medium">Demo video</Label>
                  <select value={form.features.demo_video}
                    onChange={(e) => setForm((f) => ({ ...f, features: { ...f.features, demo_video: e.target.value as 'required' | 'optional' | 'disabled' } }))}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
                    <option value="required">Required</option>
                    <option value="optional">Optional</option>
                    <option value="disabled">Disabled</option>
                  </select>
                </div>
                <div className="rounded-2xl border bg-muted/30 p-4 space-y-2">
                  <Label className="text-sm font-medium">Live URL</Label>
                  <select value={form.features.live_url}
                    onChange={(e) => setForm((f) => ({ ...f, features: { ...f.features, live_url: e.target.value as 'required' | 'optional' | 'disabled' } }))}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
                    <option value="required">Required</option>
                    <option value="optional">Optional</option>
                    <option value="disabled">Disabled</option>
                  </select>
                </div>
              </div>
              <div className="rounded-2xl border bg-muted/30 p-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">Code upload (editor)</Label>
                    <p className="text-xs text-muted-foreground">Allow participants to write code in the built-in editor</p>
                  </div>
                  <Switch checked={form.features.code_upload}
                    onCheckedChange={(checked) => setForm((f) => ({ ...f, features: { ...f.features, code_upload: checked } }))} />
                </div>
              </div>
            </div>

            {/* Judging */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-muted-foreground">Judging and scoring</h4>
              <div className="rounded-2xl border bg-muted/30 p-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">Judging rubrics</Label>
                    <p className="text-xs text-muted-foreground">Use weighted criteria instead of simple 0-100</p>
                  </div>
                  <Switch checked={form.features.judging_rubrics}
                    onCheckedChange={(checked) => setForm((f) => ({ ...f, features: { ...f.features, judging_rubrics: checked } }))} />
                </div>
              </div>
              {form.features.judging_rubrics && (
                <div className="ml-4 pl-4 border-l-2 border-primary/20 space-y-3">
                  <p className="text-xs text-muted-foreground">Rubric criteria (weights should sum to 100):</p>
                  {form.features.rubric_criteria.map((c, i) => (
                    <div key={i} className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Input value={c.name} className="flex-1 h-8 text-xs"
                        aria-label={`Criterion ${i + 1} name`}
                        placeholder="Criterion name, e.g. Code quality"
                        aria-invalid={rubricTouched && !c.name.trim() ? true : undefined}
                        aria-describedby={rubricTouched && !c.name.trim() ? `rubric-name-error-${i}` : undefined}
                        onBlur={() => setRubricTouched(true)}
                        onChange={(e) => setForm((f) => ({
                          ...f, features: { ...f.features, rubric_criteria: f.features.rubric_criteria.map((x, idx) => idx === i ? { ...x, name: e.target.value } : x) }
                        }))} />
                      <Input type="number" value={c.weight} className="w-20 h-8 text-xs"
                        aria-label={`Criterion ${i + 1} weight (percent)`}
                        onChange={(e) => setForm((f) => ({
                          ...f, features: { ...f.features, rubric_criteria: f.features.rubric_criteria.map((x, idx) => idx === i ? { ...x, weight: Number(e.target.value) } : x) }
                        }))} />
                      <span className="text-xs text-muted-foreground">%</span>
                      <Button size="sm" variant="ghost" className="text-destructive h-6"
                        onClick={() => setForm((f) => ({
                          ...f, features: { ...f.features, rubric_criteria: f.features.rubric_criteria.filter((_, idx) => idx !== i) }
                        }))}
                        aria-label={`Remove criterion ${i + 1}`}>×</Button>
                    </div>
                    {rubricTouched && !c.name.trim() && (
                      <p id={`rubric-name-error-${i}`} className="text-xs text-destructive">Criterion name is required.</p>
                    )}
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={() => setForm((f) => ({
                    ...f, features: { ...f.features, rubric_criteria: [...f.features.rubric_criteria, { name: '', weight: 0 }] }
                  }))}>+ Add criterion</Button>
                </div>
              )}
            </div>

            {/* Visibility */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-muted-foreground">Visibility and engagement</h4>
              <div className="rounded-2xl border bg-muted/30 p-4 space-y-2">
                <Label className="text-sm font-medium">Leaderboard visibility</Label>
                <select value={form.features.leaderboard_visibility}
                  onChange={(e) => setForm((f) => ({ ...f, features: { ...f.features, leaderboard_visibility: e.target.value as 'public' | 'private' | 'after_event' } }))}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
                  <option value="public">Public (visible during event)</option>
                  <option value="after_event">After event ends</option>
                  <option value="private">Private (admin only)</option>
                </select>
              </div>
              {[
                { key: 'project_showcase' as const, label: 'Project showcase', desc: 'Show submitted projects publicly after event ends' },
                { key: 'forum' as const, label: 'Forum', desc: 'Q&A forum for participants during the event' },
                { key: 'proctoring' as const, label: 'Proctoring', desc: 'Detect cheating (tab switch, copy, paste, etc.)' },
                { key: 'certificates' as const, label: 'Certificates', desc: 'Generate certificates for participants' },
              ].map((item) => (
                <div key={item.key} className="rounded-2xl border bg-muted/30 p-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">{item.label}</Label>
                      <p className="text-xs text-muted-foreground">{item.desc}</p>
                    </div>
                    <Switch checked={form.features[item.key]}
                      onCheckedChange={(checked) => setForm((f) => ({ ...f, features: { ...f.features, [item.key]: checked } }))} />
                  </div>
                </div>
              ))}
            </div>

            {/* Sponsor Tracks */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-muted-foreground">Sponsor tracks</h4>
                <Button variant="outline" size="sm" onClick={() => setForm((f) => ({
                  ...f, features: { ...f.features, sponsor_tracks: [...f.features.sponsor_tracks, { name: '', prize: '', description: '' }] }
                }))}>+ Add track</Button>
              </div>
              {form.features.sponsor_tracks.length > 0 && (
                <div className="space-y-2">
                  {form.features.sponsor_tracks.map((t, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-xl border bg-muted/30 p-3">
                      <Input value={t.name} placeholder="Track name" className="flex-1 h-8 text-xs"
                        onChange={(e) => setForm((f) => ({
                          ...f, features: { ...f.features, sponsor_tracks: f.features.sponsor_tracks.map((x, idx) => idx === i ? { ...x, name: e.target.value } : x) }
                        }))} />
                      <Input value={t.prize} placeholder="Prize" className="w-32 h-8 text-xs"
                        onChange={(e) => setForm((f) => ({
                          ...f, features: { ...f.features, sponsor_tracks: f.features.sponsor_tracks.map((x, idx) => idx === i ? { ...x, prize: e.target.value } : x) }
                        }))} />
                      <Button size="sm" variant="ghost" className="text-destructive h-6"
                        onClick={() => setForm((f) => ({
                          ...f, features: { ...f.features, sponsor_tracks: f.features.sponsor_tracks.filter((_, idx) => idx !== i) }
                        }))}>×</Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setStep(3)}>← Back</Button>
              <Button onClick={() => setStep(5)}>Next: Review →</Button>
            </div>
          </div>
        )}

        {/* Step 5: Review */}
        {step === 5 && (
          <div className="space-y-6">
            <div>
              <h3 className="font-semibold text-lg">Review and create</h3>
              <p className="text-sm text-muted-foreground mt-1">Review your event configuration before creating.</p>
            </div>

            {/* Event Summary */}
            <div className="rounded-2xl border bg-muted/30 p-4 space-y-3">
              <h4 className="text-sm font-semibold">Event details</h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Name:</span> <span className="font-medium">{form.name || '—'}</span></div>
                <div><span className="text-muted-foreground">Duration:</span> <span className="font-medium">{form.timeout_minutes} min</span></div>
                <div><span className="text-muted-foreground">Teams:</span> <span className="font-medium">{form.num_teams} max</span></div>
                <div><span className="text-muted-foreground">Per team:</span> <span className="font-medium">{form.max_per_team} members</span></div>
                <div className="col-span-2"><span className="text-muted-foreground">Starts:</span> <span className="font-medium">{formatDateTime(form.starts_at)}</span></div>
                {form.description && (
                  <div className="col-span-2"><span className="text-muted-foreground">Description:</span> <span className="font-medium line-clamp-2">{form.description}</span></div>
                )}
              </div>
            </div>

            {/* Problems Summary */}
            <div className="rounded-2xl border bg-muted/30 p-4 space-y-3">
              <h4 className="text-sm font-semibold">Problems ({form.tasks.length})</h4>
              {form.tasks.length === 0 ? (
                <p className="text-xs text-muted-foreground">No problems added yet. Go back to Problems to add some.</p>
              ) : (
                <div className="space-y-2">
                  {form.tasks.map((t, i) => (
                    <div key={t.slug} className="flex items-center justify-between py-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Q{i + 1}</span>
                        <span className="text-sm">{t.title}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={`text-[11px] capitalize ${
                          t.difficulty === 'hard' ? 'text-red-600 dark:text-red-400 border-red-500/30' :
                          t.difficulty === 'medium' ? 'text-amber-700 dark:text-amber-300 border-amber-500/30' :
                          'text-green-700 dark:text-green-300 border-green-500/30'
                        }`}>{t.difficulty}</Badge>
                        <span className="text-xs tabular-nums text-muted-foreground">{t.points} pts</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Rules Summary */}
            <div className="rounded-2xl border bg-muted/30 p-4 space-y-3">
              <h4 className="text-sm font-semibold">Rules ({form.rules.length})</h4>
              {form.rules.length === 0 ? (
                <p className="text-xs text-muted-foreground">No rules added yet.</p>
              ) : (
                <div className="space-y-2">
                  {form.rules.map((r, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">{r.type}</Badge>
                      <span className="text-sm">{r.title}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Features Summary */}
            <div className="rounded-2xl border bg-muted/30 p-4 space-y-3">
              <h4 className="text-sm font-semibold">Enabled features</h4>
              <div className="flex flex-wrap gap-2">
                {form.features.team_formation && <Badge variant="secondary">Team formation</Badge>}
                {form.features.claims_system && <Badge variant="secondary">Claims system</Badge>}
                {form.features.code_upload && <Badge variant="secondary">Code editor</Badge>}
                {form.features.judging_rubrics && <Badge variant="secondary">Rubric judging</Badge>}
                {form.features.project_showcase && <Badge variant="secondary">Showcase</Badge>}
                {form.features.forum && <Badge variant="secondary">Forum</Badge>}
                {form.features.proctoring && <Badge variant="secondary">Proctoring</Badge>}
                {form.features.certificates && <Badge variant="secondary">Certificates</Badge>}
                {form.features.demo_video !== 'disabled' && <Badge variant="secondary">Demo video {form.features.demo_video}</Badge>}
                {form.features.live_url !== 'disabled' && <Badge variant="secondary">Live URL {form.features.live_url}</Badge>}
                {form.features.sponsor_tracks.length > 0 && <Badge variant="secondary">{form.features.sponsor_tracks.length} sponsor tracks</Badge>}
              </div>
              <div className="text-xs text-muted-foreground">
                Leaderboard: <span className="font-medium">{form.features.leaderboard_visibility}</span>
              </div>
            </div>

            {rubricTouched && rubricHasEmptyName && (
              <p role="alert" className="text-xs text-destructive">Some rubric criteria have no name. Name them or remove them in the judging step.</p>
            )}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setStep(4)}>← Back</Button>
              <Button onClick={create} disabled={busy}>
                {busy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Trophy className="mr-1 h-3 w-3" />}
                Create hackathon
              </Button>
            </div>
          </div>
        )}
      </Panel>
        <ProblemViewDialog open={viewSlug !== null} slug={viewSlug} onClose={() => setViewSlug(null)} />
    </div>
  )
}