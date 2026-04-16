'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight, Home } from 'lucide-react'

export function Breadcrumbs() {
  const pathname = usePathname()

  // Parse pathname into breadcrumb segments
  const segments = pathname
    .split('/')
    .filter(Boolean)
    .map((segment) => ({
      label: segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' '),
      href: `/${segment}`,
    }))

  // Build full paths
  const breadcrumbs = [
    { label: 'Dashboard', href: '/dashboard' },
    ...segments.slice(1).map((_, index) => ({
      label: segments[index + 1]?.label || '',
      href: segments.slice(0, index + 2).reduce((acc, seg) => acc + '/' + seg, ''),
    })),
  ].filter((b) => b.label)

  return (
    <nav className="flex items-center gap-2 text-sm">
      <Link href="/dashboard" className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors">
        <Home className="w-4 h-4" />
      </Link>
      {breadcrumbs.map((breadcrumb, index) => (
        <div key={breadcrumb.href} className="flex items-center gap-2">
          <ChevronRight className="w-4 h-4 text-muted-foreground/50" />
          {index === breadcrumbs.length - 1 ? (
            <span className="font-medium text-foreground">{breadcrumb.label}</span>
          ) : (
            <Link href={breadcrumb.href} className="text-muted-foreground hover:text-foreground transition-colors">
              {breadcrumb.label}
            </Link>
          )}
        </div>
      ))}
    </nav>
  )
}
