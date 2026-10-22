'use client'

/** Moderation queue (forum moderators + superadmins): held posts and reports; superadmins also edit forum settings and moderators. */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ShieldCheck } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useT } from '@/lib/i18n/client'
import { useToast } from '@/lib/toast-context'
import { PageHeader, Panel, Section } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PostMarkdown } from '@/components/community/post-markdown'
import { call, ErrorNote, Field, Skeleton, areaClass, fieldClass, useErrorText } from '@/components/community/client-api'
import type { CommunitySettings } from '@/lib/community/pure'

type Pending = { type: 'thread' | 'reply' | 'message'; id: string; thread_id: string | null; title: string | null; body: string; author_id: string; author_name: string; reasons: string[]; created_at: string }
type Report = { id: string; target_type: 'thread' | 'reply' | 'message'; target_id: string; thread_id: string | null; reason: string; note: string; created_at: string; target: { body?: string; title?: string; author_name?: string; author_id?: string; status?: string } | null }

function Settings() {
  const { t } = useT()
  const toast = useToast()
  const errText = useErrorText()
  const [s, setS] = useState<CommunitySettings | null>(null)
  const [usage, setUsage] = useState<{ usedToday: number; spentMonthUsd: number } | null>(null)
  const [words, setWords] = useState('')
  const [mods, setMods] = useState<{ user_id: string; name: string }[]>([])
  const [email, setEmail] = useState('')
  const load = useCallback(() => {
    call<{ settings: CommunitySettings; ai_usage: { usedToday: number; spentMonthUsd: number } }>('/api/community/settings').then((r) => { setS(r.settings); setUsage(r.ai_usage); setWords(r.settings.profanity.words.join(', ')) }).catch(() => setS(null))
    call<{ moderators: { user_id: string; name: string }[] }>('/api/community/moderators').then((r) => setMods(r.moderators)).catch(() => setMods([]))
  }, [])
  useEffect(load, [load])
  if (!s) return null
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await call('/api/community/settings', { method: 'PUT', body: { ...s, profanity: { ...s.profanity, words: words.split(',').map((w) => w.trim()).filter(Boolean) } } })
      toast({ type: 'success', title: t('community.saved') })
      load()
    } catch (e2) { toast({ type: 'error', title: errText(e2) }) }
  }
  const setMod = async (mail: string, on: boolean) => {
    try { await call('/api/community/moderators', { body: { email: mail, moderator: on } }); setEmail(''); load() } catch (e) { toast({ type: 'error', title: errText(e) }) }
  }
  const num = (v: string) => Number(v)
  return (
    <Section title={t('community.forumSettings')}>
      <Panel className="p-5 sm:p-6">
        <form onSubmit={save} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="flex min-h-[44px] items-center gap-2 text-sm text-foreground"><input type="checkbox" checked={s.profanity.enabled} onChange={(e) => setS({ ...s, profanity: { ...s.profanity, enabled: e.target.checked } })} />{t('community.profanityOn')}</label>
          <Field id="ps-act" label={t('community.profanityAction')}>
            <select id="ps-act" className={fieldClass} value={s.profanity.action} onChange={(e) => setS({ ...s, profanity: { ...s.profanity, action: e.target.value as CommunitySettings['profanity']['action'] } })}>
              <option value="mask">{t('community.profanityMask')}</option><option value="reject">{t('community.profanityReject')}</option><option value="review">{t('community.profanityReview')}</option>
            </select>
          </Field>
          <Field id="ps-words" label={t('community.profanityWords')} hint={t('community.commaSeparated')} className="sm:col-span-2 lg:col-span-3"><textarea id="ps-words" className={areaClass} value={words} onChange={(e) => setWords(e.target.value)} /></Field>
          <Field id="ps-nd" label={t('community.newAccountDays')}><input id="ps-nd" type="number" min={0} max={90} className={fieldClass} value={s.links.new_account_days} onChange={(e) => setS({ ...s, links: { ...s.links, new_account_days: num(e.target.value) } })} /></Field>
          <Field id="ps-ln" label={t('community.linksNew')}><input id="ps-ln" type="number" min={0} max={20} className={fieldClass} value={s.links.max_links_new} onChange={(e) => setS({ ...s, links: { ...s.links, max_links_new: num(e.target.value) } })} /></Field>
          <Field id="ps-lm" label={t('community.linksMax')}><input id="ps-lm" type="number" min={0} max={50} className={fieldClass} value={s.links.max_links} onChange={(e) => setS({ ...s, links: { ...s.links, max_links: num(e.target.value) } })} /></Field>
          <Field id="ps-th" label={t('community.threadsPerHour')}><input id="ps-th" type="number" min={1} max={100} className={fieldClass} value={s.rate.threads_per_hour} onChange={(e) => setS({ ...s, rate: { ...s.rate, threads_per_hour: num(e.target.value) } })} /></Field>
          <Field id="ps-rh" label={t('community.repliesPerHour')}><input id="ps-rh" type="number" min={1} max={500} className={fieldClass} value={s.rate.replies_per_hour} onChange={(e) => setS({ ...s, rate: { ...s.rate, replies_per_hour: num(e.target.value) } })} /></Field>
          <Field id="ps-mm" label={t('community.messagesPerMinute')}><input id="ps-mm" type="number" min={1} max={120} className={fieldClass} value={s.rate.messages_per_minute} onChange={(e) => setS({ ...s, rate: { ...s.rate, messages_per_minute: num(e.target.value) } })} /></Field>
          <label className="flex min-h-[44px] items-center gap-2 text-sm text-foreground"><input type="checkbox" checked={s.ai.enabled} onChange={(e) => setS({ ...s, ai: { ...s.ai, enabled: e.target.checked } })} />{t('community.aiModeration')}</label>
          <Field id="ps-ad" label={t('community.aiDailyCap')}><input id="ps-ad" type="number" min={0} max={10000} className={fieldClass} value={s.ai.daily_cap} onChange={(e) => setS({ ...s, ai: { ...s.ai, daily_cap: num(e.target.value) } })} /></Field>
          <Field id="ps-am" label={t('community.aiMonthlyCap')} hint={usage ? t('community.aiUsage', { today: usage.usedToday, usd: usage.spentMonthUsd.toFixed(2) }) : undefined}><input id="ps-am" type="number" min={0} max={1000} step="0.5" className={fieldClass} value={s.ai.monthly_cost_cap_usd} onChange={(e) => setS({ ...s, ai: { ...s.ai, monthly_cost_cap_usd: num(e.target.value) } })} /></Field>
          <Field id="ps-xp" label={t('community.xpPerPoint')}><input id="ps-xp" type="number" min={0} max={10} className={fieldClass} value={s.xp.per_point} onChange={(e) => setS({ ...s, xp: { ...s.xp, per_point: num(e.target.value) } })} /></Field>
          <Field id="ps-xc" label={t('community.xpDailyCap')}><input id="ps-xc" type="number" min={0} max={1000} className={fieldClass} value={s.xp.daily_cap} onChange={(e) => setS({ ...s, xp: { ...s.xp, daily_cap: num(e.target.value) } })} /></Field>
          <div className="sm:col-span-2 lg:col-span-3"><Button type="submit" className="min-h-[44px] rounded-full">{t('community.saveSettings')}</Button></div>
        </form>
      </Panel>
      <Panel className="space-y-3 p-5 sm:p-6">
        <h3 className="font-semibold text-foreground">{t('community.moderators')}</h3>
        <ul className="space-y-1 text-sm text-foreground">{mods.map((m) => <li key={m.user_id}>{m.name}</li>)}</ul>
        <form onSubmit={(e) => { e.preventDefault(); void setMod(email, true) }} className="flex flex-wrap items-end gap-2">
          <Field id="mod-email" label={t('community.moderatorEmail')}><input id="mod-email" type="email" className={fieldClass} value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
          <Button type="submit" className="min-h-[44px] rounded-full">{t('community.makeModerator')}</Button>
          <Button type="button" variant="ghost" className="min-h-[44px] rounded-full" disabled={!email} onClick={() => setMod(email, false)}>{t('community.removeModerator')}</Button>
        </form>
      </Panel>
    </Section>
  )
}

