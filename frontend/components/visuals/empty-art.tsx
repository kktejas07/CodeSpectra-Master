import { Bell, Bookmark, BookOpen, CalendarClock, FileText, FolderOpen, Search } from 'lucide-react'
import { cn } from '@/lib/utils'

export type EmptyArtVariant = 'default' | 'bookmarks' | 'search' | 'notifications' | 'sessions' | 'courses'

const ICONS: Record<EmptyArtVariant, typeof FileText> = {
  default: FileText,
  bookmarks: Bookmark,
  search: Search,
  notifications: Bell,
  sessions: CalendarClock,
  courses: BookOpen,
}

/**
 * Brand vector for empty states: stacked UI cards on a soft royal-blue disc
 * with a floating badge. Theme-aware (primary + card tokens), decorative.
 */
export function EmptyArt({ variant = 'default', className }: { variant?: EmptyArtVariant; className?: string }) {
  const Icon = ICONS[variant] ?? FolderOpen
  return (
    <div aria-hidden className={cn('relative h-40 w-48', className)}>
      {/* disc + rings */}
      <div className="absolute left-1/2 top-1/2 h-36 w-36 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10" />
      <div className="absolute left-1/2 top-1/2 h-44 w-44 -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-primary/25" />
      {/* back card */}
      <div className="absolute left-[30%] top-[18%] h-24 w-24 -rotate-6 rounded-2xl border border-border bg-card/80 shadow-sm" />
      {/* front card */}
      <div className="absolute left-[26%] top-[24%] w-28 rotate-3 rounded-2xl border border-border bg-card p-3 shadow-[0_12px_30px_-14px_rgba(47,91,231,0.45)]">
        <div className="flex items-center gap-1.5">
          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-primary/12 font-mono text-[7px] font-bold text-primary">{'</>'}</span>
          <span className="h-1.5 w-12 rounded-full bg-muted-foreground/25" />
        </div>
        <span className="mt-2.5 block h-1.5 w-full rounded-full bg-muted-foreground/15" />
        <span className="mt-1.5 block h-1.5 w-4/5 rounded-full bg-muted-foreground/15" />
        <span className="mt-1.5 block h-1.5 w-3/5 rounded-full bg-muted-foreground/15" />
      </div>
      {/* badge */}
      <div className="cs-bob absolute right-[14%] top-[12%] flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30">
        <Icon className="h-5 w-5" />
      </div>
      {/* sparkles */}
      <svg className="absolute bottom-[14%] left-[14%] h-4 w-4 text-primary/60" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 0l1.6 6.4L16 8l-6.4 1.6L8 16l-1.6-6.4L0 8l6.4-1.6z" />
      </svg>
      <span className="absolute right-[20%] bottom-[18%] h-2 w-2 rounded-full bg-primary/40" />
    </div>
  )
}
