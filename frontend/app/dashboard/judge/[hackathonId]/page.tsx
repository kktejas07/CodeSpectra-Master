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
  Loader2,
  Gavel,
  ArrowLeft,
  ExternalLink,
  Send,
} from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { DashboardPageHeader } from '@/components/dashboard/dashboard-page-header'
import { csrfFetch } from '@/lib/csrf-fetch'

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
}

interface Hackathon {
  id: string
  name: string
  slug: string
  tasks: { problem_slug: string; problem_title: string; points: number }[]
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
  }

  async function submitScore() {
    if (!selected) return
    setSubmitting(true)
    try {
      const res = await csrfFetch(
        `/api/hackathons/${hackathonId}/submissions/${selected.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ score: Number(score), feedback }),
        },
      )
      if (res.ok) {
        setSelected(null)
        await load()
      }
    } catch { /* ignore */ }
    finally { setSubmitting(false) }
  }

  function problemTitle(slug: string): string {
    return hackathon?.tasks?.find((t) => t.problem_slug === slug)?.problem_title || slug
  }

  const filtered = submissions.filter((s) =>
    statusFilter === 'all' || s.status === statusFilter
  )

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
                    className={`cursor-pointer ${selected?.id === s.id ? 'bg-muted/50' : ''}`}
                    onClick={() => selectRow(s)}
                  >
                    <TableCell className="font-medium">{s.team_name}</TableCell>
                    <TableCell>{problemTitle(s.problem_slug)}</TableCell>
                    <TableCell>
                      <Badge variant={s.status === 'pending' ? 'destructive' : 'secondary'}>
                        {s.status}
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
              <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>
                ✕
              </Button>
            </div>

            <div className="space-y-1 text-sm">
              <p><strong>Team:</strong> {selected.team_name}</p>
              <p><strong>Problem:</strong> {problemTitle(selected.problem_slug)}</p>
              {selected.repo_url && (
                <p>
                  <strong>Repo:</strong>{' '}
                  <a
                    href={selected.repo_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline inline-flex items-center gap-1"
                  >
                    {selected.repo_url} <ExternalLink className="h-3 w-3" />
                  </a>
                </p>
              )}
            </div>

            {selected.code && (
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Code</Label>
                <pre className="max-h-64 overflow-auto rounded border bg-muted/30 p-3 text-xs">
                  <code>{selected.code}</code>
                </pre>
              </div>
            )}

            {selected.feedback && (
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Team Feedback</Label>
                <p className="text-sm text-muted-foreground">{selected.feedback}</p>
              </div>
            )}

            <div className="space-y-2 border-t pt-4">
              <Label className="text-xs font-semibold">Score (0–{selected.max_score})</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={score}
                onChange={(e) => setScore(e.target.value)}
                placeholder="0–100"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold">Feedback</Label>
              <Textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Provide feedback for the team…"
                rows={4}
              />
            </div>

            <Button onClick={submitScore} disabled={submitting || !score} className="w-full gap-1.5">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Submit Score
            </Button>
          </Card>
        )}
      </div>
    </div>
  )
}
