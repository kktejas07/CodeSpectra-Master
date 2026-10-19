'use client'

import { useCallback, useEffect, useState } from 'react'
import { Eye, Check, X, Ban, RotateCcw, Loader2, Banknote } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Panel } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'
import { useToast } from '@/lib/toast-context'
import { api, Field, fmtDate, fmtDateTime, money, NativeSelect, pct, StatusBadge, TableWrap, td, th, toMajor, toMinor } from '@/components/marketplace/seller/shared'

function Filter({ value, onChange, options, label }: { value: string; onChange: (v: string) => void; options: [string, string][]; label: string }) {
  return (
    <div className="w-48"><NativeSelect aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</NativeSelect></div>
  )
}

/** Small prompt dialog for a reason / reference / amount. */
function Prompt({ title, description, fields, confirm, onClose, onSubmit }: {
  title: string; description?: string; fields: { key: string; label: string; required?: boolean; multiline?: boolean; initial?: string; hint?: string }[]
  confirm: string; onClose: () => void; onSubmit: (v: Record<string, string>) => Promise<void>
}) {
  const [v, setV] = useState<Record<string, string>>(Object.fromEntries(fields.map((f) => [f.key, f.initial ?? ''])))
  const [busy, setBusy] = useState(false)
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{title}</DialogTitle>{description && <DialogDescription>{description}</DialogDescription>}</DialogHeader>
        <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); setBusy(true); try { await onSubmit(v) } finally { setBusy(false) } }}>
          {fields.map((f) => (
            <Field key={f.key} label={f.label} htmlFor={`p-${f.key}`} hint={f.hint}>
              {f.multiline
                ? <Textarea id={`p-${f.key}`} required={f.required} rows={3} value={v[f.key]} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} />
                : <Input id={`p-${f.key}`} required={f.required} value={v[f.key]} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} />}
            </Field>
          ))}
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy && <Loader2 className="animate-spin motion-reduce:animate-none" />}{confirm}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

type PromptState = Parameters<typeof Prompt>[0] | null

// ─── Sellers ─────────────────────────────────────────────────────────────────

interface SellerRow {
  id: string; display_name: string; slug: string; country: string; status: string; is_platform: boolean; commission_bps: number | null; created_at: string
  kyc: { status: string; pan_last4?: string; gstin?: string; tax_id_last4?: string }; payout: { method: string | null; account_ref?: string | null; verified: boolean }
  contact_email?: string; w9_acknowledged?: boolean; review_note?: string | null
}

