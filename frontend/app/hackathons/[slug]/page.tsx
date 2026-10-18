'use client'

import { formatDateTime } from '@/lib/format-datetime'
import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Panel } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'
import { SoftGlow } from '@/components/visuals/stage'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Loader2, Trophy, Users, Clock, CalendarDays,
  Sparkles, CheckCircle, ListChecks, Shield,
  Copy, Timer, LogIn, Send, Pencil,
} from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useRoleGate } from '@/lib/use-role-gate'
import { isSuperAdmin } from '@/lib/rbac'
import { Countdown } from '@/components/hackathons/countdown'
import { csrfFetch } from '@/lib/csrf-fetch'
import { ListingTrustFooter } from '@/components/trust/listing-trust-footer'
import { useToast } from '@/lib/toast-context'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { SkeletonCard, SkeletonText } from '@/components/ui/skeleton-boneyard'
import { AddEventToCalendar } from '@/components/calendar/add-event-to-calendar'

interface Hackathon {
  id: string; name: string; slug: string; description?: string
  num_teams: number; max_per_team: number; timeout_minutes: number
  starts_at: string; ends_at: string; status: string
  tasks: { problem_slug: string; problem_title: string; points: number; difficulty: string; required: boolean }[]
  rules: { type: string; title: string; description: string }[]
  scoring: { auto_grade: boolean; points_per_problem: number }
  results_released: boolean
  banner_url?: string
}

interface Team {
  id: string; name: string; slug: string; qr_token: string
  xp: number; level: number; submissions: number
  members: Array<{ user_id: string; name: string; role: string }>
  achievements: Array<{ id: string; name: string }>
  created_at: string
}

