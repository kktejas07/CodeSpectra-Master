'use client'

import { use, useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Loader2, Trophy, ArrowLeft, Users, Medal, Download,
  Share2, Linkedin, FileText, Award, Sparkles, CheckCircle, LogIn,
  Lock, Clock, Copy, Twitter, ChevronDown, ChevronUp,
} from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import QRCode from 'qrcode'
import { usePageGuard } from '@/lib/use-page-guard'

interface Hackathon {
  id: string; name: string; slug: string; description?: string
  num_teams: number; results_released: boolean; released_at?: string
  ends_at: string
  tasks: { problem_slug: string; problem_title: string; points: number; difficulty: string }[]
}

interface Team {
  id: string; name: string; slug: string
  xp: number; level: number; submissions: number
  members: Array<{ user_id: string; name: string; role: string }>
  achievements: Array<{ id: string; name: string }>
  captain?: string
}

interface Submission {
  id: string; team_id: string; problem_slug: string
  score: number | null; max_score: number; status: string
  feedback?: string; submitted_at: string
}

function getVerifyToken(teamQrToken: string): string {
  return teamQrToken
}

async function generateQRDataURL(text: string, size: number = 100): Promise<string> {
  try {
    return await QRCode.toDataURL(text, {
      errorCorrectionLevel: 'M',
      width: size,
      margin: 1,
      color: { dark: '#000000', light: '#ffffff' },
    })
  } catch { return '' }
}

function CountdownTimer({ targetDate, eventEnded }: { targetDate: string; eventEnded: boolean }) {
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 })

  useEffect(() => {
    const calculate = () => {
      const now = new Date().getTime()
      const target = new Date(targetDate).getTime()
      const diff = target - now

      if (diff > 0) {
        setTimeLeft({
          days: Math.floor(diff / (1000 * 60 * 60 * 24)),
          hours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
          minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
          seconds: Math.floor((diff % (1000 * 60)) / 1000),
        })
      }
    }

    calculate()
    const interval = setInterval(calculate, 1000)
    return () => clearInterval(interval)
  }, [targetDate])

  if (eventEnded) {
    return (
      <p className="text-sm text-muted-foreground">
        Results will be available soon. The event has ended.
      </p>
    )
  }

  return (
    <div className="flex gap-4 justify-center mt-4">
      {[
        { value: timeLeft.days, label: 'Days' },
        { value: timeLeft.hours, label: 'Hours' },
        { value: timeLeft.minutes, label: 'Minutes' },
        { value: timeLeft.seconds, label: 'Seconds' },
      ].map(({ value, label }) => (
        <div key={label} className="text-center">
          <div className="bg-muted/50 rounded-lg px-3 py-2 min-w-[60px]">
            <p className="text-2xl font-bold tabular-nums">{value}</p>
          </div>
          <p className="text-xs text-muted-foreground mt-1">{label}</p>
        </div>
      ))}
    </div>
  )
}

function LockedState({ hackathon }: { hackathon: Hackathon }) {
  const [notifyClicked, setNotifyClicked] = useState(false)
  const eventEnded = new Date(hackathon.ends_at).getTime() < Date.now()

  const handleNotify = () => {
    setNotifyClicked(true)
    setTimeout(() => {
      alert("You'll be notified when results are released")
    }, 100)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Card className="max-w-md w-full p-8 text-center border-primary/20">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted mx-auto mb-6">
          <Lock className="h-10 w-10 text-muted-foreground" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Results are not yet available</h1>
        <p className="text-muted-foreground mb-6">
          The organizers have not released the results yet.
        </p>

        <div className="bg-muted/30 rounded-lg p-4 mb-6">
          <p className="text-sm font-medium mb-2 flex items-center justify-center gap-2">
            <Clock className="h-4 w-4" />
            {eventEnded ? 'Event has ended' : 'Event ends in'}
          </p>
          <CountdownTimer targetDate={hackathon.ends_at} eventEnded={eventEnded} />
        </div>

        <Button onClick={handleNotify} variant="default" className="w-full gap-2" disabled={notifyClicked}>
          <Trophy className="h-4 w-4" />
          {notifyClicked ? 'You will be notified!' : 'Notify me when results are out'}
        </Button>
      </Card>
    </div>
  )
}

