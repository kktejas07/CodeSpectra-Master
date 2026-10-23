'use client'

/** No-shows after joining closed: add them to another upcoming drive in one click (W15-AUTO-06). */
import { useCallback, useEffect, useState } from 'react'
import { UserX } from 'lucide-react'
import { csrfFetch } from '@/lib/csrf-fetch'
import { Panel } from '@/components/app/page-kit'
import { Button } from '@/components/ui/button'
import { useT } from '@/lib/i18n/client'
import { useApiError } from '@/lib/i18n/use-api-error'
import { selectCls } from '../ui'

interface Target { id: string; title: string; starts_at: string | null }

export function NoShowsPanel({ id }: { id: string }) {
  const { t, fmt } = useT()
  const apiError = useApiError()
  const [count, setCount] = useState(0)
  const [targets, setTargets] = useState<Target[]>([])
  const [target, setTarget] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    const r = await fetch(`/api/live-drives/${id}/no-shows`, { credentials: 'include', cache: 'no-store' })
    const j = await r.json().catch(() => null)
    if (!r.ok) return
    setCount(Number(j.count) || 0)
    setTargets(Array.isArray(j.targets) ? j.targets : [])
    setTarget((cur) => cur || (j.targets?.[0]?.id ?? ''))
  }, [id])
  useEffect(() => { void load() }, [load])

  if (!count) return null

  const move = async () => {
    setBusy(true)
    setNote(null)
    try {
      const r = await csrfFetch(`/api/live-drives/${id}/no-shows`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target_drive_id: target }) })
      const j = await r.json().catch(() => null)
      if (!r.ok) throw new Error(apiError(j))
      setNote({ ok: true, text: t('hiring.ldNoShowsMoved', { added: j.added ?? 0, already: j.already ?? 0 }) })
    } catch (e) {
      setNote({ ok: false, text: e instanceof Error ? e.message : t('hiring.ldActionFailed') })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel className="space-y-3 p-4" data-testid="drive-no-shows">
      <div className="flex items-start gap-3">
        <UserX className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">{t('hiring.ldNoShowsTitle', { count })}</h2>
          <p className="text-xs text-muted-foreground">{t('hiring.ldNoShowsHelp')}</p>
        </div>
      </div>
      {targets.length ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1">
            <label htmlFor="no-show-target" className="text-xs font-medium text-muted-foreground">{t('hiring.ldNoShowsTarget')}</label>
            <select id="no-show-target" className={selectCls} value={target} onChange={(e) => setTarget(e.target.value)}>
              {targets.map((d) => <option key={d.id} value={d.id}>{d.title}{d.starts_at ? ` — ${fmt.dateTime(d.starts_at)}` : ''}</option>)}
            </select>
          </div>
          <Button disabled={busy || !target} onClick={() => void move()}>{t('hiring.ldNoShowsMove', { count })}</Button>
        </div>
      ) : <p className="text-xs text-muted-foreground">{t('hiring.ldNoShowsNoTarget')}</p>}
      {note ? <p role={note.ok ? 'status' : 'alert'} className={note.ok ? 'text-sm text-foreground' : 'text-sm text-destructive'}>{note.text}</p> : null}
    </Panel>
  )
}
