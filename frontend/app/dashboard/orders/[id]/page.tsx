'use client'

import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft, CalendarPlus, Download, ExternalLink, FileText, Loader2, Package, Star, Truck, Video } from 'lucide-react'
import { PageHeader, Panel, Section } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { usePageGuard } from '@/lib/use-page-guard'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useToast } from '@/lib/toast-context'
import { useConfirm } from '@/lib/confirm-context'
import { formatMinor } from '@/lib/marketplace/pricing'
import type { BuyerLineView, BuyerOrderView } from '@/lib/marketplace/orders'
import { STATUS_TEXT, STATUS_TONE } from '@/components/marketplace/order-status'
import { useT } from '@/lib/i18n/client'

const LINE_STATUS: Record<string, string> = {
  unfulfilled: 'Waiting for the seller', processing: 'Being prepared', shipped: 'Shipped', delivered: 'Delivered',
  delivered_digital: 'Ready to download', booked: 'Booked', completed: 'Completed', cancelled: 'Cancelled', returned: 'Returned',
}

function when(iso: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
}

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { t } = useT()
  const { id } = use(params)
  const gate = usePageGuard('/dashboard/orders/[id]')
  const sp = useSearchParams()
  const addToast = useToast()
  const confirm = useConfirm()
  const [order, setOrder] = useState<BuyerOrderView | null>(null)
  const [missing, setMissing] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [refundFor, setRefundFor] = useState<BuyerLineView | null>(null)
  const [reason, setReason] = useState('')

  const load = useCallback(async () => {
    const res = await fetch(`/api/marketplace/orders/${encodeURIComponent(id)}`, { cache: 'no-store' }).catch(() => null)
    if (res?.status === 404) { setMissing(true); return null }
    const j = res?.ok ? await res.json().catch(() => null) : null
    if (j?.order) { setOrder(j.order); setLoadFailed(false) } else setLoadFailed(true)
    return j?.order as BuyerOrderView | null
  }, [id])

  // Just back from the payment page: the webhook may land a few seconds later — poll briefly.
  useEffect(() => {
    if (!gate.ready) return
    let stop = false
    let tries = 0
    const tick = async () => {
      const o = await load()
      tries++
      if (!stop && o?.status === 'pending_payment' && (sp.get('paid') || sp.get('payment')) && tries < 10) setTimeout(tick, 3000)
    }
    void tick()
    return () => { stop = true }
  }, [gate.ready, load, sp])

  const post = async (path: string, body: unknown, tag: string) => {
    setBusy(tag)
    try {
      const res = await csrfFetch(`/api/marketplace/orders/${encodeURIComponent(id)}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { addToast({ type: 'error', title: j.error || t('market.somethingWentWrong') }); return null }
      return j
    } finally {
      setBusy(null)
    }
  }

  const download = async (line: BuyerLineView, fileId: string) => {
    const j = await post('download', { line_id: line.id, file_id: fileId }, `dl-${fileId}`)
    if (j?.url) { window.location.assign(j.url); setTimeout(load, 2500) }
  }

  const cancel = async (line?: BuyerLineView) => {
    const pending = order?.status === 'pending_payment'
    const ok = await confirm({
      title: pending ? t('market.cancelThisOrder') : t('market.cancelValue', { value: line?.title ?? 'this item' }),
      description: pending ? t('market.nothingHasBeenChargedTheItems14f') : t('market.youWillGetValueBackTod6f', { value: formatMinor(line?.paid ?? 0, order!.currency) }),
      confirmText: t('market.cancelIt'), cancelText: 'Keep it', destructive: true,
    })
    if (!ok) return
    const j = await post('cancel', line ? { line_ids: [line.id] } : {}, `cancel-${line?.id ?? 'all'}`)
    if (j) { addToast({ type: 'success', title: j.result === 'refunded' ? t('market.cancelledYourRefundIsOnIts718') : t('market.orderCancelled') }); void load() }
  }

  const submitRefund = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!refundFor) return
    const j = await post('refund', { line_ids: [refundFor.id], reason }, `refund-${refundFor.id}`)
    if (j) {
      addToast({ type: 'success', title: j.refunded?.length ? t('market.refundedItReachesYourAccountIn848') : t('market.returnRequestSentWeWillEff3') })
      setRefundFor(null); setReason(''); void load()
    }
  }

  if (!gate.ready) return null
  if (missing) return <EmptyState illustration="search" title={t('market.orderNotFound')} description={t('market.itMayBelongToAnotherAccount')} actionLabel={t('market.myOrders')} actionHref="/dashboard/orders" />
  if (!order && loadFailed) return <EmptyState illustration="error" title={t('market.weCouldNotLoadThisOrder')} description={t('market.checkYourConnectionAndTryAgain')} actionLabel={t('common.tryAgain')} onAction={() => { setLoadFailed(false); void load() }} />
  if (!order) return <div className="mx-auto h-64 max-w-5xl animate-pulse rounded-3xl bg-muted motion-reduce:animate-none" aria-label={t('market.loadingOrder')} />

  const c = order.currency
  const taxLabel = c === 'INR' ? 'GST' : 'Sales tax'
  const paid = !['pending_payment', 'cancelled'].includes(order.status)
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <Link href="/dashboard/orders" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />{t('market.myOrders')}</Link>
      <PageHeader
        title={<>{t('market.order')}{' '}<span className="font-mono">{order.number}</span></>}
        description={t('market.placedValue', { value: when(order.created_at) })}
        icon={<Package />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-sm font-medium ${STATUS_TONE[order.status] ?? 'bg-muted'}`}>{STATUS_TEXT[order.status] ?? order.status}</span>
            {paid && <Button asChild variant="outline" className="rounded-full"><a href={`/api/marketplace/orders/${order.id}/invoice`} target="_blank" rel="noopener"><FileText className="mr-1.5 h-4 w-4" />{t('market.invoice')}</a></Button>}
          </div>
        }
      />

      {order.status === 'pending_payment' && (
        <Panel className="flex flex-wrap items-center justify-between gap-3 border-amber-500/30 bg-amber-500/5 p-4">
          <p className="text-sm text-foreground">{sp.get('paid') || sp.get('payment') ? <><Loader2 className="mr-2 inline h-4 w-4 animate-spin motion-reduce:animate-none" />{t('market.confirmingYourPayment')}</> : <>{t('market.weAreWaitingForYourPaymentd47')}{' '}{order.reservation_expires_at ? when(order.reservation_expires_at) : t('market.shortly')}.</>}</p>
          <Button variant="outline" className="rounded-full" disabled={!!busy} onClick={() => cancel()}>{t('market.cancelOrder')}</Button>
        </Panel>
      )}

      <Section title={t('market.items')}>
        <div className="space-y-3">
          {order.lines.map((l) => (
            <Panel key={l.id} className="space-y-3 p-4 sm:p-5">
              <div className="flex gap-4">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {l.image ? <img src={l.image} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-muted-foreground"><Package className="h-5 w-5" /></div>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      {l.slug ? <Link href={`/marketplace/p/${l.slug}`} className="font-semibold text-foreground hover:text-primary">{l.title}</Link> : <p className="font-semibold text-foreground">{l.title}</p>}
                      <p className="text-sm text-muted-foreground">{l.qty} × {formatMinor(l.unit_price, c)}{l.variant_name ? ` · ${l.variant_name}` : ''}</p>
                    </div>
                    <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground">{LINE_STATUS[l.status] ?? l.status}</span>
                  </div>
                  {l.refunded_amount > 0 && <p className="mt-1 text-xs text-muted-foreground">{t('market.refundedValue', { value: formatMinor(l.refunded_amount, c) })}</p>}
                </div>
              </div>

              {l.tracking && (
                <div className="flex flex-wrap items-center gap-2 rounded-xl bg-muted/50 p-3 text-sm">
                  <Truck className="h-4 w-4 text-primary" aria-hidden />
                  <span>{l.tracking.carrier}{l.tracking.tracking_no ? <> · <span className="font-mono">{l.tracking.tracking_no}</span></> : null}</span>
                  {l.tracking.tracking_url && <a href={l.tracking.tracking_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">{t('market.trackParcel')}<ExternalLink className="h-3.5 w-3.5" /></a>}
                </div>
              )}

              {l.booking && (
                <div className="flex flex-wrap items-center gap-2 rounded-xl bg-muted/50 p-3 text-sm">
                  <Video className="h-4 w-4 text-primary" aria-hidden />
                  <span>{when(l.booking.start)} – {new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(new Date(l.booking.end))}</span>
                  {l.status === 'booked' && (l.booking.join_url
                    ? <a href={l.booking.join_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">{t('market.joinLink')}<ExternalLink className="h-3.5 w-3.5" /></a>
                    : <span className="text-muted-foreground">{t('market.theHostWillAddTheMeetingc68')}</span>)}
                  {l.status === 'booked' && <a href={`/api/marketplace/orders/${order.id}/ics?line=${l.id}`} className="inline-flex items-center gap-1 font-medium text-primary hover:underline"><CalendarPlus className="h-3.5 w-3.5" />{t('market.addToCalendar')}</a>}
                </div>
              )}

              {l.files.length > 0 && (
                <div className="space-y-2">
                  {l.files.map((f) => (
                    <div key={f.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3">
                      <span className="min-w-0 truncate text-sm text-foreground">{f.name} <span className="text-xs text-muted-foreground">{t('market.nMb', { n: (f.size / 1_048_576).toFixed(1) })}</span></span>
                      <Button size="sm" className="rounded-full" disabled={busy === `dl-${f.id}` || l.downloads_left === 0} onClick={() => download(l, f.id)}>
                        {busy === `dl-${f.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /> : <Download className="h-3.5 w-3.5" />}{t('market.download')}</Button>
                    </div>
                  ))}
                  {l.downloads_left != null && <p className="text-xs text-muted-foreground"><span className="tabular-nums">{l.downloads_left}</span>{' '}{t('market.downloadsLeftLinksWorkFor535a', { count: l.downloads_left })}</p>}
                </div>
              )}

              {paid && (
                <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                  {l.can_cancel && <Button size="sm" variant="outline" className="rounded-full" disabled={!!busy} onClick={() => cancel(l)}>{t('market.cancelItem')}</Button>}
                  {!l.can_cancel && l.refund.ok && <Button size="sm" variant="outline" className="rounded-full" disabled={!!busy} onClick={() => setRefundFor(l)}>{l.refund.mode === 'review' ? t('market.returnItem') : t('market.requestRefund')}</Button>}
                  {l.can_review && l.slug && <Button size="sm" variant="ghost" className="rounded-full" asChild><Link href={`/marketplace/p/${l.slug}#reviews`}><Star className="mr-1 h-3.5 w-3.5" />{t('market.writeAReview')}</Link></Button>}
                  {!l.can_cancel && !l.refund.ok && l.status !== 'cancelled' && l.status !== 'returned' && <p className="self-center text-xs text-muted-foreground">{l.refund.reason}</p>}
                </div>
              )}

              {refundFor?.id === l.id && (
                <form onSubmit={submitRefund} className="space-y-2 rounded-xl border border-border p-3">
                  <label htmlFor={`reason-${l.id}`} className="text-sm font-medium text-foreground">{l.refund.ok && l.refund.mode === 'review' ? t('market.whyAreYouReturningIt') : t('market.whyDoYouWantARefund')}</label>
                  <textarea id={`reason-${l.id}`} required minLength={5} maxLength={1000} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} className="w-full rounded-lg border border-border bg-background p-2 text-sm text-foreground" />
                  <div className="flex gap-2">
                    <Button type="submit" size="sm" className="rounded-full" disabled={!!busy}>{t('market.send')}</Button>
                    <Button type="button" size="sm" variant="ghost" className="rounded-full" onClick={() => setRefundFor(null)}>{t('common.close')}</Button>
                  </div>
                </form>
              )}
            </Panel>
          ))}
        </div>
      </Section>

      <div className="grid gap-4 md:grid-cols-2">
        <Panel className="space-y-2 p-5 text-sm">
          <h2 className="font-semibold text-foreground">{t('market.payment')}</h2>
          <dl className="space-y-1.5">
            <Row k="Subtotal" v={formatMinor(order.subtotal, c)} />
            {order.discount_total > 0 && <Row k={`Discount${order.coupon ? ` (${order.coupon})` : ''}`} v={`−${formatMinor(order.discount_total, c)}`} />}
            {order.shipping_total > 0 && <Row k="Shipping" v={formatMinor(order.shipping_total, c)} />}
            {order.tax_bps > 0 && <Row k={order.prices_include_tax ? `Includes ${taxLabel} (${order.tax_bps / 100}%)` : `${taxLabel} (${order.tax_bps / 100}%)`} v={formatMinor(order.tax_total, c)} />}
            <div className="flex justify-between border-t border-border pt-2 font-semibold"><dt>{t('market.total')}</dt><dd className="tabular-nums">{formatMinor(order.grand_total, c)}</dd></div>
            {order.payment.refunded_total > 0 && <Row k="Refunded" v={`−${formatMinor(order.payment.refunded_total, c)}`} />}
          </dl>
          <p className="text-xs text-muted-foreground">{t('market.paidWithValue', { value: order.payment.gateway === 'phonepe' ? t('market.phonepe') : t('market.cardStripe') })}{order.payment.paid_at ? t('market.onValue', { value: when(order.payment.paid_at) }) : ''}.</p>
        </Panel>
        {(order.shipping_address || order.refunds.length > 0) && (
          <Panel className="space-y-3 p-5 text-sm">
            {order.shipping_address && (
              <div>
                <h2 className="font-semibold text-foreground">{t('market.deliveryAddress')}</h2>
                <p className="mt-1 text-muted-foreground">{[order.shipping_address.name, order.shipping_address.line1, order.shipping_address.line2, `${order.shipping_address.city}, ${order.shipping_address.state} ${order.shipping_address.postal_code}`, order.shipping_address.country].filter(Boolean).join(', ')}</p>
              </div>
            )}
            {order.refunds.length > 0 && (
              <div>
                <h2 className="font-semibold text-foreground">{t('market.refundsAndReturns')}</h2>
                <ul className="mt-1 space-y-1 text-muted-foreground">
                  {order.refunds.map((r) => <li key={r.id}>{formatMinor(r.amount, c)} · {r.type} · <span className="font-medium text-foreground">{r.status}</span>{r.note ? ` — ${r.note}` : ''}</li>)}
                </ul>
              </div>
            )}
          </Panel>
        )}
      </div>
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-3"><dt className="text-muted-foreground">{k}</dt><dd className="tabular-nums text-foreground">{v}</dd></div>
}
