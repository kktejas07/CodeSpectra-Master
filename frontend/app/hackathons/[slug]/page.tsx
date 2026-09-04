'use client'

import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Loader2, Trophy, Users, Clock, CalendarDays,
  Sparkles, CheckCircle, ListChecks, Shield,
  Copy, Timer, LogIn, Send, Pencil,
} from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { usePageGuard } from '@/lib/use-page-guard'
import { isSuperAdmin } from '@/lib/rbac'
import { Countdown } from '@/components/hackathons/countdown'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useToast } from '@/lib/toast-context'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'

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
  const gate = usePageGuard('user')
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

  if (!gate.ready) return <div className="flex min-h-screen items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…</div>
  if (!gate.allowed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Card className="max-w-sm w-full p-8 text-center border-primary/20">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 mx-auto mb-4">
            <Trophy className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-xl font-bold mb-2">Sign in required</h1>
          <p className="text-sm text-muted-foreground mb-6">
            Please sign in to view and join hackathon events.
          </p>
          <div className="flex flex-col gap-2">
            <Link href={`/auth/login?redirect=${encodeURIComponent(`/hackathons/${slug}`)}`}>
              <Button className="w-full gap-2"><LogIn className="h-4 w-4" /> Sign in</Button>
            </Link>
            <Link href="/auth/signup">
              <Button variant="outline" className="w-full">Create account</Button>
            </Link>
          </div>
        </Card>
      </div>
    )
  }

  if (loading && !hackathon) return <div className="flex min-h-screen items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading event…</div>
  if (!hackathon) return <div className="p-10 text-center"><p className="text-sm text-destructive">{error || 'Event not found'}</p><Link href="/" className="mt-3 inline-block text-sm text-primary hover:underline">← Home</Link></div>

  const ends = new Date(hackathon.ends_at)
  const starts = new Date(hackathon.starts_at)
  const now = Date.now()
  const isLive = now >= starts.getTime() && now <= ends.getTime()
  const isClosed = now > ends.getTime() || hackathon.status === 'closed'

  return (
    <div className="min-h-screen bg-background">
      {hackathon.banner_url && (
        <div className="h-48 w-full overflow-hidden bg-muted">
          <img src={hackathon.banner_url} alt="" className="w-full h-full object-cover" />
        </div>
      )}
      <header className="border-b border-border bg-card/40 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <button onClick={() => {
            const role = gate.user?.role
            if (role && isSuperAdmin(role)) { router.push('/dashboard/admin/hackathons'); return }
            router.push('/dashboard/hackathons')
          }} className="text-sm text-muted-foreground hover:text-foreground">← Back</button>
          <div className="flex items-center gap-3">
            {myTeam && isLive && (
              <Link href={`/hackathons/${slug}/workspace`}>
                <Button size="sm" variant="default"><ListChecks className="h-3.5 w-3.5 mr-1" /> Enter Workspace</Button>
              </Link>
            )}
            {isClosed && hackathon.results_released && (
              <Link href={`/hackathons/${slug}/results`}>
                <Button size="sm" variant="outline"><Trophy className="h-3.5 w-3.5 mr-1" /> View Results</Button>
              </Link>
            )}
            {isClosed && !hackathon.results_released && (
              <Badge variant="outline" className="text-muted-foreground">Event Ended</Badge>
            )}
            <Badge variant={isLive ? 'default' : isClosed ? 'destructive' : 'secondary'} className="uppercase">
              {isLive ? 'Live' : isClosed ? 'Closed' : 'Open'}
            </Badge>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-6 py-10">
        {/* Event Header */}
        <section>
          <h1 className="flex items-center gap-2 text-3xl font-bold">
            <Trophy className="h-7 w-7 text-primary" /> {hackathon.name}
          </h1>
          {hackathon.description && <p className="mt-2 text-sm text-muted-foreground">{hackathon.description}</p>}
          <div className="mt-4 flex flex-wrap gap-3 text-xs">
            <span className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/40 px-2 py-1">
              <CalendarDays className="h-3 w-3" /> {starts.toLocaleString()}
            </span>
            {!isClosed && !isLive && (
              <span className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/40 px-2 py-1 text-yellow-500">
                <Timer className="h-3 w-3" /> Starts in <Countdown targetIso={hackathon.starts_at} />
              </span>
            )}
            {isLive && !isClosed && (
              <span className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/40 px-2 py-1 text-green-500">
                <Timer className="h-3 w-3" /> Ends in <Countdown targetIso={hackathon.ends_at} />
              </span>
            )}
            <span className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/40 px-2 py-1">
              <Clock className="h-3 w-3" /> {hackathon.timeout_minutes} min · {hackathon.tasks?.length || 0} problems
            </span>
            <span className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/40 px-2 py-1">
              <Users className="h-3 w-3" /> {teams.length} / {hackathon.num_teams} teams
            </span>
          </div>
        </section>

        {/* Registration / My Team Panel */}
        {!isClosed && (
          <Card className="space-y-4 p-5">
            {myTeam ? (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  <h2 className="text-sm font-semibold">Your Team: {myTeam.name}</h2>
                  {isCaptainOfMyTeam && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                      onClick={() => { setEditTeamName(myTeam.name); setRenameDialogOpen(true) }}
                      title="Rename team"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Badge variant="outline">{myTeam.members.length}/{hackathon.max_per_team} members</Badge>
                </div>

                {/* Team members */}
                <div className="flex flex-wrap gap-2 mb-3">
                  {myTeam.members.map((m) => (
                    <Badge key={m.user_id} variant={m.role === 'captain' ? 'default' : 'secondary'}>
                      {m.name} {m.role === 'captain' && '(Captain)'}
                    </Badge>
                  ))}
                </div>

                {/* Assigned Problems */}
                {hackathon.tasks && hackathon.tasks.length > 0 && (
                  <div className="mb-3 space-y-1">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Assigned Problems</p>
                    {hackathon.tasks.map((task) => (
                      <div key={task.problem_slug}
                        className="flex items-center justify-between p-2 rounded text-sm">
                        <span>{task.problem_title}</span>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px]">{task.difficulty}</Badge>
                          <span className="text-xs text-muted-foreground">{task.points} pts</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {(!hackathon.tasks || hackathon.tasks.length === 0) && (
                  <p className="text-xs text-muted-foreground">No problems assigned yet — check back soon.</p>
                )}

                {/* Invite link */}
                {myTeam && (
                  <div className="rounded-lg border border-primary/40 bg-primary/5 p-3">
                    <p className="text-xs font-semibold text-primary mb-2">Share this invite link with your team:</p>
                    <div className="flex gap-2">
                      <code className="flex-1 text-xs truncate rounded bg-background px-2 py-1.5 border">{getInviteUrl(myTeam)}</code>
                      <Button size="sm" variant="outline" onClick={copyInvite}>
                        {copied ? 'Copied!' : <Copy className="h-3 w-3" />}
                      </Button>
                    </div>
                    <Button size="sm" variant="outline" className="w-full gap-1.5 mt-2" onClick={() => setEmailInviteOpen(true)}>
                      <Send className="h-3 w-3" /> Send invite by email
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div>
                {authUser?.uid ? (
                  <>
                    <h2 className="text-sm font-semibold mb-3">Register your team</h2>
                    <div className="flex gap-2">
                      <Input placeholder="Team name (auto-named if blank)" value={newTeamName}
                        onChange={(e) => setNewTeamName(e.target.value)} />
                      <Button onClick={createTeam} disabled={creating || teams.length >= hackathon.num_teams}>
                        {creating ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                        Register
                      </Button>
                    </div>
                    {teams.length >= hackathon.num_teams && <p className="text-xs text-destructive mt-1">Event is at capacity ({hackathon.num_teams} teams).</p>}
                  </>
                ) : (
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                    <p className="text-sm font-medium">Sign in to register your team</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Create an account or sign in to participate in this hackathon.
                    </p>
                    <div className="mt-3 flex gap-2">
                      <Link href={`/auth/login?redirect=${encodeURIComponent(`/hackathons/${slug}`)}`}>
                        <Button size="sm" className="gap-1.5"><LogIn className="h-3.5 w-3.5" /> Sign in</Button>
                      </Link>
                      <Link href={`/auth/signup?redirect=${encodeURIComponent(`/hackathons/${slug}`)}`}>
                        <Button size="sm" variant="outline" className="gap-1.5">Create account</Button>
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            )}
            {error && <p className="text-xs text-destructive">{error}</p>}
          </Card>
        )}

        {/* Rules */}
        {hackathon.rules && hackathon.rules.length > 0 && (
          <Card className="p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold mb-3">
              <Shield className="h-4 w-4 text-primary" /> Rules & Regulations
            </h2>
            <div className="space-y-2">
              {hackathon.rules.map((r, i) => (
                <div key={i}>
                  <p className="text-sm font-medium">{r.title}</p>
                  <p className="text-xs text-muted-foreground">{r.description}</p>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Leaderboard */}
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Leaderboard ({teams.length})
          </h2>
          {teams.length === 0 ? (
            <Card className="p-6 text-center text-xs text-muted-foreground">No teams have registered yet.</Card>
          ) : (
            <Card className="divide-y divide-border/60 overflow-hidden">
              {teams.map((t, i) => (
                <div key={t.id} className="flex items-center gap-3 p-4">
                  <span className="w-8 text-xl font-bold text-muted-foreground tabular-nums">{i + 1}</span>
                  <div className="flex-1">
                    <p className="font-medium">{t.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.members.length} member{t.members.length === 1 ? '' : 's'} · {t.submissions} submission{t.submissions === 1 ? '' : 's'}
                    </p>
                  </div>
                  {t.achievements.length > 0 && (
                    <Badge variant="outline" className="gap-1"><Sparkles className="h-3 w-3" /> {t.achievements.length}</Badge>
                  )}
                  <Badge className="gap-1"><Trophy className="h-3 w-3" /> {t.xp} XP · Lv {t.level}</Badge>
                </div>
              ))}
            </Card>
          )}
        </section>
      </main>

      <Dialog open={emailInviteOpen} onOpenChange={setEmailInviteOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Invite by email</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="invite-email">Email address</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="teammate@example.com"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && void sendEmailInvite()}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              We&apos;ll send an invite link to this email address. They don&apos;t need the team URL — just sign in and click to join.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailInviteOpen(false)}>Cancel</Button>
            <Button onClick={() => void sendEmailInvite()} disabled={sendingInvite || !inviteEmail.trim()}>
              {sendingInvite ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send Invite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Rename Team</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="edit-team-name">New Team Name</Label>
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
              Save Name
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
