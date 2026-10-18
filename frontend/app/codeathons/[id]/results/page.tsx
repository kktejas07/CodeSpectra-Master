'use client'

/**
 * /codeathons/[id]/results — public final results of a released codeathon.
 * Readable signed out; shows names, ranks and points only (never emails).
 * Signed-in participants also see their own placing and certificate link.
 */
import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Award, Medal, Trophy, Users } from 'lucide-react'
import { PageHeader, Panel, StatCard } from '@/components/app/page-kit'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonCard, SkeletonList } from '@/components/ui/skeleton-boneyard'
import { formatDate, formatDateTime } from '@/lib/format-datetime'
import type { CodeathonPublicResults } from '@/components/codeathons/codeathon-results-card'

export default function CodeathonResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [data, setData] = useState<CodeathonPublicResults | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'not-found' | 'error'>('loading')

  const load = useCallback(async () => {
    setState('loading')
    try {
      const res = await fetch(`/api/codeathons/${encodeURIComponent(id)}/results`, { cache: 'no-store', credentials: 'include' })
      if (res.status === 404) { setState('not-found'); return }
      if (!res.ok) throw new Error('failed')
      setData((await res.json()) as CodeathonPublicResults)
      setState('ready')
    } catch {
      setState('error')
    }
  }, [id])

  useEffect(() => { void load() }, [load])

  const shell = (children: React.ReactNode) => (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-10 sm:px-6">{children}</div>
    </main>
  )

  if (state === 'loading') return shell(<><SkeletonCard /><SkeletonList count={5} /></>)
  if (state === 'not-found') {
    return shell(<EmptyState illustration="not-found" title="Results not found" description="This codeathon doesn't exist or has no public results." actionLabel="Browse events" actionHref="/events" />)
  }
  if (state === 'error' || !data) {
    return shell(<EmptyState illustration="error" title="Couldn't load results" description="Check your connection and try again." actionLabel="Try again" onAction={() => void load()} />)
  }
  if (!data.released) {
    return shell(
      <EmptyState
        illustration="locked"
        title="Results aren’t out yet"
        description={`The organisers haven't released results for ${data.codeathon.title}${data.codeathon.endDate ? ` (ends ${formatDate(data.codeathon.endDate)})` : ''}. Participants get a notification when they do.`}
        actionLabel="Back to the codeathon"
        actionHref={`/dashboard/codeathons/${encodeURIComponent(id)}`}
      />,
    )
  }

  const standings = data.standings || []
  const teamMode = data.codeathon.event_type === 'team'
  const me = data.me

  return shell(
    <>
      <Link href={`/dashboard/codeathons/${encodeURIComponent(id)}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Back to the codeathon
      </Link>
      <PageHeader
        icon={<Trophy />}
        illustration="leaderboard"
        title={`${data.codeathon.title} results`}
        description={data.released_at ? `Final results, released ${formatDateTime(data.released_at)}.` : 'Final results.'}
        className="mb-0"
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label={teamMode ? 'Teams ranked' : 'Ranked'} value={data.ranked_count ?? 0} icon={<Medal />} />
        <StatCard label="Took part" value={data.participant_count ?? 0} icon={<Users />} />
        <StatCard label="Top score" value={standings[0]?.total_score ?? 0} icon={<Trophy />} />
      </div>

      {me && (
        <Panel className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Your result</p>
            <p className="text-lg font-semibold text-foreground">
              {me.rank !== null
                ? <>{me.kind === 'team' ? `${me.name}: ` : ''}<span className="tabular-nums">#{me.rank}{me.tied ? ' (tied)' : ''}</span> with <span className="tabular-nums">{me.total_score}</span> points</>
                : 'Not ranked (no points scored)'}
            </p>
          </div>
          {me.certificate_url ? (
            <Button asChild className="gap-2">
              <Link href={me.certificate_url}><Award className="h-4 w-4" aria-hidden="true" /> View certificate</Link>
            </Button>
          ) : me.certificate ? (
            <p className="text-sm text-muted-foreground">Your certificate is being prepared.</p>
          ) : null}
        </Panel>
      )}

      {standings.length === 0 ? (
        <EmptyState illustration="leaderboard" title="No ranked entries" description="Nobody scored points in this codeathon." />
      ) : (
        <Panel className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <caption className="sr-only">Final leaderboard</caption>
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th scope="col" className="px-4 py-3 font-medium">Rank</th>
                <th scope="col" className="px-4 py-3 font-medium">{teamMode ? 'Team' : 'Participant'}</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Points</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Solved</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((s, i) => (
                <tr key={`${s.name}-${i}`} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 tabular-nums">
                    {s.rank !== null
                      ? s.rank <= 3
                        ? <Badge variant={s.rank === 1 ? 'default' : 'secondary'} className="tabular-nums">#{s.rank}{s.tied ? ' tied' : ''}</Badge>
                        : <span>#{s.rank}{s.tied ? ' (tied)' : ''}</span>
                      : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{s.name}</p>
                    {s.members && s.members.length > 0 && <p className="text-xs text-muted-foreground">{s.members.join(', ')}</p>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{s.total_score}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{s.problems_solved}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
      <p className="text-xs text-muted-foreground">Certificates from this codeathon can be checked by anyone from their verify link.</p>
    </>,
  )
}
