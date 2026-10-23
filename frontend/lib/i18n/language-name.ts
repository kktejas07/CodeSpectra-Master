/**
 * SEO-047: a stored language value ("hindi", "Telugu", "te") as its name in
 * the reader's language ("हिन्दी" on a Hindi page). Pure; unknown values are
 * shown capitalised as stored.
 */
const LANGUAGE_CODES: Record<string, string> = {
  english: 'en', hindi: 'hi', telugu: 'te', tamil: 'ta', kannada: 'kn', malayalam: 'ml', marathi: 'mr',
  bengali: 'bn', gujarati: 'gu', punjabi: 'pa', urdu: 'ur', odia: 'or',
}

export function languageName(value: string, locale: string): string {
  const v = value.trim().toLowerCase()
  const code = LANGUAGE_CODES[v] ?? (/^[a-z]{2,3}$/.test(v) ? v : null)
  if (code) {
    try {
      const name = new Intl.DisplayNames([locale], { type: 'language' }).of(code)
      if (name && name.toLowerCase() !== code) return name
    } catch { /* no Intl.DisplayNames: fall through */ }
  }
  const t = value.trim()
  return t ? t[0].toUpperCase() + t.slice(1) : t
}
