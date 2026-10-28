'use client'

/**
 * Live hiring drives — organiser list + create form. A drive is one timed,
 * proctored sitting of a company test for many candidates at once, run by a
 * college placement team or a company hiring team (lib/live-drives).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CalendarClock, Plus, Radio, Users } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { csrfFetch } from '@/lib/csrf-fetch'
import { PageHeader, Panel } from '@/components/app/page-kit'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonList } from '@/components/ui/skeleton-boneyard'
import { useT } from '@/lib/i18n/client'
import { useApiError } from '@/lib/i18n/use-api-error'
import { toLocalDatetimeString } from '@/lib/datetime-local'
import { PRACTICE_LEVELS, type PracticeLevel } from '@/lib/company-tests/types'
import type { EffectiveDriveStatus } from '@/lib/live-drives/types'
import { STATUS_TONE, selectCls } from './ui'

interface Choice { kind: 'college' | 'company'; tenant_id: string; name: string }
interface DriveRow {
  id: string; title: string; role: 'owner' | 'invigilator'; effective_status: EffectiveDriveStatus
  owner: { name: string }; test: { exam_name: string }; schedule: { start_at: string; duration_min: number }; candidate_count: number
}
interface Pattern { id: string; examName: string; companyName: string; totals: { minutes: number }; levels: { level: PracticeLevel; ready: boolean }[] }
interface LinkOption { id: string; title: string }


export default function LiveDrivesPage() {
  const gate = usePageGuard('user')
  const { t, td, fmt } = useT()
  const apiError = useApiError()
  const router = useRouter()
  const [data, setData] = useState<{ choices: Choice[]; drives: DriveRow[] } | null>(null)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    setError('')
    try {
      const r = await fetch('/api/live-drives', { credentials: 'include', cache: 'no-store' })
      const j = await r.json().catch(() => null)
      if (!r.ok) throw new Error(apiError(j))
      setData(j)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('hiring.ldLoadFailed'))
    }
  }, [apiError, t])

  useEffect(() => { if (gate.ready) void load() }, [gate.ready, load])
  if (!gate.ready) return null

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('hiring.ldTitle')}
        description={t('hiring.ldDescription')}
        icon={<Radio />}
        actions={data?.choices.length ? (
          <Button className="min-h-11" onClick={() => setCreating((v) => !v)} aria-expanded={creating}>
            <Plus className="mr-2 h-4 w-4" aria-hidden />{t('hiring.ldNewDrive')}
          </Button>
        ) : null}
      />
      {error ? <p role="alert" className="text-sm text-destructive">{error} <button type="button" className="font-semibold underline" onClick={() => void load()}>{t('common.retry')}</button></p> : null}
      {creating && data ? <CreateForm choices={data.choices} onCreated={(id) => router.push(`/dashboard/live-drives/${id}`)} onCancel={() => setCreating(false)} /> : null}
      {!data && !error ? <SkeletonList /> : null}
      {data && !data.drives.length ? (
        <EmptyState
          illustration="calendar"
          title={t('hiring.ldEmptyTitle')}
          description={data.choices.length ? t('hiring.ldEmptyOwner') : t('hiring.ldEmptyNoTeam')}
        />
      ) : null}
      {data?.drives.length ? (
        <ul className="grid gap-4 md:grid-cols-2">
          {data.drives.map((d) => (
            <li key={d.id}>
              <Link href={`/dashboard/live-drives/${d.id}`} className="block rounded-3xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Panel interactive className="space-y-3 p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_TONE[d.effective_status]}`}>{td(`hiring.ldStatus:${d.effective_status}`, d.effective_status)}</span>
                    <Badge variant="outline">{d.role === 'owner' ? t('hiring.ldRoleOwner') : t('hiring.ldRoleInvigilator')}</Badge>
                  </div>
                  <h2 className="text-lg font-semibold text-foreground">{d.title}</h2>
                  <p className="text-sm text-muted-foreground">{d.owner.name} · {d.test.exam_name}</p>
                  <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5"><CalendarClock className="h-4 w-4" aria-hidden />{fmt.dateTime(d.schedule.start_at)}</span>
                    <span className="inline-flex items-center gap-1.5 tabular-nums"><Users className="h-4 w-4" aria-hidden />{t('hiring.ldCandidatesCount', { count: d.candidate_count })}</span>
                  </div>
                </Panel>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function CreateForm({ choices, onCreated, onCancel }: { choices: Choice[]; onCreated: (id: string) => void; onCancel: () => void }) {
  const { t, td } = useT()
  const apiError = useApiError()
  const [owner, setOwner] = useState(0)
  const [title, setTitle] = useState('')
  const [patterns, setPatterns] = useState<Pattern[]>([])
  const [patternId, setPatternId] = useState('')
  const [level, setLevel] = useState<PracticeLevel>('moderate')
  const [startAt, setStartAt] = useState(() => toLocalDatetimeString(new Date(Date.now() + 24 * 3600_000)))
  const [duration, setDuration] = useState(60)
  const [lobby, setLobby] = useState(30)
  const [lateJoin, setLateJoin] = useState(15)
  const [links, setLinks] = useState<LinkOption[]>([])
  const [linkId, setLinkId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const choice = choices[owner]

  useEffect(() => {
    fetch('/api/company-tests?all=1', { credentials: 'include' })
      .then((r) => r.json())
      .then((j) => setPatterns(Array.isArray(j?.items) ? j.items : []))
      .catch(() => setPatterns([]))
  }, [])

  useEffect(() => {
    if (!choice) return
    setLinkId('')
    const url = choice.kind === 'college' ? `/api/campus/drives?college=${encodeURIComponent(choice.tenant_id)}` : `/api/ats/jobs?tenant=${encodeURIComponent(choice.tenant_id)}`
    fetch(url, { credentials: 'include' })
      .then((r) => r.json())
      .then((j) => {
        const rows = (choice.kind === 'college' ? j?.items : j?.jobs) as Array<{ id: string; title: string }> | undefined
        setLinks(Array.isArray(rows) ? rows.map((r) => ({ id: r.id, title: r.title })) : [])
      })
      .catch(() => setLinks([]))
  }, [choice])

  const pattern = useMemo(() => patterns.find((p) => p.id === patternId), [patterns, patternId])
  useEffect(() => { if (pattern) setDuration(Math.max(5, pattern.totals.minutes)) }, [pattern])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!choice) return
    setBusy(true)
    setError('')
    try {
      const r = await csrfFetch('/api/live-drives', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title, owner_kind: choice.kind, tenant_id: choice.tenant_id, pattern_id: patternId, level,
          schedule: { start_at: new Date(startAt).toISOString(), duration_min: duration, lobby_open_min: lobby, late_join_min: lateJoin },
          ...(linkId ? (choice.kind === 'college' ? { campus_drive_id: linkId } : { ats_job_id: linkId }) : {}),
        }),
      })
      const j = await r.json().catch(() => null)
      if (!r.ok) throw new Error(apiError(j))
      onCreated(j.drive.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('hiring.ldCreateFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel className="p-5">
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <h2 className="text-lg font-semibold text-foreground sm:col-span-2">{t('hiring.ldNewDrive')}</h2>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="ld-title">{t('hiring.ldFieldTitle')}</Label>
          <Input id="ld-title" required minLength={3} maxLength={160} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('hiring.ldFieldTitlePlaceholder')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ld-owner">{t('hiring.ldFieldRunBy')}</Label>
          <select id="ld-owner" className={selectCls} value={owner} onChange={(e) => setOwner(Number(e.target.value))}>
            {choices.map((c, i) => <option key={`${c.kind}:${c.tenant_id}`} value={i}>{c.name} · {c.kind === 'college' ? t('hiring.ldKindCollege') : t('hiring.ldKindCompany')}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ld-link">{choice?.kind === 'college' ? t('hiring.ldFieldCampusDrive') : t('hiring.ldFieldJob')}</Label>
          <select id="ld-link" className={selectCls} value={linkId} onChange={(e) => setLinkId(e.target.value)}>
            <option value="">{t('hiring.ldNoLink')}</option>
            {links.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ld-test">{t('hiring.ldFieldTest')}</Label>
          <select id="ld-test" required className={selectCls} value={patternId} onChange={(e) => setPatternId(e.target.value)}>
            <option value="">{t('hiring.ldPickTest')}</option>
            {patterns.map((p) => <option key={p.id} value={p.id}>{p.companyName} · {p.examName}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ld-level">{t('hiring.ldFieldLevel')}</Label>
          <select id="ld-level" className={selectCls} value={level} onChange={(e) => setLevel(e.target.value as PracticeLevel)}>
            {PRACTICE_LEVELS.map((l) => {
              const ready = pattern?.levels.find((x) => x.level === l)?.ready ?? true
              return <option key={l} value={l} disabled={!ready}>{td(`dashboard.practiceLevel:${l}`, l)}{ready ? '' : ` · ${t('hiring.ldLevelNotReady')}`}</option>
            })}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ld-start">{t('hiring.ldFieldStart')}</Label>
          <Input id="ld-start" type="datetime-local" required value={startAt} onChange={(e) => setStartAt(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ld-duration">{t('hiring.ldFieldDuration')}</Label>
          <Input id="ld-duration" type="number" min={5} max={600} required value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ld-lobby">{t('hiring.ldFieldLobby')}</Label>
          <Input id="ld-lobby" type="number" min={0} max={240} value={lobby} onChange={(e) => setLobby(Number(e.target.value))} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ld-late">{t('hiring.ldFieldLateJoin')}</Label>
          <Input id="ld-late" type="number" min={0} max={120} value={lateJoin} onChange={(e) => setLateJoin(Number(e.target.value))} />
        </div>
        {error ? <p role="alert" className="text-sm text-destructive sm:col-span-2">{error}</p> : null}
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Button type="submit" className="min-h-11" disabled={busy || !patternId || title.trim().length < 3}>{busy ? t('common.saving') : t('hiring.ldCreateDraft')}</Button>
          <Button type="button" variant="outline" className="min-h-11" onClick={onCancel}>{t('common.cancel')}</Button>
        </div>
      </form>
    </Panel>
  )
}
