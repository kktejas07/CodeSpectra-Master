'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
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
import {
  Edit2,
  Trophy,
  Target,
  Flame,
  Shield,
  Clock,
  GitCommit,
  GitPullRequest,
  FolderGit2,
  Activity,
  Loader,
  CheckCircle2,
  XCircle,
  Smartphone,
  User,
} from 'lucide-react'
import { csrfFetch } from '@/lib/csrf-fetch'

interface ActivityItem {
  ts: string
  type: string
  title: string
  meta: string
  detail: string
}

function TwoFactorAuth() {
  const [status, setStatus] = useState<{ enabled: boolean; setupAt?: string | null; verifiedAt?: string | null } | null>(null)
  const [loading, setLoading] = useState(true)
  const [setupData, setSetupData] = useState<{ secret: string; otpauth: string } | null>(null)
  const [qrCode, setQrCode] = useState('')
  const [verifyToken, setVerifyToken] = useState('')
  const [verifyError, setVerifyError] = useState('')
  const [verifying, setVerifying] = useState(false)

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
    try {
      const res = await csrfFetch('/api/user/2fa/setup', { method: 'POST' })
      const json = await res.json()
      if (json.otpauth) {
        setSetupData({ secret: json.secret, otpauth: json.otpauth })
        const QRCode = await import('qrcode')
        const url = await QRCode.toDataURL(json.otpauth, { width: 200, margin: 2 })
        setQrCode(url)
      }
    } catch { /* ignore */ }
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
        setVerifyError(json.error || 'Verification failed')
      }
    } catch { setVerifyError('Network error') }
    setVerifying(false)
  }

  const handleDisable = async () => {
    if (!confirm('Disable two-factor authentication? This reduces account security.')) return
    try {
      await csrfFetch('/api/user/2fa/disable', { method: 'POST' })
      setStatus(null)
      setQrCode('')
      setSetupData(null)
      await fetchStatus()
    } catch { /* ignore */ }
  }

  return (
    <Card className="border-border/60 p-5 text-sm">
      <div className="mb-3 flex items-center gap-2">
        <Shield className="h-4 w-4 text-primary" />
        <span className="font-medium text-foreground">Two-factor auth</span>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader className="h-3 w-3 animate-spin" />
          <span>Loading…</span>
        </div>
      ) : status?.enabled ? (
        <div>
          <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
            <CheckCircle2 className="h-4 w-4" />
            <span className="font-medium">Enabled</span>
          </div>
          <Button variant="outline" size="sm" className="mt-3 w-full gap-2" onClick={handleDisable}>
            <XCircle className="h-3.5 w-3.5" />
            Disable
          </Button>
        </div>
      ) : setupData ? (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">Scan with authenticator app, then enter the 6-digit code:</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {qrCode ? <img src={qrCode} alt="QR Code" className="mx-auto h-40 w-40 rounded border" /> : <div className="mx-auto h-40 w-40 rounded border flex items-center justify-center"><Loader className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
          <p className="text-center text-[10px] text-muted-foreground break-all font-mono">{setupData.secret}</p>
          <div className="flex gap-2">
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={verifyToken}
              onChange={e => setVerifyToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-center text-sm font-mono"
            />
            <Button size="sm" onClick={handleVerify} disabled={verifyToken.length !== 6 || verifying}>
              {verifying ? <Loader className="h-3 w-3 animate-spin" /> : 'Verify'}
            </Button>
          </div>
          {verifyError ? <p className="text-xs text-red-500">{verifyError}</p> : null}
        </div>
      ) : (
        <div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <XCircle className="h-4 w-4" />
            <span>Not enabled</span>
          </div>
          <Button variant="outline" size="sm" className="mt-3 w-full gap-2" onClick={handleSetup}>
            <Smartphone className="h-3.5 w-3.5" />
            Set up
          </Button>
        </div>
      )}
    </Card>
  )
}

