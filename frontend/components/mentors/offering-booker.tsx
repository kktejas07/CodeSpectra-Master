'use client'

/** Pick a session type, then a time — booking and payment are the marketplace's own (BuyBox → cart → checkout). */
import { useState } from 'react'
import { Clock } from 'lucide-react'
import { BuyBox } from '@/components/marketplace/buy-box'
import { formatMinor } from '@/lib/marketplace/pricing'
import { OFFERING_LABELS, type PublicOffering } from '@/lib/mentors/types'

export function OfferingBooker({ offerings, cancelHours }: { offerings: PublicOffering[]; cancelHours: number }) {
  const [id, setId] = useState(offerings[0]?.product_id ?? '')
  const o = offerings.find((x) => x.product_id === id) ?? offerings[0]
  if (!o) return null
  return (
    <div className="space-y-5">
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-cs-ink">Session type</legend>
        <div className="grid gap-2">
          {offerings.map((x) => (
            <button key={x.product_id} type="button" aria-pressed={x.product_id === o.product_id} onClick={() => setId(x.product_id)}
              className={`flex min-h-[44px] items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cs-accent/40 ${x.product_id === o.product_id ? 'border-cs-accent bg-cs-accent/10' : 'border-cs-grid hover:border-cs-accent/50'}`}>
              <span className="min-w-0">
                <span className="block font-semibold text-cs-ink">{OFFERING_LABELS[x.type]}</span>
                <span className="mt-0.5 inline-flex items-center gap-1 text-xs text-cs-ink-soft"><Clock className="h-3.5 w-3.5" aria-hidden />{x.duration_min} min · online</span>
              </span>
              <span className="shrink-0 font-semibold tabular-nums text-cs-ink">{formatMinor(x.price, x.currency)}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <p className="text-sm leading-relaxed text-cs-ink-soft">{o.description_md.slice(0, 600)}</p>
      <BuyBox key={o.product_id} productId={o.product_id} slug={o.slug} kind="service" currency={o.currency} price={o.price} variants={[]} stock={null}
        service={{ duration_min: o.duration_min, timezone: o.timezone, mode: o.mode }} />
      <p className="text-xs text-cs-ink-soft">Times are shown in your time zone. You pay at checkout; the meeting link and a calendar invite arrive by e-mail. Free cancellation up to {cancelHours} hours before the session.</p>
    </div>
  )
}
