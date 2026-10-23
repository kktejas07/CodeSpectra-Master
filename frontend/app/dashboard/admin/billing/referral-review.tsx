'use client'

/**
 * CORE-037: referral rewards held because the only link between the two
 * accounts is a shared IP (campus / hostel Wi-Fi). The admin grants or voids
 * each one; refund / lapse / yearly cap are re-checked on grant.
 */
import { useCallback, useEffect, useState } from 'react'
import { Gift, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Panel } from '@/components/app/page-kit'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useToast } from '@/lib/toast-context'
import { useAdminT } from '@/lib/i18n/admin'
import { useApiError } from '@/lib/i18n/use-api-error'

interface Row { id: string; referrer: string; referee: string; due_at: string; created_at: string }

export function ReferralReview() {
  const { t, td, fmt } = useAdminT()
  const apiError = useApiError()
  const addToast = useToast()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(() => {
    setFailed(false)
    fetch('/api/admin/billing/referrals', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => setRows(Array.isArray(j.items) ? j.items : []))
      .catch(() => { setRows([]); setFailed(true) })
  }, [])
  useEffect(() => { load() }, [load])

  const decide = async (id: string, decision: 'grant' | 'void') => {
    setBusy(`${id}:${decision}`)
    try {
      const res = await csrfFetch('/api/admin/billing/referrals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ id, decision }) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(apiError(j, t('billingOps.referralReviewFailed')))
      addToast({ type: 'success', title: td(`billingOps.referralResult_${String(j.result)}`, t('billingOps.referralReviewDone')) })
      load()
    } catch (e) {
      addToast({ type: 'error', title: t('billingOps.referralReviewFailed'), message: e instanceof Error ? e.message : '' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <Panel className="space-y-4 p-6">
      <div className="flex items-start gap-3">
        <Gift className="mt-1 h-5 w-5 text-primary" aria-hidden />
        <div>
          <h2 className="text-lg font-semibold text-foreground">{t('billingOps.referralReviewTitle')}</h2>
          <p className="text-sm text-muted-foreground">{t('billingOps.referralReviewBody')}</p>
        </div>
      </div>
      {rows === null ? (
        <p role="status" className="text-sm text-muted-foreground">{t('billingOps.referralReviewLoading')}</p>
      ) : failed ? (
        <p role="alert" className="text-sm text-destructive">{t('billingOps.referralReviewLoadFailed')}</p>
      ) : rows.length === 0 ? (
        <EmptyState title={t('billingOps.referralReviewEmpty')} description={t('billingOps.referralReviewEmptyBody')} />
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 text-sm">
                <p className="truncate text-foreground">{t('billingOps.referralReviewPair', { referrer: r.referrer, referee: r.referee })}</p>
                <p className="text-xs text-muted-foreground">{t('billingOps.referralReviewDue', { date: fmt.date(r.due_at) })}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button size="sm" onClick={() => void decide(r.id, 'grant')} disabled={!!busy} className="min-h-[44px] gap-2 sm:min-h-0">
                  {busy === `${r.id}:grant` ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
                  {t('billingOps.referralGrant')}
                </Button>
                <Button size="sm" variant="outline" onClick={() => void decide(r.id, 'void')} disabled={!!busy} className="min-h-[44px] gap-2 sm:min-h-0">
                  {busy === `${r.id}:void` ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
                  {t('billingOps.referralVoid')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
