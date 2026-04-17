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

export function ThemeSwitcher() {
  const [mounted, setMounted] = useState(false)
  const { theme, setTheme } = useTheme()

  // Hydration fix - only render after client-side mount
  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return <div className="w-10 h-10 rounded-lg" />
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button 
          className="p-2 hover:bg-muted rounded-lg transition-colors"
          aria-label="Toggle theme"
        >
          {theme === 'light' ? (
            <Sun className="w-4 h-4 text-muted-foreground" />
          ) : theme === 'dark' ? (
            <Moon className="w-4 h-4 text-muted-foreground" />
          ) : (
            <Monitor className="w-4 h-4 text-muted-foreground" />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="right" className="w-40 ml-2">
        <DropdownMenuItem 
          onClick={() => setTheme('light')} 
          className="cursor-pointer flex items-center gap-2"
          data-state={theme === 'light' ? 'checked' : 'unchecked'}
        >
          <Sun className="w-4 h-4" />
          <span>Light</span>
          {theme === 'light' && <span className="ml-auto text-xs">✓</span>}
        </DropdownMenuItem>
        <DropdownMenuItem 
          onClick={() => setTheme('dark')} 
          className="cursor-pointer flex items-center gap-2"
          data-state={theme === 'dark' ? 'checked' : 'unchecked'}
        >
          <Moon className="w-4 h-4" />
          <span>Dark</span>
          {theme === 'dark' && <span className="ml-auto text-xs">✓</span>}
        </DropdownMenuItem>
        <DropdownMenuItem 
          onClick={() => setTheme('system')} 
          className="cursor-pointer flex items-center gap-2"
          data-state={theme === 'system' ? 'checked' : 'unchecked'}
        >
          <Monitor className="w-4 h-4" />
          <span>System</span>
          {theme === 'system' && <span className="ml-auto text-xs">✓</span>}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
