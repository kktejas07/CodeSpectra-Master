'use client'

/** Your live hiring drives (as a candidate): when they start and, once published, your result. */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CalendarClock, Radio } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { PageHeader, Panel } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonList } from '@/components/ui/skeleton-boneyard'
import { useT } from '@/lib/i18n/client'
import { useApiError } from '@/lib/i18n/use-api-error'

interface Row {
  id: string; title: string; organiser: string; exam_name: string; start_at: string; duration_min: number
  status: 'scheduled' | 'live' | 'ended' | 'draft'; join: string; state: string; result: { percent: number; passed: boolean } | null
}

export default function MyDrivesPage() {
  const gate = usePageGuard('user')
  const { t, td, fmt } = useT()
  const apiError = useApiError()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!gate.ready) return
    fetch('/api/live-drives/mine', { credentials: 'include', cache: 'no-store' })
      .then(async (r) => { const j = await r.json().catch(() => null); if (!r.ok) throw new Error(apiError(j)); setRows(j.drives) })
      .catch((e) => setError(e instanceof Error ? e.message : t('career.ldLoadFailed')))
  }, [gate.ready, apiError, t])

  if (!gate.ready) return null
  return (
    <div className="space-y-6">
      <PageHeader title={t('career.ldMyDrives')} description={t('career.ldMyDrivesHint')} icon={<Radio />} />
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {!rows && !error ? <SkeletonList /> : null}
      {rows && !rows.length ? <EmptyState illustration="calendar" title={t('career.ldNoDrives')} description={t('career.ldNoDrivesHint')} /> : null}
      {rows?.length ? (
        <ul className="grid gap-4 md:grid-cols-2">
          {rows.map((d) => (
            <li key={d.id}>
              <Link href={`/dashboard/drives/${d.id}`} className="block rounded-3xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Panel interactive className="space-y-2 p-5">
                  <p className="text-xs text-muted-foreground">{d.organiser}</p>
                  <h2 className="text-lg font-semibold text-foreground">{d.title}</h2>
                  <p className="text-sm text-muted-foreground">{d.exam_name} · {t('career.ldMinutes', { count: d.duration_min })}</p>
                  <p className="inline-flex items-center gap-1.5 text-sm text-muted-foreground"><CalendarClock className="h-4 w-4" aria-hidden />{fmt.dateTime(d.start_at)}</p>
                  <p className="text-sm font-medium text-foreground">
                    {d.result
                      ? t('career.ldResultLine', { percent: d.result.percent, verdict: d.result.passed ? t('career.ldCleared') : t('career.ldNotCleared') })
                      : td(`career.ldMyState:${d.state}`, d.state)}
                  </p>
                </Panel>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
