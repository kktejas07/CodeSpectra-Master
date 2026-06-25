'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Home, Trophy, Code2, BookOpen, BarChart3, Star, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { LEARNING_HUB_DEFAULT } from '@/lib/learning-query'

type CommandMenuProps = {
  /** Full-width trigger (sidebar) */
  fullWidth?: boolean
  /** Icon-only trigger on large screens (collapsed sidebar) */
  compact?: boolean
  /** Role-aware home / overview (e.g. superadmin → `/dashboard/admin/system`). */
  overviewHref?: string
}

export function CommandMenu({
  fullWidth = false,
  compact = false,
  overviewHref = '/dashboard',
}: CommandMenuProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  const commands = useMemo(
    () => [
      {
        label: overviewHref === '/dashboard' ? 'Dashboard' : 'Overview',
        icon: Home,
        href: overviewHref,
      },
      { label: 'Arena', icon: Trophy, href: '/dashboard/arena' },
      { label: 'Scanner', icon: Code2, href: '/dashboard/scanner?mode=manual' },
      { label: 'Learning', icon: BookOpen, href: LEARNING_HUB_DEFAULT },
      { label: 'Leaderboard', icon: BarChart3, href: '/dashboard/leaderboard' },
      { label: 'Achievements', icon: Star, href: '/dashboard/achievements' },
      { label: 'Settings', icon: Settings, href: '/dashboard/settings' },
    ],
    [overviewHref]
  )

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((open) => !open)
      }
    }

    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  const runCommand = (callback: () => void) => {
    setOpen(false)
    callback()
  }

  return (
    <>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search pages and commands..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Navigation">
            {commands.map((command) => (
              <CommandItem
                key={`${command.label}-${command.href}`}
                onSelect={() => {
                  runCommand(() => router.push(command.href))
                }}
              >
                <command.icon className="mr-2 h-4 w-4" />
                <span>{command.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>

      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'inline-flex items-center gap-2 text-sm rounded-lg border border-border/40 bg-background/90 hover:bg-muted/80 transition-colors group text-muted-foreground',
          fullWidth ? 'w-full justify-between px-3 py-2.5' : 'px-3 py-2',
          compact && 'lg:px-2 lg:py-2.5 lg:justify-center'
        )}
      >
        <Search className="w-4 h-4 shrink-0 opacity-80" />
        <span
          className={cn(
            'truncate text-left text-muted-foreground',
            fullWidth && !compact && 'flex-1',
            !fullWidth && 'hidden sm:inline',
            fullWidth && compact && 'lg:hidden'
          )}
        >
          Search…
        </span>
        <span
          className={cn(
            'ml-auto shrink-0 text-xs text-muted-foreground group-hover:text-foreground',
            !fullWidth && 'hidden sm:inline',
            compact && 'lg:hidden'
          )}
        >
          <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border/40 bg-muted px-1.5 font-mono text-[10px] font-medium">
            <span className="text-xs">⌘</span>K
          </kbd>
        </span>
      </button>
    </>
  )
}
