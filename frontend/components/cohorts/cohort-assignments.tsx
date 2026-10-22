'use client'

/** Assignments for learners: instructions, deadline, code (autograded) or file submissions, results and feedback. */
import { useState } from 'react'
import { CheckCircle2, FileUp, Play, XCircle } from 'lucide-react'
import { useT } from '@/lib/i18n/client'
import { useToast } from '@/lib/toast-context'
import { Panel } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PostMarkdown } from '@/components/community/post-markdown'
import { call, useErrorText } from '@/components/community/client-api'
import type { CohortView, LearnerAssignment } from './types'

const ACCEPT: Record<string, string> = { pdf: '.pdf', zip: '.zip', docx: '.docx', pptx: '.pptx', xlsx: '.xlsx', image: '.png,.jpg,.jpeg,.webp,.gif', text: '.txt,.md,.csv,.json,.py,.js,.ts,.java,.c,.cpp,.go,.rb,.sql' }

function Submit({ cohortId, a, onDone }: { cohortId: string; a: LearnerAssignment; onDone: () => void }) {
  const { t } = useT()
  const toast = useToast()
  const errText = useErrorText()
  const [code, setCode] = useState(a.starter_code || '')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ final_pct: number | null; autograde: { passed: number; total: number } | null; late: boolean } | null>(null)

  const go = async () => {
    setBusy(true)
    try {
      if (a.kind === 'code') {
        const r = await call<{ final_pct: number | null; autograde: { passed: number; total: number } | null; late: boolean }>(`/api/cohorts/${cohortId}/assignments/${a.id}/submit`, { body: { code } })
        setResult(r)
      } else {
        if (!file) return
        const form = new FormData()
        form.append('file', file)
        await call(`/api/cohorts/${cohortId}/assignments/${a.id}/submit`, { form })
        setFile(null)
        toast({ type: 'success', title: t('community.fileSubmitted') })
      }
      onDone()
    } catch (e) {
      toast({ type: 'error', title: errText(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      {a.kind === 'code' ? (
        <>
          <label htmlFor={`code-${a.id}`} className="text-sm font-medium text-foreground">{t('community.yourCode', { language: a.language || '' })}</label>
          <textarea id={`code-${a.id}`} spellCheck={false} className="min-h-[220px] w-full rounded-2xl border border-border bg-zinc-950 p-4 font-mono text-sm text-zinc-100 outline-none focus-visible:ring-2 focus-visible:ring-ring" value={code} onChange={(e) => setCode(e.target.value)} />
        </>
      ) : (
        <>
          <label htmlFor={`file-${a.id}`} className="text-sm font-medium text-foreground">{t('community.chooseFile', { types: a.file_types.join(', ') })}</label>
          <input id={`file-${a.id}`} type="file" accept={a.file_types.map((k) => ACCEPT[k] || '').join(',')} onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-sm text-foreground file:mr-3 file:min-h-[44px] file:rounded-full file:border-0 file:bg-primary/10 file:px-4 file:text-primary" />
          <p className="text-xs text-muted-foreground">{t('community.fileLimit')}</p>
        </>
      )}
      <Button className="min-h-[44px] rounded-full" disabled={busy || (a.kind === 'file' && !file)} onClick={go}>
        {a.kind === 'code' ? <Play className="h-4 w-4" aria-hidden /> : <FileUp className="h-4 w-4" aria-hidden />}
        {busy ? (a.kind === 'code' ? t('community.running') : t('community.uploading')) : t('community.submit')}
      </Button>
      {result && (
        <p role="status" className="text-sm text-foreground">
          {result.autograde ? t('community.testsPassed', { passed: result.autograde.passed, total: result.autograde.total }) : null}
          {result.final_pct !== null ? ` ${t('community.scoreIs', { pct: result.final_pct })}` : ` ${t('community.waitingForTa')}`}
          {result.late ? ` ${t('community.lateNote')}` : ''}
        </p>
      )}
    </div>
  )
}

export function CohortAssignments({ view, onChange }: { view: CohortView; onChange: () => void }) {
  const { t, td, fmt } = useT()
  const [open, setOpen] = useState<string | null>(null)
  const learner = view.my?.role === 'learner' && view.my.status !== 'dropped'
  const list = view.assignments as LearnerAssignment[]
  if (!list.length) return <EmptyState compact title={t('community.noAssignments')} description={view.is_staff ? t('community.noAssignmentsStaff') : t('community.noAssignmentsHint')} />
  const now = Date.now()
  return (
    <ul className="space-y-3">
      {list.map((a) => {
        const subs = view.submissions.filter((s) => s.assignment_id === a.id)
        const best = subs.reduce<number | null>((m, s) => (typeof s.final_pct === 'number' ? Math.max(m ?? 0, s.final_pct) : m), null)
        const due = Date.parse(a.due_at)
        const closed = now > due + (a.late_hours || 0) * 3_600_000
        return (
          <li key={a.id}>
            <Panel className="space-y-3 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-base font-semibold text-foreground">{a.title}</h3>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{td(`community.kind_${a.kind}`, a.kind)}</Badge>
                  {best !== null && <Badge variant="success">{t('community.bestScore', { pct: best })}</Badge>}
                  {view.is_staff && a.published === false && <Badge variant="warning">{t('community.draft')}</Badge>}
                </div>
              </div>
              <p className="text-sm text-muted-foreground"><span className="tabular-nums">{t('community.dueOn', { date: fmt.dateTime(a.due_at, view.cohort.timezone) })}</span>{a.late_hours ? ` · ${t('community.lateWindow', { hours: a.late_hours, pct: a.late_penalty_pct })}` : ''}</p>
              {(learner || view.is_staff) && (
                <>
                  <Button variant="ghost" className="min-h-[44px] rounded-full px-3" aria-expanded={open === a.id} onClick={() => setOpen(open === a.id ? null : a.id)}>{open === a.id ? t('community.hideDetails') : t('community.showDetails')}</Button>
                  {open === a.id && (
                    <div className="space-y-4">
                      {a.instructions && <PostMarkdown text={a.instructions} />}
                      {!!a.samples?.length && (
                        <div className="space-y-2">
                          <p className="text-sm font-medium text-foreground">{t('community.sampleTests')}{a.hidden_tests ? ` · ${t('community.hiddenTests', { count: a.hidden_tests })}` : ''}</p>
                          {a.samples.map((s, i) => (
                            <div key={i} className="grid gap-2 sm:grid-cols-2">
                              <pre className="overflow-x-auto rounded-xl bg-muted p-3 text-xs text-foreground">{s.input}</pre>
                              <pre className="overflow-x-auto rounded-xl bg-muted p-3 text-xs text-foreground">{s.output}</pre>
                            </div>
                          ))}
                        </div>
                      )}
                      {!!a.rubric?.length && (
                        <ul className="space-y-1 text-sm text-muted-foreground">{a.rubric.map((r) => <li key={r.id}><span className="font-medium text-foreground">{r.label}</span> · <span className="tabular-nums">{t('community.points', { n: r.points })}</span>{r.description ? ` — ${r.description}` : ''}</li>)}</ul>
                      )}
                      {learner && !closed && <Submit cohortId={view.cohort.id} a={a} onDone={onChange} />}
                      {learner && closed && <p className="text-sm text-muted-foreground">{t('community.deadlinePassed')}</p>}
                      {subs.length > 0 && (
                        <ul className="space-y-2">
                          {subs.slice(0, 5).map((s) => (
                            <li key={s.id} className="rounded-xl border border-border p-3 text-sm">
                              <p className="flex flex-wrap items-center gap-2 text-foreground">
                                {s.status === 'graded' ? <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" aria-hidden /> : <XCircle className="h-4 w-4 text-muted-foreground" aria-hidden />}
                                <span className="tabular-nums">{t('community.attemptN', { n: s.attempt })} · {fmt.relative(s.submitted_at)}</span>
                                {typeof s.final_pct === 'number' ? <span className="tabular-nums font-medium">{t('community.scoreIs', { pct: s.final_pct })}</span> : <span className="text-muted-foreground">{t('community.waitingForTa')}</span>}
                                {s.late && <Badge variant="warning">{t('community.late')}</Badge>}
                              </p>
                              {s.autograde && <p className="mt-1 text-muted-foreground">{t('community.testsPassed', { passed: s.autograde.passed, total: s.autograde.total })}</p>}
                              {s.feedback && <div className="mt-2 rounded-lg bg-muted p-2"><PostMarkdown text={s.feedback} compact /></div>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </>
              )}
            </Panel>
          </li>
        )
      })}
    </ul>
  )
}
