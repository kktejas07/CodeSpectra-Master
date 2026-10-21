'use client'

/**
 * Interview detail: when/where + join, candidate summary, scheduling and panel
 * (recruiters), scorecard (panel members) and panel feedback.
 */
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { AlertTriangle, ArrowLeft, CalendarClock, ExternalLink, MapPin, Video } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Panel } from '@/components/app/page-kit'
import { HiringShell, QueryGate } from '@/components/hiring/shell'
import { MatchScore } from '@/components/hiring/ui'
import { useAts } from '@/components/hiring/lib/api'
import { PROVIDER_LABELS } from '@/components/hiring/lib/labels'
import { useLocaleDates } from '@/lib/i18n/use-dates'
import { PanelEditor, SchedulePanel, ScorecardForm, ScorecardList } from './sections'
import type { InterviewDetail } from './types'
import { useT } from '@/lib/i18n/client'
import type { Translator } from '@/lib/i18n/catalog'

const STATUS_LABEL = (t: Translator) => ({
  awaiting_schedule: t('hiring.needsATime'),
  scheduled: t('hiring.scheduled'),
  completed: t('hiring.completed'),
  no_show: t('hiring.noShow'),
  cancelled: t('hiring.cancelled'),
} as const)

export default function InterviewDetailPage() {
  const { formatDateTime } = useLocaleDates()
  const { t } = useT()
  const { id = '' } = useParams<{ id: string }>()
  const q = useAts<InterviewDetail>(`/api/ats/interviews/${encodeURIComponent(id)}`)
  const d = q.data
  const iv = d?.interview

  const now = Date.now()
  const start = iv?.scheduled_at ? Date.parse(iv.scheduled_at) : null
  const joinable = !!iv && iv.status === 'scheduled' && iv.mode === 'virtual' && start !== null && now >= start - 15 * 60_000 && now <= start + (iv.duration_min + 60) * 60_000
  const builtin = iv?.mode === 'virtual' && (iv.provider ?? 'livekit') === 'livekit'

  const joinButton = iv && iv.status === 'scheduled' && iv.mode === 'virtual' && (d?.me.on_panel || d?.me.can_schedule) ? (
    builtin ? (
      <Button asChild className="min-h-11 rounded-full px-5" variant={joinable ? 'default' : 'outline'}>
        <Link href={`/dashboard/hiring/interviews/${encodeURIComponent(iv.id)}/live`}><Video aria-hidden /> {joinable ? t('hiring.joinInterview') : t('hiring.openRoom')}</Link>
      </Button>
    ) : iv.join_url ? (
      <Button asChild className="min-h-11 rounded-full px-5">
        <a href={iv.host_url && d?.me.can_schedule && iv.provider === 'zoom' ? iv.host_url : iv.join_url} target="_blank" rel="noopener noreferrer">
          <Video aria-hidden />{' '}{t('hiring.joinOnValue', { value: PROVIDER_LABELS[iv.provider ?? 'manual'] })}{' '}<ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
      </Button>
    ) : null
  ) : null

  return (
    <HiringShell
      title={iv ? iv.candidate_name || d?.candidate?.name || t('hiring.interview') : t('hiring.interview')}
      description={iv ? `${iv.job_title || d?.job?.title || ''}${iv.stage_name ? ` · ${iv.stage_name}` : ''}` : undefined}
      icon={<CalendarClock />}
      actions={joinButton}
    >
      <Link href="/dashboard/hiring/interviews" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />{' '}{t('hiring.allInterviews')}</Link>
      <QueryGate loading={q.loading} error={q.error} hasData={!!d} onRetry={q.reload} />
      {d && iv && (
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            <Panel className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={iv.status === 'scheduled' ? 'info' : iv.status === 'completed' ? 'success' : iv.status === 'awaiting_schedule' ? 'warning' : 'outline'}>{STATUS_LABEL(t)[iv.status]}</Badge>
                <span className="text-sm text-muted-foreground">{t('hiring.durationMinMinutesValue', { duration_min: iv.duration_min, value: iv.mode === 'f2f' ? t('hiring.inPerson') : PROVIDER_LABELS[iv.provider ?? 'livekit'] })}</span>
              </div>
              <p className="text-xl font-semibold tabular-nums text-foreground">
                {iv.scheduled_at ? formatDateTime(iv.scheduled_at, iv.timezone) : t('hiring.noTimeBookedYet')}
                {iv.scheduled_at && iv.timezone && <span className="ml-2 text-sm font-normal text-muted-foreground">{iv.timezone}</span>}
              </p>
              {iv.mode === 'f2f' && (iv.location_details?.address || iv.location) && (
                <div className="flex items-start gap-2 text-sm text-foreground">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div>
                    <p>{iv.location_details?.address || iv.location}{iv.location_details?.room ? ` · ${iv.location_details.room}` : ''}</p>
                    {iv.location_details?.map_url && <a href={iv.location_details.map_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{t('hiring.openMap')}</a>}
                    {iv.location_details?.instructions && <p className="text-muted-foreground">{iv.location_details.instructions}</p>}
                  </div>
                </div>
              )}
              <p className="text-sm text-muted-foreground">{t('hiring.panel')}{' '}{iv.panel.map((p) => p.name || p.email).join(', ') || t('hiring.nobodyYet')}</p>
              {builtin && iv.status === 'scheduled' && !joinable && <p className="text-sm text-muted-foreground">{t('hiring.theRoomOpens15MinutesBefore49e')}</p>}
              {iv.last_error && d.me.can_schedule && (
                <p className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {iv.last_error}
                </p>
              )}
            </Panel>

            {d.me.can_schedule && <SchedulePanel key={`${iv.updated_at}-s`} d={d} onChanged={q.reload} />}
            {d.me.can_schedule && <PanelEditor key={`${iv.updated_at}-p`} d={d} onChanged={q.reload} />}
            {d.me.can_score && <ScorecardForm key={`${iv.updated_at}-f`} d={d} onChanged={q.reload} />}
            <ScorecardList d={d} />
          </div>

          <aside className="space-y-5">
            <Panel className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-foreground">{t('hiring.candidate')}</h2>
                {d.application?.match && <MatchScore score={d.application.match.score} />}
              </div>
              {d.candidate ? (
                <>
                  <p className="font-medium text-foreground">{d.candidate.name}</p>
                  {(d.candidate.email || d.candidate.phone) && <p className="break-all text-sm text-muted-foreground">{[d.candidate.email, d.candidate.phone].filter(Boolean).join(' · ')}</p>}
                  {d.candidate.parsed?.titles?.length ? <p className="text-sm text-muted-foreground">{d.candidate.parsed.titles.slice(0, 2).join(' · ')}{d.candidate.parsed.total_years != null ? t('hiring.totalYearsYrs', { total_years: d.candidate.parsed.total_years }) : ''}</p> : null}
                  {d.candidate.parsed?.summary && <p className="text-sm text-foreground">{d.candidate.parsed.summary}</p>}
                  {!!d.candidate.parsed?.skills?.length && (
                    <ul className="flex flex-wrap gap-1.5" aria-label={t('hiring.skills')}>
                      {d.candidate.parsed.skills.slice(0, 20).map((s) => <li key={s} className="rounded-full bg-muted px-2 py-0.5 text-xs text-foreground">{s}</li>)}
                    </ul>
                  )}
                  {d.candidate.resume?.text && (
                    <details className="rounded-xl border border-border p-3 text-sm">
                      <summary className="cursor-pointer font-medium text-foreground">{t('hiring.rSum')}{d.candidate.resume.file_name ? ` (${d.candidate.resume.file_name})` : ''}</summary>
                      <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap font-sans text-xs leading-relaxed text-muted-foreground">{d.candidate.resume.text}</pre>
                    </details>
                  )}
                </>
              ) : <p className="text-sm text-muted-foreground">{t('hiring.candidateDetailsAreNotAvailable')}</p>}
              {d.me.can_schedule && d.candidate && (
                <Link href={`/dashboard/hiring/candidates/${encodeURIComponent(d.candidate.id)}`} className="inline-block text-sm text-primary hover:underline">{t('hiring.openCandidate')}</Link>
              )}
            </Panel>
            {!!d.application?.results.length && d.me.role !== 'interviewer' && (
              <Panel className="space-y-2">
                <h2 className="text-lg font-semibold text-foreground">{t('hiring.earlierSteps')}</h2>
                <ul className="space-y-2 text-sm">
                  {d.application.results.map((r) => (
                    <li key={`${r.stage_id}-${r.at}`} className="flex items-start justify-between gap-2">
                      <span className="text-foreground">{d.job?.stages.find((s) => s.id === r.stage_id)?.name || r.stage_id}</span>
                      <span className={r.outcome === 'pass' ? 'text-green-700 dark:text-green-400' : r.outcome === 'fail' ? 'text-red-700 dark:text-red-400' : 'text-muted-foreground'}>
                        {r.outcome}{r.score != null ? ` · ${r.score}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}
          </aside>
        </div>
      )}
    </HiringShell>
  )
}
