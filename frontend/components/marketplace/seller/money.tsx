'use client'

import { useCallback, useEffect, useState } from 'react'
import { Wallet, Hourglass, Star, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { BentoGrid, Panel, Section, StatCard } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'
import { useToast } from '@/lib/toast-context'
import { api, Field, fmtDate, fmtDateTime, money, NativeSelect, StatusBadge, TableWrap, td, th, toMajor, toMinor, withAs } from './shared'

interface Balance { currency: 'INR' | 'USD'; available: number; pending: number; total: number }
interface Entry { id: string; type: string; amount: number; currency: string; available_at: string; created_at: string; note?: string; order_id?: string | null }

const TYPE_LABEL: Record<string, string> = { sale: 'Sale', commission: 'Commission', refund: 'Refund', payout: 'Payout', adjustment: 'Adjustment', shipping: 'Shipping' }

export function SellerEarnings({ asPlatform }: { asPlatform: boolean }) {
  const [data, setData] = useState<{ balances: Balance[]; entries: Entry[] } | null>(null)
  useEffect(() => { api(withAs('/api/marketplace/seller/ledger', asPlatform)).then(setData).catch(() => setData({ balances: [], entries: [] })) }, [asPlatform])
  if (!data) return <div className="h-32 animate-pulse rounded-3xl bg-muted/40 motion-reduce:animate-none" />
  const now = new Date().toISOString()
  return (
    <div className="space-y-6">
      {data.balances.length > 0 && (
        <BentoGrid>
          {data.balances.map((b) => <StatCard key={`a${b.currency}`} icon={<Wallet />} label={`Available (${b.currency})`} value={money(b.available, b.currency)} />)}
          {data.balances.map((b) => <StatCard key={`p${b.currency}`} icon={<Hourglass />} label={`Pending (${b.currency})`} value={money(b.pending, b.currency)} hint="Released after the refund window" />)}
        </BentoGrid>
      )}
      {data.entries.length === 0 ? (
        <EmptyState illustration="billing" title="No earnings yet" description="Each sale, commission, refund and payout is listed here." />
      ) : (
        <Panel className="p-3 sm:p-4">
          <TableWrap>
            <thead><tr><th className={th}>Date</th><th className={th}>Type</th><th className={th}>Details</th><th className={`${th} text-right`}>Amount</th><th className={th}>Available</th></tr></thead>
            <tbody>{data.entries.map((e) => (
              <tr key={e.id}>
                <td className={`${td} whitespace-nowrap`}>{fmtDate(e.created_at)}</td>
                <td className={td}>{TYPE_LABEL[e.type] ?? e.type}</td>
                <td className={`${td} text-muted-foreground`}>{e.note || '—'}</td>
                <td className={`${td} text-right tabular-nums ${e.amount < 0 ? 'text-destructive' : 'text-foreground'}`}>{e.amount > 0 ? '+' : ''}{money(e.amount, e.currency)}</td>
                <td className={`${td} whitespace-nowrap text-muted-foreground`}>{e.available_at <= now ? 'Now' : fmtDate(e.available_at)}</td>
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
    if (minor !== null && Number.isNaN(minor)) return addToast({ type: 'error', title: 'Enter an amount like 1500 or 1500.50' })
    setBusy(true)
    try {
      await api(withAs('/api/marketplace/seller/payouts', asPlatform), { body: { currency, amount: minor } })
      addToast({ type: 'success', title: 'Payout requested', message: 'We’ll notify you when it’s sent.' })
      setAmount('')
      load()
    } catch (err) {
      addToast({ type: 'error', title: 'Payout not requested', message: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  async function cancel(p: Payout) {
    try {
      await api(withAs(`/api/marketplace/seller/payouts/${p.id}`, asPlatform), { method: 'DELETE' })
      addToast({ type: 'success', title: 'Payout cancelled' })
      load()
    } catch (err) {
      addToast({ type: 'error', title: 'Could not cancel', message: (err as Error).message })
    }
  }

  return (
    <div className="space-y-6">
      {!asPlatform && (
        <Panel>
          <Section title="Request a payout" description={`Minimum ${money(min, currency)}. Only settled (available) earnings can be paid out.`}>
            {!payoutReady && <p className="rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">Your payout details are awaiting verification (or Stripe isn&apos;t connected yet). Check Settings.</p>}
            <form onSubmit={request} className="grid gap-4 sm:grid-cols-[140px_1fr_auto] sm:items-end">
              <Field label="Currency" htmlFor="pc"><NativeSelect id="pc" value={currency} onChange={(e) => setCurrency(e.target.value as 'INR' | 'USD')}><option value="INR">INR</option><option value="USD">USD</option></NativeSelect></Field>
              <Field label={`Amount (available ${money(available, currency)})`} htmlFor="pa" hint="Leave blank to withdraw everything available."><Input id="pa" inputMode="decimal" placeholder={toMajor(available)} value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
              <Button type="submit" className="min-h-10" disabled={busy || !payoutReady || available < min}>{busy && <Loader2 className="animate-spin motion-reduce:animate-none" />}Request payout</Button>
            </form>
          </Section>
        </Panel>
      )}
      {rows === null ? <div className="h-24 animate-pulse rounded-3xl bg-muted/40 motion-reduce:animate-none" /> : rows.length === 0 ? (
        <EmptyState illustration="billing" title="No payouts yet" description="Payout requests and their status show up here." compact />
      ) : (
        <Panel className="p-3 sm:p-4">
          <TableWrap>
            <thead><tr><th className={th}>Requested</th><th className={th}>Amount</th><th className={th}>To</th><th className={th}>Status</th><th className={th}>Reference</th><th className={th}><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{rows.map((p) => (
              <tr key={p.id}>
                <td className={td}>{fmtDateTime(p.requested_at)}</td>
                <td className={`${td} tabular-nums`}>{money(p.amount, p.currency)}</td>
                <td className={`${td} text-muted-foreground`}>{p.destination_masked || p.method}</td>
                <td className={td}><StatusBadge status={p.status} />{p.failure_reason && <div className="text-xs text-destructive">{p.failure_reason}</div>}</td>
                <td className={`${td} font-mono text-xs`}>{p.ref || '—'}{p.paid_at && <div className="font-sans text-muted-foreground">{fmtDate(p.paid_at)}</div>}</td>
                <td className={`${td} text-right`}>{p.status === 'requested' && <Button size="sm" variant="ghost" onClick={() => cancel(p)}>Cancel</Button>}</td>
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
  const [rows, setRows] = useState<Review[] | null>(null)
  useEffect(() => { api<{ reviews: Review[] }>(withAs('/api/marketplace/seller/reviews', asPlatform)).then((r) => setRows(r.reviews)).catch(() => setRows([])) }, [asPlatform])
  if (rows === null) return <div className="h-24 animate-pulse rounded-3xl bg-muted/40 motion-reduce:animate-none" />
  if (!rows.length) return <EmptyState illustration="leaderboard" title="No reviews yet" description="Buyers can review a product after it's delivered or the session is done." />
  const avg = rows.reduce((a, r) => a + r.rating, 0) / rows.length
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground"><span className="font-semibold tabular-nums text-foreground">{avg.toFixed(1)}</span> average from {rows.length} review{rows.length === 1 ? '' : 's'}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {rows.map((r) => (
          <Panel key={r.id} className="space-y-2 p-5">
            <div className="flex items-center gap-1" aria-label={`${r.rating} out of 5 stars`}>
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
