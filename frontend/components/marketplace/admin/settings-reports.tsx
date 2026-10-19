'use client'

import { useEffect, useState } from 'react'
import { Download, Loader2, Plus, X, TrendingUp, Percent, RotateCcw, ShoppingBag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { BentoGrid, Panel, Section, StatCard } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'
import { useToast } from '@/lib/toast-context'
import { api, Field, money, NativeSelect, TableWrap, td, th, toMajor, toMinor } from '@/components/marketplace/seller/shared'

interface Settings {
  default_commission_bps: number
  category_commission_bps?: Record<string, number>
  hold_days: { digital: number; physical: number; service: number }
  min_payout: { INR: number; USD: number }
  tax: { in_gst_bps: number; us_sales_tax_bps: number; prices_include_tax: boolean }
  require_product_review: boolean
}

const bpsToPct = (b: number) => String(b / 100)
const pctToBps = (s: string) => Math.round(Number(s) * 100)

export function AdminSettings() {
  const addToast = useToast()
  const [s, setS] = useState<Settings | null>(null)
  const [cats, setCats] = useState<string[]>([])
  const [form, setForm] = useState<Record<string, string>>({})
  const [overrides, setOverrides] = useState<{ cat: string; pct: string }[]>([])
  const [review, setReview] = useState(true)
  const [inclusive, setInclusive] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api<{ settings: Settings; categories: string[] }>('/api/marketplace/admin/settings').then(({ settings, categories }) => {
      setS(settings)
      setCats(categories)
      setForm({
        def: bpsToPct(settings.default_commission_bps), hd: String(settings.hold_days.digital), hp: String(settings.hold_days.physical), hs: String(settings.hold_days.service),
        minInr: toMajor(settings.min_payout.INR), minUsd: toMajor(settings.min_payout.USD), gst: bpsToPct(settings.tax.in_gst_bps), ust: bpsToPct(settings.tax.us_sales_tax_bps),
      })
      setOverrides(Object.entries(settings.category_commission_bps ?? {}).map(([cat, b]) => ({ cat, pct: bpsToPct(b) })))
      setReview(settings.require_product_review)
      setInclusive(settings.tax.prices_include_tax)
    }).catch((e) => addToast({ type: 'error', title: 'Could not load settings', message: e.message }))
  }, [addToast])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const body = {
        default_commission_bps: pctToBps(form.def),
        category_commission_bps: Object.fromEntries(overrides.filter((o) => o.cat && o.pct !== '').map((o) => [o.cat, pctToBps(o.pct)])),
        hold_days: { digital: Number(form.hd), physical: Number(form.hp), service: Number(form.hs) },
        min_payout: { INR: toMinor(form.minInr) ?? 0, USD: toMinor(form.minUsd) ?? 0 },
        tax: { in_gst_bps: pctToBps(form.gst), us_sales_tax_bps: pctToBps(form.ust), prices_include_tax: inclusive },
        require_product_review: review,
      }
      const r = await api<{ settings: Settings }>('/api/marketplace/admin/settings', { method: 'PUT', body })
      setS(r.settings)
      addToast({ type: 'success', title: 'Marketplace settings saved' })
    } catch (err) {
      addToast({ type: 'error', title: 'Not saved', message: (err as Error).message })
    } finally {
      setSaving(false)
    }
  }

  if (!s) return <div className="h-48 animate-pulse rounded-3xl bg-muted/40 motion-reduce:animate-none" />
  const f = (k: string) => ({ value: form[k] ?? '', onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value }) })
  return (
    <form onSubmit={save} className="space-y-6">
      <Panel>
        <Section title="Commission" description="Seller overrides win over category overrides, which win over the default. CodeSpectra’s own store pays none.">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Default commission (%)" htmlFor="m-def"><Input id="m-def" inputMode="decimal" {...f('def')} /></Field>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Per-category commission</p>
            {overrides.map((o, i) => (
              <div key={i} className="grid grid-cols-[1fr_120px_auto] gap-2">
                <NativeSelect aria-label="Category" value={o.cat} onChange={(e) => setOverrides((x) => x.map((y, j) => j === i ? { ...y, cat: e.target.value } : y))}>{cats.map((c) => <option key={c} value={c}>{c}</option>)}</NativeSelect>
                <Input aria-label="Commission percent" inputMode="decimal" value={o.pct} onChange={(e) => setOverrides((x) => x.map((y, j) => j === i ? { ...y, pct: e.target.value } : y))} />
                <Button type="button" size="icon" variant="ghost" aria-label="Remove" onClick={() => setOverrides((x) => x.filter((_, j) => j !== i))}><X /></Button>
              </div>
            ))}
            <Button type="button" size="sm" variant="outline" onClick={() => setOverrides((x) => [...x, { cat: cats[0] ?? 'books', pct: bpsToPct(s.default_commission_bps) }])}><Plus /> Add category rate</Button>
          </div>
        </Section>
      </Panel>
      <Panel>
        <Section title="Payout holds and minimums" description="Funds stay pending for the refund window. Physical items count from delivery; services from the session.">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Digital (days)" htmlFor="m-hd"><Input id="m-hd" type="number" min={0} max={120} {...f('hd')} /></Field>
            <Field label="Physical, after delivery (days)" htmlFor="m-hp"><Input id="m-hp" type="number" min={0} max={120} {...f('hp')} /></Field>
            <Field label="Service, after session (days)" htmlFor="m-hs"><Input id="m-hs" type="number" min={0} max={120} {...f('hs')} /></Field>
            <Field label="Minimum payout (₹)" htmlFor="m-mi"><Input id="m-mi" inputMode="decimal" {...f('minInr')} /></Field>
            <Field label="Minimum payout ($)" htmlFor="m-mu"><Input id="m-mu" inputMode="decimal" {...f('minUsd')} /></Field>
          </div>
        </Section>
      </Panel>
      <Panel>
        <Section title="Tax and review">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="GST, India (%)" htmlFor="m-g"><Input id="m-g" inputMode="decimal" {...f('gst')} /></Field>
            <Field label="US sales tax (%)" htmlFor="m-u"><Input id="m-u" inputMode="decimal" {...f('ust')} /></Field>
          </div>
          <label className="flex items-center gap-3 text-sm"><Checkbox checked={inclusive} onCheckedChange={(v) => setInclusive(v === true)} aria-label="Prices include tax" />Listed prices include tax</label>
          <label className="flex items-center gap-3 text-sm"><Checkbox checked={review} onCheckedChange={(v) => setReview(v === true)} aria-label="Require product review" />Review new and changed products before they go live</label>
        </Section>
      </Panel>
      <div className="flex justify-end"><Button type="submit" disabled={saving}>{saving && <Loader2 className="animate-spin motion-reduce:animate-none" />}Save settings</Button></div>
    </form>
  )
}