function TeamCardExpanded({
  team,
  submissions,
  tasks,
  rank,
}: {
  team: Team
  submissions: Submission[]
  tasks: Hackathon['tasks']
  rank: number
}) {
  const teamSubs = submissions.filter((s) => s.team_id === team.id && s.status === 'released')
  const solvedCount = new Set(teamSubs.filter((s) => s.score !== null && s.score > 0).map((s) => s.problem_slug)).size
  const captain = team.members.find((m) => m.role === 'captain') || team.members[0]

  return (
    <div className="border-t border-border/40 bg-muted/20">
      <div className="p-4 pl-12 space-y-3">
        <div className="flex items-center gap-4 text-sm">
          <div className="flex-1">
            <p className="text-xs text-muted-foreground">
              Captain: <span className="font-medium text-foreground">{captain?.name || 'Unknown'}</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Problems Solved</p>
            <div className="flex items-center gap-2">
              <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full"
                  style={{ width: `${(solvedCount / (tasks?.length || 1)) * 100}%` }}
                />
              </div>
              <span className="text-sm font-medium">{solvedCount} / {tasks?.length || 0}</span>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Total Submissions</p>
            <p className="text-sm font-medium">{team.submissions}</p>
          </div>
        </div>

        {tasks && tasks.length > 0 && (
          <div className="border-t border-border/30 pt-3">
            <p className="text-xs text-muted-foreground mb-2">Per-Problem Breakdown</p>
            <div className="grid gap-2">
              {tasks.map((task) => {
                const sub = teamSubs.find((s) => s.problem_slug === task.problem_slug)
                const solved = sub && sub.score !== null && sub.score > 0
                return (
                  <div key={task.problem_slug} className="flex items-center justify-between text-sm bg-background/50 rounded px-3 py-2">
                    <div className="flex items-center gap-2">
                      {solved ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <div className="h-4 w-4 rounded-full border border-muted-foreground/30" />
                      )}
                      <span className="font-medium">{task.problem_title}</span>
                      <Badge variant="outline" className="text-[10px]">{task.points} pts</Badge>
                    </div>
                    <div className="text-right">
                      {sub ? (
                        <span className={solved ? 'text-green-600 font-medium' : ''}>
                          {sub.score ?? '-'} / {sub.max_score}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function MyTeamResults({
  myTeam,
  submissions,
  tasks,
  myRank,
  teams,
}: {
  myTeam: Team
  submissions: Submission[]
  tasks: Hackathon['tasks']
  myRank: number
  teams: Team[]
}) {
  const teamSubs = submissions.filter((s) => s.team_id === myTeam.id && s.status === 'released')
  const captain = myTeam.members.find((m) => m.role === 'captain') || myTeam.members[0]

  return (
    <Card className="p-6 border-primary/30 bg-primary/5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <Medal className={`h-8 w-8 ${myRank === 1 ? 'text-yellow-500' : myRank === 2 ? 'text-gray-400' : myRank === 3 ? 'text-amber-600' : 'text-primary'}`} />
            <div>
              <h2 className="text-2xl font-bold">{myTeam.name}</h2>
              <p className="text-sm text-muted-foreground">
                Captain: {captain?.name || 'Unknown'} · {myTeam.xp} XP · Level {myTeam.level}
              </p>
            </div>
          </div>
        </div>
        <Badge variant="default" className="text-lg px-4 py-1">
          Rank #{myRank} of {teams.length}
        </Badge>
      </div>

      {tasks && tasks.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">Your Performance by Problem</h3>
          {tasks.map((task) => {
            const sub = teamSubs.find((s) => s.problem_slug === task.problem_slug)
            const solved = sub && sub.score !== null && sub.score > 0

            const allScoresForTask = submissions
              .filter((s) => s.problem_slug === task.problem_slug && s.status === 'released' && s.score !== null)
              .map((s) => s.score!)
              .sort((a, b) => b - a)
            const isTopScore = sub && allScoresForTask[0] === sub.score
            const rankForTask = sub ? allScoresForTask.indexOf(sub.score!) + 1 : null

            return (
              <div key={task.problem_slug} className={`flex items-center justify-between p-3 rounded-lg ${solved ? 'bg-green-500/10' : 'bg-muted/30'}`}>
                <div className="flex items-center gap-3">
                  {solved ? (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  ) : (
                    <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30" />
                  )}
                  <div>
                    <p className="font-medium">{task.problem_title}</p>
                    <p className="text-xs text-muted-foreground">
                      {solved ? (
                        isTopScore ? 'Top score!' : rankForTask ? `Rank #${rankForTask} on this problem` : ''
                      ) : 'Not solved'}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  {sub ? (
                    <p className={`font-bold ${solved ? 'text-green-600' : ''}`}>
                      {sub.score} / {sub.max_score}
                    </p>
                  ) : (
                    <p className="text-muted-foreground">—</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

export default function HackathonResultsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const gate = usePageGuard('user')
  const { user: authUser } = useAuth()
  const hasSession = authUser?.uid
  const certRef = useRef<HTMLDivElement>(null)
  const [hackathon, setHackathon] = useState<Hackathon | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [myTeam, setMyTeam] = useState<Team | null>(null)
  const [copied, setCopied] = useState(false)
  const [certGenerated, setCertGenerated] = useState(false)
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set())
  const [certificateId, setCertificateId] = useState<string>('')

  const load = useCallback(async () => {
    try {
      const [hRes] = await Promise.all([
        fetch(`/api/hackathons/${slug}?by=slug`, { cache: 'no-store' }),
      ])
      if (!hRes.ok) throw new Error('Event not found')
      const hk = await hRes.json() as Hackathon
      setHackathon(hk)

      if (!hk.results_released) {
        setLoading(false)
        return
      }

      const [tRes, sRes] = await Promise.all([
        fetch(`/api/hackathons/${slug}/teams`, { cache: 'no-store' }),
        fetch(`/api/hackathons/${slug}/submissions`, { cache: 'no-store' }),
      ])

      if (tRes.ok) {
        const j = await tRes.json() as { items: Team[] }
        const sorted = j.items.sort((a, b) => b.xp - a.xp)
        setTeams(sorted)
        if (hasSession) {
          const my = sorted.find((t) => t.members.some((m) => m.user_id === hasSession))
          setMyTeam(my || null)
        }
      }
      if (sRes.ok) {
        const j = await sRes.json() as { items: Submission[] }
        setSubmissions(j.items)
      }
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setLoading(false) }
  }, [slug, hasSession])

  useEffect(() => { void load() }, [load])

  const myRank = myTeam ? teams.findIndex((t) => t.id === myTeam.id) + 1 : null

  const toggleTeamExpand = (teamId: string) => {
    setExpandedTeams((prev) => {
      const next = new Set(prev)
      if (next.has(teamId)) {
        next.delete(teamId)
      } else {
        next.add(teamId)
      }
      return next
    })
  }

  const copyResultsLink = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const shareOnTwitter = () => {
    if (typeof window !== 'undefined' && hackathon) {
      const text = encodeURIComponent(`Check out the ${hackathon.name} results on CodeSpectra!`)
      const url = encodeURIComponent(window.location.href)
      window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, '_blank', 'width=600,height=400')
    }
  }

  const linkedinShareUrl = myTeam && myRank
    ? `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(typeof window !== 'undefined' ? window.location.href : '')}&text=${encodeURIComponent(`I ranked #${myRank} in ${hackathon?.name || 'a hackathon'} on CodeSpectra!`)}`
    : ''

  const downloadCert = async () => {
    if (!certRef.current || !myTeam || !myRank || !hackathon) return
    setCertGenerated(true)

    const certId = `${hackathon.slug}-${myTeam.id}-${hackathon.released_at || Date.now()}`
    setCertificateId(certId)

    const canvas = document.createElement('canvas')
    canvas.width = 800
    canvas.height = 600
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const token = getVerifyToken(hackathon.slug, myTeam.id, hackathon.released_at)
    const qrDataUrl = await generateQRDataURL(`${typeof window !== 'undefined' ? window.location.origin : ''}/hackathons/verify/${token}`, 80)

    const teamSubs = submissions.filter((s) => s.team_id === myTeam.id && s.status === 'released')
    const solvedCount = new Set(teamSubs.filter((s) => s.score !== null && s.score > 0).map((s) => s.problem_slug)).size
    const captain = myTeam.members.find((m) => m.role === 'captain') || myTeam.members[0]

    const grad = ctx.createLinearGradient(0, 0, 800, 600)
    grad.addColorStop(0, '#6366f1')
    grad.addColorStop(1, '#8b5cf6')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, 800, 600)

    ctx.strokeStyle = 'rgba(255,255,255,0.3)'
    ctx.lineWidth = 4
    ctx.strokeRect(20, 20, 760, 560)

    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 48px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('Certificate of Achievement', 400, 100)

    ctx.beginPath()
    ctx.moveTo(200, 125)
    ctx.lineTo(600, 125)
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'
    ctx.lineWidth = 2
    ctx.stroke()

    ctx.font = '18px sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.fillText('This certifies that the team', 400, 175)

    ctx.font = 'bold 36px sans-serif'
    ctx.fillStyle = '#ffffff'
    ctx.fillText(myTeam.name, 400, 220)

    ctx.font = '16px sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.fillText(`led by ${captain?.name || 'Unknown'} • Captain`, 400, 255)

    ctx.font = '18px sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.fillText(`achieved Rank #${myRank} of ${teams.length} teams in`, 400, 300)

    ctx.font = 'bold 28px sans-serif'
    ctx.fillStyle = '#ffffff'
    ctx.fillText(hackathon.name, 400, 340)

    ctx.font = '16px sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    ctx.fillText(`${solvedCount} / ${hackathon.tasks?.length || 0} Problems Solved`, 400, 380)

    ctx.font = '14px sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.6)'
    ctx.fillText(`Event: ${hackathon.name}`, 400, 420)
    if (hackathon.released_at) {
      ctx.fillText(
        `Results released: ${new Date(hackathon.released_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`,
        400, 445
      )
    }

    if (qrDataUrl) {
      const img = new Image()
      img.src = qrDataUrl
      ctx.drawImage(img, 680, 480, 80, 80)
    }

    ctx.font = '12px monospace'
    ctx.fillStyle = 'rgba(255,255,255,0.4)'
    ctx.fillText(`ID: ${certId}`, 40, 560)

    ctx.font = '11px sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.fillText('Scan QR or visit /cert/verify to verify', 40, 580)

    setTimeout(() => {
      const link = document.createElement('a')
      link.download = `certificate-${hackathon.slug}-${myTeam.slug}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
    }, 100)
  }

  const shareResults = () => {
    if (typeof window !== 'undefined' && linkedinShareUrl) {
      window.open(linkedinShareUrl, '_blank', 'width=600,height=600')
    }
  }

  if (loading) return <div className="flex min-h-screen items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading results…</div>

  if (!gate.allowed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Card className="max-w-sm w-full p-8 text-center border-primary/20">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 mx-auto mb-4">
            <Trophy className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-xl font-bold mb-2">Sign in required</h1>
          <p className="text-sm text-muted-foreground mb-6">
            Please sign in to view hackathon results.
          </p>
          <div className="flex flex-col gap-2">
            <Link href={`/auth/login?redirect=${encodeURIComponent(`/hackathons/${slug}/results`)}`}>
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

  if (!hackathon) return <div className="p-10 text-center"><p className="text-sm text-destructive">{error || 'Event not found'}</p></div>

  if (!hackathon.results_released) {
    return <LockedState hackathon={hackathon} />
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/40 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href={`/hackathons/${slug}`} className="text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="inline h-3 w-3 mr-1" /> Back to event
          </Link>
          <Badge variant="default" className="gap-1">
            <CheckCircle className="h-3 w-3" /> Results
          </Badge>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-8 px-6 py-10">
        <section className="text-center">
          <Trophy className="h-12 w-12 text-primary mx-auto mb-3" />
          <h1 className="text-4xl font-bold">{hackathon.name}</h1>
          <p className="text-muted-foreground mt-2">Final Results</p>
          {hackathon.released_at && (
            <p className="text-xs text-muted-foreground mt-1">
              Released {new Date(hackathon.released_at).toLocaleString()}
            </p>
          )}
        </section>

        {myTeam && myRank && (
          <MyTeamResults
            myTeam={myTeam}
            submissions={submissions}
            tasks={hackathon.tasks}
            myRank={myRank}
            teams={teams}
          />
        )}

        <Card className="p-6 border-primary/30 bg-primary/5">
          <div className="flex flex-wrap justify-center gap-3">
            {linkedinShareUrl && (
              <Button onClick={shareResults} variant="default">
                <Linkedin className="h-4 w-4 mr-1" /> Share on LinkedIn
              </Button>
            )}
            <Button onClick={shareOnTwitter} variant="outline">
              <Twitter className="h-4 w-4 mr-1" /> Share on X
            </Button>
            <Button onClick={copyResultsLink} variant="outline">
              <Copy className="h-4 w-4 mr-1" /> {copied ? 'Copied!' : 'Copy results link'}
            </Button>
            {myTeam && (
              <Button onClick={downloadCert} variant="outline">
                <Download className="h-4 w-4 mr-1" /> Download Certificate
              </Button>
            )}
          </div>
        </Card>

        <div ref={certRef} style={{ display: 'none' }} />

        <section>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Trophy className="h-5 w-5 text-primary" /> Final Leaderboard
          </h2>
          <Card className="overflow-hidden">
            {teams.map((t, i) => {
              const teamSubs = submissions.filter((s) => s.team_id === t.id && s.status === 'released')
              const solvedCount = new Set(teamSubs.filter((s) => s.score !== null && s.score > 0).map((s) => s.problem_slug)).size
              const isExpanded = expandedTeams.has(t.id)

              return (
                <div key={t.id}>
                  <div
                    className={`flex items-center gap-4 p-4 cursor-pointer hover:bg-muted/30 transition-colors ${myTeam?.id === t.id ? 'bg-primary/5' : ''}`}
                    onClick={() => toggleTeamExpand(t.id)}
                  >
                    <span className={`w-10 text-2xl font-bold tabular-nums text-center ${i === 0 ? 'text-yellow-500' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                    </span>
                    <div className="flex-1">
                      <p className="font-medium">{t.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.members.map((m) => m.name).join(', ')} · {t.submissions} submissions
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full"
                            style={{ width: `${(solvedCount / (hackathon.tasks?.length || 1)) * 100}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-muted-foreground">
                          {solvedCount} / {hackathon.tasks?.length || 0} solved
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-lg">{t.xp} <span className="text-xs font-normal text-muted-foreground">XP</span></p>
                      <p className="text-xs text-muted-foreground">Lv.{t.level}</p>
                    </div>
                    {t.achievements.length > 0 && (
                      <div className="flex gap-1">
                        {t.achievements.map((a) => (
                          <Badge key={a.id} variant="outline" className="text-[10px]">
                            <Sparkles className="h-3 w-3 mr-1" />{a.name}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  {isExpanded && (
                    <TeamCardExpanded
                      team={t}
                      submissions={submissions}
                      tasks={hackathon.tasks}
                      rank={i + 1}
                    />
                  )}
                </div>
              )
            })}
          </Card>
        </section>

        {submissions.length > 0 && hackathon.tasks && hackathon.tasks.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" /> Submission Breakdown
            </h2>
            <div className="space-y-6">
              {hackathon.tasks.map((task) => {
                const taskSubs = submissions.filter(
                  (s) => s.problem_slug === task.problem_slug && s.status === 'released'
                ).sort((a, b) => {
                  if (a.score === null && b.score === null) return 0
                  if (a.score === null) return 1
                  if (b.score === null) return -1
                  return b.score - a.score
                })

                const medals = ['🥇', '🥈', '🥉']

                return (
                  <Card key={task.problem_slug} className="overflow-hidden">
                    <div className="p-4 bg-muted/30 border-b border-border/40">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{task.problem_title}</p>
                          <p className="text-xs text-muted-foreground">
                            {task.difficulty} · {task.points} pts
                          </p>
                        </div>
                        <Badge variant="outline">
                          {taskSubs.length} submission{taskSubs.length !== 1 ? 's' : ''}
                        </Badge>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border/40 bg-muted/20">
                            <th className="text-left p-3 font-medium text-muted-foreground">Rank</th>
                            <th className="text-left p-3 font-medium text-muted-foreground">Team</th>
                            <th className="text-right p-3 font-medium text-muted-foreground">Score</th>
                            <th className="text-left p-3 font-medium text-muted-foreground">Feedback</th>
                            <th className="text-right p-3 font-medium text-muted-foreground">Submitted</th>
                          </tr>
                        </thead>
                        <tbody>
                          {taskSubs.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="p-4 text-center text-muted-foreground">
                                No submissions yet
                              </td>
                            </tr>
                          ) : (
                            taskSubs.map((sub, idx) => {
                              const team = teams.find((t) => t.id === sub.team_id)
                              const isMedaled = idx < 3
                              return (
                                <tr key={sub.id} className={`border-b border-border/30 ${isMedaled ? 'bg-muted/10' : ''}`}>
                                  <td className="p-3">
                                    {isMedaled ? (
                                      <span className="text-lg">{medals[idx]}</span>
                                    ) : (
                                      <span className="text-muted-foreground">#{idx + 1}</span>
                                    )}
                                  </td>
                                  <td className="p-3 font-medium">{team?.name || 'Unknown'}</td>
                                  <td className="p-3 text-right">
                                    {sub.score !== null ? (
                                      <span className={isMedaled ? 'font-bold' : ''}>
                                        {sub.score} / {sub.max_score}
                                      </span>
                                    ) : (
                                      <span className="text-muted-foreground">—</span>
                                    )}
                                  </td>
                                  <td className="p-3 max-w-xs truncate">
                                    {sub.feedback ? (
                                      <span className="text-muted-foreground text-xs">{sub.feedback}</span>
                                    ) : (
                                      <span className="text-muted-foreground">—</span>
                                    )}
                                  </td>
                                  <td className="p-3 text-right text-muted-foreground text-xs">
                                    {new Date(sub.submitted_at).toLocaleDateString()}
                                  </td>
                                </tr>
                              )
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                )
              })}
            </div>
          </section>
        )}

        <section className="flex flex-wrap gap-3 justify-center pt-4 border-t border-border">
          <Button variant="outline" onClick={() => window.print()}>
            <FileText className="h-4 w-4 mr-1" /> Print / PDF
          </Button>
          {linkedinShareUrl && (
            <Button onClick={shareResults} variant="outline">
              <Linkedin className="h-4 w-4 mr-1" /> Share on LinkedIn
            </Button>
          )}
          {myTeam && (
            <Button onClick={downloadCert}>
              <Award className="h-4 w-4 mr-1" /> Download Certificate
            </Button>
          )}
        </section>
      </main>
    </div>
  )
}