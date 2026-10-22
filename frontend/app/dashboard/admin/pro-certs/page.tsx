'use client'

/**
 * Admin → Proctored certifications (superadmin): author certifications
 * (blueprint, proctoring threshold, attempt policy, price), check question-bank
 * coverage, publish / retire, and the reviewer queue that clears or rejects
 * proctored passes before a credential is issued.
 */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ShieldCheck } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { PageHeader, Panel } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useAdminT } from '@/lib/i18n/admin'
import type { ProgramDoc } from '@/lib/pro-certs/types'
import type { ReviewRow } from '@/lib/pro-certs/service'
import { ProgramEditor } from './editor'

async function api<T>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = init?.method
    ? await csrfFetch(url, { method: init.method, headers: { 'Content-Type': 'application/json' }, body: init.body === undefined ? undefined : JSON.stringify(init.body) })
    : await fetch(url, { credentials: 'include', cache: 'no-store' })
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(String((body as { error?: string } | null)?.error || res.statusText))
  return body as T
}

export default function AdminProCertsPage() {
  const gate = usePageGuard('superadmin')
  const { t } = useAdminT()
  const [tab, setTab] = useState('programs')
  const [editing, setEditing] = useState<string | null>(null)
  if (!gate.ready) return null
  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader title={t('pcert.title')} description={t('pcert.description')} icon={<ShieldCheck />}
        actions={<Button asChild variant="outline" className="rounded-full"><Link href="/certifications" target="_blank">{t('pcert.publicCatalog')}</Link></Button>} />
      {editing ? (
        <ProgramEditor id={editing} api={api} onClose={() => setEditing(null)} />
      ) : (
        <Tabs value={tab} onValueChange={setTab} className="gap-5">
          <TabsList className="w-max">
            <TabsTrigger value="programs">{t('pcert.tabPrograms')}</TabsTrigger>
            <TabsTrigger value="review">{t('pcert.tabReview')}</TabsTrigger>
            <TabsTrigger value="decided">{t('pcert.tabDecided')}</TabsTrigger>
          </TabsList>
          <TabsContent value="programs"><Programs onEdit={setEditing} /></TabsContent>
          <TabsContent value="review"><ReviewQueue view="pending" /></TabsContent>
          <TabsContent value="decided"><ReviewQueue view="decided" /></TabsContent>
        </Tabs>
      )}
    </div>
  )
}

