'use client'

import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Loader2, Trophy, Users, Clock, CalendarDays, ScanLine,
  Sparkles, ArrowRight, CheckCircle, ListChecks, Shield,
  Copy, ExternalLink, Share2,
} from 'lucide-react'
import { useAuth } from '@/lib/auth-context'

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
  const { user: authUser } = useAuth()
  const hasSession = authUser?.uid
  const [hackathon, setHackathon] = useState<Hackathon | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newTeamName, setNewTeamName] = useState('')
  const [creating, setCreating] = useState(false)
  const [newQrSvg, setNewQrSvg] = useState<string | null>(null)
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [myTeam, setMyTeam] = useState<Team | null>(null)
  const [copied, setCopied] = useState(false)

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
    setCreating(true); setError(null); setNewQrSvg(null); setInviteUrl(null)
    try {
      const res = await fetch(`/api/hackathons/${slug}/teams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTeamName || undefined }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'failed')
      setNewTeamName('')
      setNewQrSvg(j.qr_svg as string)
      setInviteUrl(j.qr_url as string)
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setCreating(false) }
  }

  const copyInvite = async () => {
    if (inviteUrl) {
      await navigator.clipboard.writeText(inviteUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
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
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">← CodeSpectra</Link>
          <div className="flex items-center gap-3">
            {myTeam && (
              <Link href={`/dashboard/challenges`}>
                <Button size="sm" variant="outline"><ListChecks className="h-3.5 w-3.5 mr-1" /> Go to Problems</Button>
              </Link>
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
                      <Link key={task.problem_slug} href={`/dashboard/challenges/${task.problem_slug}`}
                        className="flex items-center justify-between p-2 rounded hover:bg-muted/50 text-sm">
                        <span>{task.problem_title}</span>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px]">{task.difficulty}</Badge>
                          <span className="text-xs text-muted-foreground">{task.points} pts</span>
                          <ArrowRight className="h-3 w-3" />
                        </div>
                      </Link>
                    ))}
                  </div>
                )}

                {/* Invite link */}
                {inviteUrl && (
                  <div className="rounded-lg border border-primary/40 bg-primary/5 p-3">
                    <p className="text-xs font-semibold text-primary mb-2">Share this invite link with your team:</p>
                    <div className="flex gap-2">
                      <code className="flex-1 text-xs truncate rounded bg-background px-2 py-1.5 border">{inviteUrl}</code>
                      <Button size="sm" variant="outline" onClick={copyInvite}>
                        {copied ? 'Copied!' : <Copy className="h-3 w-3" />}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Saved QR (from registration) */}
                {newQrSvg && (
                  <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 mt-2">
                    <p className="text-xs font-semibold text-primary mb-2">Team QR Code — share with members</p>
                    <div className="mx-auto inline-block rounded-md bg-white p-2" style={{ width: 160 }}
                      dangerouslySetInnerHTML={{ __html: newQrSvg }} />
                  </div>
                )}
              </div>
            ) : (
              <div>
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
                  <Link href={`/qr/${t.qr_token}`} target="_blank" className="text-muted-foreground hover:text-foreground" title="Open team QR">
                    <ScanLine className="h-4 w-4" />
                  </Link>
                  <Link href={`/qr/${t.qr_token}`} target="_blank" className="text-muted-foreground hover:text-foreground">
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              ))}
            </Card>
          )}
        </section>
      </main>
    </div>
  )
}
