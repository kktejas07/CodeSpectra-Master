/**
 * Markdown helpers for Learn posts (pure, client-safe): sanitisation, table of
 * contents, reading time and section replacement.
 *
 * Posts are LLM output edited by admins, so they are untrusted. Defence in
 * depth: we sanitise on save (here) and render with react-markdown WITHOUT
 * raw HTML (components/learn/learn-markdown.tsx), whose URL transform also
 * drops unsafe protocols.
 */

export const MAX_BODY_CHARS = 120_000

const FENCE_RE = /^\s{0,3}(```|~~~)/

/** Split markdown into alternating prose / fenced-code segments. */
function splitFences(md: string): Array<{ code: boolean; text: string }> {
  const out: Array<{ code: boolean; text: string }> = []
  let buf: string[] = []
  let inCode = false
  let fence = ''
  const flush = (code: boolean) => {
    if (buf.length) out.push({ code, text: buf.join('\n') })
    buf = []
  }
  for (const line of md.split('\n')) {
    const m = FENCE_RE.exec(line)
    if (!inCode && m) {
      flush(false)
      inCode = true
      fence = m[1]
      buf.push(line)
    } else if (inCode && m && m[1] === fence) {
      buf.push(line)
      flush(true)
      inCode = false
    } else {
      buf.push(line)
    }
  }
  // An unclosed fence: close it so it cannot swallow the rest of the page oddly.
  if (inCode) {
    buf.push(fence)
    flush(true)
  } else flush(false)
  return out
}

const SAFE_LINK = /^(https?:|mailto:|\/(?!\/)|#)/i

function sanitizeProse(text: string): string {
  // Protect inline code spans from the tag stripper.
  const spans: string[] = []
  let s = text.replace(/`[^`\n]+`/g, (m) => {
    spans.push(m)
    return `\u0000${spans.length - 1}\u0000`
  })
  s = s
    // HTML comments and raw tags (keep <https://…> autolinks).
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|iframe|object|embed)[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(?!https?:\/\/)\/?[a-zA-Z!][^>\n]*>/g, '')
    // Inline links / images with unsafe targets → '#'.
    .replace(/(\]\()\s*([^)\s]*)([^)]*\))/g, (_m, open: string, url: string, rest: string) => `${open}${SAFE_LINK.test(url) ? url : '#'}${rest}`)
    // Reference definitions with unsafe targets are dropped.
    .replace(/^\s{0,3}\[[^\]]+\]:\s*(\S+).*$/gm, (line, url: string) => (SAFE_LINK.test(url.replace(/^<|>$/g, '')) ? line : ''))
  return s.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => spans[Number(i)] ?? '')
}

/** Sanitised markdown: no raw HTML, only http(s)/mailto/relative/anchor links, capped length. */
export function sanitizeMarkdown(md: unknown): string {
  if (typeof md !== 'string' || !md) return ''
  // eslint-disable-next-line no-control-regex
  const clean = md.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, MAX_BODY_CHARS)
  return splitFences(clean)
    .map((seg) => (seg.code ? seg.text : sanitizeProse(seg.text)))
    .join('\n')
    .trim()
}

/** github-slugger-compatible id (what rehype-slug produces for ASCII headings). */
export function headingId(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .trim()
    .replace(/\s/g, '-')
}

export interface TocItem {
  id: string
  text: string
  level: 2 | 3
}

/** H2/H3 headings outside code fences, with rehype-slug ids (duplicates get -1, -2…). */
export function extractToc(md: string): TocItem[] {
  const out: TocItem[] = []
  const seen = new Map<string, number>()
  for (const seg of splitFences(md || '')) {
    if (seg.code) continue
    for (const line of seg.text.split('\n')) {
      const m = /^(#{2,3})\s+(.+?)\s*#*\s*$/.exec(line)
      if (!m) continue
      const text = m[2].replace(/[*_`[\]]/g, '').replace(/\(([^)]*)\)/g, '').trim()
      let id = headingId(text)
      const n = seen.get(id)
      seen.set(id, (n ?? -1) + 1)
      if (n !== undefined) id = `${id}-${n + 1}`
      out.push({ id, text, level: m[1].length as 2 | 3 })
    }
  }
  return out
}

/** ~220 words a minute for prose, slower for code. */
export function readingMinutes(md: string): number {
  let words = 0
  let codeLines = 0
  for (const seg of splitFences(md || '')) {
    if (seg.code) codeLines += seg.text.split('\n').length
    else words += seg.text.split(/\s+/).filter(Boolean).length
  }
  return Math.max(1, Math.round(words / 220 + codeLines / 40))
}

/**
 * Replace the body of the `## heading` section (up to the next H2) with
 * `content`, keeping everything else. Appends the section when missing.
 */
export function replaceSection(md: string, heading: string, content: string): string {
  const lines = (md || '').split('\n')
  const target = heading.trim().toLowerCase()
  let start = -1
  let end = lines.length
  let inCode = false
  for (let i = 0; i < lines.length; i++) {
    if (FENCE_RE.test(lines[i])) inCode = !inCode
    if (inCode) continue
    const h2 = /^##\s+(.+?)\s*$/.exec(lines[i])
    if (!h2) continue
    if (start >= 0) {
      end = i
      break
    }
    if (h2[1].trim().toLowerCase() === target) start = i
  }
  const block = `## ${heading}\n\n${content.trim()}\n`
  if (start < 0) return `${(md || '').trimEnd()}\n\n${block}`
  return [...lines.slice(0, start), block, ...lines.slice(end)].join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}

/** Body of the `## heading` section, or '' when absent. */
export function getSection(md: string, heading: string): string {
  const lines = (md || '').split('\n')
  const target = heading.trim().toLowerCase()
  let start = -1
  let inCode = false
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    if (FENCE_RE.test(lines[i])) inCode = !inCode
    const h2 = !inCode && /^##\s+(.+?)\s*$/.exec(lines[i])
    if (h2) {
      if (start >= 0) break
      if (h2[1].trim().toLowerCase() === target) start = i
      continue
    }
    if (start >= 0) out.push(lines[i])
  }
  return out.join('\n').trim()
}

/** Plain text (for RSS descriptions, search snippets and the RAG index). */
export function markdownToPlain(md: string, max = 400): string {
  const s = (md || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`|~-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s
}
