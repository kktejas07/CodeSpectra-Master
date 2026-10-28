/** Client-safe docs types + pure helpers (no fs). */

export type ServeSection = 'public' | 'user'

export interface DocMeta {
  slug: string
  title: string
  section: ServeSection
  sectionLabel: string
  order: number
  filePath: string
}

export interface DocSection {
  id: ServeSection
  label: string
  icon: string
  badge: string
  docs: DocMeta[]
}

export interface DocPage {
  meta: DocMeta
  content: string
  headings: { level: number; text: string; id: string }[]
}

/** Canonical URL for a doc page. */
export function docHref(doc: Pick<DocMeta, 'section' | 'slug'>): string {
  return doc.section === 'public' ? `/docs/${doc.slug}` : `/docs/user/${doc.slug}`
}

/**
 * Relative markdown links between docs (`06-faq.md`, `./01-getting-started.md#x`,
 * `../user/03-billing-guide.md`) → the served URL. Returns null for anything else.
 */
export function resolveDocLink(href: string, current: ServeSection): string | null {
  const m = href.match(/^(?:\.\/)?(?:\.\.\/(public|user)\/)?(?:\d+-)?([\w-]+)\.md(#.*)?$/)
  if (!m) return null
  const section = (m[1] as ServeSection | undefined) ?? current
  return docHref({ section, slug: m[2] }) + (m[3] ?? '')
}

/** Flat ordered list of docs from already-loaded sections. */
export function flattenDocs(sections: DocSection[]): DocMeta[] {
  return sections.flatMap((s) => s.docs)
}

export function getAdjacentDocs(
  current: DocMeta,
  sections: DocSection[],
): { prev: DocMeta | null; next: DocMeta | null } {
  const flat = flattenDocs(sections)
  const idx = flat.findIndex((d) => d.section === current.section && d.slug === current.slug)
  if (idx < 0) return { prev: null, next: null }
  return {
    prev: idx > 0 ? flat[idx - 1] : null,
    next: idx < flat.length - 1 ? flat[idx + 1] : null,
  }
}

/** First meaningful paragraph of markdown, stripped for meta descriptions. */
export function docDescription(content: string, maxLen = 160): string {
  const lines = (content || '').split('\n')
  for (const raw of lines) {
    const line = raw.trim()
    if (!line || line.startsWith('#') || line.startsWith('>') || line.startsWith('|') || line.startsWith('- ') || line.startsWith('* ') || line.startsWith('```')) continue
    const clean = line
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[`*_~]/g, '')
      .trim()
    if (clean.length < 20) continue
    return clean.length > maxLen ? clean.slice(0, maxLen - 1).trimEnd() + '…' : clean
  }
  return 'CodeSpectra documentation guides and references.'
}
