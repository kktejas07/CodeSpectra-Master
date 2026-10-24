import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import type { DocMeta, DocPage, DocSection, ServeSection } from './docs-shared'

export type { DocMeta, DocPage, DocSection, ServeSection }
export { docHref, docDescription, flattenDocs, getAdjacentDocs } from './docs-shared'

export function resolveDocsRoot(): string {
  const cwd = process.cwd()
  // Dev monorepo: frontend/ → ../docs (source of truth)
  // Docker: /app/docs (mirrored via scripts/sync-docs.cjs → frontend/docs)
  const candidates = [
    path.join(/*turbopackIgnore: true*/ cwd, '..', 'docs'),
    path.join(/*turbopackIgnore: true*/ cwd, 'docs'),
  ]
  for (const p of candidates) {
    if (fs.existsSync(path.join(p, 'public')) || fs.existsSync(path.join(p, 'user'))) {
      return p
    }
  }
  return candidates[0]
}

const SERVE_SECTIONS = ['public', 'user'] as const satisfies readonly ServeSection[]

const SECTION_LABELS: Record<ServeSection, { label: string; icon: string; badge: string }> = {
  public: { label: 'Public Documentation', icon: 'BookOpen', badge: 'Public' },
  user: { label: 'User Guides', icon: 'User', badge: 'Guide' },
}

function stripNumber(name: string): string {
  return name.replace(/^\d+-/, '').replace(/\.md$/, '')
}

function nameToTitle(name: string): string {
  return stripNumber(name)
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export function getDocTree(): DocSection[] {
  const docsRoot = resolveDocsRoot()
  const sections: DocSection[] = []

  for (const sectionId of SERVE_SECTIONS) {
    const sectionDir = path.join(docsRoot, sectionId)
    if (!fs.existsSync(sectionDir)) continue

    const entries = fs.readdirSync(sectionDir).filter((f) => f.endsWith('.md') && f !== 'README.md')
    entries.sort()

    const docs: DocMeta[] = entries.map((entry) => {
      const orderMatch = entry.match(/^(\d+)-/)
      const order = orderMatch ? parseInt(orderMatch[1], 10) : 99
      const slug = stripNumber(entry)
      const filePath = path.join(sectionDir, entry)

      let title = nameToTitle(entry)
      try {
        const raw = fs.readFileSync(filePath, 'utf-8')
        const { data } = matter(raw)
        if (data.title) title = data.title
        if (data.slug) slug
      } catch {}

      return { slug, title, order, section: sectionId, sectionLabel: sectionId === 'public' ? 'Public' : 'User', filePath }
    })

    const info = SECTION_LABELS[sectionId]
    sections.push({
      id: sectionId,
      label: info.label,
      icon: info.icon,
      badge: info.badge,
      docs,
    })
  }

  return sections
}

export function resolveDoc(slug: string[]): DocPage | null {
  const tree = getDocTree()

  if (slug.length === 0) return null

  if (slug.length === 1) {
    for (const section of tree) {
      for (const doc of section.docs) {
        if (doc.slug === slug[0]) {
          return loadDoc(doc)
        }
      }
    }
    return null
  }

  if (slug.length >= 2 && slug[0] === 'user') {
    const section = tree.find((s) => s.id === 'user')
    if (!section) return null
    const targetSlug = slug.slice(1).join('-')
    for (const doc of section.docs) {
      if (doc.slug === targetSlug) return loadDoc(doc)
    }
    return null
  }

  return null
}

function loadDoc(meta: DocMeta): DocPage {
  const raw = fs.readFileSync(meta.filePath, 'utf-8')
  const { data, content } = matter(raw)

  const title = (data.title as string) || meta.title

  const headings: { level: number; text: string; id: string }[] = []
  // Repeated headings get -1, -2 … like rehype-slug, so TOC links and React keys stay unique.
  const seenIds = new Map<string, number>()
  for (const line of content.split('\n')) {
    const match = line.match(/^(#{1,4})\s+(.+)$/)
    if (match) {
      const text = match[2].replace(/[`*_]/g, '')
      const base = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
      const n = seenIds.get(base) ?? 0
      seenIds.set(base, n + 1)
      const id = n ? `${base}-${n}` : base
      headings.push({ level: match[1].length, text, id })
    }
  }

  return {
    meta: { ...meta, title },
    content,
    headings,
  }
}
