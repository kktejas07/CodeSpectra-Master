'use client'

/**
 * My interviews — the interviewer's list (upcoming, to score, past). Recruiters
 * and admins can switch to every interview they can see, including the ones
 * still waiting for a time.
 */
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { CalendarClock, ChevronRight, ClipboardCheck, MapPin, Video } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Panel } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'
import { HiringShell, QueryGate } from '@/components/hiring/shell'
import { Segmented } from '@/components/hiring/ui'
import { useAts } from '@/components/hiring/lib/api'
import { PROVIDER_LABELS } from '@/components/hiring/lib/labels'
import { formatDateTime } from '@/lib/format-datetime'
import type { AtsInterview } from '@/lib/ats/contract'

type Row = Omit<AtsInterview, 'scorecards'> & {
  job_title?: string
  candidate_name?: string
  stage_name?: string
  scorecard_count: number
  my_scorecard_submitted: boolean
  on_panel: boolean
  can_schedule: boolean
  requested_slot?: string | null
}

type Tab = 'upcoming' | 'score' | 'schedule' | 'past'

const STATUS: Record<AtsInterview['status'], { label: string; variant: 'success' | 'warning' | 'outline' | 'secondary' | 'info' }> = {
  awaiting_schedule: { label: 'Needs a time', variant: 'warning' },
  scheduled: { label: 'Scheduled', variant: 'info' },
  completed: { label: 'Completed', variant: 'success' },
  no_show: { label: 'No-show', variant: 'secondary' },
  cancelled: { label: 'Cancelled', variant: 'outline' },
}

export default function MyInterviewsPage() {
  const [scope, setScope] = useState<'mine' | 'all'>('mine')
  const q = useAts<Row[]>(`/api/ats/interviews?scope=${scope}`, 'interviews')
  const [tab, setTab] = useState<Tab>('upcoming')
  const rows = q.data ?? []
  const canSeeAll = rows.some((r) => r.can_schedule) || scope === 'all'

  const now = Date.now()
  const groups = useMemo(() => {
    const end = (r: Row) => (r.scheduled_at ? Date.parse(r.scheduled_at) + r.duration_min * 60_000 : 0)
    return {
      upcoming: rows.filter((r) => r.status === 'scheduled' && end(r) >= now).sort((a, b) => Date.parse(a.scheduled_at!) - Date.parse(b.scheduled_at!)),
      score: rows.filter((r) => r.on_panel && !r.my_scorecard_submitted && (r.status === 'completed' || (r.status === 'scheduled' && r.scheduled_at && Date.parse(r.scheduled_at) <= now))),
      schedule: rows.filter((r) => r.status === 'awaiting_schedule'),
      past: rows.filter((r) => r.status === 'completed' || r.status === 'no_show' || r.status === 'cancelled' || (r.status === 'scheduled' && end(r) < now))
        .sort((a, b) => Date.parse(b.scheduled_at || b.created_at) - Date.parse(a.scheduled_at || a.created_at)),
    }
  }, [rows, now])

  const list = groups[tab]
  const empty: Record<Tab, { title: string; description: string }> = {
    upcoming: { title: 'No upcoming interviews', description: "When you're added to an interview panel, it shows up here with the time and join link." },
    score: { title: 'Nothing to score', description: 'After an interview starts, add your ratings and recommendation here.' },
    schedule: { title: 'Nothing waiting for a time', description: 'Candidates who reach an interview stage appear here until they are booked.' },
    past: { title: 'No past interviews yet', description: 'Finished and cancelled interviews are kept here.' },
  }

  return (
    <HiringShell
      title="Interviews"
      description="Your interviews, what still needs a scorecard, and what is waiting for a time."
      icon={<CalendarClock />}
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Segmented<Tab>
          label="Show"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'upcoming', label: 'Upcoming', count: groups.upcoming.length },
            { value: 'score', label: 'To score', count: groups.score.length },
            { value: 'schedule', label: 'Needs a time', count: groups.schedule.length },
            { value: 'past', label: 'Past', count: groups.past.length },
          ]}
        />
        {canSeeAll && (
          <Segmented<'mine' | 'all'>
            label="Whose interviews"
            value={scope}
            onChange={setScope}
            options={[{ value: 'mine', label: "I'm on the panel" }, { value: 'all', label: 'Everyone' }]}
          />
        )}
      </div>

      <QueryGate loading={q.loading} error={q.error} hasData={!!q.data} onRetry={q.reload} />
      {q.data && (list.length ? (
        <ul className="space-y-3">
          {list.map((r) => (
            <li key={r.id}>
              <Link href={`/dashboard/hiring/interviews/${r.id}`} className="block rounded-3xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Panel interactive className="flex items-center gap-4 p-4 sm:p-5">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                    {r.mode === 'f2f' ? <MapPin className="h-5 w-5" aria-hidden /> : <Video className="h-5 w-5" aria-hidden />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-foreground">{r.candidate_name || 'Candidate'}</p>
                    <p className="truncate text-sm text-muted-foreground">{r.job_title}{r.stage_name ? ` · ${r.stage_name}` : ''}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                      {r.scheduled_at ? formatDateTime(r.scheduled_at) : r.requested_slot ? `Candidate asked for ${formatDateTime(r.requested_slot)}` : 'No time yet'}
                      {' · '}{r.duration_min} min · {r.mode === 'f2f' ? 'In person' : PROVIDER_LABELS[r.provider ?? 'livekit']}
                    </p>
                  </div>
                  <div className="hidden shrink-0 flex-col items-end gap-1 sm:flex">
                    <Badge variant={STATUS[r.status].variant}>{STATUS[r.status].label}</Badge>
                    {r.on_panel && (r.my_scorecard_submitted
                      ? <span className="inline-flex items-center gap-1 text-xs text-green-700 dark:text-green-400"><ClipboardCheck className="h-3.5 w-3.5" aria-hidden /> Scorecard in</span>
                      : r.scorecard_count > 0 ? <span className="text-xs text-muted-foreground">{r.scorecard_count} scorecard{r.scorecard_count === 1 ? '' : 's'} in</span> : null)}
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                </Panel>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState illustration="interview" title={empty[tab].title} description={empty[tab].description} />
      ))}
    </HiringShell>
  )
}
