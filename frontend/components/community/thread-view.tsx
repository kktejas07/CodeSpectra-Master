'use client'

/**
 * One forum thread. Renders the cached public copy first (SEO, signed-out
 * readers), then loads the viewer's state: their votes, follow, accepted
 * answer controls, members-only threads and unlocked solution write-ups.
 */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowBigDown, ArrowBigUp, Bell, BellOff, CheckCircle2, Flag, Lock, Trash2 } from 'lucide-react'
import { useT } from '@/lib/i18n/client'
import { useToast } from '@/lib/toast-context'
import { Panel } from '@/components/app/page-kit'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PostMarkdown } from './post-markdown'
import { call, ErrorNote, Skeleton, areaClass, useErrorText } from './client-api'
import type { PublicThread } from '@/lib/community/service'

interface Viewer {
  thread: PublicThread & { status?: string }
  locked_solution: boolean
  is_author: boolean
  is_moderator: boolean
  my_votes: Record<string, number>
  following: boolean
  signed_in: boolean
  problem_slug: string | null
}

function Votes({ id, type, score, mine, disabled, onVote }: { id: string; type: 'thread' | 'reply'; score: number; mine: number; disabled: boolean; onVote: (type: 'thread' | 'reply', id: string, v: number) => void }) {
  const { t } = useT()
  return (
    <div className="flex flex-col items-center gap-1" aria-label={t('community.votes')}>
      <Button variant="ghost" size="icon-lg" disabled={disabled} aria-pressed={mine === 1} aria-label={t('community.upvote')} onClick={() => onVote(type, id, mine === 1 ? 0 : 1)} className={mine === 1 ? 'text-primary' : ''}><ArrowBigUp className="h-5 w-5" aria-hidden /></Button>
      <span className="text-sm font-semibold tabular-nums text-foreground">{score}</span>
      <Button variant="ghost" size="icon-lg" disabled={disabled} aria-pressed={mine === -1} aria-label={t('community.downvote')} onClick={() => onVote(type, id, mine === -1 ? 0 : -1)} className={mine === -1 ? 'text-destructive' : ''}><ArrowBigDown className="h-5 w-5" aria-hidden /></Button>
    </div>
  )
}

function ReportButton({ type, id }: { type: 'thread' | 'reply'; id: string }) {
  const { t, td } = useT()
  const toast = useToast()
  const errText = useErrorText()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('spam')
  const send = async () => {
    try {
      await call('/api/community/report', { body: { target_type: type, target_id: id, reason } })
      toast({ type: 'success', title: t('community.reported') })
      setOpen(false)
    } catch (e) { toast({ type: 'error', title: errText(e) }) }
  }
  if (!open) return <Button variant="ghost" size="sm" className="min-h-[44px]" onClick={() => setOpen(true)}><Flag className="h-4 w-4" aria-hidden />{t('community.report')}</Button>
  return (
    <span className="flex flex-wrap items-center gap-2">
      <select aria-label={t('community.reportReason')} className="h-11 rounded-xl border border-border bg-background px-2 text-sm text-foreground" value={reason} onChange={(e) => setReason(e.target.value)}>
        {(['spam', 'abuse', 'off_topic', 'spoiler', 'other'] as const).map((r) => <option key={r} value={r}>{td(`community.reason_${r}`, r)}</option>)}
      </select>
      <Button size="sm" className="min-h-[44px]" onClick={send}>{t('community.sendReport')}</Button>
      <Button size="sm" variant="ghost" className="min-h-[44px]" onClick={() => setOpen(false)}>{t('community.cancel')}</Button>
    </span>
  )
}

