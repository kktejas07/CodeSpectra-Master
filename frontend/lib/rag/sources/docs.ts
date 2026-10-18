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
    .replace(/<h1[^>]*>/gi, '\n\n# ').replace(/<h2[^>]*>/gi, '\n\n## ').replace(/<h3[^>]*>/gi, '\n\n### ')
    .replace(/<h4[^>]*>/gi, '\n\n#### ')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '\n- ')
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
    text: page.content,
    metadata: { kind: 'docs', section: meta.section },
  }
}

export async function loadDoc(id: string): Promise<ExtractedSource | null> {
  if (id.startsWith('page:')) return pageSource(id)
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
  return [...ids, ...Object.keys(DOC_PAGE_SOURCES)]
}
