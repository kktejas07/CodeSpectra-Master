'use client'
import { formatDateTime, formatDate } from '@/lib/format-datetime'

import React, { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Trophy, Plus, Loader2, Trash2, Pencil, Calendar, Users, Target, BookOpen,
  Settings, Sparkles, X, Shield, Award, Terminal, Share2, Copy, ExternalLink,
  Code2, CheckCircle2, XCircle, Search, MessageSquare, Star, ArrowRight, Eye,
  Check, AlertCircle, Clock, FileCode, CheckSquare
} from 'lucide-react'
import { SkeletonTable } from '@/components/ui/skeleton-boneyard'
import { usePageGuard } from '@/lib/use-page-guard'
import { DataTable, type DataTableColumn, type BulkAction } from '@/components/ui/data-table'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'
import { TenantFilter, tenantQuery } from '@/components/hackathons/tenant-filter'
import { ReleaseResultsDialog } from '@/components/codeathons/release-results-dialog'

interface TestCase {
  input: string
  expected: string
  hidden?: boolean
}

/** Problem-bank / AI tests ({ stdin, expected_stdout, is_sample }) → codeathon tests ({ input, expected, hidden }). */
function toCodeathonTests(raw: unknown): TestCase[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((t) => (t && typeof t === 'object' ? (t as Record<string, unknown>) : null))
    .filter((t): t is Record<string, unknown> => !!t)
    .map((t) => ({
      input: String(t.input ?? t.stdin ?? ''),
      expected: String(t.expected ?? t.expected_stdout ?? ''),
      hidden: t.hidden === true || t.is_sample === false,
    }))
    .filter((t) => t.expected.trim().length > 0)
}

interface Problem {
  id: string
  title: string
  difficulty: 'Easy' | 'Medium' | 'Hard'
  points: number
  description: string
  input_format?: string
  output_format?: string
  constraints?: string[]
  sample_input?: string
  sample_output?: string
  test_cases?: TestCase[]
}

interface Codeathon {
  id: string
  title: string
  description: string
  difficulty: string
  topics: string[]
  rules: string
  maxParticipants: number
  startDate: string
  endDate: string
  status: string
  participants: number
  prizePool: string
  cert_template?: string
  problems?: Problem[]
  event_type?: string
  team_size_min?: number
  team_size_max?: number
  problem_visibility?: string
  results_released?: boolean
  released_at?: string
  tenant_id?: string | null
}

interface CodeathonFormData {
  title: string
  description: string
  difficulty: string
  topics: string[]
  rules: string
  maxParticipants: number
  startDate: string
  endDate: string
  prizePool: string
  cert_template: string
  event_type: string
  team_size_min: number
  team_size_max: number
  problem_visibility: string
}

interface Submission {
  id: string
  user_id: string
  userName?: string
  userEmail?: string
  problem_id: string
  problemTitle?: string
  problemPoints?: number
  problemDifficulty?: string
  code: string
  language: string
  status: string
  score: number
  test_cases_passed: number
  test_cases_total: number
  output?: string
  error?: string
  is_reviewed?: boolean
  review_notes?: string
  reviewer_name?: string
  reviewed_at?: string
  created_at: string
}

interface BankProblemOption {
  id?: string
  slug?: string
  title: string
  difficulty: string
  topics?: string[]
  statement_md?: string
  description?: string
}

const DIFFICULTIES = ['Easy', 'Medium', 'Hard', 'Mixed']
const TOPIC_OPTIONS = [
  'Algorithms', 'Data Structures', 'Web Development', 'Mobile Development',
  'Machine Learning', 'DevOps', 'System Design', 'Database', 'Security', 'Open Innovation'
]

const INITIAL_FORM: CodeathonFormData = {
  title: '',
  description: '',
  difficulty: 'Medium',
  topics: [],
  rules: '',
  maxParticipants: 0,
  startDate: '',
  endDate: '',
  prizePool: '',
  cert_template: 'classic',
  event_type: 'individual',
  team_size_min: 2,
  team_size_max: 4,
  problem_visibility: 'during_contest'
}

/**
 * Top-level form fields component so inputs don't unmount or lose focus on keystrokes.
 */
