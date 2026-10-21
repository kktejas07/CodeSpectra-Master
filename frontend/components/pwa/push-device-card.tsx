'use client'

/**
 * Notification preferences → "App notifications" card: turn app push on for
 * this device, pause push on every device, and send a test. Quiet hours (the
 * card below on the same page) apply to push as well.
 */
import { useCallback, useEffect, useState } from 'react'
import { BellRing, Smartphone } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { useToast } from '@/lib/toast-context'
import {
  currentSubscription, fetchPushStatus, isIos, isStandalone, pushSupported, sendTestPush, setPushChannel,
  subscribeThisDevice, unsubscribeThisDevice, type PushStatus,
} from '@/lib/pwa/push-client'

export function PushDeviceCard() {
  const addToast = useToast()
  const [status, setStatus] = useState<PushStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [thisDevice, setThisDevice] = useState(false)
  const [busy, setBusy] = useState(false)
  const [supported, setSupported] = useState(true)
  const [iosNeedsInstall, setIosNeedsInstall] = useState(false)

  const load = useCallback(async () => {
    try {
      setError(null)
      const s = await fetchPushStatus()
      setStatus(s)
      setThisDevice(!!(await currentSubscription().catch(() => null)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load push settings')
    }
  }, [])

  useEffect(() => {
    setSupported(pushSupported())
    setIosNeedsInstall(isIos() && !isStandalone())
    void load()
  }, [load])

  const run = async (fn: () => Promise<void>, ok?: string) => {
    setBusy(true)
    try {
      await fn()
      if (ok) addToast({ type: 'success', title: ok })
      await load()
    } catch (e) {
      addToast({ type: 'error', title: e instanceof Error ? e.message : 'Something went wrong' })
    } finally {
      setBusy(false)
    }
  }

  const toggleDevice = (on: boolean) =>
    run(async () => {
      if (on) await subscribeThisDevice(status?.publicKey || '')
      else await unsubscribeThisDevice()
    }, on ? 'Notifications are on for this device' : 'Notifications are off for this device')

  const deviceHint = !supported
    ? iosNeedsInstall
      ? 'On iPhone and iPad, add CodeSpectra to your Home Screen first, then turn this on from the app.'
      : 'This browser does not support app notifications.'
    : status && !status.configured
      ? 'App notifications are not set up on this site yet.'
      : 'Alerts for contests, results and your study plan, even when CodeSpectra is closed.'

  return (
    <Card className="overflow-hidden rounded-3xl border-border/70">
      <div className="flex items-center gap-3 border-b border-border/60 px-6 py-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10">
          <BellRing className="h-5 w-5 text-primary" aria-hidden />
        </div>
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-foreground">App notifications</h3>
          <p className="text-sm text-muted-foreground">Push alerts on your phone or computer. Quiet hours below apply here too.</p>
        </div>
      </div>

      {error ? (
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 text-sm">
          <p className="text-destructive">{error}</p>
          <Button variant="outline" size="sm" className="rounded-lg" onClick={() => void load()}>Try again</Button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-4 border-b border-border/60 px-6 py-4">
            <div className="min-w-0 space-y-0.5">
              <Label htmlFor="push-this-device" className="flex items-center gap-2 font-medium text-foreground">
                <Smartphone className="h-4 w-4 text-muted-foreground" aria-hidden /> This device
              </Label>
              <p className="text-sm text-muted-foreground">{deviceHint}</p>
            </div>
            <Switch
              id="push-this-device"
              checked={thisDevice}
              disabled={busy || !supported || !status?.configured || status?.enabled === false}
              onCheckedChange={(v) => void toggleDevice(v)}
            />
          </div>
          <div className="flex items-center justify-between gap-4 border-b border-border/60 px-6 py-4">
            <div className="min-w-0 space-y-0.5">
              <Label htmlFor="push-all-devices" className="font-medium text-foreground">Push on all devices</Label>
              <p className="text-sm text-muted-foreground">
                {status ? `${status.devices.length} device${status.devices.length === 1 ? '' : 's'} signed up.` : 'Loading…'} Turn off to pause push everywhere.
              </p>
            </div>
            <Switch
              id="push-all-devices"
              checked={status?.enabled !== false}
              disabled={busy || !status}
              onCheckedChange={(v) => void run(() => setPushChannel(v), v ? 'Push notifications resumed' : 'Push notifications paused')}
            />
          </div>
          <div className="flex justify-end bg-muted/20 px-6 py-4">
            <Button
              type="button"
              variant="outline"
              className="rounded-lg"
              disabled={busy || !thisDevice}
              onClick={() => void run(async () => { if (!(await sendTestPush())) throw new Error('No device received it. Try turning this device off and on again.') }, 'Test notification sent')}
            >
              Send a test notification
            </Button>
          </div>
        </>
      )}
    </Card>
  )
}
