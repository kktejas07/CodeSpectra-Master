'use client'

import { Suspense, use, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Loader2, Mail, Phone, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Panel, Section } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'
import { useToast } from '@/lib/toast-context'
import { HiringShell, QueryGate } from '@/components/hiring/shell'
import { ChipInput, ErrorState, LoadingRows, MatchScore } from '@/components/hiring/ui'
import { ApplicationDetailView } from '@/components/hiring/application-detail'
import { atsSend, errorMessage, useAts } from '@/components/hiring/lib/api'
import { APP_STATUS_LABELS, SOURCE_LABELS, timeAgo } from '@/components/hiring/lib/labels'
import type { ApplicationDetail, CandidateDetail } from '@/components/hiring/lib/types'
import { cn } from '@/lib/utils'

export default function HiringCandidatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return (
    <Suspense fallback={<LoadingRows rows={5} />}>
      <CandidateView id={id} />
    </Suspense>
  )
}

function CandidateView({ id }: { id: string }) {
  const search = useSearchParams()
  const addToast = useToast()
  const cand = useAts<CandidateDetail>(`/api/ats/candidates/${encodeURIComponent(id)}`)
  const apps = cand.data?.applications ?? []
  const [picked, setPicked] = useState<string | null>(search.get('app'))
  const appId = picked && apps.some((a) => a.id === picked) ? picked : apps[0]?.id ?? null
  const detail = useAts<ApplicationDetail>(appId ? `/api/ats/applications/${encodeURIComponent(appId)}` : null)
  const [tags, setTags] = useState<string[] | null>(null)
  const [savingTags, setSavingTags] = useState(false)
  const c = cand.data?.candidate

  const saveTags = async () => {
    if (!tags) return
    setSavingTags(true)
    try {
      await atsSend(`/api/ats/candidates/${encodeURIComponent(id)}`, 'PATCH', { tags })
      addToast({ type: 'success', title: 'Tags saved' })
      cand.setData((d) => (d ? { ...d, candidate: { ...d.candidate, tags } } : d))
      setTags(null)
    } catch (e) {
      addToast({ type: 'error', title: 'Could not save tags', message: errorMessage(e) })
    } finally {
      setSavingTags(false)
    }
  }

  return (
    <HiringShell title={c?.name ?? 'Candidate'} description={c ? `Added ${timeAgo(c.created_at)} via ${SOURCE_LABELS[c.source] ?? c.source}` : undefined} icon={<UserRound />}>
      <QueryGate loading={cand.loading} error={cand.error} hasData={!!cand.data} onRetry={cand.reload} />
      {c && (
        <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
          <div className="space-y-4">
            <Panel className="p-5">
              <Section title="Contact">
                <ul className="space-y-1.5 text-sm">
                  {c.email && <li><a href={`mailto:${c.email}`} className="inline-flex items-center gap-2 text-foreground hover:text-primary"><Mail className="h-4 w-4 text-muted-foreground" aria-hidden />{c.email}</a></li>}
                  {c.phone && <li><a href={`tel:${c.phone}`} className="inline-flex items-center gap-2 text-foreground hover:text-primary"><Phone className="h-4 w-4 text-muted-foreground" aria-hidden />{c.phone}</a></li>}
                </ul>
                <ChipInput label="Tags" value={tags ?? c.tags} onChange={setTags} placeholder="Add a tag" />
                {tags && (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={saveTags} disabled={savingTags}>{savingTags && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />} Save tags</Button>
                    <Button size="sm" variant="ghost" onClick={() => setTags(null)}>Cancel</Button>
                  </div>
                )}
              </Section>
            </Panel>
            <Panel className="p-5">
              <Section title="Applications">
                {apps.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Not in any job yet. Add them from a job&apos;s talent pool.</p>
                ) : (
                  <ul className="space-y-1.5" role="list">
                    {apps.map((a) => (
                      <li key={a.id}>
                        <button
                          type="button"
                          onClick={() => setPicked(a.id)}
                          aria-current={a.id === appId ? 'true' : undefined}
                          className={cn(
                            'flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            a.id === appId ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40',
                          )}
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-foreground">{a.job?.title ?? 'Job'}</span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {a.stage?.name ?? a.stage_id} · {APP_STATUS_LABELS[a.status]}
                            </span>
                          </span>
                          <MatchScore score={a.match?.score} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            </Panel>
          </div>

          <Panel>
            {!appId ? (
              <EmptyState compact illustration="resume" title="No application to show" description="Once they're added to a job, the pipeline, results and timeline appear here." actionLabel="Go to jobs" actionHref="/dashboard/hiring/jobs" />
            ) : detail.error && !detail.data ? (
              <ErrorState compact message={detail.error.message} onRetry={detail.reload} />
            ) : !detail.data || detail.data.application.id !== appId ? (
              <LoadingRows rows={5} />
            ) : (
              <ApplicationDetailView detail={detail.data} onChanged={() => { detail.reload(); cand.reload() }} />
            )}
          </Panel>
        </div>
      )}
      {cand.data && !c && <p className="text-sm text-muted-foreground"><Link href="/dashboard/hiring/candidates" className="text-primary hover:underline">Back to candidates</Link></p>}
    </HiringShell>
  )
}