function CodeathonFormFields({
  formData,
  setFormData,
}: {
  formData: CodeathonFormData
  setFormData: React.Dispatch<React.SetStateAction<CodeathonFormData>>
}) {
  const toggleTopic = (topic: string) => {
    setFormData((prev) => ({
      ...prev,
      topics: prev.topics.includes(topic)
        ? prev.topics.filter((t) => t !== topic)
        : [...prev.topics, topic]
    }))
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6">
      {/* Left Column: Basic Information & Topics */}
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-foreground">Title *</Label>
          <Input
            value={formData.title}
            onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
            placeholder="e.g. Hackwave 3.0 X StudentAlumni"
            className="h-9 text-sm"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-foreground">Description</Label>
          <Textarea
            value={formData.description}
            onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
            rows={3}
            placeholder="Describe the codeathon objectives, audience, and scope..."
            className="text-sm resize-none"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-foreground">Rules & guidelines</Label>
          <Textarea
            value={formData.rules}
            onChange={(e) => setFormData((prev) => ({ ...prev, rules: e.target.value }))}
            rows={3}
            placeholder="Code of conduct, allowed tools/languages, submission criteria..."
            className="text-sm resize-none"
          />
        </div>

        <div className="space-y-2 pt-1">
          <Label className="text-xs font-semibold text-foreground">Topics and focus areas</Label>
          <div className="flex flex-wrap gap-1.5 p-3 rounded-lg border border-border/60 bg-muted/20">
            {TOPIC_OPTIONS.map((t) => {
              const active = formData.topics.includes(t)
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleTopic(t)}
                  className={cn(
                    'px-2.5 py-1 rounded-full text-xs font-medium border transition-all',
                    active
                      ? 'bg-primary text-primary-foreground font-semibold border-primary shadow-xs'
                      : 'bg-card text-muted-foreground border-border hover:border-primary/40 hover:text-foreground'
                  )}
                >
                  {t}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Right Column: Parameters, Dates, and Format */}
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-foreground">Difficulty</Label>
            <Select
              value={formData.difficulty}
              onValueChange={(v) => setFormData((prev) => ({ ...prev, difficulty: v }))}
            >
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DIFFICULTIES.map((d) => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-foreground">Max participants</Label>
            <Input
              type="number"
              min={0}
              value={formData.maxParticipants || ''}
              onChange={(e) => setFormData((prev) => ({ ...prev, maxParticipants: Number(e.target.value) || 0 }))}
              placeholder="0 = unlimited"
              className="h-9 text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-foreground">Start date and time</Label>
            <Input
              type="datetime-local"
              value={formData.startDate}
              onChange={(e) => setFormData((prev) => ({ ...prev, startDate: e.target.value }))}
              className="h-9 text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-foreground">End date and time</Label>
            <Input
              type="datetime-local"
              value={formData.endDate}
              onChange={(e) => setFormData((prev) => ({ ...prev, endDate: e.target.value }))}
              className="h-9 text-xs"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-foreground">Prize pool</Label>
            <Input
              value={formData.prizePool}
              onChange={(e) => setFormData((prev) => ({ ...prev, prizePool: e.target.value }))}
              placeholder="e.g. ₹50,000 / $1,000"
              className="h-9 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-foreground">Certificate template</Label>
            <Select
              value={formData.cert_template}
              onValueChange={(v) => setFormData((prev) => ({ ...prev, cert_template: v }))}
            >
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="classic">Classic (gold / serif)</SelectItem>
                <SelectItem value="modern">Modern (dark gradient)</SelectItem>
                <SelectItem value="minimal">Minimal (Monochrome)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Event Format Card */}
        <div className="rounded-xl border border-border/80 bg-muted/15 p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Terminal className="h-4 w-4 text-primary" />
            <span>Event format and visibility</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Event type</Label>
              <Select
                value={formData.event_type}
                onValueChange={(v) => setFormData((prev) => ({ ...prev, event_type: v }))}
              >
                <SelectTrigger className="h-8 text-xs bg-background"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="individual">Individual</SelectItem>
                  <SelectItem value="team">Team competition</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Problem visibility</Label>
              <Select
                value={formData.problem_visibility}
                onValueChange={(v) => setFormData((prev) => ({ ...prev, problem_visibility: v }))}
              >
                <SelectTrigger className="h-8 text-xs bg-background"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="during_contest">When contest starts</SelectItem>
                  <SelectItem value="immediate">Immediate on publish</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {formData.event_type === 'team' && (
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border/50">
              <div className="space-y-1">
                <Label className="text-xs">Min team size</Label>
                <Input
                  type="number"
                  min={1}
                  max={formData.team_size_max}
                  value={formData.team_size_min}
                  onChange={(e) => setFormData((prev) => ({ ...prev, team_size_min: Math.max(1, Number(e.target.value) || 1) }))}
                  className="h-8 text-xs bg-background"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Max team size</Label>
                <Input
                  type="number"
                  min={formData.team_size_min}
                  value={formData.team_size_max}
                  onChange={(e) => setFormData((prev) => ({ ...prev, team_size_max: Math.max(prev.team_size_min, Number(e.target.value) || 4) }))}
                  className="h-8 text-xs bg-background"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function AdminCodeathonsPage() {
  const gate = usePageGuard('tenant_admin')
  const addToast = useToast()
  const [codeathons, setCodeathons] = useState<Codeathon[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Create modal
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState<CodeathonFormData>(INITIAL_FORM)
  const [createProblems, setCreateProblems] = useState<Problem[]>([])

  // Edit modal
  const [editing, setEditing] = useState<Codeathon | null>(null)
  const [editForm, setEditForm] = useState<CodeathonFormData>(INITIAL_FORM)
  const [editingProblems, setEditingProblems] = useState<Problem[]>([])

  // Standalone Problem Set Manager Modal
  const [problemManagerTarget, setProblemManagerTarget] = useState<Codeathon | null>(null)
  const [standaloneProblems, setStandaloneProblems] = useState<Problem[]>([])

  // Problem creation sub-form
  const [problemTab, setProblemTab] = useState<'create' | 'bank' | 'ai'>('create')
  const [problemForm, setProblemForm] = useState<{
    title: string
    difficulty: 'Easy' | 'Medium' | 'Hard'
    points: number
    description: string
    sample_input: string
    sample_output: string
  }>({
    title: '',
    difficulty: 'Medium',
    points: 100,
    description: '',
    sample_input: '',
    sample_output: '',
  })

  // Bank problem picker state
  const [bankSearch, setBankSearch] = useState('')
  const [bankResults, setBankResults] = useState<BankProblemOption[]>([])
  const [loadingBank, setLoadingBank] = useState(false)

  // AI Problem Generator state
  const [aiRole, setAiRole] = useState('Software Engineer')
  const [aiDifficulty, setAiDifficulty] = useState<'Easy' | 'Medium' | 'Hard'>('Medium')
  const [aiTopic, setAiTopic] = useState('Algorithms')
  const [generatingAi, setGeneratingAi] = useState(false)

  // Submissions & Reviews Modal
  const [submissionsTarget, setSubmissionsTarget] = useState<Codeathon | null>(null)
  const [submissionsList, setSubmissionsList] = useState<Submission[]>([])
  const [loadingSubmissions, setLoadingSubmissions] = useState(false)
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null)
  const [reviewScore, setReviewScore] = useState<number>(100)
  const [reviewStatus, setReviewStatus] = useState<string>('accepted')
  const [reviewNotes, setReviewNotes] = useState<string>('')
  const [savingReview, setSavingReview] = useState(false)

  // Share Codeathon Modal
  const [shareTarget, setShareTarget] = useState<Codeathon | null>(null)
  const [copiedLink, setCopiedLink] = useState(false)

  const [loadError, setLoadError] = useState(false)
  // Results release step
  const [resultsTarget, setResultsTarget] = useState<Codeathon | null>(null)
  // Superadmin-only organization filter ('' = all, 'global' = platform events).
  const [tenant, setTenant] = useState('')
  const isSuper = gate.user?.role === 'superadmin'

  const fetchData = async () => {
    setLoading(true)
    try {
      const q = isSuper ? tenantQuery(tenant) : ''
      const res = await fetch(`/api/codeathons${q ? `?${q}` : ''}`, { credentials: 'include' })
      if (!res.ok) throw new Error(`Failed to load codeathons (${res.status})`)
      const json = await res.json()
      setCodeathons(json.data || [])
      setLoadError(false)
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (gate.ready) void fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gate.ready, isSuper, tenant])

  const handleDelete = async (ids: string[]) => {
    const deleted: string[] = []
    for (const id of ids) {
      try {
        const res = await csrfFetch(`/api/codeathons?id=${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'include' })
        if (res.ok) deleted.push(id)
      } catch { /* counted as failed below */ }
    }
    const failed = ids.length - deleted.length
    if (deleted.length > 0) addToast({ type: 'success', title: `${deleted.length} codeathon${deleted.length !== 1 ? 's' : ''} deleted` })
    if (failed > 0) addToast({ type: 'error', title: `${failed} codeathon${failed !== 1 ? 's' : ''} could not be deleted` })
    setCodeathons((prev) => prev.filter((c) => !deleted.includes(c.id)))
  }

  const openEdit = (c: Codeathon) => {
    setEditForm({
      title: c.title || '',
      description: c.description || '',
      difficulty: c.difficulty || 'Medium',
      topics: c.topics || [],
      rules: c.rules || '',
      maxParticipants: c.maxParticipants || 0,
      startDate: c.startDate || '',
      endDate: c.endDate || '',
      prizePool: c.prizePool || '',
      cert_template: c.cert_template || 'classic',
      event_type: c.event_type || 'individual',
      team_size_min: c.team_size_min || 2,
      team_size_max: c.team_size_max || 4,
      problem_visibility: c.problem_visibility || 'during_contest',
    })
    setEditingProblems(c.problems || [])
    setEditing(c)
  }

  const openProblemManager = (c: Codeathon) => {
    setProblemManagerTarget(c)
    setStandaloneProblems(c.problems || [])
  }

  const handleCreate = async () => {
    if (!form.title.trim()) {
      addToast({ type: 'error', title: 'Title is required' })
      return
    }
    setSaving(true)
    try {
      const res = await csrfFetch('/api/codeathons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...form, problems: createProblems, status: 'upcoming' }),
      })
      if (!res.ok) throw new Error('Failed to create codeathon')
      void fetchData()
      addToast({ type: 'success', title: 'Codeathon created successfully with problem set!' })
      setCreateOpen(false)
      setForm(INITIAL_FORM)
      setCreateProblems([])
    } catch {
      addToast({ type: 'error', title: 'Failed to create codeathon' })
    } finally {
      setSaving(false)
    }
  }

  const saveEdit = async () => {
    if (!editing) return
    setSaving(true)
    try {
      const res = await csrfFetch(`/api/codeathons/${editing.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...editForm, problems: editingProblems }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(typeof j?.error === 'string' ? j.error : 'Failed to update codeathon')
      }
      addToast({ type: 'success', title: 'Codeathon updated successfully' })
      setEditing(null)
      void fetchData()
    } catch (e) {
      addToast({ type: 'error', title: e instanceof Error ? e.message : 'Failed to update codeathon' })
    } finally {
      setSaving(false)
    }
  }

  const saveStandaloneProblems = async () => {
    if (!problemManagerTarget) return
    setSaving(true)
    try {
      const res = await csrfFetch(`/api/codeathons/${problemManagerTarget.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ problems: standaloneProblems }),
      })
      if (!res.ok) throw new Error('Failed to update problems')
      addToast({ type: 'success', title: 'Problem set updated successfully!' })
      setProblemManagerTarget(null)
      void fetchData()
    } catch {
      addToast({ type: 'error', title: 'Failed to update problems' })
    } finally {
      setSaving(false)
    }
  }

  const searchBankProblems = async (query: string) => {
    setLoadingBank(true)
    try {
      const res = await fetch(`/api/problems?search=${encodeURIComponent(query)}&limit=15`)
      const j = await res.json()
      setBankResults(j.data || j.items || [])
    } catch {
      setBankResults([])
    } finally {
      setLoadingBank(false)
    }
  }

  const generateAiProblem = async (targetListSetter: React.Dispatch<React.SetStateAction<Problem[]>>) => {
    setGeneratingAi(true)
    try {
      const res = await csrfFetch('/api/ai/generate-problem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: aiRole,
          difficulty: aiDifficulty.toLowerCase(),
          topics: [aiTopic],
          language_hint: 'python',
          publish: false,
        }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Failed to generate problem')
      
      // The API returns { problem: {...} } with tests as { stdin, expected_stdout, is_sample }.
      const prob = (j.problem || {}) as Record<string, unknown>
      const tests = toCodeathonTests(prob.test_cases)
      if (tests.length === 0) throw new Error('The generated problem has no test cases. Try again.')
      const sample = tests.find((t) => !t.hidden)
      const newProb: Problem = {
        id: crypto.randomUUID(),
        title: String(prob.title || `${aiTopic} Challenge`),
        difficulty: aiDifficulty,
        points: aiDifficulty === 'Easy' ? 50 : aiDifficulty === 'Hard' ? 200 : 100,
        description: String(prob.statement_md || prob.description || 'Complete the implementation according to the problem requirements.'),
        input_format: typeof prob.input_format === 'string' ? prob.input_format : undefined,
        output_format: typeof prob.output_format === 'string' ? prob.output_format : undefined,
        sample_input: sample?.input || '',
        sample_output: sample?.expected || '',
        test_cases: tests,
      }
      targetListSetter((prev) => [...prev, newProb])
      addToast({ type: 'success', title: 'AI problem generated and added to the competition' })
    } catch (e) {
      addToast({ type: 'error', title: e instanceof Error ? e.message : 'AI generation failed' })
    } finally {
      setGeneratingAi(false)
    }
  }

  const loadSubmissions = async (c: Codeathon) => {
    setSubmissionsTarget(c)
    setSelectedSubmission(null)
    setLoadingSubmissions(true)
    try {
      const res = await csrfFetch(`/api/codeathons/${c.id}/submissions`, { credentials: 'include' })
      const json = await res.json()
      setSubmissionsList(json.data || [])
    } catch {
      setSubmissionsList([])
    } finally {
      setLoadingSubmissions(false)
    }
  }

  const openReviewDrawer = (sub: Submission) => {
    setSelectedSubmission(sub)
    setReviewScore(sub.score || 0)
    setReviewStatus(sub.status || 'accepted')
    setReviewNotes(sub.review_notes || '')
  }

  const handleSaveReview = async () => {
    if (!submissionsTarget || !selectedSubmission) return
    setSavingReview(true)
    try {
      const res = await csrfFetch(`/api/codeathons/${submissionsTarget.id}/submissions/${selectedSubmission.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          score: reviewScore,
          status: reviewStatus,
          review_notes: reviewNotes,
        }),
      })
      if (!res.ok) throw new Error('Failed to save review')
      addToast({ type: 'success', title: 'Review & score published successfully!' })
      // Refresh list
      void loadSubmissions(submissionsTarget)
      setSelectedSubmission((prev) => prev ? {
        ...prev,
        score: reviewScore,
        status: reviewStatus,
        review_notes: reviewNotes,
        is_reviewed: true,
      } : null)
    } catch {
      addToast({ type: 'error', title: 'Failed to save review' })
    } finally {
      setSavingReview(false)
    }
  }

  const copyShareLink = (c: Codeathon) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const link = `${origin}/dashboard/codeathons/${c.id}`
    navigator.clipboard.writeText(link)
    setCopiedLink(true)
    addToast({
      type: 'success',
      title: 'Invite link copied to clipboard!',
      message: 'Share with participants to register and solve tournament challenges.'
    })
    setTimeout(() => setCopiedLink(false), 2500)
  }

  /**
   * Universal Problem Set Manager Sub-component
   */
  const renderProblemManagerContent = (
    problemsList: Problem[],
    setProblemsList: React.Dispatch<React.SetStateAction<Problem[]>>
  ) => {
    const addCustomProblem = () => {
      if (!problemForm.title.trim()) return
      setProblemsList((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          title: problemForm.title,
          difficulty: problemForm.difficulty,
          points: problemForm.points,
          description: problemForm.description,
          sample_input: problemForm.sample_input,
          sample_output: problemForm.sample_output,
        }
      ])
      setProblemForm({
        title: '',
        difficulty: 'Medium',
        points: 100,
        description: '',
        sample_input: '',
        sample_output: '',
      })
      addToast({ type: 'success', title: 'Problem added to set!' })
    }

    const importFromBank = async (p: BankProblemOption) => {
      const diffNormalized = (p.difficulty === 'hard' ? 'Hard' : p.difficulty === 'easy' ? 'Easy' : 'Medium') as 'Easy' | 'Medium' | 'Hard'
      // The bank list omits tests and statements; load the full problem (all
      // tests for editors) so the codeathon can actually grade submissions.
      let full: Record<string, unknown> = {}
      try {
        const key = p.slug || p.id || ''
        const res = await fetch(`/api/problems/${encodeURIComponent(key)}?edit=1`, { cache: 'no-store', credentials: 'include' })
        if (res.ok) full = await res.json()
      } catch { /* handled below */ }
      const tests = toCodeathonTests(full.test_cases)
      if (tests.length === 0) {
        addToast({ type: 'error', title: `"${p.title}" has no test cases to grade with` })
        return
      }
      const sample = tests.find((t) => !t.hidden)
      setProblemsList((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          title: p.title,
          difficulty: diffNormalized,
          points: diffNormalized === 'Easy' ? 50 : diffNormalized === 'Hard' ? 200 : 100,
          description: String(full.statement_md || p.statement_md || p.description || 'Solve the algorithmic challenge according to specification.'),
          input_format: typeof full.input_format === 'string' ? full.input_format : undefined,
          output_format: typeof full.output_format === 'string' ? full.output_format : undefined,
          sample_input: sample?.input || '',
          sample_output: sample?.expected || '',
          test_cases: tests,
        }
      ])
      addToast({
        type: 'success',
        title: `Imported "${p.title}" from Problem Bank`,
        message: full.can_edit ? `${tests.length} test cases` : `${tests.length} sample test cases (hidden tests need owner access)`,
      })
    }

    const removeProblem = (id: string) => {
      setProblemsList((prev) => prev.filter((p) => p.id !== id))
    }

    return (
      <div className="space-y-5">
        {/* Linked Problems List Header */}
        <div className="rounded-xl border border-border/80 bg-muted/20 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" />
              <h4 className="text-sm font-bold text-foreground">Current problem set ({problemsList.length})</h4>
            </div>
            <span className="text-xs font-semibold tabular-nums text-primary">
              Total: {problemsList.reduce((sum, p) => sum + (p.points || 0), 0)} pts
            </span>
          </div>

          {problemsList.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-48 overflow-y-auto pr-1">
              {problemsList.map((p, i) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-2 p-3 rounded-lg border border-border bg-card shadow-xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-xs font-mono text-muted-foreground shrink-0 font-bold">#{i + 1}</span>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-foreground truncate">{p.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-[10px] px-1.5 py-0',
                            p.difficulty === 'Hard' ? 'border-red-500/40 text-red-700 dark:text-red-400 bg-red-500/10' :
                            p.difficulty === 'Easy' ? 'border-green-500/40 text-green-700 dark:text-green-400 bg-green-500/10' :
                            'border-amber-500/40 text-amber-700 dark:text-amber-400 bg-amber-500/10'
                          )}
                        >
                          {p.difficulty}
                        </Badge>
                        <span className="text-[11px] font-mono text-muted-foreground">{p.points} pts</span>
                      </div>
                    </div>
                  </div>
                  <Button aria-label="Remove problem"
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeProblem(p.id)}
                    title="Remove problem"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-xs text-muted-foreground border border-dashed border-border/80 rounded-lg">
              No problems linked to this competition yet. Add or import problems below.
            </div>
          )}
        </div>

        {/* Problem Creation & Import Tabs */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-4">
          <Tabs value={problemTab} onValueChange={(v) => setProblemTab(v as 'create' | 'bank' | 'ai')}>
            <TabsList className="grid grid-cols-3 w-full bg-muted/40 p-1">
              <TabsTrigger value="create" className="text-xs gap-1.5">
                <Plus className="h-3.5 w-3.5" /> Create problem
              </TabsTrigger>
              <TabsTrigger value="bank" className="text-xs gap-1.5">
                <Search className="h-3.5 w-3.5" /> Import from Bank
              </TabsTrigger>
              <TabsTrigger value="ai" className="text-xs gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-primary" /> AI generator
              </TabsTrigger>
            </TabsList>

            {/* Tab 1: Create Custom Problem */}
            <TabsContent value="create" className="space-y-3 pt-3">
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px_100px] gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] font-medium">Problem title *</Label>
                  <Input
                    value={problemForm.title}
                    onChange={(e) => setProblemForm((prev) => ({ ...prev, title: e.target.value }))}
                    placeholder="e.g. Dynamic Path Sum Optimization"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-medium">Difficulty</Label>
                  <Select
                    value={problemForm.difficulty}
                    onValueChange={(v) => setProblemForm((prev) => ({ ...prev, difficulty: v as 'Easy' | 'Medium' | 'Hard' }))}
                  >
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Easy">Easy (50 pts)</SelectItem>
                      <SelectItem value="Medium">Medium (100 pts)</SelectItem>
                      <SelectItem value="Hard">Hard (200 pts)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-medium">Points</Label>
                  <Input
                    type="number"
                    min={10}
                    value={problemForm.points}
                    onChange={(e) => setProblemForm((prev) => ({ ...prev, points: Number(e.target.value) || 100 }))}
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-medium">Problem statement</Label>
                <Textarea
                  value={problemForm.description}
                  onChange={(e) => setProblemForm((prev) => ({ ...prev, description: e.target.value }))}
                  rows={3}
                  placeholder="Describe the task, edge cases, input parameters, and expected output format..."
                  className="text-xs resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] font-medium">Sample input</Label>
                  <Textarea
                    value={problemForm.sample_input}
                    onChange={(e) => setProblemForm((prev) => ({ ...prev, sample_input: e.target.value }))}
                    rows={2}
                    placeholder="[2, 7, 11, 15], target = 9"
                    className="text-xs font-mono resize-none"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-medium">Sample output</Label>
                  <Textarea
                    value={problemForm.sample_output}
                    onChange={(e) => setProblemForm((prev) => ({ ...prev, sample_output: e.target.value }))}
                    rows={2}
                    placeholder="[0, 1]"
                    className="text-xs font-mono resize-none"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <Button
                  size="sm"
                  onClick={addCustomProblem}
                  disabled={!problemForm.title.trim()}
                  className="h-8 px-4 text-xs gap-1.5 font-semibold"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add problem
                </Button>
              </div>
            </TabsContent>

            {/* Tab 2: Import from Problem Bank */}
            <TabsContent value="bank" className="space-y-3 pt-3">
              <div className="flex gap-2">
                <Input
                  value={bankSearch}
                  onChange={(e) => setBankSearch(e.target.value)}
                  placeholder="Search problem bank by title or algorithm (e.g. Dynamic Programming, Trees, Arrays)..."
                  className="h-8 text-xs flex-1"
                  onKeyDown={(e) => { if (e.key === 'Enter') void searchBankProblems(bankSearch) }}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void searchBankProblems(bankSearch)}
                  disabled={loadingBank}
                  className="h-8 text-xs gap-1.5"
                >
                  {loadingBank ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                  Search
                </Button>
              </div>

              {loadingBank ? (
                <div className="text-center py-6 text-xs text-muted-foreground flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" /> Searching problem bank...
                </div>
              ) : bankResults.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                  {bankResults.map((bp) => (
                    <div
                      key={bp.id || bp.slug}
                      className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-border/80 bg-muted/20 hover:border-primary/40 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-foreground truncate">{bp.title}</p>
                        <span className="text-[10px] text-muted-foreground capitalize">{bp.difficulty || 'medium'}</span>
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-7 px-2.5 text-[11px] font-semibold gap-1 hover:bg-primary/10 hover:text-primary"
                        onClick={() => importFromBank(bp)}
                      >
                        <Plus className="h-3 w-3" /> Import
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-xs text-muted-foreground border border-dashed border-border rounded-lg">
                  Search problem bank to import curated algorithmic and domain problems.
                </div>
              )}
            </TabsContent>

            {/* Tab 3: AI Problem Generator */}
            <TabsContent value="ai" className="space-y-3 pt-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] font-medium">Domain / role</Label>
                  <Select value={aiRole} onValueChange={setAiRole}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Software Engineer">Software engineer</SelectItem>
                      <SelectItem value="Full Stack Developer">Full stack developer</SelectItem>
                      <SelectItem value="Data Structures & Algo">Data structures & algo</SelectItem>
                      <SelectItem value="AI / ML Engineer">AI / ML engineer</SelectItem>
                      <SelectItem value="Security Researcher">Security researcher</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] font-medium">Difficulty</Label>
                  <Select value={aiDifficulty} onValueChange={(v) => setAiDifficulty(v as 'Easy' | 'Medium' | 'Hard')}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Easy">Easy (50 pts)</SelectItem>
                      <SelectItem value="Medium">Medium (100 pts)</SelectItem>
                      <SelectItem value="Hard">Hard (200 pts)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] font-medium">Focus topic</Label>
                  <Input
                    value={aiTopic}
                    onChange={(e) => setAiTopic(e.target.value)}
                    placeholder="e.g. Graph Algorithms"
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <Button
                  size="sm"
                  onClick={() => void generateAiProblem(setProblemsList)}
                  disabled={generatingAi}
                  className="h-8 px-4 text-xs gap-1.5 font-semibold"
                >
                  {generatingAi ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  Generate problem with AI
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    )
  }

  const columns: DataTableColumn<Codeathon>[] = [
    {
      key: 'title',
      header: 'Title',
      cell: (r) => (
        <div className="space-y-0.5">
          <Link
            href={`/dashboard/codeathons/${r.id}`}
            className="font-bold text-foreground hover:text-primary hover:underline flex items-center gap-1.5 transition-colors"
          >
            {r.title}
            <ExternalLink className="h-3 w-3 text-muted-foreground inline" />
          </Link>
          <p className="text-[11px] text-muted-foreground truncate max-w-xs">{r.description || 'No description'}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => (
        <div className="flex flex-wrap items-center gap-1">
        <Badge
          className={
            r.status === 'active'
              ? 'bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30'
              : r.status === 'upcoming'
              ? 'bg-primary/10 text-primary border-primary/30'
              : 'bg-muted text-muted-foreground border-border'
          }
        >
          {r.status}
        </Badge>
        {r.results_released && <Badge variant="success">Results released</Badge>}
        </div>
      ),
    },
    {
      key: 'difficulty',
      header: 'Difficulty',
      cell: (r) => (
        <Badge
          variant="outline"
          className={
            r.difficulty === 'Hard'
              ? 'border-red-500/40 text-red-700 dark:text-red-400 bg-red-500/10'
              : r.difficulty === 'Easy'
              ? 'border-green-500/40 text-green-700 dark:text-green-400 bg-green-500/10'
              : 'border-amber-500/40 text-amber-700 dark:text-amber-400 bg-amber-500/10'
          }
        >
          {r.difficulty || 'Medium'}
        </Badge>
      ),
    },
    {
      key: 'dates',
      header: 'Dates',
      cell: (r) => (
        <span className="text-xs text-muted-foreground tabular-nums">
          {r.startDate ? formatDate(r.startDate) : 'N/A'} — {r.endDate ? formatDate(r.endDate) : 'N/A'}
        </span>
      ),
    },
    {
      key: 'participants',
      header: 'Participants',
      cell: (r) => (
        <span className="text-xs font-medium tabular-nums text-foreground">
          {r.participants || 0}{r.maxParticipants ? ` / ${r.maxParticipants}` : ''}
        </span>
      ),
    },
    {
      key: 'problems',
      header: 'Problems',
      cell: (r) => (
        <Button aria-label="Click to view and manage problems"
          size="sm"
          variant="outline"
          onClick={() => openProblemManager(r)}
          className="h-7 px-2 text-xs font-semibold gap-1 hover:border-primary/40 hover:text-primary"
          title="Click to view and manage problems"
        >
          <BookOpen className="h-3.5 w-3.5 text-primary" />
          <span>{r.problems?.length || 0}</span>
        </Button>
      ),
    },
    {
      key: 'prize',
      header: 'Prize pool',
      cell: (r) => <span className="text-xs">{r.prizePool || '—'}</span>
    },
    {
      key: 'actions',
      header: 'Actions',
      cell: (r) => (
        <div className="flex items-center gap-1">
          {/* Share & Copy Link Button */}
          <Button aria-label="Share competition & copy direct link"
            size="sm"
            variant="ghost"
            className="h-8 px-2 text-xs gap-1 text-muted-foreground hover:text-primary hover:bg-primary/10"
            onClick={() => {
              setShareTarget(r)
              copyShareLink(r)
            }}
            title="Share competition & copy direct link"
          >
            <Share2 className="h-3.5 w-3.5" />
          </Button>

          {/* Submissions & Reviews / Judging Button */}
          <Button aria-label="Submissions & code reviews / judge scores"
            size="sm"
            variant="ghost"
            className="h-8 px-2 text-xs gap-1 text-muted-foreground hover:text-primary hover:bg-primary/10"
            onClick={() => void loadSubmissions(r)}
            title="Submissions & code reviews / judge scores"
          >
            <Award className="h-3.5 w-3.5" />
          </Button>

          {/* Results release */}
          <Button aria-label={r.results_released ? 'View released results' : 'Review and release results'}
            size="sm"
            variant="ghost"
            className={cn('h-8 px-2 text-xs gap-1 hover:text-primary hover:bg-primary/10', r.results_released ? 'text-green-700 dark:text-green-400' : 'text-muted-foreground')}
            onClick={() => setResultsTarget(r)}
            title={r.results_released ? 'Results released' : 'Review and release results'}
          >
            <Trophy className="h-3.5 w-3.5" />
          </Button>

          {/* Live Arena Link */}
          <Button
            size="sm"
            variant="ghost"
            asChild
            className="h-8 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
            title="Open participant arena"
          >
            <Link href={`/dashboard/codeathons/${r.id}`} target="_blank">
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </Button>

          {/* Edit Codeathon */}
          <Button aria-label="Edit settings"
            size="sm"
            variant="ghost"
            className="h-8 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
            onClick={() => openEdit(r)}
            title="Edit settings"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ]

  const bulkActions: BulkAction[] = [
    { label: 'Delete', variant: 'destructive', icon: <Trash2 className="w-3.5 h-3.5 mr-1" />, onClick: handleDelete },
  ]

  if (!gate.ready) return null

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <PageHeader
        illustration="hackathon"
        className="mb-0"
        title="Codeathons"
        description="Write problem sets, share invite links, review submitted code and publish judge scores."
        icon={<Trophy />}
        actions={
        <Button
          className="gap-2 font-semibold shrink-0"
          onClick={() => {
            setForm(INITIAL_FORM)
            setCreateProblems([])
            setCreateOpen(true)
          }}
        >
          <Plus className="w-4 h-4" />
          Create codeathon
        </Button>
        }
      />

      {isSuper && (
        <div className="flex justify-end">
          <TenantFilter value={tenant} onChange={setTenant} id="codeathon-tenant-filter" />
        </div>
      )}

      <ReleaseResultsDialog
        codeathon={resultsTarget}
        onOpenChange={(open) => { if (!open) setResultsTarget(null) }}
        onReleased={() => void fetchData()}
      />

      {loading ? (
        <SkeletonTable rows={5} />
      ) : loadError && codeathons.length === 0 ? (
        <EmptyState
          illustration="error"
          title="Couldn't load codeathons"
          description="Check your connection and try again."
          actionLabel="Try again"
          onAction={() => void fetchData()}
        />
      ) : (
        <DataTable
          columns={columns}
          data={codeathons}
          searchPlaceholder="Search codeathons..."
          searchKeys={['title', 'difficulty']}
          filters={[
            {
              label: 'Status',
              key: 'status',
              options: [
                { label: 'Upcoming', value: 'upcoming' },
                { label: 'Active', value: 'active' },
                { label: 'Ended', value: 'ended' },
              ],
            },
          ]}
          bulkActions={bulkActions}
          loading={loading}
          emptyState={{ illustration: 'hackathon' }} emptyMessage="No codeathons yet. Click 'Create codeathon' to write problems and host your first event."
        />
      )}

      {/* CREATE DIALOG MODAL (Unified with Integrated Problem Set Manager) */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden border-border bg-card/95 backdrop-blur-xl shadow-2xl">
          <DialogHeader className="px-6 py-4 border-b border-border bg-muted/20 shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 border border-primary/20 text-primary">
                <Trophy className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-foreground">Create codeathon</DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Configure competition parameters, topics, timeline, and curate the problem set before launch.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-6">
            <CodeathonFormFields formData={form} setFormData={setForm} />

            {/* Problem Set Manager Card inside Create flow */}
            <div className="px-6 pb-6 border-t border-border/60 pt-4">
              <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary" />
                Problem set
              </h3>
              {renderProblemManagerContent(createProblems, setCreateProblems)}
            </div>
          </div>

          <DialogFooter className="px-6 py-3 border-t border-border bg-muted/20 shrink-0 flex items-center justify-between">
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={saving || !form.title.trim()}
              className="font-semibold"
            >
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}
              Publish codeathon
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* EDIT DIALOG MODAL (Wide Horizontal View with Problem Set Manager) */}
      <Dialog open={Boolean(editing)} onOpenChange={(o) => { if (!o) setEditing(null) }}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden border-border bg-card/95 backdrop-blur-xl shadow-2xl">
          <DialogHeader className="px-6 py-4 border-b border-border bg-muted/20 shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 border border-primary/30 text-primary">
                <Pencil className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-foreground">Edit codeathon: {editing?.title}</DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Update competition details, event parameters, and curate the problem set.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-6">
            <CodeathonFormFields formData={editForm} setFormData={setEditForm} />

            {/* Problem Set Manager inside Edit flow */}
            <div className="px-6 pb-6 border-t border-border/60 pt-4">
              <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary" />
                Problem set
              </h3>
              {renderProblemManagerContent(editingProblems, setEditingProblems)}
            </div>
          </div>

          <DialogFooter className="px-6 py-3 border-t border-border bg-muted/20 shrink-0 flex items-center justify-between">
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>
              Cancel
            </Button>
            <Button
              onClick={saveEdit}
              disabled={saving || !editForm.title.trim()}
              className="font-semibold"
            >
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DEDICATED PROBLEM SET MANAGER MODAL */}
      <Dialog open={Boolean(problemManagerTarget)} onOpenChange={(o) => { if (!o) setProblemManagerTarget(null) }}>
        <DialogContent className="sm:max-w-3xl max-h-[88vh] flex flex-col p-0 overflow-hidden border-border bg-card/95 backdrop-blur-xl shadow-2xl">
          <DialogHeader className="px-6 py-4 border-b border-border bg-muted/20 shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 border border-primary/20 text-primary">
                <BookOpen className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-foreground">
                  Problem Set: {problemManagerTarget?.title}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Create custom problems, import from the problem bank, or generate algorithmic tasks via AI.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-6">
            {renderProblemManagerContent(standaloneProblems, setStandaloneProblems)}
          </div>

          <DialogFooter className="px-6 py-3 border-t border-border bg-muted/20 shrink-0 flex items-center justify-between">
            <Button variant="outline" onClick={() => setProblemManagerTarget(null)} disabled={saving}>
              Cancel
            </Button>
            <Button
              onClick={saveStandaloneProblems}
              disabled={saving}
              className="font-semibold"
            >
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-1.5" />}
              Save problem set
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* SUBMISSIONS & JUDGE CODE REVIEW MODAL */}
      <Dialog open={Boolean(submissionsTarget)} onOpenChange={(o) => { if (!o) setSubmissionsTarget(null) }}>
        <DialogContent className="sm:max-w-5xl max-h-[92vh] flex flex-col p-0 overflow-hidden border-border bg-card/95 backdrop-blur-xl shadow-2xl">
          <DialogHeader className="px-6 py-4 border-b border-border bg-muted/20 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 border border-primary/20 text-primary">
                  <Award className="h-5 w-5" />
                </div>
                <div>
                  <DialogTitle className="text-lg font-bold text-foreground">
                    Submissions and code review: {submissionsTarget?.title}
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground">
                    Inspect participant code submissions, test execution diagnostics, and publish judge feedback.
                  </DialogDescription>
                </div>
              </div>
              <Badge variant="outline" className="tabular-nums text-xs border-primary/30 text-primary">
                {submissionsList.length} submissions
              </Badge>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-6">
            {loadingSubmissions ? (
              <div className="flex items-center justify-center py-20 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin mr-2 text-primary" />
                Loading submissions...
              </div>
            ) : submissionsList.length === 0 ? (
              <EmptyState
                illustration="coding"
                title="No submissions yet"
                description="When participants write code and select Submit, their solutions appear here for review."
              />
            ) : selectedSubmission ? (
              /* Single Submission Code Inspector & Review Panel */
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs gap-1.5"
                    onClick={() => setSelectedSubmission(null)}
                  >
                    ← Back to submissions
                  </Button>

                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono text-xs">
                      {selectedSubmission.language}
                    </Badge>
                    <Badge
                      className={
                        selectedSubmission.status === 'accepted'
                          ? 'bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30'
                          : 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30'
                      }
                    >
                      {selectedSubmission.status}
                    </Badge>
                  </div>
                </div>

                {/* Candidate & Problem Details Card */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 rounded-xl border border-border bg-muted/20 text-xs">
                  <div>
                    <span className="text-muted-foreground block text-[11px]">Participant</span>
                    <span className="font-bold text-foreground">{selectedSubmission.userName}</span>
                    <span className="text-muted-foreground block truncate">{selectedSubmission.userEmail}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[11px]">Problem</span>
                    <span className="font-bold text-foreground">{selectedSubmission.problemTitle}</span>
                    <span className="text-muted-foreground block">
                      Passed: {selectedSubmission.test_cases_passed} / {selectedSubmission.test_cases_total} test cases
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[11px]">Submission time</span>
                    <span className="font-mono font-medium text-foreground">
                      {selectedSubmission.created_at ? formatDateTime(selectedSubmission.created_at) : 'N/A'}
                    </span>
                  </div>
                </div>

                {/* Code Viewer */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-foreground flex items-center gap-1.5">
                      <FileCode className="h-3.5 w-3.5 text-primary" />
                      Submitted source code
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-[11px] gap-1"
                      onClick={() => {
                        navigator.clipboard.writeText(selectedSubmission.code)
                        addToast({ type: 'success', title: 'Code copied to clipboard!' })
                      }}
                    >
                      <Copy className="h-3 w-3" /> Copy code
                    </Button>
                  </div>
                  <pre className="p-4 rounded-xl border border-border/80 bg-slate-950 font-mono text-xs text-slate-100 overflow-x-auto max-h-64 select-text">
                    <code>{selectedSubmission.code}</code>
                  </pre>
                </div>

                {/* Output / Diagnostics */}
                {(selectedSubmission.output || selectedSubmission.error) && (
                  <div className="space-y-1.5">
                    <span className="text-xs font-semibold text-muted-foreground">Output and errors</span>
                    <pre className="p-3 rounded-lg border border-border/60 bg-muted/40 font-mono text-[11px] text-foreground overflow-x-auto max-h-28">
                      {selectedSubmission.output || selectedSubmission.error}
                    </pre>
                  </div>
                )}

                {/* Judge Review & Feedback Form */}
                <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 space-y-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Award className="h-4 w-4 text-primary" />
                    <span>Judge review and score</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Score (points)</Label>
                      <Input
                        type="number"
                        value={reviewScore}
                        onChange={(e) => setReviewScore(Number(e.target.value) || 0)}
                        className="h-9 text-sm font-mono"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Status</Label>
                      <Select value={reviewStatus} onValueChange={setReviewStatus}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="accepted">Accepted (full credit)</SelectItem>
                          <SelectItem value="needs_improvement">Needs improvement (partial credit)</SelectItem>
                          <SelectItem value="wrong_answer">Wrong answer</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Judge feedback</Label>
                    <Textarea
                      value={reviewNotes}
                      onChange={(e) => setReviewNotes(e.target.value)}
                      rows={3}
                      placeholder="e.g. Excellent algorithmic optimization, clean edge-case handling for null arrays, O(n) time complexity achieved..."
                      className="text-xs resize-none"
                    />
                  </div>

                  <div className="flex justify-end pt-1">
                    <Button
                      onClick={handleSaveReview}
                      disabled={savingReview}
                      className="font-semibold text-xs gap-1.5"
                    >
                      {savingReview ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckSquare className="h-3.5 w-3.5" />}
                      Publish review & update score
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              /* Submissions Table */
              <div className="space-y-3">
                <div className="rounded-xl border border-border overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-muted/40 border-b border-border text-muted-foreground font-semibold">
                      <tr>
                        <th className="p-3">Participant</th>
                        <th className="p-3">Problem</th>
                        <th className="p-3">Language</th>
                        <th className="p-3">Result</th>
                        <th className="p-3">Score</th>
                        <th className="p-3">Review status</th>
                        <th className="p-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {submissionsList.map((s) => (
                        <tr key={s.id} className="hover:bg-muted/20 transition-colors">
                          <td className="p-3">
                            <span className="font-bold text-foreground block">{s.userName}</span>
                            <span className="text-[10px] text-muted-foreground block truncate max-w-35">{s.userEmail}</span>
                          </td>
                          <td className="p-3">
                            <span className="font-semibold text-foreground">{s.problemTitle}</span>
                          </td>
                          <td className="p-3">
                            <Badge variant="outline" className="font-mono text-[10px]">
                              {s.language}
                            </Badge>
                          </td>
                          <td className="p-3">
                            <Badge
                              className={cn(
                                'text-[10px]',
                                s.status === 'accepted'
                                  ? 'bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30'
                                  : 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30'
                              )}
                            >
                              {s.status === 'accepted' ? 'Accepted' : 'Wrong answer'} ({s.test_cases_passed}/{s.test_cases_total})
                            </Badge>
                          </td>
                          <td className="p-3 font-mono font-bold tabular-nums text-primary">
                            {s.score} pts
                          </td>
                          <td className="p-3">
                            {s.is_reviewed ? (
                              <Badge variant="info" className="text-[10px] gap-1">
                                <Check className="h-2.5 w-2.5" /> Reviewed
                              </Badge>
                            ) : (
                              <span className="text-[11px] text-muted-foreground">Pending review</span>
                            )}
                          </td>
                          <td className="p-3 text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2.5 text-xs gap-1 hover:border-primary/40 hover:text-primary"
                              onClick={() => openReviewDrawer(s)}
                            >
                              <Code2 className="h-3.5 w-3.5" /> Review code
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="px-6 py-3 border-t border-border bg-muted/20 shrink-0">
            <Button variant="outline" onClick={() => setSubmissionsTarget(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* SHARE CODEATHON MODAL */}
      <Dialog open={Boolean(shareTarget)} onOpenChange={(o) => { if (!o) setShareTarget(null) }}>
        <DialogContent className="sm:max-w-lg p-6 border-border bg-card/95 backdrop-blur-xl shadow-2xl">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 border border-primary/20 text-primary">
                <Share2 className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-foreground">Share codeathon</DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Distribute the tournament access link to candidates, participants, and judges.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 pt-4">
            <div className="p-4 rounded-xl border border-border bg-muted/20 space-y-2">
              <span className="text-xs font-semibold text-foreground block">Direct link</span>
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={shareTarget ? `${typeof window !== 'undefined' ? window.location.origin : ''}/dashboard/codeathons/${shareTarget.id}` : ''}
                  className="h-9 text-xs font-mono bg-background"
                />
                <Button
                  size="sm"
                  className="h-9 px-3 shrink-0 gap-1.5"
                  onClick={() => shareTarget && copyShareLink(shareTarget)}
                >
                  {copiedLink ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copiedLink ? 'Copied' : 'Copy'}
                </Button>
              </div>
            </div>

            <div className="p-3 rounded-lg border border-border/60 bg-muted/10 text-xs text-muted-foreground space-y-1">
              <p className="font-semibold text-foreground">How contestants participate:</p>
              <p>1. Participants open the link, review tournament rules, and click <strong>Register</strong>.</p>
              <p>2. Once the contest starts, problems unlock in their live coding workspace.</p>
              <p>3. As submissions come in, you can view live code and add reviews from the <strong>Submissions</strong> tab.</p>
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setShareTarget(null)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
