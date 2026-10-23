'use client'

/**
 * "Ask about events & news" (POST /api/public/ask). Searches public content
 * only — daily digests, tech news, the events feed, Learn and the help docs —
 * and, when AI is available, answers in the page language with numbered
 * citations linking to the pages. "Search only" (or AI off / capped) shows
 * the plain hybrid search results. Anonymous visitors solve Turnstile after a
 * few questions a day.
 */
import { useId, useState } from 'react'
import Link from 'next/link'
import { Loader2, Search, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TurnstileWidget } from '@/components/auth/turnstile-widget'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useT } from '@/lib/i18n/client'
import { useApiError } from '@/lib/i18n/use-api-error'
import { cn } from '@/lib/utils'

interface Citation { n: number; title: string; url: string; type: string; snippet: string }
interface AskResponse { mode: 'ai' | 'search'; fallback: string | null; answer: string | null; cited: number[]; results: Citation[]; captcha_next?: boolean }

/** "[1][2]" in the answer → links to the cited results. */
function AnswerText({ text, results }: { text: string; results: Citation[] }) {
  const parts = text.split(/(\[\d{1,2}\])/g)
  return (
    <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
      {parts.map((p, i) => {
        const m = /^\[(\d{1,2})\]$/.exec(p)
        const c = m ? results.find((r) => r.n === Number(m[1])) : null
        return c ? <Link key={i} href={c.url} className="mx-0.5 rounded text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={c.title}>[{c.n}]</Link> : <span key={i}>{p}</span>
      })}
    </p>
  )
}

export function AskBox({ className, locale: forced }: { className?: string; locale?: 'en' | 'hi' | 'te' }) {
  const { t, td, locale } = useT()
  const apiError = useApiError()
  const id = useId()
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState<'ask' | 'search' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [res, setRes] = useState<AskResponse | null>(null)
  const [needCaptcha, setNeedCaptcha] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  const [reset, setReset] = useState(0)
  const lang = forced ?? (locale === 'hi' || locale === 'te' ? locale : 'en')

  async function go(mode: 'ask' | 'search') {
    const text = q.trim()
    if (text.length < 2) return setError(t('public.askTooShort'))
    setError(null)
    setBusy(mode)
    try {
      const r = await csrfFetch('/api/public/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: text, mode, locale: lang, ...(token ? { turnstileToken: token } : {}) }),
      })
      const d = await r.json().catch(() => ({}))
      if (r.status === 403 && d?.captcha) { setNeedCaptcha(true); setError(t('public.askCaptcha')); return }
      if (!r.ok) throw new Error(apiError(d, t('public.askError')))
      setRes(d as AskResponse)
      setNeedCaptcha(!!d.captcha_next)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
      if (token) { setToken(null); setReset((k) => k + 1) }
    }
  }

  return (
    <section aria-labelledby={`${id}-h`} className={cn('rounded-3xl border border-border/70 bg-card p-5 shadow-[0_1px_2px_rgba(15,23,41,0.04),0_8px_24px_-14px_rgba(15,23,41,0.10)] dark:shadow-none', className)}>
      <h2 id={`${id}-h`} className="flex items-center gap-2 text-lg font-semibold text-foreground"><Sparkles className="h-5 w-5 text-primary" aria-hidden />{t('public.askTitle')}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t('public.askBody')}</p>
      <form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); void go('ask') }}>
        <label htmlFor={`${id}-q`} className="sr-only">{t('public.askLabel')}</label>
        <Input id={`${id}-q`} value={q} maxLength={300} onChange={(e) => setQ(e.target.value)} placeholder={t('public.askPlaceholder')} className="min-w-0 flex-1" />
        <div className="flex gap-2">
          <Button type="submit" disabled={!!busy || (needCaptcha && !token)}>{busy === 'ask' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="mr-2 h-4 w-4" aria-hidden />}{t('public.askButton')}</Button>
          <Button type="button" variant="outline" disabled={!!busy || (needCaptcha && !token)} onClick={() => void go('search')}>{busy === 'search' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Search className="mr-2 h-4 w-4" aria-hidden />}{t('public.askSearch')}</Button>
        </div>
      </form>
      {needCaptcha && <div className="mt-3"><TurnstileWidget onVerify={setToken} resetKey={reset} /></div>}
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
      <div aria-live="polite">
        {res && (
          <div className="mt-4 space-y-4">
            {res.answer ? (
              <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
                <AnswerText text={res.answer} results={res.results} />
                <p className="mt-2 text-xs text-muted-foreground">{t('public.askAiNote')}</p>
              </div>
            ) : res.fallback && res.fallback !== 'search_requested' && res.results.length > 0 ? (
              <p className="text-xs text-muted-foreground">{td(`public.askFallback:${res.fallback}`, t('public.askFallbackGeneric'))}</p>
            ) : null}
            {res.results.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('public.askNoResults')}</p>
            ) : (
              <ol className="space-y-2">
                {res.results.map((r) => (
                  <li key={r.n} className={cn('rounded-2xl border border-border p-3', res.cited.includes(r.n) && 'border-primary/40')}>
                    <Link href={r.url} className="text-sm font-semibold text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <span className="mr-1 text-primary">[{r.n}]</span>{r.title}
                    </Link>
                    <p className="mt-0.5 text-xs text-muted-foreground">{td(`public.askType:${r.type}`, r.type)}</p>
                    <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">{r.snippet}</p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
