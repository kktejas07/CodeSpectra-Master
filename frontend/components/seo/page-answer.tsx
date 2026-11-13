/**
 * The answer-first block for a public hub page: one or two sentences that say
 * what the page is, in the page language, in server-rendered HTML — the part
 * search engines and AI assistants quote. Copy: seo.json `answer:<path>`.
 * Renders nothing when a page has no answer yet.
 */
import { AnswerSummary } from '@/components/seo/answer-summary'
import type { Locale } from '@/lib/i18n/config'
import { publicT } from '@/lib/i18n/public-server'

export function PageAnswer({ path, locale, answer, className = 'pt-10' }: {
  path: string
  locale: Locale
  /** Overrides the catalog copy (pages whose answer is built from data). */
  answer?: string
  className?: string
}) {
  const t = publicT(locale)
  const text = answer ?? t.dyn(`seo.answer:${path}`, '')
  if (!text) return null
  return (
    <div className={`mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8 ${className}`}>
      <AnswerSummary label={t('seo.answerLabel')} answer={text} />
    </div>
  )
}
