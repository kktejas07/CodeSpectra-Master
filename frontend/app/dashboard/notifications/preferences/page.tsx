'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { DashboardPageHeader } from '@/components/dashboard/dashboard-page-header'
import { Bell, Mail, ChevronRight, Loader2, SlidersHorizontal, Slack } from 'lucide-react'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { usePageGuard } from '@/lib/use-page-guard'

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
  if (!gate.ready) return null

  const toast = useToast()
  const [preferences, setPreferences] = useState<NotificationPreference[]>([])
  const [loading, setLoading] = useState(true)
  const [quietStart, setQuietStart] = useState('22:00')
  const [quietEnd, setQuietEnd] = useState('08:00')
  const [savingQuiet, setSavingQuiet] = useState(false)
  const [dailyDigest, setDailyDigest] = useState(true)
  const [weeklyReport, setWeeklyReport] = useState(true)

  const fetchPreferences = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications/preferences', { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setPreferences(Array.isArray(data) ? data : [])
      const qh = (data as any).quietHours
      if (qh) {
        setQuietStart(qh.quietStart || '22:00')
        setQuietEnd(qh.quietEnd || '08:00')
      }
      if ((data as any).dailyDigest !== undefined) setDailyDigest((data as any).dailyDigest)
      if ((data as any).weeklyReport !== undefined) setWeeklyReport((data as any).weeklyReport)
    } catch (error) {
      console.error('[CodeSpectra] Failed to fetch preferences:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void fetchPreferences() }, [fetchPreferences])

  useEffect(() => {
    const interval = setInterval(() => { void fetchPreferences() }, 30_000)
    return () => clearInterval(interval)
  }, [fetchPreferences])

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
        body: JSON.stringify({ quietStart, quietEnd }),
      })
      if (!res.ok) throw new Error('Failed to save')
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

  return (
    <div className="w-full space-y-8">
      <DashboardPageHeader
        icon={SlidersHorizontal}
        title="Notification preferences"
        description="Fine-tune channels and categories. Quick toggles also live on Settings."
        actions={
          <Button variant="outline" size="sm" className="gap-1 rounded-lg" asChild>
            <Link href="/dashboard/notifications">
              Inbox
              <ChevronRight className="h-4 w-4" />
            </Link>
          </Button>
        }
      />

      {loading ? (
        <Card className="flex min-h-[220px] items-center justify-center gap-2 rounded-xl border-border/60 text-muted-foreground shadow-sm">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading preferences…
        </Card>
      ) : (
        <div className="space-y-6">
          {preferences.map((pref) => (
            <Card
              key={pref.id}
              className="overflow-hidden rounded-xl border-border/60 shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 px-6 py-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
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

          <Card className="overflow-hidden rounded-xl border-border/60 shadow-sm">
            <div className="border-b border-border/60 px-6 py-4">
              <h3 className="text-lg font-semibold text-foreground">Email digest</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Optional summaries (demo toggles — wire to your backend when ready).
              </p>
            </div>
            <div className="divide-y divide-border/60 px-6">
              <div className="flex items-center justify-between gap-4 py-4">
                <div className="min-w-0 space-y-0.5">
                  <p className="font-medium text-foreground">Daily digest</p>
                  <p className="text-sm text-muted-foreground">One summary per day</p>
                </div>
                <Switch checked={dailyDigest} onCheckedChange={setDailyDigest} />
              </div>
              <div className="flex items-center justify-between gap-4 py-4">
                <div className="min-w-0 space-y-0.5">
                  <p className="font-medium text-foreground">Weekly report</p>
                  <p className="text-sm text-muted-foreground">Activity and usage highlights</p>
                </div>
                <Switch checked={weeklyReport} onCheckedChange={setWeeklyReport} />
              </div>
            </div>
          </Card>

          <Card className="overflow-hidden rounded-xl border-border/60 shadow-sm">
            <div className="border-b border-border/60 px-6 py-4">
              <h3 className="text-lg font-semibold text-foreground">Quiet hours</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Local preview — connect to your notification service to enforce delivery windows.
              </p>
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

          <Card className="rounded-xl border border-amber-500/30 bg-amber-500/5 shadow-sm">
            <div className="px-6 py-5">
              <h3 className="text-lg font-semibold text-foreground">Privacy &amp; data</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Preferences are stored for your account and used only to deliver notifications. You can change or revoke
                channels at any time.
              </p>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

