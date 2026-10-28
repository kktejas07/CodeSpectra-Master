'use client'

import { formatDate } from '@/lib/i18n/format'
import { useCallback, useEffect, useState } from 'react'
import { Truck, CheckCircle2, XCircle, Loader2, PackageOpen, Video } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Panel } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'
import { useToast } from '@/lib/toast-context'
import { api, Field, fmtDate, fmtDateTime, money, StatusBadge, TableWrap, td, th, withAs } from './shared'
import { useT, activeLocale } from '@/lib/i18n/client'

interface Line { id: string; title: string; kind: 'digital' | 'physical' | 'service'; qty: number; line_total: number; seller_earnings: number; fulfilment: { status: string; carrier?: string; tracking_no?: string; tracking_url?: string; booking?: { start: string; end: string; join_url?: string } | null } }
interface OrderView { id: string; number: string; created_at: string; status: string; currency: string; lines: Line[]; my_total: number; my_earnings: number; buyer_email: string | null; shipping_address: { name: string; line1: string; line2?: string; city: string; state: string; postal_code: string; country: string; phone: string } | null }

export function SellerOrders({ asPlatform }: { asPlatform: boolean }) {
  const { t } = useT()
  const addToast = useToast()
  const [open, setOpen] = useState(true)
  const [orders, setOrders] = useState<OrderView[] | null>(null)
  const [ship, setShip] = useState<{ order: OrderView; line: Line } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(() => {
    setOrders(null)
    api<{ orders: OrderView[] }>(withAs(`/api/marketplace/seller/orders${open ? '?open=1' : ''}`, asPlatform)).then((r) => setOrders(r.orders)).catch((e) => addToast({ type: 'error', title: t('market.couldNotLoadOrders'), message: e.message }))
  }, [open, asPlatform, addToast])
  useEffect(load, [load])

  async function act(order: OrderView, line: Line, action: string, extra: Record<string, string> = {}) {
    if (action === 'cancelled' && !window.confirm(t('market.cancelThisItemTheBuyerWilled6'))) return
    setBusy(line.id)
    try {
      await api(withAs(`/api/marketplace/seller/orders/${order.id}`, asPlatform), { body: { line_id: line.id, action, ...extra } })
      addToast({ type: 'success', title: t('market.orderUpdated') })
      setShip(null)
      load()
    } catch (e) {
      addToast({ type: 'error', title: t('market.updateFailed'), message: (e as Error).message })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2" role="tablist" aria-label={t('market.orderFilter')}>
        <Button role="tab" aria-selected={open} variant={open ? 'secondary' : 'ghost'} size="sm" onClick={() => setOpen(true)}>{t('market.toFulfil')}</Button>
        <Button role="tab" aria-selected={!open} variant={!open ? 'secondary' : 'ghost'} size="sm" onClick={() => setOpen(false)}>{t('market.allOrders')}</Button>
      </div>
      {orders === null ? <div className="h-32 animate-pulse rounded-3xl bg-muted/40 motion-reduce:animate-none" /> : orders.length === 0 ? (
        <EmptyState illustration="inbox" title={open ? t('market.nothingToFulfil') : t('market.noOrdersYet')} description={open ? t('market.newPhysicalOrdersAndBookedSessions8a2') : t('market.ordersForYourProductsWillAppear478')} />
      ) : (
        <div className="space-y-4">
          {orders.map((o) => (
            <Panel key={o.id} className="space-y-3 p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div><span className="font-mono text-sm font-semibold">{o.number}</span> <span className="text-sm text-muted-foreground">· {fmtDate(o.created_at)}</span></div>
                <div className="flex items-center gap-2 text-sm"><StatusBadge status={o.status} /><span className="tabular-nums text-muted-foreground">{t('market.youEarnAmount', { amount: money(o.my_earnings, o.currency) })}</span></div>
              </div>
              {(o.shipping_address || o.buyer_email) && (
                <div className="rounded-2xl bg-muted/40 p-3 text-sm">
                  {o.shipping_address && (
                    <address className="not-italic">
                      <div className="font-medium">{o.shipping_address.name}</div>
                      <div>{o.shipping_address.line1}{o.shipping_address.line2 ? `, ${o.shipping_address.line2}` : ''}</div>
                      <div>{o.shipping_address.city}, {o.shipping_address.state} {o.shipping_address.postal_code}, {o.shipping_address.country}</div>
                      <div className="text-muted-foreground">{o.shipping_address.phone}</div>
                    </address>
                  )}
                  {o.buyer_email && <div className="text-muted-foreground">{o.buyer_email}</div>}
                </div>
              )}
              <ul className="divide-y divide-border/60">
                {o.lines.map((l) => {
                  const s = l.fulfilment?.status ?? 'unfulfilled'
                  const live = ['paid', 'partially_fulfilled'].includes(o.status)
                  return (
                    <li key={l.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="font-medium">{l.title} <span className="text-muted-foreground">× {l.qty}</span></div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <StatusBadge status={s} />
                          {l.fulfilment?.tracking_no && <span>{l.fulfilment.carrier} · {l.fulfilment.tracking_no}</span>}
                          {l.fulfilment?.booking && <span>{fmtDateTime(l.fulfilment.booking.start)}</span>}
                          {l.fulfilment?.booking?.join_url && <a className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline" href={l.fulfilment.booking.join_url} target="_blank" rel="noreferrer"><Video className="h-3 w-3" />{' '}{t('market.joinLink')}</a>}
                        </div>
                      </div>
                      {live && (
                        <div className="flex flex-wrap gap-2">
                          {l.kind === 'physical' && s === 'unfulfilled' && <Button size="sm" variant="outline" disabled={busy === l.id} onClick={() => act(o, l, 'processing')}><PackageOpen />{' '}{t('market.processing')}</Button>}
                          {l.kind === 'physical' && ['unfulfilled', 'processing'].includes(s) && <Button size="sm" disabled={busy === l.id} onClick={() => setShip({ order: o, line: l })}><Truck />{' '}{t('market.markShipped')}</Button>}
                          {l.kind === 'physical' && s === 'shipped' && <Button size="sm" disabled={busy === l.id} onClick={() => act(o, l, 'delivered')}><CheckCircle2 />{' '}{t('market.delivered')}</Button>}
                          {l.kind === 'service' && ['unfulfilled', 'booked'].includes(s) && <Button size="sm" disabled={busy === l.id} onClick={() => act(o, l, 'completed')}><CheckCircle2 />{' '}{t('market.sessionDone')}</Button>}
                          {((l.kind === 'physical' && ['unfulfilled', 'processing'].includes(s)) || (l.kind === 'service' && ['unfulfilled', 'booked'].includes(s))) && (
                            <Button size="sm" variant="ghost" disabled={busy === l.id} onClick={() => act(o, l, 'cancelled')}><XCircle />{' '}{t('common.cancel')}</Button>
                          )}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </Panel>
          ))}
        </div>
      )}
      {ship && <ShipDialog busy={busy === ship.line.id} onClose={() => setShip(null)} onSubmit={(x) => act(ship.order, ship.line, 'shipped', x)} />}
    </div>
  )
}

function ShipDialog({ busy, onClose, onSubmit }: { busy: boolean; onClose: () => void; onSubmit: (x: { carrier: string; tracking_no: string; tracking_url: string }) => void }) {
  const { t } = useT()
  const [x, setX] = useState({ carrier: '', tracking_no: '', tracking_url: '' })
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{t('market.markAsShipped')}</DialogTitle><DialogDescription>{t('market.theBuyerGetsTheTrackingDetails')}</DialogDescription></DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); onSubmit(x) }}>
          <Field label={t('market.carrier')} htmlFor="car"><Input id="car" required value={x.carrier} onChange={(e) => setX({ ...x, carrier: e.target.value })} placeholder={t('market.delhiveryBlueDartUsps')} /></Field>
          <Field label={t('market.trackingNumber')} htmlFor="trk"><Input id="trk" required value={x.tracking_no} onChange={(e) => setX({ ...x, tracking_no: e.target.value })} /></Field>
          <Field label={t('market.trackingLinkOptional')} htmlFor="trl"><Input id="trl" type="url" value={x.tracking_url} onChange={(e) => setX({ ...x, tracking_url: e.target.value })} placeholder="https://" /></Field>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>{t('common.cancel')}</Button><Button type="submit" disabled={busy}>{busy && <Loader2 className="animate-spin motion-reduce:animate-none" />}{t('common.save')}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

interface Booking { id: string; order_id: string; start: string; end: string; status: string; join_url?: string | null; product_id: string }

export function SellerBookings({ asPlatform }: { asPlatform: boolean }) {
  const { t } = useT()
  const [rows, setRows] = useState<Booking[] | null>(null)
  const [upcoming, setUpcoming] = useState(true)
  useEffect(() => {
    setRows(null)
    api<{ bookings: Booking[] }>(withAs(`/api/marketplace/seller/bookings${upcoming ? '?upcoming=1' : ''}`, asPlatform)).then((r) => setRows(r.bookings)).catch(() => setRows([]))
  }, [asPlatform, upcoming])
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button variant={upcoming ? 'secondary' : 'ghost'} size="sm" aria-pressed={upcoming} onClick={() => setUpcoming(true)}>{t('market.upcoming')}</Button>
        <Button variant={!upcoming ? 'secondary' : 'ghost'} size="sm" aria-pressed={!upcoming} onClick={() => setUpcoming(false)}>{t('market.all')}</Button>
      </div>
      {rows === null ? <div className="h-24 animate-pulse rounded-3xl bg-muted/40 motion-reduce:animate-none" /> : rows.length === 0 ? (
        <EmptyState illustration="calendar" title={t('market.noBookings')} description={t('market.sessionsBuyersBookFromYourServicedd6')} />
      ) : (
        <Panel className="p-3 sm:p-4">
          <TableWrap>
            <thead><tr><th className={th}>{t('market.when')}</th><th className={th}>{t('market.status')}</th><th className={th}>{t('market.meeting')}</th></tr></thead>
            <tbody>{rows.map((b) => (
              <tr key={b.id}><td className={`${td} tabular-nums`}>{fmtDateTime(b.start)} – {formatDate(activeLocale(), b.end, { hour: 'numeric', minute: '2-digit' })}</td><td className={td}><StatusBadge status={b.status} /></td>
                <td className={td}>{b.join_url ? <a className="text-primary underline-offset-2 hover:underline" href={b.join_url} target="_blank" rel="noreferrer">{t('market.join')}</a> : <span className="text-muted-foreground">—</span>}</td></tr>
            ))}</tbody>
          </TableWrap>
        </Panel>
      )}
    </div>
  )
}

interface Refund { id: string; order_id: string; amount: number; currency: string; reason: string; type: string; status: string; note?: string | null; created_at: string }

export function SellerReturns({ asPlatform }: { asPlatform: boolean }) {
  const { t } = useT()
  const [rows, setRows] = useState<Refund[] | null>(null)
  useEffect(() => { api<{ refunds: Refund[] }>(withAs('/api/marketplace/seller/refunds', asPlatform)).then((r) => setRows(r.refunds)).catch(() => setRows([])) }, [asPlatform])
  if (rows === null) return <div className="h-24 animate-pulse rounded-3xl bg-muted/40 motion-reduce:animate-none" />
  if (!rows.length) return <EmptyState illustration="success" title={t('market.noReturnsOrRefundRequests')} description={t('market.whenABuyerAsksForA442')} />
  return (
    <Panel className="p-3 sm:p-4">
      <TableWrap>
        <thead><tr><th className={th}>{t('market.opened')}</th><th className={th}>{t('market.type')}</th><th className={th}>{t('market.amount')}</th><th className={th}>{t('market.reason2')}</th><th className={th}>{t('market.status')}</th></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.id}><td className={td}>{fmtDate(r.created_at)}</td><td className={`${td} capitalize`}>{r.type}</td><td className={`${td} tabular-nums`}>{money(r.amount, r.currency)}</td>
            <td className={td}>{r.reason}{r.note && <div className="text-xs text-muted-foreground">{t('market.decisionNote', { note: r.note })}</div>}</td><td className={td}><StatusBadge status={r.status} /></td></tr>
        ))}</tbody>
      </TableWrap>
    </Panel>
  )
}
