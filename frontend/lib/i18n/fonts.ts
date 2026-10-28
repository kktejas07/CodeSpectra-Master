/**
 * Indic script fonts (self-hosted like the other faces — the Docker build has
 * no Google Fonts access). Script-only subsets (Devanagari ≈120 KB, Telugu
 * ≈124 KB, variable 100–900, SIL OFL), `preload: false` and a unicode-range,
 * so the browser fetches a file only when that script is actually on screen.
 * The classes are applied only for hi / te (LocaleRoot, Learn posts); the font
 * stacks in app/globals.css list them after Plus Jakarta Sans so Latin text
 * keeps the brand face and Indic glyphs fall through to Noto.
 */
import localFont from 'next/font/local'
import type { Locale } from './config'

const devanagari = localFont({
  src: '../../fonts/noto-sans-devanagari-variable.woff2',
  variable: '--font-devanagari',
  display: 'swap',
  weight: '100 900',
  preload: false,
  declarations: [{ prop: 'unicode-range', value: 'U+0900-097F,U+1CD0-1CF9,U+200C-200D,U+20A8,U+20B9,U+25CC,U+A830-A839,U+A8E0-A8FF' }],
})

const telugu = localFont({
  src: '../../fonts/noto-sans-telugu-variable.woff2',
  variable: '--font-telugu',
  display: 'swap',
  weight: '100 900',
  preload: false,
  declarations: [{ prop: 'unicode-range', value: 'U+0951-0952,U+0964-0965,U+0C00-0C7F,U+1CDA,U+1CF2,U+200C-200D,U+25CC' }],
})

/** Font variable class for a locale ('' for English — nothing extra is loaded). */
export function localeFontClass(locale: Locale | string | null | undefined): string {
  if (locale === 'hi') return devanagari.variable
  if (locale === 'te') return telugu.variable
  return ''
}
