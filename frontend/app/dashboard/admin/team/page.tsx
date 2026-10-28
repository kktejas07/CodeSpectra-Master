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
import { useAdminT } from '@/lib/i18n/admin'
import { useApiError } from '@/lib/i18n/use-api-error'

interface TeamMember {
  id: string; name: string; email: string; role: string; joinedAt: string; status: string
}

interface PendingInvite {
  id: string; email: string; role: string; expires_at: string; created_at: string
}

export default function TeamManagement() {
  const gate = usePageGuard('tenant_admin')
  const addToast = useToast()
  const { t, fmt } = useAdminT()
  const apiError = useApiError()
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
      addToast({ type: 'success', title: t('team.revoked') })
    } catch (e) {
      addToast({ type: 'error', title: t('team.revokeFailed'), message: e instanceof Error ? e.message : t('team.failed') })
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
          title: invited ? t('team.invitationSent') : json.user?.already_member ? t('team.alreadyMember') : t('team.memberAdded'),
          message: t(invited
            ? json.emailed === false ? 'team.msgEmailFailed' : 'team.msgInvited'
            : json.user?.already_member ? 'team.msgAlready' : 'team.msgAdded', { email: email.trim() }),
        })
        setEmail(''); setName(''); setPassword('')
        setAddOpen(false)
        await Promise.all([fetchMembers(), fetchInvites()])
      } else {
        addToast({ type: 'error', title: res.status === 402 ? t('team.planLimit') : t('team.failed'), message: apiError(json, t('copilot.requestFailed')) })
      }
    } catch {
      addToast({ type: 'error', title: t('team.failed'), message: t('team.addFailed') })
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
            {t('team.title')}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="ml-1.5 inline-block h-4 w-4 cursor-help align-middle text-muted-foreground" aria-label={t('team.aboutLabel')} />
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p className="text-xs max-w-62.5">{t('team.aboutBody')}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </>
        }
        description={t('team.description')}
        icon={<Building2 />}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => openDialog('invite')} className="gap-2">
              <Mail className="h-4 w-4" /> {t('team.inviteByEmail')}
            </Button>
            <Button onClick={() => openDialog('create')} className="gap-2">
              <UserPlus className="h-4 w-4" /> {t('team.addMember')}
            </Button>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label={t('team.members')} value={stats.total} icon={<Users />} />
        <StatCard label={t('team.activeMembers')} value={stats.active} icon={<Building2 />} />
      </div>

      {/* Team members */}
      <Panel>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" aria-hidden /> {t('team.members')}
          </h2>
          <Badge variant="secondary" className="tabular-nums">{t('team.total', { n: stats.total })}</Badge>
        </div>
        {loadError && members.length === 0 ? (
          <EmptyState
            illustration="error"
            title={t('team.loadFailed')}
            description={t('common.checkConnection')}
            actionLabel={t('common.tryAgain')}
            onAction={() => void fetchMembers()}
          />
        ) : members.length === 0 ? (
          <EmptyState
            illustration="team"
            title={t('team.noMembers')}
            description={t('team.noMembersDesc')}
            actionLabel={t('team.addMember')}
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
              <Mail className="h-5 w-5 text-primary" aria-hidden /> {t('team.pendingInvites')}
            </h2>
            <Badge variant="secondary" className="tabular-nums">{invites.length}</Badge>
          </div>
          <div className="space-y-2">
            {invites.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between rounded-xl border border-border/70 p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{inv.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {(inv.role || 'user').replace(/_/g, ' ')} · {t('team.expires', { date: fmt.date(inv.expires_at) })}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => void revokeInvite(inv.id)} disabled={revoking === inv.id}>
                  {revoking === inv.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                  {t('team.revoke')}
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
              <DialogTitle>{mode === 'invite' ? t('team.inviteByEmail') : t('team.addMember')}</DialogTitle>
              <DialogDescription>
                {mode === 'invite'
                  ? t('team.inviteDesc')
                  : t('team.addDesc')}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4 text-xs">
              <div className="grid gap-2">
                <Label htmlFor="member-email">{t('team.email')}</Label>
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
                <Label htmlFor="member-name">{t('team.fullName')}</Label>
                <Input
                  id="member-name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder={t('team.namePlaceholder')}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="member-password">{t('team.password')}</Label>
                <Input
                  id="member-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={t('team.passwordPlaceholder')}
                />
              </div>
              </>) : null}
            </div>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>{t('common.cancel')}</Button>
              <Button type="submit" disabled={adding || !email.trim()}>
                {adding
                  ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />{mode === 'invite' ? t('team.sending') : t('team.adding')}</>
                  : <><Mail className="h-4 w-4 mr-1" />{mode === 'invite' ? t('team.sendInvitation') : t('team.addMember')}</>}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
