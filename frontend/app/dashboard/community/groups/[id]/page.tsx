'use client'

/** Study group: shared goal, members and the group chat thread (polls every 10 s while the tab is visible). */
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { Copy, Send, Users } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useT } from '@/lib/i18n/client'
import { useToast } from '@/lib/toast-context'
import { PageHeader, Panel } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { PostMarkdown } from '@/components/community/post-markdown'
import { call, Skeleton, useErrorText } from '@/components/community/client-api'
import type { GroupDoc, GroupMessageDoc } from '@/lib/community/db'

type View = { group: GroupDoc; members: { user_id: string; name: string; role: string }[]; my_role: string | null }
type Msg = GroupMessageDoc & { mine: boolean }

export default function GroupPage() {
  const gate = usePageGuard('user')
  const { t, fmt } = useT()
  const { id = '' } = useParams<{ id: string }>()
  const router = useRouter()
  const toast = useToast()
  const errText = useErrorText()
  const [v, setV] = useState<View | null>(null)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [text, setText] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const end = useRef<HTMLDivElement>(null)

  const loadMsgs = useCallback(() => {
    call<{ messages: Msg[] }>(`/api/community/groups/${id}/messages`).then((r) => setMsgs(r.messages)).catch(() => {})
  }, [id])
  useEffect(() => {
    if (!gate.ready) return
    call<View>(`/api/community/groups/${id}`).then((r) => { setV(r); if (r.my_role) loadMsgs() }).catch((e) => setErr(errText(e)))
  }, [gate.ready, id, loadMsgs, errText])
  useEffect(() => {
    if (!v?.my_role) return
    const tick = () => { if (document.visibilityState === 'visible') loadMsgs() }
    const h = window.setInterval(tick, 10_000)
    return () => window.clearInterval(h)
  }, [v?.my_role, loadMsgs])
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [msgs.length])

  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    const body = text.trim()
    if (!body) return
    try {
      const r = await call<{ message: Msg }>(`/api/community/groups/${id}/messages`, { body: { body } })
      setText('')
      setMsgs((m) => [...m, r.message])
      if (r.message.status === 'pending') toast({ type: 'info', title: t('community.messagePending') })
    } catch (e2) { toast({ type: 'error', title: errText(e2) }) }
  }
  const act = async (action: 'join' | 'leave') => {
    try {
      await call(`/api/community/groups/${id}`, { body: { action } })
      if (action === 'leave') router.push('/dashboard/community')
      else { const r = await call<View>(`/api/community/groups/${id}`); setV(r); loadMsgs() }
    } catch (e) { toast({ type: 'error', title: errText(e) }) }
  }
  const report = async (mid: string) => {
    try { await call('/api/community/report', { body: { target_type: 'message', target_id: mid, reason: 'abuse' } }); toast({ type: 'success', title: t('community.reported') }) } catch (e) { toast({ type: 'error', title: errText(e) }) }
  }

  if (!gate.ready) return null
  if (err) return <EmptyState illustration="error" title={t('community.groupUnavailable')} description={err} actionLabel={t('community.myCommunity')} actionHref="/dashboard/community" />
  if (!v) return <Skeleton />
  const g = v.group
  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <PageHeader title={g.name} description={g.goal} icon={<Users />}
        actions={v.my_role ? <Button variant="ghost" className="min-h-[44px] rounded-full" onClick={() => act('leave')}>{t('community.leaveGroup')}</Button> : <Button className="min-h-[44px] rounded-full" onClick={() => act('join')}>{t('community.joinGroup')}</Button>} />
      <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
        <Panel className="flex min-h-[420px] flex-col p-0">
          {v.my_role ? (
            <>
              <div className="max-h-[60vh] flex-1 space-y-3 overflow-y-auto p-5" aria-live="polite">
                {!msgs.length && <p className="text-sm text-muted-foreground">{t('community.noMessages')}</p>}
                {msgs.map((m) => (
                  <div key={m.id} className={`max-w-[85%] rounded-2xl px-4 py-2 ${m.mine ? 'ml-auto bg-primary/10' : 'bg-muted'}`}>
                    <p className="text-xs text-muted-foreground">{m.author_name} · <span className="tabular-nums">{fmt.relative(m.created_at)}</span>{m.status === 'pending' ? ` · ${t('community.awaitingReview')}` : ''}</p>
                    <PostMarkdown text={m.body} compact />
                    {!m.mine && <button type="button" className="mt-1 min-h-[32px] text-xs text-muted-foreground underline-offset-4 hover:underline" onClick={() => report(m.id)}>{t('community.report')}</button>}
                  </div>
                ))}
                <div ref={end} />
              </div>
              <form onSubmit={send} className="flex gap-2 border-t border-border p-3">
                <label htmlFor="chat-input" className="sr-only">{t('community.message')}</label>
                <textarea id="chat-input" rows={2} className="min-h-[44px] flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" value={text} onChange={(e) => setText(e.target.value)} maxLength={4000}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(e as unknown as React.FormEvent) } }} />
                <Button type="submit" size="icon-lg" aria-label={t('community.send')} disabled={!text.trim()}><Send className="h-4 w-4" aria-hidden /></Button>
              </form>
            </>
          ) : <div className="p-5"><EmptyState compact title={t('community.joinToChat')} description={t('community.joinToChatHint')} /></div>}
        </Panel>
        <aside className="space-y-4">
          <Panel className="space-y-2 p-5">
            <h2 className="text-sm font-semibold text-foreground">{t('community.membersOf', { count: g.member_count, max: g.max_members })}</h2>
            <ul className="space-y-1 text-sm text-foreground">{v.members.map((m) => <li key={m.user_id}>{m.name}{m.role === 'owner' ? ` · ${t('community.owner')}` : ''}</li>)}</ul>
            {g.target_date && <p className="text-xs text-muted-foreground">{t('community.targetOn', { date: fmt.date(g.target_date, { dateStyle: 'medium' }) })}</p>}
          </Panel>
          {g.description && <Panel className="p-5"><PostMarkdown text={g.description} compact /></Panel>}
          {g.join_code && (
            <Panel className="space-y-2 p-5">
              <p className="text-sm text-foreground">{t('community.inviteCode')}: <code className="font-mono">{g.join_code}</code></p>
              <Button variant="outline" size="sm" className="min-h-[44px] rounded-full" onClick={() => { void navigator.clipboard?.writeText(g.join_code || ''); toast({ type: 'success', title: t('community.copied') }) }}><Copy className="h-4 w-4" aria-hidden />{t('community.copyCode')}</Button>
            </Panel>
          )}
          <Link href="/community" className="block text-sm font-medium text-primary underline-offset-4 hover:underline">{t('community.browseForum')}</Link>
        </aside>
      </div>
    </div>
  )
}
