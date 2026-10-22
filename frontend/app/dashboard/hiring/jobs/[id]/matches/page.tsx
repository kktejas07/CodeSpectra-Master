'use client'

/**
 * Best matches for a job: learners who opted in to talent discovery, ranked
 * by verified skills (weighted by level) and location, with the reasons.
 * Summary only — invite someone to apply (talent invites keep the consent rules).
 */
import { use, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Send, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Panel } from '@/components/app/page-kit'
import { HiringShell, QueryGate } from '@/components/hiring/shell'
import { atsSend, errorMessage, useAts } from '@/components/hiring/lib/api'
import type { MatchResult } from '@/lib/job-match/score'
import { useT } from '@/lib/i18n/client'

interface Row { handle: string; name: string; city: string | null; country: string | null; graduation_year: number | null; availability: string | null; match: MatchResult }

export default function BestMatchesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { t, td } = useT()
  const q = useAts<{ results: Row[]; considered: number }>(`/api/ats/jobs/${encodeURIComponent(id)}/best-matches`)
  const [sent, setSent] = useState<Record<string, 'sending' | 'sent' | string>>({})

  const invite = async (handle: string) => {
    setSent((s) => ({ ...s, [handle]: 'sending' }))
    try {
      await atsSend('/api/ats/talent/invites', 'POST', { handle, target_type: 'job', target_id: id })
      setSent((s) => ({ ...s, [handle]: 'sent' }))
    } catch (e) {
      setSent((s) => ({ ...s, [handle]: errorMessage(e) }))
    }
  }

  return (
    <HiringShell title={t('hiring.jmBestMatches')} description={t('hiring.jmBestMatchesHint')} icon={<Sparkles />}
      actions={<Button variant="outline" asChild className="rounded-full"><Link href={`/dashboard/hiring/jobs/${id}`}><ArrowLeft aria-hidden />{' '}{t('hiring.jmBackToJob')}</Link></Button>}>
      <QueryGate loading={q.loading} error={q.error} hasData={!!q.data} onRetry={q.reload} />
      {q.data && !q.data.results.length ? <EmptyState title={t('hiring.jmNoMatches')} description={t('hiring.jmNoMatchesHint')} /> : null}
      {q.data?.results.length ? (
        <ul className="space-y-4">
          {q.data.results.map((r) => {
            const st = sent[r.handle]
            return (
              <li key={r.handle}>
                <Panel className="space-y-3 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-base font-semibold text-foreground">{r.name}</h2>
                      <p className="text-sm text-muted-foreground">{[r.city, r.country, r.graduation_year ? t('hiring.jmGradYear', { year: r.graduation_year }) : null].filter(Boolean).join(' · ')}</p>
                    </div>
                    <p className="font-mono text-2xl font-semibold tabular-nums text-foreground" aria-label={t('hiring.jmScoreAria', { score: r.match.score })}>{r.match.score}</p>
                  </div>
                  <ul className="flex flex-wrap gap-2" aria-label={t('hiring.jmWhy')}>
                    {r.match.parts.map((p) => (
                      <li key={p.key} className="rounded-full bg-muted px-3 py-1 text-xs text-foreground">{td(`hiring.jmPart:${p.key}`, p.key)} <span className="tabular-nums">{p.score}</span></li>
                    ))}
                  </ul>
                  {r.match.matched.length ? <p className="text-sm text-muted-foreground">{t('hiring.jmVerified')} {r.match.matched.map((m) => `${m.skill} (${td(`hiring.jmLevel:${m.level}`, m.level)})`).join(', ')}</p> : null}
                  {r.match.missing.length ? <p className="text-sm text-muted-foreground">{t('hiring.jmGaps')} {r.match.missing.join(', ')}</p> : null}
                  <div className="flex flex-wrap items-center gap-3">
                    <Button className="min-h-11" disabled={st === 'sending' || st === 'sent'} onClick={() => void invite(r.handle)}><Send className="mr-2 h-4 w-4" aria-hidden />{st === 'sent' ? t('hiring.jmInvited') : t('hiring.jmInviteToApply')}</Button>
                    {st && st !== 'sending' && st !== 'sent' ? <p role="alert" className="text-sm text-destructive">{st}</p> : null}
                  </div>
                </Panel>
              </li>
            )
          })}
        </ul>
      ) : null}
      {q.data ? <p className="mt-4 text-xs tabular-nums text-muted-foreground">{t('hiring.jmConsidered', { count: q.data.considered })}</p> : null}
    </HiringShell>
  )
}
