'use client'

/** Admin → Mentors: verify, reject, suspend or reinstate mentor profiles. Disputes are decided in Admin → Marketplace → Refunds. */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { GraduationCap } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { PageHeader, Panel } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { api } from '@/components/marketplace/seller/shared'
import type { MentorProfile } from '@/lib/mentors/types'
import { useAdminT } from '@/lib/i18n/admin'

type Row = MentorProfile & { seller_status: string; kyc_status: string }
const FILTERS = [['pending', 'Waiting'], ['verified', 'Verified'], ['suspended', 'Suspended'], ['rejected', 'Rejected'], ['', 'All']] as const
const ACTIONS: Record<string, { action: string; label: string; tone?: 'outline' | 'destructive' }[]> = {
  pending: [{ action: 'verify', label: 'Verify' }, { action: 'reject', label: 'Reject', tone: 'outline' }],
  rejected: [{ action: 'verify', label: 'Verify' }],
  verified: [{ action: 'suspend', label: 'Suspend', tone: 'destructive' }],
  suspended: [{ action: 'reinstate', label: 'Reinstate' }],
}

export default function AdminMentorsPage() {
  const gate = usePageGuard('superadmin')
  const { t, fmt } = useAdminT()
  const addToast = useToast()
  const [status, setStatus] = useState('pending')
  const [rows, setRows] = useState<Row[] | null>(null)
  const [err, setErr] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const load = useCallback(() => {
    setRows(null)
    api<{ mentors: Row[] }>(`/api/admin/mentors${status ? `?status=${status}` : ''}`).then((r) => setRows(r.mentors)).catch(() => setErr(true))
  }, [status])
  useEffect(() => { if (gate.ready) load() }, [gate.ready, load])

  const decide = async (r: Row, action: string) => {
    const note = action === 'verify' || action === 'reinstate' ? '' : window.prompt(t('mentors.notePrompt')) ?? null
    if (note === null) return
    setBusy(r.id)
    try { await api(`/api/admin/mentors/${r.id}`, { body: { action, note } }); addToast({ type: 'success', title: t('mentors.updated') }); load() } catch (x) { addToast({ type: 'error', title: (x as Error).message }) } finally { setBusy(null) }
  }

  if (!gate.ready) return null
  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader title={t('mentors.title')} icon={<GraduationCap />} description={t('mentors.description')}
        actions={<Button asChild variant="outline" className="rounded-full"><Link href="/dashboard/admin/marketplace?tab=refunds">{t('mentors.disputesLink')}</Link></Button>} />
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label={t('common.filterByStatus')}>
        {FILTERS.map(([v, l]) => <Button key={v || 'all'} size="sm" variant={status === v ? 'default' : 'outline'} className="rounded-full" aria-pressed={status === v} onClick={() => setStatus(v)}>{v ? t(`mentors.filter.${v}` as 'mentors.filter.pending') : t('common.all')}</Button>)}
      </div>
      {err ? <EmptyState illustration="error" title={t('mentors.loadFailed')} description={t('common.reloadToRetry')} actionLabel={t('common.tryAgain')} onAction={() => { setErr(false); load() }} />
        : rows === null ? <div className="h-32 animate-pulse rounded-3xl bg-muted motion-reduce:animate-none" />
          : rows.length === 0 ? <EmptyState title={t('common.nothingHere')} description={status === 'pending' ? t('mentors.noneWaiting') : t('mentors.noneWithStatus')} />
            : (
              <div className="space-y-3">
                {rows.map((r) => (
                  <Panel key={r.id} className="space-y-3 p-4 sm:p-5">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground">{r.display_name} <span className="text-sm font-normal text-muted-foreground">· {r.status}</span></p>
                        <p className="text-sm text-muted-foreground">{r.headline}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{t('mentors.meta', { seller: r.seller_status, kyc: r.kyc_status, years: r.experience_years, date: fmt.date(r.created_at) })}</p>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        {(ACTIONS[r.status] || []).map((a) => <Button key={a.action} size="sm" variant={a.tone ?? 'default'} className="rounded-full" disabled={busy === r.id} onClick={() => decide(r, a.action)}>{t(`mentors.action.${a.action}` as 'mentors.action.verify')}</Button>)}
                      </div>
                    </div>
                    <p className="line-clamp-3 whitespace-pre-line text-sm text-foreground">{r.bio}</p>
                    <p className="text-xs text-muted-foreground">{t('mentors.skills', { skills: r.skills.join(', ') })}{r.companies.length ? t('mentors.companies', { companies: r.companies.join(', ') }) : ''}</p>
                    {r.linkedin_url && <a href={r.linkedin_url} target="_blank" rel="noopener noreferrer nofollow" className="text-xs text-primary underline-offset-2 hover:underline">{t('mentors.linkedin')}</a>}
                  </Panel>
                ))}
              </div>
            )}
    </div>
  )
}
