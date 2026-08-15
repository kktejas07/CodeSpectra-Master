/**
 * CodeSpectra Device Audit — Background Service Worker (MV3).
 *
 * Responsibilities:
 * 1. Enumerate USB/HID/storage devices via Chrome extension APIs.
 * 2. Classify each device (safe / warn / blocked).
 * 3. Watch for hotplug events (storage attach/detach + USB polling).
 * 4. Report full audit + hotplug events to POST /api/proctor/events.
 *
 * chrome.system.storage sees pen drives (type "usb") — the key gap WebUSB can't fill.
 */

const API_BASE = 'https://codespectra.ai'
const POLL_INTERVAL_MS = 5000
const STORAGE_KEY = 'cspectra_last_audit'

let currentSession = null // { sessionKind, sessionId }
let knownDevices = new Map() // key: id → device snapshot
let pollTimer = null

// ─── Classification (duplicated from lib/classify.js — service worker can't import content_scripts) ──

const BLOCKED_USB_CLASSES = new Set([0x08])
const SAFE_USB_CLASSES    = new Set([0x03, 0x09])
const SAFE_HID_USAGES     = new Set([0x01])
const WARN_HID_USAGES     = new Set([0x0d])

const USB_CLASS_NAMES = {
  0x01: 'Audio', 0x02: 'CDC/Serial', 0x03: 'HID', 0x07: 'Printer',
  0x08: 'Mass Storage', 0x09: 'Hub', 0x0e: 'Video', 0xff: 'Vendor-specific',
}

const STORAGE_TYPE_NAMES = {
  usb: 'USB Storage', fixed: 'Internal Storage',
  removable: 'Removable Media', unknown: 'Unknown Storage',
}

function classifyUsbClass(classCode) {
  if (classCode === undefined || classCode === null) return { verdict: 'warn', reason: 'Unknown device class' }
  if (BLOCKED_USB_CLASSES.has(classCode)) return { verdict: 'blocked', reason: `Mass storage / pen drive (class 0x${classCode.toString(16)})` }
  if (SAFE_USB_CLASSES.has(classCode)) return { verdict: 'safe', reason: USB_CLASS_NAMES[classCode] || 'Known safe class' }
  return { verdict: 'warn', reason: `Unrecognized USB class (0x${classCode.toString(16)})` }
}

function classifyHidUsage(usagePage) {
  if (usagePage === undefined || usagePage === null) return { verdict: 'safe', reason: 'Default HID' }
  if (SAFE_HID_USAGES.has(usagePage)) return { verdict: 'safe', reason: 'Mouse / Keyboard' }
  if (WARN_HID_USAGES.has(usagePage)) return { verdict: 'warn', reason: 'Pen digitizer / drawing tablet' }
  return { verdict: 'warn', reason: `Unrecognized HID usage (0x${usagePage.toString(16)})` }
}

function classifyStorageType(type) {
  if (type === 'usb') return { verdict: 'blocked', reason: 'USB removable storage detected' }
  if (type === 'fixed') return { verdict: 'safe', reason: 'Internal storage' }
  if (type === 'removable') return { verdict: 'warn', reason: 'Removable media (CD/floppy)' }
  return { verdict: 'warn', reason: 'Unknown storage type' }
}

// ─── Enumeration ─────────────────────────────────────────────────────────────

