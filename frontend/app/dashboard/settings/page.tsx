'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Settings,
  Moon,
  Sun,
  Palette,
  Bell,
  Shield,
  ChevronRight,
  Loader2,
} from 'lucide-react'
import { useTheme } from 'next-themes'
import { useToast } from '@/lib/toast-context'

const LS = {
  language: 'codespectra:user:language',
  emailNotif: 'codespectra:user:emailNotif',
  pushNotif: 'codespectra:user:pushNotif',
  twoFactor: 'codespectra:user:twoFactor',
} as const

const languages = [
  { id: 'en', label: 'English' },
  { id: 'es', label: 'Español' },
  { id: 'fr', label: 'Français' },
  { id: 'de', label: 'Deutsch' },
  { id: 'zh', label: '中文' },
]

/** Matches `next-themes` / root `ThemeProvider` (`storageKey="codespectra-theme"`). */
const themes = [
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'dark', label: 'Dark', icon: Moon },
  { id: 'system', label: 'System', icon: Palette },
] as const

function readLsBool(key: string, fallback: boolean) {
  if (typeof window === 'undefined') return fallback
  const v = window.localStorage.getItem(key)
  if (v === 'true') return true
  if (v === 'false') return false
  return fallback
}

export default function SettingsPage() {
  const addToast = useToast()
  const { theme: nextTheme, setTheme } = useTheme()
  const [language, setLanguage] = useState('en')
  const [emailNotifications, setEmailNotifications] = useState(true)
  const [pushNotifications, setPushNotifications] = useState(true)
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const [themeReady, setThemeReady] = useState(false)
  const [savingKey, setSavingKey] = useState<'appearance' | 'notifications' | 'security' | null>(null)

  useEffect(() => {
    try {
      const lang = window.localStorage.getItem(LS.language)
      if (lang) setLanguage(lang)
      setEmailNotifications(readLsBool(LS.emailNotif, true))
      setPushNotifications(readLsBool(LS.pushNotif, true))
      setTwoFactorEnabled(readLsBool(LS.twoFactor, false))
      /** One-time migration from old appearance key to `next-themes`. */
      const legacy = window.localStorage.getItem('codespectra:user:theme')
      if (legacy === 'auto') {
        setTheme('system')
        window.localStorage.removeItem('codespectra:user:theme')
      } else if (legacy === 'light' || legacy === 'dark') {
        setTheme(legacy)
        window.localStorage.removeItem('codespectra:user:theme')
      }
    } catch {
      /* ignore */
    }
    setHydrated(true)
  }, [setTheme])

  useEffect(() => {
    setThemeReady(true)
  }, [])

  const saveAppearance = useCallback(() => {
    setSavingKey('appearance')
    try {
      const t = nextTheme === 'dark' || nextTheme === 'light' || nextTheme === 'system' ? nextTheme : 'light'
      setTheme(t)
      window.localStorage.setItem(LS.language, language)
      addToast({
        type: 'success',
        title: 'Appearance saved',
        message: 'Theme applies across the app; language is stored for this browser.',
      })
    } catch {
      addToast({ type: 'error', title: 'Could not save', message: 'Local storage may be disabled.' })
    } finally {
      setSavingKey(null)
    }
  }, [addToast, language, nextTheme, setTheme])

  const saveNotifications = useCallback(() => {
    setSavingKey('notifications')
    try {
      window.localStorage.setItem(LS.emailNotif, String(emailNotifications))
      window.localStorage.setItem(LS.pushNotif, String(pushNotifications))
      addToast({ type: 'success', title: 'Notification defaults saved', message: 'Channel rules still live under notification preferences.' })
    } catch {
      addToast({ type: 'error', title: 'Could not save', message: 'Local storage may be disabled.' })
    } finally {
      setSavingKey(null)
    }
  }, [addToast, emailNotifications, pushNotifications])

  const saveSecurity = useCallback(() => {
    setSavingKey('security')
    try {
      window.localStorage.setItem(LS.twoFactor, String(twoFactorEnabled))
      addToast({ type: 'success', title: 'Security preferences saved', message: '2FA toggle is local only until auth APIs enforce it.' })
    } catch {
      addToast({ type: 'error', title: 'Could not save', message: 'Local storage may be disabled.' })
    } finally {
      setSavingKey(null)
    }
  }, [addToast, twoFactorEnabled])

  if (!hydrated || !themeReady) {
    return (
      <div className="flex min-h-[30vh] items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading preferences…
      </div>
    )
  }

  return (
    <div className="w-full space-y-8">
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Settings className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Settings</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Theme follows the app-wide setting (same as the sidebar control). Language and toggles below save in this
              browser; notification channels can be tuned in detail from{' '}
              <Link
                href="/dashboard/notifications/preferences"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                notification preferences
              </Link>
              .
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="rounded-xl border-border/60 shadow-sm">
            <div className="border-b border-border/60 px-6 py-4">
              <div className="flex items-center gap-2 text-foreground">
                <Palette className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold">Appearance</h2>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Theme matches the sidebar control and applies across the whole app. Language is remembered on this
                device only.
              </p>
            </div>
            <div className="px-6 py-5">
            <Label className="text-sm font-medium text-foreground">Theme</Label>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {themes.map((t) => {
                const Icon = t.icon
                const active = (nextTheme ?? 'light') === t.id
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTheme(t.id)}
                    className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-3 text-sm font-medium transition-colors ${
                      active
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border/60 bg-background text-muted-foreground hover:border-primary/40 hover:bg-muted/40'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden />
                    {t.label}
                </button>
              )
            })}
            </div>
            <Separator className="my-6" />
            <Label htmlFor="language" className="text-sm font-medium text-foreground">
              Language
            </Label>
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger id="language" className="mt-2 h-10 w-full max-w-md rounded-lg border-border/60" size="default">
                <SelectValue placeholder="Select language" />
              </SelectTrigger>
              <SelectContent>
                {languages.map((lang) => (
                  <SelectItem key={lang.id} value={lang.id}>
                    {lang.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            </div>
            <div className="flex justify-end border-t border-border/60 bg-muted/20 px-6 py-4">
              <Button
                className="gap-2 rounded-lg"
                onClick={() => void saveAppearance()}
                disabled={savingKey !== null}
              >
                {savingKey === 'appearance' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save appearance
              </Button>
            </div>
          </Card>

          <Card className="rounded-xl border-border/60 shadow-sm">
            <div className="border-b border-border/60 px-6 py-4">
              <div className="flex items-center gap-2 text-foreground">
                <Bell className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold">Notifications</h2>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                High-level toggles; channel rules live under notification preferences.
              </p>
            </div>
            <div className="divide-y divide-border/60 px-6">
              <div className="flex items-center justify-between gap-4 py-4">
                <div className="min-w-0 space-y-0.5">
                  <p className="font-medium text-foreground">Email</p>
                  <p className="text-sm text-muted-foreground">Product and account updates by email</p>
                </div>
                <Switch checked={emailNotifications} onCheckedChange={setEmailNotifications} />
              </div>
              <div className="flex items-center justify-between gap-4 py-4">
                <div className="min-w-0 space-y-0.5">
                  <p className="font-medium text-foreground">Push</p>
                  <p className="text-sm text-muted-foreground">In-browser alerts when you are online</p>
                </div>
                <Switch checked={pushNotifications} onCheckedChange={setPushNotifications} />
              </div>
            </div>
            <div className="flex flex-col gap-3 border-t border-border/60 bg-muted/20 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
              <Button variant="outline" className="w-full justify-between rounded-lg sm:w-auto" asChild>
                <Link href="/dashboard/notifications/preferences">
                  Notification preferences
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button className="gap-2 rounded-lg sm:min-w-[160px]" onClick={() => void saveNotifications()} disabled={savingKey !== null}>
                {savingKey === 'notifications' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save notifications
              </Button>
            </div>
          </Card>

          <Card className="rounded-xl border-border/60 shadow-sm">
            <div className="border-b border-border/60 px-6 py-4">
              <div className="flex items-center gap-2 text-foreground">
                <Shield className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold">Security</h2>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">Account protection (local preview until backend wiring).</p>
            </div>
            <div className="flex items-center justify-between gap-4 px-6 py-5">
              <div className="min-w-0 space-y-0.5">
                <p className="font-medium text-foreground">Two-factor authentication</p>
                <p className="text-sm text-muted-foreground">Extra verification at sign-in</p>
              </div>
              <Switch checked={twoFactorEnabled} onCheckedChange={setTwoFactorEnabled} />
            </div>
            <div className="flex flex-col gap-3 border-t border-border/60 bg-muted/20 px-6 py-4 sm:flex-row sm:justify-end">
              <Button variant="outline" className="w-full rounded-lg sm:w-auto">
                Change password
              </Button>
              <Button className="gap-2 rounded-lg sm:min-w-[140px]" onClick={() => void saveSecurity()} disabled={savingKey !== null}>
                {savingKey === 'security' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save security
              </Button>
            </div>
          </Card>

          <Card className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-destructive">Danger zone</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Irreversible or sensitive actions. Confirm in a flow before executing in production.
            </p>
            <Separator className="my-5 bg-destructive/20" />
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button variant="outline" className="rounded-lg border-destructive/40 text-destructive hover:bg-destructive/10">
                Export my data
              </Button>
              <Button variant="outline" className="rounded-lg border-destructive/40 text-destructive hover:bg-destructive/10">
                Delete account
              </Button>
            </div>
          </Card>
        </div>

        <aside className="lg:col-span-1">
          <Card className="sticky top-4 rounded-xl border-border/60 p-5 shadow-sm">
            <p className="text-sm font-medium text-foreground">Account</p>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              Billing, invoices, and plan limits are under{' '}
              <Link href="/dashboard/billing" className="font-medium text-primary underline-offset-4 hover:underline">
                Billing
              </Link>
              . Organization tools for admins live under the Admin section in the sidebar.
            </p>
          </Card>
        </aside>
      </div>
    </div>
  )
}
