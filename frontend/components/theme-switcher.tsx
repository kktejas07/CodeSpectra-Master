'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { Moon, Sun, Monitor } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

type ThemeSwitcherProps = {
  /** Narrow sidebar: icon-only trigger, menu opens upward to avoid clipping. */
  compact?: boolean
}

export function ThemeSwitcher({ compact }: ThemeSwitcherProps) {
  const [mounted, setMounted] = useState(false)
  const { theme, setTheme } = useTheme()

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return <div className={cn('rounded-lg', compact ? 'h-9 w-9' : 'h-10 w-10')} />
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
            compact ? 'flex h-9 w-9 shrink-0 items-center justify-center p-0' : 'p-2'
          )}
          aria-label="Toggle theme"
        >
          {theme === 'light' ? (
            <Sun className="h-4 w-4 shrink-0" />
          ) : theme === 'dark' ? (
            <Moon className="h-4 w-4 shrink-0" />
          ) : (
            <Monitor className="h-4 w-4 shrink-0" />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={compact ? 'top' : 'right'}
        align={compact ? 'center' : 'start'}
        className="w-40"
      >
        <DropdownMenuItem
          onClick={() => setTheme('light')}
          className="flex cursor-pointer items-center gap-2"
          data-state={theme === 'light' ? 'checked' : 'unchecked'}
        >
          <Sun className="h-4 w-4" />
          <span>Light</span>
          {theme === 'light' && <span className="ml-auto text-xs">✓</span>}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme('dark')}
          className="flex cursor-pointer items-center gap-2"
          data-state={theme === 'dark' ? 'checked' : 'unchecked'}
        >
          <Moon className="h-4 w-4" />
          <span>Dark</span>
          {theme === 'dark' && <span className="ml-auto text-xs">✓</span>}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme('system')}
          className="flex cursor-pointer items-center gap-2"
          data-state={theme === 'system' ? 'checked' : 'unchecked'}
        >
          <Monitor className="h-4 w-4" />
          <span>System</span>
          {theme === 'system' && <span className="ml-auto text-xs">✓</span>}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
