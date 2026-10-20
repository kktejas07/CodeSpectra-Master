'use client'
import { useConfirm } from '@/lib/confirm-context'
import { useAuth } from '@/lib/auth-context'
import { useTour, autoPlayPageTour, type TourStep } from '@/components/tour/tour-context'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-kit'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectValue,
  SelectTrigger,
} from '@/components/ui/select'
import { Loader2, Settings, Moon, Sun, Palette, Bell, Shield, ChevronRight, CheckCircle2, XCircle, Key, Download, Trash2, Camera } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useToast } from '@/lib/toast-context'
import { SkeletonCard } from '@/components/ui/skeleton-boneyard'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import { csrfFetch } from '@/lib/csrf-fetch'
import { usePageGuard } from '@/lib/use-page-guard'
import { FaceSignInSection } from '@/components/dashboard/settings/face-sign-in-section'

const LS = {
  language: 'codespectra:user:language',
  emailNotif: 'codespectra:user:emailNotif',
  pushNotif: 'codespectra:user:pushNotif',
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


export default function SettingsPage() {
  const confirmDialog = useConfirm()
  const gate = usePageGuard('user')
  const { user, signOut } = useAuth()
  const { startTour, setTourSeen } = useTour()

  const addToast = useToast()
  const { theme: nextTheme, setTheme } = useTheme()
  const [language, setLanguage] = useState('en')
  const [twoFactorEnabled, setTwoFactorEnabled] = useState<boolean | null>(null)
  const [emailVerified, setEmailVerified] = useState<boolean | null>(null)
  const [resendingVerify, setResendingVerify] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const [themeReady, setThemeReady] = useState(false)
  const [savingKey, setSavingKey] = useState<'appearance' | null>(null)

  const [pwDialogOpen, setPwDialogOpen] = useState(false)
  const [pwCurrent, setPwCurrent] = useState('')
  const [pwNew, setPwNew] = useState('')
  const [pwConfirm, setPwConfirm] = useState('')
  const [pwError, setPwError] = useState('')
  const [pwSaving, setPwSaving] = useState(false)

  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [deletingAccount, setDeletingAccount] = useState(false)

  useEffect(() => {
    try {
      const lang = window.localStorage.getItem(LS.language)
      if (lang) setLanguage(lang)
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

  // Initialize tour on first visit
  useEffect(() => {
    if (gate.ready) {
      const settingsTour: TourStep[] = [
        {
          target: '[data-tour="settings-header"]',
          title: 'Account settings hub',
          description: 'Manage theme, language, notifications, and security for your account.',
          position: 'bottom',
        },
        {
          target: '[data-tour="settings-appearance"]',
          title: 'Set theme language',
          description: 'Pick Light, Dark, or System theme and language, then save appearance.',
          position: 'bottom',
        },
        {
          target: '[data-tour="settings-notifications"]',
          title: 'Toggle email push',
          description: 'Toggle Email and Push alerts, then save; fine-tune channels in preferences.',
          position: 'bottom',
        },
        {
          target: '[data-tour="settings-security"]',
          title: 'Secure sign-in methods',
          description: 'Review 2FA status, enroll face biometrics, or change your password.',
          position: 'bottom',
        },
        {
          target: '[data-tour="settings-danger"]',
          title: 'Export before deleting',
          description: 'Tip: export your data first; deletion needs password confirmation and cannot be undone.',
          position: 'bottom',
        },
      ]
      autoPlayPageTour('settings', settingsTour)}
  }, [gate.ready, startTour, setTourSeen])

  useEffect(() => {
    fetch('/api/auth/session', { credentials: 'include' })
      .then(r => r.json())
      .then(data => { if (data?.user) setEmailVerified(data.user.emailVerified !== false) })
      .catch(() => {})
  }, [])

  const resendVerification = async () => {
    setResendingVerify(true)
    try {
      const res = await csrfFetch('/api/auth/verify-email', { method: 'POST' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { addToast({ type: 'error', title: 'Couldn’t send email', message: json.error || 'Try again later.' }); return }
      if (json.alreadyVerified) { setEmailVerified(true); addToast({ type: 'success', title: 'Email already verified' }); return }
      addToast({ type: 'success', title: 'Verification email sent', message: 'Open the link in it within 24 hours.' })
    } catch { addToast({ type: 'error', title: 'Network error', message: 'Could not reach server.' }) }
    finally { setResendingVerify(false) }
  }

  useEffect(() => {
    fetch('/api/user/2fa/status')
      .then(r => r.json())
      .then(data => { if (!data.error) setTwoFactorEnabled(data.enabled) })
      .catch(() => {})
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


  const handleChangePassword = async () => {
    if (!pwCurrent || !pwNew) { setPwError('Both fields are required'); return }
    if (pwNew.length < 8) { setPwError('New password must be at least 8 characters'); return }
    setPwSaving(true); setPwError('')
    try {
      const res = await csrfFetch('/api/user/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: pwCurrent, newPassword: pwNew }),
      })
      const json = await res.json()
      if (!res.ok) { setPwError(json.error || 'Failed to change password'); return }
      addToast({ type: 'success', title: 'Password changed', message: 'Use your new password next time you sign in.' })
      setPwDialogOpen(false); setPwCurrent(''); setPwNew('')
    } catch { setPwError('Network error') }
    setPwSaving(false)
  }

  const handleExportData = async () => {
    try {
      const res = await fetch('/api/user/export')
      if (!res.ok) { addToast({ type: 'error', title: 'Export failed', message: 'Could not export your data.' }); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = 'codespectra-export.json'; a.click()
      URL.revokeObjectURL(url)
      addToast({ type: 'success', title: 'Data exported', message: 'Your data has been downloaded.' })
    } catch { addToast({ type: 'error', title: 'Export failed', message: 'Network error.' }) }
  }

  const handleDeleteAccount = async () => {
    if (!await confirmDialog({ title: 'Confirmation', description: 'Are you sure you want to delete your account? This action is irreversible.' })) return
    setDeletePassword('')
    setDeleteModalOpen(true)
  }

  const confirmDeleteAccount = async () => {
    setDeletingAccount(true)
    try {
      const res = await csrfFetch('/api/user/delete-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // The server checks whichever the account has: password, or authenticator code.
        body: JSON.stringify({ password: deletePassword, code: deletePassword }),
      })
      const json = await res.json()

      if (!res.ok) { addToast({ type: 'error', title: 'Delete failed', message: json.error || 'Failed' }); setDeletingAccount(false); return }
      addToast({ type: 'success', title: 'Account deleted', message: 'We are sorry to see you go.' })
      // /auth/logout isn't a page; clear the session, then leave the dashboard.
      await signOut().catch(() => {})
      window.location.href = '/'
    } catch { 
      addToast({ type: 'error', title: 'Network error', message: 'Could not reach server.' }) 
      setDeletingAccount(false)
    }
  }

  if (!gate.ready) return null

  if (!hydrated || !themeReady) {
    return (
      <div className="space-y-8">
        <div className="space-y-2">
          <div className="h-8 w-24 bg-muted/60 rounded animate-pulse" />
          <div className="h-4 w-72 max-w-full bg-muted/40 rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
          <aside className="lg:col-span-1">
            <SkeletonCard />
          </aside>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full space-y-6">
      <div data-tour="settings-header">
        <PageHeader
          illustration="settings"
          className="mb-0"
          icon={<Settings aria-hidden />}
          title="Settings"
          description={
            <>
              Theme, language, notifications and account security. Fine-tune each notification channel in{' '}
              <Link
                href="/dashboard/notifications/preferences"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                notification preferences
              </Link>
              .
            </>
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="overflow-hidden rounded-3xl border-border/70" data-tour="settings-appearance">
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
                    className={`flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-medium transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-primary ${
                      active
                        ? 'border-primary bg-primary/10 text-primary'
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

          <Card className="overflow-hidden rounded-3xl border-border/70" data-tour="settings-notifications">
            <div className="border-b border-border/60 px-6 py-4">
              <div className="flex items-center gap-2 text-foreground">
                <Bell className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold">Notifications</h2>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Choose which emails and in-app alerts you get, per channel and topic.
              </p>
            </div>
            <div className="px-6 py-4">
              <Button variant="outline" className="w-full justify-between rounded-lg sm:w-auto" asChild>
                <Link href="/dashboard/notifications/preferences">
                  Notification preferences
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </Card>

          <Card className="overflow-hidden rounded-3xl border-border/70" data-tour="settings-security">
            <div className="border-b border-border/60 px-6 py-4">
              <div className="flex items-center gap-2 text-foreground">
                <Shield className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold">Security</h2>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Manage your password, two-factor authentication, face sign-in and trusted devices.
              </p>
            </div>
            {emailVerified === false && (
              <>
                <div className="flex flex-col gap-3 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 space-y-0.5">
                    <p className="font-medium text-foreground">Email not verified</p>
                    <p className="text-sm text-muted-foreground">Confirm your email so you can recover your account.</p>
                  </div>
                  <Button variant="outline" size="sm" className="gap-2 shrink-0" onClick={() => void resendVerification()} disabled={resendingVerify}>
                    {resendingVerify ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Resend verification email
                  </Button>
                </div>
                <Separator className="mx-6 w-auto" />
              </>
            )}
            <div className="flex items-center justify-between gap-4 px-6 py-5">
              <div className="min-w-0 space-y-0.5">
                <p className="font-medium text-foreground">Two-factor authentication</p>
                <p className="text-sm text-muted-foreground">
                  {twoFactorEnabled === null
                    ? 'Loading status…'
                    : twoFactorEnabled
                      ? 'Enabled — extra verification at sign-in'
                      : 'Not enabled — set up from your profile page'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {twoFactorEnabled === null ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : twoFactorEnabled ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                ) : (
                  <XCircle className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
            </div>
            {twoFactorEnabled !== null && !twoFactorEnabled && (
              <div className="px-6 pb-4">
                <Button variant="outline" size="sm" asChild className="gap-2">
                  <Link href="/dashboard/profile">
                    <Shield className="h-4 w-4" />
                    Set up 2FA on profile page
                  </Link>
                </Button>
              </div>
            )}
            <Separator className="mx-6 w-auto" />
            <div className="flex items-center justify-between gap-4 px-6 py-5">
              <div className="min-w-0 space-y-0.5">
                <p className="font-medium text-foreground">Face biometrics</p>
                <p className="text-sm text-muted-foreground">
                  {user?.has_enrolled_face 
                    ? 'Enrolled — used for proctored assessments and face sign-in'
                    : 'Not enrolled — required for proctored assessments and face sign-in'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {user?.has_enrolled_face ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                ) : (
                  <XCircle className="h-5 w-5 text-amber-500" />
                )}
              </div>
            </div>
            <div className="px-6 pb-4">
              <Button variant="outline" size="sm" asChild className="gap-2 shrink-0">
                <Link href="/auth/enroll-face?redirect=/dashboard/settings">
                  <Camera className="h-4 w-4" />
                  {user?.has_enrolled_face ? 'Update face biometrics' : 'Enroll face biometrics'}
                </Link>
              </Button>
            </div>
            <Separator className="mx-6 w-auto" />
            <FaceSignInSection />
            <Separator className="mx-6 w-auto" />
            <div className="flex items-center justify-between gap-4 px-6 py-5">
              <div className="min-w-0 space-y-0.5">
                <p className="font-medium text-foreground">Password</p>
                <p className="text-sm text-muted-foreground">Change your account password</p>
              </div>
              <Button variant="outline" size="sm" className="gap-2 shrink-0" onClick={() => { setPwDialogOpen(true); setPwError(''); setPwCurrent(''); setPwNew('') }}>
                <Key className="h-4 w-4" />
                Change password
              </Button>
            </div>
          </Card>

          <Card className="rounded-3xl border border-destructive/30 bg-destructive/5 p-6" data-tour="settings-danger">
            <h2 className="text-lg font-semibold text-destructive">Danger zone</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Download a copy of your data, or permanently delete your account. Deleting cannot be undone.
            </p>
            <Separator className="my-5 bg-destructive/20" />
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button variant="outline" className="rounded-lg border-destructive/40 text-destructive hover:bg-destructive/10 gap-2" onClick={handleExportData}>
                <Download className="h-4 w-4" />
                Export my data
              </Button>
              <Button variant="outline" className="rounded-lg border-destructive/40 text-destructive hover:bg-destructive/10 gap-2" onClick={handleDeleteAccount}>
                <Trash2 className="h-4 w-4" />
                Delete account
              </Button>
            </div>
          </Card>
        </div>

        <aside className="lg:col-span-1">
          <Card className="sticky top-4 rounded-3xl border-border/70 p-5">
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

      <Dialog open={pwDialogOpen} onOpenChange={setPwDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change password</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label htmlFor="pw-current">Current password</Label>
            <PasswordInput id="pw-current" value={pwCurrent} onChange={e => setPwCurrent(e.target.value)} placeholder="Enter current password" />
            <Label htmlFor="pw-new">New password</Label>
            <PasswordInput id="pw-new" value={pwNew} onChange={e => setPwNew(e.target.value)} placeholder="At least 8 characters" />
            {pwError ? <p className="text-xs text-destructive">{pwError}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPwDialogOpen(false)} disabled={pwSaving}>Cancel</Button>
            <Button onClick={handleChangePassword} disabled={pwSaving}>
              {pwSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Change password'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm account deletion</DialogTitle>
            <DialogDescription>
              This permanently deletes your account and signs you out everywhere. Enter your password, or a code from your authenticator app if you sign in with Google or GitHub.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="delete-password">Password or authenticator code</Label>
              <Input 
                id="delete-password"
                type="password"
                value={deletePassword} 
                onChange={e => setDeletePassword(e.target.value)} 
                placeholder="Password or 6-digit code"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteModalOpen(false)} disabled={deletingAccount}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDeleteAccount} disabled={deletingAccount}>
              {deletingAccount ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />} Delete account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

