'use client'

/**
 * Live drive control room. Live: status counts, candidate grid (invigilators
 * see their groups), integrity flags stream and a drill-down drawer with
 * warn / add time / pause / resume / flag / terminate. Organisers also get
 * Setup (schedule, roster, invigilators, integrity, rules) and Results
 * (score in batches, publish to the campus drive / ATS job). Data arrives by
 * polling with backoff (lib/live-drives/use-poll).
 */
import { useCallback, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, Megaphone, Radio } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { csrfFetch } from '@/lib/csrf-fetch'
import { PageHeader, Panel } from '@/components/app/page-kit'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonList } from '@/components/ui/skeleton-boneyard'
import { useT } from '@/lib/i18n/client'
import { useApiError } from '@/lib/i18n/use-api-error'
import { usePoll } from '@/lib/live-drives/use-poll'
import { GRID_STATUSES, type GridStatus } from '@/lib/live-drives/types'
import { cn } from '@/lib/utils'
import { GRID_TONE, STATUS_TONE, fmtClock, selectCls } from '../ui'
import { CandidateDrawer } from './candidate-drawer'
import { SetupPanel } from './setup-panel'
import { ResultsPanel } from './results-panel'
import { NoShowsPanel } from './no-shows-panel'
import type { ControlData } from './types'

type Tab = 'live' | 'setup' | 'results'

