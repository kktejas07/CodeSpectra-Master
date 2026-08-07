'use client'

import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Loader2, ArrowLeft, AlertTriangle, Users, Clock, Activity,
  Shield, Copy, Eye, Download, ChevronDown, ChevronRight,
  FileText, CheckCircle, XCircle, Timer, Trophy,
} from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'

interface Hackathon {
  id: string; name: string; slug: string; status: string
  starts_at: string; ends_at: string; timeout_minutes: number
  tasks: Array<{ problem_slug: string; problem_title: string; points: number; difficulty: string }>
}

interface Team {
  id: string; name: string; xp: number; level: number
  members: Array<{ user_id: string; name: string; role: string }>
}

interface Submission {
  id: string; team_id: string; problem_slug: string; score: number | null; max_score: number
  submitted_at: string; status: string
}

interface ProctorEvent {
  id: string; team_id: string; user_id: string; type: string
  severity: 'low' | 'medium' | 'high' | 'critical'; problem_slug?: string
  meta?: Record<string, unknown>; created_at: string
}

interface ActivityEvent {
  id: string; team_id: string; user_id: string; type: string
  problem_slug?: string; meta?: Record<string, unknown>; created_at: string
}

type SeverityLevel = 'low' | 'medium' | 'high' | 'critical'

const severityWeight: Record<SeverityLevel, number> = { low: 1, medium: 3, high: 7, critical: 15 }

const severityColors: Record<SeverityLevel, string> = {
  low: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  medium: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  high: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  critical: 'bg-red-200 text-red-900 dark:bg-red-900/50 dark:text-red-300',
}

function getSuspicionScore(events: ProctorEvent[]): { score: number; level: SeverityLevel } {
  const score = events.reduce((acc, e) => acc + (severityWeight[e.severity] || 0), 0)
  let level: SeverityLevel = 'low'
  if (score >= 20) level = 'critical'
  else if (score >= 10) level = 'high'
  else if (score >= 4) level = 'medium'
  return { score, level }
}

