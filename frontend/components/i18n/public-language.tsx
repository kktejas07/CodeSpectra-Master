'use client'

/**
 * Language controls for the public site (header, mobile menu, footer) and the
 * first-visit suggestion banner. Public pages are cached per URL, so the
 * language lives in the path (/hi/…, /te/…; lib/i18n/public-paths.ts):
 * choosing one navigates to the same page in that language and stores the
 * choice in the `cs_locale` cookie (and the profile when signed in) so the
 * signed-in app follows it. Nothing here redirects on its own.
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Check, ChevronDown, Languages, X } from 'lucide-react'
import { LOCALES, LOCALE_COOKIE, LOCALE_META, type Locale } from '@/lib/i18n/config'
import { persistLocale, useT } from '@/lib/i18n/client'
import { matchAcceptLanguage } from '@/lib/i18n/negotiate'
import { isLocalizedPath, localizedPath, splitLocalePath, switchLocaleHref } from '@/lib/i18n/public-paths'
import { cn } from '@/lib/utils'

/** `lp('/pricing')` → '/hi/pricing' on a Hindi page; untranslated targets keep their English URL. */
export function useLocalizedHref(): (href: string) => string {
  const { locale } = useT()
  return useCallback((href: string) => (href.startsWith('/') ? localizedPath(href, locale) : href), [locale])
}

function useChooseLocale() {
  const router = useRouter()
  const pathname = usePathname() || '/'
  return useCallback(
    (target: Locale, e?: React.MouseEvent) => {
      // Cookie first (synchronous), profile save in the background.
      void persistLocale(target)
      const href = switchLocaleHref(pathname + (typeof window !== 'undefined' ? window.location.search : ''), target)
      if (href === pathname) {
        e?.preventDefault()
        router.refresh()
      }
    },
    [pathname, router],
  )
}

function useHrefFor() {
  const pathname = usePathname() || '/'
  const [search, setSearch] = useState('')
  useEffect(() => setSearch(window.location.search), [pathname])
  return (l: Locale) => switchLocaleHref(pathname + search, l)
}

/** Compact header menu: current language + a short list of links. */
export function PublicLanguageMenu({ className }: { className?: string }) {
  const { t, locale } = useT()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const id = useId()
  const hrefFor = useHrefFor()
  const choose = useChooseLocale()

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); ref.current?.querySelector('button')?.focus() } }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={id}
        aria-label={`${t('common.language')}: ${LOCALE_META[locale].native}`}
        className="inline-flex h-10 items-center gap-1.5 rounded-md px-2.5 text-sm font-semibold text-cs-ink-soft transition-colors hover:text-cs-ink focus-visible:outline-2 focus-visible:outline-cs-accent"
      >
        <Languages className="h-4 w-4" aria-hidden />
        <span lang={locale}>{LOCALE_META[locale].native}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform motion-reduce:transition-none', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <ul id={id} className="absolute right-0 top-full z-[60] mt-1 min-w-40 rounded-xl border border-cs-grid bg-cs-sheet p-1 shadow-lg">
          {LOCALES.map((l) => (
            <li key={l}>
              <Link
                href={hrefFor(l)}
                hrefLang={l}
                lang={l}
                aria-current={l === locale ? 'true' : undefined}
                onClick={(e) => { setOpen(false); choose(l, e) }}
                className="flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm text-cs-ink hover:bg-cs-accent/10"
              >
                <Check className={cn('h-4 w-4 text-cs-accent-text', l === locale ? 'opacity-100' : 'opacity-0')} aria-hidden />
                {LOCALE_META[l].native}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Inline row of links (mobile menu, footer). Three short native names fit at 360px. */
export function PublicLanguageLinks({ className }: { className?: string }) {
  const { t, locale } = useT()
  const hrefFor = useHrefFor()
  const choose = useChooseLocale()
  return (
    <nav aria-label={t('common.language')} className={cn('flex flex-wrap items-center gap-1.5', className)}>
      <Languages className="mr-1 h-4 w-4 text-cs-ink-soft" aria-hidden />
      {LOCALES.map((l) => (
        <Link
          key={l}
          href={hrefFor(l)}
          hrefLang={l}
          lang={l}
          aria-current={l === locale ? 'true' : undefined}
          onClick={(e) => choose(l, e)}
          className={cn(
            'inline-flex min-h-9 items-center rounded-full border px-3 text-sm transition-colors',
            l === locale ? 'border-cs-accent bg-cs-accent/10 font-semibold text-cs-accent-text' : 'border-cs-grid text-cs-ink-soft hover:text-cs-ink',
          )}
        >
          {LOCALE_META[l].native}
        </Link>
      ))}
    </nav>
  )
}

const DISMISS_KEY = 'cs_lang_hint_dismissed'

function readCookie(name: string): string | null {
  try {
    const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
    return m ? decodeURIComponent(m[1]) : null
  } catch {
    return null
  }
}

/**
 * First visit on an English page whose browser prefers Hindi or Telugu (and
 * no saved choice): offer the translation. Client-only, so cached HTML is the
 * same for everyone and crawlers are never redirected.
 */
export function LanguageSuggestBanner() {
  const { locale } = useT()
  const pathname = usePathname() || '/'
  const [suggest, setSuggest] = useState<Locale | null>(null)
  const hrefFor = useHrefFor()
  const choose = useChooseLocale()

  useEffect(() => {
    if (locale !== 'en' || !isLocalizedPath(splitLocalePath(pathname).path)) { setSuggest(null); return }
    if (readCookie(LOCALE_COOKIE)) return
    try { if (localStorage.getItem(DISMISS_KEY)) return } catch { /* storage blocked: still fine to show */ }
    const prefs = (navigator.languages?.length ? navigator.languages : [navigator.language]).filter(Boolean)
    // Only when hi / te ranks above English in the browser's own list.
    const first = matchAcceptLanguage(prefs.join(','))
    if (first === 'hi' || first === 'te') setSuggest(first)
  }, [locale, pathname])

  if (!suggest) return null
  const dismiss = () => {
    setSuggest(null)
    try { localStorage.setItem(DISMISS_KEY, '1') } catch { /* ignore */ }
  }
  const order: Locale[] = suggest === 'te' ? ['te', 'hi'] : ['hi', 'te']
  return (
    <div role="region" aria-label="Language" className="fixed inset-x-0 top-16 z-40 flex justify-center px-3 pt-2">
      <div className="flex max-w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-full border border-cs-grid bg-cs-sheet/95 py-1.5 pl-4 pr-1.5 text-sm text-cs-ink shadow-lg backdrop-blur">
        <Languages className="h-4 w-4 shrink-0 text-cs-accent-text" aria-hidden />
        <span className="flex flex-wrap items-center gap-x-1.5">
          <span>View in</span>
          {order.map((l, i) => (
            <span key={l} className="inline-flex items-center gap-1.5">
              {i > 0 && <span aria-hidden className="text-cs-ink-soft">/</span>}
              <Link href={hrefFor(l)} hrefLang={l} lang={l} onClick={(e) => { choose(l, e); setSuggest(null) }} className="font-semibold text-cs-accent-text underline-offset-4 hover:underline">
                {LOCALE_META[l].native}
              </Link>
              {i === order.length - 1 && <span className="-ml-1.5">?</span>}
            </span>
          ))}
        </span>
        <button type="button" onClick={dismiss} aria-label="Keep English" title="Keep English" className="inline-flex h-8 w-8 items-center justify-center rounded-full text-cs-ink-soft hover:bg-cs-accent/10 hover:text-cs-ink">
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  )
}
