'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useMemo } from 'react'
import {
  Search,
  BookOpen,
  User,
  ChevronDown,
  ChevronRight,
  Menu,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DocSection, DocMeta } from '@/lib/docs'

const ICON_MAP: Record<string, React.ElementType> = {
  BookOpen,
  User,
}

interface DocSidebarProps {
  sections: DocSection[]
}

export function DocSidebar({ sections }: DocSidebarProps) {
  const pathname = usePathname()
  const [search, setSearch] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    () => new Set(sections.map((s) => s.id)),
  )

  const currentSlug = pathname.replace(/^\/docs\/?/, '')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
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
  }, [search, sections])

  const toggleSection = (id: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const isActive = (doc: DocMeta) => {
    if (!currentSlug) return false
    return currentSlug === doc.slug || currentSlug.endsWith(doc.slug)
  }

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setSidebarOpen(true)}
        className="fixed bottom-4 left-4 z-50 lg:hidden flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-4 py-2 shadow-lg"
      >
        <Menu className="h-4 w-4" />
        <span className="text-sm font-medium">Docs Menu</span>
      </button>

      {/* Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-72 border-r border-border/40 bg-background/95 backdrop-blur-xl',
          'flex flex-col',
          'transition-transform duration-300 lg:sticky lg:top-0 lg:z-auto lg:h-screen',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
        role="navigation"
        aria-label="Documentation navigation"
      >
        <div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
          <Link
            href="/docs"
            className="flex items-center gap-2 font-semibold"
            onClick={() => setSidebarOpen(false)}
          >
            <BookOpen className="h-5 w-5 text-primary" />
            <span>Documentation</span>
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1 hover:bg-muted rounded"
            aria-label="Close sidebar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search */}
        <div className="relative px-3 py-3 border-b border-border/20">
          <Search className="absolute left-6 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-border/40 bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20"
            aria-label="Search documentation"
          />
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {filtered.map((section) => {
            const Icon = (ICON_MAP[section.icon] || BookOpen) as React.ComponentType<{ className?: string }>
            const isExpanded = expandedSections.has(section.id)

            return (
              <div key={section.id}>
                <button
                  onClick={() => toggleSection(section.id)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    'hover:bg-muted',
                  )}
                >
                  <Icon className={"h-4 w-4 text-muted-foreground shrink-0" as any} />
                  <span className="flex-1 text-left">{section.label}</span>
                  {isExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </button>

                {isExpanded && (
                  <div className="ml-2 mt-1 space-y-0.5 border-l border-border/20 pl-2">
                    {section.docs.map((doc) => (
                      <Link
                        key={doc.slug}
                        href={`/docs/${doc.section === 'public' ? '' : 'user/'}${doc.slug}`}
                        onClick={() => setSidebarOpen(false)}
                        className={cn(
                          'block rounded-md px-3 py-1.5 text-sm transition-colors',
                          isActive(doc)
                            ? 'bg-primary/10 text-primary font-medium'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                        )}
                      >
                        {doc.title}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        <div className="border-t border-border/20 px-4 py-3">
          <Link
            href="/docs"
            onClick={() => setSidebarOpen(false)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Back to docs home
          </Link>
        </div>
      </aside>
    </>
  )
}