async function enumerateAll() {
  const devices = []

  // 1. Chrome System Storage (pen drives, external disks)
  if (chrome.system?.storage?.getInfo) {
    try {
      const info = await chrome.system.storage.getInfo()
      for (const d of info) {
        const { verdict, reason } = classifyStorageType(d.type)
        devices.push({
          id: `storage-${d.id}`,
          kind: 'storage',
          name: d.name || STORAGE_TYPE_NAMES[d.type] || 'Storage Device',
          type: d.type,
          capacity: d.capacity,
          verdict,
          reason,
        })
      }
    } catch (e) {
      console.warn('[cspectra] storage.getInfo failed:', e)
    }
  }

  // 2. Chrome HID (mice, keyboards, game controllers, pen tablets)
  if (chrome.hid?.getDevices) {
    try {
      const hids = await chrome.hid.getDevices({})
      for (const d of hids) {
        const usagePage = d.collections?.[0]?.usagePage
        const { verdict, reason } = classifyHidUsage(usagePage)
        devices.push({
          id: `hid-${d.vendorId}-${d.productId}`,
          kind: 'hid',
          name: d.productName || 'HID Peripheral',
          manufacturer: d.manufacturerName,
          vendorId: d.vendorId,
          productId: d.productId,
          usagePage,
          verdict,
          reason,
        })
      }
    } catch (e) {
      console.warn('[cspectra] hid.getDevices failed:', e)
    }
  }

  // 3. Chrome USB (other USB devices — vendor-specific class 0xFF, etc.)
  if (chrome.usb?.getDevices) {
    try {
      const usbs = await chrome.usb.getDevices({})
      for (const d of usbs) {
        let classCode
        try {
          classCode = d.configurations?.[0]?.interfaces?.[0]?.alternates?.[0]?.interfaceClass
        } catch { /* ignore */ }
        const { verdict, reason } = classifyUsbClass(classCode)
        devices.push({
          id: `usb-${d.vendorId}-${d.productId}`,
          kind: 'usb',
          name: d.productName || `USB Device (0x${(d.vendorId || 0).toString(16)})`,
          manufacturer: d.manufacturerName,
          vendorId: d.vendorId,
          productId: d.productId,
          classCode,
          verdict,
          reason,
        })
      }
    } catch (e) {
      console.warn('[cspectra] usb.getDevices failed:', e)
    }
  }

  return devices
}

// ─── Reporting ───────────────────────────────────────────────────────────────

async function reportToApi(eventType, meta) {
  if (!currentSession) return
  const payload = {
    session_kind: currentSession.sessionKind,
    session_id: currentSession.sessionId,
    event_type: eventType,
    meta: { ...meta, source: 'chrome-extension' },
  }
  // Retry transient failures — the server enforces a hardware_port_audit event
  // before accepting a submission, so a single dropped POST must not block a
  // legitimate candidate.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${API_BASE}/api/proctor/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      })
      if (res.ok) return true
      console.warn(`[cspectra] API report ${eventType} failed (${res.status}), attempt ${attempt + 1}`)
    } catch (e) {
      console.warn(`[cspectra] API report ${eventType} failed (network), attempt ${attempt + 1}:`, e)
    }
    await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
  }
  return false
}

// ─── Audit ───────────────────────────────────────────────────────────────────

async function runFullAudit() {
  const devices = await enumerateAll()
  const blocked = devices.filter((d) => d.verdict === 'blocked')
  const warns = devices.filter((d) => d.verdict === 'warn')
  const safe = devices.filter((d) => d.verdict === 'safe')

  // Cache for popup
  const audit = {
    timestamp: Date.now(),
    total: devices.length,
    safe: safe.length,
    warn: warns.length,
    blocked: blocked.length,
    devices,
    session: currentSession,
  }
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: audit })
  } catch { /* ignore */ }

  // Report to API
  await reportToApi('hardware_port_audit', {
    total: devices.length,
    safe: safe.length,
    warn: warns.length,
    blocked: blocked.length,
    devices: devices.map((d) => ({
      kind: d.kind,
      name: d.name,
      vendorId: d.vendorId,
      productId: d.productId,
      classCode: d.classCode,
      usagePage: d.usagePage,
      type: d.type,
      verdict: d.verdict,
      reason: d.reason,
    })),
  })

  // Update known devices for hotplug diffing
  knownDevices.clear()
  for (const d of devices) {
    knownDevices.set(d.id, d)
  }

  // Notify content script
  notifyContentScript({ type: 'audit-result', audit })

  return audit
}

