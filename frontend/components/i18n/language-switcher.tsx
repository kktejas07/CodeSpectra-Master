'use client'

/**
 * Interface language switcher. `LanguageMenuItems` drops into the account
 * dropdown; `LanguageSelect` is the inline control (Settings, auth header).
 * Saving sets the cookie (and the profile when signed in), then refreshes the
 * server layouts so every server-rendered string switches too.
 */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Languages, Loader2 } from 'lucide-react'
import { LOCALES, LOCALE_META, type Locale } from '@/lib/i18n/config'
import { persistLocale, useT } from '@/lib/i18n/client'
import { DropdownMenuItem, DropdownMenuLabel } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

function useSwitchLocale() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [saving, setSaving] = useState<Locale | null>(null)
  const switchTo = async (next: Locale) => {
    setSaving(next)
    await persistLocale(next)
    startTransition(() => router.refresh())
    setSaving(null)
  }
  return { switchTo, busy: pending || saving !== null }
}

export function LanguageMenuItems() {
  const { t, locale } = useT()
  const { switchTo, busy } = useSwitchLocale()
  return (
    <>
      <DropdownMenuLabel className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Languages className="h-3.5 w-3.5" aria-hidden />
        {t('common.language')}
        {busy && <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin" aria-hidden />}
      </DropdownMenuLabel>
      {LOCALES.map((l) => (
        <DropdownMenuItem
          key={l}
          lang={l}
          disabled={busy}
          onSelect={(e) => { e.preventDefault(); if (l !== locale) void switchTo(l) }}
          className="flex cursor-pointer items-center gap-2"
          aria-checked={l === locale}
          role="menuitemradio"
        >
          <Check className={cn('h-4 w-4', l === locale ? 'opacity-100' : 'opacity-0')} aria-hidden />
          <span>{LOCALE_META[l].native}</span>
          {l !== 'en' && <span className="ml-auto text-xs text-muted-foreground" lang="en">{LOCALE_META[l].english}</span>}
        </DropdownMenuItem>
      ))}
    </>
  )
}

/** Segmented control: three short native names fit at 360px. */
export function LanguageSelect({ className, onChanged }: { className?: string; onChanged?: (l: Locale) => void }) {
  const { t, locale } = useT()
  const { switchTo, busy } = useSwitchLocale()
  return (
    <div role="radiogroup" aria-label={t('common.language')} className={cn('inline-flex flex-wrap gap-1.5', className)}>
      {LOCALES.map((l) => {
        const active = l === locale
        return (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={active}
            lang={l}
            disabled={busy}
            onClick={async () => { if (!active) { await switchTo(l); onChanged?.(l) } }}
            className={cn(
              'inline-flex min-h-10 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-60',
              active ? 'border-primary bg-primary/10 text-primary' : 'border-border/60 bg-background text-muted-foreground hover:border-primary/40 hover:bg-muted/40',
            )}
          >
            {active && <Check className="h-3.5 w-3.5" aria-hidden />}
            {LOCALE_META[l].native}
          </button>
        )
      })}
    </div>
  )
}

/** Compact native <select> for tight headers (auth pages). */
export function LanguageCompactSelect({ className }: { className?: string }) {
  const { t, locale } = useT()
  const { switchTo, busy } = useSwitchLocale()
  return (
    <label className={cn('inline-flex items-center gap-1.5 text-sm', className)}>
      <Languages className="h-4 w-4 opacity-70" aria-hidden />
      <span className="sr-only">{t('common.language')}</span>
      <select
        value={locale}
        disabled={busy}
        onChange={(e) => void switchTo(e.target.value as Locale)}
        className="h-9 rounded-md border border-transparent bg-transparent px-1 text-sm hover:border-current/20 focus-visible:outline-2"
      >
        {LOCALES.map((l) => <option key={l} value={l} lang={l}>{LOCALE_META[l].native}</option>)}
      </select>
    </label>
  )
}
