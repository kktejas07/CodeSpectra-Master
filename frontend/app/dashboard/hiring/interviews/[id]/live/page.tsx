'use client'

/** Built-in video room for the interview panel (session-authorised token). */
import { useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { usePageGuard } from '@/lib/use-page-guard'
import { csrfFetch } from '@/lib/csrf-fetch'
import { LiveRoom } from '@/app/interview/_components/live-room'
import { useT } from '@/lib/i18n/client'

export default function PanelLiveRoomPage() {
  const { t } = useT()
  const gate = usePageGuard('user')
  const { id = '' } = useParams<{ id: string }>()
  const router = useRouter()
  const getToken = useCallback(async () => {
    const r = await csrfFetch(`/api/ats/interviews/${encodeURIComponent(id)}/live/token`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.error || t('hiring.couldNotJoinTheRoom'))
    return { token: j.token as string, url: j.url as string }
  }, [id])
  if (!gate.ready) return null
  return <LiveRoom getToken={getToken} title={t('hiring.interviewRoom')} onLeave={() => router.push(`/dashboard/hiring/interviews/${encodeURIComponent(id)}`)} />
}
