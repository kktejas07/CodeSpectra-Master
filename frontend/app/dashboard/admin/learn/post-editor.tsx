'use client'

/**
 * Review sheet for one Learn post: preview, markdown editor, quality flags,
 * regenerate a section, and the approval actions (approve / schedule /
 * publish / reject with a reason / unpublish / reopen).
 */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, CalendarClock, CheckCircle2, ExternalLink, Loader2, RefreshCw, Send, Trash2, XCircle } from 'lucide-react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { LearnMarkdown } from '@/components/learn/learn-markdown'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useToast } from '@/lib/toast-context'
import { toLocalDatetimeString } from '@/lib/datetime-local'
import { LEARN_CATEGORIES, LEARN_LEVELS, type LearnPostDoc } from '@/lib/learn/types'
import { REGENERATABLE_SECTIONS, SECTION_HEADINGS, type SectionKey } from '@/lib/learn/schema'
import type { LearnAction } from '@/lib/learn/state'
import { TranslationsPanel } from './translations-panel'
import { useAdminT } from '@/lib/i18n/admin'

const ACTION_LABEL: Record<LearnAction, string> = {
  approve: 'Approve',
  schedule: 'Schedule',
  unschedule: 'Unschedule',
  publish: 'Publish now',
  reject: 'Reject',
  reopen: 'Reopen as draft',
  unpublish: 'Unpublish',
}

export function scoreVariant(score: number): 'success' | 'warning' | 'danger' {
  return score >= 80 ? 'success' : score >= 60 ? 'warning' : 'danger'
}

