'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
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
} from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { DashboardPageHeader } from '@/components/dashboard/dashboard-page-header'
import { csrfFetch } from '@/lib/csrf-fetch'

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
  const params = useParams<{ hackathonId: string }>()
  const hackathonId = params.hackathonId

  const gate = usePageGuard('user')
  const [hackathon, setHackathon] = useState<Hackathon | null>(null)
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [selected, setSelected] = useState<Submission | null>(null)
  const [score, setScore] = useState('')
  const [feedback, setFeedback] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [rejecting, setRejecting] = useState(false)

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

  function selectRow(sub: Submission) {
    setSelected(sub)
    setScore(sub.score != null ? String(sub.score) : '')
    setFeedback(sub.feedback || '')
    setSubmitSuccess(false)
    setRejectReason('')
  }

  function closeSidebar() {
    setSelected(null)
    setSubmitSuccess(false)
    setRejectReason('')
  }

  async function submitScore() {
    if (!selected) return
    const clampedScore = Math.min(selected.max_score, Math.max(0, Number(score)))
    setSubmitting(true)
    try {
      const res = await csrfFetch(
        `/api/hackathons/${hackathonId}/submissions/${selected.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ score: clampedScore, feedback }),
        },
      )
      if (res.ok) {
        setSubmitSuccess(true)
        setSubmissions((prev) =>
          prev.map((s) =>
            s.id === selected.id
              ? { ...s, score: clampedScore, status: 'under_review', feedback }
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
      </div>

      <div className="flex gap-6 flex-col lg:flex-row">
        <div className="flex-1 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
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
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                    No submissions match this filter.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((s) => (
                  <TableRow
                    key={s.id}
                    className={`cursor-pointer transition-colors ${selected?.id === s.id ? 'bg-primary/10' : 'hover:bg-muted/50'}`}
                    onClick={() => selectRow(s)}
                  >
                    <TableCell className="font-medium">{s.team_name}</TableCell>
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
              {selected.repo_url && (
                <p>
                  <strong>Repo:</strong>{' '}
                  <a
                    href={selected.repo_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline inline-flex items-center gap-1"
                  >
                    {selected.repo_url.length > 40 ? selected.repo_url.slice(0, 40) + '…' : selected.repo_url} <ExternalLink className="h-3 w-3" />
                  </a>
                </p>
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
                <div className="space-y-2 border-t pt-4">
                  <Label className="text-xs font-semibold">Score</Label>
                  <p className="text-xs text-muted-foreground">Max score: {selected.max_score}</p>
                  <Input
                    type="number"
                    min={0}
                    max={selected.max_score}
                    value={score}
                    onChange={(e) => {
                      const val = Math.min(selected.max_score, Math.max(0, Number(e.target.value)))
                      setScore(isNaN(val) ? '' : String(val))
                    }}
                    placeholder={`0–${selected.max_score}`}
                  />
                  {score && Number(score) > selected.max_score && (
                    <p className="text-xs text-amber-600">Score exceeds max. Will be clamped to {selected.max_score}.</p>
                  )}
                  {score && Number(score) >= 0 && (
                    <p className="text-xs text-muted-foreground">
                      = {((Number(score) / selected.max_score) * 100).toFixed(1)}%
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-semibold">Feedback</Label>
                  <Textarea
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    placeholder="Provide feedback for the team…"
                    rows={3}
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={submitScore}
                    disabled={submitting || !score}
                    className="flex-1 gap-1.5"
                  >
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Submit Score
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
                          Are you sure you want to reject this submission? This will set the score to 0 and mark it as rejected. Provide a reason below.
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