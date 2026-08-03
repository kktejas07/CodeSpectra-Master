'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  Loader2,
  Gavel,
  ArrowLeft,
  ExternalLink,
  Send,
  Copy,
  Check,
  X,
  AlertTriangle,
  Eye,
  Download,
} from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { DashboardPageHeader } from '@/components/dashboard/dashboard-page-header'
import { csrfFetch } from '@/lib/csrf-fetch'

interface RubricScores {
  correctness: string
  quality: string
  efficiency: string
  documentation: string
  edgeCases: string
}

const RUBRIC = [
  { key: 'correctness' as const, label: 'Correctness', max: 40, desc: 'Solves the problem correctly, handles edge cases' },
  { key: 'quality' as const, label: 'Code Quality', max: 20, desc: 'Readability, structure, naming conventions' },
  { key: 'efficiency' as const, label: 'Efficiency', max: 20, desc: 'Time & space complexity, optimal approach' },
  { key: 'documentation' as const, label: 'Documentation', max: 10, desc: 'Comments, variable names, README quality' },
  { key: 'edgeCases' as const, label: 'Edge Cases', max: 10, desc: 'Handles boundary conditions, errors gracefully' },
]
const RUBRIC_TOTAL = 100

interface ScoreRecord {
  judge_id: string
  score: number
  feedback: string
  created_at: string
}

interface Submission {
  id: string
  hackathon_id: string
  team_id: string
  team_name: string
  problem_slug: string
  repo_url?: string
  video_url?: string
  live_url?: string
  comment?: string
  code?: string
  score: number | null
  max_score: number
  status: string
  feedback?: string
  submitted_at: string
  scores?: ScoreRecord[]
}

interface Hackathon {
  id: string
  name: string
  slug: string
  tasks: { problem_slug: string; problem_title: string; points: number }[]
}

const LANG_COLORS: Record<string, string> = {
  python: '#3572A5',
  javascript: '#f1e05a',
  typescript: '#3178c6',
  java: '#b07219',
  go: '#00ADD8',
  rust: '#dea584',
  cpp: '#f34b7d',
  text: '#6e7681',
}

function detectLanguage(code: string, repoUrl?: string): string {
  if (repoUrl?.includes('.py')) return 'python'
  if (repoUrl?.includes('.ts')) return 'typescript'
  if (repoUrl?.includes('.js')) return 'javascript'
  if (repoUrl?.includes('.java')) return 'java'
  if (repoUrl?.includes('.go')) return 'go'
  if (repoUrl?.includes('.rs')) return 'rust'
  if (repoUrl?.includes('.cpp') || repoUrl?.includes('.cc')) return 'cpp'
  return 'text'
}

function LanguageBadge({ lang }: { lang: string }) {
  const color = LANG_COLORS[lang] || LANG_COLORS.text
  return (
    <span
      className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium text-white"
      style={{ backgroundColor: color }}
    >
      {lang.charAt(0).toUpperCase() + lang.slice(1)}
    </span>
  )
}

function CodeBlock({ code, repoUrl }: { code: string; repoUrl?: string }) {
  const [copied, setCopied] = useState(false)
  const lang = detectLanguage(code, repoUrl)

  async function handleCopy() {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="relative rounded border overflow-hidden" style={{ backgroundColor: '#0d1117' }}>
      <div className="flex items-center justify-between px-3 py-1.5 border-b" style={{ borderColor: '#30363d' }}>
        <LanguageBadge lang={lang} />
        <button
          onClick={handleCopy}
          className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3" /> Copied
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" /> Copy
            </>
          )}
        </button>
      </div>
      <pre
        className="overflow-auto text-xs"
        style={{
          maxHeight: 320,
          color: '#c9d1d9',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          padding: '12px',
          margin: 0,
        }}
      >
        <code>{code}</code>
      </pre>
    </div>
  )
}

