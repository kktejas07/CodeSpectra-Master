/** Visual breadcrumb trail + matching BreadcrumbList JSON-LD (server component). */
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { breadcrumbJsonLd, type Crumb } from '@/lib/seo/jsonld'
import { JsonLd } from './json-ld'

export function Breadcrumbs({ items, site, className = '', visible = true, home = { name: 'Home', path: '/' }, ariaLabel = 'Breadcrumb' }: { items: Crumb[]; site: string; className?: string; visible?: boolean; /** Localized home crumb (/hi, /te pages). */ home?: Crumb; ariaLabel?: string }) {
  const trail: Crumb[] = [home, ...items]
  return (
    <>
      <JsonLd data={breadcrumbJsonLd(trail, site)} />
      {visible ? (
        <nav aria-label={ariaLabel} className={`text-sm text-cs-ink-soft ${className}`}>
          <ol className="flex flex-wrap items-center gap-1">
            {trail.map((c, i) => (
              <li key={c.path} className="flex items-center gap-1">
                {i > 0 ? <ChevronRight className="h-3 w-3" aria-hidden /> : null}
                {i === trail.length - 1 ? (
                  <span aria-current="page" className="line-clamp-1 max-w-56 text-cs-ink sm:max-w-xs">{c.name}</span>
                ) : (
                  <Link href={c.path} className="hover:text-cs-ink">{c.name}</Link>
                )}
              </li>
            ))}
          </ol>
        </nav>
      ) : null}
    </>
  )
}
