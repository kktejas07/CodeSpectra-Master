'use client'
import { useLocaleDates } from '@/lib/i18n/use-dates'
import { useConfirm } from '@/lib/confirm-context'

import { useEffect, useState, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { DigitalIdCard } from '@/components/dashboard/digital-id-card'
import { ContributionGraph } from '@/components/dashboard/contribution-graph'
import { ActivityTimeline } from '@/components/dashboard/activity-timeline'
import { AiCreditsWidget } from '@/components/ui/ai-credits-widget'
import { Edit2, Trophy, Shield, Clock, FolderGit2, Activity, Loader, CheckCircle2, XCircle, Smartphone, User, Loader2, Sparkles, TrendingUp, ArrowLeft, Eye, Lightbulb, FileText, Briefcase, Award, Info, FileStack, Trash2, Plus, Image as ImageIcon, Share2, Globe } from 'lucide-react'
import { csrfFetch } from '@/lib/csrf-fetch'
import { usePageGuard } from '@/lib/use-page-guard'
import { useTour, autoPlayPageTour, type TourStep } from '@/components/tour/tour-context'
import { SkeletonText } from '@/components/ui/skeleton-boneyard'
import { UserAvatar } from '@/components/ui/user-avatar'
import Link from 'next/link'
import Image from 'next/image'
import { useT } from '@/lib/i18n/client'
import { useApiError } from '@/lib/i18n/use-api-error'

interface ActivityItem {
  ts: string
  type: string
  title: string
  meta: string
  detail: string
}

function TwoFactorAuth() {
  const apiError = useApiError()
  const { t } = useT()
  const [status, setStatus] = useState<{ enabled: boolean; setupAt?: string | null; verifiedAt?: string | null } | null>(null)
  const [loading, setLoading] = useState(true)
  const [setupData, setSetupData] = useState<{ secret: string; otpauth: string } | null>(null)
  const [qrCode, setQrCode] = useState('')
  const [verifyToken, setVerifyToken] = useState('')
  const [verifyError, setVerifyError] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [setupError, setSetupError] = useState('')
  const [disableOpen, setDisableOpen] = useState(false)
  const [disableSecret, setDisableSecret] = useState('')
  const [disableError, setDisableError] = useState('')
  const [disabling, setDisabling] = useState(false)

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/user/2fa/status')
      const json = await res.json()
      if (!json.error) setStatus(json)
    } catch { /* ignore */ }
    setLoading(false)
  }

  useEffect(() => { fetchStatus() }, [])

  const handleSetup = async () => {
    setLoading(true)
    setSetupError('')
    try {
      const res = await csrfFetch('/api/user/2fa/setup', { method: 'POST' })
      const json = await res.json().catch(() => ({}))
      if (res.ok && json.otpauth) {
        setSetupData({ secret: json.secret, otpauth: json.otpauth })
        const QRCode = await import('qrcode')
        const url = await QRCode.toDataURL(json.otpauth, { width: 200, margin: 2 })
        setQrCode(url)
      } else {
        setSetupError(apiError(json, t('account.couldntStart2faSetupTryAgain')))
      }
    } catch { setSetupError(t('account.couldntReachTheServerCheckYour6e9')) }
    setLoading(false)
  }

  const handleVerify = async () => {
    setVerifying(true)
    setVerifyError('')
    try {
      const res = await csrfFetch('/api/user/2fa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: verifyToken }),
      })
      const json = await res.json()
      if (json.success) {
        setSetupData(null)
        setQrCode('')
        setVerifyToken('')
        await fetchStatus()
      } else {
        setVerifyError(apiError(json, t('account.verificationFailed')))
      }
    } catch { setVerifyError(t('account.networkError')) }
    setVerifying(false)
  }

  const handleDisable = async () => {
    const value = disableSecret.trim()
    if (!value) return
    setDisabling(true)
    setDisableError('')
    try {
      // A 6-digit value is an authenticator code; anything else is the password.
      const body = /^\d{6}$/.test(value) ? { code: value } : { password: value }
      const res = await csrfFetch('/api/user/2fa/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setDisableError(apiError(json, t('account.couldntTurnOff2faTryAgain')))
      } else {
        setDisableOpen(false)
        setDisableSecret('')
        setQrCode('')
        setSetupData(null)
        await fetchStatus()
      }
    } catch { setDisableError(t('account.couldntReachTheServerCheckYour6e9')) }
    setDisabling(false)
  }

  return (
    <Card className="rounded-3xl border-border/70 p-5 text-sm">
      <div className="mb-3 flex items-center gap-2">
        <Shield className="h-4 w-4 text-primary" aria-hidden />
        <span className="font-medium text-foreground">{t('account.twoFactorAuthentication')}</span>
      </div>
      {loading ? (
        <SkeletonText lines={2} />
      ) : status?.enabled ? (
        <div>
          <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
            <CheckCircle2 className="h-4 w-4" />
            <span className="font-medium">{t('account.enabled')}</span>
          </div>
          {disableOpen ? (
            <form className="mt-3 space-y-2" onSubmit={e => { e.preventDefault(); handleDisable() }}>
              <label htmlFor="disable-2fa-secret" className="block text-xs text-muted-foreground">{t('account.enterYourCurrentPasswordOrA7e5')}</label>
              <input
                id="disable-2fa-secret"
                type="password"
                autoComplete="current-password"
                value={disableSecret}
                onChange={e => setDisableSecret(e.target.value)}
                autoFocus
                className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              {disableError ? <p className="text-xs text-destructive">{disableError}</p> : null}
              <div className="flex gap-2">
                <Button type="button" variant="ghost" size="sm" className="flex-1" onClick={() => { setDisableOpen(false); setDisableSecret(''); setDisableError('') }}>{t('common.cancel')}</Button>
                <Button type="submit" variant="destructive" size="sm" className="flex-1" disabled={!disableSecret.trim() || disabling}>
                  {disabling ? <Loader className="h-3 w-3 animate-spin" /> : t('account.turnOff2fa')}
                </Button>
              </div>
            </form>
          ) : (
            <Button variant="outline" size="sm" className="mt-3 w-full gap-2" onClick={() => setDisableOpen(true)}>
              <XCircle className="h-3.5 w-3.5" />{t('account.disable')}</Button>
          )}
        </div>
      ) : setupData ? (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">{t('account.scanThisWithYourAuthenticatorAppebd')}</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {qrCode ? <img src={qrCode} alt={t('account.twoFactorSetupQrCode')} className="mx-auto h-40 w-40 rounded-xl border border-border bg-white p-1" /> : <div className="mx-auto h-40 w-40 rounded-xl border border-border flex items-center justify-center"><Loader className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
          <p className="text-center text-[10px] text-muted-foreground break-all font-mono">{setupData.secret}</p>
          <div className="flex gap-2">
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={verifyToken}
              onChange={e => setVerifyToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              aria-label={t('account.n6DigitCode')}
              className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-center text-sm font-mono tabular-nums text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Button size="sm" onClick={handleVerify} disabled={verifyToken.length !== 6 || verifying}>
              {verifying ? <Loader className="h-3 w-3 animate-spin" /> : t('account.verify')}
            </Button>
          </div>
          {verifyError ? <p className="text-xs text-destructive">{verifyError}</p> : null}
        </div>
      ) : (
        <div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <XCircle className="h-4 w-4" />
            <span>{t('account.notEnabled')}</span>
          </div>
          <Button variant="outline" size="sm" className="mt-3 w-full gap-2" onClick={handleSetup}>
            <Smartphone className="h-3.5 w-3.5" />{t('account.setUp')}</Button>
          {setupError ? <p className="mt-2 text-xs text-destructive">{setupError}</p> : null}
        </div>
      )}
    </Card>
  )
}

