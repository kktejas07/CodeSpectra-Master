'use client'

/**
 * "Mentors who can help" on the study plan (lib/assistants/mentors): up to three
 * mentors picked from the learner's focus areas, target company, language and
 * time zone. Hidden when the assistant is off; loads after the plan.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { GraduationCap, Star } from 'lucide-react'
import { useT } from '@/lib/i18n/client'
import { Panel } from '@/components/app/page-kit'
import { Button } from '@/components/ui/button'
import type { MentorMatch, MatchReason } from '@/lib/assistants/mentors/match'
import { localizedPath } from '@/lib/i18n/public-paths'

/** SEO-047: stored mentor languages ("hindi", "te") → the name in the reader's language. */
const LANGUAGE_CODES: Record<string, string> = { english: 'en', hindi: 'hi', telugu: 'te', tamil: 'ta', kannada: 'kn', malayalam: 'ml', marathi: 'mr', bengali: 'bn', gujarati: 'gu', punjabi: 'pa', urdu: 'ur', odia: 'or' }
export function languageName(value: string, locale: string): string {
  const v = value.trim().toLowerCase()
  const code = LANGUAGE_CODES[v] ?? (/^[a-z]{2,3}$/.test(v) ? v : null)
  if (code) {
    try {
      const name = new Intl.DisplayNames([locale], { type: 'language' }).of(code)
      if (name && name.toLowerCase() !== code) return name
    } catch { /* old browser: fall through */ }
  }
  return value ? value[0].toUpperCase() + value.slice(1) : value
}

export function MentorMatches() {
  const { t, fmt, locale } = useT()
  const [data, setData] = useState<{ enabled: boolean; matches: MentorMatch[] } | null | 'error'>(null)

  useEffect(() => {
    let live = true
    fetch('/api/assistants/mentor-matches', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => { if (live) setData({ enabled: !!d.enabled, matches: Array.isArray(d.matches) ? d.matches : [] }) })
      .catch(() => { if (live) setData('error') })
    return () => { live = false }
  }, [])

  if (data === null) return <div className="mt-5 h-32 animate-pulse rounded-3xl bg-muted motion-reduce:animate-none" aria-hidden />
  if (data === 'error' || !data.enabled) return null

  const reason = (r: MatchReason) => {
    switch (r.kind) {
      case 'skill': return t('dashboard.mmReasonSkill', { value: r.value })
      case 'company': return t('dashboard.mmReasonCompany', { value: r.value })
      case 'language': return t('dashboard.mmReasonLanguage', { value: languageName(String(r.value), locale) })
      case 'timezone': return t('dashboard.mmReasonTimezone')
      case 'rating': return t('dashboard.mmReasonRating', { value: fmt.number(r.value) })
    }
  }

  return (
    <Panel className="mt-5 p-5" aria-labelledby="mentor-matches-title">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id="mentor-matches-title" className="text-lg font-semibold text-foreground">{t('dashboard.mmTitle')}</h2>
          <p className="text-sm text-muted-foreground">{t('dashboard.mmDesc')}</p>
        </div>
        <Link href={localizedPath('/mentors', locale)} className="text-sm font-medium text-primary underline-offset-2 hover:underline focus-visible:underline">{t('dashboard.mmBrowse')}</Link>
      </div>
      {data.matches.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('dashboard.mmEmpty')}</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-3">
          {data.matches.map((m) => (
            <li key={m.slug} className="flex min-w-0 flex-col rounded-2xl border border-border/70 p-4">
              <div className="flex min-w-0 items-center gap-3">
                {m.avatar_url
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={m.avatar_url} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
                  : <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><GraduationCap className="h-5 w-5" aria-hidden /></span>}
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">{m.display_name}</p>
                  <p className="truncate text-xs text-muted-foreground">{m.headline}</p>
                </div>
              </div>
              {m.rating.count > 0 && (
                <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground"><Star className="h-3.5 w-3.5 fill-current text-amber-500" aria-hidden />{t('dashboard.mmRating', { value: fmt.number(m.rating.avg, { maximumFractionDigits: 1 }), count: m.rating.count })}</p>
              )}
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {m.reasons.slice(0, 3).map((r, i) => <li key={i} className="rounded-full bg-muted px-2 py-0.5 text-xs text-foreground">{reason(r)}</li>)}
              </ul>
              {m.offering && (
                <p className="mt-3 text-sm text-foreground">{t('dashboard.mmOffering', { title: m.offering.title, minutes: m.offering.duration_min, price: fmt.currency(m.offering.price / 100, m.offering.currency) })}</p>
              )}
              <div className="mt-auto pt-3">
                <Button asChild variant="outline" size="sm" className="w-full rounded-full">
                  <Link href={localizedPath(`/mentors/${encodeURIComponent(m.slug)}`, locale)}>{t('dashboard.mmBook')}</Link>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
