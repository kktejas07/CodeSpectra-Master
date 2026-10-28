/** Small helpers shared by the source extractors (pure). */

export type Doc = Record<string, unknown>

export function str(v: unknown, max = 20_000): string {
  if (v === null || v === undefined) return ''
  const s = typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : ''
  return s.length > max ? s.slice(0, max) : s
}

export function strList(v: unknown, maxItems = 50, maxLen = 120): string[] {
  if (!Array.isArray(v)) return []
  return v.map((x) => str(x, maxLen).trim()).filter(Boolean).slice(0, maxItems)
}

export function arr(v: unknown): Doc[] {
  return Array.isArray(v) ? v.filter((x): x is Doc => !!x && typeof x === 'object' && !Array.isArray(x)) : []
}

export function tenantOf(doc: Doc): string | null {
  return typeof doc.tenant_id === 'string' && doc.tenant_id ? doc.tenant_id : null
}

/** "Label: value" lines, skipping empty values. */
export function fields(rows: Array<[string, unknown]>): string {
  return rows
    .map(([k, v]) => {
      const s = Array.isArray(v) ? strList(v).join(', ') : str(v, 2000)
      return s.trim() ? `- ${k}: ${s.trim()}` : ''
    })
    .filter(Boolean)
    .join('\n')
}

/** Strip HTML tags/entities to plain text (keeps line breaks for block tags). */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr|br)\s*>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim()
}

export function isoDate(v: unknown): string {
  const s = str(v, 40)
  if (!s) return ''
  const t = Date.parse(s)
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : s
}

export function pct(n: number, d: number): number | null {
  return d > 0 ? Math.round((n / d) * 1000) / 10 : null
}
