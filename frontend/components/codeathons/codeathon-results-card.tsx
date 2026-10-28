'use client'

/**
 * Candidate-facing "results are out" card for a codeathon. Renders nothing
 * until the organiser releases results; then shows the viewer's own placing
 * (when signed in and they took part), their certificate link and a link to
 * the public results page. Data: GET /api/codeathons/[id]/results.
 *
 * Mount it on the participant page, e.g. near the top of
 * app/dashboard/codeathons/[id]/page.tsx:  <CodeathonResultsCard codeathonId={id} />
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Award, ExternalLink, Trophy } from 'lucide-react'
import { Panel } from '@/components/app/page-kit'
import { Button } from '@/components/ui/button'

export interface CodeathonMyResult {
  name: string
  kind: 'user' | 'team'
  rank: number | null
  tied: boolean
  total_score: number
  problems_solved: number
  certificate: 'rank' | 'participation' | null
  certificate_url: string | null
}

export interface CodeathonPublicResults {
  released: boolean
  codeathon: { id: string; title: string; description?: string; startDate?: string | null; endDate?: string | null; event_type?: 'individual' | 'team' }
  released_at?: string
  ranked_count?: number
  participant_count?: number
  standings?: Array<{ rank: number | null; tied: boolean; name: string; kind: 'user' | 'team'; total_score: number; problems_solved: number; members?: string[] }>
  me?: CodeathonMyResult | null
}

export function CodeathonResultsCard({ codeathonId, className }: { codeathonId: string; className?: string }) {
  const [data, setData] = useState<CodeathonPublicResults | null>(null)

  useEffect(() => {
    if (!codeathonId) return
    let cancelled = false
    fetch(`/api/codeathons/${encodeURIComponent(codeathonId)}/results`, { cache: 'no-store', credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelled) setData(j && j.released ? (j as CodeathonPublicResults) : null) })
      .catch(() => { if (!cancelled) setData(null) })
    return () => { cancelled = true }
  }, [codeathonId])

  if (!data?.released) return null
  const me = data.me
  const resultsHref = `/codeathons/${encodeURIComponent(codeathonId)}/results`

  return (
    <Panel className={className}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
            <Trophy className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Results are out</h2>
            <p className="text-sm text-muted-foreground">
              {me
                ? me.rank !== null
                  ? <>{me.kind === 'team' ? `Your team "${me.name}" ranked` : 'You ranked'} <span className="font-semibold text-foreground tabular-nums">#{me.rank}{me.tied ? ' (tied)' : ''}</span> of <span className="tabular-nums">{data.ranked_count}</span> with <span className="tabular-nums">{me.total_score}</span> points.</>
                  : 'Thanks for taking part. You weren’t ranked this time (no points scored).'
                : 'The final leaderboard is public.'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {me?.certificate_url && (
            <Button asChild className="gap-2">
              <Link href={me.certificate_url}><Award className="h-4 w-4" aria-hidden="true" /> View certificate</Link>
            </Button>
          )}
          <Button asChild variant="outline" className="gap-2">
            <Link href={resultsHref}>Full results <ExternalLink className="h-4 w-4" aria-hidden="true" /></Link>
          </Button>
        </div>
      </div>
    </Panel>
  )
}
