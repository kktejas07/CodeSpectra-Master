/**
 * Pull answer-engine material out of a Learn post's markdown (pure):
 *   - FAQ pairs from the "Interview questions" / "FAQ" section
 *     (`1. **Question**` followed by the indented answer — lib/learn/schema),
 *   - "Key takeaways" bullets (the generator ends the concept section with them),
 *   - word count for Article schema.
 */
import type { QA } from './jsonld'

const FAQ_HEADINGS = /^##\s+(interview questions|faq|frequently asked questions)\s*$/i

function stripMd(s: string): string {
  return s
    .replace(/```[\s\S]*?```|~~~~[\s\S]*?~~~~/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, '$1$2')
    .replace(/\*([^*]+)\*|_([^_]+)_/g, '$1$2')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Section body under a `## ` heading matching `re` (until the next `## `). */
function sectionBody(md: string, re: RegExp): string | null {
  const lines = md.split('\n')
  const start = lines.findIndex((l) => re.test(l.trim()))
  if (start < 0) return null
  const out: string[] = []
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) break
    out.push(lines[i])
  }
  return out.join('\n')
}

export function extractFaqs(md: string, max = 8): QA[] {
  const body = sectionBody(md || '', FAQ_HEADINGS)
  if (!body) return []
  const out: QA[] = []
  // Numbered items: "1. **Question**" then the answer lines until the next item.
  const items = body.split(/\n(?=\s*\d+\.\s+)/)
  for (const raw of items) {
    const m = raw.match(/^\s*\d+\.\s+\*\*(.+?)\*\*\s*([\s\S]*)$/)
    if (!m) {
      // "### Question" style
      const h = raw.match(/^\s*###\s+(.+)\n([\s\S]*)$/)
      if (h) {
        const q = stripMd(h[1]); const a = stripMd(h[2])
        if (q && a) out.push({ q, a })
      }
      continue
    }
    const q = stripMd(m[1])
    const a = stripMd(m[2])
    if (q.length >= 8 && a.length >= 10) out.push({ q, a: a.slice(0, 1200) })
    if (out.length >= max) break
  }
  return out.slice(0, max)
}

export function extractKeyTakeaways(md: string, max = 5): string[] {
  const lines = (md || '').split('\n')
  const i = lines.findIndex((l) => /^\s*(\*\*|#{2,4}\s*)?key takeaways(\*\*)?:?\s*$/i.test(l.trim()))
  if (i < 0) return []
  const out: string[] = []
  for (let j = i + 1; j < lines.length && out.length < max; j++) {
    const l = lines[j].trim()
    if (!l) { if (out.length) break; continue }
    const b = l.match(/^[-*]\s+(.+)$/) || l.match(/^\d+\.\s+(.+)$/)
    if (!b) break
    out.push(stripMd(b[1]))
  }
  return out
}

export function wordCount(md: string): number {
  const t = stripMd(md || '')
  return t ? t.split(' ').length : 0
}
