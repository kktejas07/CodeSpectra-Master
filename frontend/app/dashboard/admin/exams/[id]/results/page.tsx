'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Loader2, ArrowLeft, Download, ShieldAlert, CheckCircle2, User, Eye, X, AlertTriangle, Copy, Minimize2, Maximize2, Send, CheckCheck, MoreHorizontal, Link, Mail, Trash2, Clock, XCircle } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { DataTable } from '@/components/ui/data-table'
import type { DataTableColumn } from '@/components/ui/data-table'
import { csrfFetch } from '@/lib/csrf-fetch'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'


interface CandidateResult {
  id: string
  inviteId: string
  name: string
  email: string
  status: string
  score: number | null
  submittedAt: string | null
  proctoringFlags: number
  idPhoto?: string | null
  facePhoto?: string | null
  userId?: string
  released?: boolean
  deliveryStatus?: string | null
}

interface Exam {
  id: string
  title: string
  level: string
  duration: number
}

interface QuestionDetail {
  qId: string
  correct: boolean
  points: number
  answer: string
}

interface ReviewData {
  examTitle: string
  questions: Array<{ id: string; title?: string; question?: string; type: string; options?: string[]; correct_answer?: string; points?: number }>
  submission: {
    answers: Record<string, string>
    details: QuestionDetail[]
    score: number
    max_score: number
    submitted_at: string
    released_at: string | null
    id_photo?: string | null
    face_photo?: string | null
  }
  proctorEvents: Array<{ event_type: string; meta: Record<string, unknown>; created_at: string }>
  candidate: { name: string; email: string }
}

const PROCTOR_LABELS: Record<string, string> = {
  tab_blur: 'Tab Switch',
  tab_focus: 'Tab Return',
  copy: 'Copy',
  paste: 'Paste',
  fullscreen_exit: 'Fullscreen Exit',
  fullscreen_enter: 'Fullscreen Enter',
  right_click: 'Right Click',
  visibility_change: 'Visibility Change',
  window_blur: 'Window Blur',
  window_focus: 'Window Focus',
  screenshot: 'Screenshot',
}

const PROCTOR_ICONS: Record<string, React.ReactNode> = {
  tab_blur: <Minimize2 className="w-3 h-3" />,
  tab_focus: <Maximize2 className="w-3 h-3" />,
  copy: <Copy className="w-3 h-3" />,
  paste: <Copy className="w-3 h-3" />,
}

