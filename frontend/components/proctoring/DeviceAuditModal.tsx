'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  ShieldCheck,
  Usb,
  MousePointerClick,
  HardDrive,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Loader2,
  ScanLine,
} from 'lucide-react'
import {
  auditHardwarePorts,
  enumeratePeripheralDevices,
  promptPeripheralGrant,
  type HardwareAuditResult,
  type DetectedDevice,
} from '@/lib/proctoring/hardware-detector'
import { csrfFetch } from '@/lib/csrf-fetch'

interface DeviceAuditModalProps {
  sessionKind: 'exam' | 'problem' | 'interview'
  sessionId: string
  onComplete: (result: HardwareAuditResult) => void
}

function verdictColor(verdict: DetectedDevice['verdict']) {
  if (verdict === 'safe') return { badge: 'bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30', icon: <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />, label: 'Safe' }
  if (verdict === 'warn') return { badge: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30', icon: <AlertTriangle className="h-4 w-4 text-amber-500" />, label: 'Review' }
  return { badge: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30', icon: <XCircle className="h-4 w-4 text-red-500" />, label: 'Blocked' }
}

function deviceIcon(dev: DetectedDevice) {
  if (dev.kind === 'hid') return <MousePointerClick className="h-4 w-4 text-muted-foreground" />
  if (dev.classCode === 0x08) return <HardDrive className="h-4 w-4 text-muted-foreground" />
  return <Usb className="h-4 w-4 text-muted-foreground" />
}

export function DeviceAuditModal({ sessionKind, sessionId, onComplete }: DeviceAuditModalProps) {
  const [audit, setAudit] = useState<HardwareAuditResult | null>(null)
  const [scanning, setScanning] = useState(true)
  const [completing, setCompleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setScanning(true)
    setError(null)
    try {
      const peripherals = await enumeratePeripheralDevices()
      const base = await auditHardwarePorts()

      // Check if Chrome extension is installed for deeper USB/storage detection
      let extensionDevices: DetectedDevice[] = []
      const extMarker = document.querySelector('meta[name="cspectra-audit"]')
      if (extMarker) {
        // Chrome extension is active — request deeper audit via content script bridge
        try {
          const extResult = await new Promise<any>((resolve) => {
            window.addEventListener('cspectra-audit-result' as any, (e: any) => resolve(e.detail), { once: true })
            // Extension will dispatch cspectra-audit-result event
            setTimeout(() => resolve(null), 3000) // timeout after 3s
          })
          if (extResult?.devices) {
            extensionDevices = extResult.devices.map((d: any) => ({
              productName: d.name || d.productName || 'Unknown Device',
              vendorId: d.vendorId || 0,
              productId: d.productId || 0,
              classCode: d.classCode,
              usagePage: d.usagePage,
              kind: d.kind || 'usb',
              verdict: d.verdict || 'warn',
              reason: d.reason || 'Detected by Chrome extension',
            }))
          }
        } catch { /* extension audit timeout or error */ }
      }

      // Merge WebUSB + extension devices (dedupe by vendorId+productId)
      const allPeripherals = [...peripherals]
      for (const extDev of extensionDevices) {
        const isDupe = allPeripherals.some(p => p.vendorId === extDev.vendorId && p.productId === extDev.productId && p.kind === extDev.kind)
        if (!isDupe) allPeripherals.push(extDev)
      }

      setAudit({ ...base, devices: allPeripherals })
    } catch (e) {
      setError('Device scan failed. You can retry or continue without a full audit.')
      console.error('[device-audit] scan failed:', e)
    } finally {
      setScanning(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const handleScanMore = async () => {
    setScanning(true)
    setError(null)
    try {
      const newlyGranted = await promptPeripheralGrant()
      const existing = audit?.devices ?? []
      const merged = [...existing, ...newlyGranted.filter((d) => !existing.some((e) => e.vendorId === d.vendorId && e.productId === d.productId && e.kind === d.kind))]
      const base = await auditHardwarePorts()
      setAudit({ ...base, devices: merged })
    } catch (e) {
      setError('Device scan failed. You can retry or continue without a full audit.')
      console.error('[device-audit] scan-more failed:', e)
    } finally {
      setScanning(false)
    }
  }

  const handleComplete = async () => {
    if (!audit) return
    setCompleting(true)
    const blocked = audit.devices.filter((d) => d.verdict === 'blocked')
    const warns = audit.devices.filter((d) => d.verdict === 'warn')
    const safe = audit.devices.filter((d) => d.verdict === 'safe')
    try {
      await csrfFetch('/api/proctor/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_kind: sessionKind,
          session_id: sessionId,
          event_type: 'hardware_port_audit',
          meta: {
            total: audit.devices.length,
            safe: safe.length,
            warn: warns.length,
            blocked: blocked.length,
            multi_monitor: audit.isMultiMonitor,
            screen_count: audit.screenCount,
            devices: audit.devices.map((d) => ({
              kind: d.kind,
              productName: d.productName,
              vendorId: d.vendorId,
              productId: d.productId,
              classCode: d.classCode,
              usagePage: d.usagePage,
              verdict: d.verdict,
              reason: d.reason,
            })),
          },
        }),
      }).catch(() => null)
    } finally {
      setCompleting(false)
      onComplete(audit)
    }
  }

  const blocked = audit?.devices.filter((d) => d.verdict === 'blocked') ?? []
  const warns = audit?.devices.filter((d) => d.verdict === 'warn') ?? []
  const safe = audit?.devices.filter((d) => d.verdict === 'safe') ?? []

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="max-w-2xl w-full rounded-3xl border border-border bg-card p-6 shadow-2xl dark:shadow-none space-y-5 text-foreground max-h-[90vh] overflow-y-auto">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Device check</h2>
            <div className="text-xs text-muted-foreground">
              Scanning connected USB devices before your proctored session starts.
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-700 dark:text-amber-300">
            {error}
          </div>
        )}

        {scanning && !audit ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Scanning USB & HID devices…
          </div>
        ) : (
          <div className="space-y-4">
            {/* Summary cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-2xl border border-green-500/30 bg-green-500/10 p-3 text-center">
                <div className="text-2xl font-bold tabular-nums text-green-700 dark:text-green-400">{safe.length}</div>
                <div className="text-[11px] font-medium text-green-700 dark:text-green-300">Safe</div>
              </div>
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-center">
                <div className="text-2xl font-bold tabular-nums text-amber-700 dark:text-amber-400">{warns.length}</div>
                <div className="text-[11px] font-medium text-amber-700 dark:text-amber-300">Review</div>
              </div>
              <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-center">
                <div className="text-2xl font-bold tabular-nums text-red-600 dark:text-red-400">{blocked.length}</div>
                <div className="text-[11px] font-medium text-red-700 dark:text-red-300">Blocked</div>
              </div>
            </div>

            {/* Device list */}
            {audit && audit.devices.length === 0 ? (
              <div className="rounded-xl border border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
                <ScanLine className="mx-auto mb-2 h-6 w-6" />
                No external USB/HID devices detected. Power cable and standard peripherals are fine.
              </div>
            ) : (
              <ul className="space-y-2">
                {(audit?.devices ?? []).map((dev, i) => {
                  const c = verdictColor(dev.verdict)
                  return (
                    <li key={i} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/20 px-4 py-2.5">
                      <div className="flex items-center gap-3 min-w-0">
                        {deviceIcon(dev)}
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{dev.productName}</div>
                          <div className="text-[11px] text-muted-foreground truncate">
                            {dev.kind === 'hid' ? 'HID' : 'USB'} device
                            {dev.reason ? ` · ${dev.reason}` : ''}
                          </div>
                        </div>
                      </div>
                      <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-bold flex items-center gap-1.5 ${c.badge}`}>
                        {c.icon} {c.label}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}

            {/* Notices */}
            <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-[11px] leading-relaxed text-muted-foreground space-y-1.5">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 text-green-600 dark:text-green-400 shrink-0" />
                <span>Power cable, mouse &amp; keyboard are accepted automatically.</span>
              </div>
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 text-amber-500 shrink-0" />
                <span>Pen drives (mass storage) and unrecognised devices are blocked and reported to the proctor.</span>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-1">
          <button
            onClick={() => void handleScanMore()}
            disabled={scanning || completing}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Allow access and scan again
          </button>
          <button
            onClick={() => void handleComplete()}
            disabled={scanning || completing}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {completing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            Continue to assessment
          </button>
        </div>
      </div>
    </div>
  )
}
