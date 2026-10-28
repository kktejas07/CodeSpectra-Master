'use client'

import { useEffect, useState } from 'react'
import { GLOBAL_ERROR_THEME_SCRIPT } from '@/lib/csp/inline-scripts'
import { splitLocalePath } from '@/lib/i18n/public-paths'
import { LOCALE_COOKIE, toLocale, type Locale } from '@/lib/i18n/config'

/**
 * SEO-060: the root layout (and its I18nProvider) failed, so the text is inline:
 * the language comes from the URL (/hi, /te) or the cs_locale cookie, after mount.
 */
const TEXT: Record<Locale, { title: string; home: string; heading: string; body: string; ref: string; retry: string; goHome: string; status: string }> = {
  en: { title: 'Something went wrong · CodeSpectra', home: 'CodeSpectra home', heading: 'Something went wrong', body: 'CodeSpectra couldn’t load this page. Try again, or go back to the home page.', ref: 'Reference:', retry: 'Try again', goHome: 'Go home', status: 'System status' },
  hi: { title: 'कुछ गड़बड़ हो गई · CodeSpectra', home: 'CodeSpectra होम', heading: 'कुछ गड़बड़ हो गई', body: 'CodeSpectra यह पेज लोड नहीं कर सका। फिर से कोशिश करें, या होम पेज पर वापस जाएँ।', ref: 'संदर्भ:', retry: 'फिर से कोशिश करें', goHome: 'होम पर जाएँ', status: 'सिस्टम स्टेटस' },
  te: { title: 'ఏదో పొరపాటు జరిగింది · CodeSpectra', home: 'CodeSpectra హోమ్', heading: 'ఏదో పొరపాటు జరిగింది', body: 'CodeSpectra ఈ పేజీని లోడ్ చేయలేకపోయింది. మళ్లీ ప్రయత్నించండి, లేదా హోమ్ పేజీకి తిరిగి వెళ్లండి.', ref: 'రిఫరెన్స్:', retry: 'మళ్లీ ప్రయత్నించండి', goHome: 'హోమ్‌కు వెళ్లండి', status: 'సిస్టమ్ స్టేటస్' },
}

function pageLocale(): Locale {
  try {
    const fromPath = splitLocalePath(window.location.pathname).locale
    if (fromPath !== 'en') return fromPath
    const m = new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]+)`).exec(document.cookie)
    return toLocale(m ? decodeURIComponent(m[1]) : null) ?? 'en'
  } catch {
    return 'en'
  }
}

/**
 * Root-level error UI. Replaces the root layout, so no globals.css, fonts or
 * theme class reach it — everything is inline. Colours follow the stored
 * theme (same key and dark default as app/layout.tsx); "system" follows the OS.
 */

const CSS = `
.ge{--bg:#f7f8fc;--fg:#0f172a;--muted:#5b6478;--card:#ffffff;--line:#dfe3ee;--accent:#2f5be7;--accent-soft:rgba(47,91,231,.12)}
@media (prefers-color-scheme:dark){.ge:not(.ge-light){--bg:#0b1020;--fg:#e8ecf7;--muted:#9aa4bd;--card:#121a30;--line:#24304f;--accent:#5b84ff;--accent-soft:rgba(91,132,255,.18)}}
.ge.ge-dark{--bg:#0b1020;--fg:#e8ecf7;--muted:#9aa4bd;--card:#121a30;--line:#24304f;--accent:#5b84ff;--accent-soft:rgba(91,132,255,.18)}
.ge{margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:2rem 1rem;text-align:center;background:var(--bg);color:var(--fg);font-family:system-ui,-apple-system,"Segoe UI",sans-serif;position:relative;overflow:hidden}
.ge-glow{position:absolute;width:28rem;height:28rem;max-width:100vw;border-radius:9999px;background:var(--accent-soft);filter:blur(80px);top:50%;left:50%;transform:translate(-50%,-60%);pointer-events:none}
.ge-in{position:relative;max-width:28rem}
.ge-art{position:relative;width:9rem;height:9rem;margin:0 auto 2rem;border-radius:9999px;background:var(--accent-soft);display:flex;align-items:center;justify-content:center}
.ge-art::after{content:"";position:absolute;inset:-0.75rem;border-radius:9999px;border:1px dashed var(--accent);opacity:.35}
.ge-tile{width:4rem;height:4rem;border-radius:1rem;background:var(--card);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;box-shadow:0 12px 30px -14px rgba(47,91,231,.5);color:var(--accent)}
.ge-brand{display:inline-flex;align-items:center;gap:.5rem;font-weight:700;font-size:1.05rem;letter-spacing:-.01em;color:var(--fg);text-decoration:none;margin-bottom:2rem}
.ge h1{margin:0;font-size:1.6rem;font-weight:650;letter-spacing:-.02em}
.ge p{margin:.75rem 0 0;color:var(--muted);line-height:1.6;font-size:.95rem}
.ge code{font-family:ui-monospace,monospace;font-size:.8rem;background:var(--card);border:1px solid var(--line);border-radius:.375rem;padding:.1rem .4rem}
.ge-actions{margin-top:2rem;display:flex;flex-wrap:wrap;gap:.75rem;justify-content:center}
.ge-btn{height:2.75rem;padding:0 1.5rem;border-radius:9999px;font:inherit;font-weight:600;font-size:.95rem;cursor:pointer;display:inline-flex;align-items:center;text-decoration:none}
.ge-primary{background:var(--accent);color:#fff;border:1px solid var(--accent)}
.ge-secondary{background:transparent;color:var(--fg);border:1px solid var(--line)}
.ge-btn:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
`


function Logo({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M8 7L3 12L8 17" />
      <path d="M16 7L21 12L16 17" />
      <path d="M14 4.5L10 19.5" />
    </svg>
  )
}

export default function GlobalErrorPage({
  error,
  reset,
  retry,
}: {
  error: Error & { digest?: string }
  reset?: () => void
  retry?: () => void
}) {
  const again = retry ?? reset
  const [locale, setLocale] = useState<Locale>('en')
  useEffect(() => { setLocale(pageLocale()) }, [])
  const tx = TEXT[locale]
  return (
    <html lang={locale}>
      <head>
        <title>{tx.title}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
      </head>
      <body className="ge">
        <script dangerouslySetInnerHTML={{ __html: GLOBAL_ERROR_THEME_SCRIPT }} />
        <div className="ge-glow" aria-hidden />
        <main className="ge-in" role="alert">
          <a href="/" className="ge-brand" aria-label={tx.home}>
            <span style={{ color: 'var(--accent)', display: 'inline-flex' }}>
              <Logo />
            </span>
            CodeSpectra
          </a>
          <div className="ge-art" aria-hidden>
            <div className="ge-tile">
              <Logo size={28} />
            </div>
          </div>
          <h1>{tx.heading}</h1>
          <p>{tx.body}</p>
          {error?.digest && (
            <p>
              {tx.ref} <code>{error.digest}</code>
            </p>
          )}
          <div className="ge-actions">
            {again && (
              <button type="button" className="ge-btn ge-primary" onClick={() => again()}>
                {tx.retry}
              </button>
            )}
            {/* Full reload on purpose: the root layout failed, so client navigation can't be trusted. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" className="ge-btn ge-secondary">
              {tx.goHome}
            </a>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/status" className="ge-btn ge-secondary">
              {tx.status}
            </a>
          </div>
        </main>
      </body>
    </html>
  )
}
