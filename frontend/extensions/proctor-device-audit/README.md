# CodeSpectra Device Audit — Chrome Extension

Detects connected USB/HID/storage devices during proctored CodeSpectra assessments. Pen drives, unauthorized peripherals, and hotplug events are flagged in real time and reported to the proctor log.

## Why this exists

The browser WebUSB API **blocklists mass-storage devices (pen drives) and HID mice/keyboards** — they never appear in a web page's device enumeration. This extension uses Chrome's privileged extension APIs to see what the web cannot:

| API | What it detects | Web API can see? |
|---|---|---|
| `chrome.system.storage` | Pen drives, USB storage, removable disks | ❌ No |
| `chrome.hid` | HID devices (mice, keyboards, game controllers) | ❌ Blocklisted |
| `chrome.usb` | Other USB devices | ✅ Granted only |
| `chrome.system.storage.onAttached` | Real-time hotplug | ❌ No |

## Install (developer)

1. Open `chrome://extensions/` in Chrome.
2. Enable **Developer mode** (toggle in top-right).
3. Click **Load unpacked**.
4. Select the `frontend/extensions/proctor-device-audit/` directory.
5. The extension icon appears in the toolbar. Pin it for easy access.

## How it works

### On exam start
1. The content script injects a `<meta name="cspectra-audit">` tag on assessment/exam pages.
2. The exam page checks for this tag. If missing, a **"Install Extension"** modal is shown and the assessment **cannot be started** (both the pre-start screen and the active exam UI are gated).
3. The content script extracts the session ID from the URL and requests a full audit from the background service worker.
4. The background enumerates all USB/HID/storage devices, classifies each (safe/warn/blocked), and reports to `POST /api/proctor/events`.
5. The exam page receives the audit result and displays it.
6. The submit API **rejects submissions** for logged-in candidates who have no `hardware_port_audit` event recorded for that exam (no extension → no assessment, even via direct API calls).

### How users get updates
Chrome extensions **do not update from git**. The store only serves what you upload:
1. Bump `version` in `manifest.json`.
2. Zip: `cd frontend/extensions/proctor-device-audit && zip -r code-spectra-device-audit-vX.Y.Z.zip .`
3. Upload at https://chrome.google.com/webstore/devconsole → the existing item → **Upload new package**.
4. Submit for review → once published, all users auto-update within ~5h.

### During the exam
- **Hotplug watcher** runs in the background: `chrome.system.storage.onAttached` fires instantly when a pen drive is inserted. USB/HID polling runs every 5 seconds.
- Each hotplug event is reported as `usb_device_inserted` or `usb_device_removed` to the proctor log.

### Device classification

| Verdict | Device types | Action |
|---|---|---|
| 🟢 **Safe** | Mouse, keyboard (HID class 0x03), hub (0x09), internal storage | Accepted, no flag |
| 🟠 **Review** | Pen digitizer, vendor-specific USB, unknown HID usage | Flagged for review |
| 🔴 **Blocked** | Pen drive, external disk (mass storage class 0x08), USB storage | Blocked, reported to proctor |

### Popup UI
Click the extension icon to see:
- Device count breakdown (safe / review / blocked)
- Full device list with names and reasons
- Hotplug watcher status
- Last scan timestamp
- Manual rescan button

## Permissions

| Permission | Why |
|---|---|
| `system.storage` | Enumerate pen drives and external storage |
| `hid` | Enumerate HID devices (mice, keyboards, game controllers) |
| `usb` | Enumerate other USB devices |
| `activeTab` | Read current tab URL for session extraction |
| `tabs` | `chrome.tabs.query` by URL pattern to notify open exam pages |
| `storage` | Cache last audit for popup display |

## Publishing to Chrome Web Store

1. Register as a Chrome Web Store developer: https://chrome.google.com/webstore/devconsole ($5 one-time fee).
2. Zip the extension directory: `cd frontend/extensions/proctor-device-audit && zip -r proctor-device-audit.zip .`
3. Upload at https://chrome.google.com/webstore/devconsole/add.
4. Fill in store listing, screenshots, privacy policy.
5. Submit for review (3–14 days).

## Publishing to Firefox Add-ons

1. Register at https://addons.mozilla.org/ (free).
2. Zip the extension.
3. Upload at https://addons.mozilla.org/developers/addon/submit/.
4. Submit for review (1–5 days, faster than Chrome).

## Publishing to Edge Add-ons

1. Register at https://partner.microsoft.com/dashboard/ (free).
2. Same Chromium format — almost zero changes needed.
3. Submit for review (3–7 days).

## Files

| File | Description |
|---|---|
| `manifest.json` | MV3 manifest with permissions |
| `background.js` | Service worker: enumeration, hotplug, API reporting |
| `content.js` | Injected on exam pages: marker injection, session extraction, message bridge |
| `popup.html/js/css` | Extension popup UI |
| `lib/classify.js` | USB class / HID usage / Storage type taxonomy |
| `icons/` | Extension icons (placeholder — replace with branded icons before publishing) |