function Programs({ onEdit }: { onEdit: (id: string) => void }) {
  const { t, td, fmt } = useAdminT()
  const addToast = useToast()
  const [data, setData] = useState<{ programs: ProgramDoc[]; templates: Array<{ slug: string; title: string; summary: string }> } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const load = useCallback(() => { setErr(null); api<typeof data>('/api/admin/pro-certs').then(setData).catch((e) => setErr((e as Error).message)) }, [])
  useEffect(load, [load])
  const addTemplate = async (slug: string) => {
    setBusy(slug)
    try { const r = await api<{ program: ProgramDoc }>('/api/admin/pro-certs', { method: 'POST', body: { template: slug } }); onEdit(r.program.id) } catch (e) { addToast({ type: 'error', title: (e as Error).message }) } finally { setBusy(null) }
  }
  const setStatus = async (p: ProgramDoc, status: string) => {
    setBusy(p.id)
    try { await api(`/api/admin/pro-certs/${p.id}`, { method: 'PATCH', body: { status } }); addToast({ type: 'success', title: t('pcert.saved') }); load() } catch (e) { addToast({ type: 'error', title: (e as Error).message }) } finally { setBusy(null) }
  }
  if (err) return <EmptyState illustration="error" title={t('pcert.loadFailed')} description={err} actionLabel={t('pcert.retry')} onAction={load} />
  if (!data) return <p className="text-sm text-muted-foreground" role="status">{t('pcert.loading')}</p>
  const used = new Set(data.programs.map((p) => p.slug))
  return (
    <div className="space-y-6">
      {data.programs.length === 0 ? (
        <EmptyState illustration="certificate" title={t('pcert.none')} description={t('pcert.noneBody')} />
      ) : (
        <Panel className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">{t('pcert.colTitle')}</th>
                <th scope="col" className="px-4 py-3 font-medium">{t('pcert.colStatus')}</th>
                <th scope="col" className="px-4 py-3 font-medium">{t('pcert.colPrice')}</th>
                <th scope="col" className="px-4 py-3 font-medium">{t('pcert.colUpdated')}</th>
                <th scope="col" className="px-4 py-3"><span className="sr-only">{t('pcert.colActions')}</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.programs.map((p) => (
                <tr key={p.id}>
                  <th scope="row" className="px-4 py-3 text-left font-medium text-foreground">{p.title}<span className="block font-mono text-xs font-normal text-muted-foreground">{p.slug}</span></th>
                  <td className="px-4 py-3">{td(`pcert.status.${p.status}`, p.status)}</td>
                  <td className="px-4 py-3 tabular-nums">{[p.price.INR !== null ? `INR ${(p.price.INR / 100).toFixed(2)}` : null, p.price.USD !== null ? `USD ${(p.price.USD / 100).toFixed(2)}` : null].filter(Boolean).join(' · ') || '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{fmt.date(p.updated_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => onEdit(p.id)}>{t('pcert.edit')}</Button>
                      {p.status !== 'published' && <Button size="sm" disabled={busy === p.id} onClick={() => void setStatus(p, 'published')}>{t('pcert.publish')}</Button>}
                      {p.status === 'published' && <Button size="sm" variant="outline" disabled={busy === p.id} onClick={() => void setStatus(p, 'retired')}>{t('pcert.retire')}</Button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
      <Panel>
        <h2 className="text-base font-semibold text-foreground">{t('pcert.templates')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('pcert.templatesHint')}</p>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.templates.filter((x) => !used.has(x.slug)).map((x) => (
            <li key={x.slug} className="flex flex-col rounded-2xl border border-border/70 p-4">
              <span className="font-medium text-foreground">{x.title}</span>
              <span className="mt-1 flex-1 text-sm text-muted-foreground">{x.summary}</span>
              <Button size="sm" variant="outline" className="mt-3 w-max" disabled={busy === x.slug} onClick={() => void addTemplate(x.slug)}>{t('pcert.addDraft')}</Button>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  )
}

function ReviewQueue({ view }: { view: 'pending' | 'decided' }) {
  const { t, td, fmt } = useAdminT()
  const addToast = useToast()
  const [rows, setRows] = useState<ReviewRow[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const load = useCallback(() => { setErr(null); setRows(null); api<{ attempts: ReviewRow[] }>(`/api/admin/pro-certs/reviews?view=${view === 'pending' ? 'pending' : 'decided'}`).then((r) => setRows(r.attempts)).catch((e) => setErr((e as Error).message)) }, [view])
  useEffect(load, [load])
  const decide = async (r: ReviewRow, action: 'approve' | 'reject') => {
    setBusy(r.id)
    try { await api(`/api/admin/pro-certs/reviews/${r.id}`, { method: 'POST', body: { action, note: notes[r.id] ?? '' } }); addToast({ type: 'success', title: action === 'approve' ? t('pcert.approved') : t('pcert.rejected') }); load() } catch (e) { addToast({ type: 'error', title: (e as Error).message }) } finally { setBusy(null) }
  }
  if (err) return <EmptyState illustration="error" title={t('pcert.loadFailed')} description={err} actionLabel={t('pcert.retry')} onAction={load} />
  if (!rows) return <p className="text-sm text-muted-foreground" role="status">{t('pcert.loading')}</p>
  if (!rows.length) return <EmptyState illustration="success" title={view === 'pending' ? t('pcert.queueEmpty') : t('pcert.decidedEmpty')} description={view === 'pending' ? t('pcert.queueEmptyBody') : t('pcert.decidedEmptyBody')} />
  return (
    <ul className="space-y-4">
      {rows.map((r) => (
        <li key={r.id}>
          <Panel className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-foreground">{r.name} <span className="font-normal text-muted-foreground">· {r.email}</span></p>
                <p className="text-sm text-muted-foreground">{r.program_title} · {r.submitted_at ? fmt.dateTime(r.submitted_at) : '—'}</p>
              </div>
              <div className="flex gap-4 text-sm tabular-nums">
                <span>{t('pcert.score', { score: Math.round(r.score_pct ?? 0), pass: r.pass_percent })}</span>
                <span className={r.trust_score !== null && r.trust_score >= r.min_trust ? 'text-foreground' : 'text-amber-800 dark:text-amber-300'}>
                  {r.trust_score === null ? t('pcert.trustUnknown') : t('pcert.trust', { trust: r.trust_score, min: r.min_trust })}
                </span>
              </div>
            </div>
            {r.flags.length > 0 && <p className="text-sm text-amber-800 dark:text-amber-300">{r.flags.map((f) => td(`pcert.flag.${f}`, f)).join(' · ')}</p>}
            <Link href={`/dashboard/admin/assessments/${r.exam_id}/integrity`} className="inline-block text-sm font-medium text-primary hover:underline">{t('pcert.openProctoring')}</Link>
            {view === 'pending' ? (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-foreground" htmlFor={`note-${r.id}`}>{t('pcert.note')}</label>
                <Textarea id={`note-${r.id}`} value={notes[r.id] ?? ''} onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))} rows={2} maxLength={2000} />
                <div className="flex gap-2">
                  <Button disabled={busy === r.id} onClick={() => void decide(r, 'approve')}>{t('pcert.approve')}</Button>
                  <Button variant="destructive" disabled={busy === r.id || !(notes[r.id] ?? '').trim()} onClick={() => void decide(r, 'reject')}>{t('pcert.reject')}</Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{td(`pcert.review.${r.review.status}`, String(r.review.status))}{r.review.note ? ` — ${r.review.note}` : ''}</p>
            )}
          </Panel>
        </li>
      ))}
    </ul>
  )
}
