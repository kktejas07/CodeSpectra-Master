'use client'

import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { toLocalDatetimeString, fromZonedDatetimeString } from '@/lib/datetime-local'
import { usePlatformTimezone } from '@/lib/use-platform-timezone'
import {
  Loader2, Plus, CalendarDays, Users, Timer, Trophy,
  Trash2, HelpCircle, CheckSquare, ListChecks,
  Shield, GripVertical, Pencil, Wand2, BookOpen, Search,
  Sparkles, ChevronDown, ChevronUp, X, ArrowLeft,
  Settings, FileText, Sliders,
} from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { usePageGuard } from '@/lib/use-page-guard'
import { csrfFetch } from '@/lib/csrf-fetch'
import { EventStepIndicator } from '@/components/hackathons/event-step-indicator'

interface ProblemOption { slug: string; title: string; difficulty: string; topics?: string[] }

export default function HackathonEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const gate = usePageGuard('superadmin')
  const tz = usePlatformTimezone()
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState(1)
  const [eventStatus, setEventStatus] = useState<string>('')

  const [form, setForm] = useState({
    name: '',
    description: '',
    num_teams: 8,
    max_per_team: 4,
    timeout_minutes: 60,
    starts_at: '',
    status: 'open' as 'draft' | 'open' | 'live' | 'closed',
    grace_period_minutes: 0,
    allow_late_submissions: false,
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
        { name: 'Technical Complexity', weight: 25 },
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

  useEffect(() => {
    fetch(`/api/hackathons/${encodeURIComponent(id)}`)
      .then(r => r.json())
      .then(doc => {
        if (doc.error) { setError(doc.error); return }
        setEventStatus(doc.status || '')
        const startsAt = new Date(doc.starts_at || Date.now())
        setForm({
          name: String(doc.name || ''),
          description: String(doc.description || ''),
          num_teams: Number(doc.num_teams) || 8,
          max_per_team: Number(doc.max_per_team) || 4,
          timeout_minutes: Number(doc.timeout_minutes) || 60,
          starts_at: toLocalDatetimeString(startsAt),
          status: (['draft', 'open', 'live', 'closed'].includes(doc.status) ? doc.status : 'open') as 'draft' | 'open' | 'live' | 'closed',
          grace_period_minutes: Number(doc.grace_period_minutes) || 0,
          allow_late_submissions: doc.allow_late_submissions === true,
          tasks: (Array.isArray(doc.tasks) ? doc.tasks : []).map((t: any) => ({
            slug: String(t.problem_slug || t.slug || ''),
            title: String(t.problem_title || t.title || ''),
            points: Number(t.points) || 100,
            difficulty: String(t.difficulty || 'medium'),
            required: t.required !== false,
          })),
          rules: Array.isArray(doc.rules) && doc.rules.length > 0
            ? doc.rules.map((r: any) => ({
                type: (r.type || 'general') as 'scoring' | 'submission' | 'conduct' | 'general',
                title: String(r.title || ''),
                description: String(r.description || ''),
              }))
            : form.rules,
          scoring: doc.scoring && typeof doc.scoring === 'object'
            ? {
                auto_grade: doc.scoring.auto_grade !== false,
                points_per_problem: Number(doc.scoring.points_per_problem) || 100,
                bonus_time: Number(doc.scoring.bonus_time) || 0,
                penalty_per_attempt: Number(doc.scoring.penalty_per_attempt) || 0,
              }
            : form.scoring,
          solve_limit: Number(doc.solve_limit) || 0,
          banner_url: typeof doc.banner_url === 'string' ? doc.banner_url : '',
          cert_template: (doc.cert_template as 'classic' | 'modern' | 'minimal' | 'professional' | 'corporate' | 'academic') || 'classic',
          features: doc.features && typeof doc.features === 'object'
            ? {
                team_formation: doc.features.team_formation !== false,
                claims_system: doc.features.claims_system === true,
                demo_video: (['required', 'optional', 'disabled'].includes(doc.features.demo_video) ? doc.features.demo_video : 'optional') as 'required' | 'optional' | 'disabled',
                live_url: (['required', 'optional', 'disabled'].includes(doc.features.live_url) ? doc.features.live_url : 'optional') as 'required' | 'optional' | 'disabled',
                code_upload: doc.features.code_upload !== false,
                judging_rubrics: doc.features.judging_rubrics === true,
                rubric_criteria: Array.isArray(doc.features.rubric_criteria) && doc.features.rubric_criteria.length > 0
                  ? doc.features.rubric_criteria.map((c: any) => ({ name: String(c.name || ''), weight: Number(c.weight) || 0 }))
                  : form.features.rubric_criteria,
                leaderboard_visibility: (['public', 'private', 'after_event'].includes(doc.features.leaderboard_visibility) ? doc.features.leaderboard_visibility : 'public') as 'public' | 'private' | 'after_event',
                project_showcase: doc.features.project_showcase !== false,
                forum: doc.features.forum === true,
                proctoring: doc.features.proctoring === true,
                certificates: doc.features.certificates !== false,
                sponsor_tracks: Array.isArray(doc.features.sponsor_tracks)
                  ? doc.features.sponsor_tracks.map((t: any) => ({ name: String(t.name || ''), prize: String(t.prize || ''), description: String(t.description || '') }))
                  : [],
              }
            : form.features,
        })
      })
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [id])

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
    setGenerating(true); setGeneratingError(null)
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
      const points = prob.points || aiConfig.count > 1 ? 100 : (prob.points || 100)
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
      setAiConfig((c) => ({ ...c, count: Math.max(1, c.count - 1) }))
    } catch (e) {
      setGeneratingError(e instanceof Error ? e.message : String(e))
    } finally {
      setGenerating(false)
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

  async function update() {
    if (!form.name.trim()) return
    setBusy(true); setError(null)
    try {
      // Use form.status for locked checks (the status being set)
      const isLocked = form.status === 'live' || form.status === 'closed'
      const body: Record<string, unknown> = {
        name: form.name,
        description: form.description,
        num_teams: form.num_teams,
        max_per_team: form.max_per_team,
        timeout_minutes: form.timeout_minutes,
        starts_at: fromZonedDatetimeString(form.starts_at, tz),
        status: form.status,
        grace_period_minutes: form.grace_period_minutes,
        allow_late_submissions: form.allow_late_submissions,
        banner_url: form.banner_url,
        cert_template: form.cert_template,
        solve_limit: form.solve_limit || undefined,
        features: form.features,
      }
      if (!isLocked) {
        body.tasks = form.tasks.map((t) => ({
          problem_slug: t.slug,
          problem_title: t.title,
          points: t.points,
          difficulty: t.difficulty,
          required: t.required,
        }))
        body.rules = form.rules
        body.scoring = form.scoring
      }
      const res = await csrfFetch(`/api/hackathons/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Update failed')
      router.push(`/dashboard/admin/hackathons/${encodeURIComponent(id)}`)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }

  if (!gate.ready || loading) return <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">Loading…</div>

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href={`/dashboard/admin/hackathons/${encodeURIComponent(id)}`} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" /> Back to event
          </Link>
          <div className="w-px h-6 bg-border" />
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Trophy className="h-7 w-7 text-primary" /> Edit Hackathon Event
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Update event details, problems, rules, and scoring configuration.
            </p>
          </div>
        </div>
      </div>

      {error && <Card className="border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</Card>}

      <Card className="space-y-6 p-6">
        {/* Step indicator */}
        <EventStepIndicator
          steps={[
            { n: 1, label: 'Basics', icon: FileText },
            { n: 2, label: 'Problems', icon: ListChecks },
            { n: 3, label: 'Rules & Scoring', icon: Sliders },
            { n: 4, label: 'Features', icon: Settings },
            { n: 5, label: 'Review', icon: CheckSquare },
          ]}
          currentStep={step}
          onStepClick={(n) => setStep(n)}
        />

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
              <div className="space-y-2">
                <Label>Teams allowed</Label>
                <Input type="number" min={1} max={500} value={form.num_teams} onChange={(e) => setForm((f) => ({ ...f, num_teams: Number(e.target.value) }))} />
              </div>
              <div className="space-y-2">
                <Label>Max per team</Label>
                <Input type="number" min={1} max={20} value={form.max_per_team} onChange={(e) => setForm((f) => ({ ...f, max_per_team: Number(e.target.value) }))} />
              </div>
              <div className="space-y-2">
                <Label>Duration (minutes)</Label>
                <Input type="number" min={5} value={form.timeout_minutes} onChange={(e) => setForm((f) => ({ ...f, timeout_minutes: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="grid gap-6 md:grid-cols-2 mt-6">
              <div className="space-y-2.5">
                <Label className="text-sm font-medium">Starts at</Label>
                <Input type="datetime-local" className="h-10" value={form.starts_at} onChange={(e) => setForm((f) => ({ ...f, starts_at: e.target.value }))} />
                <p className="mt-1.5 text-[11px] text-muted-foreground bg-muted/30 p-2 rounded-md border border-border/50 inline-block">
                  Ends at {new Date(new Date(form.starts_at).getTime() + form.timeout_minutes * 60000).toLocaleString()}
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

            {/* Event Status */}
            <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
              <h4 className="text-sm font-semibold">Event Status</h4>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Status</Label>
                  <select value={form.status}
                    onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as 'draft' | 'open' | 'live' | 'closed' }))}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
                    <option value="draft">Draft</option>
                    <option value="open">Open (Registration)</option>
                    <option value="live">Live (In Progress)</option>
                    <option value="closed">Closed</option>
                  </select>
                  {form.status === 'live' && (
                    <p className="text-xs text-amber-600">⚠ Live events have locked problems, rules, and features.</p>
                  )}
                  {form.status === 'closed' && (
                    <p className="text-xs text-muted-foreground">Closed events can be reopened to "open" status.</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Grace Period (minutes)</Label>
                  <Input type="number" min={0} max={1440} value={form.grace_period_minutes || 0}
                    onChange={(e) => setForm((f) => ({ ...f, grace_period_minutes: Number(e.target.value) }))} />
                  <p className="text-xs text-muted-foreground">Allow submissions after event ends (0 = disabled, max 24h)</p>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Late Submissions</Label>
                  <p className="text-xs text-muted-foreground">Allow submissions during grace period</p>
                </div>
                <Switch checked={form.allow_late_submissions || false}
                  onCheckedChange={(checked) => setForm((f) => ({ ...f, allow_late_submissions: checked }))} />
              </div>
            </div>

            <Button onClick={() => setStep(2)} disabled={form.status === 'live' || form.status === 'closed'}>Next: Problems →</Button>
          </div>
        )}

        {/* Step 2: Problems */}
        {step === 2 && (
          <div className="space-y-6">
            <h3 className="font-semibold text-lg">Assign Problems</h3>
            {(form.status === 'live' || form.status === 'closed') && (
              <Card className="border-yellow-400/40 bg-yellow-50 dark:bg-yellow-950/20 p-3 text-sm text-yellow-800 dark:text-yellow-200">
                <strong>⚠ Locked</strong> — Problems cannot be modified while the event is {form.status}. Go back to Basics to update other settings.
              </Card>
            )}
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

            {/* Own questions */}
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
                      <Input type="number" value={ownForm.points} min={10}
                        onChange={(e) => setOwnForm((f) => ({ ...f, points: Number(e.target.value) }))} />
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

            {/* AI generate */}
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
                    </div>
                    {generatingError && <p className="text-xs text-destructive">{generatingError}</p>}
                    <div className="flex gap-2">
                      <Button onClick={generateAiProblems} disabled={generating}>
                        {generating ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Wand2 className="mr-1 h-3 w-3" />}
                        {generating ? 'Generating…' : `Generate problem${aiConfig.count > 1 ? ` (${aiConfig.count} left)` : ''}`}
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
              <Button onClick={() => setStep(3)} disabled={form.status === 'live' || form.status === 'closed'}>Next: Rules →</Button>
            </div>
          </div>
        )}

        {/* Step 3: Rules & Scoring */}
        {step === 3 && (
          <div className="space-y-6">
            <h3 className="font-semibold text-lg">Rules & Scoring</h3>
            {(form.status === 'live' || form.status === 'closed') && (
              <Card className="border-yellow-400/40 bg-yellow-50 dark:bg-yellow-950/20 p-3 text-sm text-yellow-800 dark:text-yellow-200">
                <strong>⚠ Locked</strong> — Rules & Scoring cannot be modified while the event is {form.status}. Go back to Basics to update other settings.
              </Card>
            )}

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

            <div className="rounded border p-4 space-y-3">
              <h4 className="text-sm font-semibold">Scoring Configuration</h4>
              <div className="grid gap-4 md:grid-cols-4">
                <div className="space-y-2">
                  <Label>Points per problem</Label>
                  <Input type="number" value={form.scoring.points_per_problem}
                    onChange={(e) => setForm((f) => ({ ...f, scoring: { ...f.scoring, points_per_problem: Number(e.target.value) } }))} />
                </div>
                <div className="space-y-2">
                  <Label>Bonus time (early submit)</Label>
                  <Input type="number" value={form.scoring.bonus_time}
                    onChange={(e) => setForm((f) => ({ ...f, scoring: { ...f.scoring, bonus_time: Number(e.target.value) } }))} />
                </div>
                <div className="space-y-2">
                  <Label>Penalty per attempt</Label>
                  <Input type="number" value={form.scoring.penalty_per_attempt}
                    onChange={(e) => setForm((f) => ({ ...f, scoring: { ...f.scoring, penalty_per_attempt: Number(e.target.value) } }))} />
                </div>
                <div className="space-y-2">
                  <Label>Solve Limit (0 = All)</Label>
                  <Input type="number" value={form.solve_limit} min={0}
                    onChange={(e) => setForm((f) => ({ ...f, solve_limit: Number(e.target.value) }))} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="auto_grade" checked={form.scoring.auto_grade}
                  onChange={(e) => setForm((f) => ({ ...f, scoring: { ...f.scoring, auto_grade: e.target.checked } }))} />
                <Label htmlFor="auto_grade">Auto-grade submissions on submit</Label>
              </div>
            </div>

            <div className="rounded border p-4 space-y-3">
              <h4 className="text-sm font-semibold">Certificate</h4>
              <div className="space-y-1.5">
                <Label>Certificate Template</Label>
                <select
                  value={form.cert_template}
                  onChange={(e) => setForm((f) => ({ ...f, cert_template: e.target.value as 'classic' | 'modern' | 'minimal' | 'professional' | 'corporate' | 'academic' }))}
                  className="flex h-10 w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm"
                >
                  <option value="classic">Classic (Gold/Serif)</option>
                  <option value="modern">Modern (Dark Gradient)</option>
                  <option value="minimal">Minimal (Monochrome)</option>
                  <option value="professional">Professional (Blue/White)</option>
                  <option value="corporate">Corporate (Navy/Gold)</option>
                  <option value="academic">Academic (Green/Cream)</option>
                </select>
                <p className="text-xs text-muted-foreground">Template used for participant certificates on the results page.</p>
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
              <h3 className="font-semibold text-lg">Features & Visibility</h3>
              <p className="text-sm text-muted-foreground mt-1">Toggle features on/off for this event.</p>
            </div>

            {(form.status === 'live' || form.status === 'closed') && (
              <Card className="border-yellow-400/40 bg-yellow-50 dark:bg-yellow-950/20 p-3 text-sm text-yellow-800 dark:text-yellow-200">
                <strong>⚠ Features Locked</strong> — Cannot change features during {form.status} event.
              </Card>
            )}

            {/* Team & Participation */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Team & Participation</h4>
              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">Team Formation</Label>
                    <p className="text-xs text-muted-foreground">Allow participants to create and join teams</p>
                  </div>
                  <Switch checked={form.features.team_formation}
                    onCheckedChange={(checked) => setForm((f) => ({ ...f, features: { ...f.features, team_formation: checked } }))} />
                </div>
              </div>
              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">Claims System</Label>
                    <p className="text-xs text-muted-foreground">First-come lock on problems (5-minute claim timer)</p>
                  </div>
                  <Switch checked={form.features.claims_system}
                    onCheckedChange={(checked) => setForm((f) => ({ ...f, features: { ...f.features, claims_system: checked } }))} />
                </div>
              </div>
            </div>

            {/* Submission Settings */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Submission Settings</h4>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
                  <Label className="text-sm font-medium">Demo Video</Label>
                  <select value={form.features.demo_video}
                    onChange={(e) => setForm((f) => ({ ...f, features: { ...f.features, demo_video: e.target.value as 'required' | 'optional' | 'disabled' } }))}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
                    <option value="required">Required</option>
                    <option value="optional">Optional</option>
                    <option value="disabled">Disabled</option>
                  </select>
                </div>
                <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
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
              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">Code Upload (Editor)</Label>
                    <p className="text-xs text-muted-foreground">Allow participants to write code in the built-in editor</p>
                  </div>
                  <Switch checked={form.features.code_upload}
                    onCheckedChange={(checked) => setForm((f) => ({ ...f, features: { ...f.features, code_upload: checked } }))} />
                </div>
              </div>
            </div>

            {/* Judging */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Judging & Scoring</h4>
              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">Judging Rubrics</Label>
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
                    <div key={i} className="flex items-center gap-2">
                      <Input value={c.name} className="flex-1 h-8 text-xs"
                        onChange={(e) => setForm((f) => ({
                          ...f, features: { ...f.features, rubric_criteria: f.features.rubric_criteria.map((x, idx) => idx === i ? { ...x, name: e.target.value } : x) }
                        }))} />
                      <Input type="number" value={c.weight} className="w-20 h-8 text-xs"
                        onChange={(e) => setForm((f) => ({
                          ...f, features: { ...f.features, rubric_criteria: f.features.rubric_criteria.map((x, idx) => idx === i ? { ...x, weight: Number(e.target.value) } : x) }
                        }))} />
                      <span className="text-xs text-muted-foreground">%</span>
                      <Button size="sm" variant="ghost" className="text-destructive h-6"
                        onClick={() => setForm((f) => ({
                          ...f, features: { ...f.features, rubric_criteria: f.features.rubric_criteria.filter((_, idx) => idx !== i) }
                        }))}>×</Button>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={() => setForm((f) => ({
                    ...f, features: { ...f.features, rubric_criteria: [...f.features.rubric_criteria, { name: '', weight: 0 }] }
                  }))}>+ Add Criterion</Button>
                </div>
              )}
            </div>

            {/* Visibility */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Visibility & Engagement</h4>
              <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
                <Label className="text-sm font-medium">Leaderboard Visibility</Label>
                <select value={form.features.leaderboard_visibility}
                  onChange={(e) => setForm((f) => ({ ...f, features: { ...f.features, leaderboard_visibility: e.target.value as 'public' | 'private' | 'after_event' } }))}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
                  <option value="public">Public (visible during event)</option>
                  <option value="after_event">After Event Ends</option>
                  <option value="private">Private (admin only)</option>
                </select>
              </div>
              {[
                { key: 'project_showcase' as const, label: 'Project Showcase', desc: 'Show submitted projects publicly after event ends' },
                { key: 'forum' as const, label: 'Forum', desc: 'Q&A forum for participants during the event' },
                { key: 'proctoring' as const, label: 'Proctoring', desc: 'Detect cheating (tab switch, copy, paste, etc.)' },
                { key: 'certificates' as const, label: 'Certificates', desc: 'Generate certificates for participants' },
              ].map((item) => (
                <div key={item.key} className="rounded-lg border bg-muted/30 p-4">
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
                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Sponsor Tracks</h4>
                <Button variant="outline" size="sm" onClick={() => setForm((f) => ({
                  ...f, features: { ...f.features, sponsor_tracks: [...f.features.sponsor_tracks, { name: '', prize: '', description: '' }] }
                }))}>+ Add Track</Button>
              </div>
              {form.features.sponsor_tracks.length > 0 && (
                <div className="space-y-2">
                  {form.features.sponsor_tracks.map((t, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3">
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
              <h3 className="font-semibold text-lg">Review & Update</h3>
              <p className="text-sm text-muted-foreground mt-1">Review your changes before updating.</p>
            </div>

            {/* Event Summary */}
            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
              <h4 className="text-sm font-semibold">Event Details</h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Name:</span> <span className="font-medium">{form.name || '—'}</span></div>
                <div><span className="text-muted-foreground">Duration:</span> <span className="font-medium">{form.timeout_minutes} min</span></div>
                <div><span className="text-muted-foreground">Teams:</span> <span className="font-medium">{form.num_teams} max</span></div>
                <div><span className="text-muted-foreground">Per team:</span> <span className="font-medium">{form.max_per_team} members</span></div>
                <div className="col-span-2"><span className="text-muted-foreground">Starts:</span> <span className="font-medium">{new Date(form.starts_at).toLocaleString()}</span></div>
              </div>
            </div>

            {/* Problems Summary */}
            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
              <h4 className="text-sm font-semibold">Problems ({form.tasks.length})</h4>
              {form.tasks.length === 0 ? (
                <p className="text-xs text-muted-foreground">No problems added</p>
              ) : (
                <div className="space-y-2">
                  {form.tasks.map((t, i) => (
                    <div key={t.slug} className="flex items-center justify-between py-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Q{i + 1}</span>
                        <span className="text-sm">{t.title}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={`text-[10px] ${
                          t.difficulty === 'hard' ? 'text-rose-500 border-rose-500/30' :
                          t.difficulty === 'medium' ? 'text-amber-500 border-amber-500/30' :
                          'text-emerald-500 border-emerald-500/30'
                        }`}>{t.difficulty}</Badge>
                        <span className="text-xs text-muted-foreground">{t.points} pts</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Features Summary */}
            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
              <h4 className="text-sm font-semibold">Enabled Features</h4>
              <div className="flex flex-wrap gap-2">
                {form.features.team_formation && <Badge variant="secondary">Team Formation</Badge>}
                {form.features.claims_system && <Badge variant="secondary">Claims System</Badge>}
                {form.features.code_upload && <Badge variant="secondary">Code Editor</Badge>}
                {form.features.judging_rubrics && <Badge variant="secondary">Rubric Judging</Badge>}
                {form.features.project_showcase && <Badge variant="secondary">Showcase</Badge>}
                {form.features.forum && <Badge variant="secondary">Forum</Badge>}
                {form.features.proctoring && <Badge variant="secondary">Proctoring</Badge>}
                {form.features.certificates && <Badge variant="secondary">Certificates</Badge>}
                {form.features.demo_video !== 'disabled' && <Badge variant="secondary">Demo Video {form.features.demo_video}</Badge>}
                {form.features.live_url !== 'disabled' && <Badge variant="secondary">Live URL {form.features.live_url}</Badge>}
                {form.features.sponsor_tracks.length > 0 && <Badge variant="secondary">{form.features.sponsor_tracks.length} Sponsor Tracks</Badge>}
              </div>
              <div className="text-xs text-muted-foreground">
                Leaderboard: <span className="font-medium">{form.features.leaderboard_visibility}</span>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setStep(4)}>← Back</Button>
              <Button onClick={update} disabled={busy}>
                {busy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Trophy className="mr-1 h-3 w-3" />}
                Update Event
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}