export default function ExamResultsPage() {
  const gate = usePageGuard('superadmin')
  const addToast = useToast()
  const router = useRouter()
  const params = useParams()
  
  const [exam, setExam] = useState<Exam | null>(null)
  const [results, setResults] = useState<CandidateResult[]>([])
  const [loading, setLoading] = useState(true)
  const [reviewCandidate, setReviewCandidate] = useState<CandidateResult | null>(null)
  const [reviewData, setReviewData] = useState<ReviewData | null>(null)
  const [reviewLoading, setReviewLoading] = useState(false)
  const [releasing, setReleasing] = useState<string | null>(null)
  const [bulkReleasing, setBulkReleasing] = useState(false)

  const fetchData = useCallback(async () => {
    if (!params.id) return
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/exams/${params.id}/results`, { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to load results')
      setExam(json.exam)
      setResults((json.results || []).map((r: CandidateResult) => ({
        ...r,
        inviteId: r.id,
      })))
    } catch {
      addToast({ type: 'error', title: 'Failed to load results' })
      router.push('/dashboard/admin/exams')
    } finally {
      setLoading(false)
    }
  }, [params.id, router])

  useEffect(() => { fetchData() }, [fetchData])

  const openReview = async (row: CandidateResult) => {
    setReviewCandidate(row)
    setReviewData(null)
    setReviewLoading(true)
    try {
      const uid = row.userId || row.id
      const res = await fetch(`/api/admin/exams/${params.id}/submissions/${uid}`, { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to load review')
      setReviewData(json)
    } catch {
      addToast({ type: 'error', title: 'Failed to load submission details' })
      setReviewCandidate(null)
    } finally {
      setReviewLoading(false)
    }
  }

  const releaseScore = async (userId: string, name: string) => {
    setReleasing(userId)
    try {
      const res = await csrfFetch(`/api/admin/exams/${params.id}/submissions/${userId}/release`, {
        method: 'PATCH',
        credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      addToast({ type: 'success', title: `Score released for ${name}` })
      setReviewData(prev => prev ? { ...prev, submission: { ...prev.submission, released_at: json.released_at } } : null)
      setResults(prev => prev.map(r => r.userId === userId ? { ...r, released: true } : r))
    } catch {
      addToast({ type: 'error', title: `Failed to release score for ${name}` })
    } finally {
      setReleasing(null)
    }
  }

  const releaseAll = async () => {
    setBulkReleasing(true)
    try {
      const res = await csrfFetch(`/api/admin/exams/${params.id}/release`, {
        method: 'POST',
        credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      addToast({ type: 'success', title: `${json.released} scores released` })
      setResults(prev => prev.map(r => r.status === 'completed' ? { ...r, released: true } : r))
      if (reviewData) {
        setReviewData(prev => prev ? { ...prev, submission: { ...prev.submission, released_at: new Date().toISOString() } } : null)
      }
    } catch {
      addToast({ type: 'error', title: 'Bulk release failed' })
    } finally {
      setBulkReleasing(false)
    }
  }

  const [resendingId, setResendingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteInvite, setConfirmDeleteInvite] = useState<{ id: string; name: string } | null>(null)

  const resendInvite = async (inviteId: string, name: string) => {
    setResendingId(inviteId)
    try {
      const res = await csrfFetch(`/api/admin/exams/${params.id}/invites/${inviteId}/resend`, {
        method: 'POST',
        credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to resend')
      addToast({ type: 'success', title: `Invite resent to ${name}` })
    } catch (e: unknown) {
      addToast({ type: 'error', title: e instanceof Error ? e.message : 'Failed to resend invite' })
    } finally {
      setResendingId(null)
    }
  }

  const deleteInvite = async (inviteId: string, name: string) => {
    setDeletingId(inviteId)
    try {
      const res = await csrfFetch(`/api/admin/exams/${params.id}/invites/${inviteId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Failed to delete')
      addToast({ type: 'success', title: `Invite deleted for ${name}` })
      setResults(prev => prev.filter(r => r.inviteId !== inviteId))
    } catch {
      addToast({ type: 'error', title: `Failed to delete invite for ${name}` })
    } finally {
      setDeletingId(null)
    }
  }

  const copyInviteLink = (row: CandidateResult) => {
    const link = `${window.location.origin}/assessment/invite/${row.id}`
    navigator.clipboard.writeText(link).then(() => {
      addToast({ type: 'success', title: `Invite link copied for ${row.name}` })
    })
  }

  const formatProctorType = (type: string): string => PROCTOR_LABELS[type] || type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())

  const proctorColor = (type: string): string => {
    if (['copy', 'paste', 'right_click'].includes(type)) return 'text-rose-400 border-rose-500/30 bg-rose-500/10'
    if (['tab_blur', 'fullscreen_exit', 'window_blur', 'visibility_change'].includes(type)) return 'text-amber-400 border-amber-500/30 bg-amber-500/10'
    return 'text-muted-foreground border-border bg-muted/50'
  }

  const columns: DataTableColumn<CandidateResult>[] = [
    {
      key: 'name',
      header: 'Candidate',
      cell: (row: CandidateResult) => (
        <div>
          <div className="font-medium text-foreground">{row.name}</div>
          <div className="text-xs text-muted-foreground">{row.email}</div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row: CandidateResult) => {
        const badges: Record<string, React.ReactNode> = {
          pending: <Badge variant="outline" className="text-muted-foreground">Invited</Badge>,
          in_progress: <Badge variant="outline" className="text-blue-500 border-blue-500/20">In Progress</Badge>,
          completed: <Badge variant="default" className="bg-emerald-500 hover:bg-emerald-600 text-white">Completed</Badge>,
          expired: <Badge variant="secondary" className="text-amber-500">Expired</Badge>,
        }
        return badges[row.status] || <Badge variant="outline">{row.status}</Badge>
      },
    },
    {
      key: 'deliveryStatus',
      header: 'Email',
      cell: (row: CandidateResult) => {
        if (row.deliveryStatus === 'sending') {
          return <span className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3"/> Sending</span>
        }
        if (row.deliveryStatus === 'delivered') {
          return <span className="text-xs text-emerald-500 flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> Delivered</span>
        }
        if (row.deliveryStatus === 'failed' || row.deliveryStatus === 'bounced') {
          return <span className="text-xs text-rose-500 flex items-center gap-1"><XCircle className="w-3 h-3"/> {row.deliveryStatus === 'bounced' ? 'Bounced' : 'Failed'}</span>
        }
        if (row.status === 'completed') {
          return <span className="text-xs text-emerald-500 flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> Delivered</span>
        }
        return <span className="text-xs text-muted-foreground">--</span>
      },
    },
    {
      key: 'proctoringFlags',
      header: 'Integrity',
      cell: (row: CandidateResult) => (
        <div className="flex items-center gap-2">
          {row.proctoringFlags === 0 ? (
            <span className="text-emerald-500 text-xs flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> Clean</span>
          ) : (
            <span className="text-rose-500 text-xs flex items-center gap-1 font-bold">
              <ShieldAlert className="w-3 h-3"/> {row.proctoringFlags} Flags
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'score',
      header: 'Score',
      cell: (row: CandidateResult) => (
        <div className="font-mono font-medium">
          {row.score !== null ? `${row.score}%` : '--'}
        </div>
      ),
    },
    {
      key: 'released',
      header: 'Released',
      cell: (row: CandidateResult) => (
        row.released ? (
          <span className="text-emerald-500 text-xs flex items-center gap-1"><CheckCheck className="w-3 h-3" /> Released</span>
        ) : row.status === 'completed' ? (
          <span className="text-muted-foreground text-xs">Pending</span>
        ) : null
      ),
    },
    {
      key: 'actions',
      header: '',
      cell: (row: CandidateResult) => (
        <div className="flex items-center gap-1 justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0"
                disabled={resendingId === row.inviteId || deletingId === row.inviteId}
              >
                {resendingId === row.inviteId || deletingId === row.inviteId
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <MoreHorizontal className="w-3.5 h-3.5" />
                }
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {row.status === 'completed' && (
                <DropdownMenuItem onClick={() => openReview(row)} className="gap-2">
                  <Eye className="h-4 w-4" /> Review
                </DropdownMenuItem>
              )}
              {row.status === 'completed' && !row.released && (
                <DropdownMenuItem onClick={() => releaseScore(row.userId || row.id, row.name)} className="gap-2 text-emerald-500 focus:text-emerald-500">
                  <Send className="h-4 w-4" /> Release Score
                </DropdownMenuItem>
              )}
              {row.status !== 'completed' && (
                <DropdownMenuItem onClick={() => resendInvite(row.inviteId, row.name)} className="gap-2">
                  <Mail className="h-4 w-4" /> Resend Invite
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => copyInviteLink(row)} className="gap-2">
                <Link className="h-4 w-4" /> Copy Link
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setConfirmDeleteInvite({ id: row.inviteId, name: row.name })} className="gap-2 text-destructive focus:text-destructive">
                <Trash2 className="h-4 w-4" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ]

  if (!gate.ready) return null

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading results...
      </div>
    )
  }

  if (!exam) return null

  const completedCount = results.filter(r => r.status === 'completed').length
  const unreleasedCount = results.filter(r => r.status === 'completed' && !r.released).length

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 p-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-muted-foreground hover:text-foreground cursor-pointer text-sm mb-2" onClick={() => router.push('/dashboard/admin/exams')}>
            <ArrowLeft className="h-4 w-4" /> Back to Exams
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Results: {exam.title}</h1>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="outline">{exam.level}</Badge>
            <Badge variant="outline">{exam.duration} mins</Badge>
            <Badge variant="secondary" className="bg-primary/10 text-primary">
              {completedCount} Submitted
            </Badge>
            <Badge variant="secondary" className="bg-amber-500/10 text-amber-600">
              {results.length} Total Invited
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {unreleasedCount > 0 && (
            <Button
              variant="default"
              className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={releaseAll}
              disabled={bulkReleasing}
            >
              {bulkReleasing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Release All ({unreleasedCount})
            </Button>
          )}
          <Button variant="outline" className="gap-2">
            <Download className="w-4 h-4" /> Export CSV
          </Button>
        </div>
      </div>

      <div className="bg-card border rounded-lg p-1">
        <DataTable 
          data={results} 
          columns={columns} 
          searchKeys={['name', 'email']}
          searchPlaceholder="Search candidates..."
        />
      </div>

      {reviewCandidate && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/75 p-4 backdrop-blur-xs pt-8 overflow-y-auto">
          <div className="max-w-4xl w-full rounded-xl border border-border bg-card p-6 shadow-2xl space-y-4 mb-8">
            <div className="flex items-center justify-between border-b pb-3 sticky top-0 bg-card z-10">
              <div>
                <h3 className="font-bold text-lg">Review: {reviewCandidate.name}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{reviewCandidate.email}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => { setReviewCandidate(null); setReviewData(null) }}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            {reviewLoading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading review data...
              </div>
            ) : reviewData ? (
              <>
                {/* Candidate Info */}
                <div className="grid grid-cols-3 gap-4 text-sm border rounded-lg p-4 bg-muted/30">
                  <div>
                    <span className="text-muted-foreground block text-xs">Score</span>
                    <span className="text-xl font-bold">{reviewData.submission.score}/{reviewData.submission.max_score}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-xs">Percentage</span>
                    <span className="text-xl font-bold">
                      {reviewData.submission.max_score > 0
                        ? `${Math.round((reviewData.submission.score / reviewData.submission.max_score) * 100)}%`
                        : '--'}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-xs">Submitted</span>
                    <span className="text-sm font-medium">
                      {reviewData.submission.submitted_at
                        ? new Date(reviewData.submission.submitted_at).toLocaleString()
                        : '--'}
                    </span>
                  </div>
                </div>

                {/* Answer Review */}
                <div className="space-y-3">
                  <h4 className="font-semibold text-sm flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Answer Review
                  </h4>
                  {reviewData.questions.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">No questions found</p>
                  ) : (
                    reviewData.questions.map((q, i) => {
                      const detail = reviewData.submission.details.find((d: QuestionDetail) => d.qId === q.id)
                      const userAnswer = reviewData.submission.answers[q.id] || ''
                      const isMcq = ['multiple-choice', 'mcq', 'true_false'].includes(q.type)
                      return (
                        <div key={q.id} className="border rounded-lg p-4 space-y-2">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <span className="text-xs text-muted-foreground">Q{i + 1}. {q.type}</span>
                              <p className="text-sm font-medium mt-0.5">{q.question || q.title}</p>
                            </div>
                            <Badge variant={detail?.correct ? 'default' : 'secondary'} className={detail?.correct ? 'bg-emerald-500/20 text-emerald-500 border-emerald-500/30' : 'text-rose-500 bg-rose-500/10 border-rose-500/30'}>
                              {detail?.correct ? `+${detail.points}` : '0'}
                            </Badge>
                          </div>
                          {isMcq && q.options && (
                            <div className="flex flex-wrap gap-1.5 mt-1">
                              {q.options.map((opt, oi) => {
                                const isSelected = userAnswer.toLowerCase() === opt.toLowerCase()
                                const isCorrectAnswer = q.correct_answer && opt.toLowerCase() === q.correct_answer.toLowerCase()
                                return (
                                  <Badge key={oi} variant="outline" className={`text-xs ${
                                    isSelected && isCorrectAnswer ? 'bg-emerald-500/20 text-emerald-500 border-emerald-500/40' :
                                    isSelected && !isCorrectAnswer ? 'bg-rose-500/20 text-rose-500 border-rose-500/40 line-through' :
                                    !isSelected && isCorrectAnswer ? 'bg-emerald-500/10 text-emerald-500/70 border-emerald-500/20' :
                                    'text-muted-foreground'
                                  }`}>
                                    {opt}
                                    {isSelected ? ' (selected)' : ''}
                                    {!isSelected && isCorrectAnswer ? ' (correct)' : ''}
                                  </Badge>
                                )
                              })}
                            </div>
                          )}
                          {!isMcq && (
                            <div className="mt-1 space-y-1">
                              {userAnswer ? (
                                <div className="text-xs">
                                  <span className="text-muted-foreground">Answer: </span>
                                  <span className="font-mono bg-muted px-2 py-0.5 rounded text-xs">{userAnswer}</span>
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground italic">No answer provided</span>
                              )}
                              {q.correct_answer && (
                                <div className="text-xs">
                                  <span className="text-muted-foreground">Correct: </span>
                                  <span className="font-mono bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded text-xs">{q.correct_answer}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>

                {/* Proctoring Events */}
                <div className="space-y-3">
                  <h4 className="font-semibold text-sm flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-amber-500" /> Proctoring Log
                    <Badge variant="outline" className="text-xs">{reviewData.proctorEvents.length} events</Badge>
                  </h4>
                  {reviewData.proctorEvents.length === 0 ? (
                    <div className="border rounded-lg p-6 text-center">
                      <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500 mb-2" />
                      <p className="text-sm text-muted-foreground">No proctoring violations detected</p>
                    </div>
                  ) : (
                    <div className="border rounded-lg max-h-64 overflow-y-auto">
                      {reviewData.proctorEvents.map((evt, i) => (
                        <div key={i} className={`flex items-center gap-3 px-4 py-2 text-xs border-b last:border-b-0 ${proctorColor(evt.event_type)}`}>
                          <span className="shrink-0">{PROCTOR_ICONS[evt.event_type] || <AlertTriangle className="w-3 h-3" />}</span>
                          <span className="shrink-0 font-medium">{formatProctorType(evt.event_type)}</span>
                          <span className="text-muted-foreground ml-auto shrink-0">
                            {evt.created_at ? new Date(evt.created_at).toLocaleTimeString() : ''}
                          </span>
                          {evt.meta && Object.keys(evt.meta).length > 0 && (
                            <span className="text-muted-foreground truncate max-w-[200px] hidden md:inline">
                              {JSON.stringify(evt.meta)}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Identity Photos */}
                {(reviewData.submission.id_photo || reviewData.submission.face_photo) && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <span className="text-xs font-semibold text-muted-foreground block">ID Photo</span>
                      <div className="aspect-4/3 rounded-lg border overflow-hidden bg-muted flex items-center justify-center">
                        {reviewData.submission.id_photo ? (
                          <img src={reviewData.submission.id_photo} alt="ID" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-xs text-muted-foreground">Not captured</span>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-xs font-semibold text-muted-foreground block">Face Photo</span>
                      <div className="aspect-4/3 rounded-lg border overflow-hidden bg-muted flex items-center justify-center">
                        {reviewData.submission.face_photo ? (
                          <img src={reviewData.submission.face_photo} alt="Face" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-xs text-muted-foreground">Not captured</span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Release Actions */}
                <div className="flex items-center justify-between pt-4 border-t">
                  <div className="text-xs text-muted-foreground">
                    {reviewData.submission.released_at ? (
                      <span className="text-emerald-500 flex items-center gap-1">
                        <CheckCheck className="w-3.5 h-3.5" /> Score released on {new Date(reviewData.submission.released_at).toLocaleString()}
                      </span>
                    ) : (
                      'Score not yet released to candidate'
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <Button variant="outline" onClick={() => { setReviewCandidate(null); setReviewData(null) }}>
                      Close
                    </Button>
                    {!reviewData.submission.released_at && (
                      <Button
                        className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                        onClick={() => releaseScore(reviewCandidate.userId || reviewCandidate.id, reviewCandidate.name)}
                        disabled={releasing === (reviewCandidate.userId || reviewCandidate.id)}
                      >
                        {releasing === (reviewCandidate.userId || reviewCandidate.id) ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Send className="w-4 h-4" />
                        )}
                        Release Score
                      </Button>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="py-8 text-center text-muted-foreground text-sm">
                No submission data found for this candidate.
              </div>
            )}
          </div>
        </div>
      )}

      <AlertDialog open={!!confirmDeleteInvite} onOpenChange={(open) => !open && setConfirmDeleteInvite(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Invite?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the invite for {confirmDeleteInvite?.name}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              onClick={async () => {
                if (confirmDeleteInvite) {
                  const { id, name } = confirmDeleteInvite
                  setConfirmDeleteInvite(null)
                  await deleteInvite(id, name)
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
