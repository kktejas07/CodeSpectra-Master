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
import { useT } from '@/lib/i18n/client'
import type { Translator } from '@/lib/i18n/catalog'
import { useApiError } from '@/lib/i18n/use-api-error'

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

function statusBadge(t: Translator, s: Member['status']) {
  if (s === 'active') return <Badge variant="success">{t('hiring.active')}</Badge>
  if (s === 'invited') return <Badge variant="outline">{t('hiring.inviteSent')}</Badge>
  return <Badge variant="secondary">{t('hiring.memberDisabled')}</Badge>
}

function TeamPageInner() {
  const apiError = useApiError()
  const { td, t } = useT()
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
      if (!res.ok) { setError(apiError(json, t('hiring.couldNotLoadTheTeam'))); setData(null) }
      else { setData(json); setError(null) }
    } catch {
      setError(t('hiring.couldNotLoadTheTeam'))
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
      if (!res.ok) { addToast({ type: 'error', title: apiError(json, t('hiring.somethingWentWrong')) }); return false }
      addToast({ type: 'success', title: okMsg, message: json.emailed === false ? t('hiring.theEmailCouldntBeSentCheck6ab') : undefined })
      await load()
      return true
    } catch {
      addToast({ type: 'error', title: t('hiring.networkErrorTryAgain') })
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
    return <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label={t('hiring.loadingTeam')} /></div>
  }
  if (error || !data) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <EmptyState illustration="locked" title={t('hiring.youCantOpenTheHiringTeam')} description={error || t('hiring.onlyAdminsRecruitersAndHiringManagers759')} actionLabel={t('hiring.backToHiring')} actionHref="/dashboard/hiring" />
      </div>
    )
  }

  const needsClient = role === 'client'
  const offersClient = role === 'client' || role === 'hiring_manager'

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-6 sm:px-6">
      <PageHeader
        icon={<Users2 />}
        title={t('hiring.hiringTeam')}
        description={t('hiring.inviteRecruitersHiringManagersInterviewec80')}
      />

      {canManage && (
        <Panel>
          <form onSubmit={invite} className="space-y-4" aria-label={t('hiring.inviteATeamMember')}>
            <h2 className="text-lg font-semibold text-foreground">{t('hiring.inviteSomeone')}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="inv-email">Email</Label>
                <Input id="inv-email" type="email" required autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inv-name">{t('hiring.nameOptional')}</Label>
                <Input id="inv-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder={t('hiring.theirName')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inv-role">{t('hiring.role')}</Label>
                <Select value={role} onValueChange={(v) => setRole(v as AtsRole)}>
                  <SelectTrigger id="inv-role" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ATS_ROLES.map((r) => <SelectItem key={r} value={r}>{td(`hiring.roleLabels:${r}`, ROLE_LABELS[r])}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{ROLE_HELP[role]}</p>
              </div>
              {offersClient && (
                <div className="space-y-1.5">
                  <Label htmlFor="inv-client">{t('hiring.clientValue', { value: needsClient ? '' : t('hiring.optional') })}</Label>
                  <Select value={clientId} onValueChange={setClientId}>
                    <SelectTrigger id="inv-client" className="w-full"><SelectValue placeholder={t('hiring.chooseAClient')} /></SelectTrigger>
                    <SelectContent>
                      {!needsClient && <SelectItem value={NONE}>{t('hiring.noClient')}</SelectItem>}
                      {data.clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {needsClient && !data.clients.length && (
                    <p className="text-xs text-amber-700 dark:text-amber-400">{t('hiring.addAClientFirstUnderClients432')}</p>
                  )}
                </div>
              )}
            </div>
            <Button type="submit" className="min-h-11" disabled={inviting || !email || (needsClient && clientId === NONE)}>
              {inviting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <MailPlus className="mr-1 h-4 w-4" />}{t('hiring.sendInvite')}</Button>
          </form>
        </Panel>
      )}

      <Section title={t('hiring.members')} description={t('hiring.countPeopleOnThisTeamOrganizationaca', { count: data.members.length })}>
        {data.members.length === 0 ? (
          <EmptyState illustration="team" title={t('hiring.noOneOnTheTeamYet')} description={canManage ? t('hiring.inviteYourFirstRecruiterOrInterviewer657') : t('hiring.askAnAdminToInvitePeople')} compact />
        ) : (
          <Panel className="p-0">
            <ul className="divide-y divide-border/70">
              {data.members.map((m) => {
                const self = m.user_id === data.me.user_id
                return (
                  <li key={m.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{m.name || m.email}{self && <span className="ml-2 text-xs text-muted-foreground">{t('hiring.you2')}</span>}</p>
                      <p className="truncate text-sm text-muted-foreground">{m.name ? m.email : null}{m.client_id ? `${m.name ? ' · ' : ''}${clientName.get(m.client_id) || 'Client'}` : ''}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        {statusBadge(t, m.status)}
                        {!canManage && <Badge variant="outline">{td(`hiring.roleLabels:${m.role}`, ROLE_LABELS[m.role])}</Badge>}
                      </div>
                    </div>
                    {canManage && (
                      <div className="flex flex-wrap items-center gap-2">
                        <Select
                          value={m.role}
                          disabled={self || busy === m.id}
                          onValueChange={(v) => {
                            if (v === 'client' && !m.client_id) { addToast({ type: 'info', title: t('hiring.inviteClientsWithTheirCompanyPicked'), message: t('hiring.removeAndReInviteThisPersonaa3') }); return }
                            void call(`/api/ats/team/${m.id}${q}`, { method: 'PATCH', body: JSON.stringify({ role: v }) }, 'Role updated', m.id)
                          }}
                        >
                          <SelectTrigger className="w-40" aria-label={t('hiring.roleForEmail', { email: m.email })}><UserCog className="mr-1 h-4 w-4" /><SelectValue /></SelectTrigger>
                          <SelectContent>{ATS_ROLES.map((r) => <SelectItem key={r} value={r}>{td(`hiring.roleLabels:${r}`, ROLE_LABELS[r])}</SelectItem>)}</SelectContent>
                        </Select>
                        {m.status === 'invited' && (
                          <Button variant="outline" size="sm" disabled={busy === m.id} onClick={() => void call(`/api/ats/team/${m.id}${q}`, { method: 'PATCH', body: JSON.stringify({ action: 'resend' }) }, 'Invite resent', m.id)}>
                            <RefreshCw className="mr-1 h-4 w-4" />{t('hiring.resend')}</Button>
                        )}
                        {!self && (
                          <Button variant="outline" size="sm" disabled={busy === m.id}
                            onClick={() => void call(`/api/ats/team/${m.id}${q}`, { method: 'PATCH', body: JSON.stringify({ status: m.status === 'disabled' ? 'active' : 'disabled' }) }, m.status === 'disabled' ? 'Member re-enabled' : 'Member disabled', m.id)}>
                            {m.status === 'disabled' ? t('hiring.enable') : t('hiring.disable')}
                          </Button>
                        )}
                        {!self && (
                          <Button variant="ghost" size="sm" aria-label={t('hiring.removeEmail', { email: m.email })} disabled={busy === m.id}
                            onClick={async () => {
                              const ok = await confirm({ title: t('hiring.removeFromTheHiringTeam'), description: t('hiring.emailWillLoseAccessToThis743', { email: m.email }), confirmText: t('hiring.remove'), destructive: true })
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
        <Section title={t('hiring.access')} description={t('hiring.whoSeesWhatAcrossJobs')}>
          <Panel className="space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Label htmlFor="set-recruiters" className="text-sm font-medium text-foreground">{t('hiring.recruitersSeeEveryJob')}</Label>
                <p className="text-sm text-muted-foreground">{t('hiring.offRecruitersOnlySeeJobsTheyreb00')}</p>
              </div>
              <Switch id="set-recruiters" checked={data.settings.recruiters_see_all_jobs} disabled={busy?.startsWith('setting:')} onCheckedChange={(v) => void saveSetting('recruiters_see_all_jobs', v)} />
            </div>
            <div className="flex items-start justify-between gap-4">
              <div>
                <Label htmlFor="set-contacts" className="text-sm font-medium text-foreground">{t('hiring.clientsSeeCandidateContactDetails')}</Label>
                <p className="text-sm text-muted-foreground">{t('hiring.offClientsSeeNamesRSum69b')}</p>
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
  const { t } = useT()
  return (
    <Suspense fallback={<div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label={t('hiring.loading')} /></div>}>
      <TeamPageInner />
    </Suspense>
  )
}
