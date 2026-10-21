/**
 * Server-rendered FAQ (native <details>, so every answer is in the HTML for
 * crawlers, answer engines and screen readers) + FAQPage JSON-LD.
 */
import { ChevronDown } from 'lucide-react'
import { faqJsonLd, type QA } from '@/lib/seo/jsonld'
import { JsonLd } from './json-ld'

export function FaqList({ items, schema = true, idPrefix = 'faq', className, inLanguage }: { items: QA[]; schema?: boolean; idPrefix?: string; className?: string; inLanguage?: string }) {
  if (!items.length) return null
  return (
    <div className={className}>
      {schema ? <JsonLd data={faqJsonLd(items, inLanguage)} /> : null}
      <div className="space-y-3">
        {items.map((item, i) => (
          <details key={item.q} id={`${idPrefix}-${i}`} className="group overflow-hidden rounded-2xl border border-cs-grid bg-cs-sheet">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 text-left transition-colors duration-200 hover:bg-cs-accent/5 [&::-webkit-details-marker]:hidden">
              <h3 className="text-base font-semibold text-cs-ink">{item.q}</h3>
              <ChevronDown aria-hidden className="h-5 w-5 shrink-0 text-cs-ink-soft transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none" />
            </summary>
            <p className="max-w-[65ch] px-5 pb-5 text-[15px] leading-relaxed text-cs-ink-soft">{item.a}</p>
          </details>
        ))}
      </div>
    </div>
  )
}

/** Titled FAQ block for marketing pages. */
export function FaqSection({ title = 'Frequently asked questions', items, id = 'faq', inLanguage }: { title?: string; items: QA[]; id?: string; inLanguage?: string }) {
  if (!items.length) return null
  return (
    <section className="border-b border-cs-grid" aria-labelledby={`${id}-heading`}>
      <div className="mx-auto max-w-[900px] px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
        <h2 id={`${id}-heading`} className="cs-heading mb-8 text-3xl sm:text-4xl">{title}</h2>
        <FaqList items={items} idPrefix={id} inLanguage={inLanguage} />
      </div>
    </section>
  )
}
