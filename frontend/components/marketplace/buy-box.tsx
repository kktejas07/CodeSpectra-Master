'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarClock, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { formatMinor } from '@/lib/marketplace/pricing'
import type { Currency, ItemKind, ProductVariant } from '@/lib/marketplace/contract'
import { openCartDrawer, useCart } from './use-cart'
import { NativePurchaseGate } from '@/components/native/native-purchase-gate'

interface Props {
  productId: string
  slug: string
  kind: ItemKind
  currency: Currency
  price: number
  variants: ProductVariant[]
  stock: number | null
  service: { duration_min: number; timezone: string; mode: string } | null
}

function dayKey(iso: string, tz: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
}

/** Slots come from the server as UTC instants; shown in the buyer's own time zone. */
export function SlotPicker({ slug, value, onChange }: { slug: string; value: string | null; onChange: (iso: string | null) => void }) {
  const tz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', [])
  const [from, setFrom] = useState(() => Date.now())
  const [slots, setSlots] = useState<string[] | null>(null)
  const [day, setDay] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    setSlots(null)
    fetch(`/api/marketplace/products/${encodeURIComponent(slug)}/slots?from=${new Date(from).toISOString()}&days=14`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => { if (live) setSlots(Array.isArray(j.slots) ? j.slots : []) })
      .catch(() => live && setSlots([]))
    return () => { live = false }
  }, [slug, from])
  const byDay = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const s of slots || []) m.set(dayKey(s, tz), [...(m.get(dayKey(s, tz)) || []), s])
    return m
  }, [slots, tz])
  const days = [...byDay.keys()]
  const active = day && byDay.has(day) ? day : days[0] ?? null
  const fmtDay = (k: string) => new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${k}T12:00:00Z`))
  const fmtTime = (iso: string) => new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZone: tz }).format(new Date(iso))
  return (
    <fieldset className="space-y-3">
      <legend className="flex w-full items-center justify-between text-sm font-semibold text-cs-ink">
        <span className="inline-flex items-center gap-1.5"><CalendarClock className="h-4 w-4" aria-hidden />Pick a time</span>
        <span className="text-xs font-normal text-cs-ink-soft">Times in {tz.replace(/_/g, ' ')}</span>
      </legend>
      <div className="flex items-center gap-2">
        <button type="button" aria-label="Earlier dates" disabled={from <= Date.now() + 60_000} onClick={() => setFrom(Math.max(Date.now(), from - 14 * 86_400_000))} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-cs-grid text-cs-ink disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
        <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Dates">
          {slots === null ? <span className="inline-flex items-center gap-2 text-sm text-cs-ink-soft"><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />Loading times…</span>
            : days.length === 0 ? <span className="text-sm text-cs-ink-soft">No free times in these two weeks — try the next ones.</span>
            : days.map((d) => (
              <button key={d} type="button" role="tab" aria-selected={d === active} onClick={() => setDay(d)} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold ${d === active ? 'border-cs-accent bg-cs-accent text-cs-accent-ink' : 'border-cs-grid text-cs-ink-soft hover:text-cs-ink'}`}>{fmtDay(d)}</button>
            ))}
        </div>
        <button type="button" aria-label="Later dates" onClick={() => setFrom(from + 14 * 86_400_000)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-cs-grid text-cs-ink"><ChevronRight className="h-4 w-4" /></button>
      </div>
      {active && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Start time">
          {byDay.get(active)!.map((s) => (
            <button key={s} type="button" role="radio" aria-checked={value === s} onClick={() => onChange(value === s ? null : s)} className={`rounded-xl border px-2 py-2 text-sm tabular-nums ${value === s ? 'border-cs-accent bg-cs-accent/10 font-semibold text-cs-accent-text' : 'border-cs-grid text-cs-ink hover:border-cs-accent/50'}`}>{fmtTime(s)}</button>
          ))}
        </div>
      )}
    </fieldset>
  )
}

export function BuyBox(p: Props) {
  const router = useRouter()
  const { act, busy } = useCart()
  const [variant, setVariant] = useState<string | null>(p.variants[0]?.id ?? null)
  const [qty, setQty] = useState(1)
  const [slot, setSlot] = useState<string | null>(null)
  const v = p.variants.find((x) => x.id === variant)
  const price = v ? v.price : p.price
  const stock = v ? v.stock ?? null : p.stock
  const soldOut = p.kind === 'physical' && stock != null && stock <= 0
  const maxQty = p.kind === 'physical' ? Math.min(20, stock ?? 20) : 1
  const needsSlot = p.kind === 'service' && !slot

  const add = async (thenCheckout: boolean) => {
    const ok = await act({ action: 'add', product_id: p.productId, variant_id: variant, qty, service_slot: slot })
    if (!ok) return
    if (thenCheckout) router.push('/marketplace/checkout')
    else openCartDrawer()
  }

  // CORE-038: no price / Add to cart / Buy now inside the phone apps (store rules).
  return (
    <NativePurchaseGate>
    <div className="space-y-5">
      <p className="text-3xl font-bold tabular-nums text-cs-ink">{formatMinor(price * qty, p.currency)}</p>
      {p.variants.length > 0 && (
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-cs-ink">Option</legend>
          <div className="flex flex-wrap gap-2">
            {p.variants.map((x) => (
              <button key={x.id} type="button" aria-pressed={variant === x.id} onClick={() => { setVariant(x.id); setQty(1) }} disabled={x.stock != null && x.stock <= 0}
                className={`rounded-full border px-4 py-2 text-sm ${variant === x.id ? 'border-cs-accent bg-cs-accent/10 font-semibold text-cs-accent-text' : 'border-cs-grid text-cs-ink'} disabled:opacity-40`}>
                {x.name}{x.stock != null && x.stock <= 0 ? ' (sold out)' : ''}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      {p.kind === 'physical' && !soldOut && (
        <div className="flex items-center gap-3">
          <label htmlFor="mkt-qty" className="text-sm font-semibold text-cs-ink">Quantity</label>
          <select id="mkt-qty" value={qty} onChange={(e) => setQty(Number(e.target.value))} className="h-10 rounded-xl border border-cs-grid bg-cs-sheet px-3 text-sm text-cs-ink">
            {Array.from({ length: Math.max(1, maxQty) }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          {stock != null && stock <= 5 && <span className="text-xs font-medium text-amber-700 dark:text-amber-400">Only {stock} left</span>}
        </div>
      )}
      {p.kind === 'service' && <SlotPicker slug={p.slug} value={slot} onChange={setSlot} />}
      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="button" disabled={busy || soldOut || needsSlot} onClick={() => add(false)} className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-cs-accent px-6 text-[15px] font-semibold text-cs-accent-ink shadow-lg shadow-[#2f5be7]/25 hover:brightness-110 disabled:opacity-50 disabled:shadow-none">
          {busy && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />}
          {soldOut ? 'Sold out' : needsSlot ? 'Pick a time first' : 'Add to cart'}
        </button>
        {!soldOut && !needsSlot && (
          <button type="button" disabled={busy} onClick={() => add(true)} className="inline-flex h-12 flex-1 items-center justify-center rounded-full border border-cs-ink/20 bg-cs-sheet px-6 text-[15px] font-semibold text-cs-ink hover:border-cs-accent disabled:opacity-50">Buy now</button>
        )}
      </div>
    </div>
    </NativePurchaseGate>
  )
}
