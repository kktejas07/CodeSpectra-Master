'use client'

import { use, useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Loader2, Trophy, ArrowLeft, Users, Medal, Download,
  Share2, Linkedin, FileText, Award, Sparkles, CheckCircle,
} from 'lucide-react'
import { useAuth } from '@/lib/auth-context'

interface Hackathon {
  id: string; name: string; slug: string; description?: string
  num_teams: number; results_released: boolean; released_at?: string
  tasks: { problem_slug: string; problem_title: string; points: number; difficulty: string }[]
}

interface Team {
  id: string; name: string; slug: string
  xp: number; level: number; submissions: number
  members: Array<{ user_id: string; name: string; role: string }>
  achievements: Array<{ id: string; name: string }>
}

interface Submission {
  id: string; team_id: string; problem_slug: string
  score: number | null; max_score: number; status: string
  feedback?: string; submitted_at: string
}

export default function HackathonResultsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
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

  const load = useCallback(async () => {
    try {
      const [hRes, tRes, sRes] = await Promise.all([
        fetch(`/api/hackathons/${slug}?by=slug`, { cache: 'no-store' }),
        fetch(`/api/hackathons/${slug}/teams`, { cache: 'no-store' }),
        fetch(`/api/hackathons/${slug}/submissions`, { cache: 'no-store' }),
      ])
      if (!hRes.ok) throw new Error('Event not found')
      const hk = await hRes.json() as Hackathon
      setHackathon(hk)
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

  const linkedinShareUrl = myTeam && myRank
    ? `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(typeof window !== 'undefined' ? window.location.href : '')}&text=${encodeURIComponent(`I ranked #${myRank} in ${hackathon?.name || 'a hackathon'} on CodeSpectra!`)}`
    : ''

  const downloadCert = () => {
    if (!certRef.current || !myTeam || !myRank) return
    setCertGenerated(true)
    const canvas = document.createElement('canvas')
    canvas.width = 800
    canvas.height = 600
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Background
    const grad = ctx.createLinearGradient(0, 0, 800, 600)
    grad.addColorStop(0, '#6366f1')
    grad.addColorStop(1, '#8b5cf6')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, 800, 600)

    // Border
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'
    ctx.lineWidth = 4
    ctx.strokeRect(20, 20, 760, 560)

    // Title
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 48px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('Certificate of Achievement', 400, 120)

    // Decorative line
    ctx.beginPath()
    ctx.moveTo(200, 150)
    ctx.lineTo(600, 150)
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'
    ctx.lineWidth = 2
    ctx.stroke()

    // Body
    ctx.font = '20px sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.fillText('This certifies that', 400, 210)
    ctx.font = 'bold 32px sans-serif'
    ctx.fillStyle = '#ffffff'
    ctx.fillText(myTeam.name, 400, 260)
    ctx.font = '20px sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.fillText(`ranked #${myRank} of ${teams.length} teams in`, 400, 310)
    ctx.font = 'bold 28px sans-serif'
    ctx.fillStyle = '#ffffff'
    ctx.fillText(hackathon?.name || '', 400, 360)

    // Date
    ctx.font = '16px sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    ctx.fillText(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), 400, 430)

    // Verify badge
    ctx.font = '14px sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.fillText('Verified on CodeSpectra', 400, 490)

    const link = document.createElement('a')
    link.download = `certificate-${hackathon?.slug}-${myTeam.slug}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
  }

  const shareResults = () => {
    if (typeof window !== 'undefined' && linkedinShareUrl) {
      window.open(linkedinShareUrl, '_blank', 'width=600,height=600')
    }
  }

  if (loading) return <div className="flex min-h-screen items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading results…</div>
  if (!hackathon) return <div className="p-10 text-center"><p className="text-sm text-destructive">{error || 'Event not found'}</p></div>

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
        {/* Title */}
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

        {/* My Team Section (if logged in) */}
        {myTeam && myRank && (
          <Card className="p-6 border-primary/30 bg-primary/5 text-center">
            <Medal className={`h-10 w-10 mx-auto mb-2 ${myRank === 1 ? 'text-yellow-500' : myRank === 2 ? 'text-gray-400' : myRank === 3 ? 'text-amber-600' : 'text-primary'}`} />
            <h2 className="text-2xl font-bold">{myTeam.name}</h2>
            <p className="text-lg text-muted-foreground">Rank #{myRank} of {teams.length} · {myTeam.xp} XP · Level {myTeam.level}</p>
            <div className="flex flex-wrap justify-center gap-3 mt-4">
              {linkedinShareUrl && (
                <Button onClick={shareResults} variant="default">
                  <Linkedin className="h-4 w-4 mr-1" /> Share on LinkedIn
                </Button>
              )}
              <Button onClick={downloadCert} variant="outline">
                <Download className="h-4 w-4 mr-1" /> Download Certificate
              </Button>
            </div>
          </Card>
        )}

        {/* Hidden certificate canvas reference */}
        <div ref={certRef} style={{ display: 'none' }} />

        {/* Leaderboard */}
        <section>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Trophy className="h-5 w-5 text-primary" /> Final Leaderboard
          </h2>
          <Card className="divide-y divide-border/60 overflow-hidden">
            {teams.map((t, i) => (
              <div key={t.id} className={`flex items-center gap-4 p-4 ${myTeam?.id === t.id ? 'bg-primary/5' : ''}`}>
                <span className={`w-10 text-2xl font-bold tabular-nums text-center ${i === 0 ? 'text-yellow-500' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                </span>
                <div className="flex-1">
                  <p className="font-medium">{t.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.members.map((m) => m.name).join(', ')} · {t.submissions} submissions
                  </p>
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
              </div>
            ))}
          </Card>
        </section>

        {/* Detailed Breakdown */}
        {submissions.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" /> Submission Breakdown
            </h2>
            <div className="space-y-3">
              {hackathon.tasks?.map((task) => {
                const taskSubs = submissions.filter((s) => s.problem_slug === task.problem_slug)
                if (taskSubs.length === 0) return null
                return (
                  <Card key={task.problem_slug} className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="font-medium">{task.problem_title}</p>
                        <p className="text-xs text-muted-foreground">{task.difficulty} · {task.points} pts</p>
                      </div>
                      <Badge variant="outline">{taskSubs.filter((s) => s.status === 'released').length} submissions</Badge>
                    </div>
                    {taskSubs.filter((s) => s.status === 'released').map((sub) => {
                      const team = teams.find((t) => t.id === sub.team_id)
                      return (
                        <div key={sub.id} className="flex items-center justify-between py-1 text-sm border-t border-border/20">
                          <span>{team?.name || 'Unknown'}</span>
                          <span className="font-medium">{sub.score ?? '-'} / {sub.max_score}</span>
                        </div>
                      )
                    })}
                  </Card>
                )
              })}
            </div>
          </section>
        )}

        {/* Share & Export */}
        <section className="flex flex-wrap gap-3 justify-center pt-4">
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
