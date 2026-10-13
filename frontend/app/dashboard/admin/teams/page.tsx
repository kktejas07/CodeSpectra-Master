'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Plus, Search, Loader, Users, HelpCircle } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Input } from '@/components/ui/input'
import { usePageGuard } from '@/lib/use-page-guard'
import { SkeletonStats, SkeletonCard } from '@/components/ui/skeleton-boneyard'

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Teams Management
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help ml-1 inline-block" />
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p className="text-xs .5">Manage organization teams</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </h1>
        </div>
        <Button className="gap-2"><Plus className="w-4 h-4" />Create Team</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4"><p className="text-sm text-muted-foreground">Total Teams</p><p className="text-3xl font-bold mt-2">{safeTeams.length}</p></Card>
        <Card className="p-4"><p className="text-sm text-muted-foreground">Total Members</p><p className="text-3xl font-bold mt-2">{safeTeams.reduce((acc, t) => acc + t.members, 0)}</p></Card>
        <Card className="p-4"><p className="text-sm text-muted-foreground">Active Teams</p><p className="text-3xl font-bold mt-2">{safeTeams.filter(t => t.status === 'active').length}</p></Card>
      </div>

      {safeTeams.length === 0 ? (
        <Card className="border-border/60 p-10 text-center">
          <Users className="h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-muted-foreground">No teams created yet.</p>
        </Card>
      ) : (
        <Card className="p-6">
          <div className="relative mb-6">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search teams..." className="pl-9" />
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {safeTeams.map(team => (
              <Card key={team.id} className="border-border/60 p-4">
                <h3 className="font-semibold text-foreground">{team.name}</h3>
                <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                  <span>{team.members} members</span>
                  <span>Admin: {team.admin}</span>
                </div>
                <span className={`mt-2 inline-block text-[10px] px-2 py-0.5 rounded-full ${team.status === 'active' ? 'bg-green-500/10 text-green-700' : 'bg-muted text-muted-foreground'}`}>
                  {team.status}
                </span>
              </Card>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}