export default function ProfilePage() {
  const { formatDate } = useLocaleDates()
  const { t: tr } = useT()
  const confirmDialog = useConfirm()
  const gate = usePageGuard('user')

  // Public profile handle (/users/<handle>); falls back to the user id.
  const [publicHandle, setPublicHandle] = useState<string | null>(null)
  const [user, setUser] = useState<{ id: string; email: string; name?: string; role?: string; lastLoginMethod?: string | null; lastLoginAt?: string | null; createdAt?: string } | null>(null)
  const [kycStatus, setKycStatus] = useState<{ verified?: boolean; status?: string } | null>(null)
  const [stats, setStats] = useState<Record<string, number | string> | null>(null)
  const [xp, setXp] = useState(0)
  const [level, setLevel] = useState(1)
  const [globalRank, setGlobalRank] = useState<number | null>(null)
  const [aboutBio, setAboutBio] = useState<string>('')
  const [socialLinks, setSocialLinks] = useState<{ linkedin?: string; github?: string; portfolio?: string }>({})
  const [currentStreak, setCurrentStreak] = useState(0)
  const [maxStreak, setMaxStreak] = useState(0)
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [heatmapData, setHeatmapData] = useState<{
    cells: number[][] | null
    dayLabels: string[]
    monthLabels: Array<{ label: string; colIndex: number }>
    tooltipData: Record<string, { date: string; count: number; types: { scan: number; review: number; fix: number; challenge: number } }>
    totalContributions: number
    totalActiveDays: number
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [coverTheme, setCoverTheme] = useState('blue-3d')
  const [coverModalOpen, setCoverModalOpen] = useState(false)
  const [profileCompletion, setProfileCompletion] = useState(0)
  const [avatar, setAvatar] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      // Calculate profile completion from local storage if available
      try {
        const savedData = localStorage.getItem('codeSpectra_extendedProfile')
        if (savedData) {
          const data = JSON.parse(savedData)
          let score = 0;
          if (data.phone) score += 5;
          if (data.location) score += 5;
          if (data.designation) score += 5;
          if (data.about && data.about.trim().length > 10) score += 15;
          if (data.skills && data.skills.trim().length > 2) score += 15;
          if (data.experience && data.experience.some((e: any) => e.company?.trim() && e.role?.trim())) score += 15;
          if (data.education && data.education.some((e: any) => e.institution?.trim() && e.degree?.trim())) score += 15;
          if (data.links && (data.links.linkedin || data.links.github || data.links.portfolio)) score += 10;
          if (data.personalDetails?.dob) score += 5;
          if (data.personalDetails?.currentAddress?.trim()) score += 5;
          if (data.personalDetails?.hobbies?.trim()) score += 5;
          setProfileCompletion(Math.min(100, score))
          if (data.avatar) setAvatar(data.avatar)
        }
      } catch (e) {
        // Ignore local storage parsing errors
      }

      const [userRes, statsRes, activityRes, heatmapRes, achRes, lbRes, extRes, kycRes] = await Promise.all([
        fetch('/api/auth/me').then(r => r.json()).catch(() => null),
        fetch('/api/user/stats').then(r => r.json()).catch(() => null),
        fetch('/api/user/activity?limit=20').then(r => r.json()).catch(() => null),
        fetch('/api/user/heatmap?weeks=52').then(r => r.json()).catch(() => null),
        fetch('/api/achievements').then(r => r.json()).catch(() => null),
        fetch('/api/leaderboard').then(r => r.json()).catch(() => null),
        fetch('/api/user/extended-profile', { credentials: 'include' }).then(r => r.json()).catch(() => null),
        fetch('/api/kyc/didit/status').then(r => r.json()).catch(() => null),
      ])

      if (userRes?.user) setUser(userRes.user)
      if (statsRes && !statsRes.error) {
        setStats(statsRes)
        if (typeof statsRes.streak === 'number') setCurrentStreak(statsRes.streak)
      }
      if (typeof achRes?.xp === 'number') setXp(achRes.xp)
      if (typeof achRes?.level === 'number') setLevel(achRes.level)
      if (activityRes?.data) setActivity(activityRes.data)
      if (typeof lbRes?.currentUser?.rank === 'number') setGlobalRank(lbRes.currentUser.rank)
      else if (typeof lbRes?.rank === 'number') setGlobalRank(lbRes.rank)
      if (kycRes && !kycRes.error) setKycStatus(kycRes)
      
      const ext = extRes?.data
      if (ext) {
        const handle = String(ext.basic?.username || ext.username || '').trim()
        if (handle) setPublicHandle(handle)
        if (typeof ext.about === 'string') setAboutBio(ext.about)
        if (ext.links && typeof ext.links === 'object') setSocialLinks(ext.links)
        // Prefer server profile for completion score when present
        try {
          let score = 0
          if (ext.phone || ext.basic?.phone) score += 5
          if (ext.location || ext.basic?.location) score += 5
          if (ext.about && String(ext.about).trim().length > 10) score += 15
          if (ext.skills && String(ext.skills).trim().length > 2) score += 15
          if (Array.isArray(ext.experience) && ext.experience.some((e: any) => e.company?.trim() || e.organisation?.trim())) score += 15
          if (Array.isArray(ext.education) && ext.education.some((e: any) => e.institution?.trim() || e.college?.trim())) score += 15
          if (ext.links && (ext.links.linkedin || ext.links.github || ext.links.portfolio)) score += 10
          if (score > 0) setProfileCompletion(Math.min(100, score))
          if (ext.avatar || ext.basic?.avatar) setAvatar(ext.avatar || ext.basic.avatar)
        } catch { /* ignore */ }
      }
      if (heatmapRes?.cells) {
        setHeatmapData({
          cells: heatmapRes.cells,
          dayLabels: heatmapRes.dayLabels ?? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
          monthLabels: heatmapRes.monthLabels ?? [],
          tooltipData: heatmapRes.tooltipData ?? {},
          totalContributions: heatmapRes.totalContributions ?? 0,
          totalActiveDays: heatmapRes.totalActiveDays ?? 0,
        })
      }
    } catch {
      /* render with defaults */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const { startTour, setTourSeen } = useTour()

  useEffect(() => {
    const interval = setInterval(() => { void load() }, 30_000)
    return () => clearInterval(interval)
  }, [load])

  // First-visit guided tour (same pattern as the other dashboard pages).
  useEffect(() => {
    if (gate.ready) {
      const profileTour: TourStep[] = [
        {
          target: '[data-tour="profile-header"]',
          title: tr('account.yourDeveloperProfileOverview'),
          description: tr('account.thisPageShowcasesYourIdentityLevel2c7'),
          position: 'bottom',
        },
        {
          target: '[data-tour="profile-edit"]',
          title: tr('account.editProfileDetails'),
          description: tr('account.openTheProfileEditorToUpdated0b'),
          position: 'bottom',
        },
        {
          target: '[data-tour="profile-about"]',
          title: tr('account.tipStrengthenAboutBio'),
          description: tr('account.tipWriteTwoLinesOnSkills565'),
          position: 'top',
        },
      ]
      autoPlayPageTour('profile', profileTour)}
  }, [gate.ready, startTour, setTourSeen])

  const displayName = user?.name || user?.email?.split('@')[0] || 'User'

  const hasStats = stats && (
    (typeof stats.scans === 'number' && stats.scans > 0) ||
    (typeof stats.reviews === 'number' && stats.reviews > 0) ||
    (typeof stats.fixes === 'number' && stats.fixes > 0)
  )

  const memberSince = stats?.memberSince as string | undefined
  const memberDate = memberSince
    ? formatDate(memberSince, undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : null

  if (!gate.ready) return (
    <div className="w-full min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
        <p className="text-sm text-muted-foreground">{tr('account.loadingYourProfile')}</p>
      </div>
    </div>
  )

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 pb-10">
      {/* Banner */}
      <div className={`h-48 lg:h-64 w-full rounded-b-3xl relative overflow-hidden shadow-sm group ${
        (coverTheme.includes('-3d') || ['dark-tech','gradient-blue','emerald-code'].includes(coverTheme)) ? 'bg-slate-900' :
        coverTheme === 'blue' ? 'bg-linear-to-r from-primary via-primary/90 to-blue-900' :
        coverTheme === 'navy' ? 'bg-linear-to-r from-blue-950 via-blue-900 to-slate-900' :
        coverTheme === 'green' ? 'bg-linear-to-r from-green-700 via-green-600 to-green-800' :
        coverTheme === 'orange' ? 'bg-linear-to-r from-orange-600 via-amber-600 to-orange-800' :
        'bg-linear-to-r from-slate-800 via-slate-700 to-slate-900'
      }`}>
        {(coverTheme.includes('-3d') || ['dark-tech','gradient-blue','emerald-code'].includes(coverTheme)) && (
          <Image
            src={`/covers/${coverTheme}.jpg`}
            alt={tr('account.coverBackground')}
            fill
            className="object-cover opacity-80"
            priority
          />
        )}
        {!(coverTheme.includes('-3d') || ['dark-tech','gradient-blue','emerald-code'].includes(coverTheme)) && (
          <>
            <div className="absolute inset-0 opacity-30 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-size-[24px_24px]" />
            <div className="absolute left-0 right-0 top-0 -z-1 m-auto h-77.5 w-77.5 rounded-full bg-white opacity-20 blur-[100px]" />
          </>
        )}
        
        <div className="absolute top-4 right-4 z-10 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100 transition-opacity flex items-center gap-2">
          <Button size="sm" variant="secondary" className="gap-2 bg-white/20 hover:bg-white/40 text-white border-0 backdrop-blur-md" onClick={() => setCoverModalOpen(true)}>
            <ImageIcon className="h-4 w-4" />{' '}{tr('account.editCover')}</Button>
        </div>
      </div>

      <div className="mt-6 px-4 sm:px-6 lg:px-8 grid gap-8 lg:grid-cols-[360px_1fr]">
        {/* Left Column (Sidebar) */}
        <aside className="space-y-6 -mt-24 relative z-10">
          {/* Premium Profile Card */}
          <Card data-tour="profile-header" className="rounded-3xl border-border/70 p-6 text-center shadow-sm dark:shadow-none bg-card/90 backdrop-blur-xl relative overflow-hidden group">
            {/* Glassmorphism gradient accents */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/15 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none transition-opacity group-hover:opacity-100 opacity-70" />
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -ml-10 -mb-10 pointer-events-none transition-opacity group-hover:opacity-100 opacity-70" />
            
            <div className="relative mx-auto w-fit rounded-full bg-linear-to-br from-primary to-primary/50 p-0.75 shadow-lg">
              <div className="rounded-full bg-background p-1">
                <UserAvatar
                  src={avatar}
                  seed={displayName}
                  name={displayName}
                  className="h-28 w-28"
                />
              </div>
            </div>
            <h1 className="mt-5 text-2xl font-extrabold text-foreground tracking-tight">{displayName}</h1>
            <p className="mt-1 text-sm text-muted-foreground font-medium">@{publicHandle || user?.id}</p>
            
            <div className="mt-4 flex items-center justify-center gap-2">
              <Button
                size="icon"
                variant="outline"
                className="h-9 w-9 rounded-full text-muted-foreground hover:text-foreground"
                title={tr('account.copyProfileLink')}
                aria-label={tr('account.shareProfileLink')}
                onClick={async () => {
                  const handle = publicHandle || user?.id
                  const url = typeof window !== 'undefined' && handle ? `${window.location.origin}/users/${encodeURIComponent(handle)}` : ''
                  if (!url) return
                  try {
                    if (navigator.share) {
                      await navigator.share({ title: displayName, url })
                    } else {
                      await navigator.clipboard.writeText(url)
                    }
                  } catch { /* user cancelled */ }
                }}
              >
                <Share2 className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="outline" className="h-9 w-9 rounded-full text-muted-foreground hover:text-foreground" aria-label={tr('account.previewPublicProfile')} title={tr('account.previewPublicProfile')} asChild>
                <Link href={`/users/${encodeURIComponent(publicHandle || user?.id || '')}?preview=true`}>
                  <Eye className="h-4 w-4" />
                </Link>
              </Button>
            </div>
            
            <div className="mt-6 flex justify-center gap-6 text-sm">
              <div className="flex flex-col items-center p-3 rounded-2xl bg-muted/40 min-w-20">
                <span className="font-bold tabular-nums text-foreground text-xl">{level}</span>
                <span className="text-xs font-medium text-muted-foreground mt-1">{tr('account.level')}</span>
              </div>
              <div className="flex flex-col items-center p-3 rounded-2xl bg-muted/40 min-w-20">
                <span className="font-bold tabular-nums text-foreground text-xl">{xp}</span>
                <span className="text-xs font-medium text-primary mt-1">XP</span>
              </div>
            </div>
            
            <div className="mt-6 pt-6 border-t border-border/50 flex flex-col gap-3 text-sm text-muted-foreground text-left">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <User className="w-4 h-4 text-primary" aria-hidden />
                </div>
                <span className="font-medium text-foreground">{tr('account.codespectraMember')}</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Clock className="w-4 h-4 text-primary" aria-hidden />
                </div>
                <span className="font-medium text-foreground">{tr('account.joined')}{' '}{memberDate || tr('account.recently')}</span>
              </div>
            </div>
            
            <Button size="sm" className="w-full gap-2 rounded-xl h-10 font-bold bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground transition-all" asChild>
              <Link href="/dashboard/profile/edit" className="w-full mt-6 block" data-tour="profile-edit">
                <Edit2 className="h-4 w-4" />{' '}{tr('account.editProfile')}</Link>
            </Button>
          </Card>

          {/* Profile Completeness Widget */}
          <Card className="rounded-3xl border-border/70 p-5 bg-card relative overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-primary" aria-hidden />{' '}{tr('account.profileCompleteness')}</h3>
              <span className="text-primary font-bold tabular-nums text-xs bg-primary/10 px-2 py-0.5 rounded-full">{profileCompletion}%</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2.5 mb-4">
              <div className="bg-primary h-2.5 rounded-full transition-all duration-500 motion-reduce:transition-none" style={{ width: `${profileCompletion}%` }}></div>
            </div>
            <p className="text-xs text-muted-foreground mb-4">{tr('account.completeYourProfileToStandOut6fb')}</p>
            <Button size="sm" variant="outline" className="w-full gap-2 border-primary/25 text-primary hover:bg-primary/10" asChild>
              <Link href="/dashboard/profile/edit">
                <Sparkles className="w-3.5 h-3.5" />{' '}{tr('account.completeNow')}</Link>
            </Button>
          </Card>

          {/* AI Credits Widget */}
          <AiCreditsWidget />

          {/* Rankings Card */}
          <Card className="rounded-3xl border-border/70 p-5 bg-card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-foreground">{tr('account.rankings')}</h3>
            </div>
            
            <div className="rounded-2xl bg-linear-to-br from-primary/5 to-primary/10 p-5 text-center border border-primary/20 relative overflow-hidden">
              <div className="absolute right-0 top-0 opacity-10">
                <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
              </div>
              <p className="text-xs font-medium text-muted-foreground text-left">{tr('account.globalRank')}</p>
              <div className="mt-2 flex items-center gap-3">
                <Trophy className="h-7 w-7 text-amber-500 drop-shadow-sm" aria-hidden />
                <span className="text-3xl font-extrabold tabular-nums text-foreground tracking-tight">{globalRank != null ? globalRank : '—'}</span>
              </div>
              <Button size="sm" className="w-full rounded-full font-medium h-9 shadow-sm" asChild>
                <Link href="/dashboard/leaderboard" className="block mt-5">{tr('account.viewLeaderboard')}</Link>
              </Button>
            </div>
            
            <div className="mt-5 grid grid-cols-2 gap-4 text-sm pt-2">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">{tr('account.totalScans')}</p>
                <p className="font-bold tabular-nums text-foreground text-base">{stats?.scans ?? 0}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">{tr('account.totalXp')}</p>
                <p className="font-bold tabular-nums text-primary text-base">{xp}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">{tr('account.totalReviews')}</p>
                <p className="font-bold tabular-nums text-foreground text-base">{stats?.reviews ?? 0}</p>
              </div>
              <div className="space-y-1 flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">{tr('account.totalFixes')}</p>
                  <p className="font-bold tabular-nums text-foreground text-base">{stats?.fixes ?? 0}</p>
                </div>
                {Number(stats?.fixes) > 0 && <span className="text-xs font-bold tabular-nums text-green-700 dark:text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded">+{stats?.fixes}</span>}
              </div>
            </div>
          </Card>

          <TwoFactorAuth />
        </aside>

        {/* Right Column (Main Content) */}
        <div className="space-y-6 min-w-0">
          <Card data-tour="profile-about" className="rounded-3xl border-border/70 p-6">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold text-foreground tracking-tight">{tr('account.about')}</h2>
              <Link href="/dashboard/profile/edit" className="text-xs font-medium text-primary hover:underline">{tr('account.edit')}</Link>
            </div>
            {aboutBio?.trim() ? (
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{aboutBio}</p>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{tr('account.noBioYet')}{' '}<Link href="/dashboard/profile/edit" className="text-primary hover:underline font-medium">{tr('account.addAnAboutSection')}</Link>{' '}{tr('account.soRecruitersAndTeammatesCanLearnc24')}</p>
            )}
          </Card>

          <Card className="rounded-3xl border-border/70 p-6 overflow-hidden">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground tracking-tight">{tr('account.digitalIdCard')}</h2>
            </div>
            <DigitalIdCard
              name={displayName}
              email={user?.email || ''}
              role={user?.role || 'user'}
              id={user?.id || ''}
              kycVerified={kycStatus?.verified}
            />
          </Card>

          {/* AI Recommended Practice */}
          <Card className="rounded-3xl border-border/70 p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-linear-to-br from-primary/10 to-primary/5 rounded-full blur-3xl pointer-events-none" />
            <div className="mb-5 flex items-center justify-between relative z-10">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" aria-hidden />
                <h2 className="text-lg font-semibold text-foreground tracking-tight">{tr('account.suggestedPractice')}</h2>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4 relative z-10">
              <div className="rounded-2xl border border-border/70 bg-card p-4 hover:border-primary/30 transition-colors duration-200 group">
                <div className="flex items-start justify-between mb-2">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <TrendingUp className="h-4 w-4 text-primary" aria-hidden />
                  </div>
                  <Badge variant="outline" className="text-[10px] text-primary border-primary/30">{tr('account.priority')}</Badge>
                </div>
                <h4 className="text-base font-semibold text-foreground mb-1">{tr('account.systemDesignScaling')}</h4>
                <p className="text-xs text-muted-foreground mb-3">{tr('account.aCoreTopicInMostSystem63e')}</p>
                <Button variant="secondary" size="sm" className="w-full text-xs font-medium group-hover:bg-primary group-hover:text-primary-foreground transition-colors" asChild>
                  <Link href="/dashboard/interview-prep">{tr('account.practiceNow')}</Link>
                </Button>
              </div>
              <div className="rounded-2xl border border-border/70 bg-card p-4 hover:border-primary/30 transition-colors duration-200 group">
                <div className="flex items-start justify-between mb-2">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <FolderGit2 className="h-4 w-4 text-primary" aria-hidden />
                  </div>
                </div>
                <h4 className="text-base font-semibold text-foreground mb-1">{tr('account.reactStateManagement')}</h4>
                <p className="text-xs text-muted-foreground mb-3">{tr('account.aFrequentTopicInFrontendInterviews')}</p>
                <Button variant="secondary" size="sm" className="w-full text-xs font-medium group-hover:bg-primary group-hover:text-primary-foreground transition-colors" asChild>
                  <Link href="/dashboard/problems">{tr('account.practiceNow')}</Link>
                </Button>
              </div>
            </div>
          </Card>

          <Card className="rounded-3xl border-border/70 p-6">
            <h2 className="text-lg font-semibold text-foreground tracking-tight mb-4">{tr('account.socialLinks')}</h2>
            {/* Saved links from the extended profile; nothing is shown when none are set. */}
            {socialLinks.linkedin || socialLinks.github || socialLinks.portfolio ? (
              <div className="flex gap-3">
                {socialLinks.linkedin && (
                  <a href={socialLinks.linkedin} target="_blank" rel="noopener noreferrer" aria-label={tr('account.linkedinProfile')} className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-muted/30 text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-all">
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/></svg>
                  </a>
                )}
                {socialLinks.github && (
                  <a href={socialLinks.github} target="_blank" rel="noopener noreferrer" aria-label={tr('account.githubProfile')} className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-muted/30 text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-all">
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
                  </a>
                )}
                {socialLinks.portfolio && (
                  <a href={socialLinks.portfolio} target="_blank" rel="noopener noreferrer" aria-label={tr('account.portfolio')} className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-muted/30 text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-all">
                    <Globe className="h-4 w-4" aria-hidden />
                  </a>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{tr('account.noLinksYet')}{' '}<Link href="/dashboard/profile/edit" className="text-primary underline-offset-4 hover:underline">{tr('account.addYourLinkedinOrGithub')}</Link>.
              </p>
            )}
          </Card>

          <Card className="rounded-3xl border-border/70 p-6">
            <h2 className="text-lg font-semibold text-foreground tracking-tight mb-5">{tr('account.streaks')}</h2>
            <ContributionGraph
              cells={heatmapData?.cells ?? null}
              dayLabels={heatmapData?.dayLabels}
              monthLabels={heatmapData?.monthLabels}
              tooltipData={heatmapData?.tooltipData}
              totalContributions={heatmapData?.totalContributions ?? 0}
              totalActiveDays={heatmapData?.totalActiveDays ?? 0}
            />
          </Card>
          
          <ActivityTimeline
            activities={activity}
            title={tr('account.recentActivity')}
            subtitle={tr('account.yourLatestContributionsAndActions')}
          />
        </div>
      </div>


      {/* Cover Theme Selection Modal */}
      <Dialog open={coverModalOpen} onOpenChange={setCoverModalOpen}>
        <DialogContent className="sm:max-w-175">
          <DialogHeader>
            <DialogTitle>{tr('account.customizeCoverBanner')}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <h4 className="text-sm font-medium text-foreground mb-3">{tr('account.defaultCoverImage')}</h4>
            <p className="text-xs text-muted-foreground mb-4">{tr('account.weWillAddADefaultCover99b')}</p>
            
            <h4 className="text-sm font-medium text-foreground mb-3">{tr('account.chooseATemplate')}</h4>
            <div className="flex flex-wrap gap-3 mb-6">
              {[
                { id: 'blue', color: 'bg-primary' },
                { id: 'navy', color: 'bg-blue-900' },
                { id: 'green', color: 'bg-green-600' },
                { id: 'orange', color: 'bg-orange-600' },
                { id: 'dark', color: 'bg-slate-800' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setCoverTheme(t.id)}
                  aria-label={tr('account.idCover', { id: t.id })}
                  aria-pressed={coverTheme === t.id}
                  className={`w-8 h-8 rounded-full ${t.color} ${coverTheme === t.id ? 'ring-2 ring-offset-2 ring-offset-background ring-primary' : 'hover:opacity-80'}`}
                />
              ))}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
               {[
                 { id: 'blue-3d', label: tr('account.techNodes'), file: 'blue-3d.jpg' },
                 { id: 'purple-3d', label: tr('account.neonFluid'), file: 'purple-3d.jpg' },
                 { id: 'green-3d', label: tr('account.cyberCity'), file: 'green-3d.jpg' },
                 { id: 'dark-tech', label: tr('account.darkTech'), file: 'dark-tech.jpg' },
                 { id: 'gradient-blue', label: tr('account.oceanWave'), file: 'gradient-blue.jpg' },
                 { id: 'emerald-code', label: tr('account.codeDark'), file: 'emerald-code.jpg' },
               ].map((t) => (
                 <button
                   type="button"
                   key={t.id}
                   onClick={() => setCoverTheme(t.id)}
                   aria-pressed={coverTheme === t.id}
                   aria-label={tr('account.labelCover', { label: t.label })}
                   className={`relative h-24 rounded-xl overflow-hidden border-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${coverTheme === t.id ? 'border-primary shadow-md' : 'border-transparent hover:border-border'}`}
                 >
                   <Image src={`/covers/${t.file}`} alt="" fill className="object-cover" />
                 </button>
               ))}
            </div>

            <div className="space-y-3">
              <h4 className="text-sm font-medium text-foreground relative flex items-center w-full">
                <span className="grow border-t border-border/50"></span>
                <span className="mx-4 text-muted-foreground text-xs font-semibold">{tr('account.or')}</span>
                <span className="grow border-t border-border/50"></span>
              </h4>
              <div className="mt-4">
                <h4 className="text-sm font-medium text-foreground mb-1">{tr('account.uploadBanner')}</h4>
                <p className="text-xs text-muted-foreground mb-3">{tr('account.youCanUploadCustomBannersForfb5')}</p>
                <div className="border-2 border-dashed border-border rounded-2xl p-6 flex flex-col items-center justify-center text-center">
                  <ImageIcon className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm font-medium text-foreground">{tr('account.customBannerUploadsArentAvailableYet')}</p>
                  <p className="text-xs text-muted-foreground mt-1">{tr('account.svgPngJpgOrGifMax9ad')}</p>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setCoverModalOpen(false)}>{tr('account.done')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
