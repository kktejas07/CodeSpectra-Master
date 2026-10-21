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
    const note = action === 'verify' || action === 'reinstate' ? '' : window.prompt('Note for the mentor (optional)') ?? null
    if (note === null) return
    setBusy(r.id)
    try { await api(`/api/admin/mentors/${r.id}`, { body: { action, note } }); addToast({ type: 'success', title: 'Mentor updated' }); load() } catch (x) { addToast({ type: 'error', title: (x as Error).message }) } finally { setBusy(null) }
  }

  if (!gate.ready) return null
  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader title="Mentors" icon={<GraduationCap />} description="Check new mentors before learners can book them. Session prices, refunds, disputes and payouts run through the marketplace."
        actions={<Button asChild variant="outline" className="rounded-full"><Link href="/dashboard/admin/marketplace?tab=refunds">Disputes and refunds</Link></Button>} />
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        {FILTERS.map(([v, l]) => <Button key={v || 'all'} size="sm" variant={status === v ? 'default' : 'outline'} className="rounded-full" aria-pressed={status === v} onClick={() => setStatus(v)}>{l}</Button>)}
      </div>
      {err ? <EmptyState illustration="error" title="We could not load mentors" description="Reload the page to try again." actionLabel="Try again" onAction={() => { setErr(false); load() }} />
        : rows === null ? <div className="h-32 animate-pulse rounded-3xl bg-muted motion-reduce:animate-none" />
          : rows.length === 0 ? <EmptyState title="Nothing here" description={status === 'pending' ? 'No mentor profiles are waiting for verification.' : 'No mentors with this status.'} />
            : (
              <div className="space-y-3">
                {rows.map((r) => (
                  <Panel key={r.id} className="space-y-3 p-4 sm:p-5">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground">{r.display_name} <span className="text-sm font-normal text-muted-foreground">· {r.status}</span></p>
                        <p className="text-sm text-muted-foreground">{r.headline}</p>
                        <p className="mt-1 text-xs text-muted-foreground">Seller account: {r.seller_status} · KYC: {r.kyc_status} · <span className="tabular-nums">{r.experience_years}</span> years · Applied {new Date(r.created_at).toLocaleDateString()}</p>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        {(ACTIONS[r.status] || []).map((a) => <Button key={a.action} size="sm" variant={a.tone ?? 'default'} className="rounded-full" disabled={busy === r.id} onClick={() => decide(r, a.action)}>{a.label}</Button>)}
                      </div>
                    </div>
                    <p className="line-clamp-3 whitespace-pre-line text-sm text-foreground">{r.bio}</p>
                    <p className="text-xs text-muted-foreground">Skills: {r.skills.join(', ')}{r.companies.length ? ` · Companies: ${r.companies.join(', ')}` : ''}</p>
                    {r.linkedin_url && <a href={r.linkedin_url} target="_blank" rel="noopener noreferrer nofollow" className="text-xs text-primary underline-offset-2 hover:underline">LinkedIn profile</a>}
                  </Panel>
                ))}
              </div>
            )}
    </div>
  )
}
