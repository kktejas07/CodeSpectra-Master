'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Loader2, MailPlus, RefreshCw, Trash2, UserCog, Users2 } from 'lucide-react'
import { PageHeader, Panel, Section } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useToast } from '@/lib/toast-context'
import { useConfirm } from '@/lib/confirm-context'
import { ATS_ROLES, ROLE_LABELS, type AtsAccessSettings } from '@/lib/ats/access-rules'
import type { AtsMember, AtsRole } from '@/lib/ats/contract'

type Member = AtsMember & { last_invited_at?: string | null; accepted_at?: string | null }
interface TeamData {
  members: Member[]
  settings: AtsAccessSettings
  clients: { id: string; name: string }[]
  me: { user_id: string; role: AtsRole; tenant_id: string; can_manage: boolean }
}

const NONE = '__none'

const ROLE_HELP: Record<AtsRole, string> = {
  admin: 'Everything, including team and settings',
  recruiter: 'Create jobs, move candidates, approve, schedule',
  hiring_manager: 'Their jobs: approve moves, review, scorecards',
  interviewer: 'Only interviews they are on, plus scorecards',
  client: "Their company's jobs at client-review stages",
}

function statusBadge(s: Member['status']) {
  if (s === 'active') return <Badge variant="success">Active</Badge>
  if (s === 'invited') return <Badge variant="outline">Invite sent</Badge>
  return <Badge variant="secondary">Disabled</Badge>
}

