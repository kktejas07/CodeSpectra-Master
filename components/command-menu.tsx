'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Command, Home, Trophy, Code2, BookOpen, BarChart3, Star, Settings } from 'lucide-react'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'

const commands = [
  { label: 'Dashboard', icon: Home, href: '/dashboard' },
  { label: 'Arena', icon: Trophy, href: '/dashboard/arena' },
  { label: 'Scanner', icon: Code2, href: '/dashboard/scanner' },
  { label: 'Learning', icon: BookOpen, href: '/dashboard/learning' },
  { label: 'Leaderboard', icon: BarChart3, href: '/dashboard/leaderboard' },
  { label: 'Achievements', icon: Star, href: '/dashboard/achievements' },
  { label: 'Settings', icon: Settings, href: '/dashboard/settings' },
]

export function CommandMenu() {
  const router = useRouter()
  const [open, setOpen] = useState(false)

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
                key={command.href}
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
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-border/40 bg-background hover:bg-muted transition-colors group"
      >
        <Search className="w-4 h-4 text-muted-foreground" />
        <span className="hidden sm:inline text-muted-foreground">Search...</span>
        <span className="ml-auto pl-2 text-xs text-muted-foreground group-hover:text-foreground">
          <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border/40 bg-muted px-1.5 font-mono text-[10px] font-medium">
            <span className="text-xs">⌘</span>K
          </kbd>
        </span>
      </button>
    </>
  )
}
