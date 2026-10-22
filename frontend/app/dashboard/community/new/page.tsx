'use client'

/** Start a thread: category, question / discussion / solution write-up (for a problem you solved), language, markdown with preview. */
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { PenSquare } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useT } from '@/lib/i18n/client'
import { PageHeader, Panel } from '@/components/app/page-kit'
import { Button } from '@/components/ui/button'
import { PostMarkdown } from '@/components/community/post-markdown'
import { call, ErrorNote, Field, areaClass, fieldClass, useErrorText } from '@/components/community/client-api'
import type { CategoryDoc } from '@/lib/community/db'

export default function NewThreadPage() {
  const gate = usePageGuard('user')
  const { t, td, locale } = useT()
  const router = useRouter()
  const sp = useSearchParams()
  const errText = useErrorText()
  const preset = sp.get('category') || ''
  const [cats, setCats] = useState<CategoryDoc[]>([])
  const [f, setF] = useState({ category_id: preset || 'general', kind: sp.get('problem') ? 'solution' : 'question', title: '', body: '', lang: locale as string, problem: sp.get('problem') || '', tags: '' })
  const [preview, setPreview] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => { call<{ categories: CategoryDoc[] }>('/api/community/categories').then((r) => setCats(r.categories)).catch(() => setCats([])) }, [])
  if (!gate.ready) return null
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    try {
      const body = { category_id: f.category_id, kind: f.kind, title: f.title, body: f.body, lang: f.lang, tags: f.tags.split(',').map((x) => x.trim()).filter(Boolean), ...(f.kind === 'solution' ? { problem: f.problem.trim() } : {}) }
      const r = await call<{ id: string; status: string }>('/api/community/threads', { body })
      router.push(`/dashboard/community/t/${r.id}${r.status === 'pending' ? '?pending=1' : ''}`)
    } catch (e2) { setErr(errText(e2)) } finally { setBusy(false) }
  }
  const presetIsPrivate = preset && !cats.some((c) => c.id === preset)
  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader title={t('community.newThread')} description={t('community.newThreadLead')} icon={<PenSquare />} />
      <Panel className="p-5 sm:p-6">
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <Field id="t-cat" label={t('community.category')}>
            <select id="t-cat" className={fieldClass} value={f.category_id} onChange={(e) => setF({ ...f, category_id: e.target.value })}>
              {presetIsPrivate && <option value={preset}>{t('community.cohortDiscussion')}</option>}
              {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field id="t-kind" label={t('community.postType')}>
            <select id="t-kind" className={fieldClass} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
              {(['question', 'discussion', 'solution'] as const).map((k) => <option key={k} value={k}>{td(`community.threadKind_${k}`, k)}</option>)}
            </select>
          </Field>
          {f.kind === 'solution' && <Field id="t-prob" label={t('community.problemRef')} hint={t('community.problemRefHint')} className="sm:col-span-2"><input id="t-prob" className={fieldClass} value={f.problem} onChange={(e) => setF({ ...f, problem: e.target.value })} required /></Field>}
          <Field id="t-title" label={t('community.fieldTitle')} className="sm:col-span-2"><input id="t-title" className={fieldClass} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required minLength={8} maxLength={160} /></Field>
          <div className="space-y-1.5 sm:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="t-body" className="text-sm font-medium text-foreground">{t('community.body')}</label>
              <Button type="button" variant="ghost" size="sm" className="min-h-[44px]" aria-pressed={preview} onClick={() => setPreview(!preview)}>{preview ? t('community.write') : t('community.preview')}</Button>
            </div>
            {preview ? <div className="min-h-[200px] rounded-xl border border-border p-3"><PostMarkdown text={f.body || t('community.nothingYet')} lang={f.lang} /></div> : <textarea id="t-body" className={`${areaClass} min-h-[240px]`} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} required minLength={10} maxLength={20000} />}
            <p className="text-xs text-muted-foreground">{t('community.markdownHint')}</p>
          </div>
          <Field id="t-lang" label={t('community.writingIn')} hint={t('community.writingInHint')}>
            <select id="t-lang" className={fieldClass} value={f.lang} onChange={(e) => setF({ ...f, lang: e.target.value })}>{(['en', 'hi', 'te', 'other'] as const).map((l) => <option key={l} value={l}>{td(`community.lang_${l}`, l)}</option>)}</select>
          </Field>
          <Field id="t-tags" label={t('community.tags')} hint={t('community.commaSeparated')}><input id="t-tags" className={fieldClass} value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} /></Field>
          <p className="text-xs text-muted-foreground sm:col-span-2">{t('community.guidelinesNote')}</p>
          <div className="sm:col-span-2"><ErrorNote text={err} /></div>
          <div className="sm:col-span-2"><Button type="submit" disabled={busy} className="min-h-[44px] rounded-full">{busy ? t('community.posting') : t('community.post')}</Button></div>
        </form>
      </Panel>
    </div>
  )
}
