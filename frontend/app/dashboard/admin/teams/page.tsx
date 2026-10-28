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
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useToast } from '@/lib/toast-context'
import { useAdminT } from '@/lib/i18n/admin'

interface Tenant {
  id: string
  name: string
}

interface Team {
  id: string
  name: string
  members: number
  admin: string
  status: string
}

export default function TeamsManagement() {
  const { t: ta } = useAdminT()
  const gate = usePageGuard('superadmin')

  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const addToast = useToast()

  const [createOpen, setCreateOpen] = useState(false)
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [tenantsLoaded, setTenantsLoaded] = useState(false)
  const [formName, setFormName] = useState('')
  const [formTenant, setFormTenant] = useState('')
  const [formAdmin, setFormAdmin] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const [loadError, setLoadError] = useState(false)

  const loadTeams = () =>
    fetch('/api/admin/teams')
      .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json() })
      .then(json => { if (json.data) setTeams(json.data); setLoadError(false) })
      .catch(() => setLoadError(true))

  useEffect(() => {
    loadTeams().finally(() => setLoading(false))
  }, [])

  const openCreate = () => {
    setFormName(''); setFormTenant(''); setFormAdmin(''); setFormError(null)
    setCreateOpen(true)
    if (!tenantsLoaded) {
      fetch('/api/admin/tenants')
        .then(r => r.json())
        .then(json => {
          if (Array.isArray(json.data)) setTenants(json.data.map((t: Tenant) => ({ id: t.id, name: t.name })))
        })
        .catch(() => {})
        .finally(() => setTenantsLoaded(true))
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    if (formName.trim().length < 2) { setFormError('Enter a team name of at least 2 characters.'); return }
    if (!formTenant) { setFormError('Choose an organisation.'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formAdmin.trim())) { setFormError('Enter a valid admin email.'); return }
    setCreating(true)
    try {
      const res = await csrfFetch('/api/admin/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: formName.trim(), tenantId: formTenant, adminEmail: formAdmin.trim() }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setFormError(json.error || 'Could not create the team.'); return }
      addToast({ title: 'Team created', type: 'success' })
      setCreateOpen(false)
      await loadTeams()
    } catch {
      setFormError('Could not create the team. Check your connection and try again.')
    } finally {
      setCreating(false)
    }
  }

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
        illustration="team"
        title={
          <>
            {ta('teamsAdm.teams')}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="ml-1.5 inline-block h-4 w-4 cursor-help align-middle text-muted-foreground" aria-label={ta('teamsAdm.aboutTeams')} />
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p className="text-xs max-w-62.5">{ta('teamsAdm.manageOrganizationTeams')}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </>
        }
        description={ta('teamsAdm.groupsOfPeopleInsideEachOrganization')}
        icon={<Users />}
        actions={
          <Button className="gap-2" onClick={openCreate}>
            <Plus className="w-4 h-4" />{ta('teamsAdm.createTeam')}
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard label={ta('teamsAdm.teams')} value={safeTeams.length} icon={<Users />} />
        <StatCard label={ta('teamsAdm.members')} value={safeTeams.reduce((acc, t) => acc + t.members, 0)} icon={<UserCheck />} />
        <StatCard label={ta('teamsAdm.activeTeams')} value={safeTeams.filter(t => t.status === 'active').length} icon={<Activity />} />
      </div>

      {loadError && safeTeams.length === 0 ? (
        <EmptyState illustration="error" title={ta('teamsAdm.couldnTLoadTeams')} description={ta('teamsAdm.checkYourConnectionAndTryAgain')} actionLabel={ta('teamsAdm.tryAgain')} onAction={() => { setLoading(true); void loadTeams().finally(() => setLoading(false)) }} />
      ) : safeTeams.length === 0 ? (
        <EmptyState illustration="team" title={ta('teamsAdm.noTeamsYet')} description={ta('teamsAdm.teamsCreatedInsideAnOrganizationWill')} />
      ) : (
        <Panel>
          <div className="relative mb-6">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden />
            <Input
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={ta('teamsAdm.searchByTeamAdminOrStatus')}
              className="pl-9"
              aria-label={ta('teamsAdm.searchTeams')}
            />
          </div>
          {visibleTeams.length === 0 && (
            <EmptyState variant="search" title={`No teams match "${query.trim()}"`} description={ta('teamsAdm.tryATeamNameAdminOr')} className="border-0 bg-transparent py-6 md:py-8" />
          )}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {visibleTeams.map(team => (
              <div key={team.id} className="rounded-2xl border border-border/70 bg-card p-4">
                <h3 className="font-semibold text-foreground">{team.name}</h3>
                <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="tabular-nums">{ta('teamsAdm.members2', { members: team.members })}</span>
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

      <Dialog open={createOpen} onOpenChange={o => { if (!creating) setCreateOpen(o) }}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleCreate} className="space-y-4">
            <DialogHeader>
              <DialogTitle>{ta('teamsAdm.createTeam')}</DialogTitle>
              <DialogDescription>{ta('teamsAdm.theAdminMustAlreadyBeA')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="team-name">{ta('teamsAdm.teamName')}</Label>
              <Input id="team-name" value={formName} onChange={e => setFormName(e.target.value)} maxLength={80} placeholder={ta('teamsAdm.platformEngineering')} autoFocus />
            </div>
            <div className="space-y-2">
              <Label htmlFor="team-org">{ta('teamsAdm.organisation')}</Label>
              <Select value={formTenant} onValueChange={setFormTenant}>
                <SelectTrigger id="team-org" className="w-full">
                  <SelectValue placeholder={tenantsLoaded ? (tenants.length ? 'Choose an organisation' : 'No organisations yet') : 'Loading organisations'} />
                </SelectTrigger>
                <SelectContent>
                  {tenants.map(t => <SelectItem key={t.id} value={t.id}>{t.name || t.id}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="team-admin">{ta('teamsAdm.adminEmail')}</Label>
              <Input id="team-admin" type="email" value={formAdmin} onChange={e => setFormAdmin(e.target.value)} placeholder="name@company.com" autoComplete="off" />
            </div>
            {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>{ta('teamsAdm.cancel')}</Button>
              <Button type="submit" disabled={creating} className="gap-2">
                {creating && <Loader className="h-4 w-4 animate-spin" aria-hidden />}
                {creating ? 'Creating' : 'Create team'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}


