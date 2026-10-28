/**
 * Structure-aware chunking for the knowledge index (pure, no I/O).
 *
 * Input is markdown-ish text. Headings set the section path; paragraphs, list
 * runs and fenced code blocks are kept whole where they fit. Chunks target
 * ~800 tokens with ~100 tokens of overlap, and every chunk starts with the
 * source title + section path so a hit makes sense on its own.
 *
 * ponytail: tokens ≈ chars / 4 (no tokenizer dependency). Good enough for
 * sizing; ceiling is a few % drift on code-heavy text.
 */
import { createHash } from 'crypto'

export const CHARS_PER_TOKEN = 4
export const DEFAULT_CHUNK_TOKENS = 800
export const DEFAULT_OVERLAP_TOKENS = 100
/** Hard cap so a runaway source can't produce thousands of chunks. */
export const MAX_CHUNKS_PER_SOURCE = 400

export interface ChunkOptions {
  maxTokens?: number
  overlapTokens?: number
  /**
   * Start a new chunk whenever the top-level section changes (no packing
   * across sections), so each chunk's section label is exact. Used for docs,
   * whose top level is `##` once the title `#` is removed.
   */
  splitOnSection?: boolean
}

export interface TextChunk {
  index: number
  /** Header (title + section path) + body. This is what gets embedded and searched. */
  text: string
  /** Body only, without the header. */
  body: string
  section: string[]
}

interface Block {
  text: string
  section: string[]
}

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/

/** Split markdown into blocks (paragraphs / code fences / list runs) tagged with their heading path. */
export function markdownBlocks(md: string): Block[] {
  const lines = md.replace(/\r\n?/g, '\n').split('\n')
  const blocks: Block[] = []
  const path: { level: number; text: string }[] = []
  let buf: string[] = []
  let inFence = false

  const section = () => path.map((p) => p.text)
  const flush = () => {
    const text = buf.join('\n').trim()
    if (text) blocks.push({ text, section: section() })
    buf = []
  }

  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) {
      if (!inFence) flush()
      buf.push(line)
      inFence = !inFence
      if (!inFence) flush()
      continue
    }
    if (inFence) { buf.push(line); continue }
    const h = HEADING_RE.exec(line)
    if (h) {
      flush()
      const level = h[1].length
      while (path.length && path[path.length - 1].level >= level) path.pop()
      path.push({ level, text: h[2].replace(/[`*_]/g, '').trim() })
      continue
    }
    if (!line.trim()) { flush(); continue }
    buf.push(line)
  }
  flush()
  return blocks
}

/** Split a block that is larger than `max` chars at sentence, then word boundaries. */
function splitLarge(text: string, max: number): string[] {
  if (text.length <= max) return [text]
  const out: string[] = []
  let rest = text
  while (rest.length > max) {
    const window = rest.slice(0, max)
    let cut = Math.max(window.lastIndexOf('. '), window.lastIndexOf('.\n'), window.lastIndexOf('\n'))
    if (cut < max * 0.5) cut = window.lastIndexOf(' ')
    if (cut < max * 0.3) cut = max - 1
    out.push(rest.slice(0, cut + 1).trim())
    rest = rest.slice(cut + 1)
  }
  if (rest.trim()) out.push(rest.trim())
  return out
}

/** Last ~`chars` of a text, starting at a word boundary. */
function tail(text: string, chars: number): string {
  if (chars <= 0 || text.length <= chars) return chars <= 0 ? '' : text
  const s = text.slice(text.length - chars)
  const sp = s.indexOf(' ')
  return (sp >= 0 && sp < chars / 2 ? s.slice(sp + 1) : s).trim()
}

export function chunkHeader(title: string, section: readonly string[]): string {
  const t = title.trim()
  const s = section.filter(Boolean).join(' › ')
  return s ? `${t}\n${s}` : t
}

/**
 * Chunk a source. Blocks are packed greedily; a new chunk starts on overflow
 * or when the top-level section changes and the current chunk is already
 * half full (keeps chunks topical without producing slivers).
 */
export function chunkText(title: string, markdown: string, opts: ChunkOptions = {}): TextChunk[] {
  const maxChars = Math.max(200, (opts.maxTokens ?? DEFAULT_CHUNK_TOKENS) * CHARS_PER_TOKEN)
  const overlapChars = Math.max(0, Math.min(maxChars / 2, (opts.overlapTokens ?? DEFAULT_OVERLAP_TOKENS) * CHARS_PER_TOKEN))
  const blocks = markdownBlocks(markdown).flatMap((b) =>
    splitLarge(b.text, maxChars - overlapChars).map((t) => ({ text: t, section: b.section })))

  const chunks: TextChunk[] = []
  let cur: string[] = []
  let curLen = 0
  let curSection: string[] = []
  let carry = ''

  const emit = () => {
    if (!cur.length) return
    const body = (carry ? carry + '\n\n' : '') + cur.join('\n\n')
    const header = chunkHeader(title, curSection)
    chunks.push({ index: chunks.length, text: `${header}\n\n${body}`, body, section: curSection })
    carry = tail(cur.join('\n\n'), overlapChars)
    cur = []
    curLen = 0
  }

  for (const b of blocks) {
    if (chunks.length >= MAX_CHUNKS_PER_SOURCE) break
    const topChanged = cur.length > 0 && (b.section[0] ?? '') !== (curSection[0] ?? '')
    if (cur.length && (curLen + b.text.length + 2 + carry.length > maxChars || (topChanged && (opts.splitOnSection || curLen > maxChars / 2)))) {
      emit()
      // Overlap only carries within the same top-level section.
      if ((b.section[0] ?? '') !== (curSection[0] ?? '')) carry = ''
    }
    if (!cur.length) curSection = b.section
    cur.push(b.text)
    curLen += b.text.length + 2
  }
  if (chunks.length < MAX_CHUNKS_PER_SOURCE) emit()
  return chunks
}

/** Stable hash of everything that affects the stored chunks (text + ACL fields). */
export function contentHash(parts: unknown[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 40)
}

export function approxTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}