export default function JudgeReviewPage() {
  const params = useParams<{ id: string }>()
  const hackathonId = params.id

  const gate = usePageGuard('judge')
  const addToast = useToast()
  const [hackathon, setHackathon] = useState<Hackathon | null>(null)
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [selected, setSelected] = useState<Submission | null>(null)
  const [feedback, setFeedback] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [rejecting, setRejecting] = useState(false)
  const [statusUpdating, setStatusUpdating] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkUpdating, setBulkUpdating] = useState(false)
  const [rubricScores, setRubricScores] = useState<RubricScores>({
    correctness: '',
    quality: '',
    efficiency: '',
    documentation: '',
    edgeCases: '',
  })

  const totalScore = RUBRIC.reduce((sum, dim) => {
    const v = Number(rubricScores[dim.key])
    return sum + (isNaN(v) ? 0 : Math.min(dim.max, Math.max(0, v)))
  }, 0)

  const load = useCallback(async () => {
    try {
      const [hRes, sRes] = await Promise.all([
        csrfFetch(`/api/hackathons/${hackathonId}`, { cache: 'no-store' }),
        csrfFetch(`/api/hackathons/${hackathonId}/judge-submissions`, { cache: 'no-store' }),
      ])
      if (hRes.ok) setHackathon(await hRes.json())
      if (sRes.ok) {
        const data = await sRes.json()
        setSubmissions(data.data || [])
      }
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [hackathonId])

  useEffect(() => {
    if (gate.ready) void load()
  }, [gate.ready, load])

  // Poll every 15s for new submissions to review
  useEffect(() => {
    if (!gate.ready) return
    const t = setInterval(() => { void load() }, 15000)
    return () => clearInterval(t)
  }, [gate.ready, load])

  function selectRow(sub: Submission) {
    setSelected(sub)
    setRubricScores({ correctness: '', quality: '', efficiency: '', documentation: '', edgeCases: '' })
    setFeedback('')
    setSubmitSuccess(false)
    setRejectReason('')
  }

  function buildFeedbackWithRubric(feedbackText: string): string {
    const breakdown = RUBRIC.map(
      (d) => `${d.label} (${rubricScores[d.key] || 0}/${d.max})`
    ).join(' | ')
    return `[SCORE: ${totalScore}/${RUBRIC_TOTAL}] ${breakdown}\n\n${feedbackText}`
  }

  function closeSidebar() {
    setSelected(null)
    setSubmitSuccess(false)
    setRejectReason('')
  }

  async function submitScore() {
    if (!selected) return
    const finalScore = Math.min(selected.max_score, Math.max(0, totalScore))
    setSubmitting(true)
    try {
      const enrichedFeedback = buildFeedbackWithRubric(feedback)
      const res = await csrfFetch(
        `/api/hackathons/${hackathonId}/submissions/${selected.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ score: finalScore, feedback: enrichedFeedback }),
        },
      )
      if (res.ok) {
        setSubmitSuccess(true)
        setSubmissions((prev) =>
          prev.map((s) =>
            s.id === selected.id
              ? { ...s, score: finalScore, status: 'under_review', feedback: enrichedFeedback }
              : s
          )
        )
        setTimeout(() => {
          closeSidebar()
          void load()
        }, 1500)
      }
    } catch { /* ignore */ }
    finally { setSubmitting(false) }
  }

  async function rejectSubmission() {
    if (!selected || !rejectReason.trim()) return
    setRejecting(true)
    try {
      const res = await csrfFetch(
        `/api/hackathons/${hackathonId}/submissions/${selected.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            score: 0,
            feedback: `[Rejected by judge]: ${rejectReason.trim()}`,
          }),
        },
      )
      if (res.ok) {
        setSubmissions((prev) =>
          prev.map((s) =>
            s.id === selected.id
              ? { ...s, score: 0, status: 'under_review', feedback: `[Rejected by judge]: ${rejectReason.trim()}` }
              : s
          )
        )
        closeSidebar()
        await load()
      }
    } catch { /* ignore */ }
    finally { setRejecting(false) }
  }

  async function updateStatus(newStatus: string) {
    if (!selected) return
    setStatusUpdating(true)
    try {
      const res = await csrfFetch(`/api/hackathons/${hackathonId}/submissions/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: newStatus }),
      })
      if (res.ok) {
        setSubmissions((prev) => prev.map((s) => s.id === selected.id ? { ...s, status: newStatus } : s))
        setSelected((prev) => prev ? { ...prev, status: newStatus } : null)
      }
    } catch { /* ignore */ }
    finally { setStatusUpdating(false) }
  }

  function problemTitle(slug: string): string {
    return hackathon?.tasks?.find((t) => t.problem_slug === slug)?.problem_title || slug
  }

  const filtered = submissions.filter((s) =>
    statusFilter === 'all' || s.status === statusFilter
  )

  const stats = {
    total: submissions.length,
    pending: submissions.filter((s) => s.status === 'pending').length,
    underReview: submissions.filter((s) => s.status === 'under_review').length,
    released: submissions.filter((s) => s.status === 'released').length,
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    const all = filtered.map((s) => s.id)
    setSelectedIds((prev) => prev.size === all.length ? new Set() : new Set(all))
  }

  async function bulkUpdateStatus(newStatus: string) {
    setBulkUpdating(true)
    let count = 0
    for (const id of selectedIds) {
      try {
        await csrfFetch(`/api/hackathons/${hackathonId}/submissions/${id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          credentials: 'include', body: JSON.stringify({ status: newStatus }),
        })
        count++
      } catch { /* continue */ }
    }
    setSubmissions((prev) => prev.map((s) => selectedIds.has(s.id) ? { ...s, status: newStatus } : s))
    setSelectedIds(new Set())
    setBulkUpdating(false)
    addToast({ type: 'success', title: `Updated ${count} submission${count !== 1 ? 's' : ''}` })
  }

  function exportCSV() {
    const headers = ['Team', 'Problem', 'Repo URL', 'Video URL', 'Live URL', 'Comment', 'Status', 'Score', 'Max Score', 'Submitted At', 'Feedback']
    const rows = submissions.map((s) => [
      s.team_name,
      problemTitle(s.problem_slug),
      s.repo_url || '',
      (s as any).video_url || '',
      (s as any).live_url || '',
      (s as any).comment || '',
      s.status,
      s.score != null ? String(s.score) : '',
      s.max_score,
      s.submitted_at ? new Date(s.submitted_at).toLocaleString() : '',
      s.feedback || '',
    ])
    const csv = [headers, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const b = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(b)
    a.download = `${hackathon?.name || 'hackathon'}_submissions_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }

  if (!gate.ready || loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading…
      </div>
    )
  }

  return (
    <div className="space-y-6 px-6 py-8">
      <Link
        href="/dashboard/judge"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" /> Back to Judge Dashboard
      </Link>

      <DashboardPageHeader
        icon={Gavel}
        title={hackathon?.name || 'Review Submissions'}
        description={`${submissions.length} total submission${submissions.length !== 1 ? 's' : ''}`}
      />

      <div className="flex gap-2">
        {['all', 'pending', 'under_review', 'released'].map((f) => (
          <Button
            key={f}
            size="sm"
            variant={statusFilter === f ? 'default' : 'outline'}
            onClick={() => setStatusFilter(f)}
          >
            {f === 'all' ? 'All' : f === 'under_review' ? 'Under Review' : f.charAt(0).toUpperCase() + f.slice(1)}
          </Button>
        ))}
      </div>

      <div className="flex gap-2 text-sm">
        <span>Total: <strong>{stats.total}</strong></span>
        <span className="text-muted-foreground">|</span>
        <span>Pending: <strong>{stats.pending}</strong></span>
        <span className="text-muted-foreground">|</span>
        <span>Under Review: <strong>{stats.underReview}</strong></span>
        <span className="text-muted-foreground">|</span>
        <span>Released: <strong>{stats.released}</strong></span>
        <Button variant="outline" size="sm" className="ml-auto gap-1.5" onClick={exportCSV}>
          <Download className="h-3.5 w-3.5" /> Export CSV
        </Button>
      </div>

      <div className="flex gap-6 flex-col lg:flex-row">
        <div className="flex-1 overflow-x-auto">
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 mb-3 p-2 rounded-lg bg-primary/10 border border-primary/20">
              <span className="text-sm font-medium">{selectedIds.size} selected</span>
              <select
                onChange={(e) => { if (e.target.value) bulkUpdateStatus(e.target.value); e.target.value = '' }}
                disabled={bulkUpdating}
                className="rounded border border-border bg-background px-2 py-1 text-xs"
              >
                <option value="">Bulk update status...</option>
                <option value="pending">Pending</option>
                <option value="under_review">Under Review</option>
                <option value="released">Released</option>
              </select>
              {bulkUpdating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <Button variant="ghost" size="sm" className="ml-auto text-xs" onClick={() => setSelectedIds(new Set())}>Clear</Button>
            </div>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <input type="checkbox" checked={filtered.length > 0 && selectedIds.size === filtered.length} onChange={toggleAll} className="h-3.5 w-3.5" />
                </TableHead>
                <TableHead>Team</TableHead>
                <TableHead>Problem</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Submitted</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                    No submissions match this filter.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((s) => (
                  <TableRow
                    key={s.id}
                    className={`cursor-pointer transition-colors ${selected?.id === s.id ? 'bg-primary/10' : 'hover:bg-muted/50'}`}
                  >
                    <TableCell className="p-2" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selectedIds.has(s.id)} onChange={() => toggleSelect(s.id)} className="h-3.5 w-3.5" />
                    </TableCell>
                    <TableCell className="font-medium" onClick={() => selectRow(s)}>{s.team_name}</TableCell>
                    <TableCell>{problemTitle(s.problem_slug)}</TableCell>
                    <TableCell>
                      <Badge variant={s.status === 'pending' ? 'destructive' : s.status === 'released' ? 'default' : 'secondary'}>
                        {s.status === 'under_review' ? 'Under Review' : s.status.charAt(0).toUpperCase() + s.status.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell>{s.score != null ? `${s.score}/${s.max_score}` : '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(s.submitted_at).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {selected && (
          <Card className="w-full lg:w-96 shrink-0 space-y-4 p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Review Submission</h3>
              <Button size="sm" variant="ghost" onClick={closeSidebar}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-1 text-sm">
              <p><strong>Team:</strong> {selected.team_name}</p>
              <p><strong>Problem:</strong> {problemTitle(selected.problem_slug)}</p>
              <p><strong>Max Score:</strong> {selected.max_score}</p>
              {selected.scores && selected.scores.length > 0 && (
                <div className="mt-2 space-y-1">
                  <p className="text-xs text-muted-foreground">
                    {selected.scores.length} judge{selected.scores.length !== 1 ? 's' : ''} scored
                  </p>
                  {selected.scores.map((sc, i) => (
                    <p key={sc.judge_id} className="text-xs">
                      Judge {i + 1}: <strong>{sc.score}/{selected.max_score}</strong>
                      {sc.feedback && <span className="text-muted-foreground ml-1">— {sc.feedback.slice(0, 30)}{sc.feedback.length > 30 ? '…' : ''}</span>}
                    </p>
                  ))}
                </div>
              )}
              <a
                href={`/dashboard/challenges/${selected.problem_slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline text-xs mt-1"
              >
                <Eye className="h-3 w-3" /> View Problem <ExternalLink className="h-2.5 w-2.5" />
              </a>
              <div className="flex items-center gap-2 pt-1">
                <Label className="text-xs font-semibold shrink-0">Status:</Label>
                <select
                  value={selected.status}
                  onChange={(e) => updateStatus(e.target.value)}
                  disabled={statusUpdating}
                  className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs"
                >
                  <option value="pending">Pending</option>
                  <option value="under_review">Under Review</option>
                  <option value="released">Released</option>
                </select>
                {statusUpdating && <Loader2 className="h-3 w-3 animate-spin shrink-0" />}
              </div>
              {selected.repo_url && (
                <p>
                  <strong>Repo:</strong>{' '}
                  <a href={selected.repo_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                    {selected.repo_url.length > 40 ? selected.repo_url.slice(0, 40) + '…' : selected.repo_url} <ExternalLink className="h-3 w-3" />
                  </a>
                </p>
              )}
              {(selected as any).video_url && (
                <p>
                  <strong>Video:</strong>{' '}
                  <a href={(selected as any).video_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1 text-xs">
                    {(selected as any).video_url.length > 40 ? (selected as any).video_url.slice(0, 40) + '…' : (selected as any).video_url} <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                </p>
              )}
              {(selected as any).live_url && (
                <p>
                  <strong>Live Site:</strong>{' '}
                  <a href={(selected as any).live_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1 text-xs">
                    {(selected as any).live_url.length > 40 ? (selected as any).live_url.slice(0, 40) + '…' : (selected as any).live_url} <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                </p>
              )}
              {(selected as any).comment && (
                <p className="text-xs text-muted-foreground"><strong>Comment:</strong> {(selected as any).comment}</p>
              )}
            </div>

            {selected.code && (
              <div className="space-y-2">
                <Label className="text-xs font-semibold">Code</Label>
                <CodeBlock code={selected.code} repoUrl={selected.repo_url} />
              </div>
            )}

            {selected.feedback && !selected.feedback.startsWith('[Rejected') && (
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Team Feedback</Label>
                <p className="text-sm text-muted-foreground">{selected.feedback}</p>
              </div>
            )}

            {selected.feedback?.startsWith('[Rejected') && (
              <div className="space-y-1 rounded border border-destructive/50 bg-destructive/10 p-2">
                <Label className="text-xs font-semibold text-destructive">Rejected</Label>
                <p className="text-xs text-muted-foreground">{selected.feedback}</p>
              </div>
            )}

            {submitSuccess ? (
              <div className="flex items-center justify-center gap-2 py-6 text-green-600">
                <Check className="h-5 w-5" />
                <span className="font-medium">Score submitted!</span>
              </div>
            ) : (
              <>
                {/* Rubric Scoring */}
                <div className="border-t pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold uppercase tracking-wider">Scoring Rubric</Label>
                    <div className={`text-lg font-bold ${totalScore > 0 ? 'text-green-600' : 'text-muted-foreground'}`}>
                      {totalScore}<span className="text-xs font-normal text-muted-foreground">/{RUBRIC_TOTAL}</span>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Judge each dimension. Total is auto-calculated and sent as the final score.
                  </p>

                  {RUBRIC.map((dim) => {
                    const val = rubricScores[dim.key]
                    const num = Number(val)
                    const pct = dim.max > 0 ? Math.round((isNaN(num) ? 0 : Math.min(dim.max, Math.max(0, num))) / dim.max * 100) : 0
                    return (
                      <div key={dim.key} className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium">{dim.label} <span className="text-muted-foreground">({dim.max}pts)</span></span>
                          <span className="text-xs font-mono text-muted-foreground">
                            {val ? `${Math.min(dim.max, Math.max(0, num))}/${dim.max}` : `0/${dim.max}`}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            min={0}
                            max={dim.max}
                            step={1}
                            value={val ? Math.min(dim.max, Math.max(0, num)) : 0}
                            onChange={(e) =>
                              setRubricScores((prev) => ({ ...prev, [dim.key]: e.target.value }))
                            }
                            className="flex-1 h-1.5 cursor-pointer accent-primary"
                          />
                          <input
                            type="number"
                            min={0}
                            max={dim.max}
                            value={val}
                            onChange={(e) => {
                              const v = Math.min(dim.max, Math.max(0, Number(e.target.value)))
                              setRubricScores((prev) => ({ ...prev, [dim.key]: isNaN(v) ? '' : String(v) }))
                            }}
                            className="w-14 h-7 text-xs rounded border bg-background px-1.5 text-center"
                            placeholder="0"
                          />
                        </div>
                        <p className="text-[10px] text-muted-foreground">{dim.desc}</p>
                      </div>
                    )
                  })}

                  {/* Quick presets */}
                  <div className="flex flex-wrap gap-1.5">
                    {[100, 80, 60, 40].map((target) => (
                      <button
                        key={target}
                        type="button"
                        onClick={() => {
                          const factor = target / RUBRIC_TOTAL
                          setRubricScores({
                            correctness: String(Math.round(40 * factor)),
                            quality: String(Math.round(20 * factor)),
                            efficiency: String(Math.round(20 * factor)),
                            documentation: String(Math.round(10 * factor)),
                            edgeCases: String(Math.round(10 * factor)),
                          })
                        }}
                        className="text-[10px] rounded border px-2 py-0.5 text-muted-foreground hover:bg-muted/50 transition-colors"
                      >
                        {target}%
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setRubricScores({ correctness: '', quality: '', efficiency: '', documentation: '', edgeCases: '' })}
                      className="text-[10px] rounded border px-2 py-0.5 text-muted-foreground hover:bg-muted/50 transition-colors"
                    >
                      Reset
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-semibold">General Feedback</Label>
                  <Textarea
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    placeholder="Summarize your evaluation for the team…"
                    rows={3}
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={submitScore}
                    disabled={submitting || totalScore === 0}
                    className="flex-1 gap-1.5"
                  >
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Submit {totalScore > 0 ? `(${totalScore}pts)` : 'Score'}
                  </Button>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="icon" className="text-destructive border-destructive hover:bg-destructive/10" disabled={submitting}>
                        <AlertTriangle className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Reject Submission</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will set the score to 0 and mark it as rejected.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <Textarea
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="Reason for rejection…"
                        rows={3}
                        className="mt-2"
                      />
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={rejectSubmission}
                          disabled={rejecting || !rejectReason.trim()}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          {rejecting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Reject'}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </>
            )}
          </Card>
        )}
      </div>
    </div>
  )
}