interface Report {
  totals: { currency: string; gmv: number; orders: number; commission: number; refunds: number; tax: number; shipping: number }[]
  top_sellers: { seller_id: string; name: string; currency: string; sales: number; lines: number }[]
  top_products: { product_id: string; title: string; currency: string; units: number; revenue: number }[]
}

export function AdminReports() {
  const today = new Date().toISOString().slice(0, 10)
  const [from, setFrom] = useState(new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10))
  const [to, setTo] = useState(today)
  const [r, setR] = useState<Report | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    api<Report>(`/api/marketplace/admin/reports?from=${from}&to=${to}`).then(setR).catch(() => setR(null)).finally(() => setLoading(false))
  }, [from, to])

  const csv = (kind: string) => `/api/marketplace/admin/reports?from=${from}&to=${to}&format=csv&kind=${kind}`
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="From" htmlFor="r-f"><Input id="r-f" type="date" max={to} value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To" htmlFor="r-t"><Input id="r-t" type="date" min={from} max={today} value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <div className="flex flex-wrap gap-2">
          {(['summary', 'orders', 'sellers', 'products'] as const).map((k) => (
            <Button key={k} asChild variant="outline" size="sm"><a href={csv(k)} download><Download /> {k[0].toUpperCase() + k.slice(1)} CSV</a></Button>
          ))}
        </div>
      </div>
      {loading && !r ? <div className="h-32 animate-pulse rounded-3xl bg-muted/40 motion-reduce:animate-none" /> : !r || r.totals.length === 0 ? (
        <EmptyState illustration="analytics" title="No sales in this period" description="Pick a wider date range, or check back after the first orders." />
      ) : (
        <>
          <BentoGrid>
            {r.totals.flatMap((t) => [
              <StatCard key={`g${t.currency}`} icon={<TrendingUp />} label={`GMV (${t.currency})`} value={money(t.gmv, t.currency)} hint={`${t.orders} orders`} />,
              <StatCard key={`c${t.currency}`} icon={<Percent />} label={`Commission earned (${t.currency})`} value={money(t.commission, t.currency)} />,
              <StatCard key={`r${t.currency}`} icon={<RotateCcw />} label={`Refunds (${t.currency})`} value={money(t.refunds, t.currency)} />,
              <StatCard key={`t${t.currency}`} icon={<ShoppingBag />} label={`Tax collected (${t.currency})`} value={money(t.tax, t.currency)} hint={`Shipping ${money(t.shipping, t.currency)}`} />,
            ])}
          </BentoGrid>
          <div className="grid gap-6 lg:grid-cols-2">
            <Panel className="p-3 sm:p-4"><h3 className="mb-2 px-3 font-semibold">Top sellers</h3>
              <TableWrap><thead><tr><th className={th}>Seller</th><th className={`${th} text-right`}>Sales</th><th className={`${th} text-right`}>Items</th></tr></thead>
                <tbody>{r.top_sellers.map((x) => <tr key={x.seller_id + x.currency}><td className={td}>{x.name}</td><td className={`${td} text-right tabular-nums`}>{money(x.sales, x.currency)}</td><td className={`${td} text-right tabular-nums`}>{x.lines}</td></tr>)}</tbody></TableWrap>
            </Panel>
            <Panel className="p-3 sm:p-4"><h3 className="mb-2 px-3 font-semibold">Top products</h3>
              <TableWrap><thead><tr><th className={th}>Product</th><th className={`${th} text-right`}>Revenue</th><th className={`${th} text-right`}>Units</th></tr></thead>
                <tbody>{r.top_products.map((x) => <tr key={x.product_id + x.currency}><td className={td}>{x.title}</td><td className={`${td} text-right tabular-nums`}>{money(x.revenue, x.currency)}</td><td className={`${td} text-right tabular-nums`}>{x.units}</td></tr>)}</tbody></TableWrap>
            </Panel>
          </div>
        </>
      )}
    </div>
  )
}
