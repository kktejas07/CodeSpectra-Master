'use client'

/**
 * Proctoring recordings of one test (audit CORE-011). Lists every attempt
 * with footage — and any parts that failed to upload — and plays one attempt
 * with a seekable timeline across its 1-minute chunks. Staff only; each
 * playback is written to the admin audit log by the API.
 */
import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, AlertTriangle, Film, Loader2, PlayCircle } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useDateFormat } from '@/lib/use-platform-timezone'
import { PageHeader, Panel } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { RecordingPlayer, fmtClock, type PlayerRecording } from '@/components/proctoring/RecordingPlayer'

interface AttemptRow {
  user_id: string
  attempt_no: number
  candidate: { name: string; email: string }
  total_bytes: number
  chunk_count: number
  failed_uploads: number
  last_error: string | null
  duration_ms: number
  started_at: string
}
interface Detail extends PlayerRecording {
  user_id: string
  attempt_no: number
  candidate: { name: string; email: string }
  failed_uploads: number
  failed_chunks: Array<{ stream: string; chunk_index: number; reason: string; at: string }>
  last_error: string | null
  has_audio: boolean
}

const mb = (n: number) => `${(n / (1024 * 1024)).toFixed(1)} MB`
const REASONS: Record<string, string> = {
  attempt_size_cap: 'size limit reached',
  storage_s3_error: 'object storage error',
  storage_gridfs_error: 'database storage error',
}
const reasonLabel = (r: string | null) => (r ? REASONS[r] || r.replace(/^client_/, 'browser: ').replace(/_/g, ' ') : '')

export default function ExamRecordingsPage() {
  const gate = usePageGuard('tenant_admin')
  const { dateTime } = useDateFormat()
  const router = useRouter()
  const params = useParams()
  const search = useSearchParams()
  const examId = String(params.id)
  const userFilter = search.get('user') || ''
  const [title, setTitle] = useState('')
  const [rows, setRows] = useState<AttemptRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<{ user: string; attempt: number } | null>(null)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  useEffect(() => {
    if (!gate.ready) return
    const qs = userFilter ? `?user_id=${encodeURIComponent(userFilter)}` : ''
    fetch(`/api/admin/exams/${examId}/recordings${qs}`, { credentials: 'include' })
      .then(async (r) => {
        const j = await r.json()
        if (!r.ok) throw new Error(j.error || 'Could not load recordings')
        setTitle(j.exam?.title || '')
        setRows(j.attempts || [])
        if (userFilter && j.attempts?.length) setSelected({ user: j.attempts[0].user_id, attempt: j.attempts[0].attempt_no })
      })
      .catch((e: Error) => { setError(e.message); setRows([]) })
  }, [gate.ready, examId, userFilter])

  const loadDetail = useCallback(async (user: string, attempt: number) => {
    setLoadingDetail(true)
    setDetail(null)
    try {
      const r = await fetch(`/api/admin/exams/${examId}/recordings?user_id=${encodeURIComponent(user)}&attempt_no=${attempt}`, { credentials: 'include' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Could not load the recording')
      setDetail(j.recording)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoadingDetail(false)
    }
  }, [examId])

  useEffect(() => { if (selected) loadDetail(selected.user, selected.attempt) }, [selected, loadDetail])

  if (!gate.ready) return null

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <button type="button" onClick={() => router.push(`/dashboard/admin/assessments/${examId}/results`)} className="flex items-center gap-2 rounded-md text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <ArrowLeft className="h-4 w-4" /> Back to results
      </button>
      <PageHeader
        title="Session recordings"
        description={title ? `Webcam and screen recordings for “${title}”. Every playback is logged.` : 'Webcam and screen recordings. Every playback is logged.'}
        icon={<Film />}
      />

      {error && <p className="text-sm text-red-600 dark:text-red-400" role="alert">{error}</p>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Panel className="p-4">
          <h2 className="mb-3 text-sm font-semibold text-foreground">Attempts</h2>
          {rows === null ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : rows.length === 0 ? (
            <EmptyState compact title="No recordings yet" description="Recordings appear here when a candidate agrees to recording and starts the test." />
          ) : (
            <ul className="space-y-2">
              {rows.map((r) => {
                const active = selected?.user === r.user_id && selected.attempt === r.attempt_no
                return (
                  <li key={`${r.user_id}-${r.attempt_no}`}>
                    <button
                      type="button"
                      onClick={() => setSelected({ user: r.user_id, attempt: r.attempt_no })}
                      className={`w-full rounded-2xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? 'border-primary/50 bg-primary/10' : 'border-border hover:border-primary/40'}`}
                      aria-pressed={active}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium text-foreground">{r.candidate.name || r.candidate.email || 'Candidate'}</span>
                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">Attempt {r.attempt_no}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                        {fmtClock(r.duration_ms)} · {r.chunk_count} parts · {mb(r.total_bytes)} · {dateTime(r.started_at)}
                      </p>
                      {r.failed_uploads > 0 && (
                        <p className="mt-1 flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
                          <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> {r.failed_uploads} upload failure{r.failed_uploads === 1 ? '' : 's'}{r.last_error ? ` (${reasonLabel(r.last_error)})` : ''}
                        </p>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>

        <Panel className="p-4 sm:p-6">
          {!selected ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
              <PlayCircle className="h-8 w-8" aria-hidden />
              <p className="text-sm">Pick an attempt to watch its recording.</p>
            </div>
          ) : loadingDetail || !detail ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">{detail.candidate.name || detail.candidate.email || 'Candidate'}</h2>
                <p className="text-sm text-muted-foreground">Attempt {detail.attempt_no}{detail.has_audio ? '' : ' · recorded without audio'}</p>
              </div>
              {detail.failed_uploads > 0 && (
                <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <span>
                    {detail.failed_uploads} part{detail.failed_uploads === 1 ? '' : 's'} failed to upload
                    {detail.last_error ? ` — last reason: ${reasonLabel(detail.last_error)}` : ''}.
                    The candidate was not interrupted; footage for those minutes is missing.
                  </span>
                </div>
              )}
              {detail.streams.webcam.length + detail.streams.screen.length === 0 ? (
                <EmptyState compact title="No footage stored" description="Uploads for this attempt failed or were removed after the retention period." />
              ) : (
                <RecordingPlayer key={`${detail.user_id}-${detail.attempt_no}`} recording={detail} />
              )}
              <Button type="button" variant="outline" size="sm" onClick={() => loadDetail(detail.user_id, detail.attempt_no)}>Refresh links</Button>
            </div>
          )}
        </Panel>
      </div>
    </div>
  )
}