export function ThreadView({ id, initial, signInHref }: { id: string; initial: PublicThread | null; signInHref: string }) {
  const { t, td, fmt, locale } = useT()
  const toast = useToast()
  const errText = useErrorText()
  const [v, setV] = useState<Viewer | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [reply, setReply] = useState('')
  const [lang, setLang] = useState<string>(locale)
  const [preview, setPreview] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    call<Viewer>(`/api/community/threads/${id}`).then(setV).catch((e) => { if (!initial) setErr(errText(e)) })
  }, [id, initial, errText])
  useEffect(load, [load])

  const th = v?.thread ?? initial
  if (err) return <ErrorNote text={err} />
  if (!th) return <Skeleton className="h-64" />
  const signedIn = !!v?.signed_in
  const votes = v?.my_votes ?? {}

  const onVote = async (type: 'thread' | 'reply', target: string, value: number) => {
    if (!signedIn) { window.location.href = signInHref; return }
    try { await call('/api/community/vote', { body: { target_type: type, target_id: target, value } }); load() } catch (e) { toast({ type: 'error', title: errText(e) }) }
  }
  const accept = async (rid: string | null) => {
    try { await call(`/api/community/threads/${id}/accept`, { body: { reply_id: rid } }); load() } catch (e) { toast({ type: 'error', title: errText(e) }) }
  }
  const follow = async () => {
    try { await call(`/api/community/threads/${id}/follow`, { body: { on: !v?.following } }); load() } catch (e) { toast({ type: 'error', title: errText(e) }) }
  }
  const remove = async (type: 'thread' | 'reply', rid: string) => {
    if (!window.confirm(t('community.deleteConfirm'))) return
    try { await call(type === 'thread' ? `/api/community/threads/${rid}` : `/api/community/replies/${rid}`, { method: 'DELETE' }); load() } catch (e) { toast({ type: 'error', title: errText(e) }) }
  }
  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const r = await call<{ status: string }>(`/api/community/threads/${id}/replies`, { body: { body: reply, lang } })
      setReply('')
      setPreview(false)
      toast({ type: 'success', title: r.status === 'visible' ? t('community.replyPosted') : t('community.replyPending') })
      load()
    } catch (e2) { toast({ type: 'error', title: errText(e2) }) } finally { setBusy(false) }
  }

  const locked = v ? v.locked_solution : th.kind === 'solution'
  return (
    <article className="space-y-5">
      <Panel className="p-5 sm:p-6">
        <div className="flex gap-4">
          <Votes id={th.id} type="thread" score={th.score} mine={votes[th.id] ?? 0} disabled={!!v?.is_author} onVote={onVote} />
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{td(`community.threadKind_${th.kind}`, th.kind)}</Badge>
              {th.answered && <Badge variant="success">{t('community.answered')}</Badge>}
              {th.locked && <Badge variant="warning"><Lock className="h-3 w-3" aria-hidden />{t('community.locked')}</Badge>}
              {v?.thread.status === 'pending' && <Badge variant="warning">{t('community.awaitingReview')}</Badge>}
              {th.tags.map((tag) => <Badge key={tag} variant="secondary">{tag}</Badge>)}
            </div>
            <h1 lang={th.lang !== 'other' ? th.lang : undefined} className="text-2xl font-bold tracking-tight text-foreground">{th.title}</h1>
            <p className="text-sm text-muted-foreground">{t('community.byOn', { name: th.author_name, date: fmt.date(th.created_at, { dateStyle: 'medium' }) })}{th.problem_title ? ` · ${t('community.solutionFor', { problem: th.problem_title })}` : ''}</p>
            {locked ? (
              <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-5 text-sm">
                <p className="flex items-center gap-2 font-medium text-foreground"><Lock className="h-4 w-4" aria-hidden />{t('community.solutionLocked')}</p>
                <p className="mt-1 text-muted-foreground">{t('community.solutionLockedHint')}</p>
                {v?.problem_slug ? <Button asChild className="mt-3 min-h-[44px] rounded-full"><Link href={`/dashboard/problems/${encodeURIComponent(v.problem_slug)}`}>{t('community.solveIt')}</Link></Button> : !signedIn && <Button asChild className="mt-3 min-h-[44px] rounded-full"><Link href={signInHref}>{t('community.signInToUnlock')}</Link></Button>}
              </div>
            ) : th.body !== null && <PostMarkdown text={th.body} lang={th.lang} />}
            <div className="flex flex-wrap gap-2">
              {signedIn && <Button variant="outline" size="sm" className="min-h-[44px] rounded-full" onClick={follow}>{v?.following ? <><BellOff className="h-4 w-4" aria-hidden />{t('community.unfollow')}</> : <><Bell className="h-4 w-4" aria-hidden />{t('community.follow')}</>}</Button>}
              {signedIn && !v?.is_author && <ReportButton type="thread" id={th.id} />}
              {(v?.is_author || v?.is_moderator) && <Button variant="ghost" size="sm" className="min-h-[44px]" onClick={() => remove('thread', th.id)}><Trash2 className="h-4 w-4" aria-hidden />{t('community.delete')}</Button>}
            </div>
          </div>
        </div>
      </Panel>

      {!locked && (
        <section className="space-y-3" aria-label={t('community.replies')}>
          <h2 className="text-lg font-semibold text-foreground">{t('community.replyCount', { count: th.replies.length })}</h2>
          {th.replies.map((r) => (
            <Panel key={r.id} className={`p-5 ${r.accepted ? 'border-green-500/40' : ''}`}>
              <div className="flex gap-4">
                <Votes id={r.id} type="reply" score={r.score} mine={votes[r.id] ?? 0} disabled={false} onVote={onVote} />
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    {r.accepted && <Badge variant="success"><CheckCircle2 className="h-3 w-3" aria-hidden />{t('community.acceptedAnswer')}</Badge>}
                    <span>{t('community.byOn', { name: r.author_name, date: fmt.relative(r.created_at) })}</span>
                  </p>
                  <PostMarkdown text={r.body} lang={r.lang} />
                  <div className="flex flex-wrap gap-2">
                    {th.kind === 'question' && (v?.is_author || v?.is_moderator) && (
                      <Button variant="outline" size="sm" className="min-h-[44px] rounded-full" onClick={() => accept(r.accepted ? null : r.id)}>{r.accepted ? t('community.unaccept') : t('community.accept')}</Button>
                    )}
                    {signedIn && <ReportButton type="reply" id={r.id} />}
                    {v?.is_moderator && <Button variant="ghost" size="sm" className="min-h-[44px]" onClick={() => remove('reply', r.id)}><Trash2 className="h-4 w-4" aria-hidden />{t('community.delete')}</Button>}
                  </div>
                </div>
              </div>
            </Panel>
          ))}
          {signedIn ? (
            th.locked && !v?.is_moderator ? <p className="text-sm text-muted-foreground">{t('community.threadLockedNote')}</p> : (
              <Panel className="p-5">
                <form onSubmit={send} className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label htmlFor="reply-body" className="text-sm font-medium text-foreground">{t('community.yourReply')}</label>
                    <span className="flex items-center gap-2">
                      <select aria-label={t('community.writingIn')} className="h-11 rounded-xl border border-border bg-background px-2 text-sm text-foreground" value={lang} onChange={(e) => setLang(e.target.value)}>
                        {(['en', 'hi', 'te', 'other'] as const).map((l) => <option key={l} value={l}>{td(`community.lang_${l}`, l)}</option>)}
                      </select>
                      <Button type="button" variant="ghost" size="sm" className="min-h-[44px]" aria-pressed={preview} onClick={() => setPreview(!preview)}>{preview ? t('community.write') : t('community.preview')}</Button>
                    </span>
                  </div>
                  {preview ? <div className="min-h-[120px] rounded-xl border border-border p-3"><PostMarkdown text={reply || t('community.nothingYet')} lang={lang} /></div> : <textarea id="reply-body" className={areaClass} value={reply} onChange={(e) => setReply(e.target.value)} maxLength={20000} required />}
                  <p className="text-xs text-muted-foreground">{t('community.markdownHint')}</p>
                  <Button type="submit" disabled={busy || reply.trim().length < 2} className="min-h-[44px] rounded-full">{busy ? t('community.posting') : t('community.postReply')}</Button>
                </form>
              </Panel>
            )
          ) : (
            <Panel className="flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">{t('community.signInToReply')}</p>
              <Button asChild className="min-h-[44px] rounded-full"><Link href={signInHref}>{t('community.signIn')}</Link></Button>
            </Panel>
          )}
        </section>
      )}
    </article>
  )
}
