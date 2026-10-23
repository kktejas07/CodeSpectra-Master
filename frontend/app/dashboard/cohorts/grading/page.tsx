'use client'

/** TA grading queue: oldest ungraded submissions across the caller's cohorts, rubric grading with feedback. */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ClipboardCheck, Download } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useT } from '@/lib/i18n/client'
import { useToast } from '@/lib/toast-context'
import { PageHeader, Panel } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { call, ErrorNote, Skeleton, areaClass, useErrorText } from '@/components/community/client-api'
import type { QueueItem } from '@/components/cohorts/types'
import type { AssignmentDoc, SubmissionDoc } from '@/lib/cohorts/types'

function Grader({ id, onDone }: { id: string; onDone: () => void }) {
  const { t } = useT()
  const toast = useToast()
  const errText = useErrorText()
  const [d, setD] = useState<{ submission: SubmissionDoc; assignment: AssignmentDoc } | null>(null)
  const [scores, setScores] = useState<Record<string, string>>({})
  const [feedback, setFeedback] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    setD(null)
    call<{ submission: SubmissionDoc; assignment: AssignmentDoc }>(`/api/cohorts/submissions/${id}`).then((r) => {
      setD(r)
      setScores(Object.fromEntries(r.assignment.rubric.map((x) => [x.id, ''])))
      setFeedback('')
    }).catch((e) => setErr(errText(e)))
  }, [id, errText])
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      await call(`/api/cohorts/submissions/${id}`, { body: { rubric: Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, Number(v)])), feedback } })
      toast({ type: 'success', title: t('community.gradeSaved') })
      onDone()
    } catch (e2) { setErr(errText(e2)) } finally { setBusy(false) }
  }
  if (err) return <ErrorNote text={err} />
  if (!d) return <Skeleton className="h-64" />
  const s = d.submission
  return (
    <form onSubmit={save} className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">{d.assignment.title}</h2>
        <p className="text-sm text-muted-foreground">{s.user_name} · {t('community.attemptN', { n: s.attempt })}{s.late ? ` · ${t('community.late')}` : ''}</p>
      </div>
      {s.kind === 'code' && s.code !== null && <pre className="max-h-[420px] overflow-auto rounded-2xl bg-zinc-950 p-4 text-sm text-zinc-100"><code>{s.code}</code></pre>}
      {s.kind === 'file' && s.file && (
        <Button asChild variant="outline" className="min-h-[44px] rounded-full"><a href={`/api/cohorts/submissions/${s.id}/file`}><Download className="h-4 w-4" aria-hidden />{t('community.downloadFile', { name: s.file.name })}</a></Button>
      )}
      {s.file?.scan === 'unscanned' && <Badge variant="warning">{t('community.unscanned')}</Badge>}
      {s.autograde && <p className="text-sm text-foreground">{t('community.testsPassed', { passed: s.autograde.passed, total: s.autograde.total })}</p>}
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-foreground">{t('community.rubric')}</legend>
        {d.assignment.rubric.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3">
            <label htmlFor={`g-${r.id}`} className="min-w-0 flex-1 text-sm"><span className="font-medium text-foreground">{r.label}</span>{r.description && <span className="block text-muted-foreground">{r.description}</span>}</label>
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <input id={`g-${r.id}`} type="number" min={0} max={r.points} required className="h-11 w-20 rounded-xl border border-border bg-background px-2 text-sm tabular-nums text-foreground" value={scores[r.id] ?? ''} onChange={(e) => setScores({ ...scores, [r.id]: e.target.value })} />
              <span className="tabular-nums">/ {r.points}</span>
            </span>
          </div>
        ))}
      </fieldset>
      <div className="space-y-1.5">
        <label htmlFor="g-fb" className="text-sm font-medium text-foreground">{t('community.feedback')}</label>
        <textarea id="g-fb" className={areaClass} value={feedback} onChange={(e) => setFeedback(e.target.value)} maxLength={5000} />
      </div>
      <Button type="submit" disabled={busy} className="min-h-[44px] rounded-full">{busy ? t('community.saving') : t('community.saveGrade')}</Button>
    </form>
  )
}

export default function GradingPage() {
  const gate = usePageGuard('user')
  const { t, fmt } = useT()
  const errText = useErrorText()
  const [q, setQ] = useState<QueueItem[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const load = useCallback(() => { call<{ queue: QueueItem[] }>('/api/cohorts/grading').then((r) => setQ(r.queue)).catch((e) => setErr(errText(e))) }, [errText])
  useEffect(() => { if (gate.ready) load() }, [gate.ready, load])
  if (!gate.ready) return null
  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader title={t('community.gradingQueue')} description={t('community.gradingLead')} icon={<ClipboardCheck />} actions={<Button asChild variant="outline" className="min-h-[44px] rounded-full"><Link href="/dashboard/cohorts">{t('community.backToCohorts')}</Link></Button>} />
      <ErrorNote text={err} />
      {!q && !err && <Skeleton />}
      {q && !q.length && <EmptyState title={t('community.queueEmpty')} description={t('community.queueEmptyHint')} />}
      {q && q.length > 0 && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,360px)_1fr]">
          <ul className="space-y-2" aria-label={t('community.gradingQueue')}>
            {q.map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => setSel(s.id)} aria-current={sel === s.id} className={`w-full rounded-2xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${sel === s.id ? 'border-primary bg-primary/5' : 'border-border bg-card hover:border-primary/40'}`}>
                  <span className="block font-medium text-foreground">{s.assignment.title}</span>
                  <span className="block text-sm text-muted-foreground">{s.user_name} · {s.cohort_title}</span>
                  <span className="block text-xs tabular-nums text-muted-foreground">{fmt.relative(s.submitted_at)}{s.late ? ` · ${t('community.late')}` : ''}</span>
                </button>
              </li>
            ))}
          </ul>
          <Panel className="p-5 sm:p-6">{sel ? <Grader id={sel} onDone={() => { setSel(null); load() }} /> : <p className="text-sm text-muted-foreground">{t('community.pickSubmission')}</p>}</Panel>
        </div>
      )}
    </div>
  )
}
