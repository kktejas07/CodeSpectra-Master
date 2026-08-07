/**
 * Hardware & External Port / Display Detector for AI Proctoring.
 *
 * Detects:
 * 1. Multi-monitor setups (screen.isExtended, window.screenDetails, outer width anomalies).
 * 2. External display capture hardware / HDMI dongles / secondary video devices via MediaDevices API.
 * 3. WebUSB / WebHID external hardware input devices (excluding power/charging ports).
 *
 * ponytail: WebUSB/HID only expose devices the site was GRANTED access to (browser
 * privacy boundary). The DeviceAuditModal pairs this with a `requestDevice()` grant
 * prompt so the candidate can opt in to a full scan. Pen drives (mass storage class
 * 0x08) and HID mice/keyboards are blocklisted by the browser and will NOT appear
 * here — that gap is covered by the native lockdown agent design (docs/security).
 */

/** USB class codes that are always safe / required for an exam. */
const SAFE_USB_CLASSES = new Set<number>([
  0x03, // HID (mouse / keyboard)
  0x09, // Hub
])

/** HID usage pages that map to a plain mouse/keyboard. */
const SAFE_HID_USAGES = new Set<number>([
  0x01, // Generic Desktop (mouse, keyboard)
])

/** USB mass storage class code (pen drives / external disks). */
const MASS_STORAGE_CLASS = 0x08

/** WebHID collection usage page for pen digitizers / tablets — treat as warn. */
const WARN_HID_USAGES = new Set<number>([
  0x0d, // Digitizer (pen tablet)
])

export type DeviceVerdict = 'safe' | 'warn' | 'blocked'

export interface DetectedDevice {
  kind: 'usb' | 'hid'
  productName: string
  manufacturerName?: string
  vendorId?: number
  productId?: number
  classCode?: number
  usagePage?: number
  verdict: DeviceVerdict
  reason?: string
}

export interface HardwareAuditResult {
  isMultiMonitor: boolean
  screenCount: number
  connectedVideoDevicesCount: number
  connectedAudioDevicesCount: number
  externalDisplayAdaptersDetected: boolean
  usbDevicesCount: number
  devices: DetectedDevice[]
  violations: string[]
}

function verdictForUsbClass(classCode?: number): { verdict: DeviceVerdict; reason?: string } {
  if (classCode === undefined) return { verdict: 'warn', reason: 'Unknown device class' }
  if (classCode === MASS_STORAGE_CLASS) return { verdict: 'blocked', reason: 'Mass storage / pen drive detected (class 0x08)' }
  if (SAFE_USB_CLASSES.has(classCode)) return { verdict: 'safe' }
  return { verdict: 'warn', reason: `Unrecognized USB device class (0x${classCode.toString(16)})` }
}

function verdictForHidUsage(usagePage?: number): { verdict: DeviceVerdict; reason?: string } {
  if (usagePage === undefined) return { verdict: 'safe' }
  if (SAFE_HID_USAGES.has(usagePage)) return { verdict: 'safe' }
  if (WARN_HID_USAGES.has(usagePage)) return { verdict: 'warn', reason: 'Pen digitizer / drawing tablet detected' }
  return { verdict: 'warn', reason: `Unrecognized HID usage page (0x${usagePage.toString(16)})` }
}

/**
 * Enumerate WebUSB + WebHID devices the site has been granted access to.
 * Classifies each against an allowlist (mouse/keyboard/hub = safe, mass storage = blocked).
 */
export async function enumeratePeripheralDevices(): Promise<DetectedDevice[]> {
  const out: DetectedDevice[] = []
  const nav = navigator as any

  try {
    if (nav?.usb?.getDevices) {
      const usbDevices = await nav.usb.getDevices()
      for (const dev of usbDevices) {
        let classCode: number | undefined
        try {
          classCode = dev.configurations?.[0]?.interfaces?.[0]?.alternates?.[0]?.interfaceClass
        } catch { /* ignore */ }
        const { verdict, reason } = verdictForUsbClass(classCode)
        out.push({
          kind: 'usb',
          productName: dev.productName || 'USB Peripheral',
          manufacturerName: dev.manufacturerName,
          vendorId: dev.vendorId,
          productId: dev.productId,
          classCode,
          verdict,
          reason,
        })
      }
    }
  } catch (e) {
    // Silent catch
  }

  try {
    if (nav?.hid?.getDevices) {
      const hidDevices = await nav.hid.getDevices()
      for (const dev of hidDevices) {
        const usagePage = dev.collections?.[0]?.usagePage
        const { verdict, reason } = verdictForHidUsage(usagePage)
        out.push({
          kind: 'hid',
          productName: dev.productName || 'HID Peripheral',
          manufacturerName: dev.manufacturerName,
          vendorId: dev.vendorId,
          productId: dev.productId,
          usagePage,
          verdict,
          reason,
        })
      }
    }
  } catch (e) {
    // Silent catch
  }

  return out
}

