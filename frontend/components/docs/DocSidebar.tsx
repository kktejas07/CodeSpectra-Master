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
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { docHref, type DocSection, type DocMeta } from '@/lib/docs'

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
    const q = query.trim().toLowerCase()
    if (!q) return sections
    return sections
      .map((s) => ({
        ...s,
        docs: s.docs.filter(
          (d) =>
            d.title.toLowerCase().includes(q) ||
            d.slug.toLowerCase().includes(q),
        ),
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
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
        <Link href="/docs" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-500/15 text-teal-600 dark:text-teal-400">
            <BookOpen className="h-4 w-4" />
          </span>
          <span className="text-sm">Docs</span>
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted lg:hidden"
          aria-label="Close docs menu"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="border-b border-border/40 px-3 py-3">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search docs…"
            className="w-full rounded-lg border border-border/60 bg-background py-2 pl-9 pr-3 text-sm outline-none ring-teal-500/30 placeholder:text-muted-foreground/70 focus:border-teal-500/50 focus:ring-2"
            aria-label="Search documentation"
          />
        </label>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-4" aria-label="Documentation">
        {filtered.length === 0 ? (
          <p className="px-2 text-sm text-muted-foreground">No matches.</p>
        ) : (
          filtered.map((section) => {
            const Icon = ICON_MAP[section.icon] || FileText
            const open = expanded.has(section.id) || query.trim().length > 0
            return (
              <div key={section.id}>
                <button
                  type="button"
                  onClick={() => toggle(section.id)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="flex-1">{section.label}</span>
                  {open ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                </button>
                {open ? (
                  <ul className="mt-1 space-y-0.5 border-l border-border/50 ml-3 pl-2">
                    {section.docs.map((doc) => (
                      <li key={`${doc.section}-${doc.slug}`}>
                        <Link
                          href={docHref(doc)}
                          className={cn(
                            'block rounded-md px-2.5 py-1.5 text-[13px] leading-snug transition-colors',
                            isActive(doc)
                              ? 'bg-teal-500/10 font-medium text-teal-700 dark:text-teal-300'
                              : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
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

      <div className="border-t border-border/50 px-4 py-3 text-xs text-muted-foreground">
        <Link href="/" className="hover:text-foreground">
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
        className="fixed bottom-5 left-4 z-40 inline-flex items-center gap-2 rounded-full bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-teal-600/30 lg:hidden"
      >
        <Menu className="h-4 w-4" />
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
          'fixed inset-y-0 left-0 z-50 flex w-[min(20rem,88vw)] flex-col border-r border-border bg-background transition-transform duration-200 lg:hidden',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {nav}
      </aside>

      {/* Desktop sticky sidebar — offset under marketing header */}
      <aside className="sticky top-20 hidden h-[calc(100vh-5rem)] w-64 shrink-0 flex-col overflow-hidden border-r border-border/60 bg-background/80 lg:flex xl:w-72">
        {nav}
      </aside>
    </>
  )
}
