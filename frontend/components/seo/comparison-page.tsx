/**
 * Reusable "CodeSpectra vs X" layout (server component). All copy comes from
 * an admin-written ComparisonPage (Admin → Settings → SEO & AI search): an
 * answer-first verdict, a semantic comparison table, "best for" definitions
 * and the sources the competitor facts were taken from. Nothing is generated.
 */
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import type { ComparisonPage as Comparison } from '@/lib/seo/settings-shared'
import { AnswerSummary } from './answer-summary'

export function ComparisonPageView({ c }: { c: Comparison }) {
  return (
    <article className="mx-auto max-w-[1000px] space-y-10 px-4 py-12 sm:px-6 lg:px-8">
      {c.summary ? <AnswerSummary label="The short answer" answer={c.summary} /> : null}

      {c.rows.length > 0 && (
        <section aria-labelledby="cmp-table">
          <h2 id="cmp-table" className="cs-heading mb-4 text-3xl">Feature by feature</h2>
          <div className="overflow-x-auto rounded-3xl border border-cs-grid">
            <table className="w-full min-w-[560px] text-left text-[15px]">
              <caption className="sr-only">CodeSpectra compared with {c.competitor}</caption>
              <thead className="bg-cs-sheet text-cs-ink">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Feature</th>
                  <th scope="col" className="px-4 py-3 font-semibold">CodeSpectra</th>
                  <th scope="col" className="px-4 py-3 font-semibold">{c.competitor}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cs-grid">
                {c.rows.map((r) => (
                  <tr key={r.feature}>
                    <th scope="row" className="px-4 py-3 align-top font-medium text-cs-ink">{r.feature}</th>
                    <td className="px-4 py-3 align-top text-cs-ink-soft">{r.codespectra || '—'}</td>
                    <td className="px-4 py-3 align-top text-cs-ink-soft">{r.competitor || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {(c.best_for_codespectra || c.best_for_competitor) && (
        <section aria-labelledby="cmp-fit">
          <h2 id="cmp-fit" className="cs-heading mb-4 text-3xl">Which one fits</h2>
          <dl className="grid gap-4 sm:grid-cols-2">
            {c.best_for_codespectra ? (
              <div className="rounded-3xl border border-cs-grid bg-cs-sheet p-5">
                <dt className="font-semibold text-cs-ink">Choose CodeSpectra if</dt>
                <dd className="mt-2 text-cs-ink-soft">{c.best_for_codespectra}</dd>
              </div>
            ) : null}
            {c.best_for_competitor ? (
              <div className="rounded-3xl border border-cs-grid bg-cs-sheet p-5">
                <dt className="font-semibold text-cs-ink">Choose {c.competitor} if</dt>
                <dd className="mt-2 text-cs-ink-soft">{c.best_for_competitor}</dd>
              </div>
            ) : null}
          </dl>
        </section>
      )}

      <section aria-labelledby="cmp-sources" className="rounded-3xl border border-cs-grid bg-cs-sheet p-5 text-sm text-cs-ink-soft">
        <h2 id="cmp-sources" className="font-semibold text-cs-ink">Sources and method</h2>
        <p className="mt-1">
          CodeSpectra facts come from our own product. {c.competitor} facts come from the public pages below, checked on{' '}
          <time dateTime={c.updated_at}>{c.updated_at.slice(0, 10)}</time>. Spotted something out of date? See our{' '}
          <Link href="/editorial-policy" className="text-cs-accent-text underline underline-offset-4">editorial policy</Link>.
        </p>
        {c.sources.length > 0 && (
          <ul className="mt-3 space-y-1">
            {c.sources.map((u) => (
              <li key={u}>
                <a href={u} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 break-all text-cs-accent-text hover:underline">
                  <cite className="not-italic">{u}</cite><ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  )
}