export function AdminSellers() {
  const addToast = useToast()
  const [status, setStatus] = useState('pending')
  const [rows, setRows] = useState<SellerRow[] | null>(null)
  const [prompt, setPrompt] = useState<PromptState>(null)
  const [kyc, setKyc] = useState<{ seller: SellerRow; data: any } | null>(null)

  const load = useCallback(() => {
    setRows(null)
    api<{ sellers: SellerRow[] }>(`/api/marketplace/admin/sellers${status === 'all' ? '' : `?status=${status}`}`).then((r) => setRows(r.sellers)).catch((e) => addToast({ type: 'error', title: 'Could not load sellers', message: e.message }))
  }, [status, addToast])
  useEffect(load, [load])

  const post = async (s: SellerRow, body: Record<string, unknown>, ok: string) => {
    try {
      await api(`/api/marketplace/admin/sellers/${s.id}`, { body })
      addToast({ type: 'success', title: ok })
      setPrompt(null)
      load()
    } catch (e) {
      addToast({ type: 'error', title: 'Action failed', message: (e as Error).message })
    }
  }
  const withNote = (s: SellerRow, action: string, title: string) => setPrompt({
    title, description: 'The seller sees this reason.', confirm: title, fields: [{ key: 'note', label: 'Reason', required: action !== 'approve', multiline: true }],
    onClose: () => setPrompt(null), onSubmit: (v) => post(s, { action, note: v.note }, 'Seller updated'),
  })
  const viewKyc = async (s: SellerRow) => {
    try { setKyc({ seller: s, data: await api(`/api/marketplace/admin/sellers/${s.id}/kyc`) }) } catch (e) { addToast({ type: 'error', title: 'Could not load KYC', message: (e as Error).message }) }
  }

  return (
    <div className="space-y-4">
      <Filter label="Seller status" value={status} onChange={setStatus} options={[['pending', 'Applications'], ['approved', 'Approved'], ['suspended', 'Suspended'], ['rejected', 'Rejected'], ['all', 'All sellers']]} />
      {rows === null ? <div className="h-32 animate-pulse rounded-3xl bg-muted/40 motion-reduce:animate-none" /> : rows.length === 0 ? (
        <EmptyState illustration="team" title="No sellers here" description={status === 'pending' ? 'New seller applications will appear here.' : 'Try another filter.'} />
      ) : (
        <Panel className="p-3 sm:p-4">
          <TableWrap>
            <thead><tr><th className={th}>Seller</th><th className={th}>Country</th><th className={th}>KYC</th><th className={th}>Payout</th><th className={th}>Commission</th><th className={th}>Status</th><th className={th}><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{rows.map((s) => (
              <tr key={s.id}>
                <td className={td}><div className="font-medium">{s.display_name}{s.is_platform && <span className="ml-2 text-xs text-primary">Platform</span>}</div><div className="text-xs text-muted-foreground">Applied {fmtDate(s.created_at)}</div></td>
                <td className={td}>{s.country}</td>
                <td className={td}><StatusBadge status={s.kyc.status} /><div className="font-mono text-xs text-muted-foreground">{s.kyc.pan_last4 ? `PAN ••${s.kyc.pan_last4}` : s.kyc.tax_id_last4 ? `TIN ••${s.kyc.tax_id_last4}` : ''}{s.kyc.gstin ? ' · GST' : ''}{s.w9_acknowledged ? ' · W-9' : ''}</div></td>
                <td className={`${td} text-xs`}>{s.payout.account_ref || '—'}{s.payout.method && <div><StatusBadge status={s.payout.verified ? 'verified' : 'pending'} /></div>}</td>
                <td className={`${td} tabular-nums`}>
                  {s.is_platform ? '0%' : (
                    <button type="button" className="text-left underline decoration-dotted underline-offset-2 hover:text-primary" onClick={() => setPrompt({
                      title: 'Seller commission', description: 'Leave blank to use the platform / category default.', confirm: 'Save',
                      fields: [{ key: 'pct', label: 'Commission (%)', initial: s.commission_bps === null ? '' : String(s.commission_bps / 100) }],
                      onClose: () => setPrompt(null), onSubmit: (v) => post(s, { commission_bps: v.pct.trim() === '' ? null : Math.round(Number(v.pct) * 100) }, 'Commission updated'),
                    })}>{s.commission_bps === null ? 'Default' : pct(s.commission_bps)}</button>
                  )}
                </td>
                <td className={td}><StatusBadge status={s.status} /></td>
                <td className={`${td} whitespace-nowrap text-right`}>
                  {!s.is_platform && (
                    <div className="flex justify-end gap-1">
                      <Button size="icon-sm" variant="ghost" aria-label={`View KYC for ${s.display_name}`} onClick={() => viewKyc(s)}><Eye /></Button>
                      {['pending', 'rejected'].includes(s.status) && <Button size="sm" onClick={() => post(s, { action: 'approve' }, 'Seller approved')}><Check /> Approve</Button>}
                      {s.status === 'pending' && <Button size="sm" variant="outline" onClick={() => withNote(s, 'reject', 'Reject')}><X /> Reject</Button>}
                      {s.status === 'approved' && <Button size="sm" variant="ghost" onClick={() => withNote(s, 'suspend', 'Suspend')}><Ban /> Suspend</Button>}
                      {s.status === 'suspended' && <Button size="sm" variant="outline" onClick={() => post(s, { action: 'reinstate' }, 'Seller reinstated')}><RotateCcw /> Reinstate</Button>}
                    </div>
                  )}
                </td>
              </tr>
            ))}</tbody>
          </TableWrap>
        </Panel>
      )}
      {prompt && <Prompt {...prompt} />}
      {kyc && (
        <Dialog open onOpenChange={(o) => { if (!o) setKyc(null) }}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader><DialogTitle>KYC — {kyc.seller.display_name}</DialogTitle><DialogDescription>Full details are shown to you only; this view was recorded in the audit log.</DialogDescription></DialogHeader>
            <dl className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Contact</dt><dd>{kyc.seller.contact_email || '—'}</dd>
              {kyc.data.kyc?.pan && <><dt className="text-muted-foreground">PAN</dt><dd className="font-mono">{kyc.data.kyc.pan}</dd></>}
              {kyc.data.kyc?.gstin && <><dt className="text-muted-foreground">GSTIN</dt><dd className="font-mono">{kyc.data.kyc.gstin}</dd></>}
              {kyc.data.kyc?.tax_id && <><dt className="text-muted-foreground">SSN / EIN</dt><dd className="font-mono">{kyc.data.kyc.tax_id}</dd></>}
              {kyc.seller.country === 'US' && <><dt className="text-muted-foreground">W-9</dt><dd>{kyc.seller.w9_acknowledged ? 'Certified in the application' : 'Not certified'}</dd></>}
              <dt className="text-muted-foreground">Payout</dt><dd>{kyc.seller.payout.method ?? '—'}</dd>
              {kyc.data.payout?.account_name && <><dt className="text-muted-foreground">Account holder</dt><dd>{kyc.data.payout.account_name}</dd></>}
              {kyc.data.payout?.account_no && <><dt className="text-muted-foreground">Account no.</dt><dd className="font-mono">{kyc.data.payout.account_no}</dd></>}
              {kyc.data.payout?.ifsc && <><dt className="text-muted-foreground">IFSC</dt><dd className="font-mono">{kyc.data.payout.ifsc}</dd></>}
              {kyc.data.payout?.routing_no && <><dt className="text-muted-foreground">Routing no.</dt><dd className="font-mono">{kyc.data.payout.routing_no}</dd></>}
              {kyc.data.payout?.upi && <><dt className="text-muted-foreground">UPI</dt><dd className="font-mono">{kyc.data.payout.upi}</dd></>}
            </dl>
            <div>
              <h4 className="mb-2 text-sm font-semibold">History</h4>
              <ul className="space-y-1 text-xs text-muted-foreground">
                {(kyc.data.history ?? []).map((h: { action: string; created_at: string; note?: string | null }, i: number) => <li key={i}><span className="tabular-nums">{fmtDateTime(h.created_at)}</span> · {h.action.replace('seller.', '').replace('_', ' ')}{h.note ? ` — ${h.note}` : ''}</li>)}
              </ul>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

// ─── Products ────────────────────────────────────────────────────────────────

interface ProductRow { id: string; seller_id: string; kind: string; title: string; slug: string; description_md: string; category: string; currency: string; price: number; status: string; images: string[]; submitted_at?: string | null; review_note?: string | null; digital?: { file_ids: string[] } | null }

export function AdminProducts() {
  const addToast = useToast()
  const [status, setStatus] = useState('pending_review')
  const [rows, setRows] = useState<ProductRow[] | null>(null)
  const [open, setOpen] = useState<ProductRow | null>(null)
  const [prompt, setPrompt] = useState<PromptState>(null)
  const load = useCallback(() => {
    setRows(null)
    api<{ products: ProductRow[] }>(`/api/marketplace/admin/products?status=${status}`).then((r) => setRows(r.products)).catch((e) => addToast({ type: 'error', title: 'Could not load products', message: e.message }))
  }, [status, addToast])
  useEffect(load, [load])
  const decide = async (p: ProductRow, decision: string, note?: string) => {
    try {
      await api(`/api/marketplace/admin/products/${p.id}`, { body: { decision, note } })
      addToast({ type: 'success', title: decision === 'approve' ? 'Product published' : 'Seller notified' })
      setPrompt(null); setOpen(null); load()
    } catch (e) { addToast({ type: 'error', title: 'Action failed', message: (e as Error).message }) }
  }
  const ask = (p: ProductRow, decision: string) => setPrompt({ title: decision === 'reject' ? 'Request changes' : 'Unpublish product', confirm: 'Send', fields: [{ key: 'note', label: 'What should the seller change?', required: true, multiline: true }], onClose: () => setPrompt(null), onSubmit: (v) => decide(p, decision, v.note) })
  return (
    <div className="space-y-4">
      <Filter label="Product status" value={status} onChange={setStatus} options={[['pending_review', 'Waiting for review'], ['published', 'Published'], ['rejected', 'Rejected'], ['archived', 'Archived'], ['all', 'All products']]} />
      {rows === null ? <div className="h-32 animate-pulse rounded-3xl bg-muted/40 motion-reduce:animate-none" /> : rows.length === 0 ? (
        <EmptyState illustration="success" title={status === 'pending_review' ? 'Review queue is clear' : 'No products here'} description="Products sellers submit for review appear here." />
      ) : (
        <Panel className="p-3 sm:p-4">
          <TableWrap>
            <thead><tr><th className={th}>Product</th><th className={th}>Type</th><th className={th}>Price</th><th className={th}>Submitted</th><th className={th}>Status</th><th className={th}><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{rows.map((p) => (
              <tr key={p.id}>
                <td className={td}><button type="button" className="text-left font-medium hover:text-primary" onClick={() => setOpen(p)}>{p.title}</button><div className="text-xs text-muted-foreground">{p.category}</div></td>
                <td className={`${td} capitalize`}>{p.kind}</td>
                <td className={`${td} tabular-nums`}>{money(p.price, p.currency)}</td>
                <td className={td}>{fmtDate(p.submitted_at)}</td>
                <td className={td}><StatusBadge status={p.status} /></td>
                <td className={`${td} whitespace-nowrap text-right`}>
                  <div className="flex justify-end gap-1">
                    {p.status === 'pending_review' && <><Button size="sm" onClick={() => decide(p, 'approve')}><Check /> Approve</Button><Button size="sm" variant="outline" onClick={() => ask(p, 'reject')}><X /> Reject</Button></>}
                    {p.status === 'published' && <Button size="sm" variant="ghost" onClick={() => ask(p, 'unpublish')}><Ban /> Unpublish</Button>}
                  </div>
                </td>
              </tr>
            ))}</tbody>
          </TableWrap>
        </Panel>
      )}
      {open && (
        <Dialog open onOpenChange={(o) => { if (!o) setOpen(null) }}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader><DialogTitle>{open.title}</DialogTitle><DialogDescription className="capitalize">{open.kind} · {open.category} · {money(open.price, open.currency)}</DialogDescription></DialogHeader>
            {open.images.length > 0 && <div className="flex gap-2 overflow-x-auto">{open.images.map((u) => <img key={u} src={u} alt="" className="h-28 rounded-xl border border-border object-cover" />)}</div>}
            <pre className="whitespace-pre-wrap break-words font-sans text-sm text-foreground">{open.description_md}</pre>
            {open.digital && <p className="text-xs text-muted-foreground">{open.digital.file_ids.length} file(s), virus-scanned at upload.</p>}
            {open.status === 'pending_review' && <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => ask(open, 'reject')}>Request changes</Button><Button onClick={() => decide(open, 'approve')}>Approve</Button></div>}
          </DialogContent>
        </Dialog>
      )}
      {prompt && <Prompt {...prompt} />}
    </div>
  )
}

// ─── Orders ──────────────────────────────────────────────────────────────────

interface OrderRow { id: string; number: string; created_at: string; status: string; currency: string; grand_total: number; lines: { id: string; title: string; seller_id: string; kind: string; fulfilment: { status: string } }[]; payment: { gateway: string; status: string } }

export function AdminOrders() {
  const [status, setStatus] = useState('all')
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<OrderRow[] | null>(null)
  useEffect(() => {
    const t = setTimeout(() => {
      setRows(null)
      const qs = new URLSearchParams()
      if (status !== 'all') qs.set('status', status)
      if (q.trim()) qs.set('q', q.trim())
      api<{ orders: OrderRow[] }>(`/api/marketplace/admin/orders?${qs}`).then((r) => setRows(r.orders)).catch(() => setRows([]))
    }, 250)
    return () => clearTimeout(t)
  }, [status, q])
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Filter label="Order status" value={status} onChange={setStatus} options={[['all', 'All orders'], ['pending_payment', 'Awaiting payment'], ['paid', 'Paid'], ['partially_fulfilled', 'Partly fulfilled'], ['fulfilled', 'Fulfilled'], ['partially_refunded', 'Partly refunded'], ['refunded', 'Refunded'], ['cancelled', 'Cancelled']]} />
        <Input aria-label="Search order number" placeholder="Order number" className="w-48" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {rows === null ? <div className="h-32 animate-pulse rounded-3xl bg-muted/40 motion-reduce:animate-none" /> : rows.length === 0 ? (
        <EmptyState illustration="search" title="No orders found" description="Orders appear here as soon as buyers check out." />
      ) : (
        <Panel className="p-3 sm:p-4">
          <TableWrap>
            <thead><tr><th className={th}>Order</th><th className={th}>Items</th><th className={th}>Total</th><th className={th}>Payment</th><th className={th}>Status</th></tr></thead>
            <tbody>{rows.map((o) => (
              <tr key={o.id}>
                <td className={td}><div className="font-mono text-xs font-semibold">{o.number}</div><div className="text-xs text-muted-foreground">{fmtDateTime(o.created_at)}</div></td>
                <td className={td}>{o.lines.map((l) => <div key={l.id} className="flex items-center gap-2 text-xs"><span className="truncate">{l.title}</span><StatusBadge status={l.fulfilment?.status ?? 'unfulfilled'} /></div>)}</td>
                <td className={`${td} tabular-nums`}>{money(o.grand_total, o.currency)}</td>
                <td className={`${td} text-xs capitalize`}>{o.payment?.gateway} · {o.payment?.status}</td>
                <td className={td}><StatusBadge status={o.status} /></td>
              </tr>
            ))}</tbody>
          </TableWrap>
        </Panel>
      )}
    </div>
  )
}

// ─── Refunds / disputes ──────────────────────────────────────────────────────

interface RefundRow { id: string; order_id: string; seller_id: string; amount: number; currency: string; reason: string; type: string; status: string; note?: string | null; created_at: string }

export function AdminRefunds() {
  const addToast = useToast()
  const [status, setStatus] = useState('open')
  const [rows, setRows] = useState<RefundRow[] | null>(null)
  const [prompt, setPrompt] = useState<PromptState>(null)
  const load = useCallback(() => {
    setRows(null)
    api<{ refunds: RefundRow[] }>(`/api/marketplace/admin/refunds?status=${status}`).then((r) => setRows(r.refunds)).catch(() => setRows([]))
  }, [status])
  useEffect(load, [load])
  const decide = async (r: RefundRow, decision: 'approve' | 'reject', v: Record<string, string>) => {
    try {
      const amount = v.amount ? toMinor(v.amount) : null
      if (amount !== null && Number.isNaN(amount)) throw new Error('Enter the amount like 499 or 499.50.')
      const res = await api<{ refund: { via?: string } }>(`/api/marketplace/admin/refunds/${r.id}`, { body: { decision, amount, note: v.note } })
      addToast({ type: 'success', title: decision === 'approve' ? 'Refund approved' : 'Request declined', message: res.refund.via === 'ledger_only' ? 'Recorded in the ledger — refund the buyer in the payment gateway.' : undefined, duration: res.refund.via === 'ledger_only' ? 10_000 : undefined })
      setPrompt(null); load()
    } catch (e) { addToast({ type: 'error', title: 'Action failed', message: (e as Error).message }) }
  }
  return (
    <div className="space-y-4">
      <Filter label="Refund status" value={status} onChange={setStatus} options={[['open', 'Open'], ['refunded', 'Refunded'], ['rejected', 'Declined'], ['all', 'All']]} />
      {rows === null ? <div className="h-32 animate-pulse rounded-3xl bg-muted/40 motion-reduce:animate-none" /> : rows.length === 0 ? (
        <EmptyState illustration="success" title="No refund requests" description="Refund, return and dispute requests from buyers or seller cancellations land here." />
      ) : (
        <Panel className="p-3 sm:p-4">
          <TableWrap>
            <thead><tr><th className={th}>Opened</th><th className={th}>Type</th><th className={th}>Amount</th><th className={th}>Reason</th><th className={th}>Status</th><th className={th}><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}>
                <td className={td}>{fmtDate(r.created_at)}</td>
                <td className={`${td} capitalize`}>{r.type}</td>
                <td className={`${td} tabular-nums`}>{money(r.amount, r.currency)}</td>
                <td className={td}>{r.reason}{r.note && <div className="text-xs text-muted-foreground">{r.note}</div>}</td>
                <td className={td}><StatusBadge status={r.status} /></td>
                <td className={`${td} whitespace-nowrap text-right`}>
                  {r.status === 'open' && <div className="flex justify-end gap-1">
                    <Button size="sm" onClick={() => setPrompt({ title: 'Approve refund', description: 'The buyer is refunded and the seller balance adjusted.', confirm: 'Approve refund', fields: [{ key: 'amount', label: `Amount (${r.currency})`, initial: toMajor(r.amount), hint: 'Lower it for a partial refund.' }, { key: 'note', label: 'Note (optional)', multiline: true }], onClose: () => setPrompt(null), onSubmit: (v) => decide(r, 'approve', v) })}><Check /> Approve</Button>
                    <Button size="sm" variant="outline" onClick={() => setPrompt({ title: 'Decline request', confirm: 'Decline', fields: [{ key: 'note', label: 'Reason for the buyer', required: true, multiline: true }], onClose: () => setPrompt(null), onSubmit: (v) => decide(r, 'reject', v) })}><X /> Decline</Button>
                  </div>}
                </td>
              </tr>
            ))}</tbody>
          </TableWrap>
        </Panel>
      )}
      {prompt && <Prompt {...prompt} />}
    </div>
  )
}

