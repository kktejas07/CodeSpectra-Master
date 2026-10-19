/**
 * Help content: the docs site (docs/public, docs/user via lib/docs), the FAQ,
 * the legal/security pages and the admin help centre.
 *
 * The FAQ, legal pages and admin help keep their copy inside page components,
 * so they are read as source text and converted (read-only). ponytail: when the
 * app ships without its .tsx sources (standalone Docker image) those three
 * resolve to null and only the markdown docs are indexed; moving the copy into
 * data files would lift that ceiling.
 */
import fs from 'fs'
import path from 'path'
import type { ExtractedSource } from '../types'

export const DOC_PAGE_SOURCES: Record<string, { file: string; title: string; url: string; kind: 'faq' | 'legal' | 'help' }> = {
  'page:faq': { file: 'app/faq/page.tsx', title: 'Frequently asked questions', url: '/faq', kind: 'faq' },
  'page:privacy': { file: 'app/privacy/page.tsx', title: 'Privacy policy', url: '/privacy', kind: 'legal' },
  'page:terms': { file: 'app/terms/page.tsx', title: 'Terms of service', url: '/terms', kind: 'legal' },
  'page:cookies': { file: 'app/cookies/page.tsx', title: 'Cookie policy', url: '/cookies', kind: 'legal' },
  'page:security': { file: 'app/security/page.tsx', title: 'Security', url: '/security', kind: 'legal' },
  'page:admin-help': { file: 'app/dashboard/admin/help/page.tsx', title: 'Admin help centre', url: '/dashboard/admin/help', kind: 'help' },
}

const QUOTED = String.raw`(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")`

