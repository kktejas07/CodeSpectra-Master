import Link from 'next/link'
import { Star, Package, Download, CalendarClock } from 'lucide-react'
import type { ProductCard as Card } from '@/lib/marketplace/catalog'
import { formatMinor } from '@/lib/marketplace/pricing'

const KIND_ICON = { physical: Package, digital: Download, service: CalendarClock }
const KIND_TEXT = { physical: 'Ships to you', digital: 'Instant download', service: 'Book a time' }

export function Stars({ value, className }: { value: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-0.5 ${className ?? ''}`} aria-label={`${value.toFixed(1)} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} aria-hidden className={`h-3.5 w-3.5 ${value >= i - 0.25 ? 'fill-amber-400 text-amber-400' : 'text-cs-grid'}`} />
      ))}
    </span>
  )
}

export function ProductCard({ p }: { p: Card }) {
  const Icon = KIND_ICON[p.kind]
  return (
    <Link
      href={`/marketplace/p/${p.slug}`}
      className="group flex min-w-0 flex-col overflow-hidden rounded-3xl border border-cs-grid bg-cs-sheet shadow-[0_1px_2px_rgba(15,23,41,0.04),0_8px_24px_-12px_rgba(15,23,41,0.10)] transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-0.5 hover:border-cs-accent/40 motion-reduce:hover:translate-y-0 dark:shadow-none"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-cs-paper">
        {p.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.image} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02] motion-reduce:group-hover:scale-100" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-cs-ink-soft"><Icon className="h-10 w-10" aria-hidden /></div>
        )}
        {!p.in_stock && <span className="absolute left-3 top-3 rounded-full bg-cs-sheet/95 px-2.5 py-1 text-xs font-semibold text-cs-ink">Sold out</span>}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <p className="inline-flex items-center gap-1 text-xs text-cs-ink-soft"><Icon className="h-3.5 w-3.5" aria-hidden />{KIND_TEXT[p.kind]}</p>
        <h3 className="line-clamp-2 font-semibold tracking-tight text-cs-ink group-hover:text-cs-accent-text">{p.title}</h3>
        {p.seller && <p className="text-xs text-cs-ink-soft">by {p.seller.name}</p>}
        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <p className="text-base font-bold tabular-nums text-cs-ink">
            {formatMinor(p.price, p.currency)}
            {p.compare_at_price && p.compare_at_price > p.price ? <span className="ml-1.5 text-xs font-normal text-cs-ink-soft line-through">{formatMinor(p.compare_at_price, p.currency)}</span> : null}
          </p>
          {p.rating && p.rating.count > 0 ? <span className="inline-flex items-center gap-1 text-xs text-cs-ink-soft"><Stars value={p.rating.avg} /><span className="tabular-nums">({p.rating.count})</span></span> : null}
        </div>
      </div>
    </Link>
  )
}