function formatDuration(ms: number): string {
  const secs = Math.floor(ms / 1000)
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ${secs % 60}s`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

export default function HackathonReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const gate = usePageGuard('superadmin')
  const [hackathon, setHackathon] = useState<Hackathon | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [proctorEvents, setProctorEvents] = useState<ProctorEvent[]>([])
  const [activityEvents, setActivityEvents] = useState<ActivityEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null)
  const [filterSeverity, setFilterSeverity] = useState<SeverityLevel | 'all'>('all')

  const load = useCallback(async () => {
    try {
      const hRes = await fetch(`/api/hackathons/${id}`, { cache: 'no-store' })
      const hk = hRes.ok ? await hRes.json() : null
      setHackathon(hk)

      if (!hk) return
      const [tRes, sRes, pRes] = await Promise.all([
        fetch(`/api/hackathons/${id}/teams`, { cache: 'no-store' }),
        fetch(`/api/hackathons/${id}/judge-submissions`, { cache: 'no-store' }),
        fetch(`/api/hackathons/proctor-events?hackathon_id=${hk.id}`, { cache: 'no-store' }),
      ])
      const tData = tRes.ok ? await tRes.json() : { items: [] }
      setTeams(tData.items || [])
      const sData = sRes.ok ? await sRes.json() : { items: [] }
      setSubmissions(sData.items || [])
      const pData = pRes.ok ? await pRes.json() : { events: [] }
      setProctorEvents(pData.events || [])
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [id])

  useEffect(() => { if (gate.ready) void load() }, [gate.ready, load])

  if (!gate.ready || loading) {
    return <div className="flex min-h-[40vh] items-center justify-center gap-2 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" /> Loading report…
    </div>
  }

  if (!hackathon) {
    return <div className="p-8 text-center text-muted-foreground">Hackathon not found</div>
  }

  const totalSuspicion = proctorEvents.reduce((acc, e) => acc + (severityWeight[e.severity] || 0), 0)
  const criticalTeams = [...new Set(proctorEvents.filter(e => e.severity === 'critical').map(e => e.team_id))]

  const filteredEvents = filterSeverity === 'all'
    ? proctorEvents
    : proctorEvents.filter(e => e.severity === filterSeverity)

  const teamSuspicion = (teamId: string) => {
    const evs = proctorEvents.filter(e => e.team_id === teamId)
    return getSuspicionScore(evs)
  }

  const eventTypeLabel: Record<string, string> = {
    tab_blur: 'Tab hidden', tab_focus: 'Tab focused',
    copy_attempt: 'Copy blocked', paste_attempt: 'Paste blocked',
    right_click: 'Right-click blocked', fullscreen_exit: 'Fullscreen exit',
    idle_warning: 'Idle warning', suspicious_activity: 'Suspicious',
  }

  const eventTypeIcon: Record<string, React.ReactNode> = {
    tab_blur: <Eye className="h-3.5 w-3.5" />,
    copy_attempt: <Copy className="h-3.5 w-3.5" />,
    paste_attempt: <Copy className="h-3.5 w-3.5" />,
    right_click: <XCircle className="h-3.5 w-3.5" />,
    idle_warning: <Timer className="h-3.5 w-3.5" />,
    suspicious_activity: <AlertTriangle className="h-3.5 w-3.5" />,
    tab_focus: <Eye className="h-3.5 w-3.5" />,
    fullscreen_exit: <Activity className="h-3.5 w-3.5" />,
  }

  const exportCSV = () => {
    const rows = [
      ['Team', 'Member', 'Event Type', 'Severity', 'Problem', 'Timestamp'],
      ...proctorEvents.map(e => {
        const t = teams.find(t => t.id === e.team_id)
        const member = t?.members.find(m => m.user_id === e.user_id)
        return [t?.name || '', member?.name || '', eventTypeLabel[e.type] || e.type, e.severity, e.problem_slug || '', e.created_at]
      }),
    ]
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${hackathon.slug}-proctor-log.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href={`/dashboard/admin/hackathons/${id}`}>
            <Button variant="ghost" size="icon" title="Back"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">{hackathon.name} — Judge Report</h1>
            <p className="text-sm text-muted-foreground">Activity logs, proctor events & suspicion scores</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={exportCSV}>
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
          <Badge variant={hackathon.status === 'live' ? 'default' : 'secondary'} className="uppercase">
            {hackathon.status}
          </Badge>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Teams', value: teams.length, icon: <Users className="h-4 w-4" /> },
          { label: 'Total Proctor Events', value: proctorEvents.length, icon: <Shield className="h-4 w-4" />, accent: proctorEvents.length > 0 },
          { label: 'Suspicion Score', value: totalSuspicion, icon: <AlertTriangle className="h-4 w-4" />, accent: totalSuspicion > 10 },
          { label: 'Flagged Teams', value: criticalTeams.length, icon: <Activity className="h-4 w-4" />, accent: criticalTeams.length > 0 },
        ].map(stat => (
          <Card key={stat.label} className={`p-4 ${stat.accent ? 'border-red-200 dark:border-red-800' : ''}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground uppercase tracking-wider">{stat.label}</span>
              <span className={`${stat.accent ? 'text-red-500' : 'text-muted-foreground'}`}>{stat.icon}</span>
            </div>
            <p className={`text-2xl font-bold ${stat.accent ? 'text-red-500' : ''}`}>{stat.value}</p>
          </Card>
        ))}
      </div>

      {/* Per-team breakdown */}
      <Card className="p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
          <Users className="h-4 w-4" /> Team Breakdown
        </h2>
        {teams.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No teams registered</p>
        ) : (
          <div className="space-y-2">
            {teams.sort((a, b) => {
              const sa = teamSuspicion(a.id).score; const sb = teamSuspicion(b.id).score
              return sb - sa
            }).map(team => {
              const { score, level } = teamSuspicion(team.id)
              const expanded = expandedTeam === team.id
              const teamProctor = proctorEvents.filter(e => e.team_id === team.id)
              const teamSubs = submissions.filter(s => s.team_id === team.id)

              return (
                <div key={team.id} className="border rounded-lg overflow-hidden">
                  <button
                    className="w-full flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors text-left"
                    onClick={() => setExpandedTeam(expanded ? null : team.id)}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{team.name}</span>
                        <Badge variant="outline">{team.members.length} members</Badge>
                        {score > 0 && (
                          <Badge className={severityColors[level]}>{level.toUpperCase()} ({score})</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {team.members.map(m => m.name).join(', ')}
                      </p>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>{teamProctor.length} proctor events</span>
                      <span>{teamSubs.length} submissions</span>
                      <span>{team.xp} XP</span>
                      {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </div>
                  </button>

                  {expanded && (
                    <div className="border-t p-4 space-y-4 bg-muted/20">
                      {teamProctor.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Proctor Events</p>
                          <div className="space-y-1 max-h-48 overflow-y-auto">
                            {teamProctor.slice(0, 50).map(evt => (
                              <div key={evt.id} className="flex items-center gap-2 text-xs py-1 border-b border-border/50">
                                <span className={severityColors[evt.severity].split(' ')[0] + ' ' + severityColors[evt.severity].split(' ').slice(1).join(' ')}>
                                  {eventTypeIcon[evt.type] || <Activity className="h-3.5 w-3.5" />}
                                </span>
                                <span className="text-muted-foreground">{eventTypeLabel[evt.type] || evt.type}</span>
                                {evt.problem_slug && <Badge variant="outline" className="text-[10px]">{evt.problem_slug}</Badge>}
                                <span className="ml-auto text-muted-foreground font-mono">
                                  {new Date(evt.created_at).toLocaleTimeString()}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {teamSubs.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Submissions</p>
                          <div className="space-y-1">
                            {teamSubs.map(sub => (
                              <div key={sub.id} className="flex items-center gap-2 text-xs py-1">
                                <span className={sub.score !== null && sub.score >= sub.max_score * 0.5 ? 'text-green-500' : 'text-yellow-500'}>
                                  {sub.score !== null && sub.score >= sub.max_score * 0.5
                                    ? <CheckCircle className="h-3.5 w-3.5" />
                                    : <Clock className="h-3.5 w-3.5" />}
                                </span>
                                <Badge variant="outline" className="text-[10px]">{sub.problem_slug}</Badge>
                                <span className="font-mono text-muted-foreground">{sub.score ?? '—'}/{sub.max_score}</span>
                                <span className="ml-auto text-muted-foreground">
                                  {new Date(sub.submitted_at).toLocaleTimeString()}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {teamProctor.length === 0 && teamSubs.length === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-4">No events recorded for this team</p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* Full proctor event log */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <FileText className="h-4 w-4" /> Proctor Event Log
          </h2>
          <div className="flex gap-1">
            {(['all', 'low', 'medium', 'high', 'critical'] as const).map(s => (
              <Button
                key={s}
                size="sm"
                variant={filterSeverity === s ? 'default' : 'outline'}
                className="text-xs h-7"
                onClick={() => setFilterSeverity(s)}
              >
                {s === 'all' ? 'All' : s.toUpperCase()}
              </Button>
            ))}
          </div>
        </div>
        {filteredEvents.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No proctor events recorded</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground uppercase tracking-wider">
                  <th className="text-left py-2 pr-4">Team</th>
                  <th className="text-left py-2 pr-4">Event</th>
                  <th className="text-left py-2 pr-4">Problem</th>
                  <th className="text-left py-2 pr-4">Severity</th>
                  <th className="text-left py-2">Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {filteredEvents.slice(0, 200).map(evt => {
                  const t = teams.find(t => t.id === evt.team_id)
                  const member = t?.members.find(m => m.user_id === evt.user_id)
                  return (
                    <tr key={evt.id} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="py-2 pr-4">
                        <div className="font-medium">{t?.name || '—'}</div>
                        <div className="text-xs text-muted-foreground">{member?.name || '—'}</div>
                      </td>
                      <td className="py-2 pr-4">
                        <div className="flex items-center gap-1.5">
                          {eventTypeIcon[evt.type] || <Activity className="h-3.5 w-3.5" />}
                          <span>{eventTypeLabel[evt.type] || evt.type}</span>
                        </div>
                      </td>
                      <td className="py-2 pr-4">
                        {evt.problem_slug
                          ? <Badge variant="outline" className="text-[10px]">{evt.problem_slug}</Badge>
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="py-2 pr-4">
                        <Badge className={`${severityColors[evt.severity]} text-[10px]`}>{evt.severity}</Badge>
                      </td>
                      <td className="py-2 font-mono text-xs text-muted-foreground">
                        {new Date(evt.created_at).toLocaleString()}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}