export default function ProfilePage() {
  const [user, setUser] = useState<{ id: string; email: string; name?: string; role?: string } | null>(null)
  const [stats, setStats] = useState<Record<string, number> | null>(null)
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
  const [editOpen, setEditOpen] = useState(false)
  const [editName, setEditName] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')

  const openEdit = () => {
    setEditName(user?.name || user?.email?.split('@')[0] || '')
    setEditError('')
    setEditOpen(true)
  }

  const saveEdit = async () => {
    if (!editName.trim()) { setEditError('Name cannot be empty'); return }
    setEditSaving(true)
    setEditError('')
    try {
      const res = await csrfFetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim() }),
      })
      const json = await res.json()
      if (!res.ok) { setEditError(json.error || 'Failed to update'); return }
      setUser(prev => prev ? { ...prev, name: editName.trim() } : prev)
      setEditOpen(false)
    } catch { setEditError('Network error') }
    setEditSaving(false)
  }

  useEffect(() => {
    async function load() {
      try {
        const [userRes, statsRes, activityRes, heatmapRes] = await Promise.all([
          fetch('/api/auth/me').then(r => r.json()).catch(() => null),
          fetch('/api/user/stats').then(r => r.json()).catch(() => null),
          fetch('/api/user/activity?limit=10').then(r => r.json()).catch(() => null),
          fetch('/api/user/heatmap?weeks=52').then(r => r.json()).catch(() => null),
        ])

        if (userRes?.user) setUser(userRes.user)
        if (statsRes && !statsRes.error) setStats(statsRes)
        if (activityRes?.data) setActivity(activityRes.data)
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
    }
    load()
  }, [])

  const displayName = user?.name || user?.email?.split('@')[0] || 'User'
  const avatarSrc = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(displayName)}`

  const hasStats = stats && (stats.scans! > 0 || stats.reviews! > 0 || stats.fixes! > 0)

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,280px)_1fr]">
      {/* Sidebar */}
      <aside className="space-y-6">
        <Card className="border-border/60 p-6 text-center">
          <div className="relative mx-auto w-fit">
            <img
              src={avatarSrc}
              alt=""
              className="h-36 w-36 rounded-xl border border-border object-cover"
            />
          </div>
          <h1 className="mt-4 text-xl font-bold text-foreground">{displayName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{user?.email}</p>
          <Button variant="outline" size="sm" className="mt-4 w-full gap-2" onClick={openEdit}>
            <Edit2 className="h-4 w-4" />
            Edit profile
          </Button>
        </Card>

        <Card className="border-border/60 p-5 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Member since</span>
            <span className="font-medium text-foreground">
              {user?.id ? 'Active' : '—'}
            </span>
          </div>
          <Separator className="my-3" />
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="h-4 w-4 shrink-0" />
            <span>Connected</span>
          </div>
        </Card>

        <TwoFactorAuth />
      </aside>

      {/* Main */}
      <div className="min-w-0 space-y-8">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="border-border/60 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Code scans</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{stats?.scans ?? 0}</p>
            <p className="text-xs text-muted-foreground">Total scans run</p>
          </Card>
          <Card className="border-border/60 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Code reviews</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{stats?.reviews ?? 0}</p>
            <p className="text-xs text-muted-foreground">Reviews submitted</p>
          </Card>
          <Card className="border-border/60 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Fixes applied</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{stats?.fixes ?? 0}</p>
            <p className="text-xs text-muted-foreground">Suggested fixes</p>
          </Card>
          <Card className="border-border/60 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Integrations</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{stats?.integrations ?? 0}</p>
            <p className="text-xs text-muted-foreground">Connected services</p>
          </Card>
        </div>

        <Card className="border-border/60 p-6">
          <div className="mb-4 flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Digital ID Card</h2>
          </div>
          <DigitalIdCard
            name={displayName}
            email={user?.email || ''}
            role={user?.role || 'user'}
            id={user?.id || ''}
          />
        </Card>

        <ContributionGraph
          cells={heatmapData?.cells ?? null}
          dayLabels={heatmapData?.dayLabels}
          monthLabels={heatmapData?.monthLabels}
          tooltipData={heatmapData?.tooltipData}
          totalContributions={heatmapData?.totalContributions ?? 0}
          totalActiveDays={heatmapData?.totalActiveDays ?? 0}
        />

        <ActivityTimeline
          activities={activity}
          title="Recent activity"
          subtitle="Your latest contributions and actions"
        />

        {hasStats && (
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="border-border/60 p-6">
              <div className="mb-4 flex items-center gap-2">
                <Trophy className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold text-foreground">Contribution breakdown</h2>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-center">
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg border border-border/60 bg-background text-primary">
                    <Activity className="h-5 w-5" strokeWidth={1.75} />
                  </div>
                  <p className="mt-2 text-xs font-semibold text-foreground">{stats?.scans ?? 0} scans</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-center">
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg border border-border/60 bg-background text-primary">
                    <FolderGit2 className="h-5 w-5" strokeWidth={1.75} />
                  </div>
                  <p className="mt-2 text-xs font-semibold text-foreground">{stats?.reviews ?? 0} reviews</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-center">
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg border border-border/60 bg-background text-primary">
                    <CheckCircle2 className="h-5 w-5" strokeWidth={1.75} />
                  </div>
                  <p className="mt-2 text-xs font-semibold text-foreground">{stats?.fixes ?? 0} fixes</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-center">
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg border border-border/60 bg-background text-primary">
                    <Trophy className="h-5 w-5" strokeWidth={1.75} />
                  </div>
                  <p className="mt-2 text-xs font-semibold text-foreground">{stats?.integrations ?? 0} integrations</p>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}


