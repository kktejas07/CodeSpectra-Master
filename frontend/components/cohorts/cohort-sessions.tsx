'use client'

/** Live sessions: join (built-in video or the meeting link; attendance is recorded), calendar file, recordings. */
import { useCallback, useState } from 'react'
import { CalendarPlus, PlayCircle, Video } from 'lucide-react'
import { useT } from '@/lib/i18n/client'
import { useToast } from '@/lib/toast-context'
import { Panel } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { LiveRoom } from '@/app/interview/_components/live-room'
import { call, useErrorText } from '@/components/community/client-api'
import type { CohortView } from './types'

export function CohortSessions({ view, onChange }: { view: CohortView; onChange: () => void }) {
  const { t, td, fmt } = useT()
  const toast = useToast()
  const errText = useErrorText()
  const [room, setRoom] = useState<{ id: string; title: string } | null>(null)
  const member = !!view.my || view.can_manage
  const cohortId = view.cohort.id

  const join = async (s: CohortView['sessions'][number]) => {
    try {
      if (s.provider === 'livekit') { setRoom({ id: s.id, title: s.title }); return }
      const r = await call<{ join_url: string }>(`/api/cohorts/${cohortId}/sessions/${s.id}/join`, { body: {} })
      window.open(r.join_url, '_blank', 'noopener,noreferrer')
      onChange()
    } catch (e) { toast({ type: 'error', title: errText(e) }) }
  }

  const getToken = useCallback(async () => {
    const r = await call<{ token: string; url: string }>(`/api/cohorts/${cohortId}/sessions/${room!.id}/join`, { body: {} })
    return { token: r.token, url: r.url }
  }, [cohortId, room])

  if (room) return <LiveRoom getToken={getToken} title={room.title} onLeave={() => { setRoom(null); onChange() }} />

  const now = Date.now()
  const upcoming = view.sessions.filter((s) => Date.parse(s.starts_at) + s.duration_min * 60_000 >= now)
  const past = view.sessions.filter((s) => Date.parse(s.starts_at) + s.duration_min * 60_000 < now)

  if (!view.sessions.length) return <EmptyState compact title={t('community.noSessions')} description={view.is_staff ? t('community.noSessionsStaff') : t('community.noSessionsHint')} />

  const row = (s: CohortView['sessions'][number]) => (
    <li key={s.id} className="flex flex-col gap-3 rounded-2xl border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <p className="font-medium text-foreground">{s.title}</p>
        <p className="text-sm text-muted-foreground"><span className="tabular-nums">{fmt.dateTime(s.starts_at, view.cohort.timezone)}</span> · {t('community.minutesShort', { n: s.duration_min })} · {td(`community.provider_${s.provider}`, s.provider)}</p>
        {s.status === 'cancelled' && <Badge variant="danger">{t('community.cancelled')}</Badge>}
      </div>
      <div className="flex flex-wrap gap-2">
        {s.recording_url && <Button asChild variant="outline" className="min-h-[44px] rounded-full"><a href={s.recording_url} target="_blank" rel="noopener noreferrer"><PlayCircle className="h-4 w-4" aria-hidden />{t('community.recording')}</a></Button>}
        {member && s.status === 'scheduled' && Date.parse(s.starts_at) + s.duration_min * 60_000 >= now && (
          <Button className="min-h-[44px] rounded-full" disabled={!s.can_join} onClick={() => join(s)}><Video className="h-4 w-4" aria-hidden />{s.can_join ? t('community.joinSession') : t('community.opensSoon')}</Button>
        )}
      </div>
    </li>
  )

  return (
    <div className="space-y-4">
      {member && (
        <div className="flex justify-end">
          <Button asChild variant="outline" className="min-h-[44px] rounded-full"><a href={`/api/cohorts/${cohortId}/calendar`}><CalendarPlus className="h-4 w-4" aria-hidden />{t('community.addToCalendar')}</a></Button>
        </div>
      )}
      <Panel className="space-y-3 p-5">
        <h2 className="text-lg font-semibold text-foreground">{t('community.upcoming')}</h2>
        {upcoming.length ? <ul className="space-y-2">{upcoming.map(row)}</ul> : <p className="text-sm text-muted-foreground">{t('community.noUpcoming')}</p>}
      </Panel>
      {past.length > 0 && (
        <Panel className="space-y-3 p-5">
          <h2 className="text-lg font-semibold text-foreground">{t('community.pastSessions')}</h2>
          <ul className="space-y-2">{past.map(row)}</ul>
        </Panel>
      )}
    </div>
  )
}
