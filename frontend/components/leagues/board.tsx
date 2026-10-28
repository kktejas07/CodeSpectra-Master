/** League table (server-rendered, theme tokens only). */
import { formatNumber } from '@/lib/i18n/format'
import type { Locale } from '@/lib/i18n/config'
import Link from 'next/link'
import { cn } from '@/lib/utils'

export interface BoardRow { rank: number; name: string; points: number; href?: string | null; sub?: string | null }

export function LeagueBoard({ title, caption, rows, empty, className, locale = 'en' }: { title: string; caption?: string; rows: BoardRow[]; empty: string; className?: string; locale?: Locale }) {
  return (
    <section className={cn('rounded-3xl border border-border/70 bg-card p-5 sm:p-6', className)} aria-labelledby={`b-${title}`}>
      <h2 id={`b-${title}`} className="text-lg font-semibold text-foreground">{title}</h2>
      {caption && <p className="mt-1 text-sm text-muted-foreground">{caption}</p>}
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ol className="mt-4 divide-y divide-border/70">
          {rows.map((r, i) => (
            <li key={`${r.rank}-${i}`} className="flex items-center gap-3 py-2.5">
              <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular-nums', r.rank <= 3 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>{r.rank}</span>
              <div className="min-w-0 flex-1">
                {r.href ? <Link href={r.href} className="truncate font-medium text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{r.name}</Link> : <p className="truncate font-medium text-foreground">{r.name}</p>}
                {r.sub && <p className="truncate text-xs text-muted-foreground">{r.sub}</p>}
              </div>
              <span className="tabular-nums text-sm font-semibold text-foreground">{formatNumber(locale, r.points, { maximumFractionDigits: 1 })}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
