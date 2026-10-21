'use client'
import { useLocaleDates } from '@/lib/i18n/use-dates'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Trophy, Users, Clock, HelpCircle, Calendar, Target, BookOpen, ChevronRight,
  Plus, UserMinus, UserPlus, Mail, CheckCircle2, XCircle, Shield, Copy, Share2, Check
} from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { SkeletonCard, SkeletonText } from '@/components/ui/skeleton-boneyard'
import { useTour, autoPlayPageTour, type TourStep } from '@/components/tour/tour-context'
import { PageHeader, Panel, StatCard } from '@/components/app/page-kit'
import { AddEventToCalendar } from '@/components/calendar/add-event-to-calendar'
import { CodeathonResultsCard } from '@/components/codeathons/codeathon-results-card'
import { useT } from '@/lib/i18n/client'

interface Problem {
  id: string
  title: string
  difficulty: 'Easy' | 'Medium' | 'Hard'
  points: number
}

interface Team {
  id: string
  name: string
  created_by: string
  member_count: number
  members: { user_id: string; role: string; joined_at: string }[]
  created_at: string
  /** Only present for the viewer's own team (and staff). */
  join_code?: string
}

interface Invitation {
  id: string
  team_id: string
  team_name: string
  inviter_name: string
  status: string
  created_at: string
}

interface Codeathon {
  id: string
  title: string
  description: string
  difficulty: string
  topics: string[]
  startDate: string
  endDate: string
  totalPrize: string
  prizePool: string
  participants: number
  maxParticipants: number
  status: string
  registered?: boolean
  problems?: Problem[]
  event_type?: string
  team_size_min?: number
  team_size_max?: number
  problem_visibility?: string
}

function CountdownTimer({ target }: { target: string }) {
  const [time, setTime] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 })

  useEffect(() => {
    const calc = () => {
      const diff = new Date(target).getTime() - Date.now()
      if (diff <= 0) { setTime({ days: 0, hours: 0, minutes: 0, seconds: 0 }); return }
      setTime({
        days: Math.floor(diff / 86400000),
        hours: Math.floor((diff % 86400000) / 3600000),
        minutes: Math.floor((diff % 3600000) / 60000),
        seconds: Math.floor((diff % 60000) / 1000),
      })
    }
    calc()
    const interval = setInterval(calc, 1000)
    return () => clearInterval(interval)
  }, [target])

  if (time.days === 0 && time.hours === 0 && time.minutes === 0 && time.seconds === 0) return null

  return (
    <div className="flex items-center gap-1.5 text-base tabular-nums text-foreground">
      {time.days > 0 && <span className="font-mono font-semibold">{time.days}d</span>}
      <span className="font-mono font-semibold">{String(time.hours).padStart(2, '0')}</span>
      <span className="text-muted-foreground">:</span>
      <span className="font-mono font-semibold">{String(time.minutes).padStart(2, '0')}</span>
      <span className="text-muted-foreground">:</span>
      <span className="font-mono font-semibold">{String(time.seconds).padStart(2, '0')}</span>
    </div>
  )
}

