'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Plus, Search, Loader, Users, HelpCircle } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Input } from '@/components/ui/input'
import { usePageGuard } from '@/lib/use-page-guard'
import { SkeletonStats, SkeletonCard } from '@/components/ui/skeleton-boneyard'
import { PageHeader, Panel, StatCard } from '@/components/app/page-kit'
import { UserCheck, Activity } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'

interface Team {
  id: number
  name: string
  members: number
  admin: string
  status: string
}

export default function TeamsManagement() {
  const gate = usePageGuard('superadmin')

  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')

  useEffect(() => {
    fetch('/api/admin/teams')
      .then(r => r.json())
      .then(json => { if (json.data) setTeams(json.data) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (!gate.ready) return null
  if (loading) return (
    <div className="space-y-6">
      <SkeletonStats />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
    </div>
  )

  const safeTeams = teams || []
  const q = query.trim().toLowerCase()
  const visibleTeams = q
    ? safeTeams.filter(t =>
        [t.name, t.admin, t.status].some(v => String(v ?? '').toLowerCase().includes(q)),
      )
    : safeTeams

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <>
            Teams
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="ml-1.5 inline-block h-4 w-4 cursor-help align-middle text-muted-foreground" aria-label="About teams" />
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p className="text-xs max-w-62.5">Manage organization teams</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </>
        }
        description="Groups of people inside each organization, and who looks after them."
        icon={<Users />}
        actions={
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                {/* span wrapper so the tooltip still works on a disabled button */}
                <span tabIndex={0} className="inline-flex rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Button className="gap-2" disabled aria-describedby="create-team-hint">
                    <Plus className="w-4 h-4" />Create team
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p id="create-team-hint" className="text-xs max-w-62.5">Not available yet. Creating teams from this page isn&apos;t supported.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard label="Teams" value={safeTeams.length} icon={<Users />} />
        <StatCard label="Members" value={safeTeams.reduce((acc, t) => acc + t.members, 0)} icon={<UserCheck />} />
        <StatCard label="Active teams" value={safeTeams.filter(t => t.status === 'active').length} icon={<Activity />} />
      </div>

      {safeTeams.length === 0 ? (
        <EmptyState title="No teams yet" description="Teams created inside an organization will show up here." />
      ) : (
        <Panel>
          <div className="relative mb-6">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden />
            <Input
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by team, admin or status"
              className="pl-9"
              aria-label="Search teams"
            />
          </div>
          {visibleTeams.length === 0 && (
            <EmptyState variant="search" title={`No teams match "${query.trim()}"`} description="Try a team name, admin or status." className="border-0 bg-transparent py-6 md:py-8" />
          )}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {visibleTeams.map(team => (
              <div key={team.id} className="rounded-2xl border border-border/70 bg-card p-4">
                <h3 className="font-semibold text-foreground">{team.name}</h3>
                <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="tabular-nums">{team.members} members</span>
                  <span>Admin: {team.admin}</span>
                </div>
                <span className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${team.status === 'active' ? 'bg-green-500/10 text-green-700 dark:text-green-400' : 'bg-muted text-muted-foreground'}`}>
                  {team.status}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  )
}


