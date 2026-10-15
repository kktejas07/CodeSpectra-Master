/**
 * Coding answers are stored as a JSON envelope —
 * `{"language":"java","code":"..."}` (key casing varies) — while every other
 * type stores plain text. The grader knew this (it JSON.parses inline) but
 * the admin review UI printed the raw envelope, showing candidates'
 * code as an escaped blob. Parse once here, reuse in both places.
 * Pure + client-safe (no server imports).
 */

export interface ParsedCodingAnswer {
  language: string
  code: string
  /** True when the raw string was a code envelope (not plain text). */
  isStructured: boolean
}

export function parseCodingAnswer(raw: string | null | undefined): ParsedCodingAnswer {
  const text = String(raw ?? '')
  if (!text) return { language: '', code: '', isStructured: false }
  try {
    const parsed: unknown = JSON.parse(text)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const rec = parsed as Record<string, unknown>
      if ('code' in rec || 'language' in rec || 'Language' in rec) {
        const code = typeof rec.code === 'string' ? rec.code : ''
        const langRaw = rec.language ?? rec.Language
        const language = typeof langRaw === 'string' ? langRaw.trim() : ''
        return { language, code, isStructured: true }
      }
    }
  } catch {
    /* plain text — fall through */
  }
  return { language: '', code: text, isStructured: false }
}

/** True for question types whose answers use the code envelope. */
export function isCodingType(type: string | null | undefined): boolean {
  const t = String(type || '').toLowerCase().replace(/[-_]/g, '')
  return t === 'coding' || t === 'code'
}