function unq(m: RegExpExecArray, i: number): string {
  return (m[i] ?? m[i + 1] ?? '').replace(/\\(['"\\])/g, '$1')
}

/** FAQ page source → markdown (## category, ### question, answer). */
export function faqSourceToMarkdown(src: string): string {
  const re = new RegExp(String.raw`category:\s*${QUOTED}|q:\s*${QUOTED}\s*,\s*a:\s*${QUOTED}`, 'g')
  const out: string[] = []
  for (let m = re.exec(src); m; m = re.exec(src)) {
    if (m[1] !== undefined || m[2] !== undefined) out.push(`## ${unq(m, 1)}`)
    else out.push(`### ${unq(m, 3)}\n\n${unq(m, 5)}`)
  }
  return out.join('\n\n')
}

/** Admin help page source → markdown (## section, - label: desc (href)). */
export function helpSourceToMarkdown(src: string): string {
  const re = new RegExp(String.raw`title:\s*${QUOTED}\s*,\s*items|label:\s*${QUOTED}\s*,\s*desc:\s*${QUOTED}\s*,\s*href:\s*${QUOTED}`, 'g')
  const out: string[] = []
  for (let m = re.exec(src); m; m = re.exec(src)) {
    if (m[1] !== undefined || m[2] !== undefined) out.push(`\n## ${unq(m, 1)}\n`)
    else out.push(`- **${unq(m, 3)}** (${unq(m, 7)}): ${unq(m, 5)}`)
  }
  return out.join('\n').trim()
}

/** Static JSX page (legal copy) → markdown: headings, list items, paragraphs. */
export function jsxPageToMarkdown(src: string): string {
  const m = /return\s*\(/.exec(src)
  let s = m ? src.slice(m.index + m[0].length) : src
  s = s
    .replace(/\{\s*(['"`])((?:(?!\1).)*)\1\s*\}/g, '$2') // {' '} / {"text"}
    // Hero lead copy lives in a string prop: <PageHero lead="…" />. (The title is the source title already;
    // emitting it as a heading would put the whole page under one section and change how it chunks.)
    .replace(/<PageHero\b([^>]*?)\/?>/g, (_m, attrs: string) => `\n\n${/\blead="([^"]*)"/.exec(attrs)?.[1] ?? ''}\n\n`)
    // JSX element props (art={<Illustration />}) are markup, not copy.
    .replace(/\b[A-Za-z]+=\{\s*<[^{}]*?\/>\s*\}/g, ' ')
    // Headings (and *Title components) whose text sits on its own line or next to an icon.
    .replace(/<(h[1-6]|[A-Z][A-Za-z]*Title)\b[^>]*>([\s\S]*?)<\/\1>/g, (_m, tag: string, inner: string) => {
      const text = inner.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
      const level = /^h\d$/.test(tag) ? Number(tag[1]) : 3
      return text ? `\n\n${'#'.repeat(level)} ${text}\n\n` : ''
    })
    .replace(/<h1[^>]*>/gi, '\n\n# ').replace(/<h2[^>]*>/gi, '\n\n## ').replace(/<h3[^>]*>/gi, '\n\n### ')
    .replace(/<h4[^>]*>/gi, '\n\n#### ')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    // `\b` so <Link> isn't read as a list item.
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<\/(p|ul|ol|section|div|li)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\{[^{}]*\}/g, ' ')
    .replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/^\s*\)\s*;?\s*\}?\s*$/gm, '')
  const lines = s.split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').replace(/\s*\}?\s*\/>\s*$/, '').trim())
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^[)};\s]+$/gm, '').trim()
}

function appRoot(): string {
  return process.cwd()
}

export function pageSource(id: string): ExtractedSource | null {
  const def = DOC_PAGE_SOURCES[id]
  if (!def) return null
  const file = path.join(/*turbopackIgnore: true*/ appRoot(), def.file)
  let src: string
  try {
    src = fs.readFileSync(file, 'utf-8')
  } catch {
    return null
  }
  const text = def.kind === 'faq' ? faqSourceToMarkdown(src) : def.kind === 'help' ? helpSourceToMarkdown(src) : jsxPageToMarkdown(src)
  if (!text.trim()) return null
  return {
    type: 'doc',
    source_id: id,
    tenant_id: null,
    // The admin help centre describes the platform console: superadmin only.
    visibility: def.kind === 'help' ? 'platform_admin' : 'public',
    title: def.title,
    url: def.url,
    text,
    metadata: { kind: def.kind },
  }
}

/**
 * Docs-site markdown → index text. Drops the shared preamble every help doc
 * starts with (the `> **Customer Documentation** / Last Updated / Audience`
 * blockquote — identical across docs, so it only adds noise to every first
 * chunk) and the leading `# Title` (the chunk header already carries the
 * title; leaving it makes every section "Title › …" and hides `##` as the
 * real top level). A `#` heading that differs from the title is kept as a
 * plain first line so its words stay searchable.
 */
export const DOC_PREAMBLE_RE = /^>\s*\*\*(?:[^*]*Documentation|Last Updated|Audience|Auto-Generated|Auto-generated)\b/i

export function stripDocPreamble(md: string, title: string): string {
  const lines = md.replace(/\r\n?/g, '\n').split('\n')
  const firstSection = lines.findIndex((l) => /^##\s/.test(l))
  const head = firstSection < 0 ? lines.length : firstSection
  // Preamble lines (and bare `---` rules) before the first `##` section.
  const kept = lines.filter((l, i) => i >= head || !(DOC_PREAMBLE_RE.test(l) || /^\s*-{3,}\s*$/.test(l)))
  // Only a single document-level `#` is the title wrapper.
  let fence = false
  const h1s = kept.map((l, i) => {
    if (/^\s*(```|~~~)/.test(l)) fence = !fence
    return [i, fence ? null : /^#\s+(.+?)\s*#*\s*$/.exec(l)] as const
  }).filter(([, m]) => m)
  const firstH2 = kept.findIndex((l) => /^##\s/.test(l))
  if (h1s.length === 1 && (firstH2 < 0 || h1s[0][0] < firstH2)) {
    const [at, m] = h1s[0]
    const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    const text = m![1].replace(/[`*_]/g, '').trim()
    kept.splice(at, 1, ...(norm(text) === norm(title) ? [] : [text]))
  }
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

export async function markdownDocSource(id: string): Promise<ExtractedSource | null> {
  // id: "docs:<section>/<slug>"
  const m = /^docs:(public|user)\/([A-Za-z0-9._-]+)$/.exec(id)
  if (!m) return null
  const { getDocTree, resolveDoc, docHref } = await import('@/lib/docs')
  const section = getDocTree().find((s) => s.id === m[1])
  const meta = section?.docs.find((d) => d.slug === m[2])
  if (!meta) return null
  const page = resolveDoc(meta.section === 'public' ? [meta.slug] : ['user', meta.slug])
  if (!page) return null
  return {
    type: 'doc',
    source_id: id,
    tenant_id: null,
    visibility: 'public',
    title: page.meta.title,
    url: docHref(page.meta),
    text: stripDocPreamble(page.content, page.meta.title),
    metadata: { kind: 'docs', section: meta.section },
    chunk: { splitOnSection: true },
  }
}

export async function loadDoc(id: string): Promise<ExtractedSource | null> {
  if (id.startsWith('page:')) return pageSource(id)
  // Learn hub posts (lib/learn/rag.ts): published only, public.
  if (id.startsWith('learn:')) return (await import('@/lib/learn/rag')).loadLearnDoc(id)
  return markdownDocSource(id)
}

export async function listDocIds(): Promise<string[]> {
  const ids: string[] = []
  try {
    const { getDocTree } = await import('@/lib/docs')
    for (const s of getDocTree()) for (const d of s.docs) ids.push(`docs:${s.id}/${d.slug}`)
  } catch (e) {
    console.error('[rag/docs] docs tree unavailable:', e)
  }
  let learn: string[] = []
  try {
    learn = await (await import('@/lib/learn/rag')).listLearnDocIds()
  } catch (e) {
    console.error('[rag/docs] learn posts unavailable:', e)
  }
  return [...ids, ...Object.keys(DOC_PAGE_SOURCES), ...learn]
}
