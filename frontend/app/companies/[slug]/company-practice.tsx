'use client'

/**
 * "Practise the <exam> pattern" block on a company page: one card per active
 * company exam pattern with Easy / Moderate / Tough buttons. Starting a run
 * needs a signed-in account (the runner lives under /dashboard).
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, Clock, ListChecks, Timer } from 'lucide-react'
import { LEVEL_LABEL, type PracticeLevel } from '@/lib/company-tests/types'
import { useT } from '@/lib/i18n/client'

interface PatternCard {
  id: string
  examName: string
  verified: boolean
  lastReviewed: string | null
  sourceUrl: string | null
  negativeMarking: number
  cutoffPercent: number
  totals: { questions: number; minutes: number }
  sections: { name: string; questionCount: number; timeMinutes: number }[]
  levels: { level: PracticeLevel; ready: boolean; complete: boolean }[]
}

const card = 'rounded-3xl border border-cs-grid bg-cs-sheet p-6 shadow-[0_1px_2px_rgba(15,23,41,0.04),0_8px_24px_-12px_rgba(15,23,41,0.10)] dark:shadow-none'

export function CompanyPractice({ companySlug, companyName }: { companySlug: string; companyName: string }) {
  const { t, td, rich } = useT()
  const [items, setItems] = useState<PatternCard[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let live = true
    fetch(`/api/company-tests?company=${encodeURIComponent(companySlug)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => { if (live) setItems(Array.isArray(d.items) ? d.items : []) })
      .catch(() => { if (live) setError(true) })
    return () => { live = false }
  }, [companySlug])

  if (error) {
    return (
      <section className={card} aria-labelledby="practice-heading">
        <h2 id="practice-heading" className="text-lg font-bold text-cs-ink">{t('publicPages.practiceTests')}</h2>
        <p className="mt-2 text-sm text-cs-ink-soft">{t('publicPages.practiceLoadFailed')}</p>
      </section>
    )
  }
  if (items === null) {
    return (
      <section className={card} aria-busy="true" aria-label={t('publicPages.practiceLoading')}>
        <div className="h-5 w-48 animate-pulse rounded bg-cs-grid motion-reduce:animate-none" />
        <div className="mt-4 h-11 w-full animate-pulse rounded-xl bg-cs-grid motion-reduce:animate-none" />
      </section>
    )
  }
  if (items.length === 0) return null

  return (
    <div className="space-y-4" id="practice">
      {items.map((p) => (
        <section key={p.id} className={card} aria-labelledby={`practice-${p.id}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id={`practice-${p.id}`} className="text-lg font-bold text-cs-ink">{t('publicPages.practisePattern', { exam: p.examName })}</h2>
              <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-cs-ink-soft">
                <span className="inline-flex items-center gap-1"><ListChecks className="h-3.5 w-3.5" aria-hidden /> {t('publicPages.practiceQuestions', { count: p.totals.questions })}</span>
                <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" aria-hidden /> {t('publicPages.practiceMinutes', { count: p.totals.minutes })}</span>
                <span>{p.negativeMarking > 0 ? t('publicPages.practiceNegative', { marks: `−${p.negativeMarking}` }) : t('publicPages.practiceNoNegative')}</span>
                <span>{t('publicPages.practiceCutoff', { pct: `${p.cutoffPercent}%` })}</span>
              </p>
            </div>
          </div>

          <ol className="mt-4 grid gap-2 sm:grid-cols-2">
            {p.sections.map((s, i) => (
              <li key={i} className="flex items-center justify-between gap-3 rounded-xl bg-cs-accent/5 px-3 py-2 text-sm text-cs-ink">
                <span className="min-w-0 truncate">{s.name}</span>
                <span className="inline-flex shrink-0 items-center gap-1 tabular-nums text-cs-ink-soft"><Timer className="h-3.5 w-3.5" aria-hidden />{s.questionCount} · {s.timeMinutes}m</span>
              </li>
            ))}
          </ol>

          <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label={t('publicPages.practiseAtLevel', { exam: p.examName })}>
            {p.levels.map((l) => l.ready ? (
              <Link
                key={l.level}
                href={`/dashboard/company-tests/${p.id}?level=${l.level}`}
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-cs-accent px-5 text-sm font-semibold text-cs-accent-ink transition-colors duration-200 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cs-accent"
              >
                {td(`publicPages.level:${l.level}`, LEVEL_LABEL[l.level])}
              </Link>
            ) : (
              <span key={l.level} className="inline-flex min-h-11 items-center rounded-full border border-cs-grid px-5 text-sm text-cs-ink-soft" title={t('publicPages.practiceBeingPrepared')}>
                {td(`publicPages.level:${l.level}`, LEVEL_LABEL[l.level])} · {t('publicPages.practiceComingSoon')}
              </span>
            ))}
          </div>
          <p className="mt-3 text-xs text-cs-ink-soft">{t('publicPages.practiceSignIn')}</p>

          {!p.verified ? (
            <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>
                {t('publicPages.practiceUnverified', { company: companyName })}
                {p.sourceUrl ? <> {rich('publicPages.practiceCheckOfficial', { link: <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer" className="font-semibold underline">{t('publicPages.practiceOfficialPage')}</a> })}</> : null}
              </span>
            </p>
          ) : p.lastReviewed ? (
            <p className="mt-3 text-xs text-cs-ink-soft">{t('publicPages.practiceLastChecked', { date: p.lastReviewed })}</p>
          ) : null}
        </section>
      ))}
    </div>
  )
}