export default function HackathonPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const router = useRouter()
  // Public page: anyone can view a published event; signing in is only needed to join.
  const gate = useRoleGate()
  const { user: authUser } = useAuth()
  const hasSession = authUser?.uid
  const addToast = useToast()
  const [hackathon, setHackathon] = useState<Hackathon | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newTeamName, setNewTeamName] = useState('')
  const [creating, setCreating] = useState(false)
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [myTeam, setMyTeam] = useState<Team | null>(null)
  const [copied, setCopied] = useState(false)
  const [emailInviteOpen, setEmailInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [sendingInvite, setSendingInvite] = useState(false)

  const [renameDialogOpen, setRenameDialogOpen] = useState(false)
  const [editTeamName, setEditTeamName] = useState('')
  const [renaming, setRenaming] = useState(false)

  const load = useCallback(async () => {
    try {
      const [hRes, tRes] = await Promise.all([
        fetch(`/api/hackathons/${slug}?by=slug`, { cache: 'no-store' }),
        fetch(`/api/hackathons/${slug}/teams`, { cache: 'no-store' }),
      ])
      if (!hRes.ok) throw new Error('Event not found')
      const hk = await hRes.json() as Hackathon
      setHackathon(hk)
      setError(null)
      if (tRes.ok) {
        const j = await tRes.json() as { items: Team[] }
        setTeams(j.items)
        // Find my team if logged in
        if (hasSession) {
          const my = j.items.find((t) => t.members.some((m) => m.user_id === hasSession))
          setMyTeam(my || null)
        }
      }
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setLoading(false) }
  }, [slug, hasSession])

  useEffect(() => {
    void load()
    const t = setInterval(load, 15000)
    return () => clearInterval(t)
  }, [load])

  async function createTeam() {
    setCreating(true); setError(null); setInviteUrl(null)
    try {
      const res = await csrfFetch(`/api/hackathons/${slug}/teams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTeamName || undefined }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'failed')
      setNewTeamName('')
      setInviteUrl(j.share_url as string)
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setCreating(false) }
  }

  const copyInvite = async () => {
    const url = inviteUrl || (myTeam ? getInviteUrl(myTeam) : null)
    if (url) {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const getInviteUrl = (team: Team) => {
    const base = typeof window !== 'undefined' ? window.location.origin : ''
    return `${base}/hackathons/${slug}/join/${team.qr_token}`
  }

  const sendEmailInvite = async () => {
    if (!hackathon || !inviteEmail.trim() || !myTeam) return
    setSendingInvite(true)
    try {
      const res = await csrfFetch(`/api/hackathons/${hackathon.id}/teams/${myTeam.id}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim() }),
      })
      const data = await res.json()
      if (data.error) { addToast({ type: 'error', title: data.error }); return }
      addToast({ type: 'success', title: `Invite sent to ${inviteEmail}` })
      setInviteEmail('')
      setEmailInviteOpen(false)
    } catch { addToast({ type: 'error', title: 'Failed to send invite' }) }
    finally { setSendingInvite(false) }
  }

  const handleRenameTeam = async () => {
    if (!myTeam || !editTeamName.trim()) return
    setRenaming(true)
    try {
      const res = await csrfFetch(`/api/hackathons/${slug}/teams/${myTeam.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editTeamName.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { addToast({ type: 'error', title: data.error || 'Failed to rename team' }); return }
      addToast({ type: 'success', title: `Team renamed to "${editTeamName.trim()}"` })
      setRenameDialogOpen(false)
      await load()
    } catch { addToast({ type: 'error', title: 'Failed to update team name' }) }
    finally { setRenaming(false) }
  }

  const isCaptainOfMyTeam = myTeam?.members.some(m => m.user_id === hasSession && m.role === 'captain') || (gate.user?.role ? isSuperAdmin(gate.user.role) : false)

  if (!gate.ready) return (
    <div className="min-h-screen space-y-6 p-6">
      <SkeletonText lines={2} />
      <SkeletonCard />
    </div>
  )
  if (loading && !hackathon) return (
    <div className="min-h-screen space-y-6 p-6">
      <SkeletonText lines={2} />
      <SkeletonCard />
    </div>
  )
  if (!hackathon) return (
    <div className="mx-auto flex min-h-[60vh] max-w-xl items-center px-4 py-12">
      <EmptyState
        illustration="not-found"
        title="We couldn't find this hackathon"
        description={error && error !== 'Event not found' ? error : 'The link may be wrong, or the event was removed. Browse the hackathons that are open now.'}
        actionLabel="Browse hackathons"
        actionHref="/dashboard/hackathons"
        variant="search"
      />
    </div>
  )

  const ends = new Date(hackathon.ends_at)
  const starts = new Date(hackathon.starts_at)
  const now = Date.now()
  const isLive = now >= starts.getTime() && now <= ends.getTime()
  const isClosed = now > ends.getTime() || hackathon.status === 'closed'

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Hero Banner Area */}
      <div className="relative h-64 md:h-80 w-full overflow-hidden bg-muted border-b border-border">
        {hackathon.banner_url ? (
          <img src={hackathon.banner_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 isolate bg-linear-to-br from-primary/25 via-primary/5 to-background">
            <SoftGlow />
          </div>
        )}
        <div className="absolute inset-0 bg-linear-to-t from-background/90 via-background/20 to-transparent" />
        
        {/* Banner Overlay Controls */}
        <div className="absolute top-0 left-0 w-full p-4 md:p-6 flex justify-between items-start">
          <button type="button" onClick={() => {
            const role = gate.user?.role
            if (role && isSuperAdmin(role)) { router.push('/dashboard/admin/hackathons'); return }
            router.push('/dashboard/hackathons')
          }} className="px-4 py-2 bg-background/50 backdrop-blur-md border border-border/50 rounded-lg text-sm font-medium text-foreground hover:bg-background/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            ← Back
          </button>
          
          <div className="flex items-center gap-2">
            <Badge variant={isLive ? 'default' : isClosed ? 'destructive' : 'secondary'} className={cn('px-3 py-1 text-xs backdrop-blur-md', isLive ? 'border-green-500/30 bg-green-500/15 text-green-700 dark:text-green-400' : isClosed ? '' : 'bg-background/80 text-foreground')}>
              {isLive ? 'Live' : isClosed ? 'Closed' : 'Open'}
            </Badge>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-4 lg:px-8 -mt-16 relative z-10">
        <div className="grid gap-8 lg:grid-cols-[1fr_350px]">
          {/* Left Column (Details, Tabs) */}
          <div className="space-y-6">
            
            {/* Event Header */}
            <Panel>
              <h1 className="flex items-center gap-3 text-3xl md:text-4xl font-bold tracking-tight text-balance text-foreground mb-2">
                <Trophy className="h-8 w-8 text-primary shrink-0" /> {hackathon.name}
              </h1>
              {hackathon.description && <p className="text-muted-foreground">{hackathon.description}</p>}
              
              <div className="mt-6 flex flex-wrap gap-3">
                <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm font-medium">
                  <CalendarDays className="h-4 w-4 text-primary" />
                  <span>{formatDateTime(starts)}</span>
                </div>
                {!isClosed && !isLive && (
                  <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-700 dark:text-amber-300">
                    <Timer className="h-4 w-4" />
                    <span>Starts in <Countdown targetIso={hackathon.starts_at} /></span>
                  </div>
                )}
                {isLive && !isClosed && (
                  <div className="flex items-center gap-2 rounded-xl border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm font-medium text-green-700 dark:text-green-400">
                    <Timer className="h-4 w-4" />
                    <span>Ends in <Countdown targetIso={hackathon.ends_at} /></span>
                  </div>
                )}
                <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm font-medium">
                  <Clock className="h-4 w-4 text-primary" />
                  <span className="tabular-nums">{hackathon.timeout_minutes} min</span>
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm font-medium">
                  <Users className="h-4 w-4 text-primary" />
                  <span className="tabular-nums">{teams.length} / {hackathon.num_teams} teams</span>
                </div>
                {!isClosed && (
                  <AddEventToCalendar
                    kind="hackathon"
                    id={hackathon.id}
                    title={hackathon.name}
                    start={hackathon.starts_at}
                    end={hackathon.ends_at}
                    description={hackathon.description}
                    path={`/hackathons/${hackathon.slug}`}
                    status={hackathon.status}
                    className="h-auto rounded-lg py-2"
                  />
                )}
              </div>
            </Panel>

            {/* Tabbed Navigation */}
            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="w-full justify-start h-auto p-1 bg-card border border-border/70 mb-4 rounded-2xl overflow-x-auto no-scrollbar">
                <TabsTrigger value="overview" className="px-6 py-2.5 rounded-lg">Overview</TabsTrigger>
                <TabsTrigger value="leaderboard" className="px-6 py-2.5 rounded-lg">
                  Leaderboard <Badge variant="secondary" className="ml-2 text-[10px]">{teams.length}</Badge>
                </TabsTrigger>
                {hackathon.rules && hackathon.rules.length > 0 && (
                  <TabsTrigger value="rules" className="px-6 py-2.5 rounded-lg">Rules</TabsTrigger>
                )}
              </TabsList>

              <TabsContent value="overview" className="space-y-6 mt-0">
                <Panel>
                  <h2 className="text-lg font-semibold mb-4">About this hackathon</h2>
                  <div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground">
                    <p>{hackathon.description || 'No detailed description provided.'}</p>
                    <p className="mt-4">
                      This hackathon has {hackathon.tasks?.length || 0} problems, scored automatically.
                      Register a team, solve as many as you can, and climb the leaderboard.
                    </p>
                  </div>
                </Panel>
              </TabsContent>

              <TabsContent value="leaderboard" className="mt-0">
                <Panel className="divide-y divide-border/60 overflow-hidden p-0">
                  <div className="p-4 bg-muted/30">
                    <h2 className="text-base font-semibold text-foreground">
                      Current standings
                    </h2>
                  </div>
                  {teams.length === 0 ? (
                    <EmptyState
                      compact
                      illustration="leaderboard"
                      title="No teams have registered yet"
                      description="Register a team to be first on the board."
                    />
                  ) : (
                    teams.map((t, i) => (
                      <div key={t.id} className="flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors">
                        <span className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold tabular-nums",
                          i === 0 ? "bg-amber-400/20 text-amber-700 dark:text-amber-300" :
                          i === 1 ? "bg-muted text-foreground ring-1 ring-border" :
                          i === 2 ? "bg-amber-700/20 text-amber-700 dark:text-amber-500" :
                          "text-muted-foreground bg-muted"
                        )}>
                          {i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold truncate">{t.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {t.members.length} member{t.members.length === 1 ? '' : 's'} · {t.submissions} submission{t.submissions === 1 ? '' : 's'}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <Badge className="font-bold gap-1 tabular-nums"><Trophy className="h-3 w-3" /> {t.xp} XP</Badge>
                          {t.achievements.length > 0 && (
                            <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <Sparkles className="h-3 w-3 text-primary" /> {t.achievements.length} badges
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </Panel>
              </TabsContent>

              {hackathon.rules && hackathon.rules.length > 0 && (
                <TabsContent value="rules" className="mt-0">
                  <Panel className="space-y-6">
                    <h2 className="flex items-center gap-2 text-lg font-semibold">
                      <Shield className="h-5 w-5 text-primary" /> Rules
                    </h2>
                    <div className="grid gap-6 md:grid-cols-2">
                      {hackathon.rules.map((r, i) => (
                        <div key={i} className="flex gap-4 p-4 rounded-2xl border border-border/60 bg-muted/20">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold">
                            {i + 1}
                          </div>
                          <div>
                            <p className="text-sm font-semibold mb-1">{r.title}</p>
                            <p className="text-sm text-muted-foreground leading-relaxed">{r.description}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Panel>
                </TabsContent>
              )}
            </Tabs>
          </div>
          
          {/* Right Column (Sticky Registration Card) */}
          <div className="relative">
            <div className="sticky top-20 lg:top-24 space-y-4">
              
              {/* Main Registration Card */}
              <Panel className="relative isolate overflow-hidden p-0">
                <SoftGlow />
                {/* Decoration */}
                <div aria-hidden className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                  <Trophy className="h-32 w-32" />
                </div>
                
                <div className="p-6 relative z-10">
                  {!isClosed ? (
                    <div>
                      {myTeam ? (
                        <div className="space-y-5">
                          <div className="flex items-center justify-between pb-4 border-b border-border/50">
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1">Your team</p>
                              <h2 className="text-lg font-semibold truncate pr-4">{myTeam.name}</h2>
                            </div>
                            <div className="bg-green-500/10 text-green-600 dark:text-green-400 p-2 rounded-full">
                              <CheckCircle className="h-6 w-6" />
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div className="space-y-2">
                            {isLive && (
                              <Button className="w-full h-11 text-base shadow-sm" asChild>
                                <Link href={`/hackathons/${slug}/workspace`} className="block"><ListChecks className="mr-2 h-4 w-4" /> Enter workspace</Link>
                              </Button>
                            )}
                            <Button variant="outline" className="w-full" onClick={() => setEmailInviteOpen(true)}>
                              <Users className="mr-2 h-4 w-4" /> Manage team
                            </Button>
                          </div>

                          {/* Team Roster */}
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-xs font-medium text-muted-foreground">Members</p>
                              <Badge variant="secondary" className="text-[10px] tabular-nums">{myTeam.members.length}/{hackathon.max_per_team}</Badge>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {myTeam.members.map((m) => (
                                <Badge key={m.user_id} variant={m.role === 'captain' ? 'default' : 'secondary'} className="px-2 py-1">
                                  {m.name} {m.role === 'captain' && <Trophy className="ml-1 h-3 w-3 opacity-70" />}
                                </Badge>
                              ))}
                            </div>
                          </div>

                          {/* Share Invite */}
                          <div className="bg-primary/5 rounded-xl p-4 border border-primary/20">
                            <p className="text-xs font-semibold text-primary mb-2 flex items-center gap-1">
                              <Sparkles className="h-3 w-3" /> Invite teammates
                            </p>
                            <div className="flex gap-2 mb-2">
                              <code className="flex-1 text-xs truncate rounded-md bg-background px-3 py-2 border border-border/50 shadow-sm">{getInviteUrl(myTeam)}</code>
                              <Button size="icon" variant="outline" onClick={copyInvite} aria-label="Copy invite link" className="shrink-0 h-8 w-8">
                                {copied ? <CheckCircle className="h-3 w-3 text-green-600 dark:text-green-400" /> : <Copy className="h-3 w-3" />}
                              </Button>
                            </div>
                            <Button size="sm" variant="secondary" className="w-full text-xs h-8" onClick={() => setEmailInviteOpen(true)}>
                              Send email invite
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-5">
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-2">Registration</p>
                            <h2 className="text-lg font-semibold tracking-tight">Join this hackathon</h2>
                          </div>

                          {authUser?.uid ? (
                            <div className="space-y-4 pt-2">
                              <div className="space-y-2">
                                <Label htmlFor="new-team-name" className="text-xs font-medium">Team name</Label>
                                <Input
                                  id="new-team-name" 
                                  placeholder="Leave blank and we'll pick a name" 
                                  value={newTeamName}
                                  onChange={(e) => setNewTeamName(e.target.value)} 
                                  className="h-11"
                                />
                              </div>
                              <Button 
                                onClick={createTeam} 
                                disabled={creating || teams.length >= hackathon.num_teams}
                                className="w-full h-11 text-base shadow-sm font-semibold"
                              >
                                {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                Register team
                              </Button>
                              {teams.length >= hackathon.num_teams && (
                                <p className="text-xs text-destructive text-center font-medium">Event is at full capacity ({hackathon.num_teams} teams).</p>
                              )}
                            </div>
                          ) : (
                            <div className="space-y-4 pt-2">
                              <p className="text-sm text-muted-foreground">
                                You must be signed in to create or join a team for this event.
                              </p>
                              <div className="grid gap-2">
                                <Button className="w-full h-11 gap-2" asChild>
                                  <Link href={`/auth/login?redirect=${encodeURIComponent(`/hackathons/${slug}`)}`} className="w-full"><LogIn className="h-4 w-4" /> Sign in</Link>
                                </Button>
                                <Button variant="outline" className="w-full h-11" asChild>
                                  <Link href={`/auth/signup?redirect=${encodeURIComponent(`/hackathons/${slug}`)}`} className="w-full">Create account</Link>
                                </Button>
                              </div>
                            </div>
                          )}
                          {error && <p className="text-xs text-destructive text-center font-medium bg-destructive/10 py-2 rounded-md">{error}</p>}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-6 space-y-4">
                      <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-2">
                        <Trophy className="h-8 w-8 text-muted-foreground" />
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold mb-1">Hackathon closed</h2>
                        <p className="text-sm text-muted-foreground">This event has ended. Registration is no longer available.</p>
                      </div>
                      
                      {hackathon.results_released ? (
                        <Button className="w-full h-11" asChild>
                          <Link href={`/hackathons/${slug}/results`} className="block mt-6"><Trophy className="mr-2 h-4 w-4" /> View final results</Link>
                        </Button>
                      ) : (
                        <Badge variant="outline" className="mt-4 py-1.5 px-3">Results coming soon</Badge>
                      )}
                    </div>
                  )}
                </div>
              </Panel>

              {/* Tasks Overview Card (for participants) */}
              {myTeam && hackathon.tasks && hackathon.tasks.length > 0 && (
                <Panel className="p-5">
                  <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
                    <ListChecks className="h-4 w-4 text-primary" /> Problems
                  </h2>
                  <div className="space-y-2">
                    {hackathon.tasks.map((task) => (
                      <div key={task.problem_slug} className="flex items-center justify-between p-2.5 rounded-xl bg-muted/40 border border-border/50">
                        <span className="text-sm font-medium truncate pr-2">{task.problem_title}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant="outline" className="text-[10px] capitalize">{task.difficulty}</Badge>
                          <span className="text-xs font-bold tabular-nums text-primary">{task.points} pts</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </Panel>
              )}
            </div>
          </div>
        </div>
      </main>

      {hackathon ? (
        <div className="mx-auto max-w-6xl px-4 pb-10">
          <ListingTrustFooter
            entityType="hackathon"
            entityId={hackathon.id || slug}
            entityTitle={hackathon.name}
            organizerName="CodeSpectra Hackathons"
            updatedAt={hackathon.starts_at}
          />
        </div>
      ) : null}

      {/* Email Invite Dialog */}
      <Dialog open={emailInviteOpen} onOpenChange={setEmailInviteOpen}>
        <DialogContent className="sm:max-w-105">
          <DialogHeader>
            <DialogTitle>Invite a teammate</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="invite-email" className="text-xs font-medium text-muted-foreground">Email address</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="teammate@example.com"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && void sendEmailInvite()}
                className="h-11"
              />
            </div>
            <div className="bg-muted/50 p-3 rounded-xl flex gap-3 text-xs text-muted-foreground items-start">
              <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <p>
                We'll send a direct invite link to this email address. They don't need a code — just sign in and click to join.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEmailInviteOpen(false)}>Cancel</Button>
            <Button onClick={() => void sendEmailInvite()} disabled={sendingInvite || !inviteEmail.trim()}>
              {sendingInvite ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Send invite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Rename team</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="edit-team-name">New team name</Label>
              <Input
                id="edit-team-name"
                placeholder="e.g. PARADISE"
                value={editTeamName}
                onChange={e => setEditTeamName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && void handleRenameTeam()}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Update your team&apos;s display name on the leaderboard and event workspace.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => void handleRenameTeam()} disabled={renaming || !editTeamName.trim()}>
              {renaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
              Save name
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