/**
 * Prompt the candidate to grant access to connected USB/HID devices (user gesture
 * required by the browser). Filters are empty so the full chooser is shown. Returns
 * newly-granted devices classified for display.
 */
export async function promptPeripheralGrant(): Promise<DetectedDevice[]> {
  const granted: DetectedDevice[] = []
  const nav = navigator as any

  try {
    if (nav?.usb?.requestDevice) {
      const dev = await nav.usb.requestDevice({ filters: [] })
      let classCode: number | undefined
      try {
        classCode = dev.configurations?.[0]?.interfaces?.[0]?.alternates?.[0]?.interfaceClass
      } catch { /* ignore */ }
      const { verdict, reason } = verdictForUsbClass(classCode)
      granted.push({
        kind: 'usb',
        productName: dev.productName || 'USB Peripheral',
        manufacturerName: dev.manufacturerName,
        vendorId: dev.vendorId,
        productId: dev.productId,
        classCode,
        verdict,
        reason,
      })
    }
  } catch (e) {
    // User cancelled the chooser — not an error worth surfacing.
  }

  try {
    if (nav?.hid?.requestDevice) {
      const devs = await nav.hid.requestDevice({ filters: [] })
      for (const dev of devs) {
        const usagePage = dev.collections?.[0]?.usagePage
        const { verdict, reason } = verdictForHidUsage(usagePage)
        granted.push({
          kind: 'hid',
          productName: dev.productName || 'HID Peripheral',
          manufacturerName: dev.manufacturerName,
          vendorId: dev.vendorId,
          productId: dev.productId,
          usagePage,
          verdict,
          reason,
        })
      }
    }
  } catch (e) {
    // User cancelled — safe to ignore.
  }

  return granted
}

export async function auditHardwarePorts(): Promise<HardwareAuditResult> {
  const violations: string[] = []
  const devices: DetectedDevice[] = []
  let isMultiMonitor = false
  let screenCount = 1

  // 1. Check Multi-Monitor via Screen Details API / screen.isExtended
  if ('isExtended' in window.screen && (window.screen as any).isExtended) {
    isMultiMonitor = true
    screenCount = 2
    violations.push('External / Secondary display monitor detected (screen.isExtended = true)')
  }

  // Fallback screen dimension ratio check for extended desktops
  if (!isMultiMonitor && window.screen.availWidth > window.screen.width) {
    isMultiMonitor = true
    screenCount = Math.round(window.screen.availWidth / window.screen.width)
    violations.push(`Extended desktop width anomaly detected (${screenCount} screens)`)
  }

  // 2. Check connected MediaDevices (Webcams, HDMI Capture Cards, External Display Capture)
  let videoDevices = 0
  let audioDevices = 0
  let externalDisplayAdapters = false

  try {
    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      const devices = await navigator.mediaDevices.enumerateDevices()
      for (const d of devices) {
        if (d.kind === 'videoinput') {
          videoDevices++
          const label = (d.label || '').toLowerCase()
          if (
            label.includes('hdmi') ||
            label.includes('capture') ||
            label.includes('elgato') ||
            label.includes('obs') ||
            label.includes('cam link') ||
            label.includes('virtual')
          ) {
            externalDisplayAdapters = true
            violations.push(`External video capture / display adapter detected: ${d.label || 'Unknown Capture Card'}`)
          }
        } else if (d.kind === 'audioinput' || d.kind === 'audiooutput') {
          audioDevices++
        }
      }
    }
  } catch (e) {
    // Permission pending or not supported
  }

  if (videoDevices > 1) {
    violations.push(`Multiple cameras/video input devices detected (${videoDevices} cameras)`)
  }

  // 3. WebUSB + WebHID device check (excluding charging/power hubs)
  const peripherals = await enumeratePeripheralDevices()
  devices.push(...peripherals)
  for (const dev of peripherals) {
    if (dev.verdict === 'blocked') {
      violations.push(`Blocked USB device: ${dev.productName} (${dev.reason || 'mass storage'})`)
    } else if (dev.verdict === 'warn') {
      violations.push(`Unrecognized USB/HID device: ${dev.productName} (${dev.reason || 'unknown'})`)
    }
  }

  return {
    isMultiMonitor,
    screenCount,
    connectedVideoDevicesCount: videoDevices,
    connectedAudioDevicesCount: audioDevices,
    externalDisplayAdaptersDetected: externalDisplayAdapters,
    usbDevicesCount: peripherals.length,
    devices,
    violations,
  }
}
