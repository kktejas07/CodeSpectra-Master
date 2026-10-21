'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Laptop, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { EmptyState } from '@/components/ui/empty-state'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useToast } from '@/lib/toast-context'
import { useConfirm } from '@/lib/confirm-context'
import { useLocaleDates } from '@/lib/i18n/use-dates'
import { useT } from '@/lib/i18n/client'

interface TrustedDevice {
  id: string
  user_agent: string
  created_at: string
  last_used_at: string
  current: boolean
}

interface FaceStatus {
  enrolled: boolean
  enabled: boolean
  available: boolean
}

/**
 * Security settings: turn face sign-in on or off, and manage the devices
 * that can use it without an emailed code.
 */
export function FaceSignInSection() {
  const { formatDateTime } = useLocaleDates()
  const { t } = useT()
  const addToast = useToast()
  const confirmDialog = useConfirm()
  const [face, setFace] = useState<FaceStatus | null>(null)
  const [devices, setDevices] = useState<TrustedDevice[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoadError(false)
    try {
      const [f, d] = await Promise.all([
        fetch('/api/auth/face-login', { credentials: 'include' }),
        fetch('/api/auth/trusted-devices', { credentials: 'include' }),
      ])
      if (!f.ok || !d.ok) throw new Error(t('dash.loadFailed'))
      setFace(await f.json())
      setDevices(((await d.json()).devices as TrustedDevice[]) || [])
    } catch {
      setLoadError(true)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const toggleFace = async (enabled: boolean) => {
    setBusy('toggle')
    try {
      const res = await csrfFetch('/api/auth/face-login', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || t('dash.couldntSaveTheSetting'))
      setFace(json)
      addToast({ type: 'success', title: enabled ? t('dash.faceSignInTurnedOn') : t('dash.faceSignInTurnedOff') })
    } catch (e) {
      addToast({ type: 'error', title: t('dash.couldntSave'), message: e instanceof Error ? e.message : t('common.tryAgainSentence') })
    } finally {
      setBusy(null)
    }
  }

  const remove = async (target: { id: string } | { all: true }) => {
    const all = 'all' in target
    const ok = await confirmDialog({
      title: all ? t('dash.removeAllTrustedDevices') : t('dash.removeThisDevice'),
      description: all
        ? t('dash.faceSignInOnAnyDevice690')
        : t('dash.faceSignInOnThisDevice438'),
    })
    if (!ok) return
    setBusy(all ? 'all' : target.id)
    try {
      const res = await csrfFetch('/api/auth/trusted-devices', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(target),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || t('dash.couldntRemoveTheDevice'))
      setDevices((prev) => (all ? [] : (prev || []).filter((d) => d.id !== target.id)))
      addToast({ type: 'success', title: all ? t('dash.allDevicesRemoved') : t('dash.deviceRemoved') })
    } catch (e) {
      addToast({ type: 'error', title: t('dash.couldntRemove'), message: e instanceof Error ? e.message : t('common.tryAgainSentence') })
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <div className="flex items-center justify-between gap-4 px-6 py-5">
        <div className="min-w-0 space-y-0.5">
          <p className="font-medium text-foreground">{t('dash.faceSignIn')}</p>
          <p className="text-sm text-muted-foreground">
            {face === null
              ? loadError ? t('dash.couldntLoadThisSetting') : t('dash.loadingStatus')
              : !face.enrolled
                ? t('dash.enrollYourFaceAboveToSign5a1')
                : face.enabled
                  ? t('dash.onSignInByLookingAt55e')
                  : t('dash.offYourFaceIsOnlyUsedaef')}
          </p>
        </div>
        {face === null ? (
          loadError ? (
            <Button variant="outline" size="sm" onClick={() => void load()}>{t('common.retry')}</Button>
          ) : (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )
        ) : (
          <Switch
            checked={face.enrolled && face.enabled}
            disabled={!face.enrolled || busy === 'toggle'}
            onCheckedChange={(v) => void toggleFace(v)}
            aria-label={t('dash.faceSignIn')}
          />
        )}
      </div>
      <Separator className="mx-6 w-auto" />
      <div className="px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 space-y-0.5">
            <p className="font-medium text-foreground">{t('dash.trustedDevices')}</p>
            <p className="text-sm text-muted-foreground">{t('dash.devicesWhereYouveSignedInFully7b2')}</p>
          </div>
          {devices && devices.length > 0 && (
            <Button variant="outline" size="sm" className="gap-2 shrink-0" disabled={busy !== null} onClick={() => void remove({ all: true })}>
              {busy === 'all' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}{t('dash.removeAll')}</Button>
          )}
        </div>
        {devices === null ? (
          !loadError && (
            <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />{' '}{t('dash.loadingDevices')}</div>
          )
        ) : devices.length === 0 ? (
          <EmptyState
            compact
            illustration="security"
            title={t('dash.noTrustedDevices')}
            description={t('dash.signInWithYourPasswordGoogle406')}
          />
        ) : (
          <ul className="mt-4 divide-y divide-border/60 rounded-2xl border border-border/60">
            {devices.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Laptop className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {d.user_agent}
                      {d.current && <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{t('dash.thisDevice')}</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">{t('dash.lastUsed')}{' '}{formatDateTime(d.last_used_at, undefined, { dateStyle: 'medium', timeStyle: 'short' })}{' '}{t('dash.addedDate', { date: formatDateTime(d.created_at, undefined, { dateStyle: 'medium' }) })}</p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" disabled={busy !== null} onClick={() => void remove({ id: d.id })}>
                  {busy === d.id ? <Loader2 className="h-4 w-4 animate-spin" /> : t('dash.remove')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}
