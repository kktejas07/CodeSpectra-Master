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
import { LanguageSelect } from '@/components/i18n/language-switcher'
import { useT } from '@/lib/i18n/client'
import type { Translator } from '@/lib/i18n/catalog'

const LS = {
  emailNotif: 'codespectra:user:emailNotif',
  pushNotif: 'codespectra:user:pushNotif',
} as const

/** Matches `next-themes` / root `ThemeProvider` (`storageKey="codespectra-theme"`). */
const themes = (t: Translator) => ([
  { id: 'light', label: t('account.light'), icon: Sun },
  { id: 'dark', label: t('account.dark'), icon: Moon },
  { id: 'system', label: t('account.system'), icon: Palette },
] as const)


export default function SettingsPage() {
  const confirmDialog = useConfirm()
  const gate = usePageGuard('user')
  const { user, signOut } = useAuth()
  const { startTour, setTourSeen } = useTour()

  const addToast = useToast()
  const { theme: nextTheme, setTheme } = useTheme()
  // Interface language lives on the profile + cs_locale cookie (lib/i18n), not localStorage.
  const { t } = useT()
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
      window.localStorage.removeItem('codespectra:user:language')
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
          title: t('account.accountSettingsHub'),
          description: t('account.manageThemeLanguageNotificationsAndSecur85c'),
          position: 'bottom',
        },
        {
          target: '[data-tour="settings-appearance"]',
          title: t('account.setThemeLanguage'),
          description: t('account.pickLightDarkOrSystemTheme935'),
          position: 'bottom',
        },
        {
          target: '[data-tour="settings-notifications"]',
          title: t('account.toggleEmailPush'),
          description: t('account.toggleEmailAndPushAlertsThen2a4'),
          position: 'bottom',
        },
        {
          target: '[data-tour="settings-security"]',
          title: t('account.secureSignInMethods'),
          description: t('account.review2faStatusEnrollFaceBiometrics3ec'),
          position: 'bottom',
        },
        {
          target: '[data-tour="settings-danger"]',
          title: t('account.exportBeforeDeleting'),
          description: t('account.tipExportYourDataFirstDeletion6bf'),
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
      if (!res.ok) { addToast({ type: 'error', title: t('account.couldntSendEmail'), message: json.error || t('account.tryAgainLater') }); return }
      if (json.alreadyVerified) { setEmailVerified(true); addToast({ type: 'success', title: t('account.emailAlreadyVerified') }); return }
      addToast({ type: 'success', title: t('account.verificationEmailSent'), message: t('account.openTheLinkInItWithinc89') })
    } catch { addToast({ type: 'error', title: t('account.networkError'), message: t('account.couldNotReachServer') }) }
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
      const chosen = nextTheme === 'dark' || nextTheme === 'light' || nextTheme === 'system' ? nextTheme : 'light'
      setTheme(chosen)
      addToast({
        type: 'success',
        title: t('dashboard.appearanceSaved'),
        message: t('dashboard.appearanceSavedBody'),
      })
    } catch {
      addToast({ type: 'error', title: t('account.couldNotSave'), message: t('account.localStorageMayBeDisabled') })
    } finally {
      setSavingKey(null)
    }
  }, [addToast, nextTheme, setTheme, t])


  const handleChangePassword = async () => {
    if (!pwCurrent || !pwNew) { setPwError(t('account.bothFieldsAreRequired')); return }
    if (pwNew.length < 8) { setPwError(t('account.newPasswordMustBeAtLeast2ad')); return }
    setPwSaving(true); setPwError('')
    try {
      const res = await csrfFetch('/api/user/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: pwCurrent, newPassword: pwNew }),
      })
      const json = await res.json()
      if (!res.ok) { setPwError(json.error || t('account.failedToChangePassword')); return }
      addToast({ type: 'success', title: t('account.passwordChanged'), message: t('account.useYourNewPasswordNextTimee2d') })
      setPwDialogOpen(false); setPwCurrent(''); setPwNew('')
    } catch { setPwError(t('account.networkError')) }
    setPwSaving(false)
  }

  const handleExportData = async () => {
    try {
      const res = await fetch('/api/user/export')
      if (!res.ok) { addToast({ type: 'error', title: t('account.exportFailed'), message: t('account.couldNotExportYourData') }); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = 'codespectra-export.json'; a.click()
      URL.revokeObjectURL(url)
      addToast({ type: 'success', title: t('account.dataExported'), message: t('account.yourDataHasBeenDownloaded') })
    } catch { addToast({ type: 'error', title: t('account.exportFailed'), message: t('account.networkError2') }) }
  }

  const handleDeleteAccount = async () => {
    if (!await confirmDialog({ title: t('account.confirmation'), description: t('account.areYouSureYouWantToc5c') })) return
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

      if (!res.ok) { addToast({ type: 'error', title: t('account.deleteFailed'), message: json.error || t('account.failed') }); setDeletingAccount(false); return }
      addToast({ type: 'success', title: t('account.accountDeleted'), message: t('account.weAreSorryToSeeYou474') })
      // /auth/logout isn't a page; clear the session, then leave the dashboard.
      await signOut().catch(() => {})
      window.location.href = '/'
    } catch { 
      addToast({ type: 'error', title: t('account.networkError'), message: t('account.couldNotReachServer') }) 
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
          title={t('account.settings')}
          description={
            <>{t('account.themeLanguageNotificationsAndAccountSecu914')}{' '}<Link
                href="/dashboard/notifications/preferences"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >{t('account.notificationPreferences')}</Link>
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
                <h2 className="text-lg font-semibold">{t('account.appearance')}</h2>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {t('dashboard.appearanceHint')}
              </p>
            </div>
            <div className="px-6 py-5">
            <Label className="text-sm font-medium text-foreground">{t('account.theme')}</Label>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {themes(t).map((th) => {
                const Icon = th.icon
                const active = (nextTheme ?? 'light') === th.id
                return (
                  <button
                    key={th.id}
                    type="button"
                    onClick={() => setTheme(th.id)}
                    className={`flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-medium transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-primary ${
                      active
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border/60 bg-background text-muted-foreground hover:border-primary/40 hover:bg-muted/40'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden />
                    {th.label}
                </button>
              )
            })}
            </div>
            <Separator className="my-6" />
            <Label id="language-label" className="text-sm font-medium text-foreground">
              {t('common.language')}
            </Label>
            <p className="mt-1 text-sm text-muted-foreground">{t('dashboard.languageHint')}</p>
            <LanguageSelect
              className="mt-3"
              onChanged={() => addToast({ type: 'success', title: t('dashboard.languageSaved'), message: t('dashboard.languageSavedBody') })}
            />
            </div>
            <div className="flex justify-end border-t border-border/60 bg-muted/20 px-6 py-4">
              <Button
                className="gap-2 rounded-lg"
                onClick={() => void saveAppearance()}
                disabled={savingKey !== null}
              >
                {savingKey === 'appearance' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{t('account.saveAppearance')}</Button>
            </div>
          </Card>

          <Card className="overflow-hidden rounded-3xl border-border/70" data-tour="settings-notifications">
            <div className="border-b border-border/60 px-6 py-4">
              <div className="flex items-center gap-2 text-foreground">
                <Bell className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold">{t('account.notifications')}</h2>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{t('account.chooseWhichEmailsAndInApp06d')}</p>
            </div>
            <div className="px-6 py-4">
              <Button variant="outline" className="w-full justify-between rounded-lg sm:w-auto" asChild>
                <Link href="/dashboard/notifications/preferences">{t('account.notificationPreferences2')}<ChevronRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </Card>

          <Card className="overflow-hidden rounded-3xl border-border/70" data-tour="settings-security">
            <div className="border-b border-border/60 px-6 py-4">
              <div className="flex items-center gap-2 text-foreground">
                <Shield className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold">{t('account.security')}</h2>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{t('account.manageYourPasswordTwoFactorAuthenticatio125')}</p>
            </div>
            {emailVerified === false && (
              <>
                <div className="flex flex-col gap-3 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 space-y-0.5">
                    <p className="font-medium text-foreground">{t('account.emailNotVerified')}</p>
                    <p className="text-sm text-muted-foreground">{t('account.confirmYourEmailSoYouCand1d')}</p>
                  </div>
                  <Button variant="outline" size="sm" className="gap-2 shrink-0" onClick={() => void resendVerification()} disabled={resendingVerify}>
                    {resendingVerify ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{t('account.resendVerificationEmail')}</Button>
                </div>
                <Separator className="mx-6 w-auto" />
              </>
            )}
            <div className="flex items-center justify-between gap-4 px-6 py-5">
              <div className="min-w-0 space-y-0.5">
                <p className="font-medium text-foreground">{t('account.twoFactorAuthentication')}</p>
                <p className="text-sm text-muted-foreground">
                  {twoFactorEnabled === null
                    ? t('account.loadingStatus')
                    : twoFactorEnabled
                      ? t('account.enabledExtraVerificationAtSignIn')
                      : t('account.notEnabledSetUpFromYour804')}
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
                    <Shield className="h-4 w-4" />{t('account.setUp2faOnProfilePage')}</Link>
                </Button>
              </div>
            )}
            <Separator className="mx-6 w-auto" />
            <div className="flex items-center justify-between gap-4 px-6 py-5">
              <div className="min-w-0 space-y-0.5">
                <p className="font-medium text-foreground">{t('account.faceBiometrics')}</p>
                <p className="text-sm text-muted-foreground">
                  {user?.has_enrolled_face 
                    ? t('account.enrolledUsedForProctoredAssessmentsAndc73')
                    : t('account.notEnrolledRequiredForProctoredAssessmen4d3')}
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
                  {user?.has_enrolled_face ? t('account.updateFaceBiometrics') : t('account.enrollFaceBiometrics')}
                </Link>
              </Button>
            </div>
            <Separator className="mx-6 w-auto" />
            <FaceSignInSection />
            <Separator className="mx-6 w-auto" />
            <div className="flex items-center justify-between gap-4 px-6 py-5">
              <div className="min-w-0 space-y-0.5">
                <p className="font-medium text-foreground">{t('account.password')}</p>
                <p className="text-sm text-muted-foreground">{t('account.changeYourAccountPassword')}</p>
              </div>
              <Button variant="outline" size="sm" className="gap-2 shrink-0" onClick={() => { setPwDialogOpen(true); setPwError(''); setPwCurrent(''); setPwNew('') }}>
                <Key className="h-4 w-4" />{t('account.changePassword')}</Button>
            </div>
          </Card>

          <Card className="rounded-3xl border border-destructive/30 bg-destructive/5 p-6" data-tour="settings-danger">
            <h2 className="text-lg font-semibold text-destructive">{t('account.dangerZone')}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t('account.downloadACopyOfYourData567')}</p>
            <Separator className="my-5 bg-destructive/20" />
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button variant="outline" className="rounded-lg border-destructive/40 text-destructive hover:bg-destructive/10 gap-2" onClick={handleExportData}>
                <Download className="h-4 w-4" />{t('account.exportMyData')}</Button>
              <Button variant="outline" className="rounded-lg border-destructive/40 text-destructive hover:bg-destructive/10 gap-2" onClick={handleDeleteAccount}>
                <Trash2 className="h-4 w-4" />{t('account.deleteAccount')}</Button>
            </div>
          </Card>
        </div>

        <aside className="lg:col-span-1">
          <Card className="sticky top-4 rounded-3xl border-border/70 p-5">
            <p className="text-sm font-medium text-foreground">{t('account.account')}</p>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{t('account.billingInvoicesAndPlanLimitsAreeec')}{' '}<Link href="/dashboard/billing" className="font-medium text-primary underline-offset-4 hover:underline">{t('account.billing')}</Link>{t('account.organizationToolsForAdminsLiveUnderb30')}</p>
          </Card>
        </aside>
      </div>

      <Dialog open={pwDialogOpen} onOpenChange={setPwDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('account.changePassword')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label htmlFor="pw-current">{t('account.currentPassword')}</Label>
            <PasswordInput id="pw-current" value={pwCurrent} onChange={e => setPwCurrent(e.target.value)} placeholder={t('account.enterCurrentPassword')} />
            <Label htmlFor="pw-new">{t('account.newPassword')}</Label>
            <PasswordInput id="pw-new" value={pwNew} onChange={e => setPwNew(e.target.value)} placeholder={t('account.atLeast8Characters')} />
            {pwError ? <p className="text-xs text-destructive">{pwError}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPwDialogOpen(false)} disabled={pwSaving}>{t('common.cancel')}</Button>
            <Button onClick={handleChangePassword} disabled={pwSaving}>
              {pwSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : t('account.changePassword')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('account.confirmAccountDeletion')}</DialogTitle>
            <DialogDescription>{t('account.thisPermanentlyDeletesYourAccountAndd58')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="delete-password">{t('account.passwordOrAuthenticatorCode')}</Label>
              <Input 
                id="delete-password"
                type="password"
                value={deletePassword} 
                onChange={e => setDeletePassword(e.target.value)} 
                placeholder={t('account.passwordOr6DigitCode')}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteModalOpen(false)} disabled={deletingAccount}>{t('common.cancel')}</Button>
            <Button variant="destructive" onClick={confirmDeleteAccount} disabled={deletingAccount}>
              {deletingAccount ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}{' '}{t('account.deleteAccount')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

