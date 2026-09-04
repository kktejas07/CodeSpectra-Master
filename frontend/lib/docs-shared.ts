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
