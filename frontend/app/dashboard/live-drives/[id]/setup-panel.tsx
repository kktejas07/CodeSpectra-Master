'use client'

/** Organiser setup: schedule + status, roster import, invigilators, integrity checks, drive rules. */
import { useEffect, useState } from 'react'
import { csrfFetch } from '@/lib/csrf-fetch'
import { Panel } from '@/components/app/page-kit'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useT } from '@/lib/i18n/client'
import { useApiError } from '@/lib/i18n/use-api-error'
import { toLocalDatetimeString } from '@/lib/datetime-local'
import type { IntegritySettings, SignalId } from '@/lib/integrity/types'
import type { DriveView } from './types'

const SIGNALS_SHOWN: SignalId[] = ['face_count', 'looking_away', 'tab_focus', 'fullscreen', 'clipboard', 'devtools', 'multi_monitor', 'network']
const areaCls = 'w-full rounded-xl border border-border bg-background p-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
const emailsOf = (s: string) => [...new Set(s.split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter((x) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x)))]

function useAction() {
  const apiError = useApiError()
  const { t } = useT()
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
  const run = async <T,>(url: string, method: string, body: unknown, ok: (j: T) => string): Promise<T | null> => {
    setBusy(true)
    setNote(null)
    try {
      const r = await csrfFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const j = await r.json().catch(() => null)
      if (!r.ok) throw new Error(apiError(j))
      setNote({ ok: true, text: ok(j as T) })
      return j as T
    } catch (e) {
      setNote({ ok: false, text: e instanceof Error ? e.message : t('hiring.ldActionFailed') })
      return null
    } finally {
      setBusy(false)
    }
  }
  const Note = () => (note ? <p role={note.ok ? 'status' : 'alert'} className={note.ok ? 'text-sm text-green-700 dark:text-green-400' : 'text-sm text-destructive'}>{note.text}</p> : null)
  return { busy, run, Note }
}

export function SetupPanel({ id, drive }: { id: string; drive: DriveView }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <ScheduleCard id={id} drive={drive} />
      <RosterCard id={id} drive={drive} />
      <InvigilatorsCard id={id} drive={drive} />
      <IntegrityCard id={id} />
      <RulesCard id={id} drive={drive} />
    </div>
  )
}

