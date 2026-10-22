'use client'

/** Results: score submissions in batches (resumable), see the table, publish to the linked campus drive / ATS job. */
import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Download, ListChecks, Target, Users } from 'lucide-react'
import { csrfFetch } from '@/lib/csrf-fetch'
import { Panel, StatCard } from '@/components/app/page-kit'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { useT } from '@/lib/i18n/client'
import { useApiError } from '@/lib/i18n/use-api-error'
import { selectCls } from '../ui'
import type { DriveView } from './types'

interface Summary { submitted: number; passed: number; average_percent: number | null; terminated: number; not_started: number; running: number }
interface Row { id: string; name: string; email: string; group_no: number; state: string; percent: number | null; passed: boolean | null; flags: number; flagged: boolean }

export function ResultsPanel({ id, drive }: { id: string; drive: DriveView }) {
  const { t, td, fmt } = useT()
  const apiError = useApiError()
  const [summary, setSummary] = useState<Summary | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
  const [rejectOthers, setRejectOthers] = useState(false)
  const [stages, setStages] = useState<{ id: string; name: string }[]>([])
  const [stage, setStage] = useState('')
  const [confirm, setConfirm] = useState(false)

  const load = useCallback(async () => {
    const r = await fetch(`/api/live-drives/${id}/results`, { credentials: 'include', cache: 'no-store' })
    const j = await r.json().catch(() => null)
    if (r.ok) { setSummary(j.summary); setRows(j.rows) } else setNote({ ok: false, text: apiError(j) })
  }, [id, apiError])
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!drive.links.ats_job_id || drive.owner.kind !== 'company') return
    fetch(`/api/ats/jobs/${drive.links.ats_job_id}?tenant=${encodeURIComponent(drive.owner.tenant_id)}`, { credentials: 'include' })
      .then((r) => r.json()).then((j) => setStages(Array.isArray(j?.job?.pipeline) ? j.job.pipeline.map((s: { id: string; name: string }) => ({ id: s.id, name: s.name })) : []))
      .catch(() => setStages([]))
  }, [drive.links.ats_job_id, drive.owner.kind, drive.owner.tenant_id])

  const post = async (body: unknown) => {
    const r = await csrfFetch(`/api/live-drives/${id}/results`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const j = await r.json().catch(() => null)
    if (!r.ok) throw new Error(apiError(j))
    return j
  }

  const scoreAll = async () => {
    setBusy(true)
    setNote(null)
    try {
      let total = 0
      for (let i = 0; i < 400; i++) {
        const j = await post({ action: 'score' })
        total += j.scored
        setProgress(t('hiring.ldScoringProgress', { done: total, left: j.remaining }))
        setSummary(j.summary)
        if (!j.remaining) break
      }
      setNote({ ok: true, text: t('hiring.ldScoringDone', { count: total }) })
      await load()
    } catch (e) {
      setNote({ ok: false, text: e instanceof Error ? e.message : t('hiring.ldActionFailed') })
    } finally {
      setBusy(false)
      setProgress('')
    }
  }

  const publish = async () => {
    setBusy(true)
    setNote(null)
    try {
      const j = await post({ action: 'publish', reject_others: rejectOthers, ...(stage ? { stage_id: stage } : {}) })
      setNote({ ok: true, text: t('hiring.ldPublished', { passed: j.passed, moved: j.moved }) })
      await load()
    } catch (e) {
      setNote({ ok: false, text: e instanceof Error ? e.message : t('hiring.ldActionFailed') })
    } finally {
      setBusy(false)
    }
  }

  const csv = () => {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const head = ['name', 'email', 'group', 'state', 'percent', 'passed', 'flags', 'flagged']
    const body = rows.map((r) => [r.name, r.email, r.group_no, r.state, r.percent ?? '', r.passed ?? '', r.flags, r.flagged].map(esc).join(','))
    const blob = new Blob([[head.join(','), ...body].join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `drive-${id}-results.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  return (
    <div className="space-y-6">
      {summary ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label={t('hiring.ldSubmitted')} value={fmt.number(summary.submitted)} icon={<Users />} />
          <StatCard label={t('hiring.ldPassedCount')} value={fmt.number(summary.passed)} icon={<CheckCircle2 />} />
          <StatCard label={t('hiring.ldAverage')} value={summary.average_percent === null ? '—' : `${summary.average_percent}%`} icon={<Target />} />
          <StatCard label={t('hiring.ldStillWriting')} value={fmt.number(summary.running)} icon={<ListChecks />} hint={summary.terminated ? t('hiring.ldTerminatedN', { count: summary.terminated }) : undefined} />
        </div>
      ) : null}

      <Panel className="space-y-4 p-5">
        <h2 className="text-base font-semibold text-foreground">{t('hiring.ldResultsTitle')}</h2>
        <p className="text-sm text-muted-foreground">{t('hiring.ldResultsHint')}</p>
        <div className="flex flex-wrap gap-2">
          <Button className="min-h-11" disabled={busy} onClick={() => void scoreAll()}>{t('hiring.ldScoreSubmissions')}</Button>
          <Button variant="outline" className="min-h-11" disabled={!rows.length} onClick={csv}><Download className="mr-2 h-4 w-4" aria-hidden />{t('hiring.ldDownloadCsv')}</Button>
        </div>
        {progress ? <p role="status" className="text-sm tabular-nums text-muted-foreground">{progress}</p> : null}

        <div className="space-y-3 rounded-2xl border border-border p-4">
          <h3 className="text-sm font-semibold text-foreground">{t('hiring.ldPublishTitle')}</h3>
          {drive.links.campus_drive_id ? (
            <label className="flex min-h-11 items-center gap-3 text-sm text-foreground">
              <input type="checkbox" className="h-5 w-5 accent-[var(--primary)]" checked={rejectOthers} onChange={(e) => setRejectOthers(e.target.checked)} />
              {t('hiring.ldRejectOthers')}
            </label>
          ) : null}
          {stages.length ? (
            <div className="max-w-sm space-y-1.5">
              <Label htmlFor="ld-stage">{t('hiring.ldMoveToStage')}</Label>
              <select id="ld-stage" className={selectCls} value={stage} onChange={(e) => setStage(e.target.value)}>
                <option value="">{t('hiring.ldDontMove')}</option>
                {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          ) : null}
          {!drive.links.campus_drive_id && !drive.links.ats_job_id ? <p className="text-sm text-muted-foreground">{t('hiring.ldPublishNoLink')}</p> : null}
          {drive.results.published_at ? <p className="text-sm text-muted-foreground">{t('hiring.ldPublishedAt', { when: fmt.dateTime(drive.results.published_at) })}</p> : null}
          <Button className="min-h-11" disabled={busy} onClick={() => setConfirm(true)}>{t('hiring.ldPublish')}</Button>
        </div>
        {note ? <p role={note.ok ? 'status' : 'alert'} className={note.ok ? 'text-sm text-green-700 dark:text-green-400' : 'text-sm text-destructive'}>{note.text}</p> : null}
      </Panel>

      <Panel className="overflow-x-auto p-0">
        {rows.length ? (
          <table className="w-full min-w-[560px] text-sm">
            <caption className="sr-only">{t('hiring.ldResultsTitle')}</caption>
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th scope="col" className="px-4 py-3 font-medium">{t('hiring.ldColCandidate')}</th>
                <th scope="col" className="px-4 py-3 font-medium">{t('hiring.ldColStatus')}</th>
                <th scope="col" className="px-4 py-3 font-medium">{t('hiring.ldColScore')}</th>
                <th scope="col" className="px-4 py-3 font-medium">{t('hiring.ldColFlags')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <th scope="row" className="px-4 py-3 text-left font-medium text-foreground">{r.name}<span className="block text-xs font-normal text-muted-foreground">{r.email}</span></th>
                  <td className="px-4 py-3 text-muted-foreground">{td(`hiring.ldState:${r.state}`, r.state)}</td>
                  <td className="px-4 py-3 tabular-nums">
                    {r.percent === null ? <span className="text-muted-foreground">—</span> : <span className={r.passed ? 'text-green-700 dark:text-green-400' : 'text-foreground'}>{r.percent}%{r.passed ? ` · ${t('hiring.ldPassed')}` : ''}</span>}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-muted-foreground">{fmt.number(r.flags)}{r.flagged ? ` · ${td('hiring.ldGrid:flagged', 'Flagged')}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <div className="p-5"><EmptyState compact title={t('hiring.ldNoResults')} /></div>}
      </Panel>

      <ConfirmDialog
        open={confirm}
        title={t('hiring.ldPublishTitle')}
        message={t('hiring.ldPublishConfirm')}
        confirmLabel={t('hiring.ldPublish')}
        variant="default"
        onConfirm={() => { setConfirm(false); void publish() }}
        onCancel={() => setConfirm(false)}
      />
    </div>
  )
}
