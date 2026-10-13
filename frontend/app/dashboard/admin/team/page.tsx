'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Users, UserPlus, Loader, Mail, Loader2, Building2, HelpCircle } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { SkeletonStats, SkeletonList } from '@/components/ui/skeleton-boneyard'

interface TeamMember {
  id: string; name: string; email: string; role: string; joinedAt: string; status: string
}

export default function TeamManagement() {
  const gate = usePageGuard('tenant_admin')
  const addToast = useToast()
  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [stats, setStats] = useState({ total: 0, active: 0 })

  const fetchMembers = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/teams/members', { credentials: 'include' })
      const json = await res.json()
      if (json.data) {
        setMembers(json.data)
        setStats({
          total: json.data.length,
          active: json.data.filter((x: TeamMember) => x.status === 'active').length,
        })
      }
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  useEffect(() => { void fetchMembers() }, [])

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setAdding(true)
    try {
      const res = await csrfFetch('/api/admin/teams/members', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), name: name.trim(), password: password.trim() || undefined }),
      })
      const json = await res.json()
      if (res.ok) {
        addToast({
          type: 'success',
          title: json.user?.already_existed ? 'Already a member' : 'Member added',
          message: `${email.trim()} ${json.user?.already_existed ? 'is now part of your organization.' : 'added to your organization.'}`,
        })
        setEmail(''); setName(''); setPassword('')
        setAddOpen(false)
        await fetchMembers()
      } else {
        addToast({ type: 'error', title: 'Failed', message: json.error })
      }
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Failed to add member' })
    } finally {
      setAdding(false)
    }
  }

  if (!gate.ready) return null
  if (loading) return (
    <div className="space-y-6">
      <SkeletonStats />
      <SkeletonList count={4} />
    </div>
  )

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-1.5 text-3xl font-bold text-foreground">
            Organization
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p className="text-xs .5">Members of your organization. Add users here — they are scoped to your org automatically.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </h1>
          <p className="text-sm text-muted-foreground">Manage your team and monitor organization activity</p>
        </div>
        <Button onClick={() => setAddOpen(true)} className="gap-2">
          <UserPlus className="h-4 w-4" /> Add member
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="border-border/60 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10"><Users className="h-5 w-5 text-blue-500" /></div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Team members</p>
              <p className="text-2xl font-bold text-foreground">{stats.total}</p>
            </div>
          </div>
        </Card>
        <Card className="border-border/60 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10"><Building2 className="h-5 w-5 text-green-500" /></div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Active members</p>
              <p className="text-2xl font-bold text-foreground">{stats.active}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Team members */}
      <Card className="border-border/60 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" /> Team members
          </h2>
          <Badge variant="secondary">{stats.total} total</Badge>
        </div>
        {members.length === 0 ? (
          <div className="text-center py-10">
            <Users className="h-12 w-12 text-muted-foreground/30" />
            <p className="mt-3 text-muted-foreground">No members in your organization yet.</p>
            <Button className="mt-4 gap-2" size="sm" onClick={() => setAddOpen(true)}>
              <UserPlus className="h-4 w-4" /> Add member
            </Button>
          </div>
        ) : (
          <div className="space-y-2 max-h-[350px] overflow-y-auto">
            {members.map(m => (
              <div key={m.id} className="flex items-center justify-between rounded-md border border-border/50 p-3 hover:bg-muted/20 transition-colors">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{m.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-3">
                  <Badge variant="outline" className="text-[10px] capitalize">{(m.role || '').replace(/_/g, ' ')}</Badge>
                  <Badge variant={(m.status || '') === 'active' ? 'default' : 'secondary'} className="text-[10px]">{m.status || 'active'}</Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <form onSubmit={handleAddMember}>
            <DialogHeader>
              <DialogTitle>Add member</DialogTitle>
              <DialogDescription>
                Creates a user in your organization. They will be scoped to your org automatically.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4 text-xs">
              <div className="grid gap-2">
                <Label htmlFor="member-email">Email address</Label>
                <Input
                  id="member-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="user@company.com"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="member-name">Full name (optional)</Label>
                <Input
                  id="member-name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Jane Doe"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="member-password">Password (optional)</Label>
                <Input
                  id="member-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Leave blank to auto-generate"
                />
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={adding || !email.trim()}>
                {adding ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Adding…</> : <><Mail className="h-4 w-4 mr-1" />Add member</>}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
