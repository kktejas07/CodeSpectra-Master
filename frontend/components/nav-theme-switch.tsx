'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { Moon, Sun } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

type NavThemeSwitchProps = {
  /** Compact for pill nav; relaxed for default bar */
  compact?: boolean
  className?: string
}

/**
 * Light / dark toggle for the marketing nav (uses `next-themes` from root layout).
 */
export function NavThemeSwitch({ compact, className }: NavThemeSwitchProps) {
  const [mounted, setMounted] = useState(false)
  const { resolvedTheme, setTheme } = useTheme()

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <div
        className={cn('flex shrink-0 items-center', compact ? 'h-7 w-16' : 'h-8 w-18', className)}
        aria-hidden
      />
    )
  }

  const isDark = resolvedTheme === 'dark'

  return (
    <div
      className={cn(
        'flex shrink-0 items-center gap-1.5 rounded-full border border-border/50 bg-muted/30 px-2 py-1 dark:bg-muted/40',
        compact && 'gap-1 border-border/40 px-1.5 py-0.5',
        className
      )}
    >
      <Sun
        className={cn(
          'shrink-0 text-amber-500/90 dark:text-muted-foreground/50',
          compact ? 'h-3 w-3' : 'h-3.5 w-3.5'
        )}
        aria-hidden
      />
      <Switch
        checked={isDark}
        onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
        aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
        className={cn(compact ? 'scale-90' : 'scale-100')}
      />
      <Moon
        className={cn(
          'shrink-0 text-muted-foreground/50 dark:text-indigo-200/90',
          compact ? 'h-3 w-3' : 'h-3.5 w-3.5'
        )}
        aria-hidden
      />
    </div>
  )
}
