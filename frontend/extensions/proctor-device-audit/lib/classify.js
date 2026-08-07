/**
 * USB class / HID usage page / Storage type classification.
 * Shared between background.js and content.js.
 *
 * ponytail: WebUSB blocklists mass-storage (0x08) and boot-HID (mouse/keyboard)
 * from the web page API. Chrome extension APIs (chrome.system.storage, chrome.hid,
 * chrome.usb) do NOT have this blocklist — they see everything.
 */

const BLOCKED_USB_CLASSES = new Set([0x08]) // Mass storage (pen drives, external disks)
const SAFE_USB_CLASSES    = new Set([0x03, 0x09]) // HID (mouse/keyboard), Hub
const SAFE_HID_USAGES     = new Set([0x01]) // Generic Desktop (mouse, keyboard)
const WARN_HID_USAGES     = new Set([0x0d]) // Digitizer (pen tablet)

const USB_CLASS_NAMES = {
  0x01: 'Audio',
  0x02: 'CDC/Serial',
  0x03: 'HID',
  0x07: 'Printer',
  0x08: 'Mass Storage',
  0x09: 'Hub',
  0x0e: 'Video',
  0xff: 'Vendor-specific',
}

const STORAGE_TYPE_NAMES = {
  usb: 'USB Storage',
  fixed: 'Internal Storage',
  removable: 'Removable Media',
  unknown: 'Unknown Storage',
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
