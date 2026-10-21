'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Search, Users } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/empty-state'
import { HiringShell, QueryGate } from '@/components/hiring/shell'
import { NativeSelect } from '@/components/hiring/ui'
import { useAts } from '@/components/hiring/lib/api'
import { SOURCE_LABELS, initials, timeAgo } from '@/components/hiring/lib/labels'
import type { CandidateListItem } from '@/components/hiring/lib/types'
import type { CandidateSource } from '@/lib/ats/contract'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n/client'

export default function HiringCandidatesPage() {
  const { t: tr } = useT()
  const [q, setQ] = useState('')
  const [debounced, setDebounced] = useState('')
  const [source, setSource] = useState('')
  const [tag, setTag] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300)
    return () => clearTimeout(t)
  }, [q])
  const params = new URLSearchParams()
  if (debounced) params.set('q', debounced)
  if (tag) params.set('tag', tag)
  params.set('limit', '200')
  const query = useAts<CandidateListItem[]>(`/api/ats/candidates?${params}`, 'candidates')

  const list = useMemo(
    () => (query.data ?? []).filter((c) => (!source || c.source === source) && (!tag || c.tags.includes(tag))),
    [query.data, source, tag],
  )
  const allTags = useMemo(() => [...new Set((query.data ?? []).flatMap((c) => c.tags))].sort().slice(0, 50), [query.data])
  const filtered = !!(debounced || source || tag)

  return (
    <HiringShell title={tr('hiring.candidates')} description={tr('hiring.everyoneInYourOrganisationsTalentPool475')} icon={<Users />}>
      <div className="mb-5 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('hiring.searchNameEmailPhoneOrSkill')} aria-label={tr('hiring.searchCandidates')} className="pl-9" />
        </div>
        <NativeSelect aria-label={tr('hiring.filterBySource')} value={source} onChange={setSource} placeholder={tr('hiring.anySource')} className="sm:w-44" options={Object.entries(SOURCE_LABELS).map(([value, label]) => ({ value, label }))} />
        {allTags.length > 0 && (
          <NativeSelect aria-label={tr('hiring.filterByTag')} value={tag} onChange={setTag} placeholder={tr('hiring.anyTag')} className="sm:w-44" options={allTags.map((t) => ({ value: t, label: t }))} />
        )}
      </div>

      <QueryGate loading={query.loading} error={query.error} hasData={!!query.data} onRetry={query.reload} />
      {query.data && (
        list.length === 0 ? (
          filtered ? (
            <EmptyState variant="search" title={tr('hiring.noCandidatesMatch')} description={tr('hiring.tryADifferentNameSkillTagee4')} actionLabel={tr('hiring.clearFilters')} onAction={() => { setQ(''); setSource(''); setTag('') }} />
          ) : (
            <EmptyState scene="candidate-desk" title={tr('hiring.noCandidatesYet')} description={tr('hiring.candidatesAppearHereAsTheyApply03b')} actionLabel={tr('hiring.goToJobs')} actionHref="/dashboard/hiring/jobs" />
          )
        ) : (
          <div className={cn('overflow-x-auto rounded-2xl border border-border/70', query.loading && 'opacity-70')}>
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium">{tr('hiring.candidate')}</th>
                  <th scope="col" className="px-4 py-2 font-medium">{tr('hiring.skills')}</th>
                  <th scope="col" className="px-4 py-2 font-medium">{tr('hiring.tags')}</th>
                  <th scope="col" className="px-4 py-2 font-medium">{tr('hiring.source')}</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">{tr('hiring.added')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {list.map((c) => (
                  <tr key={c.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{initials(c.name)}</span>
                        <div className="min-w-0">
                          <Link href={`/dashboard/hiring/candidates/${c.id}`} className="block truncate font-medium text-foreground hover:text-primary">{c.name || tr('hiring.unnamedCandidate')}</Link>
                          <p className="truncate text-xs text-muted-foreground">{c.email || c.phone}</p>
                        </div>
                      </div>
                    </td>
                    <td className="max-w-[16rem] truncate px-4 py-3 text-muted-foreground">{c.parsed?.skills?.slice(0, 5).join(', ') || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {c.tags.slice(0, 3).map((t) => (
                          <button key={t} type="button" onClick={() => setTag(t)} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground">{t}</button>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{SOURCE_LABELS[c.source as CandidateSource] ?? c.source}</td>
                    <td className="px-4 py-3 text-right text-xs text-muted-foreground">{timeAgo(c.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </HiringShell>
  )
}