export function PostEditor({ postId, onClose, onChanged, onOpenPost }: { postId: string | null; onClose: () => void; onChanged: () => void; onOpenPost?: (id: string) => void }) {
  const { t: tx } = useAdminT()
  const addToast = useToast()
  const [post, setPost] = useState<LearnPostDoc | null>(null)
  const [actions, setActions] = useState<LearnAction[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [form, setForm] = useState({ title: '', summary: '', body: '', tags: '', level: 'beginner', category: 'dsa', featured: false, slug: '' })
  const [dirty, setDirty] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [showReject, setShowReject] = useState(false)
  const [publishAt, setPublishAt] = useState('')
  const [section, setSection] = useState<SectionKey>('concept')
  const [instructions, setInstructions] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const hydrate = useCallback((p: LearnPostDoc, a: LearnAction[]) => {
    setPost(p)
    setActions(a)
    setForm({ title: p.title, summary: p.summary, body: p.body, tags: p.tags.join(', '), level: p.level, category: p.category, featured: !!p.featured, slug: p.slug })
    setDirty(false)
  }, [])

  useEffect(() => {
    if (!postId) return
    setLoading(true)
    setShowReject(false)
    setRejectReason('')
    setPublishAt(toLocalDatetimeString(new Date(Date.now() + 24 * 3600_000)))
    csrfFetch(`/api/learn/admin/posts/${encodeURIComponent(postId)}`)
      .then(async (r) => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || 'Could not load the post')
        hydrate(d.post, d.actions)
      })
      .catch((e) => addToast({ type: 'error', title: (e as Error).message }))
      .finally(() => setLoading(false))
  }, [postId, hydrate, addToast])

  const set = (k: keyof typeof form, v: string | boolean) => {
    setForm((f) => ({ ...f, [k]: v }))
    setDirty(true)
  }

  const call = async (key: string, url: string, init: RequestInit, ok: string) => {
    setBusy(key)
    try {
      const r = await csrfFetch(url, { headers: { 'Content-Type': 'application/json' }, ...init })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'That did not work')
      if (d.post) hydrate(d.post, d.actions ?? actions)
      addToast({ type: 'success', title: ok })
      onChanged()
      return true
    } catch (e) {
      addToast({ type: 'error', title: (e as Error).message })
      return false
    } finally {
      setBusy(null)
    }
  }

  const save = () =>
    post && call('save', `/api/learn/admin/posts/${post.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ ...form, slug: form.slug !== post.slug ? form.slug : undefined }),
    }, 'Changes saved')

  const act = async (action: LearnAction) => {
    if (!post) return
    if (dirty && action !== 'reject') {
      const saved = await save()
      if (!saved) return
    }
    const body: Record<string, unknown> = { action }
    if (action === 'reject') body.reason = rejectReason
    if (action === 'schedule') {
      const t = new Date(publishAt)
      if (Number.isNaN(t.getTime())) return addToast({ type: 'error', title: tx('learnEditor.pickADateAndTime') })
      body.publish_at = t.toISOString()
    }
    const done = await call(action, `/api/learn/admin/posts/${post.id}/action`, { method: 'POST', body: JSON.stringify(body) }, `${ACTION_LABEL[action]} — done`)
    if (done && action === 'reject') setShowReject(false)
  }

  const regenerate = () =>
    post && call('regen', `/api/learn/admin/posts/${post.id}/regenerate`, { method: 'POST', body: JSON.stringify({ section, instructions }) }, `${SECTION_HEADINGS[section]} rewritten`)

  const remove = async () => {
    setConfirmDelete(false)
    if (!post) return
    const ok = await call('delete', `/api/learn/admin/posts/${post.id}`, { method: 'DELETE' }, 'Post deleted')
    if (ok) onClose()
  }

  return (
    <Sheet open={!!postId} onOpenChange={(o) => { if (!o) onClose() }}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-4xl">
        <SheetHeader>
          <SheetTitle className="pr-8">{post?.title ?? 'Loading…'}</SheetTitle>
          <SheetDescription>{tx('learnEditor.reviewEditAndDecideNothing')}</SheetDescription>
        </SheetHeader>

        {loading || !post ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label={tx('learnEditor.loading')} /></div>
        ) : (
          <div className="space-y-5 px-4 pb-10">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="outline" className="capitalize">{post.status}</Badge>
              <Badge variant={scoreVariant(post.quality.score)}>{tx('learnEditor.quality')} <span className="tabular-nums">{post.quality.score}</span></Badge>
              <span className="text-muted-foreground">{post.generated_by === 'bot' ? 'Written by the bot' : 'Written on request'}{post.model ? ` · ${post.model}` : ''}</span>
              {post.status === 'published' && (
                <Link href={`/learn/${post.slug}`} target="_blank" className="inline-flex items-center gap-1 text-primary hover:underline">
                  View live <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                </Link>
              )}
              {post.publish_at && <span className="text-muted-foreground">Publishes {new Date(post.publish_at).toLocaleString()}</span>}
            </div>

            <TranslationsPanel key={post.id} post={post} onOpen={(id) => onOpenPost?.(id)} onChanged={onChanged} />

            {post.quality.flags.length > 0 && (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
                <p className="flex items-center gap-2 font-medium text-foreground"><AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden /> {tx('learnEditor.checkBeforeApproving')}</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 font-mono text-xs text-muted-foreground">
                  {post.quality.flags.map((f) => <li key={f}>{f}</li>)}
                </ul>
              </div>
            )}
            {post.reject_reason && <p className="rounded-2xl border border-border bg-muted/40 p-3 text-sm text-muted-foreground">Rejected because: {post.reject_reason}</p>}

            {/* Decision bar */}
            <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-border bg-card p-3">
              {actions.includes('approve') && <Button size="sm" onClick={() => act('approve')} disabled={!!busy}><CheckCircle2 className="mr-1.5 h-4 w-4" aria-hidden />{tx('common.approve')}</Button>}
              {actions.includes('publish') && <Button size="sm" onClick={() => act('publish')} disabled={!!busy}><Send className="mr-1.5 h-4 w-4" aria-hidden />{tx('learnEditor.publishNow')}</Button>}
              {actions.includes('schedule') && (
                <div className="flex flex-wrap items-end gap-2">
                  <div>
                    <Label htmlFor="learn-publish-at" className="text-xs">{tx('learnEditor.publishAt')}</Label>
                    <Input id="learn-publish-at" type="datetime-local" value={publishAt} onChange={(e) => setPublishAt(e.target.value)} className="h-9 w-52" />
                  </div>
                  <Button size="sm" variant="outline" onClick={() => act('schedule')} disabled={!!busy}><CalendarClock className="mr-1.5 h-4 w-4" aria-hidden />{tx('learnEditor.schedule')}</Button>
                </div>
              )}
              {(['unschedule', 'unpublish', 'reopen'] as LearnAction[]).filter((a) => actions.includes(a)).map((a) => (
                <Button key={a} size="sm" variant="outline" onClick={() => act(a)} disabled={!!busy}>{ACTION_LABEL[a]}</Button>
              ))}
              {actions.includes('reject') && <Button size="sm" variant="outline" onClick={() => setShowReject((v) => !v)} disabled={!!busy}><XCircle className="mr-1.5 h-4 w-4" aria-hidden />{tx('common.reject')}</Button>}
              {post.status !== 'published' && <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)} disabled={!!busy} aria-label={tx('learnEditor.deletePost')}><Trash2 className="h-4 w-4" aria-hidden /></Button>}
              {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label={tx('learnEditor.working')} />}
            </div>
            {confirmDelete && (
              <div role="alertdialog" aria-label={tx('learnEditor.confirmDelete')} className="flex flex-wrap items-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/5 p-3 text-sm">
                <span className="text-foreground">{tx('learnEditor.deleteThisPostThisCannot')}</span>
                <Button size="sm" variant="destructive" onClick={remove} disabled={!!busy}>{tx('common.delete')}</Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>{tx('common.cancel')}</Button>
              </div>
            )}
            {showReject && (
              <div className="space-y-2 rounded-2xl border border-border p-3">
                <Label htmlFor="learn-reject">{tx('learnEditor.whyAreYouRejectingIt')}</Label>
                <Textarea id="learn-reject" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3} maxLength={1000} placeholder={tx('learnEditor.eGTheComplexityOf')} />
                <Button size="sm" variant="destructive" onClick={() => act('reject')} disabled={!rejectReason.trim() || !!busy}>{tx('learnEditor.rejectPost')}</Button>
              </div>
            )}

            <Tabs defaultValue="preview">
              <TabsList>
                <TabsTrigger value="preview">{tx('learnEditor.preview')}</TabsTrigger>
                <TabsTrigger value="edit">Edit{dirty ? ' •' : ''}</TabsTrigger>
                <TabsTrigger value="regenerate">{tx('learnEditor.rewriteASection')}</TabsTrigger>
              </TabsList>

              <TabsContent value="preview" className="pt-4">
                <h2 className="text-2xl font-bold tracking-tight text-foreground">{form.title}</h2>
                <p className="mt-2 text-muted-foreground">{form.summary}</p>
                <LearnMarkdown content={form.body} className="mt-6" />
                {post.sources.length > 0 && (
                  <div className="mt-6 rounded-2xl border border-border p-4 text-sm">
                    <p className="font-medium text-foreground">{tx('learnEditor.sourcesUrlsOnly')}</p>
                    <ul className="mt-2 space-y-1">{post.sources.map((s) => <li key={s.url}><a className="break-all text-primary hover:underline" href={s.url} target="_blank" rel="noopener noreferrer">{s.url}</a></li>)}</ul>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="edit" className="space-y-4 pt-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Label htmlFor="learn-title">{tx('common.title')}</Label>
                    <Input id="learn-title" value={form.title} onChange={(e) => set('title', e.target.value)} maxLength={140} />
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor="learn-summary">{tx('learnEditor.summary')}</Label>
                    <Textarea id="learn-summary" value={form.summary} onChange={(e) => set('summary', e.target.value)} rows={2} maxLength={400} />
                  </div>
                  <div>
                    <Label htmlFor="learn-category">{tx('learnEditor.category')}</Label>
                    <Select value={form.category} onValueChange={(v) => set('category', v)}>
                      <SelectTrigger id="learn-category"><SelectValue /></SelectTrigger>
                      <SelectContent>{LEARN_CATEGORIES.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="learn-level">{tx('learnEditor.level')}</Label>
                    <Select value={form.level} onValueChange={(v) => set('level', v)}>
                      <SelectTrigger id="learn-level"><SelectValue /></SelectTrigger>
                      <SelectContent>{LEARN_LEVELS.map((l) => <SelectItem key={l} value={l} className="capitalize">{l}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="learn-tags">{tx('learnEditor.tagsCommaSeparated')}</Label>
                    <Input id="learn-tags" value={form.tags} onChange={(e) => set('tags', e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="learn-slug">{tx('learnEditor.link')}</Label>
                    <Input id="learn-slug" value={form.slug} onChange={(e) => set('slug', e.target.value)} disabled={!!post.published_at} />
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch id="learn-featured" checked={form.featured} onCheckedChange={(v) => set('featured', v)} />
                    <Label htmlFor="learn-featured">{tx('learnEditor.featureOnTheHomePage')}</Label>
                  </div>
                </div>
                <div>
                  <Label htmlFor="learn-body">{tx('learnEditor.postMarkdown')}</Label>
                  <Textarea id="learn-body" value={form.body} onChange={(e) => set('body', e.target.value)} rows={24} className="font-mono text-[13px]" spellCheck={false} />
                  <p className="mt-1 text-xs text-muted-foreground">{tx('learnEditor.rawHtmlIsRemovedWhen')}</p>
                </div>
                <Button onClick={save} disabled={!dirty || !!busy}>{busy === 'save' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden /> : null}Save changes</Button>
              </TabsContent>

              <TabsContent value="regenerate" className="space-y-4 pt-4">
                <p className="text-sm text-muted-foreground">The bot rewrites just this section; the rest of the post, including your edits, stays as it is.</p>
                {post.status === 'published' ? (
                  <p className="text-sm text-muted-foreground">{tx('learnEditor.unpublishThePostFirstTo')}</p>
                ) : (
                  <>
                    <div className="max-w-xs">
                      <Label htmlFor="learn-section">{tx('learnEditor.section')}</Label>
                      <Select value={section} onValueChange={(v) => setSection(v as SectionKey)}>
                        <SelectTrigger id="learn-section"><SelectValue /></SelectTrigger>
                        <SelectContent>{REGENERATABLE_SECTIONS.map((s) => <SelectItem key={s} value={s}>{SECTION_HEADINGS[s]}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="learn-instr">{tx('learnEditor.whatShouldChangeOptional')}</Label>
                      <Textarea id="learn-instr" value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={2} maxLength={500} placeholder={tx('learnEditor.eGUseASmaller')} />
                    </div>
                    <Button onClick={regenerate} disabled={!!busy || dirty} variant="outline">
                      {busy === 'regen' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden />}
                      {tx('learnEditor.rewriteSection')}
                    </Button>
                    {dirty && <p className="text-xs text-muted-foreground">{tx('learnEditor.saveYourEditsFirst')}</p>}
                  </>
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
