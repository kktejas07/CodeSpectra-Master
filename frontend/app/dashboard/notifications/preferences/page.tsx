'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/app/page-kit'
import { PushDeviceCard } from '@/components/pwa/push-device-card'
import { Bell, Mail, ChevronRight, SlidersHorizontal } from 'lucide-react'
import { Slack } from '@/components/ui/brand-icons'
import { SkeletonCard } from '@/components/ui/skeleton-boneyard'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { usePageGuard } from '@/lib/use-page-guard'
import { useTour, autoPlayPageTour, type TourStep } from '@/components/tour/tour-context'

interface NotificationPreference {
  id: string
  type: 'email' | 'in_app' | 'slack'
  enabled: boolean
  categories: {
    support: boolean
    billing: boolean
    integrations: boolean
    security: boolean
    updates: boolean
  }
}

function ChannelIcon({ type }: { type: string }) {
  const cls = 'h-5 w-5 text-primary'
  if (type === 'email') return <Mail className={cls} aria-hidden />
  if (type === 'slack') return <Slack className={cls} aria-hidden />
  return <Bell className={cls} aria-hidden />
}

export default function NotificationPreferencesPage() {
  const gate = usePageGuard('user')
  const { startTour, setTourSeen } = useTour()

  const toast = useToast()
  const [preferences, setPreferences] = useState<NotificationPreference[]>([])
  const [loading, setLoading] = useState(true)
  const [quietStart, setQuietStart] = useState('22:00')
  const [quietEnd, setQuietEnd] = useState('08:00')
  const [savingQuiet, setSavingQuiet] = useState(false)
  const [quietEnabled, setQuietEnabled] = useState(false)
  const [quietTz, setQuietTz] = useState<string | null>(null)
  const [digest, setDigest] = useState<{ daily: boolean; weekly: boolean } | null>(null)
  const browserTz = (() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' } catch { return 'UTC' }
  })()

  const fetchPreferences = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications/preferences', { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setPreferences(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('[CodeSpectra] Failed to fetch preferences:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void fetchPreferences() }, [fetchPreferences])

  // Quiet hours load once (not on the 30s poll, so typing isn't overwritten).
  useEffect(() => {
    void fetch('/api/notifications/preferences/quiet-hours', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((qh: { quietStart?: string; quietEnd?: string; enabled?: boolean; timeZone?: string | null } | null) => {
        if (qh?.quietStart) setQuietStart(qh.quietStart)
        if (qh?.quietEnd) setQuietEnd(qh.quietEnd)
        if (typeof qh?.enabled === 'boolean') setQuietEnabled(qh.enabled)
        if (qh?.timeZone) setQuietTz(qh.timeZone)
      })
      .catch(() => { /* keep defaults */ })
    void fetch('/api/notifications/preferences/digest', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { daily?: boolean; weekly?: boolean } | null) => {
        if (d && typeof d.daily === 'boolean' && typeof d.weekly === 'boolean') setDigest({ daily: d.daily, weekly: d.weekly })
      })
      .catch(() => { /* card shows a load error */ })
  }, [])

  const handleDigestToggle = async (field: 'daily' | 'weekly', value: boolean) => {
    const prev = digest
    if (prev) setDigest({ ...prev, [field]: value })
    try {
      const res = await csrfFetch('/api/notifications/preferences/digest', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ [field]: value }),
      })
      if (!res.ok) throw new Error('Failed to update')
      toast({ type: 'success', title: 'Digest preferences updated' })
    } catch {
      setDigest(prev)
      toast({ type: 'error', title: 'Failed to update digest preferences' })
    }
  }

  useEffect(() => {
    const interval = setInterval(() => { void fetchPreferences() }, 30_000)
    return () => clearInterval(interval)
  }, [fetchPreferences])

  // First-visit guided tour (same pattern as the other dashboard pages).
  useEffect(() => {
    if (gate.ready) {
      const notificationPreferencesTour: TourStep[] = [
        {
          target: '[data-tour="notification-preferences-header"]',
          title: 'Choose how we notify you',
          description: 'This page lets you control which channels and categories notify you.',
          position: 'bottom',
        },
        {
          target: '[data-tour="notification-preferences-inbox"]',
          title: 'Back to inbox',
          description: 'Jump back to your notification inbox any time from here.',
          position: 'bottom',
        },
        {
          target: '[data-tour="notification-preferences-channels"]',
          title: 'Channels and quiet hours',
          description: 'Turn email, in-app and Slack notifications on or off, and set quiet hours.',
          position: 'top',
        },
      ]
      autoPlayPageTour('notification-preferences', notificationPreferencesTour)}
  }, [gate.ready, startTour, setTourSeen])

  const handleToggle = async (prefId: string, field: string, value: boolean) => {
    try {
      const res = await csrfFetch(`/api/notifications/preferences/${prefId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ [field]: value }),
      })
      if (!res.ok) throw new Error('Failed to update')
      toast({ type: 'success', title: 'Preferences updated' })
      await fetchPreferences()
    } catch (error) {
      console.error('[CodeSpectra] Failed to update preferences:', error)
      toast({ type: 'error', title: 'Failed to update' })
    }
  }

  const handleSaveQuietHours = async () => {
    setSavingQuiet(true)
    try {
      const res = await csrfFetch('/api/notifications/preferences/quiet-hours', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ quietStart, quietEnd, enabled: quietEnabled, timeZone: browserTz }),
      })
      if (!res.ok) throw new Error('Failed to save')
      setQuietTz(browserTz)
      toast({ type: 'success', title: 'Quiet hours saved' })
    } catch {
      toast({ type: 'error', title: 'Failed to save quiet hours' })
    } finally {
      setSavingQuiet(false)
    }
  }

  const getChannelLabel = (type: string) => {
    switch (type) {
      case 'email': return 'Email'
      case 'slack': return 'Slack'
      default: return 'In-app'
    }
  }

  const channelBlurb = (type: string) => {
    switch (type) {
      case 'email': return 'Product and account updates in your inbox'
      case 'slack': return 'Workspace notifications via Slack'
      default: return 'Alerts while you are using the dashboard'
    }
  }

  if (!gate.ready) return null

  return (
    <div className="w-full space-y-6">
      <div data-tour="notification-preferences-header">
      <PageHeader
        className="mb-0"
        icon={<SlidersHorizontal aria-hidden />}
        title="Notification preferences"
        description="Fine-tune channels and categories. Quick toggles also live on Settings."
        actions={
          <Button variant="outline" size="sm" className="gap-1 rounded-lg" asChild>
            <Link href="/dashboard/notifications" data-tour="notification-preferences-inbox">
              Inbox
              <ChevronRight className="h-4 w-4" />
            </Link>
          </Button>
        }
      />
      </div>

      <div data-tour="notification-preferences-channels">
      {loading ? (
        <div className="space-y-6">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : (
        <div className="space-y-5">
          {preferences.map((pref) => (
            <Card
              key={pref.id}
              className="overflow-hidden rounded-3xl border-border/70"
            >
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 px-6 py-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10">
                    <ChannelIcon type={pref.type} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-foreground">
                      {getChannelLabel(pref.type)} notifications
                    </h3>
                    <p className="text-sm text-muted-foreground">{channelBlurb(pref.type)}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span
                    className={`text-sm font-medium ${pref.enabled ? 'text-primary' : 'text-muted-foreground'}`}
                  >
                    {pref.enabled ? 'On' : 'Off'}
                  </span>
                  <Switch
                    checked={pref.enabled}
                    aria-label={`${getChannelLabel(pref.type)} notifications`}
                    onCheckedChange={(value) => handleToggle(pref.id, 'enabled', value)}
                  />
                </div>
              </div>

              {pref.enabled ? (
                <div className="divide-y divide-border/60 px-6">
                  {(pref.categories ? Object.entries(pref.categories) : []).map(([category, enabled]) => (
                    <div key={category} className="flex items-center justify-between gap-4 py-4">
                      <div className="min-w-0 space-y-0.5">
                        <p className="font-medium capitalize text-foreground">{category}</p>
                        <p className="text-sm text-muted-foreground">Events in this area</p>
                      </div>
                      <Switch
                        checked={enabled}
                        aria-label={`${getChannelLabel(pref.type)}: ${category}`}
                        onCheckedChange={(value) =>
                          handleToggle(pref.id, `categories.${category}`, value)
                        }
                      />
                    </div>
                  ))}
                </div>
              ) : null}
            </Card>
          ))}

          <Card className="overflow-hidden rounded-3xl border-border/70">
            <div className="border-b border-border/60 px-6 py-4">
              <h3 className="text-lg font-semibold text-foreground">Email digest</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Summaries sent to your email. Turning off email notifications above also stops digests.
              </p>
            </div>
            {digest ? (
              <div className="divide-y divide-border/60 px-6">
                <div className="flex items-center justify-between gap-4 py-4">
                  <div className="min-w-0 space-y-0.5">
                    <Label htmlFor="daily-digest" className="font-medium text-foreground">Daily digest</Label>
                    <p className="text-sm text-muted-foreground">One email with the last 24 hours of notifications, only when there&apos;s something new</p>
                  </div>
                  <Switch id="daily-digest" checked={digest.daily} onCheckedChange={(v) => handleDigestToggle('daily', v)} />
                </div>
                <div className="flex items-center justify-between gap-4 py-4">
                  <div className="min-w-0 space-y-0.5">
                    <Label htmlFor="weekly-report" className="font-medium text-foreground">Weekly report</Label>
                    <p className="text-sm text-muted-foreground">Platform highlights every Monday</p>
                  </div>
                  <Switch id="weekly-report" checked={digest.weekly} onCheckedChange={(v) => handleDigestToggle('weekly', v)} />
                </div>
              </div>
            ) : (
              <p className="px-6 py-4 text-sm text-muted-foreground">Couldn&apos;t load digest settings. Refresh the page to try again.</p>
            )}
          </Card>

          <PushDeviceCard />

          <Card className="overflow-hidden rounded-3xl border-border/70">
            <div className="border-b border-border/60 px-6 py-4">
              <h3 className="text-lg font-semibold text-foreground">Quiet hours</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Email, push and WhatsApp notifications that arrive during these hours are held and sent when they end.
                Security alerts still come through right away. In-app notifications aren&apos;t affected.
              </p>
            </div>
            <div className="flex items-center justify-between gap-4 border-b border-border/60 px-6 py-4">
              <div className="min-w-0 space-y-0.5">
                <Label htmlFor="quiet-enabled" className="font-medium text-foreground">Use quiet hours</Label>
                <p className="text-sm text-muted-foreground">
                  Times are in {quietTz ?? browserTz}{quietTz && quietTz !== browserTz ? ` (saving will switch to ${browserTz})` : ''}
                </p>
              </div>
              <Switch id="quiet-enabled" checked={quietEnabled} onCheckedChange={setQuietEnabled} />
            </div>
            <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="quiet-start">Start</Label>
                  <Input
                    id="quiet-start"
                    type="time"
                    value={quietStart}
                    onChange={(e) => setQuietStart(e.target.value)}
                    className="rounded-lg border-border/60"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quiet-end">End</Label>
                  <Input
                    id="quiet-end"
                    type="time"
                    value={quietEnd}
                    onChange={(e) => setQuietEnd(e.target.value)}
                    className="rounded-lg border-border/60"
                  />
              </div>
            </div>
            <div className="flex justify-end border-t border-border/60 bg-muted/20 px-6 py-4">
              <Button type="button" className="rounded-lg" disabled={savingQuiet} onClick={handleSaveQuietHours}>
                {savingQuiet ? 'Saving…' : 'Save quiet hours'}
              </Button>
            </div>
          </Card>

          <Card className="rounded-3xl border border-border/70 bg-muted/30">
            <div className="px-6 py-5">
              <h3 className="text-lg font-semibold text-foreground">Privacy and data</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Preferences are stored for your account and used only to deliver notifications. You can change or revoke
                channels at any time.
              </p>
            </div>
          </Card>
        </div>
      )}
      </div>
    </div>
  )
}