// ─── Payouts ─────────────────────────────────────────────────────────────────

interface PayoutRow { id: string; seller_id: string; seller_name: string; currency: string; amount: number; method: string; status: string; ref?: string | null; requested_at: string; paid_at?: string | null; destination_masked?: string | null; failure_reason?: string | null }

export function AdminPayouts() {
  const addToast = useToast()
  const [status, setStatus] = useState('requested')
  const [rows, setRows] = useState<PayoutRow[] | null>(null)
  const [prompt, setPrompt] = useState<PromptState>(null)
  const load = useCallback(() => {
    setRows(null)
    api<{ payouts: PayoutRow[] }>(`/api/marketplace/admin/payouts?status=${status}`).then((r) => setRows(r.payouts)).catch(() => setRows([]))
  }, [status])
  useEffect(load, [load])
  const act = async (p: PayoutRow, action: string, extra: Record<string, string> = {}) => {
    try {
      await api(`/api/marketplace/admin/payouts/${p.id}`, { body: { action, ...extra } })
      addToast({ type: 'success', title: action === 'paid' ? 'Marked as paid' : action === 'approve' ? 'Payout approved' : action === 'reconcile' ? 'Payout checked with Stripe' : 'Marked as failed' })
      setPrompt(null); load()
    } catch (e) { addToast({ type: 'error', title: 'Action failed', message: (e as Error).message }) }
  }
  return (
    <div className="space-y-4">
      <Filter label="Payout status" value={status} onChange={setStatus} options={[['requested', 'Requested'], ['approved', 'Approved — to pay'], ['paying', 'Transfer in progress'], ['paid', 'Paid'], ['failed', 'Failed'], ['cancelled', 'Cancelled'], ['all', 'All']]} />
      {rows === null ? <div className="h-32 animate-pulse rounded-3xl bg-muted/40 motion-reduce:animate-none" /> : rows.length === 0 ? (
        <EmptyState illustration="billing" title="No payouts here" description="Seller payout requests appear here for approval." />
      ) : (
        <Panel className="p-3 sm:p-4">
          <TableWrap>
            <thead><tr><th className={th}>Seller</th><th className={th}>Amount</th><th className={th}>To</th><th className={th}>Requested</th><th className={th}>Status</th><th className={th}><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{rows.map((p) => (
              <tr key={p.id}>
                <td className={td}>{p.seller_name}</td>
                <td className={`${td} tabular-nums`}>{money(p.amount, p.currency)}</td>
                <td className={`${td} text-xs`}>{p.destination_masked || p.method}</td>
                <td className={td}>{fmtDateTime(p.requested_at)}</td>
                <td className={td}><StatusBadge status={p.status} />{p.ref && <div className="font-mono text-xs text-muted-foreground">{p.ref}</div>}{p.failure_reason && <div className="text-xs text-destructive">{p.failure_reason}</div>}</td>
                <td className={`${td} whitespace-nowrap text-right`}>
                  <div className="flex justify-end gap-1">
                    {p.status === 'requested' && <Button size="sm" onClick={() => act(p, 'approve')}><Check /> Approve</Button>}
                    {p.status === 'approved' && (p.method === 'stripe_connect'
                      ? <Button size="sm" onClick={() => { if (window.confirm(`Send ${money(p.amount, p.currency)} to ${p.seller_name} via Stripe?`)) void act(p, 'paid') }}><Banknote /> Pay via Stripe</Button>
                      : <Button size="sm" onClick={() => setPrompt({ title: 'Mark as paid', description: `Send ${money(p.amount, p.currency)} to ${p.destination_masked ?? 'the seller'} from your bank, then enter the reference.`, confirm: 'Mark paid', fields: [{ key: 'ref', label: 'Bank / UPI reference (UTR)', required: true }], onClose: () => setPrompt(null), onSubmit: (v) => act(p, 'paid', v) })}><Banknote /> Mark paid</Button>)}
                    {p.status === 'paying' && <Button size="sm" variant="outline" onClick={() => act(p, 'reconcile')}><Check /> Reconcile</Button>}
                    {['requested', 'approved'].includes(p.status) && <Button size="sm" variant="ghost" onClick={() => setPrompt({ title: 'Mark as failed', description: 'The amount goes back to the seller’s available balance.', confirm: 'Mark failed', fields: [{ key: 'reason', label: 'Reason', required: true, multiline: true }], onClose: () => setPrompt(null), onSubmit: (v) => act(p, 'failed', v) })}><X /> Failed</Button>}
                  </div>
                </td>
              </tr>
            ))}</tbody>
          </TableWrap>
        </Panel>
      )}
      {prompt && <Prompt {...prompt} />}
    </div>
  )
}
