'use client'

import { useEffect, useState } from 'react'
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
import { PageHeader, Panel, StatCard } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'

interface TeamMember {
  id: string; name: string; email: string; role: string; joinedAt: string; status: string
}

interface PendingInvite {
  id: string; email: string; role: string; expires_at: string; created_at: string
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
  // 'invite' sends an invitation the person accepts; 'create' makes a new account.
  const [mode, setMode] = useState<'create' | 'invite'>('create')
  const [invites, setInvites] = useState<PendingInvite[]>([])
  const [revoking, setRevoking] = useState<string | null>(null)

  const [loadError, setLoadError] = useState(false)

  const fetchMembers = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/teams/members', { credentials: 'include' })
      if (!res.ok) throw new Error(`Failed to load members (${res.status})`)
      const json = await res.json()
      setLoadError(false)
      if (json.data) {
        setMembers(json.data)
        setStats({
          total: json.data.length,
          active: json.data.filter((x: TeamMember) => x.status === 'active').length,
        })
      }
    } catch { setLoadError(true) }
    finally { setLoading(false) }
  }

  const fetchInvites = async () => {
    try {
      const res = await fetch('/api/admin/teams/invitations', { credentials: 'include' })
      if (!res.ok) return
      const json = await res.json()
      setInvites(Array.isArray(json.data) ? json.data : [])
    } catch { /* the members list still works */ }
  }

  useEffect(() => { void fetchMembers(); void fetchInvites() }, [])

  const revokeInvite = async (id: string) => {
    setRevoking(id)
    try {
      const res = await csrfFetch(`/api/admin/teams/invitations?id=${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'include' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Could not revoke')
      setInvites((xs) => xs.filter((x) => x.id !== id))
      addToast({ type: 'success', title: 'Invitation revoked' })
    } catch (e) {
      addToast({ type: 'error', title: 'Revoke failed', message: e instanceof Error ? e.message : 'Failed' })
    } finally {
      setRevoking(null)
    }
  }

  const openDialog = (m: 'create' | 'invite') => { setMode(m); setAddOpen(true) }

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setAdding(true)
    try {
      const res = mode === 'invite'
        ? await csrfFetch('/api/admin/teams/invitations', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email.trim() }),
          })
        : await csrfFetch('/api/admin/teams/members', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email.trim(), name: name.trim(), password: password.trim() || undefined }),
          })
      const json = await res.json().catch(() => ({}))
      if (res.ok) {
        // Existing accounts are never moved silently: they get an invitation.
        const invited = mode === 'invite' || json.invited === true
        addToast({
          type: 'success',
          title: invited ? 'Invitation sent' : json.user?.already_member ? 'Already a member' : 'Member added',
          message: invited
            ? json.emailed === false
              ? `The invitation for ${email.trim()} was saved, but the email could not be sent. Check the mail settings and resend.`
              : `${email.trim()} joins your organization after accepting the invitation.`
            : json.user?.already_member
              ? `${email.trim()} is already part of your organization.`
              : `${email.trim()} added to your organization.`,
        })
        setEmail(''); setName(''); setPassword('')
        setAddOpen(false)
        await Promise.all([fetchMembers(), fetchInvites()])
      } else {
        addToast({ type: 'error', title: res.status === 402 ? 'Plan limit reached' : 'Failed', message: json.error || 'Request failed' })
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
    <div className="space-y-6">
      <PageHeader
        illustration="team"
        title={
          <>
            Organization
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="ml-1.5 inline-block h-4 w-4 cursor-help align-middle text-muted-foreground" aria-label="About your organization" />
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p className="text-xs max-w-62.5">Members of your organization. New people get an account here; people who already have one get an invitation to accept.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </>
        }
        description="Manage your team and keep an eye on organization activity."
        icon={<Building2 />}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => openDialog('invite')} className="gap-2">
              <Mail className="h-4 w-4" /> Invite by email
            </Button>
            <Button onClick={() => openDialog('create')} className="gap-2">
              <UserPlus className="h-4 w-4" /> Add member
            </Button>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label="Team members" value={stats.total} icon={<Users />} />
        <StatCard label="Active members" value={stats.active} icon={<Building2 />} />
      </div>

      {/* Team members */}
      <Panel>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" aria-hidden /> Team members
          </h2>
          <Badge variant="secondary" className="tabular-nums">{stats.total} total</Badge>
        </div>
        {loadError && members.length === 0 ? (
          <EmptyState
            illustration="error"
            title="Couldn't load team members"
            description="Check your connection and try again."
            actionLabel="Try again"
            onAction={() => void fetchMembers()}
          />
        ) : members.length === 0 ? (
          <EmptyState
            illustration="team"
            title="No members yet"
            description="Add the people who will create and review assessments."
            actionLabel="Add member"
            onAction={() => openDialog('create')}
            className="border-0 bg-transparent py-6 md:py-8"
          />
        ) : (
          <div className="space-y-2 max-h-[350px] overflow-y-auto">
            {members.map(m => (
              <div key={m.id} className="flex items-center justify-between rounded-xl border border-border/70 p-3 transition-colors duration-200 hover:bg-muted/30">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{m.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-3">
                  <Badge variant="outline" className="text-[11px] capitalize">{(m.role || '').replace(/_/g, ' ')}</Badge>
                  <Badge variant={(m.status || '') === 'active' ? 'default' : 'secondary'} className="text-[11px] capitalize">{m.status || 'active'}</Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {invites.length > 0 ? (
        <Panel>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" aria-hidden /> Pending invitations
            </h2>
            <Badge variant="secondary" className="tabular-nums">{invites.length}</Badge>
          </div>
          <div className="space-y-2">
            {invites.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between rounded-xl border border-border/70 p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{inv.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {(inv.role || 'user').replace(/_/g, ' ')} · expires {new Date(inv.expires_at).toLocaleDateString()}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => void revokeInvite(inv.id)} disabled={revoking === inv.id}>
                  {revoking === inv.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                  Revoke
                </Button>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleAddMember}>
            <DialogHeader>
              <DialogTitle>{mode === 'invite' ? 'Invite by email' : 'Add member'}</DialogTitle>
              <DialogDescription>
                {mode === 'invite'
                  ? 'Sends an invitation. They join your organization once they accept it.'
                  : 'Creates an account for this person inside your organization. If they already have an account, they get an invitation instead.'}
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
              {mode === 'create' ? (<>
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
              </>) : null}
            </div>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={adding || !email.trim()}>
                {adding
                  ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />{mode === 'invite' ? 'Sending…' : 'Adding…'}</>
                  : <><Mail className="h-4 w-4 mr-1" />{mode === 'invite' ? 'Send invitation' : 'Add member'}</>}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