export default function ControlRoomPage() {
  const gate = usePageGuard('user')
  const { t, td, fmt } = useT()
  const apiError = useApiError()
  const params = useParams<{ id: string }>()
  const id = String(params?.id || '')
  const [data, setData] = useState<ControlData | null>(null)
  const [error, setError] = useState('')
  const [notFound, setNotFound] = useState(false)
  const [flags, setFlags] = useState<ControlData['flags']>([])
  const [cursor, setCursor] = useState<number | null>(null)
  const [status, setStatus] = useState<GridStatus | ''>('')
  const [group, setGroup] = useState(0)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('live')
  const [stale, setStale] = useState(false)

  const poll = useCallback(async () => {
    if (!id) return false
    const qs = new URLSearchParams({ page: String(page) })
    if (cursor) qs.set('since', String(cursor))
    if (status) qs.set('status', status)
    if (group) qs.set('group', String(group))
    if (search.trim()) qs.set('q', search.trim())
    const r = await fetch(`/api/live-drives/${id}/control?${qs}`, { credentials: 'include', cache: 'no-store' })
    const j = await r.json().catch(() => null)
    if (r.status === 404) { setNotFound(true); return true }
    if (!r.ok) { setError(apiError(j)); setStale(true); return false }
    setError('')
    setStale(false)
    setData(j)
    if (j.flags?.length) setFlags((prev) => [...j.flags.slice().reverse(), ...prev].slice(0, 200))
    setCursor(j.cursor)
    return true
  }, [id, page, cursor, status, group, search, apiError])

  usePoll(poll, 5000, gate.ready && tab === 'live' && !notFound)

  if (!gate.ready) return null
  if (notFound) return <EmptyState title={t('hiring.ldNotFound')} description={t('hiring.ldNotFoundHint')} actionLabel={t('hiring.ldBackToDrives')} actionHref="/dashboard/live-drives" />
  const drive = data?.drive
  const owner = drive?.role === 'owner'

  return (
    <div className="space-y-6">
      <Link href="/dashboard/live-drives" className="inline-flex items-center gap-1.5 rounded text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <ArrowLeft className="h-4 w-4" aria-hidden />{t('hiring.ldBackToDrives')}
      </Link>
      <PageHeader
        title={drive?.title ?? t('hiring.ldControlRoom')}
        description={drive ? `${drive.owner.name} · ${drive.test.exam_name} · ${fmt.dateTime(drive.schedule.start_at)}` : undefined}
        icon={<Radio />}
        actions={drive ? <span className={`rounded-full px-3 py-1 text-sm font-medium ${STATUS_TONE[drive.effective_status]}`}>{td(`hiring.ldStatus:${drive.effective_status}`, drive.effective_status)}</span> : null}
      />

      {owner ? (
        <div role="tablist" aria-label={t('hiring.ldControlRoom')} className="flex flex-wrap gap-2">
          {(['live', 'setup', 'results'] as const).map((k) => (
            <button
              key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
              className={cn('min-h-11 rounded-full px-4 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none', tab === k ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground')}
            >
              {td(`hiring.ldTab:${k}`, k)}
            </button>
          ))}
        </div>
      ) : null}

      {error ? <p role="alert" className="text-sm text-destructive">{error}{stale ? ` ${t('hiring.ldRetrying')}` : ''}</p> : null}
      {!data && !error ? <SkeletonList /> : null}

      {data && tab === 'live' ? (
        <>
          <div className="flex flex-wrap gap-2" role="group" aria-label={t('hiring.ldFilterByStatus')}>
            <button type="button" aria-pressed={status === ''} onClick={() => { setStatus(''); setPage(1) }} className={cn('min-h-11 rounded-full border px-3 text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', status === '' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground')}>
              {t('hiring.ldAll')} · {fmt.number(data.total)}
            </button>
            {GRID_STATUSES.map((s) => (
              <button key={s} type="button" aria-pressed={status === s} onClick={() => { setStatus(status === s ? '' : s); setPage(1) }} className={cn('min-h-11 rounded-full border px-3 text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', status === s ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground')}>
                {td(`hiring.ldGrid:${s}`, s)} · {fmt.number(data.counts[s] ?? 0)}
              </button>
            ))}
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
            <Panel className="space-y-4 p-4 sm:p-5">
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-40 flex-1">
                  <label htmlFor="ld-search" className="sr-only">{t('hiring.ldSearch')}</label>
                  <Input id="ld-search" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} placeholder={t('hiring.ldSearch')} />
                </div>
                {data.groups.length > 1 ? (
                  <div className="w-48">
                    <label htmlFor="ld-group" className="sr-only">{t('hiring.ldGroup')}</label>
                    <select id="ld-group" className={selectCls} value={group} onChange={(e) => { setGroup(Number(e.target.value)); setPage(1) }}>
                      <option value={0}>{t('hiring.ldAllGroups')}</option>
                      {data.groups.map((g) => <option key={g.group_no} value={g.group_no}>{t('hiring.ldGroupN', { n: g.group_no })}{g.invigilator ? ` · ${g.invigilator}` : ''}</option>)}
                    </select>
                  </div>
                ) : null}
              </div>
              {data.rows.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <caption className="sr-only">{t('hiring.ldGridCaption')}</caption>
                    <thead className="text-left text-xs text-muted-foreground">
                      <tr className="border-b border-border">
                        <th scope="col" className="px-3 py-2 font-medium">{t('hiring.ldColCandidate')}</th>
                        <th scope="col" className="px-3 py-2 font-medium">{t('hiring.ldGroup')}</th>
                        <th scope="col" className="px-3 py-2 font-medium">{t('hiring.ldColStatus')}</th>
                        <th scope="col" className="px-3 py-2 font-medium">{t('hiring.ldColAnswered')}</th>
                        <th scope="col" className="px-3 py-2 font-medium">{t('hiring.ldColFlags')}</th>
                        <th scope="col" className="px-3 py-2 font-medium">{t('hiring.ldColTimeLeft')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.rows.map((r) => (
                        <tr key={r.id} className="border-b border-border last:border-0">
                          <th scope="row" className="px-3 py-2 text-left font-medium">
                            <button type="button" onClick={() => setOpen(r.id)} className="rounded text-left text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                              {r.name}<span className="block text-xs font-normal text-muted-foreground">{r.email}</span>
                            </button>
                          </th>
                          <td className="px-3 py-2 tabular-nums text-muted-foreground">{r.group_no}</td>
                          <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${GRID_TONE[r.status]}`}>{td(`hiring.ldGrid:${r.status}`, r.status)}</span></td>
                          <td className="px-3 py-2 tabular-nums text-muted-foreground">{fmt.number(r.answered)}</td>
                          <td className={cn('px-3 py-2 tabular-nums', r.flags ? 'text-red-700 dark:text-red-400' : 'text-muted-foreground')}>{fmt.number(r.flags)}</td>
                          <td className="px-3 py-2 font-mono tabular-nums text-muted-foreground">{r.state === 'in_progress' || r.state === 'paused' ? fmtClock(r.remaining_ms) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState compact title={data.total ? t('hiring.ldNoMatches') : t('hiring.ldNoCandidates')} description={data.total ? undefined : owner ? t('hiring.ldNoCandidatesOwner') : t('hiring.ldNoCandidatesInvigilator')} />
              )}
              {data.matching > data.page_size ? (
                <div className="flex items-center justify-between gap-2">
                  <Button variant="outline" className="min-h-11" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>{t('common.previous')}</Button>
                  <span className="text-sm tabular-nums text-muted-foreground">{t('hiring.ldPageOf', { n: page, m: Math.ceil(data.matching / data.page_size) })}</span>
                  <Button variant="outline" className="min-h-11" disabled={page * data.page_size >= data.matching} onClick={() => setPage((p) => p + 1)}>{t('common.next')}</Button>
                </div>
              ) : null}
            </Panel>

            <div className="space-y-6">
              {owner ? <BroadcastBox id={id} /> : null}
              <Panel className="p-4 sm:p-5">
                <h2 className="mb-3 text-base font-semibold text-foreground">{t('hiring.ldFlagsTitle')}</h2>
                {flags.length ? (
                  <ol className="max-h-[480px] space-y-2 overflow-y-auto" aria-live="polite">
                    {flags.map((f, i) => (
                      <li key={`${f.received_at}-${i}`}>
                        <button type="button" disabled={!f.candidate_id} onClick={() => f.candidate_id && setOpen(f.candidate_id)} className="w-full rounded-xl border border-border px-3 py-2 text-left text-sm hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                          <span className="font-medium text-foreground">{f.name || t('hiring.ldCandidate')}</span>
                          <span className="block text-xs text-muted-foreground">{td(`hiring.ldSignal:${f.type}`, f.type)} · {t('hiring.ldGroupN', { n: f.group_no })} · {fmt.relative(new Date(f.at).toISOString())}</span>
                        </button>
                      </li>
                    ))}
                  </ol>
                ) : <p className="text-sm text-muted-foreground">{t('hiring.ldFlagsEmpty')}</p>}
              </Panel>
            </div>
          </div>
        </>
      ) : null}

      {data && owner && tab === 'setup' ? <SetupPanel id={id} drive={data.drive} /> : null}
      {data && owner && tab === 'results' ? <NoShowsPanel id={id} /> : null}
      {data && owner && tab === 'results' ? <ResultsPanel id={id} drive={data.drive} /> : null}

      {open && data ? <CandidateDrawer driveId={id} candidateId={open} onClose={() => setOpen(null)} onChanged={() => void poll()} /> : null}
    </div>
  )
}

function BroadcastBox({ id }: { id: string }) {
  const { t } = useT()
  const apiError = useApiError()
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setNote(null)
    try {
      const r = await csrfFetch(`/api/live-drives/${id}/broadcast`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: msg }) })
      const j = await r.json().catch(() => null)
      if (!r.ok) throw new Error(apiError(j))
      setMsg('')
      setNote({ ok: true, text: t('hiring.ldBroadcastSent') })
    } catch (err) {
      setNote({ ok: false, text: err instanceof Error ? err.message : t('hiring.ldActionFailed') })
    } finally {
      setBusy(false)
    }
  }
  return (
    <Panel className="p-4 sm:p-5">
      <form onSubmit={send} className="space-y-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-foreground"><Megaphone className="h-4 w-4 text-primary" aria-hidden />{t('hiring.ldBroadcast')}</h2>
        <label htmlFor="ld-broadcast" className="sr-only">{t('hiring.ldBroadcast')}</label>
        <textarea id="ld-broadcast" value={msg} maxLength={300} onChange={(e) => setMsg(e.target.value)} rows={3} placeholder={t('hiring.ldBroadcastPlaceholder')} className="w-full rounded-xl border border-border bg-background p-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        {note ? <p role={note.ok ? 'status' : 'alert'} className={note.ok ? 'text-sm text-green-700 dark:text-green-400' : 'text-sm text-destructive'}>{note.text}</p> : null}
        <Button type="submit" className="min-h-11 w-full" disabled={busy || !msg.trim()}>{t('hiring.ldSendToAll')}</Button>
      </form>
    </Panel>
  )
}
