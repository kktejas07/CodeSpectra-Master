'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Users, UserPlus, Activity, Settings, Loader, Code, Trophy, Mail, TrendingUp } from 'lucide-react'
import Link from 'next/link'
import { usePageGuard } from '@/lib/use-page-guard'

interface TeamMember {
  id: string; name: string; email: string; role: string; joinedAt: string; status: string
}

export default function TeamManagement() {
  const gate = usePageGuard('tenant_admin')
  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ total: 0, active: 0, scans: 0, challenges: 0 })

  useEffect(() => {
    fetch('/api/admin/teams/members', { credentials: 'include' })
      .then(r => r.json())
      .then(json => { if (json.data) setMembers(json.data) })
      .catch(() => {})
      .finally(() => setLoading(false))
    fetch('/api/admin/teams/members?stats=true', { credentials: 'include' })
      .then(r => r.json())
      .then(json => {
        if (json.data) {
          const m = Array.isArray(json.data) ? json.data : []
          setStats({
            total: m.length,
            active: m.filter((x: TeamMember) => (x.status || '') === 'active').length,
            scans: json.scans ?? 0,
            challenges: json.challenges ?? 0,
          })
        }
      })
      .catch(() => {})
  }, [])

  if (!gate.ready) return <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground"><Loader className="mr-2 h-5 w-5 animate-spin" />Loading…</div>
  if (loading) return <div className="flex justify-center py-20"><Loader className="h-6 w-6 animate-spin text-muted-foreground" /></div>

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Organization</h1>
        <p className="text-muted-foreground mt-1">Manage your team and monitor organization activity.</p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={<Users className="h-5 w-5 text-blue-500" />} label="Team members" value={stats.total} color="bg-blue-500/10" />
        <StatCard icon={<Activity className="h-5 w-5 text-green-500" />} label="Active members" value={stats.active} color="bg-green-500/10" />
        <StatCard icon={<Code className="h-5 w-5 text-purple-500" />} label="Total scans" value={stats.scans} color="bg-purple-500/10" />
        <StatCard icon={<Trophy className="h-5 w-5 text-amber-500" />} label="Challenges" value={stats.challenges} color="bg-amber-500/10" />
      </div>

      {/* Team members + Quick actions */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="border-border/60 p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" /> Team members
            </h2>
            <Badge variant="secondary">{stats.total} total</Badge>
          </div>
          {members.length === 0 ? (
            <div className="text-center py-10">
              <Users className="mx-auto h-12 w-12 text-muted-foreground/30" />
              <p className="mt-3 text-muted-foreground">No team members yet.</p>
              <Button className="mt-4 gap-2" size="sm"><UserPlus className="h-4 w-4" /> Invite members</Button>
            </div>
          ) : (
            <div className="space-y-2 max-h-[350px] overflow-y-auto">
              {members.slice(0, 15).map(m => (
                <div key={m.id} className="flex items-center justify-between rounded-md border border-border/50 p-3 hover:bg-muted/20 transition-colors">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{m.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    <Badge variant="outline" className="text-[10px] capitalize">{(m.role || '').replace(/_/g, ' ')}</Badge>
                    <Badge variant={(m.status || '') === 'active' ? 'default' : 'secondary'} className="text-[10px]">{m.status || 'unknown'}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="border-border/60 p-6">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-4">
            <Settings className="h-5 w-5 text-primary" /> Quick actions
          </h2>
          <div className="grid gap-2">
            <ActionLink href="/dashboard/admin/integrations" icon={<Settings className="h-4 w-4" />} label="Integrations" />
            <ActionLink href="/dashboard/admin/pricing" icon={<TrendingUp className="h-4 w-4" />} label="Pricing & plans" />
            <ActionLink href="/dashboard/billing" icon={<TrendingUp className="h-4 w-4" />} label="Billing" />
            <ActionLink href="/dashboard/admin/settings?section=mail" icon={<Mail className="h-4 w-4" />} label="Email settings" />
            <ActionLink href="/dashboard/notifications" icon={<Mail className="h-4 w-4" />} label="Notifications" />
          </div>
        </Card>
      </div>
    </div>
  )
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <Card className="border-border/60 p-4">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${color}`}>{icon}</div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold text-foreground">{value}</p>
        </div>
      </div>
    </Card>
  )
}

function ActionLink({ icon, label, href }: { icon: React.ReactNode; label: string; href: string }) {
  return (
    <Link href={href}>
      <div className="flex items-center gap-3 rounded-md border border-border/50 p-3 hover:bg-muted/40 hover:border-primary/30 transition-all cursor-pointer">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 shrink-0">{icon}</div>
        <span className="text-sm font-medium text-foreground truncate">{label}</span>
      </div>
    </Link>
  )
}