function ScheduleCard({ id, drive }: { id: string; drive: DriveView }) {
  const { t, td, fmt } = useT()
  const { busy, run, Note } = useAction()
  const [start, setStart] = useState(() => toLocalDatetimeString(new Date(drive.schedule.start_at)))
  const [duration, setDuration] = useState(drive.schedule.duration_min)
  const [lobby, setLobby] = useState(drive.schedule.lobby_open_min)
  const [late, setLate] = useState(drive.schedule.late_join_min)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const locked = drive.effective_status === 'live' || drive.effective_status === 'ended'
  const schedule = { start_at: new Date(start).toISOString(), duration_min: duration, lobby_open_min: lobby, late_join_min: late }
  return (
    <Panel className="space-y-4 p-5">
      <h2 className="text-base font-semibold text-foreground">{t('hiring.ldScheduleTitle')}</h2>
      <p className="text-sm text-muted-foreground">{t('hiring.ldScheduleState', { status: td(`hiring.ldStatus:${drive.effective_status}`, drive.effective_status), when: fmt.dateTime(drive.schedule.start_at) })}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="s-start">{t('hiring.ldFieldStart')}</Label><Input id="s-start" type="datetime-local" disabled={locked} value={start} onChange={(e) => setStart(e.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor="s-dur">{t('hiring.ldFieldDuration')}</Label><Input id="s-dur" type="number" min={5} max={600} disabled={locked} value={duration} onChange={(e) => setDuration(Number(e.target.value))} /></div>
        <div className="space-y-1.5"><Label htmlFor="s-lobby">{t('hiring.ldFieldLobby')}</Label><Input id="s-lobby" type="number" min={0} max={240} disabled={locked} value={lobby} onChange={(e) => setLobby(Number(e.target.value))} /></div>
        <div className="space-y-1.5"><Label htmlFor="s-late">{t('hiring.ldFieldLateJoin')}</Label><Input id="s-late" type="number" min={0} max={120} disabled={locked} value={late} onChange={(e) => setLate(Number(e.target.value))} /></div>
      </div>
      <div className="flex flex-wrap gap-2">
        {!locked ? <Button variant="outline" className="min-h-11" disabled={busy} onClick={() => void run(`/api/live-drives/${id}`, 'PATCH', { schedule }, () => t('hiring.ldSaved'))}>{t('common.save')}</Button> : null}
        {drive.status === 'draft' ? <Button className="min-h-11" disabled={busy || !drive.candidate_count} onClick={() => void run(`/api/live-drives/${id}`, 'PATCH', { schedule, status: 'scheduled' }, () => t('hiring.ldScheduledDone'))}>{t('hiring.ldSchedule')}</Button> : null}
        {drive.status === 'scheduled' && !locked ? <Button variant="outline" className="min-h-11" disabled={busy} onClick={() => void run(`/api/live-drives/${id}`, 'PATCH', { status: 'draft' }, () => t('hiring.ldBackToDraftDone'))}>{t('hiring.ldBackToDraft')}</Button> : null}
        {drive.status === 'scheduled' ? <Button variant="destructive" className="min-h-11" disabled={busy} onClick={() => setConfirmEnd(true)}>{t('hiring.ldEndDrive')}</Button> : null}
      </div>
      {drive.status === 'draft' && !drive.candidate_count ? <p className="text-xs text-muted-foreground">{t('hiring.ldScheduleNeedsRoster')}</p> : null}
      <Note />
      <ConfirmDialog
        open={confirmEnd}
        title={t('hiring.ldEndDriveTitle')}
        message={t('hiring.ldEndDriveBody')}
        confirmLabel={t('hiring.ldEndDrive')}
        onConfirm={() => { setConfirmEnd(false); void run(`/api/live-drives/${id}`, 'PATCH', { status: 'ended' }, () => t('hiring.ldEndedDone')) }}
        onCancel={() => setConfirmEnd(false)}
      />
    </Panel>
  )
}

function RosterCard({ id, drive }: { id: string; drive: DriveView }) {
  const { t } = useT()
  const { busy, run, Note } = useAction()
  const [emails, setEmails] = useState('')
  const [missing, setMissing] = useState<string[]>([])
  type R = { added: number; already: number; missing: string[]; missing_count: number; total: number }
  const done = (j: R) => { setMissing(j.missing); return t('hiring.ldRosterResult', { added: j.added, total: j.total, missing: j.missing_count }) }
  const list = emailsOf(emails)
  return (
    <Panel className="space-y-4 p-5">
      <h2 className="text-base font-semibold text-foreground">{t('hiring.ldRosterTitle')}</h2>
      <p className="text-sm text-muted-foreground">{t('hiring.ldRosterCount', { count: drive.candidate_count })}</p>
      <div className="flex flex-wrap gap-2">
        {drive.links.campus_drive_id ? <Button variant="outline" className="min-h-11" disabled={busy} onClick={() => void run<R>(`/api/live-drives/${id}/roster`, 'POST', { source: 'campus' }, done)}>{t('hiring.ldImportCampus')}</Button> : null}
        {drive.links.ats_job_id ? <Button variant="outline" className="min-h-11" disabled={busy} onClick={() => void run<R>(`/api/live-drives/${id}/roster`, 'POST', { source: 'ats' }, done)}>{t('hiring.ldImportAts')}</Button> : null}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="r-emails">{t('hiring.ldRosterEmails')}</Label>
        <textarea id="r-emails" rows={4} className={areaCls} value={emails} onChange={(e) => setEmails(e.target.value)} placeholder={t('hiring.ldRosterEmailsPlaceholder')} />
        <p className="text-xs text-muted-foreground">{t('hiring.ldRosterEmailsHint', { count: list.length })}</p>
      </div>
      <Button className="min-h-11" disabled={busy || !list.length || list.length > 5000} onClick={() => void run<R>(`/api/live-drives/${id}/roster`, 'POST', { source: 'emails', emails: list }, done).then((j) => { if (j) setEmails('') })}>{t('hiring.ldAddCandidates')}</Button>
      <Note />
      {missing.length ? (
        <div className="rounded-xl bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
          <p>{t('hiring.ldRosterMissing')}</p>
          <p className="mt-1 break-all font-mono text-xs">{missing.join(', ')}</p>
        </div>
      ) : null}
    </Panel>
  )
}

function InvigilatorsCard({ id, drive }: { id: string; drive: DriveView }) {
  const { t } = useT()
  const { busy, run, Note } = useAction()
  const [emails, setEmails] = useState(drive.invigilators.map((i) => i.email).join('\n'))
  const [size, setSize] = useState(drive.rules.group_size)
  const [missing, setMissing] = useState<string[]>([])
  const list = emailsOf(emails)
  const groups = Math.max(1, Math.ceil(drive.candidate_count / Math.max(1, size)))
  return (
    <Panel className="space-y-4 p-5">
      <h2 className="text-base font-semibold text-foreground">{t('hiring.ldInvigilatorsTitle')}</h2>
      <p className="text-sm text-muted-foreground">{t('hiring.ldInvigilatorsHint')}</p>
      <div className="space-y-1.5">
        <Label htmlFor="i-emails">{t('hiring.ldInvigilatorEmails')}</Label>
        <textarea id="i-emails" rows={4} className={areaCls} value={emails} onChange={(e) => setEmails(e.target.value)} />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-36 space-y-1.5"><Label htmlFor="i-size">{t('hiring.ldGroupSize')}</Label><Input id="i-size" type="number" min={5} max={500} value={size} onChange={(e) => setSize(Number(e.target.value))} /></div>
        <p className="pb-3 text-sm tabular-nums text-muted-foreground">{t('hiring.ldGroupsPlan', { groups, people: list.length })}</p>
      </div>
      <Button className="min-h-11" disabled={busy || size < 5} onClick={() => void run<{ invigilators: unknown[]; missing: string[] }>(`/api/live-drives/${id}/invigilators`, 'PUT', { emails: list, group_size: size }, (j) => { setMissing(j.missing); return t('hiring.ldInvigilatorsSaved', { count: j.invigilators.length }) })}>{t('hiring.ldSaveAndAssign')}</Button>
      <Note />
      {missing.length ? <p className="rounded-xl bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">{t('hiring.ldInvigilatorsMissing', { list: missing.join(', ') })}</p> : null}
    </Panel>
  )
}

function IntegrityCard({ id }: { id: string }) {
  const { t, td } = useT()
  const { busy, run, Note } = useAction()
  const [s, setS] = useState<IntegritySettings | null>(null)
  useEffect(() => {
    fetch(`/api/live-drives/${id}/integrity`, { credentials: 'include', cache: 'no-store' }).then((r) => r.json()).then((j) => setS(j?.settings ?? null)).catch(() => setS(null))
  }, [id])
  if (!s) return <Panel className="p-5"><p className="text-sm text-muted-foreground">{t('common.loading')}</p></Panel>
  const toggle = (k: SignalId) => setS({ ...s, signals: { ...s.signals, [k]: !s.signals[k] } })
  return (
    <Panel className="space-y-4 p-5">
      <h2 className="text-base font-semibold text-foreground">{t('hiring.ldIntegrityTitle')}</h2>
      <p className="text-sm text-muted-foreground">{t('hiring.ldIntegrityHint')}</p>
      <label className="flex min-h-11 items-center gap-3 text-sm text-foreground">
        <input type="checkbox" className="h-5 w-5 accent-[var(--primary)]" checked={s.enabled} onChange={(e) => setS({ ...s, enabled: e.target.checked })} />
        {t('hiring.ldIntegrityOn')}
      </label>
      <fieldset disabled={!s.enabled} className="grid gap-1 sm:grid-cols-2">
        <legend className="sr-only">{t('hiring.ldIntegritySignals')}</legend>
        {SIGNALS_SHOWN.map((k) => (
          <label key={k} className="flex min-h-11 items-center gap-3 text-sm text-foreground">
            <input type="checkbox" className="h-5 w-5 accent-[var(--primary)]" checked={s.signals[k]} onChange={() => toggle(k)} />
            {td(`hiring.ldSignalName:${k}`, k)}
          </label>
        ))}
        <label className="flex min-h-11 items-center gap-3 text-sm text-foreground sm:col-span-2">
          <input type="checkbox" className="h-5 w-5 accent-[var(--primary)]" checked={s.snapshots_on_violation} onChange={(e) => setS({ ...s, snapshots_on_violation: e.target.checked })} />
          {t('hiring.ldIntegritySnapshots')}
        </label>
      </fieldset>
      <Button className="min-h-11" disabled={busy} onClick={() => void run(`/api/live-drives/${id}/integrity`, 'PUT', { enabled: s.enabled, signals: s.signals, snapshots_on_violation: s.snapshots_on_violation }, () => t('hiring.ldSaved'))}>{t('common.save')}</Button>
      <Note />
    </Panel>
  )
}

function RulesCard({ id, drive }: { id: string; drive: DriveView }) {
  const { t, td } = useT()
  const { busy, run, Note } = useAction()
  const [r, setR] = useState(drive.rules)
  const num = (k: keyof typeof r, min: number, max: number) => (
    <div className="space-y-1.5">
      <Label htmlFor={`rule-${k}`}>{td(`hiring.ldRule:${k}`, k)}</Label>
      <Input id={`rule-${k}`} type="number" min={min} max={max} value={Number(r[k] ?? '')} onChange={(e) => setR({ ...r, [k]: Number(e.target.value) })} />
    </div>
  )
  return (
    <Panel className="space-y-4 p-5">
      <h2 className="text-base font-semibold text-foreground">{t('hiring.ldRulesTitle')}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {num('reconnect_window_min', 0, 120)}
        {num('autosave_sec', 5, 120)}
        {num('heartbeat_sec', 5, 60)}
        {num('flag_threshold', 0, 100)}
        {num('min_mbps', 0, 100)}
        <div className="space-y-1.5">
          <Label htmlFor="rule-pass">{td('hiring.ldRule:pass_percent', 'Pass mark (%)')}</Label>
          <Input id="rule-pass" type="number" min={0} max={100} value={r.pass_percent ?? ''} placeholder={t('hiring.ldPassDefault')} onChange={(e) => setR({ ...r, pass_percent: e.target.value === '' ? null : Number(e.target.value) })} />
        </div>
      </div>
      <label className="flex min-h-11 items-center gap-3 text-sm text-foreground">
        <input type="checkbox" className="h-5 w-5 accent-[var(--primary)]" checked={r.require_camera} onChange={(e) => setR({ ...r, require_camera: e.target.checked })} />
        {td('hiring.ldRule:require_camera', 'Camera required')}
      </label>
      <Button className="min-h-11" disabled={busy} onClick={() => void run(`/api/live-drives/${id}`, 'PATCH', { rules: { reconnect_window_min: r.reconnect_window_min, autosave_sec: r.autosave_sec, heartbeat_sec: r.heartbeat_sec, flag_threshold: r.flag_threshold, min_mbps: r.min_mbps, pass_percent: r.pass_percent, require_camera: r.require_camera } }, () => t('hiring.ldSaved'))}>{t('common.save')}</Button>
      <Note />
    </Panel>
  )
}
