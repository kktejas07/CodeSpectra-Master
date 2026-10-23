'use client'

/** My community: reputation, my threads, followed threads and study groups (create, join by code, browse open ones). */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { MessagesSquare, PenSquare, ShieldCheck, Star, Users } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useT } from '@/lib/i18n/client'
import { useToast } from '@/lib/toast-context'
import { PageHeader, Panel, Section, StatCard } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { call, ErrorNote, Field, Skeleton, areaClass, fieldClass, useErrorText } from '@/components/community/client-api'
import type { ThreadSummary } from '@/lib/community/service'
import type { GroupDoc } from '@/lib/community/db'

type Mine = { reputation: number; posts: number; moderator: boolean; threads: (ThreadSummary & { status: string })[]; following: ThreadSummary[] }
type G = Omit<GroupDoc, 'join_code'> & { my_role?: string | null; unread?: boolean }

function ThreadRows({ rows }: { rows: (ThreadSummary & { status?: string })[] }) {
  const { t, td, fmt } = useT()
  return (
    <ul className="divide-y divide-border rounded-3xl border border-border bg-card">
      {rows.map((th) => (
        <li key={th.id}>
          <Link href={`/dashboard/community/t/${th.id}`} className="flex flex-col gap-1 px-5 py-4 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
            <span lang={th.lang !== 'other' ? th.lang : undefined} className="font-medium text-foreground">{th.title}</span>
            <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {th.status === 'pending' && <Badge variant="warning">{t('community.awaitingReview')}</Badge>}
              <span>{td(`community.threadKind_${th.kind}`, th.kind)}</span>·<span className="tabular-nums">{t('community.replyCount', { count: th.reply_count })}</span>·<span className="tabular-nums">{fmt.relative(th.last_activity_at)}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

function Groups() {
  const { t } = useT()
  const router = useRouter()
  const toast = useToast()
  const errText = useErrorText()
  const [d, setD] = useState<{ mine: G[]; open: G[] } | null>(null)
  const [f, setF] = useState({ name: '', goal: '', description: '', max_members: '8', visibility: 'public', target_date: '' })
  const [code, setCode] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const load = useCallback(() => { call<{ mine: G[]; open: G[] }>('/api/community/groups').then(setD).catch((e) => setErr(errText(e))) }, [errText])
  useEffect(load, [load])
  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null)
    try {
      const r = await call<{ id: string }>('/api/community/groups', { body: { ...f, max_members: Number(f.max_members), target_date: f.target_date ? new Date(f.target_date).toISOString() : null } })
      router.push(`/dashboard/community/groups/${r.id}`)
    } catch (e2) { setErr(errText(e2)) }
  }
  const join = async (id: string) => {
    try { await call(`/api/community/groups/${id}`, { body: { action: 'join' } }); router.push(`/dashboard/community/groups/${id}`) } catch (e) { toast({ type: 'error', title: errText(e) }) }
  }
  const joinCode = async (e: React.FormEvent) => {
    e.preventDefault()
    try { const r = await call<{ id: string }>('/api/community/groups/join', { body: { code } }); router.push(`/dashboard/community/groups/${r.id}`) } catch (e2) { toast({ type: 'error', title: errText(e2) }) }
  }
  const card = (g: G, mine: boolean) => (
    <Panel key={g.id} className="flex h-full flex-col gap-2 p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold text-foreground">{g.name}</h3>
        {g.unread && <Badge variant="info">{t('community.newMessages')}</Badge>}
      </div>
      <p className="text-sm text-muted-foreground">{g.goal}</p>
      <p className="text-xs tabular-nums text-muted-foreground">{t('community.membersOf', { count: g.member_count, max: g.max_members })}</p>
      <div className="mt-auto pt-2">
        {mine ? <Button asChild className="min-h-[44px] rounded-full"><Link href={`/dashboard/community/groups/${g.id}`}>{t('community.openChat')}</Link></Button>
          : <Button variant="outline" className="min-h-[44px] rounded-full" disabled={g.member_count >= g.max_members} onClick={() => join(g.id)}>{g.member_count >= g.max_members ? t('community.groupFull') : t('community.joinGroup')}</Button>}
      </div>
    </Panel>
  )
  if (!d) return err ? <ErrorNote text={err} /> : <Skeleton />
  return (
    <div className="space-y-6">
      <Section title={t('community.myGroups')}>
        {d.mine.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{d.mine.map((g) => card(g, true))}</div> : <EmptyState compact title={t('community.noGroups')} description={t('community.noGroupsHint')} />}
      </Section>
      <form onSubmit={joinCode} className="flex flex-wrap items-end gap-2">
        <Field id="g-code" label={t('community.inviteCode')}><input id="g-code" className={fieldClass} value={code} onChange={(e) => setCode(e.target.value)} maxLength={8} required /></Field>
        <Button type="submit" variant="outline" className="min-h-[44px] rounded-full">{t('community.joinWithCode')}</Button>
      </form>
      <Section title={t('community.openGroups')}>
        {d.open.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{d.open.map((g) => card(g, false))}</div> : <p className="text-sm text-muted-foreground">{t('community.noOpenGroups')}</p>}
      </Section>
      <Panel className="space-y-4 p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-foreground">{t('community.startGroup')}</h2>
        <form onSubmit={create} className="grid gap-3 sm:grid-cols-2">
          <Field id="g-name" label={t('community.groupName')}><input id="g-name" className={fieldClass} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required maxLength={80} /></Field>
          <Field id="g-goal" label={t('community.groupGoal')} hint={t('community.groupGoalHint')}><input id="g-goal" className={fieldClass} value={f.goal} onChange={(e) => setF({ ...f, goal: e.target.value })} required maxLength={200} /></Field>
          <Field id="g-desc" label={t('community.groupDescription')} className="sm:col-span-2"><textarea id="g-desc" className={areaClass} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={4000} /></Field>
          <Field id="g-max" label={t('community.groupSize')}><input id="g-max" type="number" min={2} max={12} className={fieldClass} value={f.max_members} onChange={(e) => setF({ ...f, max_members: e.target.value })} /></Field>
          <Field id="g-vis" label={t('community.groupVisibility')}>
            <select id="g-vis" className={fieldClass} value={f.visibility} onChange={(e) => setF({ ...f, visibility: e.target.value })}><option value="public">{t('community.visPublic')}</option><option value="private">{t('community.visPrivate')}</option></select>
          </Field>
          <Field id="g-date" label={t('community.targetDate')}><input id="g-date" type="date" className={fieldClass} value={f.target_date} onChange={(e) => setF({ ...f, target_date: e.target.value })} /></Field>
          <div className="sm:col-span-2"><ErrorNote text={err} /></div>
          <div className="sm:col-span-2"><Button type="submit" className="min-h-[44px] rounded-full"><Users className="h-4 w-4" aria-hidden />{t('community.createGroup')}</Button></div>
        </form>
      </Panel>
    </div>
  )
}

export default function CommunityPage() {
  const gate = usePageGuard('user')
  const { t } = useT()
  const errText = useErrorText()
  const [d, setD] = useState<Mine | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => { if (gate.ready) call<Mine>('/api/community/me').then(setD).catch((e) => setErr(errText(e))) }, [gate.ready, errText])
  if (!gate.ready) return null
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeader title={t('community.myCommunity')} description={t('community.myCommunityLead')} icon={<MessagesSquare />}
        actions={<>
          <Button asChild variant="outline" className="min-h-[44px] rounded-full"><Link href="/community">{t('community.browseForum')}</Link></Button>
          {d?.moderator && <Button asChild variant="outline" className="min-h-[44px] rounded-full"><Link href="/dashboard/community/moderation"><ShieldCheck className="h-4 w-4" aria-hidden />{t('community.moderation')}</Link></Button>}
          <Button asChild className="min-h-[44px] rounded-full"><Link href="/dashboard/community/new"><PenSquare className="h-4 w-4" aria-hidden />{t('community.newThread')}</Link></Button>
        </>} />
      <ErrorNote text={err} />
      <Tabs defaultValue="activity">
        <TabsList><TabsTrigger value="activity">{t('community.tabActivity')}</TabsTrigger><TabsTrigger value="groups">{t('community.studyGroups')}</TabsTrigger></TabsList>
        <TabsContent value="activity" className="mt-4 space-y-6">
          {!d ? <Skeleton /> : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <StatCard label={t('community.reputation')} value={<span className="tabular-nums">{d.reputation}</span>} hint={t('community.reputationHint')} icon={<Star />} />
                <StatCard label={t('community.posts')} value={<span className="tabular-nums">{d.posts}</span>} icon={<MessagesSquare />} />
              </div>
              <Section title={t('community.myThreads')}>{d.threads.length ? <ThreadRows rows={d.threads} /> : <EmptyState compact title={t('community.noMyThreads')} description={t('community.noMyThreadsHint')} actionLabel={t('community.newThread')} actionHref="/dashboard/community/new" />}</Section>
              <Section title={t('community.following')}>{d.following.length ? <ThreadRows rows={d.following} /> : <p className="text-sm text-muted-foreground">{t('community.noFollowing')}</p>}</Section>
            </>
          )}
        </TabsContent>
        <TabsContent value="groups" className="mt-4"><Groups /></TabsContent>
      </Tabs>
    </div>
  )
}
