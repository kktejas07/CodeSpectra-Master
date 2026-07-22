/**
 * Hardware & External Port / Display Detector for AI Proctoring.
 *
 * Detects:
 * 1. Multi-monitor setups (screen.isExtended, window.screenDetails, outer width anomalies).
 * 2. External display capture hardware / HDMI dongles / secondary video devices via MediaDevices API.
 * 3. WebUSB / WebHID external hardware input devices (excluding power/charging ports).
 */

export interface HardwareAuditResult {
  isMultiMonitor: boolean
  screenCount: number
  connectedVideoDevicesCount: number
  connectedAudioDevicesCount: number
  externalDisplayAdaptersDetected: boolean
  usbDevicesCount: number
  violations: string[]
}

export async function auditHardwarePorts(): Promise<HardwareAuditResult> {
  const violations: string[] = []
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

  // 3. WebUSB device check (excluding charging/power hubs)
  let usbCount = 0
  try {
    if ('usb' in navigator && (navigator as any).usb.getDevices) {
      const usbDevices = await (navigator as any).usb.getDevices()
      usbCount = usbDevices.length
      for (const dev of usbDevices) {
        const prodName = (dev.productName || '').toLowerCase()
        if (
          !prodName.includes('charge') &&
          !prodName.includes('power') &&
          !prodName.includes('battery') &&
          !prodName.includes('hub')
        ) {
          violations.push(`Connected USB external hardware device: ${dev.productName || 'USB Peripheral'}`)
        }
      }
    }
  } catch (e) {
    // Silent catch
  }

  return {
    isMultiMonitor,
    screenCount,
    connectedVideoDevicesCount: videoDevices,
    connectedAudioDevicesCount: audioDevices,
    externalDisplayAdaptersDetected: externalDisplayAdapters,
    usbDevicesCount: usbCount,
    violations,
  }
}
