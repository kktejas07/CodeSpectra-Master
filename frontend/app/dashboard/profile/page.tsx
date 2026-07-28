'use client'

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
import { Edit2, Trophy, Shield, Clock, FolderGit2, Activity, Loader, CheckCircle2, XCircle, Smartphone, User, Loader2 } from 'lucide-react'
import { csrfFetch } from '@/lib/csrf-fetch'
import { usePageGuard } from '@/lib/use-page-guard'

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
  const gate = usePageGuard('user')

  const [user, setUser] = useState<{ id: string; email: string; name?: string; role?: string; lastLoginMethod?: string | null; lastLoginAt?: string | null; createdAt?: string } | null>(null)
  const [stats, setStats] = useState<Record<string, number | string> | null>(null)
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
  if (!gate.ready) return null

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

  const load = useCallback(async () => {
    try {
      const [userRes, statsRes, activityRes, heatmapRes] = await Promise.all([
        fetch('/api/auth/me').then(r => r.json()).catch(() => null),
        fetch('/api/user/stats').then(r => r.json()).catch(() => null),
        fetch('/api/user/activity?limit=20').then(r => r.json()).catch(() => null),
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
  }, [])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    const interval = setInterval(() => { void load() }, 30_000)
    return () => clearInterval(interval)
  }, [load])

  const displayName = user?.name || user?.email?.split('@')[0] || 'User'
  const avatarSrc = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(displayName)}`

  const hasStats = stats && (
    (typeof stats.scans === 'number' && stats.scans > 0) ||
    (typeof stats.reviews === 'number' && stats.reviews > 0) ||
    (typeof stats.fixes === 'number' && stats.fixes > 0)
  )

  const memberSince = stats?.memberSince as string | undefined
  const memberDate = memberSince
    ? new Date(memberSince).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null

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
              {memberDate || (user?.id ? 'Active' : '—')}
            </span>
          </div>
          <Separator className="my-3" />
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="h-4 w-4 shrink-0" />
              <span>Connected</span>
            </div>
            {user?.lastLoginMethod ? (
              <div className="flex items-center gap-1.5">
                <Badge variant="outline" className="text-xs gap-1 capitalize">
                  {user.lastLoginMethod === 'google' && <svg className="h-3 w-3" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>}
                  {user.lastLoginMethod === 'github' && <svg className="h-3 w-3" viewBox="0 0 24 24"><path fill="currentColor" d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>}
                  {user.lastLoginMethod}
                </Badge>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">—</span>
            )}
            {user?.lastLoginAt && (
              <p className="text-xs text-muted-foreground">
                Last: {new Date(user.lastLoginAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </p>
            )}
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

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit profile</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label htmlFor="edit-name">Display name</Label>
            <Input
              id="edit-name"
              value={editName}
              onChange={e => setEditName(e.target.value)}
              placeholder="Your name"
            />
            {editError ? <p className="text-xs text-red-500">{editError}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={editSaving}>
              Cancel
            </Button>
            <Button onClick={saveEdit} disabled={editSaving}>
              {editSaving ? <Loader className="h-4 w-4 animate-spin" /> : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