export default function CodeathonDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { formatDateTime } = useLocaleDates()
  const { t: tr } = useT()
  const { id } = React.use(params)
  const router = useRouter()
  const gate = usePageGuard('user')
  const addToast = useToast()

  const [codeathon, setCodeathon] = useState<Codeathon | null>(null)
  const [loading, setLoading] = useState(true)
  const [registering, setRegistering] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')

  // Team state
  const [teams, setTeams] = useState<Team[]>([])
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [myTeam, setMyTeam] = useState<Team | null>(null)
  const [createTeamOpen, setCreateTeamOpen] = useState(false)
  const [newTeamName, setNewTeamName] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [creatingTeam, setCreatingTeam] = useState(false)
  const [joiningTeam, setJoiningTeam] = useState<string | null>(null)
  const [joinTarget, setJoinTarget] = useState<Team | null>(null)
  const [joinCode, setJoinCode] = useState('')

  useEffect(() => {
    void fetchData()
  }, [id])

  // First-visit guided tour (same pattern as the other dashboard pages).
  const { startTour, setTourSeen } = useTour()
  useEffect(() => {
    if (gate.ready) {
      const codeathonDetailTour: TourStep[] = [
        {
          target: '[data-tour="codeathon-detail-header"]',
          title: tr('compete.codeathonDetailsForParticipants'),
          description: tr('compete.thisPageShowsOneCodeathonsRules8e3'),
          position: 'bottom',
        },
        {
          target: '[data-tour="codeathon-detail-register"]',
          title: tr('compete.registerForTheEvent'),
          description: tr('compete.clickRegisterForCodeathonToJoind85'),
          position: 'top',
        },
        {
          target: '[data-tour="codeathon-detail-overview"]',
          title: tr('compete.checkStatsBeforeRegistering'),
          description: tr('compete.proTipCheckPrizeDifficultyAnd72c'),
          position: 'top',
        },
      ]
      autoPlayPageTour('codeathon-detail', codeathonDetailTour)}
  }, [gate.ready, startTour, setTourSeen])

  async function fetchData() {
    try {
      const [codeathonRes, teamsRes, invitesRes] = await Promise.all([
        csrfFetch(`/api/codeathons/${id}`, { credentials: 'include' }),
        csrfFetch(`/api/codeathons/${id}/teams`, { credentials: 'include' }),
        csrfFetch(`/api/codeathons/${id}/invitations`, { credentials: 'include' }),
      ])

      if (codeathonRes.ok) {
        const data = await codeathonRes.json() as Codeathon
        setCodeathon(data)
      }

      if (teamsRes.ok) {
        const data = await teamsRes.json() as { teams: Team[] }
        setTeams(data.teams || [])
        // Find my team
        const userId = (gate as any)?.user?.id
        const mine = data.teams?.find((t: Team) => t.members?.some((m: any) => m.user_id === userId))
        setMyTeam(mine || null)
      }

      if (invitesRes.ok) {
        const data = await invitesRes.json() as { invitations: Invitation[] }
        setInvitations(data.invitations || [])
      }
    } catch { /* ignore */ }
    setLoading(false)
  }

  async function handleRegister() {
    setRegistering(true)
    try {
      const res = await csrfFetch(`/api/codeathons/${id}/register`, {
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ teamName: myTeam?.name }),
      })
      if (res.ok) {
        addToast({ type: 'success', title: tr('compete.registered'), message: tr('compete.youAreNowRegisteredForThis19e') })
        setCodeathon(prev => prev ? { ...prev, registered: true } : prev)
      } else {
        const data = await res.json() as { error?: string }
        addToast({ type: 'error', title: tr('compete.failed'), message: data.error || tr('compete.registrationFailed') })
      }
    } catch {
      addToast({ type: 'error', title: tr('compete.error'), message: tr('compete.failedToRegister') })
    } finally {
      setRegistering(false)
    }
  }

  async function handleCreateTeam() {
    if (!newTeamName.trim()) return
    setCreatingTeam(true)
    try {
      const res = await csrfFetch(`/api/codeathons/${id}/teams`, {
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ name: newTeamName.trim() }),
      })
      if (res.ok) {
        const data = await res.json() as { team: Team }
        setMyTeam(data.team)
        setTeams(prev => [data.team, ...prev])
        setCreateTeamOpen(false)
        setNewTeamName('')
        addToast({ type: 'success', title: tr('compete.teamCreated') })
      } else {
        const data = await res.json() as { error?: string }
        addToast({ type: 'error', title: tr('compete.failed'), message: data.error || tr('compete.failedToCreateTeam') })
      }
    } catch {
      addToast({ type: 'error', title: tr('compete.error'), message: tr('compete.failedToCreateTeam') })
    } finally {
      setCreatingTeam(false)
    }
  }

  async function handleJoinTeam(teamId: string, code: string) {
    setJoiningTeam(teamId)
    try {
      const res = await csrfFetch(`/api/codeathons/${id}/teams/${teamId}/join`, {
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ join_code: code.trim() }),
      })
      if (res.ok) {
        addToast({ type: 'success', title: tr('compete.joinedTeam') })
        setJoinTarget(null)
        setJoinCode('')
        void fetchData()
      } else {
        const data = await res.json() as { error?: string }
        addToast({ type: 'error', title: tr('compete.failed'), message: data.error || tr('compete.failedToJoin') })
      }
    } catch {
      addToast({ type: 'error', title: tr('compete.error'), message: tr('compete.failedToJoinTeam') })
    } finally {
      setJoiningTeam(null)
    }
  }

  async function handleLeaveTeam() {
    if (!myTeam) return
    try {
      const res = await csrfFetch(`/api/codeathons/${id}/teams/${myTeam.id}/leave`, {
        method: 'POST',
        credentials: 'include',
      })
      if (res.ok) {
        setMyTeam(null)
        void fetchData()
        addToast({ type: 'success', title: tr('compete.leftTeam') })
      }
    } catch {
      addToast({ type: 'error', title: tr('compete.error'), message: tr('compete.failedToLeaveTeam') })
    }
  }

  async function handleInvite() {
    if (!myTeam || !inviteEmail.trim()) return
    try {
      const res = await csrfFetch(`/api/codeathons/${id}/teams/${myTeam.id}/invite`, {
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ email: inviteEmail.trim() }),
      })
      if (res.ok) {
        setInviteEmail('')
        addToast({ type: 'success', title: tr('compete.invitationSent') })
      } else {
        const data = await res.json() as { error?: string }
        addToast({ type: 'error', title: tr('compete.failed'), message: data.error || tr('compete.failedToInvite') })
      }
    } catch {
      addToast({ type: 'error', title: tr('compete.error'), message: tr('compete.failedToSendInvitation') })
    }
  }

  async function handleAcceptInvite(inviteId: string) {
    try {
      const res = await csrfFetch(`/api/codeathons/${id}/invitations/${inviteId}/accept`, {
        method: 'POST',
        credentials: 'include',
      })
      if (res.ok) {
        addToast({ type: 'success', title: tr('compete.joinedTeam') })
        void fetchData()
      }
    } catch {
      addToast({ type: 'error', title: tr('compete.error'), message: tr('compete.failedToAcceptInvitation') })
    }
  }

  async function handleDeclineInvite(inviteId: string) {
    try {
      const res = await csrfFetch(`/api/codeathons/${id}/invitations/${inviteId}/decline`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) throw new Error(String(res.status))
      setInvitations(prev => prev.filter(i => i.id !== inviteId))
      addToast({ type: 'success', title: tr('compete.invitationDeclined') })
    } catch {
      addToast({ type: 'error', title: tr('compete.couldntDeclineTheInvitation'), message: tr('compete.pleaseTryAgain') })
    }
  }

  const [copied, setCopied] = useState(false)
  const isTeamMode = codeathon?.event_type === 'team'
  const isContestActive = codeathon?.status === 'active' || (codeathon?.startDate && new Date(codeathon.startDate) <= new Date())
  const isAdmin = (gate as any)?.user?.role === 'superadmin' || (gate as any)?.user?.role === 'tenant_admin' || (gate as any)?.user?.role === 'admin'
  const problemsVisible = isAdmin || codeathon?.problem_visibility === 'immediate' || isContestActive

  const copyEventLink = () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    navigator.clipboard.writeText(`${origin}/dashboard/codeathons/${id}`)
    setCopied(true)
    addToast({ type: 'success', title: tr('compete.eventLinkCopiedToClipboard') })
    setTimeout(() => setCopied(false), 2500)
  }

  if (loading) return (
    <div className="space-y-6">
      <SkeletonText lines={2} />
      <SkeletonCard />
    </div>
  )

  if (!codeathon) return (
    <Panel className="mx-auto max-w-md p-10 text-center">
      <p className="font-semibold text-foreground">{tr('compete.codeathonNotFound')}</p>
      <p className="mt-1 text-sm text-muted-foreground">{tr('compete.itMayHaveBeenRemovedOrc19')}</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <Button variant="outline" size="sm" onClick={() => { setLoading(true); void fetchData() }}>{tr('common.tryAgain')}</Button>
        <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard/codeathons')}>{tr('compete.allCodeathons')}</Button>
      </div>
    </Panel>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div data-tour="codeathon-detail-header">
        <Button variant="ghost" size="sm" className="-ml-2 mb-3 gap-1 text-muted-foreground" onClick={() => router.push('/dashboard/codeathons')}>
          <ChevronRight className="h-4 w-4 rotate-180" aria-hidden />{' '}{tr('compete.allCodeathons')}</Button>
        <PageHeader
          className="mb-0"
          icon={<Trophy />}
          title={codeathon.title}
          description={
            <span className="flex flex-col gap-2">
              <span className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={`capitalize ${
                  codeathon.status === 'active' ? 'border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400' :
                  codeathon.status === 'upcoming' ? 'border-primary/30 bg-primary/10 text-primary' :
                  'border-border bg-muted text-muted-foreground'
                }`}>
                  {codeathon.status}
                </Badge>
                <Badge variant="outline">{isTeamMode ? tr('compete.teamEvent') : tr('compete.individual')}</Badge>
              </span>
              {codeathon.description && <span>{codeathon.description}</span>}
            </span>
          }
          actions={
            <>
              {codeathon.status !== 'completed' && codeathon.status !== 'archived' && !(codeathon.endDate && new Date(codeathon.endDate).getTime() < Date.now()) && (
                <AddEventToCalendar
                  kind="codeathon"
                  id={codeathon.id}
                  title={codeathon.title}
                  start={codeathon.startDate}
                  end={codeathon.endDate}
                  description={codeathon.description}
                  path={`/dashboard/codeathons/${codeathon.id}`}
                  status={codeathon.status}
                  className="gap-1.5 text-xs font-semibold"
                />
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={copyEventLink}
                className="gap-1.5 text-xs font-semibold"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-green-600 dark:text-green-400" /> : <Share2 className="h-3.5 w-3.5" />}
                {copied ? tr('compete.linkCopied') : tr('compete.shareEvent')}
              </Button>
            </>
          }
        />
      </div>

      {/* Invitations Banner */}
      {invitations.length > 0 && (
        <Panel className="border-primary/20 bg-primary/5 p-5">
          <h3 className="mb-2 text-sm font-semibold text-foreground">{tr('compete.teamInvitations')}</h3>
          {invitations.map(inv => (
            <div key={inv.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-primary/10 py-2 last:border-0">
              <div>
                <p className="text-sm font-medium">{inv.team_name}</p>
                <p className="text-xs text-muted-foreground">{tr('compete.invitedByInviterName', { inviter_name: inv.inviter_name })}</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => handleAcceptInvite(inv.id)}>{tr('compete.accept')}</Button>
                <Button size="sm" variant="outline" onClick={() => handleDeclineInvite(inv.id)}>{tr('compete.decline')}</Button>
              </div>
            </div>
          ))}
        </Panel>
      )}

      {/* Main content */}
      <CodeathonResultsCard codeathonId={codeathon.id} className="mb-6" />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">{tr('compete.overview')}</TabsTrigger>
          {isTeamMode && <TabsTrigger value="teams">Teams ({teams.length})</TabsTrigger>}
          {problemsVisible && codeathon.problems && <TabsTrigger value="problems">{tr('compete.problemsCount', { count: codeathon.problems.length })}</TabsTrigger>}
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {/* Stats */}
          <div className="cs-stagger grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" data-tour="codeathon-detail-overview">
            <StatCard label={tr('compete.participants')} value={codeathon.participants || 0} icon={<Users />} />
            <StatCard label={tr('compete.prizePool')} value={codeathon.prizePool || '—'} icon={<Trophy />} />
            <StatCard label={tr('compete.difficulty')} value={codeathon.difficulty || 'Medium'} icon={<Target />} />
            <StatCard
              label={tr('compete.startsIn')}
              icon={<Clock />}
              value={codeathon.startDate ? (
                <CountdownTimer target={codeathon.startDate} />
              ) : (
                <span className="text-sm font-medium">{tr('compete.tba')}</span>
              )}
            />
          </div>

          {/* Topics */}
          {codeathon.topics && codeathon.topics.length > 0 && (
            <Panel className="p-5">
              <h3 className="mb-2 text-sm font-semibold text-foreground">{tr('compete.topics')}</h3>
              <div className="flex flex-wrap gap-1.5">
                {codeathon.topics.map(t => <Badge key={t} variant="secondary">{t}</Badge>)}
              </div>
            </Panel>
          )}

          {/* Team info */}
          {isTeamMode && (
            <Panel className="p-5">
              <h3 className="mb-2 text-sm font-semibold text-foreground">{tr('compete.teamFormat')}</h3>
              <p className="text-sm tabular-nums text-muted-foreground">{tr('compete.teamSize')}{' '}{codeathon.team_size_min || 2}–{codeathon.team_size_max || 4}{' '}{tr('compete.members')}</p>
            </Panel>
          )}
        </TabsContent>

        <TabsContent value="teams" className="space-y-4">
          {!myTeam && (
            <div className="flex gap-2">
              <Button onClick={() => setCreateTeamOpen(true)}>
                <Plus className="h-4 w-4 mr-1" />{tr('compete.createTeam')}</Button>
            </div>
          )}

          {myTeam && (
            <Panel className="border-primary/20 p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Shield className="h-4 w-4 text-primary" />{tr('compete.yourTeamName', { name: myTeam.name })}</h3>
                <Button size="sm" variant="outline" onClick={handleLeaveTeam}>
                  <UserMinus className="h-3.5 w-3.5 mr-1" />{tr('compete.leave')}</Button>
              </div>
              {myTeam.join_code && (
                <p className="mb-3 text-sm text-muted-foreground">{tr('compete.joinCode')}{' '}<span className="font-mono font-semibold tabular-nums text-foreground">{myTeam.join_code}</span>{' '}{tr('compete.shareItWithTeammates')}</p>
              )}
              <div className="space-y-2">
                {myTeam.members?.map(m => (
                  <div key={m.user_id} className="flex items-center justify-between text-sm">
                    <span className="font-mono text-xs text-muted-foreground">{m.user_id.slice(0, 8)}…</span>
                    <Badge variant="outline" className="text-xs">{m.role}</Badge>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <Input
                  placeholder={tr('compete.emailToInvite')}
                  aria-label={tr('compete.emailToInvite')}
                  type="email"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  className="flex-1"
                />
                <Button size="sm" onClick={handleInvite} disabled={!inviteEmail.trim()}>
                  <Mail className="h-3.5 w-3.5 mr-1" />{tr('compete.invite')}</Button>
              </div>
            </Panel>
          )}

          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">{tr('compete.allTeams')}</h3>
            {teams.length === 0 ? (
              <p className="text-sm text-muted-foreground">{tr('compete.noTeamsYetCreateOneTo61f')}</p>
            ) : (
              teams.map(team => (
                <Card key={team.id} className="gap-0 rounded-2xl p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{team.name}</p>
                      <p className="text-xs tabular-nums text-muted-foreground">{tr('compete.memberCountMembers', { member_count: team.member_count })}</p>
                    </div>
                    {!myTeam && (
                      <Button size="sm" variant="outline" onClick={() => { setJoinTarget(team); setJoinCode('') }} disabled={joiningTeam === team.id}>
                        {joiningTeam === team.id ? tr('compete.joining') : tr('compete.join')}
                      </Button>
                    )}
                  </div>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="problems" className="space-y-4">
          {!problemsVisible ? (
            <Panel className="flex flex-col items-center p-10 text-center">
              <Target className="mb-3 h-10 w-10 text-primary/50" aria-hidden />
              <p className="font-semibold text-foreground">{tr('compete.problemsUnlockWhenTheContestStarts')}</p>
              <p className="mt-1 text-sm tabular-nums text-muted-foreground">{tr('compete.startTime')}{' '}{codeathon.startDate ? formatDateTime(codeathon.startDate) : tr('compete.tba')}</p>
            </Panel>
          ) : (
            <div className="space-y-2">
              {codeathon.problems?.map((p, i) => (
                <Card role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); (e.currentTarget as HTMLElement).click() } }} key={p.id} className="cursor-pointer gap-0 rounded-2xl p-4 hover:border-primary/40"
                  onClick={() => router.push(`/dashboard/codeathons/${id}/problems/${p.id}`)}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-mono tabular-nums text-muted-foreground">#{i + 1}</span>
                      <div>
                        <p className="font-medium text-foreground">{p.title}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className={
                            p.difficulty === 'Hard' ? 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400' :
                            p.difficulty === 'Easy' ? 'border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400' :
                            'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400'
                          }>
                            {p.difficulty}
                          </Badge>
                          <span className="text-xs tabular-nums text-muted-foreground">{tr('compete.pointsPts', { points: p.points })}</span>
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Register button */}
      <div className="flex gap-2" data-tour="codeathon-detail-register">
        {!codeathon.registered ? (
          <Button onClick={handleRegister} disabled={registering} size="lg">
            {registering ? tr('compete.registering') : tr('compete.registerForThisCodeathon')}
          </Button>
        ) : (
          <Button variant="outline" size="lg" disabled>
            <CheckCircle2 className="h-4 w-4 mr-1" />{tr('compete.registered2')}</Button>
        )}
      </div>

      {/* Join Team Dialog */}
      <Dialog open={!!joinTarget} onOpenChange={(o) => { if (!o) setJoinTarget(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tr('compete.join')}{' '}{joinTarget?.name || tr('compete.team')}</DialogTitle>
            <DialogDescription>{tr('compete.askAMemberOfThisTeamfde')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="join-code">{tr('compete.joinCode2')}</Label>
            <Input id="join-code" value={joinCode} onChange={e => setJoinCode(e.target.value)} placeholder="e.g. 3F9A1C2B" autoComplete="off" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setJoinTarget(null)}>{tr('common.cancel')}</Button>
            <Button onClick={() => joinTarget && handleJoinTeam(joinTarget.id, joinCode)} disabled={!joinCode.trim() || !!joiningTeam}>
              {joiningTeam ? tr('compete.joining') : tr('compete.joinTeam')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Team Dialog */}
      <Dialog open={createTeamOpen} onOpenChange={setCreateTeamOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tr('compete.createATeam')}</DialogTitle>
            <DialogDescription>{tr('compete.createATeamForThisCodeathon')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-team-name">{tr('compete.teamName')}</Label>
              <Input id="new-team-name" value={newTeamName} onChange={e => setNewTeamName(e.target.value)} placeholder={tr('compete.enterTeamName')} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateTeamOpen(false)}>{tr('common.cancel')}</Button>
            <Button onClick={handleCreateTeam} disabled={creatingTeam || !newTeamName.trim()}>
              {creatingTeam ? tr('compete.creating') : tr('compete.createTeam')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
