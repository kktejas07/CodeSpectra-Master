'use client'

import { useCallback, useEffect, useState } from 'react'
import { Wallet, Hourglass, Star, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { BentoGrid, Panel, Section, StatCard } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'
import { useToast } from '@/lib/toast-context'
import { api, Field, fmtDate, fmtDateTime, money, NativeSelect, StatusBadge, TableWrap, td, th, toMajor, toMinor, withAs } from './shared'
import { useT } from '@/lib/i18n/client'
import type { Translator } from '@/lib/i18n/catalog'

interface Balance { currency: 'INR' | 'USD'; available: number; pending: number; total: number }
interface Entry { id: string; type: string; amount: number; currency: string; available_at: string; created_at: string; note?: string; order_id?: string | null }

const TYPE_LABEL = (t: Translator): Record<string, string> => ({ sale: t('market.sale'), commission: t('market.commission'), refund: t('market.refund'), payout: t('market.payout'), adjustment: t('market.adjustment'), shipping: t('market.shipping') })

export function SellerEarnings({ asPlatform }: { asPlatform: boolean }) {
  const { t } = useT()
  const [data, setData] = useState<{ balances: Balance[]; entries: Entry[] } | null>(null)
  useEffect(() => { api(withAs('/api/marketplace/seller/ledger', asPlatform)).then(setData).catch(() => setData({ balances: [], entries: [] })) }, [asPlatform])
  if (!data) return <div className="h-32 animate-pulse rounded-3xl bg-muted/40 motion-reduce:animate-none" />
  const now = new Date().toISOString()
  return (
    <div className="space-y-6">
      {data.balances.length > 0 && (
        <BentoGrid>
          {data.balances.map((b) => <StatCard key={`a${b.currency}`} icon={<Wallet />} label={t('market.availableCurrency', { currency: b.currency })} value={money(b.available, b.currency)} />)}
          {data.balances.map((b) => <StatCard key={`p${b.currency}`} icon={<Hourglass />} label={t('market.pendingCurrency', { currency: b.currency })} value={money(b.pending, b.currency)} hint={t('market.releasedAfterTheRefundWindow')} />)}
        </BentoGrid>
      )}
      {data.entries.length === 0 ? (
        <EmptyState illustration="billing" title={t('market.noEarningsYet')} description={t('market.eachSaleCommissionRefundAndPayouta97')} />
      ) : (
        <Panel className="p-3 sm:p-4">
          <TableWrap>
            <thead><tr><th className={th}>{t('market.date')}</th><th className={th}>{t('market.type')}</th><th className={th}>{t('market.details')}</th><th className={`${th} text-right`}>{t('market.amount')}</th><th className={th}>{t('market.available')}</th></tr></thead>
            <tbody>{data.entries.map((e) => (
              <tr key={e.id}>
                <td className={`${td} whitespace-nowrap`}>{fmtDate(e.created_at)}</td>
                <td className={td}>{TYPE_LABEL(t)[e.type] ?? e.type}</td>
                <td className={`${td} text-muted-foreground`}>{e.note || '—'}</td>
                <td className={`${td} text-right tabular-nums ${e.amount < 0 ? 'text-destructive' : 'text-foreground'}`}>{e.amount > 0 ? '+' : ''}{money(e.amount, e.currency)}</td>
                <td className={`${td} whitespace-nowrap text-muted-foreground`}>{e.available_at <= now ? t('market.now') : fmtDate(e.available_at)}</td>
              </tr>
            ))}</tbody>
          </TableWrap>
        </Panel>
      )}
    </div>
  )
}

interface Payout { id: string; currency: string; amount: number; method: string; status: string; ref?: string | null; requested_at: string; paid_at?: string | null; failure_reason?: string | null; destination_masked?: string | null }

export function SellerPayouts({ asPlatform, minPayout, payoutReady }: { asPlatform: boolean; minPayout: { INR: number; USD: number }; payoutReady: boolean }) {
  const { t } = useT()
  const addToast = useToast()
  const [rows, setRows] = useState<Payout[] | null>(null)
  const [balances, setBalances] = useState<Balance[]>([])
  const [currency, setCurrency] = useState<'INR' | 'USD'>('INR')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    api<{ payouts: Payout[] }>(withAs('/api/marketplace/seller/payouts', asPlatform)).then((r) => setRows(r.payouts)).catch(() => setRows([]))
    api<{ balances: Balance[] }>(withAs('/api/marketplace/seller/ledger', asPlatform)).then((r) => {
      setBalances(r.balances)
      if (r.balances.length && !r.balances.some((b) => b.currency === currency)) setCurrency(r.balances[0].currency)
    }).catch(() => {})
  }, [asPlatform, currency])
  useEffect(load, [load])

  const bal = balances.find((b) => b.currency === currency)
  const available = bal?.available ?? 0
  const min = minPayout[currency]

  async function request(e: React.FormEvent) {
    e.preventDefault()
    const minor = amount ? toMinor(amount) : null
    if (minor !== null && Number.isNaN(minor)) return addToast({ type: 'error', title: t('market.enterAnAmountLike1500Or4d3') })
    setBusy(true)
    try {
      await api(withAs('/api/marketplace/seller/payouts', asPlatform), { body: { currency, amount: minor } })
      addToast({ type: 'success', title: t('market.payoutRequested'), message: t('market.wellNotifyYouWhenItsSent') })
      setAmount('')
      load()
    } catch (err) {
      addToast({ type: 'error', title: t('market.payoutNotRequested'), message: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  async function cancel(p: Payout) {
    try {
      await api(withAs(`/api/marketplace/seller/payouts/${p.id}`, asPlatform), { method: 'DELETE' })
      addToast({ type: 'success', title: t('market.payoutCancelled') })
      load()
    } catch (err) {
      addToast({ type: 'error', title: t('market.couldNotCancel'), message: (err as Error).message })
    }
  }

  return (
    <div className="space-y-6">
      {!asPlatform && (
        <Panel>
          <Section title={t('market.requestAPayout')} description={t('market.minimumAmountOnlySettledAvailableEarning992', { amount: money(min, currency) })}>
            {!payoutReady && <p className="rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">{t('market.yourPayoutDetailsAreAwaitingVerification663')}</p>}
            <form onSubmit={request} className="grid gap-4 sm:grid-cols-[140px_1fr_auto] sm:items-end">
              <Field label={t('market.currency')} htmlFor="pc"><NativeSelect id="pc" value={currency} onChange={(e) => setCurrency(e.target.value as 'INR' | 'USD')}><option value="INR">INR</option><option value="USD">USD</option></NativeSelect></Field>
              <Field label={t('market.amountAvailableAmount', { amount: money(available, currency) })} htmlFor="pa" hint={t('market.leaveBlankToWithdrawEverythingAvailable')}><Input id="pa" inputMode="decimal" placeholder={toMajor(available)} value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
              <Button type="submit" className="min-h-10" disabled={busy || !payoutReady || available < min}>{busy && <Loader2 className="animate-spin motion-reduce:animate-none" />}{t('market.requestPayout')}</Button>
            </form>
          </Section>
        </Panel>
      )}
      {rows === null ? <div className="h-24 animate-pulse rounded-3xl bg-muted/40 motion-reduce:animate-none" /> : rows.length === 0 ? (
        <EmptyState illustration="billing" title={t('market.noPayoutsYet')} description={t('market.payoutRequestsAndTheirStatusShowca9')} compact />
      ) : (
        <Panel className="p-3 sm:p-4">
          <TableWrap>
            <thead><tr><th className={th}>{t('market.requested')}</th><th className={th}>{t('market.amount')}</th><th className={th}>{t('market.to')}</th><th className={th}>{t('market.status')}</th><th className={th}>{t('market.reference')}</th><th className={th}><span className="sr-only">{t('market.actions')}</span></th></tr></thead>
            <tbody>{rows.map((p) => (
              <tr key={p.id}>
                <td className={td}>{fmtDateTime(p.requested_at)}</td>
                <td className={`${td} tabular-nums`}>{money(p.amount, p.currency)}</td>
                <td className={`${td} text-muted-foreground`}>{p.destination_masked || p.method}</td>
                <td className={td}><StatusBadge status={p.status} />{p.failure_reason && <div className="text-xs text-destructive">{p.failure_reason}</div>}</td>
                <td className={`${td} font-mono text-xs`}>{p.ref || '—'}{p.paid_at && <div className="font-sans text-muted-foreground">{fmtDate(p.paid_at)}</div>}</td>
                <td className={`${td} text-right`}>{p.status === 'requested' && <Button size="sm" variant="ghost" onClick={() => cancel(p)}>{t('common.cancel')}</Button>}</td>
              </tr>
            ))}</tbody>
          </TableWrap>
        </Panel>
      )}
    </div>
  )
}

interface Review { id: string; product_title: string; rating: number; title?: string; body?: string; created_at: string }

export function SellerReviews({ asPlatform }: { asPlatform: boolean }) {
  const { t } = useT()
  const [rows, setRows] = useState<Review[] | null>(null)
  useEffect(() => { api<{ reviews: Review[] }>(withAs('/api/marketplace/seller/reviews', asPlatform)).then((r) => setRows(r.reviews)).catch(() => setRows([])) }, [asPlatform])
  if (rows === null) return <div className="h-24 animate-pulse rounded-3xl bg-muted/40 motion-reduce:animate-none" />
  if (!rows.length) return <EmptyState illustration="leaderboard" title={t('market.noReviewsYet')} description={t('market.buyersCanReviewAProductAfterdbe')} />
  const avg = rows.reduce((a, r) => a + r.rating, 0) / rows.length
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground"><span className="font-semibold tabular-nums text-foreground">{avg.toFixed(1)}</span>{' '}{t('market.averageFromCountReviews', { count: rows.length })}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {rows.map((r) => (
          <Panel key={r.id} className="space-y-2 p-5">
            <div className="flex items-center gap-1" aria-label={t('market.ratingOutOf5Stars', { rating: r.rating })}>
              {Array.from({ length: 5 }, (_, i) => <Star key={i} className={`h-4 w-4 ${i < r.rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40'}`} aria-hidden />)}
            </div>
            <p className="text-xs text-muted-foreground">{r.product_title} · {fmtDate(r.created_at)}</p>
            {r.title && <p className="font-medium">{r.title}</p>}
            {r.body && <p className="text-sm text-muted-foreground">{r.body}</p>}
          </Panel>
        ))}
      </div>
    </div>
  )
}