export default function ModerationPage() {
  const gate = usePageGuard('user')
  const { t, td, fmt } = useT()
  const toast = useToast()
  const errText = useErrorText()
  const [d, setD] = useState<{ pending: Pending[]; reports: Report[] } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const load = useCallback(() => { call<{ pending: Pending[]; reports: Report[] }>('/api/community/moderation').then(setD).catch((e) => setErr(errText(e))) }, [errText])
  useEffect(() => { if (gate.ready) load() }, [gate.ready, load])
  const act = async (target_type: string, target_id: string, action: string, author_id?: string) => {
    const ban = action === 'remove' && author_id ? window.prompt(t('community.banPrompt'), '0') : null
    try {
      await call('/api/community/moderation', { body: { target_type, target_id, action, ...(ban && Number(ban) > 0 ? { ban_days: Number(ban), author_id } : {}) } })
      load()
    } catch (e) { toast({ type: 'error', title: errText(e) }) }
  }
  if (!gate.ready) return null
  const actions = (type: string, id: string, author?: string) => (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" className="min-h-[44px] rounded-full" onClick={() => act(type, id, 'approve')}>{t('community.approve')}</Button>
      <Button size="sm" variant="outline" className="min-h-[44px] rounded-full" onClick={() => act(type, id, 'hide')}>{t('community.hide')}</Button>
      <Button size="sm" variant="destructive" className="min-h-[44px] rounded-full" onClick={() => act(type, id, 'remove', author)}>{t('community.remove')}</Button>
    </div>
  )
  const link = (threadId: string | null) => threadId ? <Link className="text-sm text-primary underline-offset-4 hover:underline" href={`/dashboard/community/t/${threadId}`}>{t('community.openThread')}</Link> : null
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <PageHeader title={t('community.moderation')} description={t('community.moderationLead')} icon={<ShieldCheck />} />
      <ErrorNote text={err} />
      {!d && !err && <Skeleton />}
      {d && (
        <>
          <Section title={t('community.heldPosts', { count: d.pending.length })}>
            {d.pending.length ? d.pending.map((p) => (
              <Panel key={`${p.type}:${p.id}`} className="space-y-3 p-5">
                <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"><Badge variant="outline">{td(`community.target_${p.type}`, p.type)}</Badge>{p.author_name} · <span className="tabular-nums">{fmt.relative(p.created_at)}</span>{p.reasons.map((r) => <Badge key={r} variant="warning">{td(`community.flag_${r}`, r)}</Badge>)}</p>
                {p.title && <p className="font-semibold text-foreground">{p.title}</p>}
                <div className="max-h-60 overflow-auto rounded-xl bg-muted/40 p-3"><PostMarkdown text={p.body} compact /></div>
                <div className="flex flex-wrap items-center justify-between gap-2">{actions(p.type, p.id, p.author_id)}{link(p.thread_id)}</div>
              </Panel>
            )) : <EmptyState compact title={t('community.nothingHeld')} description={t('community.nothingHeldHint')} />}
          </Section>
          <Section title={t('community.openReports', { count: d.reports.length })}>
            {d.reports.length ? d.reports.map((r) => (
              <Panel key={r.id} className="space-y-3 p-5">
                <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"><Badge variant="danger">{td(`community.reason_${r.reason}`, r.reason)}</Badge><Badge variant="outline">{td(`community.target_${r.target_type}`, r.target_type)}</Badge>{r.target?.author_name}{r.note ? ` · “${r.note}”` : ''}</p>
                {r.target?.title && <p className="font-semibold text-foreground">{r.target.title}</p>}
                {r.target?.body && <div className="max-h-60 overflow-auto rounded-xl bg-muted/40 p-3"><PostMarkdown text={r.target.body} compact /></div>}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-2">
                    {actions(r.target_type, r.target_id, r.target?.author_id)}
                    <Button size="sm" variant="ghost" className="min-h-[44px] rounded-full" onClick={() => act(r.target_type, r.target_id, 'dismiss')}>{t('community.dismiss')}</Button>
                  </div>
                  {link(r.thread_id)}
                </div>
              </Panel>
            )) : <EmptyState compact title={t('community.noReports')} description={t('community.noReportsHint')} />}
          </Section>
          {gate.user?.role === 'superadmin' && <Settings />}
        </>
      )}
    </div>
  )
}