async function diffAndReport() {
  const current = await enumerateAll()
  const currentIds = new Set(current.map((d) => d.id))

  // Detect removed devices
  for (const [id, prev] of knownDevices) {
    if (!currentIds.has(id)) {
      await reportToApi('usb_device_removed', {
        device: { id, name: prev.name, kind: prev.kind, verdict: prev.verdict },
      })
    }
  }

  // Detect newly inserted devices
  for (const d of current) {
    if (!knownDevices.has(d.id)) {
      await reportToApi('usb_device_inserted', {
        device: { id: d.id, name: d.name, kind: d.kind, verdict: d.verdict, reason: d.reason },
      })
    }
  }

  knownDevices.clear()
  for (const d of current) {
    knownDevices.set(d.id, d)
  }

  // Update cache
  try {
    const existing = (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY] || {}
    await chrome.storage.local.set({
      [STORAGE_KEY]: { ...existing, timestamp: Date.now(), total: current.length },
    })
  } catch { /* ignore */ }
}

// ─── Hotplug watcher ────────────────────────────────────────────────────────

function startHotplugWatcher() {
  // Storage hotplug (real-time via events)
  if (chrome.system?.storage?.onAttached) {
    chrome.system.storage.onAttached.addListener((info) => {
      console.log('[cspectra] storage attached:', info)
      reportToApi('usb_device_inserted', {
        device: { id: info.id, name: info.name, kind: 'storage', verdict: 'blocked', reason: 'USB storage hotplug' },
      })
    })
  }
  if (chrome.system?.storage?.onDetached) {
    chrome.system.storage.onDetached.addListener((id) => {
      console.log('[cspectra] storage detached:', id)
      reportToApi('usb_device_removed', {
        device: { id, kind: 'storage', verdict: 'blocked' },
      })
    })
  }

  // USB/HID polling (no native hotplug event in MV3 for all devices)
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = setInterval(() => {
    if (currentSession) diffAndReport()
  }, POLL_INTERVAL_MS)
}

function stopHotplugWatcher() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
}

// ─── Content script bridge ───────────────────────────────────────────────────

function notifyContentScript(msg) {
  const urlPatterns = [
    'https://codespectra.ai/assessment/*',
    'https://codespectra.ai/dashboard/assessments/*',
    'https://codespectra.ai/dashboard/admin/assessments/*',
    'http://localhost:3000/assessment/*',
    'http://localhost:3000/dashboard/assessments/*',
  ]
  try {
    chrome.tabs.query({ url: urlPatterns }, (tabs) => {
      if (chrome.runtime.lastError || !tabs) return
      if (!Array.isArray(tabs)) return
      for (const tab of tabs) {
        if (tab?.id) {
          chrome.tabs.sendMessage(tab.id, msg).catch(() => null)
        }
      }
    })
  } catch (e) {
    console.warn('[cspectra] notifyContentScript failed:', e)
  }
}

// ─── Message handler ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'start-audit') {
    currentSession = { sessionKind: msg.sessionKind, sessionId: msg.sessionId }
    runFullAudit().then((audit) => {
      startHotplugWatcher()
      sendResponse({ ok: true, audit })
    }).catch((e) => {
      console.error('[cspectra] audit failed:', e)
      sendResponse({ ok: false, error: e.message })
    })
    return true // async response
  }

  if (msg.type === 'get-audit') {
    chrome.storage.local.get(STORAGE_KEY).then((data) => {
      sendResponse(data[STORAGE_KEY] || null)
    })
    return true
  }

  if (msg.type === 'stop-audit') {
    stopHotplugWatcher()
    currentSession = null
    sendResponse({ ok: true })
    return false
  }

  if (msg.type === 'is-installed') {
    sendResponse({ installed: true, version: chrome.runtime.getManifest().version })
    return false
  }
})

// ─── Lifecycle ───────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  console.log('[cspectra] extension installed, version', chrome.runtime.getManifest().version)
})
