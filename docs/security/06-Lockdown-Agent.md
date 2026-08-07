# Native Lockdown Agent for True USB Port Auditing — CodeSpectra

> **Auto-Generated**: Internal Engineering documentation. Last updated: 2026-08-07.
>
> Status: **DESIGN PROPOSAL** — not implemented. This is the Option B upgrade path for
> full USB port scanning that the browser cannot provide.

## Why the browser cannot do this

The in-browser Device Audit (`frontend/lib/proctoring/hardware-detector.ts`) is
**best-effort by design**. The web platform deliberately hides raw USB enumeration:

1. `navigator.usb.getDevices()` only returns devices the origin was **previously
   granted** access to. It is not a port scan.
2. `navigator.usb.requestDevice()` / `navigator.hid.requestDevice()` require a
   **user gesture** and show a native chooser — the candidate picks what to reveal.
3. WebUSB **blocklists** the exact devices we care about:
   - HID class (0x03) mouse/keyboard → handled by the OS, not exposed.
   - Mass storage class (0x08) pen drives / external disks → not exposed.
4. A power cable is not a USB *data* device and never appears in any enumeration.

So a motivated candidate can simply skip the USB grant and the audit sees nothing.
The only way to enumerate every plugged-in device is native OS access.

## Proposed architecture

A small **desktop "lockdown agent"** that the candidate installs before a
`strict_lockdown` assessment. The web page discovers the agent over WebSocket on
`ws://127.0.0.1:<port>` (same machine, no network exposure) and requests an audit.

```
┌─────────────┐   HTTPS    ┌──────────────┐   ws://127.0.0.1:37xxx   ┌──────────────────┐
│ Browser tab │ ─────────▶ │ Next.js API  │ ◀─────────────────────── │ Native agent      │
│ (exam page) │  report    │ /api/proctor │                          │ (Electron / Tauri)│
└─────────────┘            └──────────────┘                          └──────────────────┘
                                                                      │  USB enumeration │
                                                                      │  OS APIs          │
```

### Agent runtime choice

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **Electron** | Familiar web stack, easy tray UI | ~150 MB install, heavier | Acceptable |
| **Tauri (Rust)** | ~10 MB, faster, `rusb` crate for USB | Rust toolchain for build | **Recommended** |
| .NET / native | Smallest | Cross-platform build complexity | Not chosen |

Tauri + [`rusb`](https://crates.io/crates/rusb) (libusb wrapper) gives cross-platform
(Windows/macOS/Linux) USB enumeration with a tiny footprint.

### USB enumeration & classification (native)

```rust
// libusb_device_descriptor → class codes, identical taxonomy to the browser
match descriptor.class_code() {
  0x03 => Verdict::Safe,        // HID mouse / keyboard
  0x09 => Verdict::Safe,        // Hub
  0x08 => Verdict::Blocked,     // Mass storage (pen drive) 🚨
  _    => Verdict::Warn,        // vendor-specific, serial adapters
}
```

Additional checks the agent can run that the browser cannot:
- **Bus enumeration**: vendorId/productId for every port, even un-granted.
- **Removable-storage detection** (Windows `GetLogicalDrives` / macOS `IOKit`): flag
  any mounted removable volume during the session.
- **Hotplug watch**: libusb hotplug callback fires when a device is plugged in
  *during* the exam — report `usb_device_inserted` to the proctor log in real time.
- **Process/tooling watch**: flag known cheating tools (screen-share apps, VM
  indicators, AI assistant apps) by process name.

### Web ↔ agent handshake

1. Exam page POSTs to a new endpoint `POST /api/proctor/agent-handshake` which returns
   a short-lived token + the candidate's expected port.
2. Exam page connects `ws://127.0.0.1:<port>?token=<token>`.
3. Agent verifies token, runs a full audit, and streams results:
   ```json
   { "type": "device_list", "devices": [ { "vendorId": 0x0781, "productId": 0x5583, "productName": "SanDisk Ultra", "classCode": 0x08, "verdict": "blocked" } ] }
   { "type": "hotplug", "vendorId": 0x0781, "productId": 0x5583, "verdict": "blocked" }
   ```
4. Exam page forwards events to `POST /api/proctor/events` (existing endpoint) so the
   full log lives server-side alongside browser-proctor events.

### Security boundaries (important)

- **Local-only**: the agent binds to `127.0.0.1` and requires a per-session token.
  It never listens on a public interface.
- **Scoped permissions**: the agent asks the OS for USB access only; it does NOT
  require admin privileges, screen recording, or file-system access.
- **Out-of-scope**: this is a hardening layer, not a guarantee. A candidate with
  physical root access can bypass anything. The design targets the 95% case: catching
  accidental pen-drive/removable-media use and unattended hotplugs.

## Implementation plan (if approved)

1. **POC** (1–2 days): Tauri shell + `rusb` listing of devices + hardcoded classify.
2. **Handshake + WebSocket** (2–3 days): token endpoint, `ws` server in agent, exam-page client.
3. **Hotplug + UI** (1–2 days): live insert/remove badges in the proctor bar.
4. **Packaging**: per-OS installers (Windows .msi, macOS .dmg, Linux .AppImage) signed.
5. **Optional**: process/VM/cheat-tool watch as a follow-up.

Estimated total: **~1–2 weeks** for a single engineer familiar with Rust/Tauri.

## Related

- `docs/security/04-OWASP-Checklist.md` — A07 (Identification & Authentication Failures)
- `frontend/lib/proctoring/hardware-detector.ts` — the current best-effort browser audit
- `frontend/components/proctoring/DeviceAuditModal.tsx` — the pre-exam audit UI
- `frontend/app/api/proctor/events/route.ts` — server-side proctor event log