function TeamPageInner() {
  const sp = useSearchParams()
  const tenant = sp.get('tenant')
  const q = tenant ? `?tenant=${encodeURIComponent(tenant)}` : ''
  const addToast = useToast()
  const confirm = useConfirm()

  const [data, setData] = useState<TeamData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<AtsRole>('interviewer')
  const [clientId, setClientId] = useState<string>(NONE)
  const [inviting, setInviting] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/ats/team${q}`, { credentials: 'include', cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) { setError(json.error || 'Could not load the team'); setData(null) }
      else { setData(json); setError(null) }
    } catch {
      setError('Could not load the team')
    } finally {
      setLoading(false)
    }
  }, [q])

  useEffect(() => { void load() }, [load])

  const clientName = useMemo(() => new Map((data?.clients || []).map((c) => [c.id, c.name])), [data?.clients])
  const canManage = !!data?.me.can_manage

  async function call(url: string, init: RequestInit, okMsg: string, key: string) {
    setBusy(key)
    try {
      const res = await csrfFetch(url, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...init })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { addToast({ type: 'error', title: json.error || 'Something went wrong' }); return false }
      addToast({ type: 'success', title: okMsg, message: json.emailed === false ? "The email couldn't be sent — check mail settings, then resend." : undefined })
      await load()
      return true
    } catch {
      addToast({ type: 'error', title: 'Network error — try again' })
      return false
    } finally {
      setBusy(null)
    }
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault()
    setInviting(true)
    const ok = await call(`/api/ats/team${q}`, {
      method: 'POST',
      body: JSON.stringify({ email, name, role, client_id: clientId === NONE ? null : clientId }),
    }, `Invite sent to ${email}`, 'invite')
    setInviting(false)
    if (ok) { setEmail(''); setName('') }
  }

  async function saveSetting(k: keyof AtsAccessSettings, v: boolean) {
    await call(`/api/ats/team/settings${q}`, { method: 'PATCH', body: JSON.stringify({ [k]: v }) }, 'Access setting saved', `setting:${k}`)
  }

  if (loading) {
    return <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Loading team" /></div>
  }
  if (error || !data) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <EmptyState illustration="locked" title="You can't open the hiring team" description={error || 'Only admins, recruiters and hiring managers can see the team.'} actionLabel="Back to hiring" actionHref="/dashboard/hiring" />
      </div>
    )
  }

  const needsClient = role === 'client'
  const offersClient = role === 'client' || role === 'hiring_manager'

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-6 sm:px-6">
      <PageHeader
        icon={<Users2 />}
        title="Hiring team"
        description="Invite recruiters, hiring managers, interviewers and client reviewers. Each person only sees what their role allows."
      />

      {canManage && (
        <Panel>
          <form onSubmit={invite} className="space-y-4" aria-label="Invite a team member">
            <h2 className="text-lg font-semibold text-foreground">Invite someone</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="inv-email">Email</Label>
                <Input id="inv-email" type="email" required autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inv-name">Name (optional)</Label>
                <Input id="inv-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="Their name" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inv-role">Role</Label>
                <Select value={role} onValueChange={(v) => setRole(v as AtsRole)}>
                  <SelectTrigger id="inv-role" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ATS_ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{ROLE_HELP[role]}</p>
              </div>
              {offersClient && (
                <div className="space-y-1.5">
                  <Label htmlFor="inv-client">Client{needsClient ? '' : ' (optional)'}</Label>
                  <Select value={clientId} onValueChange={setClientId}>
                    <SelectTrigger id="inv-client" className="w-full"><SelectValue placeholder="Choose a client" /></SelectTrigger>
                    <SelectContent>
                      {!needsClient && <SelectItem value={NONE}>No client</SelectItem>}
                      {data.clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {needsClient && !data.clients.length && (
                    <p className="text-xs text-amber-700 dark:text-amber-400">Add a client first under Clients, then invite their reviewers.</p>
                  )}
                </div>
              )}
            </div>
            <Button type="submit" className="min-h-11" disabled={inviting || !email || (needsClient && clientId === NONE)}>
              {inviting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <MailPlus className="mr-1 h-4 w-4" />}
              Send invite
            </Button>
          </form>
        </Panel>
      )}

      <Section title="Members" description={`${data.members.length} ${data.members.length === 1 ? 'person' : 'people'} on this team. Organization admins are always admins and aren't listed.`}>
        {data.members.length === 0 ? (
          <EmptyState illustration="team" title="No one on the team yet" description={canManage ? 'Invite your first recruiter or interviewer above.' : 'Ask an admin to invite people.'} compact />
        ) : (
          <Panel className="p-0">
            <ul className="divide-y divide-border/70">
              {data.members.map((m) => {
                const self = m.user_id === data.me.user_id
                return (
                  <li key={m.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{m.name || m.email}{self && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}</p>
                      <p className="truncate text-sm text-muted-foreground">{m.name ? m.email : null}{m.client_id ? `${m.name ? ' · ' : ''}${clientName.get(m.client_id) || 'Client'}` : ''}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        {statusBadge(m.status)}
                        {!canManage && <Badge variant="outline">{ROLE_LABELS[m.role]}</Badge>}
                      </div>
                    </div>
                    {canManage && (
                      <div className="flex flex-wrap items-center gap-2">
                        <Select
                          value={m.role}
                          disabled={self || busy === m.id}
                          onValueChange={(v) => {
                            if (v === 'client' && !m.client_id) { addToast({ type: 'info', title: 'Invite clients with their company picked', message: 'Remove and re-invite this person as a client.' }); return }
                            void call(`/api/ats/team/${m.id}${q}`, { method: 'PATCH', body: JSON.stringify({ role: v }) }, 'Role updated', m.id)
                          }}
                        >
                          <SelectTrigger className="w-40" aria-label={`Role for ${m.email}`}><UserCog className="mr-1 h-4 w-4" /><SelectValue /></SelectTrigger>
                          <SelectContent>{ATS_ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}</SelectContent>
                        </Select>
                        {m.status === 'invited' && (
                          <Button variant="outline" size="sm" disabled={busy === m.id} onClick={() => void call(`/api/ats/team/${m.id}${q}`, { method: 'PATCH', body: JSON.stringify({ action: 'resend' }) }, 'Invite resent', m.id)}>
                            <RefreshCw className="mr-1 h-4 w-4" />Resend
                          </Button>
                        )}
                        {!self && (
                          <Button variant="outline" size="sm" disabled={busy === m.id}
                            onClick={() => void call(`/api/ats/team/${m.id}${q}`, { method: 'PATCH', body: JSON.stringify({ status: m.status === 'disabled' ? 'active' : 'disabled' }) }, m.status === 'disabled' ? 'Member re-enabled' : 'Member disabled', m.id)}>
                            {m.status === 'disabled' ? 'Enable' : 'Disable'}
                          </Button>
                        )}
                        {!self && (
                          <Button variant="ghost" size="sm" aria-label={`Remove ${m.email}`} disabled={busy === m.id}
                            onClick={async () => {
                              const ok = await confirm({ title: 'Remove from the hiring team?', description: `${m.email} will lose access to this organization's hiring right away.`, confirmText: 'Remove', destructive: true })
                              if (ok) await call(`/api/ats/team/${m.id}${q}`, { method: 'DELETE' }, 'Member removed', m.id)
                            }}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </Panel>
        )}
      </Section>

      {canManage && (
        <Section title="Access" description="Who sees what across jobs.">
          <Panel className="space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Label htmlFor="set-recruiters" className="text-sm font-medium text-foreground">Recruiters see every job</Label>
                <p className="text-sm text-muted-foreground">Off: recruiters only see jobs they're assigned to.</p>
              </div>
              <Switch id="set-recruiters" checked={data.settings.recruiters_see_all_jobs} disabled={busy?.startsWith('setting:')} onCheckedChange={(v) => void saveSetting('recruiters_see_all_jobs', v)} />
            </div>
            <div className="flex items-start justify-between gap-4">
              <div>
                <Label htmlFor="set-contacts" className="text-sm font-medium text-foreground">Clients see candidate contact details</Label>
                <p className="text-sm text-muted-foreground">Off: clients see names, résumé summaries and results, but no email or phone.</p>
              </div>
              <Switch id="set-contacts" checked={data.settings.client_sees_contacts} disabled={busy?.startsWith('setting:')} onCheckedChange={(v) => void saveSetting('client_sees_contacts', v)} />
            </div>
          </Panel>
        </Section>
      )}
    </div>
  )
}

export default function HiringTeamPage() {
  return (
    <Suspense fallback={<div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Loading" /></div>}>
      <TeamPageInner />
    </Suspense>
  )
}
