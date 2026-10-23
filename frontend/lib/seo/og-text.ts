/**
 * SEO-030: text that is safe to draw on an Open Graph card.
 *
 * next/og (satori) has no Devanagari / Telugu font bundled and does no Indic
 * glyph shaping, so a Hindi or Telugu title renders as empty boxes or broken
 * matras and conjuncts (and the font fetch from Google Fonts fails in our
 * Docker builds). Until shaping is verified visually, cards keep Latin text:
 * the English title of the page (or the site tagline) plus "In Hindi" /
 * "In Telugu". The localized title still goes in og:title, which WhatsApp and
 * LinkedIn render as text. Pure (tests/og-text.test.ts).
 */
const DEVANAGARI = /[ऀ-ॿ꣠-ꣿ]/
const TELUGU = /[ఀ-౿]/

export type IndicScript = 'Hindi' | 'Telugu'

export function indicScript(text: string | null | undefined): IndicScript | null {
  const s = text || ''
  if (DEVANAGARI.test(s)) return 'Hindi'
  if (TELUGU.test(s)) return 'Telugu'
  return null
}

/** Latin title + subtitle for the card; unchanged when the text has no Indic script. */
export function ogCardText(args: { title: string; subtitle?: string; fallbackTitle: string }): { title: string; subtitle?: string } {
  const lang = indicScript(args.title)
  const subLang = indicScript(args.subtitle)
  if (!lang && !subLang) return { title: args.title, subtitle: args.subtitle }
  const title = lang ? (indicScript(args.fallbackTitle) ? 'CodeSpectra' : args.fallbackTitle) : args.title
  const subtitle = args.subtitle && !subLang ? args.subtitle : `In ${lang ?? subLang}`
  return { title, subtitle }
}
