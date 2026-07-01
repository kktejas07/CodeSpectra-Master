'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Users, UserPlus, Activity, Shield, BookOpen, BarChart3,
  TrendingUp, Mail, Settings, Loader, Code, Trophy
} from 'lucide-react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { DASHBOARD_ROUTES } from '@/lib/rbac'

interface TeamMember {
  id: string
  name: string
  email: string
  role: string
  joinedAt: string
  status: string
}

export default function TeamManagement() {
  const { profile } = useAuth()
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
            active: m.filter((x: TeamMember) => x.status === 'active').length,
            scans: json.scans ?? 0,
            challenges: json.challenges ?? 0,
          })
        }
      })
      .catch(() => {})
  }, [])

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const p = DASHBOARD_ROUTES.platform

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Organization dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Manage your team and monitor organization activity.
          </p>
        </div>
        <Badge variant="outline" className="gap-1.5 px-3 py-1.5">
          <Shield className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Org Admin</span>
        </Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="border-border/60 p-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-500/10">
              <Users className="h-6 w-6 text-blue-500" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Team members</p>
              <p className="text-2xl font-bold text-foreground">{stats.total}</p>
            </div>
          </div>
        </Card>
        <Card className="border-border/60 p-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-500/10">
              <Activity className="h-6 w-6 text-green-500" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Active members</p>
              <p className="text-2xl font-bold text-foreground">{stats.active}</p>
            </div>
          </div>
        </Card>
        <Card className="border-border/60 p-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-purple-500/10">
              <Code className="h-6 w-6 text-purple-500" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total scans</p>
              <p className="text-2xl font-bold text-foreground">{stats.scans}</p>
            </div>
          </div>
        </Card>
        <Card className="border-border/60 p-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-amber-500/10">
              <Trophy className="h-6 w-6 text-amber-500" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Challenges</p>
              <p className="text-2xl font-bold text-foreground">{stats.challenges}</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="border-border/60 p-6 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">Team members</h2>
            </div>
            <Badge variant="secondary">{stats.total} total</Badge>
          </div>
          {members.length === 0 ? (
            <div className="text-center py-8">
              <Users className="mx-auto h-10 w-10 text-muted-foreground/40" />
              <p className="mt-3 text-muted-foreground">No team members yet.</p>
              <Button className="mt-4 gap-2" size="sm">
                <UserPlus className="h-4 w-4" /> Invite members
              </Button>
            </div>
          ) : (
            <div className="space-y-3 max-h-[300px] overflow-y-auto">
              {members.slice(0, 10).map(m => (
                <div key={m.id} className="flex items-center justify-between rounded-md border border-border/60 p-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{m.name}</p>
                    <p className="text-xs text-muted-foreground">{m.email}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="text-[10px] capitalize">{m.role?.replace('_', ' ')}</Badge>
                    <Badge variant={m.status === 'active' ? 'default' : 'secondary'} className="text-[10px]">
                      {m.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="border-border/60 p-6">
          <div className="mb-4 flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Quick actions</h2>
          </div>
          <div className="space-y-2">
            <Link href="/dashboard/admin/integrations">
              <Button variant="outline" className="w-full justify-start gap-2" size="sm">
                <Settings className="h-4 w-4" /> Manage integrations
              </Button>
            </Link>
            <Link href="/dashboard/admin/pricing">
              <Button variant="outline" className="w-full justify-start gap-2" size="sm">
                <TrendingUp className="h-4 w-4" /> Pricing & plans
              </Button>
            </Link>
            <Link href="/dashboard/admin/analytics">
              <Button variant="outline" className="w-full justify-start gap-2" size="sm">
                <BarChart3 className="h-4 w-4" /> Organization analytics
              </Button>
            </Link>
            <Link href="/dashboard/admin/settings?section=mail">
              <Button variant="outline" className="w-full justify-start gap-2" size="sm">
                <Mail className="h-4 w-4" /> Email settings
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    </div>
  )
}
