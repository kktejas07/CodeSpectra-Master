'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import {
  Search,
  BookOpen,
  User,
  ChevronDown,
  ChevronRight,
  Menu,
  X,
  FileText,
  XCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { docHref, type DocSection, type DocMeta } from '@/lib/docs-shared'

const ICON_MAP: Record<string, React.ElementType> = {
  BookOpen,
  User,
}

interface DocSidebarProps {
  sections: DocSection[]
}

export function DocSidebar({ sections }: DocSidebarProps) {
  const pathname = usePathname()
  const [query, setQuery] = useState('')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(sections.map((s) => s.id)),
  )

  const currentPath = pathname.replace(/\/$/, '') || '/docs'

  const filtered = useMemo(() => {
    const q = query.trim()
    if (!q) return sections
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
    return sections
      .map((s) => ({
        ...s,
        docs: s.docs.filter((d) => {
          const title = d.title.toLowerCase()
          const slug = d.slug.toLowerCase()
          return terms.every((term) => title.includes(term) || slug.includes(term))
        }),
      }))
      .filter((s) => s.docs.length > 0)
  }, [query, sections])

  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const isActive = (doc: DocMeta) => currentPath === docHref(doc)

  const nav = (
    <>
      <div className="flex items-center justify-between gap-2 border-b border-cs-grid px-4 py-3">
        <Link href="/docs" className="flex items-center gap-2 font-semibold tracking-tight text-cs-ink">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-cs-accent/25 bg-cs-accent/10 text-cs-accent-text">
            <BookOpen className="h-4 w-4" aria-hidden />
          </span>
          <span className="text-sm">Docs</span>
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="rounded-lg p-2 text-cs-ink-soft hover:bg-cs-accent/10 lg:hidden"
          aria-label="Close docs menu"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="border-b border-cs-grid px-3 py-3">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-cs-ink-soft" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search docs…"
            className="w-full rounded-xl border border-cs-grid bg-cs-sheet py-2 pl-9 pr-9 text-sm text-cs-ink outline-none ring-cs-accent/30 placeholder:text-cs-ink-soft/70 focus:border-cs-accent/50 focus:ring-2"
            aria-label="Search documentation"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-cs-ink-soft hover:text-cs-ink"
              aria-label="Clear search"
            >
              <XCircle className="h-4 w-4" />
            </button>
          )}
        </label>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-4" aria-label="Documentation">
        {filtered.length === 0 ? (
          <p className="px-2 text-sm text-cs-ink-soft">No pages match. Try a shorter search.</p>
        ) : (
          filtered.map((section) => {
            const Icon = ICON_MAP[section.icon] || FileText
            const open = expanded.has(section.id) || query.trim().length > 0
            return (
              <div key={section.id}>
                <button
                  type="button"
                  onClick={() => toggle(section.id)}
                  aria-expanded={open}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm font-semibold text-cs-ink hover:text-cs-accent-text"
                >
                  <Icon className="h-3.5 w-3.5 shrink-0 text-cs-ink-soft" aria-hidden />
                  <span className="flex-1">{section.label}</span>
                  {open ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                </button>
                {open ? (
                  <ul className="ml-3 mt-1 space-y-0.5 border-l border-cs-grid pl-2">
                    {section.docs.map((doc) => (
                      <li key={`${doc.section}-${doc.slug}`}>
                        <Link
                          href={docHref(doc)}
                          aria-current={isActive(doc) ? 'page' : undefined}
                          className={cn(
                            'block rounded-lg px-2.5 py-1.5 text-[13px] leading-snug transition-colors duration-200',
                            isActive(doc)
                              ? 'bg-cs-accent/10 font-semibold text-cs-accent-text'
                              : 'text-cs-ink-soft hover:bg-cs-accent/5 hover:text-cs-ink',
                          )}
                        >
                          {doc.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            )
          })
        )}
      </nav>

      <div className="border-t border-cs-grid px-4 py-3 text-xs text-cs-ink-soft">
        <Link href="/" className="hover:text-cs-ink">
          ← CodeSpectra home
        </Link>
      </div>
    </>
  )

  return (
    <>
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="fixed bottom-5 left-4 z-40 inline-flex min-h-11 items-center gap-2 rounded-full bg-cs-accent px-4 py-2.5 text-sm font-semibold text-cs-accent-ink shadow-lg shadow-[#2f5be7]/30 lg:hidden"
      >
        <Menu className="h-4 w-4" aria-hidden />
        Docs menu
      </button>

      {mobileOpen ? (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      ) : null}

      {/* Mobile drawer */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-[min(20rem,88vw)] flex-col border-r border-cs-grid bg-cs-paper transition-transform duration-200 motion-reduce:transition-none lg:hidden',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {nav}
      </aside>

      {/* Desktop sticky sidebar — offset under marketing header */}
      <aside className="sticky top-20 hidden h-[calc(100vh-5rem)] w-64 shrink-0 flex-col overflow-hidden border-r border-cs-grid bg-cs-paper/80 lg:flex xl:w-72">
        {nav}
      </aside>
    </>
  )
}
